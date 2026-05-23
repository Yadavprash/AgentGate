# AgentGate

**The airlock for autonomous AI agents.**

The second your AI agent tries to do something risky — spend money, send a
message, touch private data — AgentGate freezes it mid-execution, pings a human
on Discord with an interactive card, and resumes the agent the instant they tap
Approve. Sensitive data is stripped on the device before the cloud LLM ever
sees it. Every decision streams to a real-time audit log.

> *In July 2025, Replit's autonomous coding AI deleted a customer's production
> database. The CEO publicly apologized. **AgentGate is the one line of code that
> would have stopped that.***

---

## Three layers of trust, one line of code

```python
@gate(my_tool, risk="high", sensitive=True)
```

1. **PII never leaves the device.** Tools marked `sensitive=True` route through a
   local redactor (deterministic regex by default, optional Ollama backend for
   semantic redaction). Names, addresses, card numbers, OTP codes — stripped on
   your laptop before any cloud LLM call.
2. **Risky actions wait for a human.** Tools marked `risk="high"` freeze at the
   gateway. A rich card lands on Discord in ~2 seconds. One tap to Approve,
   Deny, or **Modify Budget** (reuses the modal infra to redirect the agent
   with a new constraint).
3. **Every action is auditable.** Auto-passed reads, intercepted writes,
   denials, redactions, threats blocked — all streamed live to a Postgres-backed
   Next.js dashboard with status chips, threat banners, and side-by-side
   privacy proof.

Architecture diagrams live in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Four demos in one repo

| Command | What it shows |
|---------|---------------|
| `python -m agent.run` | **Domain buying.** APPROVAL + INPUT (CAPTCHA) + Modify Budget + real Razorpay test charge. |
| `python -m agent.bank_run` | **Bank login.** INPUT × 2 (CAPTCHA + OTP) + `sensitive` × 2 (credentials + transactions). The *WhatClaudeSaw* dashboard panel proves PII never leaves the device. |
| `python -m agent.injection_run` | **Prompt-injection defense.** Agent reads an article with a hidden indirect-injection, gets hijacked, tries to POST to an attacker URL. AgentGate intercepts at the tool layer; the dashboard pulses red with `🚨 THREAT BLOCKED`. |
| `python -m agent.run --unsafe` | **The "before" shot.** Runs the same agent with AgentGate disabled — no audit log row, no Discord card, raw PII goes straight to Anthropic's API, real Razorpay charge happens silently. Use to set up the contrast on stage. |

Full presentation-day playbook in [`DEMO.md`](DEMO.md).

---

## Repository structure

```
AgentGate/
├── gateway/                 FastAPI gateway + discord.py bot (one process)
│   ├── main.py              app + lifespan (bot starts in here)
│   ├── routes.py            /gate/intercept, /gate/decision, /gate/complete,
│   │                        /gate/redaction, /healthz
│   ├── pause.py             in-process asyncio.Event registry — what freezes
│   │                        the held HTTP request
│   ├── db.py                Supabase actions-table writes
│   └── discord_bot/         bot + Discord cards (Approve / Deny / Modify
│                            Budget) + INPUT-mode modal (CAPTCHA / OTP)
│
├── agentgate_sdk/           one-line tool wrapper for any LangChain agent
│   ├── langchain.py         gate(func, risk=, mode=, sensitive=, ...)
│   ├── client.py            HTTP client (long read timeout for the held call)
│   └── redactor.py          local PII redactor — regex + optional Ollama
│
├── agent/                   four demo agents (see table above)
│
├── dashboard/               Next.js 14 + Tailwind, Supabase Realtime
│   ├── app/page.tsx         live audit log
│   ├── app/pitch/page.tsx   one-page pitch + live counters
│   └── components/          HeroStats, ThreatBlocked, WhatClaudeSaw,
│                            AuditTable, StatusChip
│
├── supabase/schema.sql      actions table + realtime publication + RLS
├── tests/                   32 automated tests
├── DEMO.md                  presentation runbook for all four scenarios
├── ARCHITECTURE.md          diagrams + sequence views
├── docker-compose.yml       one-command startup
└── Dockerfile
```

---

## Quick start

**Prerequisites:** Python 3.10+, Node 18+, accounts for Supabase, Discord, and
Anthropic. Optional: Razorpay test account, Ollama for semantic redaction.

