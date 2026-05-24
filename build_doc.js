const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak, LevelFormat,
  TableOfContents,
} = require("docx");
const fs = require("fs");

// ── Colours ──────────────────────────────────────────────────────────────────
const NAVY   = "1B3A5C";
const ACCENT = "2E75B6";
const LIGHT  = "EBF3FB";
const GRAY   = "F2F2F2";
const WHITE  = "FFFFFF";
const BLACK  = "000000";
const RED_BG = "FDE8E8";
const RED_BD = "C0392B";

// ── Helpers ───────────────────────────────────────────────────────────────────
const border = (color = "CCCCCC") => ({ style: BorderStyle.SINGLE, size: 4, color });
const allBorders = (color = "CCCCCC") => ({ top: border(color), bottom: border(color), left: border(color), right: border(color) });
const noBorder   = () => ({ style: BorderStyle.NONE, size: 0, color: WHITE });
const allNoBorder = () => ({ top: noBorder(), bottom: noBorder(), left: noBorder(), right: noBorder() });

function h(text, level, opts = {}) {
  return new Paragraph({
    heading: level,
    spacing: { before: level === HeadingLevel.HEADING_1 ? 360 : 240, after: 120 },
    ...opts,
    children: [new TextRun({ text, bold: true, font: "Arial",
      size:  level === HeadingLevel.HEADING_1 ? 32 :
             level === HeadingLevel.HEADING_2 ? 28 : 24,
      color: NAVY })],
  });
}

function p(text, opts = {}) {
  const runs = typeof text === "string"
    ? [new TextRun({ text, font: "Arial", size: 22, color: "222222" })]
    : text;
  return new Paragraph({ spacing: { before: 80, after: 120 }, ...opts, children: runs });
}

function bullet(text, ref = "bullets") {
  return new Paragraph({
    numbering: { reference: ref, level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 22, color: "222222" })],
  });
}

function gap(n = 1) {
  return Array.from({ length: n }, () => new Paragraph({ children: [new TextRun("")] }));
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function codeBlock(lines) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: allBorders("CCCCCC"),
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: GRAY, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 160, right: 160 },
        children: lines.map(l => new Paragraph({
          spacing: { before: 20, after: 20 },
          children: [new TextRun({ text: l, font: "Courier New", size: 18, color: "1A1A1A" })],
        })),
      })],
    })],
  });
}

function callout(rows, fillColor = LIGHT, borderColor = ACCENT) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders: allBorders(borderColor),
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: fillColor, type: ShadingType.CLEAR },
        margins: { top: 120, bottom: 120, left: 200, right: 200 },
        children: rows,
      })],
    })],
  });
}

function sectionLabel(text) {
  return new Paragraph({
    spacing: { before: 40, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 20, bold: true, color: WHITE,
      highlight: undefined, shading: { fill: NAVY } })],
  });
}

// Data table helper
function dataTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const headerRow = new TableRow({
    children: headers.map((h, i) => new TableCell({
      borders: allBorders(ACCENT),
      width: { size: colWidths[i], type: WidthType.DXA },
      shading: { fill: NAVY, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text: h, font: "Arial", size: 20, bold: true, color: WHITE })],
      })],
    })),
  });
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      borders: allBorders("CCCCCC"),
      width: { size: colWidths[ci], type: WidthType.DXA },
      shading: { fill: ri % 2 === 0 ? WHITE : "F7FAFD", type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({ text: cell, font: "Arial", size: 20, color: "222222" })],
      })],
    })),
  }));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [headerRow, ...dataRows],
  });
}

