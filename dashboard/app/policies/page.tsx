"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// YAML syntax highlighting
// ---------------------------------------------------------------------------

type TokenKind = "comment" | "key" | "value-bool" | "value-num" | "value-str" | "plain";

function tokenizeLine(line: string): { kind: TokenKind; text: string }[] {
  const trimmed = line.trimStart();
  const indent = line.slice(0, line.length - trimmed.length);

  if (trimmed.startsWith("#")) {
    return [{ kind: "plain", text: indent }, { kind: "comment", text: trimmed }];
  }

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const key = trimmed.slice(0, colonIdx);
    const rest = trimmed.slice(colonIdx + 1);
    const tokens: { kind: TokenKind; text: string }[] = [
      { kind: "plain",  text: indent },
      { kind: "key",    text: key },
      { kind: "plain",  text: ":" },
    ];
    if (rest.trim() === "") return tokens;
    const val = rest.trimStart();
    const pre = rest.slice(0, rest.length - val.length);
    if (val === "true" || val === "false") {
      tokens.push({ kind: "plain", text: pre });
      tokens.push({ kind: "value-bool", text: val });
    } else if (/^\d+/.test(val)) {
      tokens.push({ kind: "plain", text: pre });
      tokens.push({ kind: "value-num", text: val });
    } else if (val.startsWith('"') || val.startsWith("'")) {
      tokens.push({ kind: "plain", text: pre });
      tokens.push({ kind: "value-str", text: val });
    } else {
      tokens.push({ kind: "plain", text: pre });
      tokens.push({ kind: "value-str", text: val });
    }
    return tokens;
  }

  return [{ kind: "plain", text: line }];
}

const TOKEN_CLS: Record<TokenKind, string> = {
  comment:    "text-zinc-500",
  key:        "text-violet-400",
  "value-bool": "text-orange-400",
  "value-num":  "text-orange-300",
  "value-str":  "text-zinc-200",
  plain:      "text-zinc-400",
};

