import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

export default function HeroStats({ rows }: { rows: ActionRow[] }) {
  const intercepts = rows.filter((r) => r.risk === "high").length;
  const denied = rows.filter(
    (r) => r.status === "denied" || r.status === "timed_out",
  );
  const blockedSpend = denied.reduce((sum, r) => sum + (r.cost ?? 0), 0);
  const redactions = rows.filter(
    (r) => (r.display as Display)?.redacted === true,
  ).length;

  const approved = rows.filter(
    (r) =>
      (r.status === "approved" || r.status === "completed") && r.decided_at,
  );
  const avgApprovalMs =
    approved.length === 0
      ? 0
      : approved.reduce((sum, r) => {
          const start = new Date(r.created_at).getTime();
          const end = new Date(r.decided_at as string).getTime();
          return sum + Math.max(0, end - start);
        }, 0) / approved.length;

  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <Metric
        label="Total actions"
        value={rows.length.toString()}
        sublabel="across all agent runs"
        accent="zinc"
      />
      <Metric
        label="High-risk intercepts"
        value={intercepts.toString()}
        sublabel={`${redactions} PII redactions`}
        accent="amber"
      />
      <Metric
        label="Blocked spend"
        value={`$${blockedSpend.toFixed(2)}`}
        sublabel={`${denied.length} denied`}
        accent="red"
      />
      <Metric
        label="Avg approval time"
        value={avgApprovalMs > 0 ? `${(avgApprovalMs / 1000).toFixed(1)}s` : "—"}
        sublabel={`${approved.length} approvals`}
        accent="emerald"
      />
    </div>
  );
}

function Metric({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: "zinc" | "amber" | "red" | "emerald";
}) {
  const accentBorder = {
    zinc: "border-zinc-800",
    amber: "border-amber-500/40",
    red: "border-red-500/40",
    emerald: "border-emerald-500/40",
  } as const;
  const accentText = {
    zinc: "text-zinc-100",
    amber: "text-amber-300",
    red: "text-red-300",
    emerald: "text-emerald-300",
  } as const;
  return (
    <div
      className={`rounded-lg border bg-zinc-900/50 p-5 ${accentBorder[accent]}`}
    >
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold ${accentText[accent]}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-zinc-500">{sublabel}</div>
    </div>
  );
}
