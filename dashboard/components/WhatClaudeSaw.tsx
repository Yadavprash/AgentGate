import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

function highlight(text: string) {
  const parts = text.split(/(\[[A-Z_]+\])/g);
  return parts.map((p, i) =>
    /^\[[A-Z_]+\]$/.test(p) ? (
      <span
        key={i}
        className="rounded bg-sky-500/20 px-1 font-mono text-xs text-sky-300 dark:text-sky-300"
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export default function WhatClaudeSaw({ rows }: { rows: ActionRow[] }) {
  const latest = rows.find((r) => {
    const d = r.display as Display;
    return d && typeof d.raw_output === "string" && typeof d.redacted_output === "string";
  });

  if (!latest) return null;

  const display = latest.display as Display;
  const raw = String(display?.raw_output ?? "");
  const redacted = String(display?.redacted_output ?? "");

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/[0.06]">
      <div className="border-b border-black/[0.06] bg-white/50 px-4 py-2.5 dark:border-white/[0.04] dark:bg-[#0f1118]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          What Claude Saw (PII Firewall)
        </span>
      </div>
      <div className="bg-white p-4 dark:bg-[#13161f]">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">Before:</div>
        <pre className="mb-3 overflow-x-auto whitespace-pre-wrap rounded-lg border border-black/[0.06] bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-700 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-zinc-300">
          {raw}
        </pre>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">After:</div>
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-black/[0.06] bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-700 dark:border-white/[0.04] dark:bg-white/[0.03] dark:text-zinc-300">
          {highlight(redacted)}
        </pre>
      </div>
    </div>
  );
}
