"use client";

import { useEffect, useState } from "react";
import type { ActionRow } from "@/lib/supabase";
import StatusChip from "./StatusChip";

type Display = Record<string, unknown> | null;

function formatElapsed(start: string): string {
  const ms = Date.now() - new Date(start).getTime();
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function time(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function detail(row: ActionRow) {
  const summary = (row.display as Display)?.summary;
  if (typeof summary === "string") return summary;
  return Object.entries(row.tool_args)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}

function flashClassFor(row: ActionRow): string {
  if (!row.decided_at) return "";
  const decidedAge = Date.now() - new Date(row.decided_at).getTime();
  if (decidedAge < 0 || decidedAge > 2500) return "";
  if (row.status === "denied" || row.status === "timed_out") return "flash-red";
  if (
    row.status === "approved" ||
    row.status === "completed" ||
    row.status === "auto_approved"
  ) {
    return "flash-green";
  }
  return "";
}

export default function AuditTable({ rows }: { rows: ActionRow[] }) {
  // Re-render every second so the countdown ticks and the 2-second flash window
  // gets re-evaluated.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-10 text-center text-zinc-500">
        No actions yet. Run the agent to see interceptions stream in live.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-900 text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Agent</th>
            <th className="px-4 py-3">Tool</th>
            <th className="px-4 py-3">Detail</th>
            <th className="px-4 py-3">Risk</th>
            <th className="px-4 py-3">Cost</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 bg-zinc-950">
          {rows.map((row) => {
            const isWaiting = row.status === "intercepted";
            const flash = flashClassFor(row);
            const rowClasses = [
              "hover:bg-zinc-900/60",
              isWaiting ? "pulse-amber" : "",
              flash,
            ]
              .filter(Boolean)
              .join(" ");
            const display = row.display as Display;
            return (
              <tr key={row.id} className={rowClasses}>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                  {time(row.created_at)}
                </td>
                <td className="px-4 py-3 text-zinc-300">{row.agent_name}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-200">
                  <span className="inline-flex items-center gap-1.5">
                    {row.tool_name}
                    {display?.redacted ? (
                      <span
                        title="PII redacted locally — cloud LLM never saw the raw value"
                        className="rounded border border-purple-500/40 bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-medium text-purple-300"
                      >
                        🔒 PII
                      </span>
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-400">{detail(row)}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      row.risk === "high" ? "text-red-400" : "text-zinc-500"
                    }
                  >
                    {row.risk.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  {row.cost != null ? `$${Number(row.cost).toFixed(2)}` : "—"}
                </td>
                <td className="px-4 py-3">
                  {isWaiting ? (
                    <span className="inline-flex items-center gap-2">
                      <StatusChip status={row.status} />
                      <span className="font-mono text-xs text-amber-300">
                        Frozen {formatElapsed(row.created_at)}
                      </span>
                    </span>
                  ) : (
                    <StatusChip status={row.status} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
