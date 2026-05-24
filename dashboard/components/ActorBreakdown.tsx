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

  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.06] dark:bg-[#13161f]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Actor Breakdown
        </span>
        <span className="text-[10px] text-zinc-500">{total} decisions · 30d</span>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        <ActorBar label="AI"     count={byActor.ai}     pct={pct(byActor.ai)}     color="sky"   />
        <ActorBar label="Human"  count={byActor.human}  pct={pct(byActor.human)}  color="amber" />
        <ActorBar label="System" count={byActor.system} pct={pct(byActor.system)} color="zinc"  />
      </div>

      {/* Outcome chips */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-black/[0.06] pt-4 dark:border-white/[0.04]">
        <OutcomeChip label="Approved"     count={outcomes.approvals}  emoji="✓" cls="text-emerald-400" />
        <OutcomeChip label="Denied"       count={outcomes.denials}    emoji="✕" cls="text-red-400"     />
        <OutcomeChip label="Redacted"     count={outcomes.redactions} emoji="🔒" cls="text-indigo-400" />
        <OutcomeChip label="Threats"      count={outcomes.threats}    emoji="🚨" cls="text-red-400"    />
      </div>
    </div>
  );
}

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
    sky:   "bg-sky-400",
    amber: "bg-amber-400",
    zinc:  "bg-zinc-500",
  };
  const LABEL: Record<typeof color, string> = {
    sky:   "text-sky-400",
    amber: "text-amber-400",
    zinc:  "text-zinc-400",
  };

  return (
    <div className="flex items-center gap-3">
      <span className={`w-12 text-right text-xs font-semibold ${LABEL[color]}`}>{label}</span>
      <div className="flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5" style={{ height: 6 }}>
        <div
          className={`h-full rounded-full transition-[width] duration-700 ${BAR[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-semibold text-zinc-500">{pct}%</span>
      <span className="w-20 text-right text-[11px] text-zinc-400">{count} decisions</span>
    </div>
  );
}

function OutcomeChip({
  label,
  count,
  emoji,
  cls,
}: {
  label: string;
  count: number;
  emoji: string;
  cls: string;
}) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium dark:border-white/[0.06] dark:bg-white/[0.03]">
      <span>{emoji}</span>
      <span className="text-zinc-600 dark:text-zinc-300">{count} {label}</span>
    </span>
  );
}
