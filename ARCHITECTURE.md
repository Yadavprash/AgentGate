# AgentGate — Architecture

Four views, zooming from "elevator pitch" to "wiring diagram."

---

## 1. The pitch view

```
   ┌──────────┐       ┌─────────────┐       ┌──────────┐
   │          │       │             │       │  HUMAN   │
   │    AI    │──────>│  AGENTGATE  │──────>│ on phone │
   │  AGENT   │       │             │       │ (Discord)│
   │          │<──────│  (airlock)  │<──────│          │
   └──────────┘       └─────────────┘       └──────────┘
                            │
                            ▼
                      [ audit log ]
```

AI runs autonomously for safe stuff. At any risky action, AgentGate freezes
it. Human gets a Discord card. One tap to approve, deny, or modify. Resume.
Everything ends up in a real-time audit log.

---

## 2. The three trust layers

```
┌─ Your agent code ─────────────────────────────────────────┐
│                                                            │
│   gate(my_tool, risk="high", sensitive=True)              │
│                                                            │
└─────────────────────────┬──────────────────────────────────┘
                          │ tool call
                          ▼
        ╔═════════════════════════════════════════╗
        ║  LAYER 1: PII redaction (on device)     ║   ◀── regex / Ollama
        ║  Cloud LLM never sees raw names, cards  ║       runs LOCALLY
        ╚════════════════════╤════════════════════╝
                             │ if high-risk
                             ▼
        ╔═════════════════════════════════════════╗
        ║  LAYER 2: HITL approval (airlock)       ║   ◀── Discord card
        ║  Agent freezes; human taps in seconds   ║       Approve / Deny
        ╚════════════════════╤════════════════════╝       Modify Budget
                             │ if approved
                             ▼
        ╔═════════════════════════════════════════╗
        ║  LAYER 3: Audit log (real-time)         ║   ◀── Postgres + Realtime
        ║  Every action, allowed or blocked       ║       streamed to dashboard
        ╚═════════════════════════════════════════╝
```

Each layer is opt-in per tool. `risk="low"` skips layer 2. Omitting
`sensitive=True` skips layer 1. Layer 3 is automatic for everything.

---

## 3. The system map

```
   ┌──────────────────────────────────────────────────────────────┐
   │                       USER'S MACHINE                          │
   │                                                                │
   │   ┌─────────────────┐         ┌──────────────────────────┐    │
   │   │  AGENT PROCESS  │         │  AGENTGATE GATEWAY        │    │
   │   │                 │         │  (FastAPI + Discord bot   │    │
   │   │  LangChain      │         │   in one Python process)  │    │
   │   │  + Claude       │ ─HTTP─> │                           │    │
   │   │                 │  /gate  │  • /gate/intercept        │    │
   │   │  Tools wrapped  │ <─────  │  • /gate/decision         │    │
   │   │  by gate() SDK  │ approve │  • /gate/redaction        │    │
   │   │                 │   /deny │  • /gate/complete         │    │
   │   │  PII redactor   │         │                           │    │
   │   │  runs HERE      │         │  asyncio.Event registry   │    │
   │   │  (regex/Ollama) │         │  freezes the request      │    │
   │   └────────┬────────┘         └───┬──────────────┬────────┘    │
   │            │                      │              │             │
   └────────────┼──────────────────────┼──────────────┼─────────────┘
                │                      │              │
       ┌────────▼─────────┐  ┌─────────▼─────────┐ ┌──▼──────────────┐
       │  Anthropic API   │  │     SUPABASE      │ │ DISCORD API     │
       │  (cloud LLM)     │  │  Postgres +       │ │  • bot login    │
       │                  │  │  Realtime         │ │  • send card    │
       │  receives only   │  │                   │ │  • button taps  │
       │  redacted text   │  │  `actions` table  │ │    → in-process │
       └──────────────────┘  │  = state + audit  │ │      callback   │
                             └─────────┬─────────┘ └────────┬────────┘
                                       │                    │
                                  realtime push        notification
                                       │                    │
                             ┌─────────▼─────────┐     ┌────▼────────┐
                             │ NEXT.JS DASHBOARD │     │   HUMAN     │
                             │  • hero stats     │     │   on phone  │
                             │  • WhatClaudeSaw  │     │   tap one   │
                             │  • ThreatBlocked  │     │   button    │
                             │  • pulse + flash  │     └─────────────┘
                             │  • audit table    │
                             │  • /pitch route   │
                             └───────────────────┘
```

