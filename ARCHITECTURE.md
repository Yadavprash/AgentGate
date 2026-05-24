# Bastion SDK — Architecture Diagrams

This document contains four views of the architecture:
1. **High-Level System Diagram** — components and boundaries
2. **Detailed Request Flow** — sequence of every step a gated action goes through
3. **Deployment Diagram** — what runs where (you vs. the customer)
4. **Trust Boundary Map** — what crosses the perimeter, what never does

---

## 1. High-Level System Diagram

```mermaid
flowchart TB
    User([👤 End User])

    subgraph CUSTOMER["🏢 CUSTOMER'S INFRASTRUCTURE (their machine / their cloud)"]

        subgraph AGENT_PROCESS["Agent Process"]
            Agent["🤖 AI Agent<br/>(LangChain / CrewAI /<br/>OpenAI SDK / Custom)"]
            SDK["📦 Bastion SDK<br/>(pip install bastion-sdk)"]
            Redactor["🛡️ Local Redactor<br/>(regex / Ollama / custom)"]
            Agent --> SDK
            SDK --> Redactor
        end

        subgraph GATEWAY_CONTAINER["Gateway Container (Docker)"]
            Gateway["⚙️ Bastion Gateway<br/>(FastAPI)"]
            FreezeQ["🧊 Freeze/Resume<br/>State Machine"]
            AuditLog["📜 Audit Chain<br/>SHA-256 hashing"]
            Sweeper["🧹 Stale-Action<br/>Background Sweep"]
            Gateway --> FreezeQ
            Gateway --> AuditLog
            Gateway --> Sweeper
        end

        subgraph DASHBOARD_CONTAINER["Dashboard Container (Docker)"]
            Dashboard["📊 Bastion Dashboard<br/>(Next.js)"]
        end

        subgraph DATABASE["Supabase (Customer's Project)"]
            ActionsTable[("🗄️ actions<br/>live state")]
            EventsTable[("🔗 audit_events<br/>hash chain")]
        end

        subgraph LOCAL_LLM["Optional Local LLM"]
            Ollama["🦙 Ollama<br/>(llama3.2)"]
        end
    end

    subgraph EXTERNAL["🌐 EXTERNAL SERVICES"]
        CloudLLM["☁️ Cloud LLM<br/>(Anthropic / OpenAI)"]
        Notifier["💬 Notification Channel<br/>(Discord / Slack / PagerDuty)"]
        Human([👥 Human Approver])
    end

    User -->|prompt| Agent
    Agent <-->|chat / tool decisions| CloudLLM

    SDK <-->|HTTP /gate| Gateway
    Redactor -.->|optional semantic redaction| Ollama

    Gateway <-->|read/write| ActionsTable
    Gateway -->|append-only| EventsTable
    Gateway -->|notify| Notifier
    Notifier -->|Approve/Deny| Human
    Human -->|click button| Notifier
    Notifier -->|callback| Gateway

    ActionsTable -.->|Realtime feed| Dashboard
    EventsTable -.->|Realtime feed| Dashboard

    classDef customer fill:#EBF3FB,stroke:#2E75B6,stroke-width:2px
    classDef external fill:#FDE8E8,stroke:#C0392B,stroke-width:2px
    classDef db fill:#FFF4D6,stroke:#B07B00,stroke-width:2px
    class Agent,SDK,Redactor,Gateway,FreezeQ,AuditLog,Sweeper,Dashboard,Ollama customer
    class CloudLLM,Notifier,Human external
    class ActionsTable,EventsTable db
```

---

## 2. Detailed Request Flow

Step-by-step view of what happens when an agent calls a high-risk tool.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Agent as 🤖 Agent
    participant LLM as ☁️ Cloud LLM
    participant SDK as 📦 Bastion SDK
    participant GW as ⚙️ Gateway
    participant DB as 🗄️ Supabase
    participant Slack as 💬 Slack
    actor Human as 👥 Human
    participant Tool as 🔧 Tool Function
    participant Redactor as 🛡️ Redactor

    User->>Agent: "Pay vendor $5,000"
    Agent->>LLM: chat completion + tools
    LLM-->>Agent: call execute_payment(...)

    Agent->>SDK: gated_payment(amount=5000)
    SDK->>GW: POST /gate (action details + api_key)
    GW->>DB: INSERT actions (status=intercepted)
    GW->>DB: INSERT audit_events (event=intercepted, hash=SHA256)

    GW->>Slack: send Block Kit card
    Slack-->>Human: 🔔 "Approve $5,000 payment?"

    Note over GW: asyncio.Event.wait()<br/>holds the agent

    Human->>Slack: clicks Approve
    Slack->>GW: POST /notify/slack/callback
    GW->>DB: UPDATE actions (status=approved)
    GW->>DB: INSERT audit_events (event=approved, actor=human)

    GW-->>SDK: 200 OK {decision: approved}
    SDK->>Tool: execute_payment(amount=5000)
    Tool-->>SDK: {success: true, receipt: ...}

    alt Tool marked sensitive=True
        SDK->>Redactor: redact(receipt)
        Redactor-->>SDK: receipt with [NAME], [CARD] stripped
        SDK->>DB: INSERT audit_events (event=pii_redacted)
    end

    SDK-->>Agent: redacted result
    Agent->>LLM: tool_result (safe to send)
    LLM-->>Agent: "Payment of $5,000 was processed."
    Agent-->>User: ✅ Done.