function YamlHighlight({ value }: { value: string }) {
  const lines = value.split("\n");
  return (
    <div className="overflow-auto font-mono text-xs leading-5">
      {lines.map((line, i) => (
        <div key={i} className="flex">
          <span className="mr-4 w-6 shrink-0 select-none text-right text-zinc-700">
            {i + 1}
          </span>
          <span>
            {tokenizeLine(line).map((tok, j) => (
              <span key={j} className={TOKEN_CLS[tok.kind]}>{tok.text}</span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Default policy YAML
// ---------------------------------------------------------------------------

const DEFAULT_YAML = `# bastion-policy.yaml
version: 1

defaults:
  risk: low
  sensitive: false
  mode: approval

notifications:
  channel: slack
  webhook_url: https://hooks.slack.com/…

tools:
  execute_payment:
    risk: high   # gates this tool
    mode: approval
  fetch_patient_record:
    sensitive: true   # PII redacted
  delete_record:
    risk: high
    sensitive: true
  search_web:
    risk: low
    mode: monitor`;

// ---------------------------------------------------------------------------
// Tool coverage data
// ---------------------------------------------------------------------------

type ToolEntry = {
  name: string;
  used: string;
  risk: "HIGH" | "LOW" | "default";
  sensitive: boolean;
  mode: string;
};

const TOOLS: ToolEntry[] = [
  { name: "execute_payment",      used: "used 142× in 30d", risk: "HIGH",    sensitive: false, mode: "approval" },
  { name: "fetch_patient_record", used: "used 82× in 30d",  risk: "LOW",     sensitive: true,  mode: "approval" },
  { name: "delete_record",        used: "used 14× in 30d",  risk: "HIGH",    sensitive: true,  mode: "approval" },
  { name: "search_web",           used: "used 1,032× in 30d", risk: "LOW",   sensitive: false, mode: "monitor"  },
  { name: "send_email",           used: "used 47× · ⚠ using defaults", risk: "default", sensitive: false, mode: "default" },
];

function RiskBadge({ risk }: { risk: ToolEntry["risk"] }) {
  if (risk === "HIGH")
    return <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-400">HIGH</span>;
  if (risk === "LOW")
    return <span className="rounded-md bg-teal-500/20 px-2 py-0.5 text-[10px] font-bold text-teal-400">LOW</span>;
  return <span className="rounded-md bg-zinc-500/20 px-2 py-0.5 text-[10px] font-medium text-zinc-400">default</span>;
}

function ModeBadge({ mode }: { mode: string }) {
  if (mode === "default") return null;
  return (
    <span className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
      {mode}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PoliciesPage() {
  const [yaml, setYaml]           = useState(DEFAULT_YAML);
  const [validated, setValidated] = useState(true);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/policy")
      .then((r) => r.json())
      .then(({ content }) => { if (content) setYaml(content); })
      .catch(() => {});
  }, []);

  function validate() { setValidated(yaml.includes("version:") && yaml.includes("tools:")); }

  async function save() {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: yaml }),
      });
      const data = await res.json();
      if (res.ok) {
        setValidated(true);
        setEditing(false);
        setSaveMsg({ ok: true, text: "Saved — SDK will pick up changes on next gate() call" });
      } else {
        setSaveMsg({ ok: false, text: data.error ?? "Save failed" });
      }
    } catch (err) {
      setSaveMsg({ ok: false, text: String(err) });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">

      {/* Page header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Risk Policies</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Security teams define risk. Developers just write{" "}
            <code className="font-mono text-zinc-400">gate(my_tool)</code>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
              saveMsg.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}>
              {saveMsg.ok ? "✓" : "✕"} {saveMsg.text}
            </span>
          )}
          {!saveMsg && validated && (
            <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
              ✓ Policy validated
            </span>
          )}
          <button
            onClick={validate}
            className="rounded-lg border border-black/[0.08] bg-white px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-[#13161f] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          >
            Validate
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-1.5 text-sm font-semibold text-sky-400 hover:bg-sky-500/25 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">

        {/* Left: YAML editor */}
        <div className="overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/50 px-5 py-3 dark:border-white/[0.04] dark:bg-[#0f1118]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Bastion-Policy.yaml
            </span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setEditing(!editing)}
                className="text-xs text-sky-400 hover:text-sky-300"
              >
                {editing ? "Preview" : "Edit"}
              </button>
              <Link href="#" className="text-xs text-zinc-500 hover:text-zinc-300">
                Download template
              </Link>
            </div>
          </div>
          <div className="bg-[#0d1020] p-5 dark:bg-[#0d1020]">
            {editing ? (
              <textarea
                value={yaml}
                onChange={(e) => setYaml(e.target.value)}
                spellCheck={false}
                className="w-full resize-none bg-transparent font-mono text-xs leading-5 text-zinc-300 focus:outline-none"
                style={{ minHeight: "400px" }}
              />
            ) : (
              <YamlHighlight value={yaml} />
            )}
          </div>
        </div>

        {/* Right: Tool coverage */}
        <div className="overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/[0.06]">
          <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/50 px-5 py-3 dark:border-white/[0.04] dark:bg-[#0f1118]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Tool Coverage
            </span>
            <span className="text-[10px] text-zinc-500">
              {TOOLS.length} tools · {TOOLS.filter((t) => t.risk !== "default").length} defined
            </span>
          </div>
          <div className="divide-y divide-black/[0.06] bg-white dark:divide-white/[0.04] dark:bg-[#13161f]">
            {TOOLS.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                <div>
                  <p className="font-mono text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {tool.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">{tool.used}</p>
                </div>
                <div className="flex items-center gap-2">
                  {tool.sensitive && (
                    <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-400">
                      PII
                    </span>
                  )}
                  <RiskBadge risk={tool.risk} />
                  <ModeBadge mode={tool.mode} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
