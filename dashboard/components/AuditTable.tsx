"use client";

import { useEffect, useState } from "react";
import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

function time(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatElapsed(start: string): string {
  const ms = Date.now() - new Date(start).getTime();
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

function flashClassFor(row: ActionRow): string {
  if (!row.decided_at) return "";
  const age = Date.now() - new Date(row.decided_at).getTime();
  if (age < 0 || age > 2500) return "";
  if (row.status === "denied" || row.status === "timed_out") return "flash-red";
  if (row.status === "approved" || row.status === "completed" || row.status === "auto_approved") return "flash-green";
  return "";
}

function RiskBadge({ risk }: { risk: string }) {
  if (risk === "high")
    return (
      <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-400">
        HIGH
      </span>
    );
  return (
    <span className="rounded-md border border-teal-500/30 bg-teal-500/10 px-2 py-0.5 text-xs font-semibold text-teal-400">
      LOW
    </span>
  );
}

function StatusBadge({ row }: { row: ActionRow }) {
  const display = row.display as Display;
  const isThreat = display?.threat === true;
  const isRedacted = display?.redacted === true;

  if (isThreat && (row.status === "denied" || row.status === "timed_out")) {
    return (
      <span className="rounded-md bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
        ⚠ blocked
      </span>
    );
  }
  if (isRedacted) {
    return (
      <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400">
        ⊙ redacted
      </span>
    );
  }
  if (row.status === "approved" || row.status === "auto_approved" || row.status === "completed") {
    return (
      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
        ✓ approved
      </span>
    );
  }
  if (row.status === "denied" || row.status === "timed_out") {
    return (
      <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
        ✕ denied
      </span>
    );
  }
  if (row.status === "intercepted") {
    return (
      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-400">
        ⏸ frozen
      </span>
    );
  }
  return (
    <span className="rounded-md border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-xs font-medium text-zinc-400">
      {row.status}
    </span>
  );
}

export default function AuditTable({
  rows,
  onSelect,
}: {
  rows: ActionRow[];
  onSelect?: (row: ActionRow) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-black/[0.08] bg-white p-10 text-center text-zinc-500 dark:border-white/[0.06] dark:bg-[#13161f]">
        No actions yet. Run an agent to see interceptions stream in live.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] dark:border-white/[0.06]">
      {/* Section header */}
      <div className="flex items-center justify-between border-b border-black/[0.08] bg-white/50 px-5 py-3 dark:border-white/[0.06] dark:bg-[#0f1118]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Actions
        </span>
        <span className="text-[10px] text-zinc-500">
          Click any row to inspect full lifecycle →
        </span>
      </div>

      <table className="w-full text-left text-sm">
        <thead className="border-b border-black/[0.06] bg-white/30 text-[10px] uppercase tracking-wider text-zinc-500 dark:border-white/[0.04] dark:bg-[#0f1118]/80">
          <tr>
            <th className="px-5 py-3">Time</th>
            <th className="px-5 py-3">Tool</th>
            <th className="px-5 py-3">Agent</th>
            <th className="px-5 py-3">Risk</th>
            <th className="px-5 py-3">Status</th>
            <th className="px-5 py-3">Mode</th>
            <th className="px-5 py-3 text-right">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.04] bg-white dark:divide-white/[0.04] dark:bg-[#13161f]">
          {rows.map((row) => {
            const isWaiting = row.status === "intercepted";
            const flash = flashClassFor(row);
            const cls = [
              onSelect ? "cursor-pointer" : "",
              "hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-colors",
              isWaiting ? "pulse-amber" : "",
              flash,
            ].filter(Boolean).join(" ");

            return (
              <tr key={row.id} className={cls} onClick={() => onSelect?.(row)}>
                <td className="px-5 py-3 font-mono text-xs text-zinc-500">
                  {time(row.created_at)}
                </td>
                <td className="px-5 py-3 font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200">
                  {row.tool_name}
                </td>
                <td className="px-5 py-3 text-xs text-zinc-500">{row.agent_name}</td>
                <td className="px-5 py-3">
                  <RiskBadge risk={row.risk} />
                </td>
                <td className="px-5 py-3">
                  {isWaiting ? (
                    <span className="inline-flex items-center gap-2">
                      <StatusBadge row={row} />
                      <span className="font-mono text-[10px] text-amber-400">
                        {formatElapsed(row.created_at)}
                      </span>
                    </span>
                  ) : (
                    <StatusBadge row={row} />
                  )}
                </td>
                <td className="px-5 py-3 font-mono text-xs text-zinc-500">{row.mode}</td>
                <td className="px-5 py-3 text-right font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {row.cost != null && row.cost > 0 ? `$${Number(row.cost).toLocaleString()}` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