```

---

## 3. Deployment Diagram

Where each piece lives and how it gets there.

```mermaid
flowchart LR
    subgraph DEV["👨‍💻 Bastion (You)"]
        Repo["📂 GitHub Repo<br/>source code"]
        DockerHub["🐳 Docker Hub<br/>bastionsdk/gateway<br/>bastionsdk/dashboard"]
        PyPI["📦 PyPI<br/>bastion-sdk"]
        Repo -->|docker build + push| DockerHub
        Repo -->|pip publish| PyPI
    end

    subgraph CUST["🏢 Customer (Acme Corp)"]
        subgraph CustHost["Their Server / VM / Kubernetes"]
            CustAgent["🤖 Their Agent<br/>(uses bastion-sdk)"]
            CustGW["⚙️ Gateway Container<br/>(pulled from Docker Hub)"]
            CustDash["📊 Dashboard Container<br/>(pulled from Docker Hub)"]
        end
        CustSB[("🗄️ Their Supabase<br/>project")]
        CustSlack["💬 Their Slack<br/>workspace"]
    end

    PyPI -.->|pip install bastion-sdk| CustAgent
    DockerHub -.->|docker pull| CustGW
    DockerHub -.->|docker pull| CustDash

    CustAgent <-->|HTTP localhost:8000| CustGW
    CustGW <-->|read/write| CustSB
    CustGW <-->|notify/callback| CustSlack
    CustDash <-->|Realtime| CustSB

    classDef bastionSide fill:#FFE9D6,stroke:#D68F2E
    classDef custSide fill:#EBF3FB,stroke:#2E75B6
    class Repo,DockerHub,PyPI bastionSide
    class CustAgent,CustGW,CustDash,CustSB,CustSlack custSide
```

---

## 4. ASCII Version (Terminal-Friendly)

For viewing without a Mermaid renderer.

```
╔════════════════════════════════════════════════════════════════════════════╗
║                       CUSTOMER'S INFRASTRUCTURE                            ║
║                                                                            ║
║   ┌──────────────────────────────────────────────────────────────────┐    ║
║   │                       AGENT PROCESS                              │    ║
║   │                                                                  │    ║
║   │   User Prompt                                                    │    ║
║   │       ↓                                                          │    ║
║   │   ┌──────────────┐    chat     ┌────────────────────┐            │    ║
║   │   │  AI Agent    │ ←─────────→ │  Cloud LLM         │            │    ║
║   │   │  (LangChain) │             │  (Anthropic/OpenAI)│            │    ║
║   │   └──────┬───────┘             └────────────────────┘            │    ║
║   │          │ tool call                                              │    ║
║   │          ↓                                                        │    ║
║   │   ┌──────────────┐   ┌─────────────┐                              │    ║
║   │   │ Bastion SDK  │ → │  Redactor   │ → Ollama (optional)          │    ║
║   │   │   gate(fn)   │   │ regex/llama │                              │    ║
║   │   └──────┬───────┘   └─────────────┘                              │    ║
║   │          │                                                        │    ║
║   └──────────┼────────────────────────────────────────────────────────┘    ║
║              │ HTTP POST /gate (api_key)                                  ║
║              ↓                                                            ║
║   ┌──────────────────────────────────────────────────────────────────┐    ║
║   │                  GATEWAY CONTAINER (Docker)                      │    ║
║   │                                                                  │    ║
║   │   ┌──────────────────────────────────────────────────┐           │    ║
║   │   │            Bastion Gateway (FastAPI)             │           │    ║
║   │   │  ┌───────────┐  ┌───────────┐  ┌─────────────┐   │           │    ║
║   │   │  │ Freeze /  │  │  Audit    │  │ Stale Action│   │           │    ║
║   │   │  │  Resume   │  │  Chain    │  │  Sweeper    │   │           │    ║
║   │   │  │  Machine  │  │ (SHA-256) │  │ (every 60s) │   │           │    ║
║   │   │  └───────────┘  └───────────┘  └─────────────┘   │           │    ║
║   │   └─────┬────────────────┬─────────────────┬─────────┘           │    ║
║   │         │ write          │ append          │ notify              │    ║
║   │         ↓                ↓                 ↓                     │    ║
║   │   ┌───────────────────────────┐    ┌──────────────────┐          │    ║
║   │   │   SUPABASE (their DB)     │    │  Notifier        │          │    ║
║   │   │ ┌──────────┐ ┌──────────┐ │    │  Discord/Slack/  │          │    ║
║   │   │ │ actions  │ │ audit_   │ │    │  PagerDuty/Email │          │    ║
║   │   │ │ (state)  │ │ events   │ │    └────────┬─────────┘          │    ║
║   │   │ │          │ │ (chain)  │ │             │                    │    ║
║   │   │ └─────┬────┘ └────┬─────┘ │             ↓                    │    ║
║   │   └───────┼───────────┼───────┘    ┌──────────────────┐          │    ║
║   │           │ Realtime  │            │  Human Approver  │          │    ║
║   │           ↓           ↓            └────────┬─────────┘          │    ║
║   │   ┌──────────────────────────┐              │ click Approve      │    ║
║   │   │   DASHBOARD (Next.js)    │ ←────────────┘                    │    ║
║   │   │ HeroStats · AuditTable   │                                   │    ║
║   │   │ ActionDrawer · Actors    │                                   │    ║
║   │   │ ChainIntegrityBadge      │                                   │    ║
║   │   └──────────────────────────┘                                   │    ║
║   │                                                                  │    ║
║   └──────────────────────────────────────────────────────────────────┘    ║
║                                                                           ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

