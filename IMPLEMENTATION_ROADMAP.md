# Bastion SDK — Full Implementation Roadmap
> Use this document as a prompt for implementing each feature. Work through tiers in order. Each section contains context, expected behaviour, and implementation notes.

---

## Current State (Baseline)

- FastAPI gateway with freeze/resume state machine for high-risk actions
- SHA-256 chained audit log (each row hashes event_data + prev_hash)
- Supabase Realtime for live dashboard updates
- Next.js dashboard with chain integrity badge, action drawer, actor breakdown
- Discord notifications for human-in-the-loop approval
- Regex-based local PII redactor
- LangChain agent integration via `@gate()` decorator
- SSE streaming for agent subprocess stdout to browser
- Auto-deny stale intercepted actions after configurable timeout (default 10 min)
- Background sweep on Gateway startup for orphaned frozen actions

---

## Tier 1 — Must Have (project is not usable without these)

---

### T1-1. Proper pip-installable Package

**Goal:** Anyone can run `pip install bastion-sdk` from PyPI and get a working SDK.

**What to implement:**
- Create `pyproject.toml` at the repo root (or in a separate `sdk/` directory) with package metadata: name, version, description, authors, dependencies, Python version requirement
- Restructure the SDK source so it lives under `bastion_sdk/` with a clean public API exported from `__init__.py`
- Public exports from `__init__.py`: `gate`, `async_gate`, `BastionClient`, `RedactorBackend`
- Add `MANIFEST.in` to include non-Python files (e.g. default policy template)
- Add a `README.md` inside the package with quickstart
- Publish to TestPyPI first, then PyPI
- Tag releases with semver (v1.0.0, v1.1.0, etc.)

**File structure:**
```
bastion-sdk/
  pyproject.toml
  README.md
  bastion_sdk/
    __init__.py         ← exports gate(), async_gate()
    gate.py             ← decorator logic
    client.py           ← HTTP calls to Gateway
    redactor/
      __init__.py
      base.py           ← abstract RedactorBackend class
      regex_backend.py  ← default
      ollama_backend.py ← optional
    config.py           ← reads env vars and bastion-policy.yaml
    exceptions.py       ← BastionError, GatewayDownError, DeniedError
```

**Expected behaviour:**
```python
from bastion_sdk import gate

gated_tool = gate(my_tool, risk="high", sensitive=True)
result = gated_tool(arg1, arg2)
```

---

### T1-2. SDK Authentication (API Keys)

**Goal:** Each customer's SDK instance is authenticated. Unknown callers are rejected by the Gateway.

**What to implement:**
- When a customer registers (or self-hosts), they generate an API key: `sk-live-xxxxxxxxxxxxxxxx`
- The SDK reads `BASTION_API_KEY` from env and sends it as `Authorization: Bearer <key>` on every request to the Gateway
- The Gateway validates the key on every incoming request via a FastAPI dependency
- If the key is missing or invalid, Gateway returns `401 Unauthorized` and the action is denied
- Keys are stored hashed in the database (never plaintext)
- Support key rotation: a customer can generate a new key; old key stays valid for 24 hours during transition

**Gateway changes:**
- Add `api_keys` table to Supabase: `(id, key_hash, agent_id, created_at, revoked_at)`
- Add `verify_api_key(key)` dependency injected into all protected routes
- Log authentication failures to the audit chain as `event_type=auth_failure`

**SDK changes:**
- `client.py` reads `BASTION_API_KEY` and attaches it to every request header
- If `BASTION_API_KEY` is not set, raise a clear `BastionConfigError` at import time with a helpful message

---

### T1-3. Risk Policy File (YAML)

**Goal:** Security and compliance teams own risk classification via a config file — not scattered across agent code. Developers just write `gate(my_tool)` and the policy is applied automatically.

