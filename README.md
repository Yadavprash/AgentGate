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

## Setting up the repo

The fastest path is `docker compose up` — it skips every Python and Node version issue below. Use the manual setup if you want to debug, run tests, or step through agent code with VS Code.

### 0 — Prerequisites

| Tool | Version | Used by |
|---|---|---|
| **Python** | 3.10+ | gateway, SDK, agents, tests |
| **Node** | **20.9+** (Next 16 requires it; pinned in [`dashboard/.nvmrc`](dashboard/.nvmrc)) | dashboard |
| **Supabase project** | free tier is fine | actions table + realtime |
| **Discord application** | with a bot user + a guild + a channel | approval cards |
| **Anthropic API key** | with Claude 4.x access | agent's LLM |
| Razorpay test keys | optional | real test-mode charge in domain-buying demo |
| Ollama | optional | semantic PII redaction (fallback is a regex redactor) |

### 1 — Clone and create the Python venv

```bash
git clone <this-repo>
cd AgentGate
python -m venv .venv
```

Then **activate it** — every command in this guide assumes the venv is active.

```bash
# macOS / Linux
source .venv/bin/activate

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Windows cmd
.venv\Scripts\activate.bat
```

Your prompt should now show a `(.venv)` prefix. If PowerShell rejects `Activate.ps1`, run once: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.

### 2 — Install Python dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-dev.txt   # only if you'll run pytest
```

Sanity check the venv: `which python` (Linux/mac) or `(Get-Command python).Source` (PowerShell) must point inside `.venv/`. If not, the venv isn't activated — go back to step 1.

### 3 — Stand up the external services

**3a. Supabase**

1. Create a project at <https://supabase.com>.
2. In the SQL editor, paste and run the entire contents of [`supabase/schema.sql`](supabase/schema.sql). This creates the `actions` table, the `audit_events` table, the realtime publication, and the RLS policies.
3. From **Project Settings → API**, copy:
   - **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - **`anon` public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **`service_role` secret key** → `SUPABASE_SERVICE_KEY`

**3b. Discord**

1. Create an app at <https://discord.com/developers/applications> → **Bot** → reset token → `DISCORD_BOT_TOKEN`.
2. Under **OAuth2 → URL Generator**, scope `bot`, permissions `Send Messages`, `Embed Links`, `Read Message History`. Open the generated URL and invite the bot to a server.
3. In Discord, enable Developer Mode (User Settings → Advanced), right-click the channel you want approval cards in → **Copy Channel ID** → `DISCORD_CHANNEL_ID`.

**3c. Anthropic**

Get an API key at <https://console.anthropic.com> → `ANTHROPIC_API_KEY`.

### 4 — Configure environment files

Both files must point at the **same** Supabase project, or the dashboard will load but show nothing.

**Root `.env`** (consumed by the gateway):

```bash
cp .env.example .env
```

Then fill in `.env` with the values from step 3:

```env
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
DISCORD_BOT_TOKEN=<bot token>
DISCORD_CHANNEL_ID=<channel id>
ANTHROPIC_API_KEY=<key>
GATE_SHARED_SECRET=<any random string>
# Razorpay + LOCAL_LLM_URL are optional
```

**Dashboard `dashboard/.env.local`** (consumed by Next.js, **same values** as the two `NEXT_PUBLIC_*` keys above):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

> **Heads up:** Next.js reads `.env.local` only at startup. If you change it, restart `npm run dev`.

### 5 — Install dashboard dependencies

```bash
cd dashboard
npm install
cd ..
```

If `npm install` complains about Node version, you're on the wrong Node. See [Windows gotchas](#windows-gotchas) below.

### 6 — Smoke-test the install

With the venv active:

```bash
# 1. Boot the gateway in one terminal
uvicorn gateway.main:app --port 8000
```

In a second terminal:

```bash
# 2. Health check — must say "supabase": true, "discord": true
curl http://localhost:8000/healthz
```

If `supabase` or `discord` is `false`, the gateway can't see your keys — re-check `.env` and make sure the gateway terminal has the venv activated.

```bash
# 3. Run the test suite
pytest -v
```

All 32 tests should pass. If they don't, your `.venv` probably has stale deps — `pip install -r requirements.txt` again.

### 7 — Run the full stack

Three terminals, all with the venv activated where Python is needed:

```bash
# Terminal 1 — gateway + Discord bot
uvicorn gateway.main:app --port 8000

# Terminal 2 — dashboard at http://localhost:3000
cd dashboard && npm run dev

# Terminal 3 — pick one of the four demos
python -m agent.run                # domain buying  (approval + INPUT + Modify Budget)
python -m agent.bank_run           # bank login     (PII redaction proof)
python -m agent.injection_run      # prompt injection defense
python -m agent.run --unsafe       # contrast: agent with AgentGate disabled
```

Open <http://localhost:3000>. The status chip should switch from "Connecting…" to **Live**. As the agent runs, rows stream in.

### Docker shortcut

If you have Docker, the entire setup collapses to:

```bash
docker compose up
```

You still need `.env` and `dashboard/.env.local` filled in (step 4), and you still need to run the Supabase schema (step 3a) and Discord setup (step 3b). Docker just handles the Python/Node side.

<a id="windows-gotchas"></a>
### Windows gotchas worth knowing

These all bit us during real onboarding — none are obvious from error messages.

- **Node keeps reverting to an old version (e.g., 18.x).** Volta and nvm-windows both install a `node` shim. Volta's shim is first on PATH, so `nvm use 20.9.0` silently does nothing — Volta resolves `node` to its own pinned default. Fix: either `volta pin node@20.9.0` inside the repo (writes the pin into `package.json`, survives Git, auto-installs on first use) or remove `C:\Program Files\Volta\` from PATH.
- **Gateway returns 500 on every request, but `/healthz` is fine.** Almost always the wrong Python interpreter — `uvicorn` was launched against system Python (which has stale Supabase deps) instead of the project `.venv`. Pin VS Code to the venv: create `.vscode/settings.json` with `"python.defaultInterpreterPath": "${workspaceFolder}/.venv/Scripts/python.exe"`, **Developer: Reload Window**, then re-launch.
- **PowerShell blocks `Activate.ps1`.** Once: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`.
- **Dashboard shows "Connecting…" forever, no rows.** `dashboard/.env.local` and `.env` are pointing at different Supabase projects. Sync the two `NEXT_PUBLIC_*` values, restart `npm run dev` — Next reads `.env.local` only at boot.
- **Port 8000 stuck even after killing uvicorn.** Uvicorn with `--reload` spawns a worker child; killing the parent leaves the child holding the port. `Get-Process python` to find the orphan, `Stop-Process -Id <pid> -Force`.

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
- **Dashboard**: Next.js 16 (App Router) + Tailwind v4
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
