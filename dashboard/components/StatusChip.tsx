import type { ActionStatus } from "@/lib/supabase";

const STYLES: Record<ActionStatus, { label: string; icon: string; cls: string }> = {
  auto_approved: {
    label: "approved",
    icon: "✓",
    cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  },
  intercepted: {
    label: "pending",
    icon: "⏸",
    cls: "bg-amber-500/10 text-amber-400 border border-amber-500/30",
  },
  approved: {
    label: "approved",
    icon: "✓",
    cls: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30",
  },
  completed: {
    label: "completed",
    icon: "✓",
    cls: "bg-sky-500/10 text-sky-400 border border-sky-500/30",
  },
  denied: {
    label: "denied",
    icon: "✕",
    cls: "bg-red-500/10 text-red-400 border border-red-500/30",
  },
  timed_out: {
    label: "timed out",
    icon: "⏱",
    cls: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30",
  },
  failed: {
    label: "failed",
    icon: "✕",
    cls: "bg-red-500/10 text-red-400 border border-red-500/30",
  },
};

export default function StatusChip({ status }: { status: ActionStatus }) {
  const s = STYLES[status] ?? STYLES.failed;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      <span>{s.icon}</span>
      {s.label}
    </span>
  );
}