**What to implement:**
- SDK looks for `bastion-policy.yaml` in the current working directory (and walks up to repo root)
- `gate(my_tool)` with no `risk=` argument reads the tool's name from `bastion-policy.yaml`
- Explicit args on `gate()` override the policy file
- Add a `bastion validate-policy` CLI command that checks the YAML for syntax errors and unknown tool names

**Policy file format:**
```yaml
# bastion-policy.yaml
version: 1

defaults:
  risk: low
  sensitive: false
  mode: approval        # approval | monitor | shadow

notifications:
  channel: slack        # discord | slack | pagerduty | email | webhook
  webhook_url: https://hooks.slack.com/xxx

tools:
  execute_payment:
    risk: high
    sensitive: false
    mode: approval
  fetch_patient_record:
    risk: low
    sensitive: true
  delete_record:
    risk: high
    sensitive: true
  search_web:
    risk: low
    sensitive: false
```

**SDK changes:**
- `config.py` loads and validates the YAML at SDK init time
- `gate()` merges explicit args with policy file values (explicit wins)
- If tool name not in policy file, use `defaults` block

---

### T1-4. Notification Channels (Slack, PagerDuty, Email, Webhook)

**Goal:** Discord is a demo channel. Real companies use Slack, PagerDuty, email, or custom webhooks for incident response. Companies configure their preferred channel in the policy file.

**What to implement:**

**Slack:**
- Send a rich Block Kit message with tool name, agent ID, risk level, arguments, Approve / Deny buttons
- Use Slack's interactive components API so the button click posts back to the Gateway
- Gateway exposes `POST /notify/slack/callback` to receive button clicks

**PagerDuty:**
- Create a PagerDuty incident for every high-risk intercepted action
- Resolve the incident automatically when the action is approved or denied
- Use PagerDuty Events API v2

**Email:**
- Send an HTML email with action details and an approve/deny link
- Links contain a signed JWT token so no login is needed to approve
- Token expires after the approval timeout

**Custom Webhook:**
- POST a JSON payload to any URL the customer configures
- Payload includes: `action_id`, `tool`, `args`, `risk`, `agent_id`, `approve_url`, `deny_url`
- The customer's own system handles the notification and calls back

**Gateway changes:**
- Create a `notifiers/` module with a base `Notifier` class and one subclass per channel
- `notifier_factory(config)` returns the right notifier based on policy YAML
- All notifiers implement `async send(action) -> None` and `async on_response(action_id, decision) -> None`

---

### T1-5. Pluggable PII Redaction Backend (Regex + Ollama + Custom)

**Goal:** Regex catches obvious PII (emails, phone numbers, card numbers). It misses contextual PII. Companies with strict compliance (HIPAA, GDPR) need a local LLM to understand context. The backend is configurable — no code change needed to switch.

**What to implement:**

**Abstract base class:**
```python
class RedactorBackend:
    def redact(self, text: str) -> tuple[str, list[str]]:
        # Returns: (redacted_text, list_of_redacted_field_types)
        raise NotImplementedError
```

**Regex backend (default):**
- Catches: EMAIL, PHONE, CARD, SSN, IP_ADDRESS, URL, DATE_OF_BIRTH
- Fast, no dependencies, works offline
- Used when `BASTION_REDACTOR=regex` or not set

**Ollama backend:**
- Sends tool output to a local Ollama instance with a system prompt instructing it to replace PII with `[TYPE]` placeholders
- Returns redacted text and a list of what was found
- Used when `BASTION_REDACTOR=ollama`
- Requires `OLLAMA_ENDPOINT` and `OLLAMA_MODEL` env vars
- If Ollama is unreachable, falls back to regex and logs a warning

**Custom backend:**
- Customer provides a Python class path via `BASTION_REDACTOR_CLASS=myapp.redactors.MyRedactor`
- SDK dynamically imports and instantiates it
- Must implement the `RedactorBackend` interface

**Audit log entry for every redaction:**
```json
{
  "event_type": "pii_redacted",
  "actor": "system",
  "payload": {
    "backend": "ollama",
    "model": "llama3.2",
    "fields_redacted": ["NAME", "EMAIL", "ACCOUNT_NUMBER"],
    "original_length": 342,
    "redacted_length": 298
  }
}
```