---

## 5. Component Responsibility Matrix

| Component | Lives In | Responsibility | Talks To |
|---|---|---|---|
| **AI Agent** | Customer's app | Decides what tools to call | LLM, Bastion SDK |
| **Bastion SDK** | Customer's app (pip) | Intercepts tool calls, redacts PII | Gateway, Redactor |
| **Redactor** | Customer's app | Strips PII from tool output | Ollama (optional) |
| **Gateway** | Customer's Docker | Freeze/resume, audit chain, decisions | Supabase, Notifier |
| **Audit Chain** | Inside Gateway | SHA-256 chains every event | Supabase only |
| **Stale Sweeper** | Inside Gateway | Auto-denies orphaned frozen actions | Supabase only |
| **Notifier** | Inside Gateway | Sends approval requests | Slack/Discord/etc. |
| **Supabase** | Customer's cloud | Stores actions + audit events | Dashboard (Realtime) |
| **Dashboard** | Customer's Docker | Live UI for approvals + audit | Supabase Realtime |
| **Ollama** | Customer's machine | Optional semantic PII redactor | SDK Redactor only |

---

## 6. Trust Boundary Map

What crosses the network perimeter — and what never does.

```
┌────────────────────────────────────────────────────────────────────────┐
│                  CUSTOMER'S TRUST PERIMETER                            │
│                  (their VPC / their machine)                           │
│                                                                        │
│    ✅ Raw PII (names, cards, OTPs)                                     │
│    ✅ Audit chain hashes                                               │
│    ✅ Tool arguments and results                                       │
│    ✅ API keys (their own)                                             │
│    ✅ All Supabase data                                                │
│                                                                        │
│                                                                        │
│      ↕   Redacted text only                                            │
│      ↕   (no raw PII)                                                  │
│      ↕                                                                 │
└──────╫─────────────────────────────────────────────────────────────────┘
       ║
       ╠═══════════════════════════════════════════════════════════════
       ║
   ┌───v────────────────────────────────────────────────────────────┐
   │                        EXTERNAL                                 │
   │                                                                 │
   │   ☁️ Cloud LLM (Anthropic/OpenAI)                              │
   │      → Sees: redacted tool results, agent messages              │
   │      → Never sees: raw PII, audit chain                         │
   │                                                                 │
   │   💬 Notification Channel (Slack/Discord)                       │
   │      → Sees: tool name, risk level, summary                     │
   │      → Configurable: hide args, show args, redact args          │
   │                                                                 │
   │   🐳 Docker Hub / 📦 PyPI                                      │
   │      → Only delivers Bastion code TO customer                   │
   │      → Never receives data FROM customer                        │
   │                                                                 │
   └─────────────────────────────────────────────────────────────────┘
```

---

## 7. The Three-Layer Trust Model

```
        ┌─────────────────────────────────────────────────────────┐
        │  LAYER 3 — FORENSIC AUDIT                               │
        │  Every decision logged. Hash-chained. Tamper-evident.   │
        │  Owner: Legal / Compliance                              │
        ├─────────────────────────────────────────────────────────┤
        │  LAYER 2 — HUMAN-IN-THE-LOOP                            │
        │  High-risk actions freeze. Human approves or denies.    │
        │  Owner: Operations / Security                           │
        ├─────────────────────────────────────────────────────────┤
        │  LAYER 1 — PII FIREWALL                                 │
        │  Sensitive data redacted locally before cloud LLM call. │
        │  Owner: Privacy / Data Protection                       │
        ├─────────────────────────────────────────────────────────┤
        │                                                         │
        │            🤖  AGENT'S TOOL CALLS                       │
        │            (every call passes through all 3 layers)     │
        │                                                         │
        └─────────────────────────────────────────────────────────┘
```
