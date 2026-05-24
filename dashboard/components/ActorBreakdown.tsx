"use client";

import type { ActionRow, AuditEventRow } from "@/lib/supabase";

export default function ActorBreakdown({
  rows,
  actions = [],
}: {
  rows: AuditEventRow[];
  actions?: ActionRow[];
}) {
  if (rows.length === 0) return null;

  const total = rows.length;
  const byActor = {
    ai:     rows.filter((r) => r.actor === "ai").length,
    human:  rows.filter((r) => r.actor === "human").length,
    system: rows.filter((r) => r.actor === "system").length,
  };
  const outcomes = {
    approvals:  rows.filter((r) => r.event_type === "approved" || r.event_type === "auto_approved").length,
    denials:    rows.filter((r) => r.event_type === "denied").length,
    redactions: rows.filter((r) => r.event_type === "redaction").length,
    threats:    rows.filter((r) => r.event_type === "threat").length,
  };

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  // Build per-agent stats when multiple distinct agents are present
  const agentNames = Array.from(new Set(actions.map((a) => a.agent_name).filter(Boolean))).sort();
  const showAgentBreakdown = agentNames.length > 1;

  // Map action_id → agent_name for event lookup
  const actionAgentMap = Object.fromEntries(actions.map((a) => [a.id, a.agent_name]));

  return (
    <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/50">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Actor Breakdown
        <span className="ml-2 font-normal normal-case text-zinc-400">
          {total} total decisions
        </span>
      </h2>

      {/* Bar chart */}
      <div className="space-y-2.5">
        <ActorBar label="AI"     count={byActor.ai}     pct={pct(byActor.ai)}     color="sky"   />
        <ActorBar label="Human"  count={byActor.human}  pct={pct(byActor.human)}  color="amber" />
        <ActorBar label="System" count={byActor.system} pct={pct(byActor.system)} color="zinc"  />
      </div>

      {/* Outcome chips */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
        <OutcomeChip label="Approved"        count={outcomes.approvals}  color="emerald" />
        <OutcomeChip label="Denied"          count={outcomes.denials}    color="red"     />
        <OutcomeChip label="PII redacted"    count={outcomes.redactions} color="purple"  />
        <OutcomeChip label="Threats blocked" count={outcomes.threats}    color="red"     />
      </div>

      {/* Per-agent breakdown — only shown when multiple agents are active */}
      {showAgentBreakdown && (
        <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
            Per-Agent Activity
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {agentNames.map((agent) => {
              const agentActions = actions.filter((a) => a.agent_name === agent);
              const agentEventIds = new Set(
                rows
                  .filter((e) => e.action_id && actionAgentMap[e.action_id] === agent)
                  .map((e) => e.id),
              );
              const agentEvents = rows.filter((e) => agentEventIds.has(e.id));
              const approved = agentEvents.filter(
                (e) => e.event_type === "approved" || e.event_type === "auto_approved",
              ).length;
              const denied = agentEvents.filter((e) => e.event_type === "denied").length;
              const highRisk = agentActions.filter((a) => a.risk === "high").length;

              return (
                <div
                  key={agent}
                  className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="truncate text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      {agent}
                    </span>
                    <span className="ml-2 shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      {agentActions.length} actions
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {highRisk > 0 && (
                      <span className="rounded border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                        {highRisk} high-risk
                      </span>
                    )}
                    {approved > 0 && (
                      <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
                        {approved} approved
                      </span>
                    )}
                    {denied > 0 && (
                      <span className="rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] text-red-700 dark:text-red-300">
                        {denied} denied
                      </span>
                    )}
                    {approved === 0 && denied === 0 && highRisk === 0 && (
                      <span className="text-[10px] text-zinc-400">No flagged actions</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActorBar({
  label,
  count,
  pct,
  color,
}: {
  label: string;
  count: number;
  pct: number;
  color: "sky" | "amber" | "zinc";
}) {
  const BAR: Record<typeof color, string> = {
    sky:   "bg-sky-400 dark:bg-sky-500",
    amber: "bg-amber-400 dark:bg-amber-500",
    zinc:  "bg-zinc-400 dark:bg-zinc-600",
  };
  const LABEL: Record<typeof color, string> = {
    sky:   "text-sky-600 dark:text-sky-300",
    amber: "text-amber-600 dark:text-amber-300",
    zinc:  "text-zinc-500 dark:text-zinc-400",
  };

  return (
    <div className="flex items-center gap-3">
      <span className={`w-14 text-right text-xs font-semibold uppercase ${LABEL[color]}`}>
        {label}
      </span>
      <div className="flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" style={{ height: 8 }}>
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${BAR[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-20 text-right font-mono text-xs text-zinc-500">
        {count}{" "}
        <span className="text-zinc-400">({pct}%)</span>
      </span>
    </div>
  );
}

function OutcomeChip({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: "emerald" | "red" | "purple";
}) {
  if (count === 0) return null;

  const CLS: Record<typeof color, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    red:     "border-red-500/40     bg-red-500/15     text-red-700     dark:text-red-300",
    purple:  "border-purple-500/40  bg-purple-500/15  text-purple-700  dark:text-purple-300",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${CLS[color]}`}>
      <span className="font-semibold">{count}</span>
      {label}
    </span>
  );
}