**Config:**
```env
BASTION_REDACTOR=regex          # regex | ollama | custom
OLLAMA_ENDPOINT=http://localhost:11434
OLLAMA_MODEL=llama3.2
BASTION_REDACTOR_CLASS=myapp.redactors.MyRedactor
```

---

### T1-6. Gateway Down Fallback

**Goal:** If the Gateway is unreachable (restart, network issue), the agent should not crash unexpectedly. The customer configures what happens.

**What to implement:**
- `client.py` wraps every Gateway call in a try/except with configurable timeout (default 5s)
- On connection failure, applies the fallback strategy from env/config:
  - `deny` — treat the action as denied, raise `DeniedError` (safest, default)
  - `allow` — let the tool execute without approval (useful for low-risk tools in dev)
  - `raise` — raise `GatewayDownError` and let the agent handle it
- Retry with exponential backoff before applying fallback: 3 attempts, 1s / 2s / 4s
- Log a `gateway_unreachable` event locally (to a local file if DB is also down)

**Config:**
```env
BASTION_FALLBACK_ON_DOWN=deny       # deny | allow | raise
BASTION_GATEWAY_TIMEOUT=5           # seconds
BASTION_GATEWAY_RETRIES=3
```

---

### T1-7. Database Migration System

**Goal:** When Bastion releases a new version with schema changes, customers can upgrade their database without manually editing SQL.

**What to implement:**
- Use **Alembic** for migration management
- Migrations live in `gateway/migrations/` as numbered files
- Add a `bastion migrate` CLI command that applies pending migrations
- Add a `bastion migrate --check` command that reports if the DB is behind
- Gateway startup checks DB schema version and logs a warning if migrations are pending (does not block startup)
- Every migration is reversible (has both `upgrade()` and `downgrade()` functions)

---

## Tier 2 — Important (limits adoption without these)

---

### T2-1. Async Gate Support

**Goal:** Most modern agent frameworks (LangChain, CrewAI, OpenAI Agents SDK) are async. The `gate()` decorator must support async tool functions.

**What to implement:**
- `gate(fn)` detects if `fn` is a coroutine function using `asyncio.iscoroutinefunction(fn)`
- If async: wraps with `async_gate()` logic using `await` on the Gateway HTTP call
- If sync: wraps with existing sync logic
- `async_gate()` is also exported explicitly for cases where the developer wants to be explicit
- All Gateway HTTP calls inside async context use `httpx.AsyncClient`

**Expected behaviour:**
```python
# Both work transparently
gated_sync  = gate(my_sync_tool,  risk="high")
gated_async = gate(my_async_tool, risk="high")

result = gated_sync(args)           # regular call
result = await gated_async(args)    # awaitable
```

---

### T2-2. Agent Identity

**Goal:** In production, multiple agents run simultaneously. The audit log must record exactly which agent version called each tool. Filtering by agent in the dashboard must work.

**What to implement:**
- Each agent sets `BASTION_AGENT_ID` and optional `BASTION_AGENT_VERSION` in env
- SDK sends these on every Gateway request as headers
- Gateway stores `agent_id` and `agent_version` on every `actions` row
- Dashboard: add agent filter dropdown to AuditTable and DecisionTable
- Dashboard: ActorBreakdown shows per-agent breakdown when multiple agents are active
- `BASTION_AGENT_ID` defaults to `"default-agent"` if not set (with a warning)

**Config:**
```env
BASTION_AGENT_ID=payment-agent
BASTION_AGENT_VERSION=v2.1.0
```

---

### T2-3. Compliance Report Export

**Goal:** Compliance teams need to hand a document to auditors proving what the agent did, who approved it, and that the audit chain is intact. One command produces the report.

**What to implement:**
- `bastion export` CLI command with options:
  - `--from` and `--to` date range
  - `--format pdf | json | csv`
  - `--agent` filter by agent ID
  - `--output` file path
