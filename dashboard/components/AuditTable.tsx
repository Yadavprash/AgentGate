import type { ActionRow } from "@/lib/supabase";
import StatusChip from "./StatusChip";

function time(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function detail(row: ActionRow) {
  const summary = row.display?.summary;
  if (typeof summary === "string") return summary;
  return Object.entries(row.tool_args)
    .map(([k, v]) => `${k}=${String(v)}`)
    .join(", ");
}

export default function AuditTable({ rows }: { rows: ActionRow[] }) {
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
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-zinc-900/60">
              <td className="px-4 py-3 font-mono text-xs text-zinc-500">
                {time(row.created_at)}
              </td>
              <td className="px-4 py-3 text-zinc-300">{row.agent_name}</td>
              <td className="px-4 py-3 font-mono text-xs text-zinc-200">
                <span className="inline-flex items-center gap-1.5">
                  {row.tool_name}
                  {(row.display as Record<string, unknown> | null)?.redacted ? (
                    <span
                      title="PII redacted locally - cloud LLM never saw the raw value"
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
                <StatusChip status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
