import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

export default function HeroStats({ rows }: { rows: ActionRow[] }) {
  const pending  = rows.filter((r) => r.status === "intercepted").length;
  const threats  = rows.filter((r) => (r.display as Display)?.threat === true).length;
  const heldSpend = rows
    .filter((r) => r.status === "intercepted" || r.status === "denied" || r.status === "timed_out")
    .reduce((sum, r) => sum + (r.cost ?? 0), 0);

  // "today" = last 24 h
  const dayAgo = Date.now() - 86_400_000;
  const todayRows = rows.filter((r) => new Date(r.created_at).getTime() > dayAgo);

  return (
    <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        value={rows.length.toString()}
        label="Total Actions"
        sub={`↑ ${todayRows.length} today`}
        subColor="text-emerald-400"
      />
      <StatCard
        value={pending.toString()}
        label="Pending Approval"
        sub={pending > 0 ? `${pending} expiring soon` : "none waiting"}
        subColor="text-amber-400"
        valueColor="text-amber-400"
      />
      <StatCard
        value={`$${heldSpend >= 1000 ? (heldSpend / 1000).toFixed(1) + "k" : heldSpend.toFixed(0)}`}
        label="Spend Held"
        sub="24h window"
        subColor="text-emerald-400"
        valueColor="text-emerald-400"
      />
      <StatCard
        value={threats.toString()}
        label="Threats Blocked"
        sub={threats > 0 ? `↑ ${threats} today` : "none detected"}
        subColor={threats > 0 ? "text-amber-400" : "text-zinc-500"}
        valueColor={threats > 0 ? "text-amber-400" : undefined}
      />
    </div>
  );
}

function StatCard({
  value,
  label,
  sub,
  subColor,
  valueColor,
}: {
  value: string;
  label: string;
  sub: string;
  subColor: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-black/[0.08] bg-white p-5 dark:border-white/[0.06] dark:bg-[#13161f]">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${valueColor ?? "text-zinc-900 dark:text-white"}`}>
        {value}
      </div>
      <div className={`mt-1 text-xs font-medium ${subColor}`}>{sub}</div>
    </div>
  );
}
