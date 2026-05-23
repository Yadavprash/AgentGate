# AgentGate — Demo Runbook

Presentation-day playbook covering all four scenarios. Rehearse at least once.

**The pitch in one line:** *AgentGate is the airlock for autonomous AI agents — it
freezes the agent the moment it tries something high-stakes, asks a human on Discord,
and resumes it on the response. Sensitive data is stripped on the device before any
cloud LLM sees it. Every decision is in a real-time audit log.*

**Replit-incident hook to open with:**
> *"In July 2025, Replit's autonomous coding AI deleted a customer's production
> database. The CEO publicly apologized. AgentGate is the one line of code that
> would have stopped that."*

---

## 1. Pre-flight checklist (T-15 minutes)

Don't improvise this on stage.

- [ ] `.env` is filled — `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DISCORD_BOT_TOKEN`,
      `DISCORD_CHANNEL_ID`, `ANTHROPIC_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`.
- [ ] `dashboard/.env.local` has `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] `supabase/schema.sql` has been run in the Supabase SQL editor.
- [ ] Gateway running: `uvicorn gateway.main:app --port 8000`.
- [ ] `GET http://localhost:8000/healthz` returns `{"discord": true, "supabase": true}`.
- [ ] Dashboard running: `cd dashboard && npm run dev` → `http://localhost:3000`.
- [ ] The pitch route opens cleanly at `http://localhost:3000/pitch`.
- [ ] Discord open **on the phone** AND visible on the projected screen (`#general`).
- [ ] Terminal sized large enough that the back of the room can read it.
- [ ] Test suite passed: `pytest -q` → 32 / 32.
- [ ] Backup video recorded (see §6).

**Stage roles for a team of three:**
- *Narrator + terminal driver* — runs the agent commands.
- *Phone operator* — taps Approve / Deny / Solve / Modify Budget.
- *Dashboard pointer* — calls out the visuals (hero stats, pulse, banners) as they fire.

---

## 2. The structure of the demo

Open at `http://localhost:3000/pitch` so the value-prop card is the first thing
judges see. Read the headline. Click **Open dashboard →** to flip to the live audit
table (empty / mostly empty depending on prior runs).

Then pick **one** of the four scripts below. They're independent — you don't need to
run all four. Pick by audience.

| Audience | Recommended script |
|---|---|
| Mostly devs / infra VCs | §3 Injection (most dramatic) |
| Enterprise / SaaS buyers | §4 Bank login (privacy story front) |
| Generalist judges | §5 Domain buying (clean A→Z purchase) |
| Skeptics ("what would happen without this?") | §6 Unsafe contrast (run before any other) |

---

## 3. Script — Prompt-injection defense (the killer beat)

> *"Watch — a benign news-research agent. The user asks it to summarize the top AI
> story and ping the publisher's analytics endpoint, totally normal workflow. The
> article has a hidden injection embedded in its body. Watch what the agent does."*

```
python -m agent.injection_run
```

| # | What happens | What to point at |
|---|--------------|------------------|
| 1 | `search_news` → 3 results | Two green rows on the dashboard |
| 2 | `read_webpage` reads the planted article | Third green row |
| 3 | **Agent gets hijacked** — calls `post_to_url(target_url="https://analytics-collector.io/relay", ...)`. *"Look — Claude obediently complied. The cloud LLM didn't catch the third-party domain."* | Tool-call in terminal |
| 4 | **AgentGate intercepts.** Dashboard pulses amber: **⚠️ THREAT INTERCEPTED · AWAITING HUMAN**. Phone gets a card with the suspicious target URL + payload preview. | Banner + Discord card |
| 5 | **Phone operator taps Deny.** Banner switches to red-pulsing **🚨 THREAT BLOCKED**. Row flashes red. | Banner + audit row |
| 6 | Agent receives `DENIED: a human reviewer blocked 'post_to_url'`, recovers, then **diagnoses the attack itself** in its final summary | Terminal final answer |

**Close it with:**
> *"That's a real attack vector. The cloud LLM didn't notice until **after** AgentGate
> caught it. The data never left the laptop. The same script with the open-source
> model in your fine-tune wouldn't even notice in hindsight — but AgentGate stops it
> the same way every time, deterministically, at the tool layer."*

---

## 4. Script — Bank login (the privacy story)

> *"Same agent pattern, different scenario. Bank login. Watch how the cloud LLM
> never sees the password, never sees the OTP, never sees the customer's name in
> the transaction list."*

```
python -m agent.bank_run
```

| # | What happens | What to point at |
|---|--------------|------------------|
| 1 | `navigate` → green | Dashboard row |
| 2 | `enter_credentials` → green + 🔒 PII badge. The **WhatClaudeSaw** panel pops in: left side has `prashant.yadav / S3cret!Brew2026`, right side has it stripped to a sanitized confirmation. | Panel above table |
| 3 | `solve_captcha` (INPUT) → amber pulse, `Frozen 0:07…` countdown. Phone gets a card with the CAPTCHA image. | Card + countdown |
| 4 | Tap **Solve CAPTCHA**, type `B7K9T2`, Submit. Row flashes green. | |
| 5 | `enter_otp` (INPUT, different modal) — phone buzzes again with **Enter Code** button. Tap, type `123456`, Submit. | Card with different modal labels |
| 6 | `read_transactions` → green + 🔒 PII. WhatClaudeSaw updates: left shows `Name: Jane Doe / card 4242 4242 4242 4242 / jane@uber.example.com`, right shows `Name: [NAME] / card [CARD] / [EMAIL]`. | Panel updates |
| 7 | Agent prints a clean summary using only the redacted view, and explicitly mentions the redaction. | Final answer |