**The trick that makes resume feel instant:** the Discord bot runs inside the
FastAPI process, sharing one asyncio event loop. A Discord button click
calls `pause.resolve(job_id)` *directly* on the in-process Event the HTTP
request is awaiting. No webhook, no queue, no polling — just `event.set()`.

---

## 4. Lifecycle of one high-risk call (sequence view)

```
Agent           SDK              Gateway         Supabase     Discord bot     Human
  │              │                  │                │             │            │
  │ purchase()   │                  │                │             │            │
  ├─────────────>│                  │                │             │            │
  │              │  POST /intercept │                │             │            │
  │              ├─────────────────>│                │             │            │
  │              │                  │ insert(status= │             │            │
  │              │                  │ "intercepted") │             │            │
  │              │                  ├───────────────>│             │            │
  │              │                  │                │ realtime ──▶│ ──▶ dashboard
  │              │                  │ send_card      │             │            │
  │              │                  ├──────────────────────────────>            │
  │              │                  │                │             ├──notify───>│
  │              │                  │                │             │            │
  │              │  ⏸ HTTP request HELD OPEN ─ asyncio.Event.wait()              │
  │              │                  │                │             │            │
  │              │                  │                │             │  ◀──tap────┤
  │              │                  │                │             │  Approve   │
  │              │                  │  pause.resolve(│             │            │
  │              │                  │  in-process)   │             │            │
  │              │                  │<───────────────│─────────────┤            │
  │              │                  │ update(status= │             │            │
  │              │                  │ "approved")    │             │            │
  │              │                  ├───────────────>│             │            │
  │              │                  │                │ realtime ──▶│ ──▶ dashboard
  │              │ {decision:       │                │   (row flashes green)    │
  │              │  approved}       │                │             │            │
  │              │<─────────────────│                │             │            │
  │              │ run real tool    │                │             │            │
  │              │ (e.g. Razorpay)  │                │             │            │
  │  receipt     │                  │                │             │            │
  │<─────────────┤                  │                │             │            │
```

**For `sensitive=True` low-risk tools** (e.g. `verify_customer_identity`,
`read_transactions`), the lifecycle is shorter: gateway returns
`auto_approved` immediately, the SDK runs the real tool, the SDK pipes the
output through the local redactor, then posts the raw + redacted text to
`POST /gate/redaction` so the dashboard's `WhatClaudeSaw` panel can render
the proof.

**For `mode="input"` (CAPTCHA / OTP)**, the human's typed answer replaces
the tool's output — the human literally becomes a tool in the agent's
toolbox.

---

## Why this architecture, not the obvious alternatives

| Alternative we considered | Why we rejected it |
|---|---|
| Polling — agent re-queries gateway for status every 1 s | Slow resume (1 s p99 instead of instant); harder failure semantics; more chatty |
| Separate gateway + bot processes (e.g. gateway calls Discord webhook) | Inter-process hop adds latency; needs a queue to wake the held request; extra moving part |
| Webhook from Discord back to gateway | Requires the gateway to be publicly addressable from Discord's infra; adds HMAC/replay complications. We do support this path via `POST /gate/decision` for non-Discord callers (with HMAC-SHA256), but the in-process path is the default. |
| Redis pub/sub for the wake signal | More dependencies; in-process `asyncio.Event` is simpler and same-loop, so it's instant. Persistent pause state across gateway restarts is a known gap (see roadmap). |
| LangGraph's `interrupt` primitive | Couples your agent to LangGraph. AgentGate is framework-agnostic — same SDK works with raw LangChain, CrewAI, OpenAI Agents SDK, or any tool-calling abstraction. |

---

## Known gaps / roadmap

- **Persistent pause state.** `pause._events` is in-process; a gateway restart
  loses every frozen agent. Fix is straightforward — back the registry with
  Redis or a Supabase poller — but not built yet.
- **Multi-stakeholder approvals.** Real enterprise actions sometimes need
  `all_of: [CTO, Finance]` or `quorum: 2 of [security-team]`. Today it's
  single-approver; the data model already supports a list, the UI doesn't yet.
- **Multi-channel.** Discord today. Slack / Teams / Telegram are all one
  adapter file away.
- **Pluggable audit sinks.** Today it's Supabase. Compliance teams want it in
  Datadog / Splunk / Honeycomb. Same protocol, different writer.
- **The `gate://` protocol.** A 1-page spec would let any agent framework
  implement to it. (Anthropic's MCP is the closest analog of doing this
  for a different concern.)
- **Stronger redaction.** Regex catches the standard PII shapes; Ollama
  catches more semantically (street addresses, narrative-form identity). For
  HIPAA you'd want Microsoft Presidio or a NER model.
