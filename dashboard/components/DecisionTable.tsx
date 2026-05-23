"use client";

import type { AuditEventRow, DecisionActor } from "@/lib/supabase";

type Payload = Record<string, unknown> | null;

function time(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actorClass(actor: DecisionActor | null): string {
  if (actor === "human") return "text-amber-300";
  if (actor === "ai") return "text-sky-300";
  return "text-zinc-300";
}

function payloadSummary(row: AuditEventRow): string {
  const payload = row.payload as Payload;
  if (!payload || typeof payload !== "object") return "-";

  if (typeof payload.summary === "string" && payload.summary.trim()) {
    const s = payload.summary.trim();
    return s.length > 120 ? `${s.slice(0, 120)}...` : s;
  }

  if (typeof payload.tool === "string") {
    const mode = typeof payload.mode === "string" ? ` mode=${payload.mode}` : "";
    return `tool=${payload.tool}${mode}`;
  }

  if (typeof payload.status === "string") {
    return `status=${payload.status}`;
  }

  if (typeof payload.backend === "string") {
    return `backend=${payload.backend}`;
  }

  const entries = Object.entries(payload).slice(0, 2);
  if (entries.length === 0) return "-";
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(", ");
}

export default function DecisionTable({ rows }: { rows: AuditEventRow[] }) {
  if (rows.length === 0) {
    return (
      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 p-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Decision Trail
        </h2>
        <p className="text-sm text-zinc-500">
          No decisions yet. Decisions from AI, humans, and system events will appear here.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 overflow-hidden rounded-lg border border-zinc-800">
      <div className="border-b border-zinc-800 bg-zinc-900 px-4 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">
          Decision Trail
        </h2>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Version</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Decision</th>
            <th className="px-4 py-3">Detail</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 bg-zinc-950">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-zinc-900/60">
              <td className="px-4 py-3 font-mono text-xs text-zinc-500">{time(row.created_at)}</td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                {row.action_id ? row.action_id.slice(0, 8) : "-"}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-300">v{row.decision_version}</td>
              <td className={`px-4 py-3 text-xs font-semibold uppercase ${actorClass(row.actor)}`}>
                {row.actor}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-300">
                {row.decision_kind} / {row.event_type}
              </td>
              <td className="px-4 py-3 text-zinc-400">{payloadSummary(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