```bash
# 1. Backend deps
pip install -r requirements.txt

# 2. Supabase setup
#   - create a project at supabase.com
#   - in the SQL editor, run supabase/schema.sql

# 3. Discord setup
#   - create an application at discord.com/developers/applications
#   - reset the bot token, invite the bot to a server with Send Messages perms,
#     enable Developer Mode and copy a channel ID

# 4. .env
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY,
#         DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID,
#         ANTHROPIC_API_KEY,
#         RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET   (optional)
#         LOCAL_LLM_URL                            (optional - Ollama)

# 5. Dashboard env
cd dashboard && cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY

# 6. Run everything (3 terminals)
uvicorn gateway.main:app --port 8000      # gateway + Discord bot
cd dashboard && npm install && npm run dev # dashboard at :3000
python -m agent.run                        # the demo agent
```

Or one-command with Docker:

```bash
docker compose up
```

---

## SDK in 30 seconds

```python
from agentgate_sdk import gate

def search_domain(idea: str) -> str:
    """Search available .com domains."""
    return run_real_search(idea)

def execute_purchase(domain: str, price: float) -> str:
    """Charge the user's card and register the domain."""
    return charge_and_register(domain, price)

def fetch_patient_record(patient_id: int) -> str:
    """Return raw EHR data."""
    return ehr_db.lookup(patient_id)

tools = [
    gate(search_domain, risk="low"),                          # auto-passes
    gate(execute_purchase, risk="high", mode="approval",      # human approves
         display=lambda kw: {"cost": kw["price"]}),
    gate(fetch_patient_record, risk="low", sensitive=True),   # PII redacted
]
```

That's it. The same `gate()` works with any framework that consumes LangChain
tools (CrewAI, OpenAI Agents SDK, your custom orchestrator).

### Policy belongs to security teams, not agent code

Drop a `risk-policies.yaml` at the repo root and the SDK treats *that* as the
source of truth — security teams own risk classification via PR review, and
developers just write `gate(my_tool)` and pick up the right policy
automatically:

```yaml
# risk-policies.yaml
defaults:
  risk: low
  sensitive: false
tools:
  execute_purchase:
    risk: high
    mode: approval
  read_transactions:
    risk: low
    sensitive: true     # routes through the local PII redactor
  post_to_url:
    risk: high
    mode: approval
```

Entries here override `risk=` / `mode=` / `sensitive=` passed to `gate()` in
agent code. Override the file path via `AGENTGATE_POLICY_FILE`. Tools not
listed fall through to whatever the developer's `gate()` call said.

---

## Tests

```bash
pip install -r requirements-dev.txt
pytest -v
```

**32 tests** covering the freeze/resume registry, every gateway route
(in-process via `httpx.ASGITransport`), the `gate()` wrapper paths
(approve, deny, INPUT, sensitive, Modify Budget), the local redactor's pattern
matrix, and one real-server integration test.

---

## Tech stack

- **Gateway**: FastAPI + Uvicorn, Python 3.10+
- **Discord**: discord.py 2.x (run inside the FastAPI process — same event loop)
- **State + audit**: Supabase (Postgres + Realtime)
- **Agent runtime**: LangChain + `langchain-anthropic`, Claude Sonnet 4.6
- **Payment**: Razorpay test mode (Stripe-equivalent, India-friendly)
- **PII redaction**: regex by default, Ollama (local LLM) optional
- **Dashboard**: Next.js 14 (App Router) + Tailwind v4
- **Deployment**: Docker Compose

---

## What this is not

- **Not a chatbot.** AgentGate doesn't help if your agent's failure mode is
  saying something embarrassing. It catches actions, not text outputs.
- **Not a substitute for cloud-side safety.** Defense in depth — the cloud LLM's
  safety training is one layer; AgentGate is the deterministic on-device layer.
- **Not zero-latency.** The Discord round-trip is ~2 s end-to-end. Real-time HFT
  agents need something local-only.
- **Not built for millions of users.** Per-action human approval doesn't scale
  to consumer apps with bulk traffic. The wedge is agentic AI in enterprise,
  regulated industries, and high-trust personal workflows.

---

## License

MIT.

---

Built during a 3-day hackathon by Prashant Yadav, Vinay Upadhyay, and Samiksha
Chhabra.
