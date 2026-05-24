# Bastion SDK — UI Design Specification

End-to-end design for the dashboard, mapped to the Implementation Roadmap. Each screen lists which roadmap items it covers (T1-x, T2-x, T3-x).

---

## Design System

### Colors

| Token | Light | Dark | Usage |
|---|---|---|---|
| `bg-primary` | `#FFFFFF` | `#09090B` (zinc-950) | Page background |
| `bg-surface` | `#FAFAFA` (zinc-50) | `#18181B` (zinc-900) | Card background |
| `border` | `#E4E4E7` (zinc-200) | `#27272A` (zinc-800) | Card borders |
| `text-primary` | `#18181B` | `#FAFAFA` | Headings |
| `text-muted` | `#71717A` | `#A1A1AA` | Subtext, metadata |
| `accent-ok` | `#10B981` (emerald-500) | `#34D399` | Approved, healthy |
| `accent-warn` | `#F59E0B` (amber-500) | `#FBBF24` | Pending, intercepted |
| `accent-danger` | `#EF4444` (red-500) | `#F87171` | Denied, threat blocked |
| `accent-info` | `#0EA5E9` (sky-500) | `#38BDF8` | AI actor, system info |
| `accent-brand` | `#1B3A5C` (navy) | `#2E75B6` | Bastion brand |

### Typography

- **Headings:** `font-semibold` Inter, sizes 2xl / xl / lg
- **Body:** Inter 14px (`text-sm`)
- **Code / IDs / Hashes:** JetBrains Mono 12px (`font-mono text-xs`)

### Spacing

- Page max width: `max-w-7xl` (1280px)
- Page padding: `px-6 py-10`
- Card padding: `p-4` to `p-6`
- Section spacing: `mt-8`

---

## Top-Level Navigation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BASTION    Dashboard  Agents  Policies  Audit  Settings    🌙  Vinay ▾  │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Item | Route | Roadmap |
|---|---|---|
| Dashboard | `/` | existing |
| Agents | `/agents` | existing |
| Policies | `/policies` | T1-3 |
| Audit | `/audit` | T2-3 |
| Settings | `/settings` | T1-2, T1-4, T1-5, T2-4 |

Right side: Chain Integrity Badge · Health Status · Theme Toggle · User menu

---

## Screen 1 — Dashboard (Home)

Covers existing components + T2-2 (agent filter), T2-5 (health), T3-2 (anomaly banner).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BASTION   Dashboard  Agents  Policies  Audit  Settings    🌙  Vinay ▾    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ⚠️  ANOMALY DETECTED — Payment agent denial rate spiked 4x in last 10 min   │ ← T3-2
│     [Investigate]  [Dismiss]                                                 │
│                                                                              │
│ Bastion SDK                              [Chain ✓]  [Health ●]  [Live ●]    │
│ Three-layer trust system for autonomous AI agents                           │
│                                                                              │
│ Agent: [All Agents ▾]   Time: [Last 24h ▾]   Risk: [All ▾]                 │ ← T2-2
│                                                                              │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐             │
│ │  142        │ │  18         │ │  $12,400    │ │  4          │             │
│ │  Actions    │ │  Pending    │ │  Spend Held │ │  Threats    │             │
│ │  total      │ │  approval   │ │  blocked    │ │  blocked    │             │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘             │
│                                                                              │
│ ┌─ THREAT BLOCKED ────────────────────────────────────────────────────────┐ │
│ │ 🚨 Prompt injection from external URL — blocked at execute_payment()    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ WHAT CLAUDE SAW ───────────────────────────────────────────────────────┐ │
│ │ Original:   "Patient John Doe, SSN 123-45-6789, prescribed lisinopril"  │ │
│ │ Redacted:   "Patient [NAME], SSN [SSN], prescribed [MEDICATION]"        │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ ACTOR BREAKDOWN ───────────────────────────────────────────────────────┐ │
│ │ AI       ████████████░░░░░░░░  58%   82 decisions                       │ │
│ │ Human    ██████░░░░░░░░░░░░░░  31%   44 decisions                       │ │
│ │ System   ███░░░░░░░░░░░░░░░░░  11%   16 decisions                       │ │
│ │                                                                          │ │
│ │ ✅ 124 Approved   ❌ 14 Denied   🛡️ 31 PII redacted   🚨 4 Threats    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ AUDIT TABLE ───────────────────────────────────────────────────────────┐ │
│ │ Time      Tool              Agent          Risk    Status   Cost        │ │
│ │ 14:32:07  execute_payment   payment-v2     HIGH    ✓ apprvd $5,000     │ │
│ │ 14:30:11  fetch_record      health-v1      LOW     ✓ apprvd —           │ │
│ │ 14:28:54  delete_user       admin-v1       HIGH    ✗ denied $0          │ │
│ │ 14:27:02  send_email        outreach-v3    LOW     ✓ apprvd —           │ │
│ │                                                            [View all →] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ DECISION TRAIL ────────────────────────────────────────────────────────┐ │
│ │ Time      Action     Ver  Actor    Decision               Detail        │ │
│ │ 14:32:08  a3f...     v3   HUMAN    approval / approved    by:vinay      │ │
│ │ 14:32:07  a3f...     v2   SYSTEM   intercept / paused     amount=5000   │ │
│ │ 14:32:07  a3f...     v1   AI       gate / intercepted     tool=payment  │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 2 — Action Detail Drawer

