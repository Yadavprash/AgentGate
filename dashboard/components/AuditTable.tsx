import type { ActionRow, AuditEventRow } from "@/lib/supabase";
import StatusChip from "./StatusChip";
import { useState, useEffect } from "react";
import { fetchAuditEvents, supabase } from "@/lib/supabase";

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
                <div className="flex items-center gap-2">
                  <StatusChip status={row.status} />
                  <ViewTrailButton actionId={row.id} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewTrailButton({ actionId }: { actionId: string }) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEventRow[] | null>(null);
  const [filter, setFilter] = useState<string>("");

  async function openModal() {
    setOpen(true);
    if (!events) {
      const data = await fetchAuditEvents(actionId);
      setEvents(data as AuditEventRow[]);
    }
  }

  useEffect(() => {
    if (!open || !supabase) return;

    const channel = supabase
      .channel(`audit-events-${actionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_events", filter: `action_id=eq.${actionId}` },
        (payload) => {
          const ev = payload.new as AuditEventRow;
          setEvents((prev) => {
            if (!prev) return [ev];
            // avoid duplicate ids
            if (prev.find((p) => p.id === ev.id)) return prev;
            return [...prev, ev].sort((a, b) => a.created_at.localeCompare(b.created_at));
          });
        },
      )
      .subscribe();

    return () => {
      try {
        supabase?.removeChannel(channel as any);
      } catch (e) {
        // ignore
      }
    };
  }, [open, actionId]);

  return (
    <>
      <button
        className="rounded bg-zinc-800/60 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
        onClick={openModal}
      >
        View Trail
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded bg-zinc-950 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-medium">Decision Trail</h3>
              <div className="flex items-center gap-2">
                <input
                  placeholder="Filter by kind or actor"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1 text-xs text-zinc-200"
                />
                <button
                  className="rounded bg-zinc-800/60 px-3 py-1 text-xs text-zinc-300"
                  onClick={() => setOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-auto">
              {!events && <div className="text-sm text-zinc-500">Loading…</div>}
              {events &&
                events
                  .filter((ev) => {
                    if (!filter) return true;
                    const f = filter.toLowerCase();
                    return (
                      (ev.decision_kind || "").toLowerCase().includes(f) ||
                      (ev.actor || "").toLowerCase().includes(f) ||
                      (ev.event_type || "").toLowerCase().includes(f)
                    );
                  })
                  .map((ev) => (
                    <div key={ev.id} className="rounded border border-zinc-800 p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-sm text-zinc-400">
                          {new Date(ev.created_at).toLocaleString()} • {ev.actor || "system"} • {ev.decision_kind || ev.event_type}
                        </div>
                        <div className="text-xs text-zinc-500">v{ev.decision_version ?? "-"}</div>
                      </div>
                      <pre className="whitespace-pre-wrap break-words text-xs text-zinc-200">
                        {JSON.stringify(ev.payload || {}, null, 2)}
                      </pre>
                    </div>
                  ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
