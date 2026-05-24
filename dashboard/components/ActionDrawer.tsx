"use client";

/**
 * ActionDrawer
 *
 * Slides in from the right when the user clicks a row in AuditTable.
 * Shows the full lifecycle of an action as a vertical hash-chain timeline,
 * with truncated hashes that can be clicked to copy the full value.
 */

import { useEffect } from "react";
import type { ActionRow, AuditEventRow } from "@/lib/supabase";
import StatusChip from "./StatusChip";

// ---------------------------------------------------------------------------
// Colour maps
// ---------------------------------------------------------------------------

const EVENT_BADGE: Record<string, string> = {
  intercepted:    "border-amber-500/40   bg-amber-500/15   text-amber-700   dark:text-amber-300",
  auto_approved:  "border-emerald-500/40 bg-emerald-500/15 text-emerald-700  dark:text-emerald-300",
  approved:       "border-emerald-500/40 bg-emerald-500/15 text-emerald-700  dark:text-emerald-300",
  denied:         "border-red-500/40     bg-red-500/15     text-red-700     dark:text-red-300",
  completed:      "border-sky-500/40     bg-sky-500/15     text-sky-700     dark:text-sky-300",
  timed_out:      "border-zinc-500/40    bg-zinc-500/15    text-zinc-600    dark:text-zinc-400",
  failed:         "border-red-500/40     bg-red-500/15     text-red-700     dark:text-red-300",
  redaction:      "border-purple-500/40  bg-purple-500/15  text-purple-700  dark:text-purple-300",
  threat:         "border-red-500/40     bg-red-500/15     text-red-700     dark:text-red-300",
  final_response: "border-sky-500/40     bg-sky-500/15     text-sky-700     dark:text-sky-300",
};

const ACTOR_COLOR: Record<string, string> = {
  human:  "text-amber-600 dark:text-amber-300",
  ai:     "text-sky-600   dark:text-sky-300",
  system: "text-zinc-500  dark:text-zinc-400",
};

const DOT_COLOR: Record<string, string> = {
  intercepted:    "bg-amber-400",
  auto_approved:  "bg-emerald-400",
  approved:       "bg-emerald-400",
  completed:      "bg-sky-400",
  denied:         "bg-red-400",
  timed_out:      "bg-zinc-400",
  failed:         "bg-red-400",
  redaction:      "bg-purple-400",
  threat:         "bg-red-400",
  final_response: "bg-sky-400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(ts: string) {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function short(hash: string | null | undefined) {
  if (!hash) return "—";
  return hash.slice(0, 8) + "…";
}

async function copyHash(hash: string) {
  try { await navigator.clipboard.writeText(hash); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActionDrawer({
  action,
  allEvents,
  onClose,
}: {
  action: ActionRow | null;
  allEvents: AuditEventRow[];
  onClose: () => void;
}) {
  // Close on Escape
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="slide-in-right fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">

        {/* ── Header ── */}
        <div className="flex items-start justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {action.tool_name}
              </span>
              <StatusChip status={action.status} />
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {action.agent_name} · {fmt(action.created_at)}
            </p>
            <p className="mt-1 font-mono text-[10px] text-zinc-400 break-all">
              {action.id}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 flex-shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Close"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Meta grid */}
          <div className="grid grid-cols-3 gap-3">
            <MetaCell label="Risk">
              <span className={action.risk === "high" ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"}>
                {action.risk.toUpperCase()}
              </span>
            </MetaCell>
            <MetaCell label="Cost">
              <span className="text-zinc-700 dark:text-zinc-300">
                {action.cost != null ? `$${Number(action.cost).toFixed(2)}` : "—"}
              </span>
            </MetaCell>
            <MetaCell label="Mode">
              <span className="text-zinc-700 dark:text-zinc-300 capitalize">{action.mode}</span>
            </MetaCell>
          </div>

          {/* Tool args */}
          {Object.keys(action.tool_args).length > 0 && (
            <div>
              <SectionHeading>Tool Arguments</SectionHeading>
              <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                {JSON.stringify(action.tool_args, null, 2)}
              </pre>
            </div>
          )}

          {/* Audit chain timeline */}
          <div>
            <SectionHeading>
              Audit Chain · {events.length} event{events.length !== 1 ? "s" : ""}
            </SectionHeading>

            {events.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-400">No audit events recorded yet.</p>
            ) : (
              <div className="relative mt-3">
                {/* Vertical connector line */}
                {events.length > 1 && (
                  <div className="absolute left-[7px] top-4 bottom-4 w-px bg-zinc-200 dark:bg-zinc-800" />
                )}

                <div className="space-y-5">
                  {events.map((ev, idx) => (
                    <div key={ev.id} className="relative flex gap-3">
                      {/* Timeline dot */}
                      <div className="relative z-10 mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                        <div
                          className={`h-3 w-3 rounded-full border-2 border-white dark:border-zinc-950 ${DOT_COLOR[ev.event_type] ?? "bg-zinc-400"}`}
                        />
                      </div>

                      {/* Event card */}
                      <div className="flex-1 min-w-0 rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
                        {/* Top row: badge + actor + version + time */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${EVENT_BADGE[ev.event_type] ?? EVENT_BADGE.failed}`}>
                            {ev.event_type}
                          </span>
                          <span className={`text-[10px] font-semibold uppercase ${ACTOR_COLOR[ev.actor] ?? ACTOR_COLOR.system}`}>
                            {ev.actor}
                          </span>
                          <span className="text-[10px] text-zinc-400">v{ev.decision_version}</span>
                          <span className="ml-auto text-[10px] text-zinc-400 tabular-nums">
                            {fmt(ev.created_at)}
                          </span>
                        </div>

                        {/* Hash chain row */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[9px] uppercase tracking-wide text-zinc-400">hash</span>
                          <button
                            title="Click to copy full hash"
                            onClick={() => ev.this_hash && copyHash(ev.this_hash)}
                            className="font-mono text-[10px] text-emerald-600 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-200"
                          >
                            {short(ev.this_hash)}
                          </button>
                          {idx > 0 && (
                            <>
                              <span className="text-[10px] text-zinc-300 dark:text-zinc-700">←</span>
                              <span className="text-[9px] uppercase tracking-wide text-zinc-400">prev</span>
                              <span className="font-mono text-[10px] text-zinc-400">
                                {short(ev.prev_hash)}
                              </span>
                            </>
                          )}
                          {idx === 0 && (
                            <span className="rounded bg-zinc-200 px-1 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                              genesis
                            </span>
                          )}
                        </div>

                        {/* Payload (if non-empty) */}
                        {ev.payload && Object.keys(ev.payload).length > 0 && (
                          <pre className="mt-2 overflow-x-auto rounded bg-white p-2 font-mono text-[10px] text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400 whitespace-pre-wrap break-all">
                            {JSON.stringify(ev.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

// ---------------------------------------------------------------------------
// Small layout helpers
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
      {children}
    </h3>
  );
}

function MetaCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{children}</div>
    </div>
  );
}