Slides in from right when a row is clicked. Covers T3-1 (multi-agent trace).

```
                              ┌────────────────────────────────────────────────┐
                              │  Action a3f4-b2c1-9d8e         [Copy] [Close ✕]│
                              │  ────────────────────────────────────────────  │
                              │                                                │
                              │  execute_payment                               │
                              │  payment-agent-v2  ·  HIGH RISK  ·  $5,000    │
                              │                                                │
                              │  Tool Arguments                                │
                              │  ┌──────────────────────────────────────────┐ │
                              │  │ {                                        │ │
                              │  │   "amount": 5000,                        │ │
                              │  │   "recipient": "Acme Vendor Inc",        │ │
                              │  │   "currency": "USD"                      │ │
                              │  │ }                                        │ │
                              │  └──────────────────────────────────────────┘ │
                              │                                                │
                              │  Trace Tree                          T3-1 ──→  │
                              │  ┌──────────────────────────────────────────┐ │
                              │  │ ▾ orchestrator-agent  (a3f4...)          │ │
                              │  │   └─ ▾ payment-agent  (b2c1...)          │ │
                              │  │       └─ execute_payment ← THIS          │ │
                              │  └──────────────────────────────────────────┘ │
                              │                                                │
                              │  Timeline                                      │
                              │  ┌──────────────────────────────────────────┐ │
                              │  │ ●  v1  14:32:07  AI                      │ │
                              │  │    intercepted (genesis)                 │ │
                              │  │    hash: 8f3a...e2b1  [Copy]             │ │
                              │  │                                          │ │
                              │  │ ●  v2  14:32:07  SYSTEM                  │ │
                              │  │    Slack notification sent               │ │
                              │  │    prev: 8f3a...e2b1                     │ │
                              │  │    hash: c1d4...9f8e                     │ │
                              │  │                                          │ │
                              │  │ ●  v3  14:32:08  HUMAN (vinay)           │ │
                              │  │    approved                              │ │
                              │  │    prev: c1d4...9f8e                     │ │
                              │  │    hash: a90b...5c2f                     │ │
                              │  └──────────────────────────────────────────┘ │
                              │                                                │
                              │  [Re-verify chain] [Export this action JSON]  │
                              └────────────────────────────────────────────────┘
```

---

## Screen 3 — Agents (Launcher)

