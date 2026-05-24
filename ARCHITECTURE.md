# AgentGate — Architecture

Four views at increasing zoom — the napkin, the three trust layers, the
system map, and the lifecycle of one high-risk call. All diagrams are
Mermaid, so they render natively on GitHub, in Notion / Obsidian, and via
[mermaid.live](https://mermaid.live) for SVG/PNG export.

---

## 1. The napkin (pitch view)

```mermaid
flowchart LR
    A([AI Agent]):::agent
    G["AgentGate<br/>airlock"]:::gate
    H([Human on phone<br/>Discord]):::human
    L[("Audit log<br/>SHA-256 hash chain")]:::audit

    A -- "tool call" --> G
    G -- "card" --> H
    H -- "Approve / Deny / Modify" --> G
    G -- "decision" --> A
    G -. "logs every event" .-> L

    classDef agent fill:#1e3a8a,stroke:#3b82f6,color:#fff
    classDef gate fill:#831843,stroke:#ec4899,color:#fff
    classDef human fill:#064e3b,stroke:#10b981,color:#fff
    classDef audit fill:#581c87,stroke:#a855f7,color:#fff
```

Agent runs autonomously for safe stuff. At any risky action, AgentGate
freezes it. Human gets a Discord card. One tap to approve / deny /
modify. Resume. Everything ends up in a tamper-evident audit log.

---

## 2. The three trust layers

```mermaid
flowchart TB
    code["Your agent code:<br/><b>gate(my_tool, risk='high', sensitive=True)</b>"]
    L1["<b>LAYER 1 &middot; PII redaction (on device)</b><br/>regex / optional Ollama<br/>cloud LLM never sees raw PII"]:::l1
    L2["<b>LAYER 2 &middot; HITL approval (the airlock)</b><br/>Discord card &middot; Approve / Deny / Modify Budget<br/>agent freezes; human taps in seconds"]:::l2
    L3["<b>LAYER 3 &middot; Tamper-evident audit</b><br/>Postgres + SHA-256 hash chain<br/>+ append-only DB rules + verifier CLI"]:::l3

    code -- "tool call" --> L1
    L1 -- "if high-risk" --> L2
    L2 -- "if approved" --> L3

    classDef l1 fill:#4c1d95,stroke:#a855f7,color:#fff
    classDef l2 fill:#78350f,stroke:#f59e0b,color:#fff
    classDef l3 fill:#064e3b,stroke:#10b981,color:#fff
```

Each layer is opt-in per tool. `risk="low"` skips layer 2. Omitting
`sensitive=True` skips layer 1. Layer 3 is automatic for everything that
touches the gateway.

---

## 3. The system map

```mermaid
flowchart TB
    subgraph machine["USER'S MACHINE"]
        direction TB
        subgraph agent["Agent process"]
            LC["LangChain agent<br/>(Claude tool-calling)"]
            SDK["AgentGate SDK<br/>gate() &middot; redactor &middot; policy"]
            LC -- "tool call" --> SDK
        end

        subgraph gw["AgentGate Gateway &middot; one process &middot; one asyncio loop"]
            FA["FastAPI routes<br/>/gate/intercept &middot; /decision<br/>/complete &middot; /redaction &middot; /healthz"]
            PR["pause.py<br/>asyncio.Event registry"]
            AL["audit_log.py<br/>SHA-256 hash chain writer"]
            BOT["Discord bot (in-process)<br/>cards &middot; views &middot; modals<br/>button → pause.resolve in same loop"]
            FA -. uses .-> PR
            FA -. uses .-> AL
            BOT -. uses .-> PR
        end

        SDK <-- "HTTP (held open on high-risk)" --> FA
    end

    ANT["Anthropic API<br/>Claude Sonnet 4.6<br/>(receives only redacted text<br/>on sensitive=True tools)"]
    SB[("Supabase / Postgres<br/><br/>actions (live state, mutable)<br/>audit_events (append-only<br/>SHA-256 chain, DB rules block<br/>UPDATE / DELETE)")]
    DC["Discord API"]
    RP["Razorpay test mode<br/>(real PaymentIntent on Approve)"]

    LC <-- "LLM call" --> ANT
    FA <-- "REST" --> SB
    AL -- "append" --> SB
    BOT <-- "interactions" --> DC
    SDK -- "real tool runs<br/>after approval" --> RP

    PH(["Phone &middot; Discord mobile<br/>Approve / Deny / Modify Budget<br/>CAPTCHA / OTP modals"])
    DASH["Next.js dashboard<br/>HeroStats &middot; ThreatBlocked<br/>WhatClaudeSaw &middot; AuditTable<br/>+ /pitch route"]
    VR["Audit verifier CLI<br/>scripts/verify_audit_chain.py<br/>walks chain, exits non-zero<br/>on tampering"]

    DC --> PH
    SB -. "realtime push" .-> DASH
    SB --> VR
```

**The architectural choice worth memorizing:** the Discord bot runs inside
the FastAPI process, sharing one asyncio event loop. A Discord button
click calls `pause.resolve(job_id)` *directly* on the in-process Event the
HTTP request is awaiting. No webhook, no queue, no polling — just
`event.set()`. That's why resume feels instant on stage.

---

## 4. Lifecycle of one high-risk call

```mermaid
sequenceDiagram
    autonumber
    participant Agent
    participant SDK
    participant GW as Gateway
    participant DB as Postgres
    participant Bot as Discord bot
    actor Human

    Agent->>SDK: tool call (e.g. purchase)
    SDK->>GW: POST /gate/intercept
    GW->>DB: insert action (status=intercepted)
    GW->>DB: append audit_events (SHA-256 chain)
    GW-)Bot: send_card(job_id, req)
    Bot->>Human: rich Discord notification
    Note over GW,SDK: ⏸ HTTP held open<br/>asyncio.Event.wait()
    Human->>Bot: tap Approve
    Bot->>GW: pause.resolve(job_id)<br/>(in-process, same loop)
    GW->>DB: update action (approved)
    GW->>DB: append audit_events (approved)
    GW-->>SDK: { decision: "approved" }
    SDK->>SDK: run real tool (e.g. Razorpay)
    SDK->>GW: POST /gate/complete
    GW->>DB: update + audit_events (completed)
    opt if sensitive=True
        SDK->>GW: POST /gate/redaction
        GW->>DB: merge raw+redacted into action.display
        GW->>DB: append audit_events (redaction)
    end
    SDK-->>Agent: tool result (or "DENIED:" string)
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
| Separate gateway + bot processes (gateway calls Discord webhook) | Inter-process hop adds latency; needs a queue to wake the held request; extra moving part |
| Webhook from Discord back to gateway | Requires the gateway to be publicly addressable from Discord's infra; adds HMAC/replay complications. We do support this path via `POST /gate/decision` for non-Discord callers (HMAC-SHA256 signed), but the in-process path is the default. |
| Redis pub/sub for the wake signal | More dependencies; in-process `asyncio.Event` is simpler and same-loop, so it's instant. Persistent pause state across restarts is a known gap (see roadmap). |
| LangGraph's `interrupt` primitive | Couples your agent to LangGraph. AgentGate is framework-agnostic — same SDK works with raw LangChain, CrewAI, OpenAI Agents SDK, or any tool-calling abstraction. |
| Mutable single audit table | Database admin could silently rewrite history. We use a hash-chained `audit_events` table with DB-level rules blocking UPDATE/DELETE and a verifier that catches anyone who drops the rule. |
| Blockchain anchoring | Overkill for the realistic threat model (internal DB tampering). SHA-256 chain + append-only rules + verifier covers it. External transparency-log anchoring (Sigsum / Rekor) is on the roadmap. |

---

## Known gaps / roadmap

- **Persistent pause state.** `pause._events` is in-process; a gateway restart
  loses every frozen agent. Fix is straightforward — back the registry with
  Redis or a Supabase poller — but not built yet.
- **External audit anchor.** The hash chain catches database tampering but
  the chain head is stored alongside the rest of the chain. Periodic
  publication to an external transparency log (Sigsum, Rekor, S3 with
  object lock, or a git repo) would close the "admin rewrites the entire
  chain from event 1" attack. Roadmap.
- **Multi-stakeholder approvals.** Real enterprise actions sometimes need
  `all_of: [CTO, Finance]` or `quorum: 2 of [security-team]`. Today it's
  single-approver; the data model already supports a list, the UI doesn't yet.
- **Multi-channel.** Discord today. Slack / Teams / Telegram are all one
  adapter file away.
- **Pluggable audit sinks.** Today it's Supabase. Compliance teams want it
  in Datadog / Splunk / Honeycomb. Same protocol, different writer.
- **The `gate://` protocol.** A 1-page spec would let any agent framework
  implement to it. (Anthropic's MCP is the closest analog of doing this
  for a different concern.)
- **Stronger redaction.** Regex catches the standard PII shapes; Ollama
  catches more semantically (street addresses, narrative-form identity).
  For HIPAA you'd want Microsoft Presidio or a NER model.