- The PDF report includes:
  - Cover page: company name, date range, generated timestamp
  - Chain verification result (VERIFIED / TAMPERED with details)
  - Summary stats: total actions, approved, denied, auto-denied, PII redactions, threats blocked
  - Actor breakdown table (AI / Human / System percentages)
  - Full event table: timestamp, action ID, event type, actor, decision, payload summary
  - Each row's hash (truncated) for reference
- JSON and CSV exports include the full raw data for programmatic processing

---

### T2-4. Dashboard Role-Based Access Control (RBAC)

**Goal:** Enterprise companies cannot give every employee full dashboard access. Auditors need read-only access. Approvers need approve/deny only. Admins get everything.

**What to implement:**

**Roles:**
- `admin` — full access: view all, approve/deny, export, manage settings
- `approver` — can view actions and approve/deny intercepted ones (no export, no settings)
- `auditor` — read-only: view all tables, run export, cannot approve/deny
- `developer` — view only their own agent's actions (filtered by BASTION_AGENT_ID)

**Implementation:**
- Add JWT-based authentication to the dashboard (NextAuth.js or similar)
- `DASHBOARD_SECRET` env var for signing JWTs
- `DASHBOARD_ADMIN_EMAILS`, `DASHBOARD_APPROVER_EMAILS`, `DASHBOARD_AUDITOR_EMAILS` env vars
- Each dashboard page checks role before rendering sensitive controls
- Gateway approval/denial endpoints verify the caller's role from their JWT

---

### T2-5. Health Check Endpoint

**Goal:** Customers need to monitor Gateway health in their infrastructure (Docker health checks, uptime monitors, load balancers).

**What to implement:**
- `GET /health` — returns overall status and component statuses
- `GET /health/live` — Kubernetes liveness probe (just returns 200 if process is alive)
- `GET /health/ready` — Kubernetes readiness probe (returns 200 only if DB and notifier are reachable)

**Response format:**
```json
{
  "status": "ok",
  "version": "1.2.0",
  "components": {
    "database": "ok",
    "notifier": "ok",
    "redactor": "ok"
  },
  "uptime_seconds": 3842
}
```
- If any component is down, `status` becomes `degraded` and HTTP status is `503`

---

### T2-6. Multi-Framework Support & Examples

**Goal:** The `gate()` decorator wraps any Python function, so it technically works with any framework. But customers need tested, working examples to adopt confidently.

**What to implement:**
- `examples/` directory in the repo with one working example per framework:
  - `examples/langchain/` — tool wrapped with gate(), used in a LangChain agent
  - `examples/openai-agents/` — gate() with OpenAI Agents SDK tool definition
  - `examples/crewai/` — gate() with a CrewAI tool
  - `examples/autogen/` — gate() with AutoGen function tool
  - `examples/raw-python/` — gate() with no framework, just direct function calls
- Each example has its own `README.md` with exact setup steps
- Each example connects to a local Gateway via Docker Compose
- CI runs all examples on every PR to prevent regressions

---

### T2-7. Bastion CLI Tool

**Goal:** A single `bastion` command for all setup, management, and diagnostic tasks. Reduces friction for new users.

**What to implement:**
```bash
bastion init                    # scaffold bastion-policy.yaml and .env.example
bastion migrate                 # apply pending DB migrations
bastion migrate --check         # check if DB is up to date
bastion validate-policy         # validate bastion-policy.yaml syntax
bastion verify-chain            # run audit chain integrity check
bastion export --from X --to Y  # export compliance report
bastion keygen                  # generate a new BASTION_API_KEY
bastion status                  # check Gateway, DB, notifier health
```

- Built with `click` or `typer`
- Installed automatically when `pip install bastion-sdk` runs
- Reads config from `.env` file in current directory

---

## Tier 3 — Growth (needed to sell to enterprise)

---

### T3-1. Multi-Agent Tracing