Unified prompt input with examples. Covers existing T2-6 examples link.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BASTION   Dashboard  Agents  Policies  Audit  Settings    🌙  Vinay ▾    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Agent Launcher                                                               │
│ Run autonomous agents end-to-end. Bastion gates every tool call.            │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  What should the agent do?                                              │ │
│ │  ┌────────────────────────────────────────────────────────────────────┐ │ │
│ │  │ Buy the domain bastion.dev for under $20                           │ │ │
│ │  │                                                                    │ │ │
│ │  └────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                          │ │
│ │  Quick prompts:                                                          │ │
│ │  [🛒 Buy a domain]  [🏦 Read bank transactions]                         │ │
│ │  [💉 Research news]  [⚠️ Unsafe injection demo]                         │ │
│ │                                                                          │ │
│ │  Mode:  ◉ Safe (Bastion enabled)    ○ Unsafe (no gating)               │ │
│ │                                                                          │ │
│ │                                                       [⌘ Enter] [▶ Run] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ Live Log ──────────────────────────────────────────────────────────────┐ │
│ │ [14:32:01] Starting agent...                                            │ │
│ │ [14:32:02] LLM call → tool: search_domain("bastion.dev")                │ │
│ │ [14:32:03] [gate] search_domain → low risk, auto-approved              │ │
│ │ [14:32:04] LLM call → tool: check_price("bastion.dev")                  │ │
│ │ [14:32:05] [gate] check_price → low risk, auto-approved                 │ │
│ │ [14:32:06] LLM call → tool: execute_purchase("bastion.dev", 18)         │ │
│ │ [14:32:07] [gate] execute_purchase → HIGH risk, FROZEN                  │ │
│ │ [14:32:07] Waiting for human approval...                                │ │
│ │                                                              [Stop ■]   │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 4 — Policies (T1-3)

YAML editor with validation, tool list, and policy preview.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BASTION   Dashboard  Agents  Policies  Audit  Settings    🌙  Vinay ▾    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Risk Policies                                          [Validate] [Save]    │
│ Define which tools are high-risk and which handle PII.                      │
│                                                                              │
│ ┌─ bastion-policy.yaml ──────────────────────────────────────────────────┐  │
│ │  1  version: 1                                                         │  │
│ │  2                                                                     │  │
│ │  3  defaults:                                                          │  │
│ │  4    risk: low                                                        │  │
│ │  5    sensitive: false                                                 │  │
│ │  6    mode: approval                                                   │  │
│ │  7                                                                     │  │
│ │  8  notifications:                                                     │  │
│ │  9    channel: slack                                                   │  │
│ │ 10    webhook_url: https://hooks.slack.com/xxx                         │  │
│ │ 11                                                                     │  │
│ │ 12  tools:                                                             │  │
│ │ 13    execute_payment:                                                 │  │
│ │ 14      risk: high       ◀── ⚠️ this gates the tool                   │  │
│ │ 15      mode: approval                                                 │  │
│ │ 16    fetch_patient_record:                                            │  │
│ │ 17      sensitive: true                                                │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│ ┌─ Tool Coverage ───────────────────────────────────────────────────────┐   │
│ │ Tool                     Risk     Sensitive  Mode       Used (30d)   │   │
│ │ execute_payment          🔴 HIGH  ○          approval     142x       │   │
│ │ fetch_patient_record     🟢 low   ✅ yes     approval      82x       │   │
│ │ delete_record            🔴 HIGH  ✅ yes     approval      14x       │   │
│ │ search_web               🟢 low   ○          monitor     1,032x      │   │
│ │ ⚠ send_email             ⚪ —     ○          (using defaults)  47x   │   │
│ └────────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│ ✅ Policy validated · last applied 2 minutes ago by vinay@bastion.com       │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 5 — Audit Export (T2-3)

