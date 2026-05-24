# Bastion Gate

**The airlock for autonomous AI agents.**

The moment your AI agent tries to do something risky — spend money, send an email, touch private data — Bastion Gate freezes it mid-execution, notifies a human on Discord, and resumes the agent the instant they approve. Sensitive data is stripped on-device before the cloud LLM ever sees it. Every decision is written to a tamper-evident audit chain.

```python
from bastion_sdk import gate

purchase = gate(execute_purchase, risk="high")      # human approves before it runs
record   = gate(fetch_patient_record, sensitive=True)  # PII redacted locally
search   = gate(search_web, risk="low")             # auto-approved, still audited
```

---

## Table of contents

- [How it works](#how-it-works)
- [Install](#install)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Policy file](#policy-file)
- [Dashboard](#dashboard)
- [Docker deployment](#docker-deployment)
- [Architecture](#architecture)
- [License](#license)

---

## How it works

Three layers, one decorator:

1. **PII never leaves the device.** Tools marked `sensitive=True` route through a local redactor (regex by default, optional Ollama backend for semantic redaction). Names, addresses, card numbers, OTP codes — stripped on your machine before any cloud API call.

2. **Risky actions wait for a human.** Tools marked `risk="high"` are held at the gateway. A card lands on Discord in ~2 seconds with Approve / Deny buttons. The agent is frozen until a human decides.

3. **Every action is auditable.** Auto-approved reads, intercepted writes, denials, redactions, threats blocked — all written to a SHA-256 hash chain in Supabase and streamed live to the dashboard.

---

## Install

```bash
pip install bastion-gate
```

The gateway and dashboard require additional setup — see [Docker deployment](#docker-deployment) for the fastest path.

---

## Quick start

### 1. Start the gateway

```bash
# with Docker (recommended)
docker compose up

# or manually
pip install "bastion-gate[gateway]"
uvicorn gateway.main:app --port 8000
```

### 2. Set your API key

```bash
export BASTION_API_KEY=your-api-key
export BASTION_GATEWAY_URL=http://localhost:8000   # default
```

### 3. Wrap your tools

```python
from bastion_sdk import gate

def execute_payment(amount: float, to: str) -> str:
    """Transfer funds."""
    ...

def fetch_patient_record(patient_id: int) -> str:
    """Return raw EHR data including name, DOB, diagnoses."""
    ...

def search_web(query: str) -> str:
    """Search the web."""
    ...

# high-risk: freezes until a human approves on Discord
payment = gate(execute_payment, risk="high", mode="approval",
               display=lambda kw: {"amount": kw["amount"], "to": kw["to"]})

# sensitive: PII stripped locally before the LLM sees the output
records = gate(fetch_patient_record, sensitive=True)

# low-risk: auto-approved but still logged
search  = gate(search_web, risk="low")

# Pass to any LangChain-compatible agent
tools = [payment, records, search]
```

`gate()` returns a `StructuredTool` — drop it into LangChain, CrewAI, the OpenAI Agents SDK, or any framework that consumes LangChain tools.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `BASTION_API_KEY` | — | API key (required). Generate with `bastion keygen`. |
| `BASTION_GATEWAY_URL` | `http://localhost:8000` | Gateway endpoint. |
| `BASTION_AGENT_ID` | `default-agent` | Identifies this agent in the audit log. |
| `BASTION_AGENT_VERSION` | — | Optional version tag shown in the dashboard. |
| `BASTION_FALLBACK_ON_DOWN` | `deny` | What to do if the gateway is unreachable: `deny`, `allow`, or `raise`. |
| `BASTION_GATEWAY_TIMEOUT` | `5` | Connection timeout in seconds. |
| `BASTION_GATEWAY_RETRIES` | `3` | Retry attempts on transient failures. |
| `BASTION_REDACTOR` | `regex` | PII redaction backend: `regex`, `ollama`, or `custom`. |
| `OLLAMA_ENDPOINT` | — | Required when `BASTION_REDACTOR=ollama`. |
| `OLLAMA_MODEL` | `llama3.2` | Model used for semantic redaction. |
| `BASTION_DISABLED` | `0` | Set to `1` to disable all gating (e.g. in tests). |
| `BASTION_POLICY_FILE` | — | Explicit path to `bastion-policy.yaml`. Overrides auto-discovery. |

---

## Policy file

Security teams own risk classification — agent developers just call `gate(my_tool)`.

Drop a `bastion-policy.yaml` at the project root. The SDK discovers it automatically (walks up from CWD) or reads `BASTION_POLICY_FILE`. Policy entries override whatever `risk=`, `mode=`, or `sensitive=` the developer passed to `gate()`.

```yaml
# bastion-policy.yaml
version: 1

defaults:
  risk: low
  sensitive: false
  mode: approval

notifications:
  channel: slack
  webhook_url: https://hooks.slack.com/...

tools:
  execute_payment:
    risk: high
    mode: approval

  fetch_patient_record:
    sensitive: true        # PII redacted locally

  delete_record:
    risk: high
    sensitive: true

  search_web:
    risk: low
    mode: monitor
```

Validate with the CLI:

```bash
bastion validate-policy
```

---

## Dashboard

A real-time Next.js dashboard streams every gate event from Supabase.

![Dashboard showing live action feed, threat banner, and decision trail](https://raw.githubusercontent.com/Yadavprash/AgentGate/main/docs/dashboard-preview.png)

**Pages:**
| Page | What it shows |
|---|---|
| **Dashboard** | Live action feed, hero stats, threat banners, decision trail, actor breakdown |
| **Policies** | Edit and save `bastion-policy.yaml` directly from the browser |
| **Audit** | Export compliance reports — CSV, JSON, or text — filtered by date range |
| **Settings** | API keys, notification channels, PII redaction backend, team access, gateway config |

### Run the dashboard

```bash
cd dashboard
cp .env.local.example .env.local   # fill in Supabase keys
npm install
npm run dev
# → http://localhost:3000
```

Required in `dashboard/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

---

## Docker deployment

### For users — no source code needed

Create a `.env` file (see `.env.example`) and a `dashboard/.env.local`, then:

```bash
docker compose up
```

This pulls the published `bastion-gateway` image from Docker Hub and starts both the gateway (port 8000) and the dashboard (port 3000).

### For contributors — build from source

```bash
docker compose -f docker-compose.dev.yml up
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Your AI Agent                     │
│                                                     │
│   tools = [gate(buy), gate(search), gate(fetch)]   │
└────────────────────────┬────────────────────────────┘
                         │  gate() intercepts tool call
                         ▼
┌─────────────────────────────────────────────────────┐
│              bastion_sdk  (on your machine)         │
│                                                     │
│  sensitive=True → local PII redactor strips first   │
│  risk="high"    → POST /gate/intercept (held open)  │
│  risk="low"     → POST /gate/intercept (instant)    │
└────────────────────────┬────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              Gateway  (FastAPI + Discord bot)        │
│                                                     │
│  low-risk  → auto-approve → write audit event       │
│  high-risk → freeze → Discord card → wait for human │
│              Approve / Deny / Modify Budget         │
│                                                     │
│  All events → Supabase (hash chain) → Dashboard     │
└─────────────────────────────────────────────────────┘
```

Full sequence diagrams in [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## Repository structure

```
AgentGate/
├── bastion_sdk/             Python SDK — pip install bastion-gate
│   ├── gate.py              gate() decorator
│   ├── client.py            HTTP client (long read timeout for held calls)
│   ├── policy.py            bastion-policy.yaml loader
│   ├── config.py            env-var configuration
│   ├── exceptions.py        ApprovalTimeoutError, DeniedError, etc.
│   └── redactor/            local PII redaction (regex + Ollama)
│
├── gateway/                 FastAPI gateway + Discord bot (self-hostable)
│   ├── main.py              app entry point
│   ├── routes.py            /gate/intercept, /gate/decision, /gate/complete
│   ├── pause.py             asyncio.Event registry — what freezes the request
│   ├── db.py                Supabase writes
│   ├── audit_log.py         SHA-256 hash chain
│   └── discord_bot/         Approve / Deny / Modify Budget cards
│
├── dashboard/               Next.js 16 + Tailwind v4
│   ├── app/page.tsx         live dashboard
│   ├── app/policies/        policy editor
│   ├── app/audit/           compliance exports
│   └── app/settings/        API keys, team, gateway config
│
├── .github/workflows/
│   └── release.yml          auto-publish to PyPI + Docker Hub on git tag
│
├── Dockerfile
├── docker-compose.yml       production (pulls Docker Hub image)
├── docker-compose.dev.yml   development (builds from source)
├── pyproject.toml
└── bastion-policy.yaml      default policy (edit via dashboard or directly)
```

---

## Publishing a new release

```bash
# 1. Bump version in both files
#    pyproject.toml              version = "1.0.1"
#    bastion_sdk/__init__.py     __version__ = "1.0.1"

# 2. Commit, tag, push
git add pyproject.toml bastion_sdk/__init__.py
git commit -m "release: v1.0.1"
git tag v1.0.1
git push && git push --tags
```

GitHub Actions automatically publishes to PyPI and Docker Hub. Requires three secrets in **repo → Settings → Secrets → Actions**:

| Secret | Where to get it |
|---|---|
| `PYPI_TOKEN` | pypi.org → Account Settings → API tokens |
| `DOCKERHUB_USERNAME` | your Docker Hub username |
| `DOCKERHUB_TOKEN` | hub.docker.com → Account Settings → Security |

---

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Prashant Yadav](https://github.com/Yadavprash), Vinay Upadhyay, and Samiksha Chhabra.