**Goal:** When Agent A calls Agent B which calls Agent C, the audit trail must show the full call tree — not just isolated actions. Required for enterprise workflows with orchestrators and sub-agents.

**What to implement:**
- Add `parent_action_id` and `trace_id` columns to the `actions` table
- SDK generates a `trace_id` (UUID) at the start of each agent run and passes it on every Gate call
- When an agent spawns a sub-agent, it passes its current `action_id` as `parent_action_id`
- Dashboard: Action Drawer shows a tree view of the call chain
- Export includes the full trace tree

---

### T3-2. Anomaly Detection & Alerts

**Goal:** Detect when an agent is behaving abnormally — prompt injection in progress, runaway loop, policy misconfiguration — and alert the security team before damage is done.

**What to implement:**

**Detect these patterns:**
- High-risk action rate spikes: more than 2x the 7-day average in a 10-minute window
- Repeated denials: same tool denied 3+ times in 5 minutes (possible injection attempt)
- Unusual hour activity: agent making high-risk calls outside configured business hours
- Threat blocked spike: more than 5 `threat_blocked` events in 10 minutes

**When detected:**
- Send an alert via the configured notification channel (different from approval alerts — this goes to security team)
- Log an `anomaly_detected` event to the audit chain with the pattern description
- Dashboard shows an anomaly banner until acknowledged by an admin

**Config:**
```yaml
# bastion-policy.yaml
anomaly_detection:
  enabled: true
  alert_channel: pagerduty     # can differ from approval channel
  high_risk_spike_multiplier: 2.0
  denial_window_minutes: 5
  denial_threshold: 3
```

---

### T3-3. TypeScript / JavaScript SDK

**Goal:** Many AI applications are built in Node.js (Vercel AI SDK, LangChain.js, OpenAI Node SDK). A JS/TS version of `gate()` doubles the addressable market.

**What to implement:**
- Separate npm package: `npm install @bastion-sdk/node`
- Exports: `gate(fn, options)`, `asyncGate(fn, options)`
- Reads `BASTION_API_KEY`, `BASTION_GATEWAY_URL`, `BASTION_AGENT_ID` from `process.env`
- Calls the same Gateway HTTP API — no Gateway changes needed
- TypeScript types for all options and responses
- Examples for: Vercel AI SDK, LangChain.js, OpenAI Node SDK

---

### T3-4. Usage Metering (for future SaaS tier)

**Goal:** Track how many actions each customer processes per month. Required for billing if a managed cloud tier is offered later.

**What to implement:**
- Add `customer_id` to the Gateway's concept of an API key
- Count `actions` rows per `customer_id` per billing period
- `GET /usage` endpoint returns current month's counts
- Emit a monthly usage event to the audit chain: `event_type=usage_report`
- Configurable soft limit (warn) and hard limit (deny new actions, alert customer)

---

### T3-5. Webhook Decision API

**Goal:** Some companies have existing approval workflows (Jira, ServiceNow, internal tools). They need to be able to receive intercepted action details via webhook and send approve/deny back via REST — without using Discord/Slack.

**What to implement:**
- When notification channel is `webhook`, Gateway POSTs action details to customer's URL
- Customer's system processes it and calls back:
  - `POST /decision/{action_id}/approve`
  - `POST /decision/{action_id}/deny`
  - `POST /decision/{action_id}/modify` with updated parameters
- All decision endpoints require the `BASTION_API_KEY` for authentication
- Signed HMAC on outgoing webhook payload so customer can verify it came from Bastion

---

## Environment Variables — Complete Reference

After all the above is implemented, a customer's `.env` looks like this.
Minimum required vars are marked with `*`.