Compliance report builder with date range, filters, and format choice.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BASTION   Dashboard  Agents  Policies  Audit  Settings    🌙  Vinay ▾    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ Compliance Export                                                            │
│ Generate audit reports for regulators, internal review, or legal counsel.   │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │  Date Range                                                              │ │
│ │  From [2026-04-01]  To [2026-04-30]    [Last 7d] [30d] [90d] [Custom]  │ │
│ │                                                                          │ │
│ │  Filters                                                                 │ │
│ │  Agent:    [All Agents ▾]                                                │ │
│ │  Tool:     [All Tools ▾]                                                 │ │
│ │  Decision: [All ▾]   ○ Approved  ○ Denied  ○ Threats blocked            │ │
│ │                                                                          │ │
│ │  Format                                                                  │ │
│ │  ◉ PDF (signed, ready for auditors)                                      │ │
│ │  ○ JSON (raw events, full hash chain)                                    │ │
│ │  ○ CSV (tabular, for spreadsheets)                                       │ │
│ │                                                                          │ │
│ │  Includes:                                                               │ │
│ │  ✅ Cover page with chain verification result                            │ │
│ │  ✅ Summary statistics (totals, breakdown)                               │ │
│ │  ✅ Actor breakdown chart                                                │ │
│ │  ✅ Full event table with truncated hashes                               │ │
│ │  ☐ Include raw tool arguments (recommended off for HIPAA)               │ │
│ │                                                                          │ │
│ │                                                       [Generate Export] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│ ┌─ Recent Exports ────────────────────────────────────────────────────────┐ │
│ │ Generated         Range            Format   Size      Status            │ │
│ │ 14:32  vinay      Apr 1 – Apr 30   PDF      2.4 MB    ✓ ready  [⬇]    │ │
│ │ 13:18  auditor    Q1 2026          JSON     8.1 MB    ✓ ready  [⬇]    │ │
│ │ 11:02  auditor    Mar 1 – Mar 31   PDF      1.9 MB    ✓ ready  [⬇]    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 6 — Settings (T1-2, T1-4, T1-5, T2-4)

