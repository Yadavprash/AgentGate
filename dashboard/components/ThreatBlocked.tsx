import type { ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

function time(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Surfaces a dramatic red banner the moment an attempted exfiltration / threat
 * action is denied (or even while it's awaiting human review). Triggers on:
 *   display.threat === true  AND  status in {intercepted, denied, timed_out}
 *
 * Picks the most recent matching row so a fresh injection attempt always wins
 * the spotlight over an older one.
 */
export default function ThreatBlocked({ rows }: { rows: ActionRow[] }) {
  const threat = rows.find((r) => {
    const d = r.display as Display;
    if (!d || d.threat !== true) return false;
    return ["intercepted", "denied", "timed_out"].includes(r.status);
  });

  if (!threat) return null;

  const display = threat.display as Display;
  const targetUrl = String(display?.target_url ?? "(no target_url recorded)");
  const payloadPreview = String(display?.payload_preview ?? "");
  const awaiting = threat.status === "intercepted";

  const headline = awaiting
    ? "⚠️ THREAT INTERCEPTED · AWAITING HUMAN"
    : "🚨 THREAT BLOCKED";
  const subline = awaiting
    ? "An agent attempted an exfiltration-shaped action. The request is frozen at the gateway until a human decides."
    : `Prompt-injection / exfiltration attempt was caught by AgentGate before any data left your machine.`;

  return (
    <div
      className={`mb-6 overflow-hidden rounded-lg border-2 bg-red-50 dark:bg-red-950/40 ${
        awaiting ? "border-amber-500 threat-pulse-amber" : "border-red-500 threat-pulse"
      }`}
    >
      <div
        className={`px-4 py-2 text-sm font-bold uppercase tracking-wider ${
          awaiting
            ? "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100"
            : "bg-red-200/60 text-red-900 dark:bg-red-500/25 dark:text-red-100"
        }`}
      >
        {headline}
      </div>
      <div className="space-y-3 px-4 py-4 text-sm">
        <p className="text-red-900 dark:text-red-100">{subline}</p>

        <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 font-mono text-xs">
          <span className="text-red-700/80 dark:text-red-300/70">agent</span>
          <span className="text-red-900 dark:text-red-50">{threat.agent_name}</span>

          <span className="text-red-700/80 dark:text-red-300/70">attempted</span>
          <span className="text-red-900 dark:text-red-50">{threat.tool_name}</span>

          <span className="text-red-700/80 dark:text-red-300/70">target_url</span>
          <span className="break-all text-red-900 dark:text-red-50">{targetUrl}</span>

          {payloadPreview && (
            <>
              <span className="text-red-700/80 dark:text-red-300/70">payload</span>
              <span className="break-all text-red-800 dark:text-red-50/80">
                {payloadPreview.length > 200
                  ? payloadPreview.slice(0, 200) + "…"
                  : payloadPreview}
              </span>
            </>
          )}

          <span className="text-red-700/80 dark:text-red-300/70">
            {awaiting ? "intercepted at" : "denied at"}
          </span>
          <span className="text-red-900 dark:text-red-50">
            {time(awaiting ? threat.created_at : threat.decided_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