// ── Document ──────────────────────────────────────────────────────────────────
const doc = new Document({
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•",
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ],
  },
  sections: [
    // ════════════════════════════════════════════════════════════════════
    // SECTION A — Cover page (no header/footer)
    // ════════════════════════════════════════════════════════════════════
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      children: [
        ...gap(6),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 80 },
          children: [new TextRun({ text: "BASTION SDK", font: "Arial", size: 72, bold: true, color: NAVY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 200 },
          children: [new TextRun({ text: "The Trust & Safety Layer for Autonomous AI Agents", font: "Arial", size: 32, color: ACCENT })],
        }),
        // Divider
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ACCENT, space: 1 } },
          children: [new TextRun("")],
        }),
        ...gap(1),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 480 },
          children: [new TextRun({
            text: "Before your AI agent does something irreversible — Bastion stops it, asks a human, and writes it down.",
            font: "Arial", size: 26, italics: true, color: "444444",
          })],
        }),
        ...gap(8),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
          children: [new TextRun({ text: "Prashant Yadav  ·  Vinay Upadhyay  ·  Samiksha Chhabra", font: "Arial", size: 20, color: "666666" })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "vinay.upadhyay@linq.com", font: "Arial", size: 20, color: ACCENT })],
        }),
        pageBreak(),
      ],
    },

    // ════════════════════════════════════════════════════════════════════
    // SECTION B — TOC + body (with header/footer)
    // ════════════════════════════════════════════════════════════════════
    {
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 1 } },
            children: [
              new TextRun({ text: "BASTION SDK", font: "Arial", size: 18, bold: true, color: NAVY }),
              new TextRun({ text: "  —  Stakeholder & Product Brief", font: "Arial", size: 18, color: "666666" }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "Page ", font: "Arial", size: 18, color: "888888" }),
              new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "888888" }),
              new TextRun({ text: " of ", font: "Arial", size: 18, color: "888888" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: "888888" }),
            ],
          })],
        }),
      },
      children: [
        // ── Table of Contents ──────────────────────────────────────────
        h("Table of Contents", HeadingLevel.HEADING_1),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        pageBreak(),

        // ── 1. Executive Summary ───────────────────────────────────────
        h("1. Executive Summary", HeadingLevel.HEADING_1),
        p("AI agents are no longer experimental. They book travel, execute payments, access databases, send emails, and manage infrastructure — autonomously. The problem is that the failure mode has shifted from “says something wrong” to “does something irreversible.”"),
        ...gap(1),
        p("Bastion SDK is a developer-first trust layer that sits between an AI agent and the real world. It freezes high-risk actions before execution, routes them to a human for approval, redacts sensitive PII locally before any cloud LLM sees it, and writes every decision to a tamper-evident audit chain."),
        ...gap(1),
        callout([
          new Paragraph({
            spacing: { before: 40, after: 40 },
            children: [new TextRun({ text: "One decorator.  Three guarantees.  Zero changes to the agent’s core logic.", font: "Arial", size: 24, bold: true, color: NAVY })],
          }),
        ], LIGHT, ACCENT),
        pageBreak(),

        // ── 2. The Problem ─────────────────────────────────────────────
        h("2. The Problem", HeadingLevel.HEADING_1),

        h("2.1  The Replit Incident — and Why It Will Happen Again", HeadingLevel.HEADING_2),
        p("In July 2025, Replit’s autonomous coding AI deleted a customer’s production database. The CEO issued a public apology. No safety layer caught the action before it happened — there was no human checkpoint, no audit trail, no PII protection."),
        ...gap(1),
        p("This is not an isolated incident. As AI agents gain access to real tools — payment APIs, file systems, databases, external services — the blast radius of a single bad decision grows from “embarrassing tweet” to “irreversible financial or legal damage.”"),
        ...gap(1),

        h("2.2  The Three Failure Modes of Autonomous Agents", HeadingLevel.HEADING_2),
        callout([
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "FAILURE MODE 1 — Unchecked High-Risk Actions", font: "Arial", size: 22, bold: true, color: RED_BD })] }),
          new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: "Agents execute payments, deletions, and data transfers without human review. By the time a human notices, the action is done.", font: "Arial", size: 22, color: "222222" })] }),
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "FAILURE MODE 2 — PII Reaching Cloud LLMs", font: "Arial", size: 22, bold: true, color: RED_BD })] }),
          new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: "Sensitive data — credentials, medical records, financial transactions, personal identifiers — is passed directly to third-party AI APIs. This violates GDPR, HIPAA, and basic data residency requirements.", font: "Arial", size: 22, color: "222222" })] }),
          new Paragraph({ spacing: { before: 60, after: 20 }, children: [new TextRun({ text: "FAILURE MODE 3 — No Audit Trail", font: "Arial", size: 22, bold: true, color: RED_BD })] }),
          new Paragraph({ spacing: { before: 0, after: 40 }, children: [new TextRun({ text: "When an agent causes a problem, there is no tamper-evident record of what happened, who decided, and in what order. Legal and compliance teams have nothing to work with.", font: "Arial", size: 22, color: "222222" })] }),
        ], RED_BG, RED_BD),
        ...gap(1),

        h("2.3  Why Existing Solutions Don’t Work", HeadingLevel.HEADING_2),
        dataTable(
          ["Approach", "Why It Fails"],
          [
            ["Cloud-side safety filters",  "Catch text outputs, not tool actions"],
            ["Prompt engineering",         "Brittle — bypassed by prompt injection"],
            ["Manual review processes",    "No tooling, no PII protection, no audit trail"],
            ["Agent framework guardrails", "Framework-specific, no legal-grade auditability"],
          ],
          [4200, 5160]
        ),
        pageBreak(),

        // ── 3. The Solution ────────────────────────────────────────────
        h("3. The Solution — Bastion SDK", HeadingLevel.HEADING_1),

        h("3.1  How It Works", HeadingLevel.HEADING_2),
        p("Bastion SDK wraps any tool function with a single decorator. When the agent calls a gated tool, Bastion intercepts the call, classifies its risk, and decides what to do — all before the tool executes."),
        ...gap(1),
        codeBlock([
          "from bastion_sdk import gate",
          "",
          "# High-risk: freezes agent, pings human for approval",
          "gated_payment  = gate(execute_payment,       risk=\"high\", sensitive=False)",
          "",
          "# Sensitive: PII redacted locally, cloud LLM sees only [NAME], [CARD]",
          "gated_records  = gate(fetch_patient_record,  risk=\"low\",  sensitive=True)",
          "",
          "# Low-risk: auto-approved, still logged to the audit chain",
          "gated_search   = gate(search_web,            risk=\"low\")",
        ]),
        ...gap(1),

        h("3.2  The Three Layers", HeadingLevel.HEADING_2),

        h("Layer 1 — PII Never Leaves the Device", HeadingLevel.HEADING_3),
        callout([
          p("Tools marked sensitive=True route their output through a local redactor before the result reaches the cloud LLM. Names, addresses, card numbers, OTP codes, credentials — stripped on your machine. The cloud model only sees [NAME], [CARD], [EMAIL]. Enforced deterministically, not by prompting the LLM to “be careful.”"),
        ], LIGHT, ACCENT),
        ...gap(1),

        h("Layer 2 — Risky Actions Wait for a Human", HeadingLevel.HEADING_3),
        callout([
          p("Tools marked risk=\"high\" freeze the agent mid-execution. A rich notification card lands on Discord within ~2 seconds. The human can:"),
          bullet("Approve — agent resumes with the original parameters"),
          bullet("Deny — agent receives a DENIED response and stops"),
          bullet("Modify Budget — human changes a constraint and the agent adapts"),
          ...gap(1),
          p("If no human responds within the configured timeout (default: 10 minutes), the action is automatically denied with a timestamped reason."),
        ], LIGHT, ACCENT),
        ...gap(1),

        h("Layer 3 — Every Decision Is Auditable", HeadingLevel.HEADING_3),
        callout([
          p("Every state transition — intercepted, approved, denied, redacted, threat blocked — is written to an append-only audit chain. Each row’s hash is SHA-256(event_data + previous_row_hash). Tampering with any row breaks the chain. A verification script detects it instantly. The log is legally defensible."),
        ], LIGHT, ACCENT),
        ...gap(1),

        h("3.3  Policy Ownership", HeadingLevel.HEADING_2),
        p("Security and compliance teams own risk classification — not developers. A risk-policies.yaml file defines which tools are high-risk, which handle PII, and what the defaults are. Developers write gate(my_tool) and pick up the policy automatically. Policy changes go through standard PR review."),
        pageBreak(),

        // ── 4. Architecture ────────────────────────────────────────────
        h("4. Architecture", HeadingLevel.HEADING_1),

        h("4.1  System Components", HeadingLevel.HEADING_2),
        dataTable(
          ["Component", "Role"],
          [
            ["Bastion Gateway",    "FastAPI service inside your infrastructure. Manages freeze/resume state machine, runs the notification bot, writes the audit log."],
            ["Bastion SDK",        "Python package (pip install bastion-sdk). Wraps tool functions. Handles local PII redaction. Talks to the Gateway over HTTP."],
            ["Notification Layer", "Discord bot by default. Sends interactive Approve / Deny / Modify cards. Extensible to Slack, PagerDuty, or any webhook."],
            ["Audit Database",     "Supabase (Postgres). actions table = live state machine. audit_events table = immutable hash-chained history. Realtime feed powers the dashboard."],
            ["Dashboard",         "Next.js web app. Live audit log, chain integrity badge, actor breakdown (AI / Human / System), action detail drawer with full hash chain."],
          ],
          [2800, 6560]
        ),
        ...gap(1),

        h("4.2  Data Flow", HeadingLevel.HEADING_2),
        codeBlock([
          "User Prompt",
          "    ↓",
          "Agent (LangChain / CrewAI / custom orchestrator)",
          "    ↓",
          "Tool Call  →  Bastion SDK Gate",
          "                   ├─ [risk=low]  →  Auto-approved → logged → tool executes",
          "                   ├─ [risk=high] →  Frozen → Discord card → Human decides",
          "                   │              ├─ Approved  → agent resumes",
          "                   │              └─ Denied    → agent stops",
          "                   └─ [sensitive] →  Tool runs locally → PII redacted → safe result to LLM",
        ]),
        ...gap(1),

        h("4.3  Deployment Model", HeadingLevel.HEADING_2),
        callout([
          new Paragraph({ spacing: { before: 40, after: 60 }, children: [new TextRun({ text: "Fully self-hosted. No Bastion servers in the data path.", font: "Arial", size: 24, bold: true, color: NAVY })] }),
          p("The Gateway runs in your Docker environment. The audit log lives in your Postgres instance. PII redaction happens entirely on your machine before any external call. This is not a SaaS proxy — your data never touches Bastion’s infrastructure."),
        ], LIGHT, ACCENT),
        pageBreak(),

        // ── 5. Business Value ──────────────────────────────────────────
        h("5. Business Value", HeadingLevel.HEADING_1),

        h("5.1  For Security & Compliance Teams", HeadingLevel.HEADING_2),
        bullet("Deterministic PII protection — not prompt-based, not probabilistic"),
        bullet("Tamper-evident audit chain for every agent action"),
        bullet("Risk policy ownership via YAML — reviewed in PRs, not scattered across agent code"),
        bullet("Auto-deny on timeout — no action stays frozen indefinitely"),
        ...gap(1),

        h("5.2  For Product & Engineering Teams", HeadingLevel.HEADING_2),
        bullet("One decorator to gate any tool — no agent rewrite required"),
        bullet("Works with LangChain, CrewAI, OpenAI Agents SDK, and custom orchestrators"),
        bullet("Framework-agnostic — the gate wraps the Python function, not the agent"),
        bullet("Local Docker deployment — no external dependencies beyond Supabase and Discord"),
        ...gap(1),

        h("5.3  For Legal & Risk Teams", HeadingLevel.HEADING_2),
        bullet("SHA-256 chained audit log — tamper detection built in"),
        bullet("Actor-stamped decisions — every approval or denial records AI, human, or system"),
        bullet("Auto-denial records — timed-out actions are denied with timestamp and reason"),
        bullet("Export-ready — full audit chain downloadable for compliance review"),
        pageBreak(),

        // ── 6. Use Cases ───────────────────────────────────────────────
        h("6. Use Cases", HeadingLevel.HEADING_1),

        h("6.1  Financial Services & Payments", HeadingLevel.HEADING_2),
        p("An agent managing expense approvals, payment execution, or wire transfers. Every payment tool is gated at risk=\"high\". The approver’s Discord shows the exact amount, recipient, and receipt before money moves. Blocked spend is tracked in the dashboard."),
        ...gap(1),

        h("6.2  Healthcare & Life Sciences", HeadingLevel.HEADING_2),
        p("An agent accessing electronic health records or insurance data. All record-fetch tools are marked sensitive=True. Patient names, DOBs, and insurance numbers are redacted locally — the cloud LLM sees only sanitised summaries. The audit chain satisfies HIPAA documentation requirements."),
        ...gap(1),

        h("6.3  Enterprise IT & DevOps", HeadingLevel.HEADING_2),
        p("An agent with access to cloud infrastructure — deploying code, modifying configs, restarting services. Every destructive operation is gated. On-call engineers get a notification card before anything touches production."),
        ...gap(1),

        h("6.4  Legal & Document Processing", HeadingLevel.HEADING_2),
        p("An agent reading contracts and extracting PII for CRM entry. Sensitive fields are redacted before reaching the LLM. The audit log shows exactly what the model saw versus what was on the document — a key distinction for legal defensibility."),
        ...gap(1),

        h("6.5  Prompt Injection Defense", HeadingLevel.HEADING_2),
        p("An agent reading external content — web pages, emails, uploaded documents — that may contain hidden instructions. Bastion intercepts any outbound POST or high-risk action that results, regardless of whether the LLM recognised the injection. The dashboard surfaces a THREAT BLOCKED banner. The human decides."),
        pageBreak(),

        // ── 7. Market Positioning ──────────────────────────────────────
        h("7. Market Positioning", HeadingLevel.HEADING_1),

        h("7.1  The Problem is Getting Worse, Not Better", HeadingLevel.HEADING_2),
        p("Agentic AI adoption is accelerating. Every new agent deployment without a trust layer is a liability. Regulatory pressure — EU AI Act, SEC guidance on AI in finance, HIPAA enforcement — is increasing. The window to establish safe deployment practices is now."),
        ...gap(1),

        h("7.2  Positioning", HeadingLevel.HEADING_2),
        callout([
          new Paragraph({ spacing: { before: 40, after: 40 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: "“Bastion SDK is to AI agents what a firewall is to networks — a deterministic, policy-enforced checkpoint between autonomous AI and the real world, deployed inside your perimeter.”", font: "Arial", size: 24, bold: true, italics: true, color: NAVY }),
          ]}),
        ], LIGHT, ACCENT),
        ...gap(1),

        h("7.3  Target Customers", HeadingLevel.HEADING_2),
        dataTable(
          ["Segment", "Pain Point", "Bastion Value"],
          [
            ["Enterprise AI teams",              "Can’t get compliance sign-off for agent deployment",  "Audit trail + PII protection = deployable"],
            ["Security teams",                   "No visibility into what agents are actually doing",       "Real-time dashboard + tamper-evident log"],
            ["Fintech / payments",               "Agent errors = financial loss + regulatory fine",         "Human-in-the-loop on every payment"],
            ["Healthcare",                       "PII to cloud LLMs = HIPAA violation",                    "Local redaction, no PII leaves device"],
            ["Legal & professional services",    "Agent actions need to be explainable in court",          "Full audit chain, actor-stamped decisions"],
            ["Developers building agent products","One breach destroys customer trust",                     "Ship safely, iterate faster"],
          ],
          [2400, 3480, 3480]
        ),
        ...gap(1),

        h("7.4  Competitive Differentiation", HeadingLevel.HEADING_2),
        dataTable(
          ["Capability", "Bastion SDK", "Guardrails AI", "LangChain callbacks", "Cloud safety"],
          [
            ["Human-in-the-loop on actions",  "Yes",           "No",      "No",               "No"],
            ["Local PII redaction",            "Yes",           "Partial", "No",               "No"],
            ["Tamper-evident audit chain",     "Yes",           "No",      "No",               "No"],
            ["Framework-agnostic",             "Yes",           "Partial", "LangChain only",   "Provider-specific"],
            ["Self-hosted",                    "Yes",           "Yes",     "Yes",              "No"],
            ["Policy-as-code (YAML)",          "Yes",           "Yes",     "No",               "No"],
          ],
          [2880, 1440, 1440, 1800, 1800]
        ),
        pageBreak(),

        // ── 8. Roadmap ─────────────────────────────────────────────────
        h("8. Roadmap", HeadingLevel.HEADING_1),

        h("Near-term (0–3 months)", HeadingLevel.HEADING_2),
        bullet("Slack and PagerDuty notification channels (beyond Discord)"),
        bullet("REST API for decision webhooks — integrate with existing approval workflows"),
        bullet("Compliance report export (PDF) — full audit chain with verification result"),
        bullet("Dashboard role-based access — read-only view for auditors"),
        ...gap(1),

        h("Mid-term (3–6 months)", HeadingLevel.HEADING_2),
        bullet("Risk policy engine — ML-assisted risk classification suggestions"),
        bullet("Multi-agent support — trace decisions across agent handoffs"),
        bullet("Semantic PII redaction — Ollama-powered context-aware redaction beyond regex"),
        bullet("SOC 2 Type II audit preparation"),
        ...gap(1),

        h("Long-term (6–12 months)", HeadingLevel.HEADING_2),
        bullet("Managed cloud option for teams that cannot self-host"),
        bullet("Regulatory compliance packs (HIPAA, GDPR, EU AI Act)"),
        bullet("Agent behaviour analytics — detect drift, anomalies, and policy violations over time"),
        pageBreak(),

        // ── 9. Getting Started ─────────────────────────────────────────
        h("9. Getting Started", HeadingLevel.HEADING_1),

        h("For Developers", HeadingLevel.HEADING_2),
        codeBlock([
          "# Install the SDK",
          "pip install bastion-sdk",
          "",
          "# Wrap any tool",
          "from bastion_sdk import gate",
          "gated_tool = gate(my_tool, risk=\"high\", sensitive=True)",
          "",
          "# Start the gateway + dashboard",
          "docker compose up",
        ]),
        ...gap(1),

        h("For Security Teams", HeadingLevel.HEADING_2),
        p("Define risk-policies.yaml at the repo root. Bastion picks it up automatically. No developer changes needed. Policy changes go through standard PR review — security teams own risk classification."),
        ...gap(1),
        codeBlock([
          "# risk-policies.yaml",
          "defaults:",
          "  risk: low",
          "  sensitive: false",
          "tools:",
          "  execute_payment:",
          "    risk: high",
          "    mode: approval",
          "  fetch_patient_record:",
          "    risk: low",
          "    sensitive: true",
        ]),
        ...gap(1),

        h("For Compliance Teams", HeadingLevel.HEADING_2),
        p("Run the audit chain verifier at any time. Exit code 0 = verified. Exit code 1 = tampering detected."),
        codeBlock([
          "python scripts/verify_audit_chain.py",
          "",
          "# AgentGate audit-chain verifier",
          "# Walking 142 events from seq #1 ...",
          "#",
          "# Result:",
          "#   ✓ Audit chain VERIFIED across 142 events.",
          "#     No tampering detected.",
        ]),
        pageBreak(),

        // ── 10. Contact ────────────────────────────────────────────────
        h("10. Team & Contact", HeadingLevel.HEADING_1),
        ...gap(1),
        callout([
          new Paragraph({ spacing: { before: 40, after: 40 }, children: [new TextRun({ text: "Built during a 3-day hackathon.", font: "Arial", size: 22, bold: true, color: NAVY })] }),
          ...gap(1),
          p([
            new TextRun({ text: "Prashant Yadav  ·  Vinay Upadhyay  ·  Samiksha Chhabra", font: "Arial", size: 22, color: "333333" }),
          ]),
          p([
            new TextRun({ text: "Contact: ", font: "Arial", size: 22, color: "444444" }),
            new TextRun({ text: "vinay.upadhyay@linq.com", font: "Arial", size: 22, color: ACCENT }),
          ]),
        ], LIGHT, ACCENT),
      ],
    },
  ],
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("BastionSDK_Stakeholder_Doc.docx", buf);
  console.log("Done: BastionSDK_Stakeholder_Doc.docx (" + (buf.length / 1024).toFixed(0) + " KB)");
});
