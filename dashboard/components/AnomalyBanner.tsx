"use client";

import { useMemo, useState } from "react";
import type { ActionRow, AuditEventRow } from "@/lib/supabase";

type Anomaly = { id: string; severity: "warning" | "critical"; title: string; detail: string };

function detectAnomalies(rows: ActionRow[], events: AuditEventRow[]): Anomaly[] {
  const now = Date.now();
  const anomalies: Anomaly[] = [];

  const recentDenials = rows.filter(
    (r) => (r.status === "denied" || r.status === "timed_out") &&
      now - new Date(r.created_at).getTime() < 5 * 60_000,
  );
  const denialsByTool: Record<string, number> = {};
  for (const r of recentDenials) {
    denialsByTool[r.tool_name] = (denialsByTool[r.tool_name] ?? 0) + 1;
  }
  for (const [tool, count] of Object.entries(denialsByTool)) {
    if (count >= 3) {
      anomalies.push({
        id: `denial-${tool}`,
        severity: "critical",
        title: `Anomaly Detected — ${tool} denial rate spiked ${count}× in last 10 min`,
        detail: `Denied ${count} of last ${recentDenials.length} calls · possibly a prompt injection · ${tool}`,
      });
    }
  }

  const recentThreats = events.filter(
    (e) => e.event_type === "threat" && now - new Date(e.created_at).getTime() < 10 * 60_000,
  );
  if (recentThreats.length >= 5) {
    anomalies.push({
      id: "threat-spike",
      severity: "critical",
      title: `Threat spike — ${recentThreats.length} threats blocked in the last 10 min`,
      detail: "Review agent inputs immediately.",
    });
  }

  return anomalies;
}

export default function AnomalyBanner({
  rows,
  decisionRows,
}: {
  rows: ActionRow[];
  decisionRows: AuditEventRow[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState<Set<string>>(new Set());

  const anomalies = useMemo(() => detectAnomalies(rows, decisionRows), [rows, decisionRows]);
  const visible = anomalies.filter((a) => !dismissed.has(a.id) && !muted.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {visible.map((a) => (
        <div
          key={a.id}
          className="flex items-start justify-between gap-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-3"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-base">⚠️</span>
            <div>
              <p className="text-sm font-semibold text-amber-200">{a.title}</p>
              <p className="mt-0.5 text-xs text-amber-300/70">{a.detail}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setMuted((p) => new Set([...p, a.id]))}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
            >
              Mute 1h
            </button>
            <button
              className="rounded-lg border border-amber-400/50 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/25"
            >
              Investigate →
            </button>
            <button
              onClick={() => setDismissed((p) => new Set([...p, a.id]))}
              className="rounded p-1 text-amber-400/60 hover:text-amber-400"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
