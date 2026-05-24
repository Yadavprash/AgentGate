import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

function time(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function ThreatBlocked({ rows }: { rows: ActionRow[] }) {
  const threat = rows.find((r) => {
    const d = r.display as Display;
    if (!d || d.threat !== true) return false;
    return ["intercepted", "denied", "timed_out"].includes(r.status);
  });

  if (!threat) return null;

  const display = threat.display as Display;
  const targetUrl = String(display?.target_url ?? "(no target_url recorded)");
  const awaiting = threat.status === "intercepted";

  return (
    <div className={`rounded-xl border-2 ${awaiting ? "border-amber-500/50 threat-pulse-amber" : "border-red-500/50 threat-pulse"} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-widest ${
        awaiting ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"
      }`}>
        {awaiting ? "⚠️ Prompt Injection Intercepted — Awaiting Human" : "🚨 Prompt Injection Blocked"}
      </div>
      <div className="bg-white/50 px-4 py-3 dark:bg-[#13161f]/80">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          External URL tried to inject instructions into{" "}
          <code className="rounded bg-zinc-100 px-1 font-mono text-xs dark:bg-white/5">
            {threat.tool_name}()
          </code>
          . Bastion intercepted and {awaiting ? "paused" : "denied"} before execution.
        </p>
        <div className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-1 font-mono text-xs">
          <span className="text-zinc-500">agent</span>
          <span className="text-zinc-700 dark:text-zinc-300">{threat.agent_name}</span>
          <span className="text-zinc-500">target_url</span>
          <span className="break-all text-zinc-700 dark:text-zinc-300">{targetUrl}</span>
          <span className="text-zinc-500">{awaiting ? "intercepted" : "denied"} at</span>
          <span className="text-zinc-700 dark:text-zinc-300">
            {time(awaiting ? threat.created_at : threat.decided_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
