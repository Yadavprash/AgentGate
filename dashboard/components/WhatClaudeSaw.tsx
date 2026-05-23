import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

/** Wrap [TOKEN] redaction placeholders in a colored span for visual proof. */
function highlight(text: string) {
  const parts = text.split(/(\[[A-Z_]+\])/g);
  return parts.map((p, i) =>
    /^\[[A-Z_]+\]$/.test(p) ? (
      <span
        key={i}
        className="rounded bg-purple-500/30 px-1 font-mono text-purple-200"
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function WhatClaudeSaw({ rows }: { rows: ActionRow[] }) {
  // Find the newest row with both raw + redacted recorded
  const latest = rows.find((r) => {
    const d = r.display as Display;
    return d && typeof d.raw_output === "string" && typeof d.redacted_output === "string";
  });

  if (!latest) return null;

  const display = latest.display as Display;
  const raw = String(display?.raw_output ?? "");
  const redacted = String(display?.redacted_output ?? "");
  const backend = String(display?.redaction_backend ?? "regex");

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-purple-500/40 bg-purple-500/5">
      <div className="flex items-center justify-between border-b border-purple-500/30 bg-purple-500/10 px-4 py-2">
        <div className="text-sm font-medium text-purple-200">
          🔒 What the cloud LLM actually received — most recent{" "}
          <code className="font-mono text-purple-100">{latest.tool_name}</code>
        </div>
        <span className="rounded-full border border-purple-500/40 bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300">
          redactor: {backend}
        </span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-zinc-800">
        <div className="p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            On your device · never sent
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
            {raw}
          </pre>
        </div>
        <div className="p-4">
          <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
            Sent to cloud LLM
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
            {highlight(redacted)}
          </pre>
        </div>
      </div>
    </div>
  );
}
