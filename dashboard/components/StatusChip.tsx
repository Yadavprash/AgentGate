import type { ActionStatus } from "@/lib/supabase";

const STYLES: Record<ActionStatus, { label: string; cls: string }> = {
  auto_approved: { label: "Auto-approved", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  intercepted: { label: "Awaiting human", cls: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  approved: { label: "Approved", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  completed: { label: "Completed", cls: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  denied: { label: "Denied", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
  timed_out: { label: "Timed out", cls: "bg-zinc-500/15 text-zinc-300 border-zinc-500/40" },
  failed: { label: "Failed", cls: "bg-red-500/15 text-red-300 border-red-500/40" },
};

export default function StatusChip({ status }: { status: ActionStatus }) {
  const s = STYLES[status] ?? STYLES.failed;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
