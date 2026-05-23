# AgentGate — Demo Runbook

The presentation-day playbook. Rehearse it end to end at least once before judging.

**The pitch in one line:** AgentGate is an airlock for AI agents — it freezes an
autonomous agent the moment it tries something high-stakes, asks a human on Discord,
and resumes it on approval.

---

## 1. Pre-flight checklist (T-15 minutes)

Do this before you present. Don't improvise it on stage.

- [ ] `.env` is filled in with real Supabase, Discord, and Anthropic values.
- [ ] `dashboard/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] `supabase/schema.sql` has been run in the Supabase SQL editor (the `actions` table exists).
- [ ] Gateway is running: `uvicorn gateway.main:app --port 8000`
- [ ] `GET http://localhost:8000/healthz` returns `{"discord": true, "supabase": true}`.
- [ ] Dashboard is running: `cd dashboard && npm run dev` → open `http://localhost:3000`,
      the status pill reads **Live**.
- [ ] Discord is open **on your phone** (for tapping) **and** visible on the projected
      screen (so the audience sees the card arrive).
- [ ] A terminal is open and ready in the repo root for the agent command.
- [ ] Run the test suite once for confidence: `pytest -v` → 21 passed.

**Roles during the demo:** one person narrates + runs the terminal, one person holds the
phone and taps the Discord buttons, one person points at the dashboard.

---

## 2. The script (≈3 minutes)

### Beat 1 — Set the scene (20s)
> "Autonomous AI agents can now browse, use APIs, and spend money. That's the problem.
> Give an agent your credit card and one hallucination drains it. AgentGate is the
> safety airlock. Here's the dashboard — empty right now. Watch it."

Show the dashboard with no rows.

### Beat 2 — Launch the agent (30s)
Run in the terminal:
```
python -m agent.run "Find an available .com domain for my coffee shop startup under $20 and buy it."
```
> "The agent is now planning autonomously. It searches for domains, checks a price —
> these are low-risk reads, so AgentGate lets them straight through."

Two **green** rows (`search_domain`, `check_price`) appear on the dashboard.

### Beat 3 — CAPTCHA interception — INPUT mode (40s)
The agent hits the registrar's CAPTCHA and calls `solve_captcha`. A Discord card with a
CAPTCHA image appears.
> "The agent just hit a wall a bot can't pass — a CAPTCHA. Instead of failing, AgentGate
> pauses it and asks a human."

Tap **Solve CAPTCHA** on the phone, type the characters in the image (`7G4K9`), submit.
> "The human became the tool. That answer goes straight back to the agent, and it
> continues."

Dashboard row goes amber → green.

### Beat 4 — Purchase interception — APPROVAL mode (50s)
The agent calls `execute_purchase`. A Discord card appears: agent, action, **$14.99**,
Approve / Deny.
> "Now the big one — real money. Look at the terminal."

**Point at the terminal — it is frozen.** Let that silence land for a second.
> "The agent's execution thread is genuinely paused, held mid-request. No money has
> moved. It will wait like this until a human decides — and tapping Approve here sits
> behind my phone's fingerprint unlock, so we get biometric authorization for free."

Tap **Approve** on the phone. The terminal immediately resumes and prints the receipt.
The dashboard row goes amber → green/blue (Completed).

### Beat 5 — The Deny path (30s)
Re-run the same command. When the purchase card appears, tap **Deny**.
> "Same flow, human says no. The agent doesn't crash — it receives the denial, reasons
> about it, and reports back that the action was blocked."

The dashboard row goes **red** (Denied).

### Close (10s)
> "One generic gateway, two interception modes — approve/deny and human-as-input — and a
> complete real-time audit log of every action an agent took, passed or blocked. That's
> AgentGate."

---

## 3. Talking points (use as needed)

- **Latency:** the Discord card arrives in ~2 seconds; resume on tap is effectively instant
  (the bot and the gateway share one process, so a button click directly wakes the frozen
  request — no polling, no inter-service hop).
- **Generic, not payment-specific:** the same airlock handles payments, CAPTCHAs, emails,
  file deletes — any tool a developer marks high-risk.
- **Tiny integration:** an agent developer wraps a tool in one call —
  `gate(my_tool, risk="high")` — and it's protected.
- **Audit:** every action (auto-passed or intercepted) is a row in Postgres, streamed live.

---

## 4. Backup plan (if something fails live)

| Failure | Fallback |
|---------|----------|
| Discord / Wi-Fi down | Resolve the job manually: `POST http://localhost:8000/gate/decision` with header `x-gate-secret` and body `{"job_id": "...", "decision": "approved"}`. The `job_id` is printed in the gateway console. |
| Supabase down | The gateway **still runs** — it graceful-degrades. The agent flow and Discord cards work; only the live dashboard goes dark. Narrate over it. |
| Anthropic API error | Re-run the command (transient), or fall back to the pre-recorded video. |
| Anything else | Play the **pre-recorded demo video**. Record one the night before — non-negotiable. |

---

## 5. Notes

- **Nothing to reset between runs** — each agent run creates fresh job rows. Just re-run
  the command for the Deny take.
- The CAPTCHA answer is always **`7G4K9`** (the image is generated with fixed text).
- If the gateway was restarted, refresh the dashboard so the Realtime channel reconnects.
- Keep the terminal font large enough for the back row to see it freeze.