Tabbed settings page for all configuration.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 🛡️ BASTION   Dashboard  Agents  Policies  Audit  Settings    🌙  Vinay ▾    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ API Keys │ Notifications │ Redaction │ Team │ Webhooks │ Gateway        │ │
│ └──────────┴───────────────┴───────────┴──────┴──────────┴────────────────┘ │
│                                                                              │
│ ── TAB: API Keys ────────────────────────────────────────  T1-2 ───        │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ API Keys                                              [+ Generate new]   │ │
│ │ Used by your SDK to authenticate with the Gateway.                       │ │
│ │                                                                          │ │
│ │  Name              Key prefix       Last used   Created       Actions    │ │
│ │  payment-prod      sk-live-7f3a…   2 min ago   2026-03-12   [Revoke]   │ │
│ │  payment-staging   sk-live-c1e9…   1 day ago   2026-02-28   [Revoke]   │ │
│ │  analytics-dev     sk-live-9b22…   never       2026-04-30   [Revoke]   │ │
│ │                                                                          │ │
│ │  ⚠️ Revoked keys remain valid for 24 hours to allow rotation.           │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                                                                              │
│ ── TAB: Notifications (T1-4) ───────────────────────────────────────        │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Discord    ● Connected     Channel: #bastion-alerts        [Edit] [⨯]   │ │
│ │ Slack      ● Connected     Channel: #ai-approvals          [Edit] [⨯]   │ │
│ │ PagerDuty  ○ Not configured                                  [+ Connect] │ │
│ │ Email      ○ Not configured                                  [+ Connect] │ │
│ │ Webhook    ○ Not configured                                  [+ Connect] │ │
│ │                                                                          │ │
│ │ Routing rules                                                            │ │
│ │ ┌──────────────────────────────────────────────────────────────────┐    │ │
│ │ │ if risk == high       → notify Slack + Discord                   │    │ │
│ │ │ if anomaly_detected   → notify PagerDuty                         │    │ │
│ │ │ if threat_blocked     → notify Slack + email security@…          │    │ │
│ │ └──────────────────────────────────────────────────────────────────┘    │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                                                                              │
│ ── TAB: Redaction (T1-5) ───────────────────────────────────────────        │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ PII Redaction Backend                                                    │ │
│ │                                                                          │ │
│ │ ◉ Regex      Fast, deterministic, catches emails/cards/SSN/phone        │ │
│ │ ○ Ollama     Semantic, context-aware, requires local LLM                │ │
│ │ ○ Custom     Provide your own Python class                              │ │
│ │                                                                          │ │
│ │ ── Ollama Configuration ─────────────────────────────────────────        │ │
│ │ Endpoint:  [http://localhost:11434              ]                       │ │
│ │ Model:     [llama3.2 ▾]                                                  │ │
│ │ Status:    ● Reachable · 1.2GB loaded · avg 340ms                       │ │
│ │ Fallback:  ✅ Use regex if Ollama is unreachable                         │ │
│ │                                                                          │ │
│ │ ── Test ─────────────────────────────────────────────────────────────    │ │
│ │ Input:    "Patient John Doe, DOB 1985-03-12, card 4111-1111-1111-1111"  │ │
│ │ Output:   "Patient [NAME], DOB [DATE_OF_BIRTH], card [CARD]"             │ │
│ │           Detected: NAME, DATE_OF_BIRTH, CARD                            │ │
│ │                                                          [Run test]      │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│                                                                              │
│ ── TAB: Team (T2-4) ────────────────────────────────────────────────        │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Team Access                                              [+ Invite user] │ │
│ │                                                                          │ │
│ │ Email                          Role         Last active     Actions      │ │
│ │ vinay@bastion.com              Admin        now             [Edit]      │ │
│ │ samiksha@bastion.com           Admin        2 hours ago     [Edit]      │ │
│ │ ops@acme.com                   Approver     1 day ago       [Edit]      │ │
│ │ auditor@acme.com               Auditor      3 days ago      [Edit]      │ │
│ │ dev@acme.com                   Developer    1 hour ago      [Edit]      │ │
│ │                                                                          │ │
│ │ Roles                                                                    │ │
│ │ • Admin     — full access, approve/deny, manage settings                 │ │
│ │ • Approver  — approve/deny only, no settings access                      │ │
│ │ • Auditor   — read-only, can run compliance exports                      │ │
│ │ • Developer — read-only view of their own agent's actions                │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 7 — Gateway Status (T2-5)

Health dashboard with component-level diagnostics.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ── TAB: Gateway ────────────────────────────────────────────────────         │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────────┐ │
│ │ Gateway Status                              ● All systems operational    │ │
│ │ v1.2.0  ·  uptime 14d 3h  ·  127 actions/hour                           │ │
│ │                                                                          │ │
│ │ Components                                                               │ │
│ │ ┌────────────────────────────────────────────────────────────────────┐  │ │
│ │ │ ● Database (Supabase)        12ms p95          ok                  │  │ │
│ │ │ ● Notifier (Slack)           89ms p95          ok                  │  │ │
│ │ │ ● Redactor (Ollama)         340ms p95          ok                  │  │ │
│ │ │ ● Audit chain                last verify 30s ago  ✓ integrity ok   │  │ │
│ │ │ ● Stale sweeper              last run 47s ago     2 actions denied │  │ │
│ │ └────────────────────────────────────────────────────────────────────┘  │ │
│ │                                                                          │ │
│ │ Settings                                                                 │ │
│ │ Approval timeout      [600 ] seconds  (auto-deny after this)            │ │
│ │ Fallback on down      [deny ▾]  (when Gateway is unreachable)           │ │
│ │ HTTP timeout          [5   ] seconds                                    │ │
│ │ Retry attempts        [3   ]                                            │ │
│ │ Log level             [INFO ▾]                                          │ │
│ │                                                          [Save changes] │ │
│ └──────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Screen 8 — Login / Onboarding

Initial setup wizard for new deployments.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│                              🛡️                                              │
│                                                                              │
│                          BASTION SDK                                         │
│                The trust layer for autonomous AI agents                      │
│                                                                              │
│         ─────────────────────────────────────────────────────────────       │
│                                                                              │
│                          Step 1 of 3                                         │
│                                                                              │
│         Connect your Supabase project                                        │
│                                                                              │
│         Supabase URL                                                         │
│         [https://your-project.supabase.co              ]                    │
│                                                                              │
│         Service Role Key                                                     │
│         [ ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●● ] [Test connection]         │
│                                                                              │
│         ✓ Connection successful · 0 tables found                             │
│         ✓ Migrations will be applied on continue                             │
│                                                                              │
│                                                       [Skip]  [Continue →]  │
│                                                                              │
│         ─────────────────────────────────────────────────────────────       │
│                                                                              │
│                          Step 2 of 3 — Notifications                         │
│         Step 3 of 3 — Generate first API key                                 │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Library — Shared Pieces

### Chain Integrity Badge (existing, refined)

```
[ ✓ Chain verified · 142 events ]      ← ok state, emerald
[ ⏳ Verifying… ]                       ← loading
[ ⚠ Chain BROKEN at seq #87 ]          ← danger state, pulsing red
```

### Health Status Pill (new — T2-5)

```
[ ● All systems ok ]                   ← emerald, all components ok
[ ● Degraded · Slack down ]            ← amber, partial outage
[ ● Down ]                             ← red
```

### Risk Pill

```
[ HIGH ]   ← red, payment / delete
[ MED ]    ← amber
[ LOW ]    ← green
```

### Actor Pill

```
[ AI ]      ← sky-500
[ HUMAN ]   ← amber-500
[ SYSTEM ]  ← zinc-500
```

### Decision Pill

```
[ ✓ approved ]    [ ✗ denied ]    [ 🛡️ redacted ]    [ 🚨 blocked ]
```

### Anomaly Banner (new — T3-2)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⚠️  ANOMALY DETECTED — High-risk denial spike (4x normal)                │
│     payment-agent denied 12 of last 14 calls in 10 minutes               │
│     [Investigate]  [Mute 1h]  [Dismiss]                                  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Page → Roadmap Coverage Map

| Page / Component | Roadmap Items |
|---|---|
| Dashboard (Home) | existing + T2-2, T2-5, T3-2 |
| Action Detail Drawer | existing + T3-1 |
| Agents (Launcher) | existing + T2-6 examples |
| Policies | T1-3 |
| Audit Export | T2-3 |
| Settings → API Keys | T1-2 |
| Settings → Notifications | T1-4 |
| Settings → Redaction | T1-5 |
| Settings → Team | T2-4 |
| Settings → Gateway | T2-5, T1-6 |
| Onboarding wizard | T1-7 (migrations) |
| Anomaly banner | T3-2 |

---

## Build Order for the UI

To match the implementation tiers:

**Phase 1 (Month 1 UI)** — covers T1 items
- Settings page skeleton with tabs
- API Keys tab (generate, list, revoke)
- Notifications tab (Discord/Slack toggle + config)
- Redaction tab (regex/Ollama selector + test)
- Policies page (YAML editor + tool coverage table)
- Onboarding wizard

**Phase 2 (Month 2 UI)** — covers T2 items
- Audit Export page
- Team tab with RBAC
- Gateway tab with health + settings
- Agent filter dropdown on Dashboard
- Health status pill in nav bar

**Phase 3 (Month 3 UI)** — covers T3 items
- Anomaly banner on Dashboard
- Trace Tree view in Action Drawer
- Per-agent breakdown in ActorBreakdown
- Webhook tab in Settings