```env
# ── SDK Identity ──────────────────────────────
BASTION_API_KEY=sk-live-xxxxxxxxxxxxxxxxxxxx    # * API key from keygen
BASTION_AGENT_ID=payment-agent-v1              # name of this agent
BASTION_AGENT_VERSION=v1.0.0                   # version label
BASTION_GATEWAY_URL=http://localhost:8000       # where Gateway runs (default: localhost:8000)

# ── Database ──────────────────────────────────
SUPABASE_URL=https://their-project.supabase.co # * their Supabase project URL
SUPABASE_SERVICE_KEY=their-service-role-key    # * their service role key
SUPABASE_ANON_KEY=their-anon-key               # dashboard only

# ── Notifications (pick one or more) ──────────
DISCORD_BOT_TOKEN=their-discord-bot-token
DISCORD_CHANNEL_ID=their-channel-id

SLACK_WEBHOOK_URL=https://hooks.slack.com/xxx
SLACK_SIGNING_SECRET=their-signing-secret

PAGERDUTY_ROUTING_KEY=their-routing-key

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@theircompany.com
SMTP_PASSWORD=their-password
SMTP_TO=security-team@theircompany.com

# ── LLM Keys (their own, for their agent) ─────
ANTHROPIC_API_KEY=their-anthropic-key
OPENAI_API_KEY=their-openai-key

# ── PII Redaction ─────────────────────────────
BASTION_REDACTOR=regex                         # regex | ollama | custom (default: regex)
OLLAMA_ENDPOINT=http://localhost:11434         # if BASTION_REDACTOR=ollama
OLLAMA_MODEL=llama3.2                          # if BASTION_REDACTOR=ollama
BASTION_REDACTOR_CLASS=myapp.MyRedactor        # if BASTION_REDACTOR=custom

# ── Gateway Behaviour ─────────────────────────
APPROVAL_TIMEOUT_SECONDS=600                   # default: 600 (10 min)
BASTION_FALLBACK_ON_DOWN=deny                  # deny | allow | raise (default: deny)
BASTION_GATEWAY_TIMEOUT=5                      # HTTP timeout in seconds (default: 5)
BASTION_GATEWAY_RETRIES=3                      # retry attempts before fallback (default: 3)
BASTION_LOG_LEVEL=INFO                         # DEBUG | INFO | WARNING | ERROR

# ── Dashboard Access ──────────────────────────
DASHBOARD_SECRET=their-jwt-signing-secret
DASHBOARD_ADMIN_EMAILS=admin@company.com
DASHBOARD_APPROVER_EMAILS=ops@company.com
DASHBOARD_AUDITOR_EMAILS=auditor@company.com
```

**Minimum to get running (4 vars):**
```env
BASTION_API_KEY=sk-live-xxxxxxxxxxxxxxxxxxxx
SUPABASE_URL=https://their-project.supabase.co
SUPABASE_SERVICE_KEY=their-service-role-key
DISCORD_BOT_TOKEN=their-discord-bot-token
```

---

## Implementation Order Summary

```
Make it installable and safe
  T1-1  pip package (pyproject.toml, PyPI publish)
  T1-2  API key authentication
  T1-3  Risk policy YAML file
  T1-4  Slack + PagerDuty + email notification channels
  T1-5  Pluggable redactor (regex default + Ollama backend)
  T1-6  Gateway down fallback with retries
  T1-7  Database migration system (Alembic)

Make it enterprise-ready
  T2-1  Async gate() support
  T2-2  Agent identity (agent_id, agent_version)
  T2-3  Compliance report export (PDF, JSON, CSV)
  T2-4  Dashboard RBAC (admin, approver, auditor, developer)
  T2-5  Health check endpoints (/health, /health/live, /health/ready)
  T2-6  Multi-framework examples (LangChain, CrewAI, OpenAI, AutoGen)
  T2-7  Bastion CLI tool (init, migrate, verify-chain, export, status)

Make it scalable
  T3-1  Multi-agent tracing (trace_id, parent_action_id, call tree)
  T3-2  Anomaly detection and alerts
  T3-3  TypeScript / JavaScript SDK (npm package)
  T3-4  Usage metering (for future SaaS billing)
  T3-5  Webhook decision API (for existing approval workflows)
```
