# AgentGate

A low-latency Human-in-the-Loop (HITL) middleware — an **airlock for autonomous AI agents**.

AgentGate intercepts high-risk tool calls, freezes the agent's execution, pings a human on
Discord with an interactive card, and resumes the agent the instant the human responds.

## Two interception modes

- **APPROVAL** — yes/no decision via `Approve` / `Deny` buttons (e.g. `execute_purchase`).
- **INPUT** — the human *is* the tool; a Discord modal collects data fed back to the agent
  (e.g. `solve_captcha`).

## Components

| Path | What it is |
|------|------------|
| `gateway/` | FastAPI gateway + discord.py bot (one process, one event loop) |
| `agentgate_sdk/` | The plug-in agents import — wraps LangChain tools |
| `agent/` | Demo LangChain agent (Claude) that buys a domain |
| `dashboard/` | Next.js live audit-log dashboard (Supabase Realtime) |
| `supabase/schema.sql` | Postgres `actions` table = state machine + audit log |

## Setup

1. `pip install -r requirements.txt`
2. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
3. Create a Discord bot, invite it to a server, copy the token + a channel ID.
4. Copy `.env.example` to `.env` and fill in the values.
5. Start the gateway: `uvicorn gateway.main:app --port 8000`
6. Start the dashboard: `cd dashboard && npm install && npm run dev`
7. Run the agent: `python -m agent.run "buy a .com domain for my coffee shop under $20"`

## Demo

The agent searches domains, checks prices (auto-passed), hits a CAPTCHA (INPUT
interception → solve it on Discord), then calls `execute_purchase` (APPROVAL
interception → Approve/Deny on Discord). Every action streams live to the dashboard.
