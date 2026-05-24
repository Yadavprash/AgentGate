# BASTION SDK
## The Trust & Safety Layer for Autonomous AI Agents

> *Before your AI agent does something irreversible — Bastion stops it, asks a human, and writes it down.*

**Prashant Yadav · Vinay Upadhyay · Samiksha Chhabra**
vinay.upadhyay@linq.com

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [The Problem](#2-the-problem)
3. [The Solution — Bastion SDK](#3-the-solution--bastion-sdk)
4. [Architecture](#4-architecture)
5. [Business Value](#5-business-value)
6. [Use Cases](#6-use-cases)
7. [Market Positioning](#7-market-positioning)
8. [Roadmap](#8-roadmap)
9. [Getting Started](#9-getting-started)
10. [Team & Contact](#10-team--contact)

---

## 1. Executive Summary

AI agents are no longer experimental. They book travel, execute payments, access databases, send emails, and manage infrastructure — autonomously. The problem is that the failure mode has shifted from "says something wrong" to "does something irreversible."

Bastion SDK is a developer-first trust layer that sits between an AI agent and the real world. It freezes high-risk actions before execution, routes them to a human for approval, redacts sensitive PII locally before any cloud LLM sees it, and writes every decision to a tamper-evident audit chain.

> **One decorator.  Three guarantees.  Zero changes to the agent's core logic.**

---

## 2. The Problem

### 2.1  The Replit Incident — and Why It Will Happen Again

In July 2025, Replit's autonomous coding AI deleted a customer's production database. The CEO issued a public apology. No safety layer caught the action before it happened — there was no human checkpoint, no audit trail, no PII protection.

This is not an isolated incident. As AI agents gain access to real tools — payment APIs, file systems, databases, external services — the blast radius of a single bad decision grows from "embarrassing tweet" to "irreversible financial or legal damage."

### 2.2  The Three Failure Modes of Autonomous Agents

**FAILURE MODE 1 — Unchecked High-Risk Actions**
Agents execute payments, deletions, and data transfers without human review. By the time a human notices, the action is done.

**FAILURE MODE 2 — PII Reaching Cloud LLMs**
Sensitive data — credentials, medical records, financial transactions, personal identifiers — is passed directly to third-party AI APIs. This violates GDPR, HIPAA, and basic data residency requirements.

**FAILURE MODE 3 — No Audit Trail**
When an agent causes a problem, there is no tamper-evident record of what happened, who decided, and in what order. Legal and compliance teams have nothing to work with.

### 2.3  Why Existing Solutions Don't Work

| Approach | Why It Fails |
|---|---|
| Cloud-side safety filters | Catch text outputs, not tool actions |
| Prompt engineering | Brittle — bypassed by prompt injection |
| Manual review processes | No tooling, no PII protection, no audit trail |
| Agent framework guardrails | Framework-specific, no legal-grade auditability |

---

## 3. The Solution — Bastion SDK

### 3.1  How It Works

Bastion SDK wraps any tool function with a single decorator. When the agent calls a gated tool, Bastion intercepts the call, classifies its risk, and decides what to do — all before the tool executes.

```python
from bastion_sdk import gate

# High-risk: freezes agent, pings human for approval
gated_payment  = gate(execute_payment,       risk="high", sensitive=False)

# Sensitive: PII redacted locally, cloud LLM sees only [NAME], [CARD]
gated_records  = gate(fetch_patient_record,  risk="low",  sensitive=True)

# Low-risk: auto-approved, still logged to the audit chain
gated_search   = gate(search_web,            risk="low")
```

### 3.2  The Three Layers

#### Layer 1 — PII Never Leaves the Device

Tools marked `sensitive=True` route their output through a local redactor before the result reaches the cloud LLM. Names, addresses, card numbers, OTP codes, credentials — stripped on your machine. The cloud model only sees `[NAME]`, `[CARD]`, `[EMAIL]`. Enforced deterministically, not by prompting the LLM to "be careful."

#### Layer 2 — Risky Actions Wait for a Human

Tools marked `risk="high"` freeze the agent mid-execution. A rich notification card lands on Discord within ~2 seconds. The human can:

- **Approve** — agent resumes with the original parameters
- **Deny** — agent receives a DENIED response and stops
- **Modify Budget** — human changes a constraint and the agent adapts

If no human responds within the configured timeout (default: 10 minutes), the action is automatically denied with a timestamped reason.

#### Layer 3 — Every Decision Is Auditable

Every state transition — intercepted, approved, denied, redacted, threat blocked — is written to an append-only audit chain. Each row's hash is `SHA-256(event_data + previous_row_hash)`. Tampering with any row breaks the chain. A verification script detects it instantly. The log is legally defensible.

### 3.3  Policy Ownership

Security and compliance teams own risk classification — not developers. A `risk-policies.yaml` file defines which tools are high-risk, which handle PII, and what the defaults are. Developers write `gate(my_tool)` and pick up the policy automatically. Policy changes go through standard PR review.

---

## 4. Architecture

### 4.1  System Components

| Component | Role |
|---|---|
| Bastion Gateway | FastAPI service inside your infrastructure. Manages freeze/resume state machine, runs the notification bot, writes the audit log. |
| Bastion SDK | Python package (`pip install bastion-sdk`). Wraps tool functions. Handles local PII redaction. Talks to the Gateway over HTTP. |
| Notification Layer | Discord bot by default. Sends interactive Approve / Deny / Modify cards. Extensible to Slack, PagerDuty, or any webhook. |
| Audit Database | Supabase (Postgres). `actions` table = live state machine. `audit_events` table = immutable hash-chained history. Realtime feed powers the dashboard. |
| Dashboard | Next.js web app. Live audit log, chain integrity badge, actor breakdown (AI / Human / System), action detail drawer with full hash chain. |

### 4.2  Data Flow

```
User Prompt
    ↓
Agent (LangChain / CrewAI / custom orchestrator)
    ↓
Tool Call  →  Bastion SDK Gate
                   ├─ [risk=low]  →  Auto-approved → logged → tool executes
                   ├─ [risk=high] →  Frozen → Discord card → Human decides
                   │              ├─ Approved  → agent resumes
                   │              └─ Denied    → agent stops
                   └─ [sensitive] →  Tool runs locally → PII redacted → safe result to LLM
```

### 4.3  Deployment Model

> **Fully self-hosted. No Bastion servers in the data path.**

The Gateway runs in your Docker environment. The audit log lives in your Postgres instance. PII redaction happens entirely on your machine before any external call. This is not a SaaS proxy — your data never touches Bastion's infrastructure.

---

## 5. Business Value

### 5.1  For Security & Compliance Teams

- Deterministic PII protection — not prompt-based, not probabilistic
- Tamper-evident audit chain for every agent action
- Risk policy ownership via YAML — reviewed in PRs, not scattered across agent code
- Auto-deny on timeout — no action stays frozen indefinitely

### 5.2  For Product & Engineering Teams

- One decorator to gate any tool — no agent rewrite required
- Works with LangChain, CrewAI, OpenAI Agents SDK, and custom orchestrators
- Framework-agnostic — the gate wraps the Python function, not the agent
- Local Docker deployment — no external dependencies beyond Supabase and Discord

### 5.3  For Legal & Risk Teams

- SHA-256 chained audit log — tamper detection built in
- Actor-stamped decisions — every approval or denial records AI, human, or system
- Auto-denial records — timed-out actions are denied with timestamp and reason
- Export-ready — full audit chain downloadable for compliance review

---

## 6. Use Cases

### 6.1  Financial Services & Payments

An agent managing expense approvals, payment execution, or wire transfers. Every payment tool is gated at `risk="high"`. The approver's Discord shows the exact amount, recipient, and receipt before money moves. Blocked spend is tracked in the dashboard.

### 6.2  Healthcare & Life Sciences

An agent accessing electronic health records or insurance data. All record-fetch tools are marked `sensitive=True`. Patient names, DOBs, and insurance numbers are redacted locally — the cloud LLM sees only sanitised summaries. The audit chain satisfies HIPAA documentation requirements.

### 6.3  Enterprise IT & DevOps

An agent with access to cloud infrastructure — deploying code, modifying configs, restarting services. Every destructive operation is gated. On-call engineers get a notification card before anything touches production.

### 6.4  Legal & Document Processing

An agent reading contracts and extracting PII for CRM entry. Sensitive fields are redacted before reaching the LLM. The audit log shows exactly what the model saw versus what was on the document — a key distinction for legal defensibility.

### 6.5  Prompt Injection Defense

An agent reading external content — web pages, emails, uploaded documents — that may contain hidden instructions. Bastion intercepts any outbound POST or high-risk action that results, regardless of whether the LLM recognised the injection. The dashboard surfaces a THREAT BLOCKED banner. The human decides.

---

## 7. Market Positioning

### 7.1  The Problem is Getting Worse, Not Better

Agentic AI adoption is accelerating. Every new agent deployment without a trust layer is a liability. Regulatory pressure — EU AI Act, SEC guidance on AI in finance, HIPAA enforcement — is increasing. The window to establish safe deployment practices is now.

### 7.2  Positioning

> *"Bastion SDK is to AI agents what a firewall is to networks — a deterministic, policy-enforced checkpoint between autonomous AI and the real world, deployed inside your perimeter."*

### 7.3  Target Customers

| Segment | Pain Point | Bastion Value |
|---|---|---|
| Enterprise AI teams | Can't get compliance sign-off for agent deployment | Audit trail + PII protection = deployable |
| Security teams | No visibility into what agents are actually doing | Real-time dashboard + tamper-evident log |
| Fintech / payments | Agent errors = financial loss + regulatory fine | Human-in-the-loop on every payment |
| Healthcare | PII to cloud LLMs = HIPAA violation | Local redaction, no PII leaves device |
| Legal & professional services | Agent actions need to be explainable in court | Full audit chain, actor-stamped decisions |
| Developers building agent products | One breach destroys customer trust | Ship safely, iterate faster |

### 7.4  Competitive Differentiation

| Capability | Bastion SDK | Guardrails AI | LangChain callbacks | Cloud safety |
|---|---|---|---|---|
| Human-in-the-loop on actions | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Local PII redaction | ✅ Yes | ⚠️ Partial | ❌ No | ❌ No |
| Tamper-evident audit chain | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Framework-agnostic | ✅ Yes | ⚠️ Partial | LangChain only | Provider-specific |
| Self-hosted | ✅ Yes | ✅ Yes | ✅ Yes | ❌ No |
| Policy-as-code (YAML) | ✅ Yes | ✅ Yes | ❌ No | ❌ No |

---

## 8. Roadmap

### Near-term (0–3 months)

- Slack and PagerDuty notification channels (beyond Discord)
- REST API for decision webhooks — integrate with existing approval workflows
- Compliance report export (PDF) — full audit chain with verification result
- Dashboard role-based access — read-only view for auditors

### Mid-term (3–6 months)

- Risk policy engine — ML-assisted risk classification suggestions
- Multi-agent support — trace decisions across agent handoffs
- Semantic PII redaction — Ollama-powered context-aware redaction beyond regex
- SOC 2 Type II audit preparation

### Long-term (6–12 months)

- Managed cloud option for teams that cannot self-host
- Regulatory compliance packs (HIPAA, GDPR, EU AI Act)
- Agent behaviour analytics — detect drift, anomalies, and policy violations over time

---

## 9. Getting Started

### For Developers

```bash
# Install the SDK
pip install bastion-sdk

# Wrap any tool
from bastion_sdk import gate
gated_tool = gate(my_tool, risk="high", sensitive=True)

# Start the gateway + dashboard
docker compose up
```

### For Security Teams

Define `risk-policies.yaml` at the repo root. Bastion picks it up automatically. No developer changes needed. Policy changes go through standard PR review — security teams own risk classification.

```yaml
# risk-policies.yaml
defaults:
  risk: low
  sensitive: false
tools:
  execute_payment:
    risk: high
    mode: approval
  fetch_patient_record:
    risk: low
    sensitive: true
```

### For Compliance Teams

Run the audit chain verifier at any time. Exit code 0 = verified. Exit code 1 = tampering detected.

```bash
python scripts/verify_audit_chain.py

# Bastion SDK audit-chain verifier
# Walking 142 events from seq #1 ...
#
# Result:
#   ✓ Audit chain VERIFIED across 142 events.
#     No tampering detected.
```

---

## 10. Team & Contact

Built during a 3-day hackathon.

**Prashant Yadav · Vinay Upadhyay · Samiksha Chhabra**

Contact: vinay.upadhyay@linq.com