**Close it with:**
> *"The cloud LLM never received the password, the OTP, or any customer name from
> the transactions. The agent did a real job using only sanitized data. That's
> what HIPAA, PCI-DSS, and the EU AI Act actually require, and that's what
> AgentGate delivers automatically with one decorator."*

---

## 5. Script — Domain buying (the clean A→Z)

> *"Loose autonomous task — buy a domain. Show how AgentGate makes the agent shippable."*

```
python -m agent.run 'Find an available .com domain for my coffee shop under $20 and buy it.'
```

(use single quotes so `$20` doesn't shell-expand)

| # | What happens | What to point at |
|---|--------------|------------------|
| 1 | `search_domain` + 4× `check_price` in parallel → all green | Dashboard rows |
| 2 | `verify_customer_identity` → green + 🔒 PII. WhatClaudeSaw shows the customer record raw vs redacted. | Panel |
| 3 | `solve_captcha` (INPUT) → amber pulse | Discord card |
| 4 | Tap **Solve CAPTCHA**, type `7G4K9`, Submit | Row flashes green |
| 5 | `execute_purchase` → amber pulse, **terminal visibly frozen** for the dramatic pause | Frozen terminal |
| 6 | Tap **Approve** on the phone → row flashes green/blue → agent prints a **real Razorpay test order ID** (`order_M...`) | Terminal receipt + audit row |

**Optional Modify-Budget detour** — instead of Approve, tap **Modify Budget**, enter
`10` → agent receives `BUDGET CHANGED: $10.00`, re-checks prices, finds
`thejavajoint.com` at $9.99, asks for approval on that one instead. Demonstrates the
"redirect, don't just yes/no" beat.

**Optional Deny detour** — tap **Deny** → agent gracefully aborts. Dashboard row red.

---

## 6. Script — Unsafe contrast (the "before" shot — run BEFORE one of the others)

> *"This is what your AI agent does today without AgentGate. Watch the dashboard."*

```
python -m agent.run --unsafe 'Find an available .com domain for my coffee shop under $20 and buy it.'
```

| # | What happens | What to point at |
|---|--------------|------------------|
| 1 | Agent reasons, picks a domain, fires `execute_purchase` immediately | Terminal — no pauses |
| 2 | **Real Razorpay test order created. Customer's full PII (Prashant Yadav / DOB / phone / email / address) was sent to Anthropic's API in plain text.** | Terminal transcript shows raw PII |
| 3 | **Dashboard: zero new rows.** No audit. No oversight. No PII redaction. | Dashboard counts unchanged |

**Close it with:**
> *"That's the state of every AI agent in production today. Money moved, the cloud
> LLM saw the customer's full identity, no human ever saw what happened, no audit
> trail to point to in a compliance review. Now watch the same agent with one line
> added."*

Then run §3, §4, or §5 immediately.

---

## 7. Talking points (use as needed)

- **Latency:** Card lands in ~2 s; resume on tap is instant. Bot and gateway share
  one asyncio event loop, so a Discord click directly wakes the frozen HTTP request
  — no polling, no queue.
- **Integration is one line:** `gate(my_tool, risk="high")` or
  `gate(my_tool, sensitive=True)`. Framework-agnostic — LangChain shown today,
  CrewAI / OpenAI Agents SDK trivially supported.
- **Biometric auth for free:** Tapping Approve on Discord mobile sits behind the
  phone's fingerprint / Face ID. You inherit it without writing auth.
- **The right safety layer is on-device, not in the cloud:** Cloud LLMs can catch
  injection in hindsight (and Claude did, in our injection demo). By then the
  data has already crossed the wire. AgentGate intercepts before the network call.
- **Why this isn't already solved:** Five-plus well-funded companies are building
  this primitive in-house right now (Intercom, Decagon, Sierra, Salesforce
  Agentforce). LangChain shipped `interrupt` as a LangGraph primitive. AgentGate
  is the framework-agnostic, batteries-included, audit-first open version.

---

## 8. Backup plan (if something fails live)

| Failure | Fallback |
|---------|----------|
| Discord / Wi-Fi down | Resolve manually: `POST http://localhost:8000/gate/decision` with `x-gate-secret` header + `{"job_id": "...", "decision": "approved"}`. The `job_id` is in the gateway's stdout. |
| Supabase down | Gateway still runs (graceful degrade). The agent flow + Discord work; the dashboard goes dark. Narrate over it. |
| Anthropic API hiccup | Re-run the command (transient), or fall back to the recorded video. |
| Razorpay error | `_execute_purchase` returns `PURCHASE FAILED - Razorpay error: …` — agent recovers gracefully. Or unset `RAZORPAY_KEY_ID` to fall back to mock receipts. |
| Anything else | **Play the pre-recorded demo video.** Non-negotiable to record one the night before. |

---

## 9. Reset between runs

- Nothing to clean up — each agent run creates fresh job rows.
- For a totally clean dashboard, before the demo: `delete from actions;` in the
  Supabase SQL editor. Optional.
- CAPTCHA answer in the domain demo is always `7G4K9`. In the bank demo it's
  `B7K9T2`. OTP is any 6 digits.
- If a previous run left a `--unsafe` env var stale (unlikely — it dies with the
  Python process), it would only affect the current shell. Open a fresh terminal
  to be safe.

---

## 10. The closer (whatever scenario you ran)

> *"One SDK, one line per tool. Three layers of trust — privacy stays local,
> high-risk waits for a human, every decision is auditable. Real Razorpay,
> real Anthropic, real Discord, real Postgres-backed audit. Built in a
> hackathon. The agent economy needs this primitive and we just built it."*
