"use client";

import type { ActionRow, AuditEventRow, DecisionActor } from "@/lib/supabase";

type Payload = Record<string, unknown> | null;

function time(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function ActorPill({ actor }: { actor: DecisionActor }) {
  const cls =
    actor === "human"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : actor === "ai"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-400"
      : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
      {actor}
    </span>
  );
}

function DecisionPill({ kind }: { kind: string }) {
  const cls =
    kind === "approved" || kind === "auto_approved"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : kind === "denied" || kind === "timed_out"
      ? "border-red-500/30 bg-red-500/10 text-red-400"
      : kind === "intercepted"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : kind === "redaction" || kind === "pii_redacted"
      ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-400"
      : kind === "threat"
      ? "border-red-500/30 bg-red-500/15 text-red-400"
      : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400";
  const label = kind === "auto_approved" ? "approved" : kind;
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

function payloadSummary(row: AuditEventRow): string {
  const payload = row.payload as Payload;
  if (!payload || typeof payload !== "object") return "—";
  if (typeof payload.summary === "string" && payload.summary.trim()) {
    const s = payload.summary.trim();
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  if (typeof payload.tool === "string") return `tool=${payload.tool}`;
  if (typeof payload.by === "string") return `by:${payload.by}`;
  if (typeof payload.amount !== "undefined") return `amount=${payload.amount}`;
  const entries = Object.entries(payload).slice(0, 2);
  if (entries.length === 0) return "—";
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(", ");
}

export default function DecisionTable({
  rows,
  actionMap = {},
}: {
  rows: AuditEventRow[];
  actionMap?: Record<string, ActionRow>;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full flex-col rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.06] dark:bg-[#13161f]">
        <div className="border-b border-black/[0.06] px-5 py-3 dark:border-white/[0.04]">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Decision Trail
          </span>
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <p className="text-sm text-zinc-500">No decisions yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/[0.06]">
      <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/50 px-5 py-3 dark:border-white/[0.04] dark:bg-[#0f1118]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Decision Trail
        </span>
        <span className="text-[10px] text-zinc-500">last {Math.min(rows.length, 20)} events</span>
      </div>

      <div className="overflow-y-auto bg-white dark:bg-[#13161f]">
        <table className="w-full text-left">
          <thead className="border-b border-black/[0.06] text-[10px] uppercase tracking-wider text-zinc-500 dark:border-white/[0.04]">
            <tr>
              <th className="px-4 py-2.5">Time</th>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">Actor</th>
              <th className="px-4 py-2.5">Decision</th>
              <th className="px-4 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
            {rows.slice(0, 20).map((row) => (
              <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 font-mono text-[11px] tabular-nums text-zinc-500">
                  {time(row.created_at)}
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-zinc-500">
                  {row.action_id ? row.action_id.slice(0, 8) + "…" : "—"}
                </td>
                <td className="px-4 py-2.5">
                  <ActorPill actor={row.actor} />
                </td>
                <td className="px-4 py-2.5">
                  <DecisionPill kind={row.event_type} />
                </td>
                <td className="px-4 py-2.5 text-[11px] text-zinc-500">
                  {payloadSummary(row)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
