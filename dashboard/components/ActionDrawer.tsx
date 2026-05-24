"use client";

import { useEffect } from "react";
import type { ActionRow, AuditEventRow } from "@/lib/supabase";

const DOT_COLOR: Record<string, string> = {
  intercepted:    "bg-amber-400",
  auto_approved:  "bg-emerald-400",
  approved:       "bg-emerald-400",
  completed:      "bg-sky-400",
  denied:         "bg-red-400",
  timed_out:      "bg-zinc-400",
  failed:         "bg-red-400",
  redaction:      "bg-indigo-400",
  threat:         "bg-red-400",
  final_response: "bg-sky-400",
};

const EVENT_CLS: Record<string, string> = {
  intercepted:    "border-amber-500/30 bg-amber-500/10 text-amber-400",
  auto_approved:  "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  approved:       "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  denied:         "border-red-500/30 bg-red-500/10 text-red-400",
  completed:      "border-sky-500/30 bg-sky-500/10 text-sky-400",
  timed_out:      "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  failed:         "border-red-500/30 bg-red-500/10 text-red-400",
  redaction:      "border-indigo-500/30 bg-indigo-500/10 text-indigo-400",
  threat:         "border-red-500/30 bg-red-500/10 text-red-400",
  final_response: "border-sky-500/30 bg-sky-500/10 text-sky-400",
};

const ACTOR_CLS: Record<string, string> = {
  human:  "text-amber-400",
  ai:     "text-sky-400",
  system: "text-zinc-400",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function short(hash: string | null | undefined) {
  if (!hash) return "—";
  return hash.slice(0, 8) + "…";
}

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
}

export default function ActionDrawer({
  action,
  allEvents,
  onClose,
}: {
  action: ActionRow | null;
  allEvents: AuditEventRow[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!action) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [action, onClose]);

  if (!action) return null;

  const events = allEvents
    .filter((e) => e.action_id === action.id)
    .sort((a, b) => a.decision_version - b.decision_version);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <aside className="slide-in-right fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-white/[0.06] bg-[#0d1020] shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <button
                onClick={() => copyText(action.id)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
                title="Copy ID"
              >
                Action Detail
              </button>
              <span className="mx-1 text-zinc-600">·</span>
              <button
                onClick={() => copyText(action.id)}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                Copy ID
              </button>
            </div>
            <h2 className="mt-2 font-mono text-xl font-bold text-white">{action.tool_name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-zinc-700 px-2 py-0.5 text-xs font-medium text-zinc-300">
                {action.agent_name}
              </span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                action.risk === "high"
                  ? "bg-red-500/20 text-red-400"
                  : "bg-teal-500/20 text-teal-400"
              }`}>
                {action.risk.toUpperCase()} RISK
              </span>
              {action.cost != null && action.cost > 0 && (
                <span className="text-sm font-semibold text-emerald-400">
                  ${Number(action.cost).toLocaleString()}
                </span>
              )}
            </div>
            <p className="mt-1 font-mono text-[10px] text-zinc-600 break-all">{action.id}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

          {/* Tool args */}
          {Object.keys(action.tool_args).length > 0 && (
            <div>
              <SectionLabel>Tool Arguments</SectionLabel>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/30 p-3 font-mono text-xs leading-relaxed text-emerald-300">
                {JSON.stringify(action.tool_args, null, 2)}
              </pre>
            </div>
          )}

          {/* Trace tree (placeholder when trace_id exists) */}
          {action.trace_id && (
            <div>
              <SectionLabel>Trace Tree</SectionLabel>
              <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/20 p-3 font-mono text-xs">
                <div className="text-zinc-400">
                  ▾ <span className="text-zinc-200">orchestrator-agent</span>{" "}
                  <span className="text-zinc-600">({action.trace_id.slice(0, 8)}…)</span>
                </div>
                <div className="ml-4 mt-1 text-zinc-500">
                  └─ <span className="text-zinc-300">{action.agent_name}</span>{" "}
                  <span className="text-zinc-600">({action.id.slice(0, 8)}…)</span>
                </div>
                <div className="ml-8 mt-1 text-zinc-500">
                  └─ <span className="text-sky-400">{action.tool_name}</span>{" "}
                  <span className="text-zinc-500">← THIS</span>
                </div>
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <SectionLabel>Lifecycle Timeline</SectionLabel>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No audit events recorded yet.</p>
            ) : (
              <div className="relative mt-3">
                {events.length > 1 && (
                  <div className="absolute bottom-4 left-[7px] top-4 w-px bg-white/[0.06]" />
                )}
                <div className="space-y-4">
                  {events.map((ev, idx) => (
                    <div key={ev.id} className="relative flex gap-3">
                      <div className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                        <div className={`h-3 w-3 rounded-full border-2 border-[#0d1020] ${DOT_COLOR[ev.event_type] ?? "bg-zinc-400"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${EVENT_CLS[ev.event_type] ?? ""}`}>
                            {ev.event_type}
                          </span>
                          <span className={`text-[10px] font-semibold uppercase ${ACTOR_CLS[ev.actor] ?? "text-zinc-400"}`}>
                            {ev.actor === "human" ? `Human (${ev.payload && typeof ev.payload === "object" && "by" in ev.payload ? String(ev.payload.by) : "—"})` : ev.actor}
                          </span>
                          <span className="text-[10px] text-zinc-600">v{ev.decision_version}</span>
                          <span className="ml-auto text-[10px] tabular-nums text-zinc-500">{fmt(ev.created_at)}</span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-[10px] text-zinc-600">this:</span>
                          <button
                            onClick={() => ev.this_hash && copyText(ev.this_hash)}
                            className="font-mono text-[10px] text-emerald-500 hover:text-emerald-300"
                            title="Copy hash"
                          >
                            {short(ev.this_hash)}
                          </button>
                          {idx > 0 && (
                            <>
                              <span className="text-[10px] text-zinc-600">prev:</span>
                              <span className="font-mono text-[10px] text-zinc-600">{short(ev.prev_hash)}</span>
                            </>
                          )}
                          {idx === 0 && (
                            <span className="rounded bg-zinc-800 px-1 text-[9px] text-zinc-500">(genesis)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 border-t border-white/[0.06] px-5 py-3">
          <button className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 text-xs font-medium text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200">
            Re-verify chain
          </button>
          <button className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 text-xs font-medium text-zinc-400 hover:bg-white/[0.07] hover:text-zinc-200">
            Export JSON
          </button>
        </div>
      </aside>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{children}</h3>
  );
}
