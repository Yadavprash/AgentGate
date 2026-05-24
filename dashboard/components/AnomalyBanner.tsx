"use client";

import { useMemo, useState } from "react";
import type { ActionRow, AuditEventRow } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Anomaly detection rules (T3-2)
// Patterns detected client-side from existing audit data.
// ---------------------------------------------------------------------------

type Anomaly = {
  id: string;
  severity: "warning" | "critical";
  title: string;
  detail: string;
};

const DENIAL_WINDOW_MS = 5 * 60 * 1000;      // 5 minutes
const DENIAL_THRESHOLD = 3;
const THREAT_WINDOW_MS = 10 * 60 * 1000;     // 10 minutes
const THREAT_SPIKE_THRESHOLD = 5;
const HIGH_RISK_WINDOW_MS = 10 * 60 * 1000;  // 10 minutes
const HIGH_RISK_SPIKE_THRESHOLD = 5;

function detectAnomalies(rows: ActionRow[], events: AuditEventRow[]): Anomaly[] {
  const now = Date.now();
  const anomalies: Anomaly[] = [];

  // 1. Repeated denials — same tool denied 3+ times in 5 min
  const recentDenials = rows.filter(
    (r) =>
      (r.status === "denied" || r.status === "timed_out") &&
      now - new Date(r.created_at).getTime() < DENIAL_WINDOW_MS,
  );
  const denialsByTool: Record<string, number> = {};
  for (const r of recentDenials) {
    denialsByTool[r.tool_name] = (denialsByTool[r.tool_name] ?? 0) + 1;
  }
  for (const [tool, count] of Object.entries(denialsByTool)) {
    if (count >= DENIAL_THRESHOLD) {
      anomalies.push({
        id: `repeated-denial-${tool}`,
        severity: "critical",
        title: "Repeated denial detected",
        detail: `"${tool}" has been denied ${count} times in the last 5 minutes — possible prompt injection attempt.`,
      });
    }
  }

  // 2. Threat blocked spike — 5+ threat_blocked events in 10 min
  const recentThreats = events.filter(
    (e) =>
      e.event_type === "threat" &&
      now - new Date(e.created_at).getTime() < THREAT_WINDOW_MS,
  );
  if (recentThreats.length >= THREAT_SPIKE_THRESHOLD) {
    anomalies.push({
      id: "threat-spike",
      severity: "critical",
      title: "Threat spike",
      detail: `${recentThreats.length} threats blocked in the last 10 minutes. Review agent inputs immediately.`,
    });
  }

  // 3. High-risk action spike — 5+ high-risk actions in 10 min
  const recentHighRisk = rows.filter(
    (r) =>
      r.risk === "high" &&
      now - new Date(r.created_at).getTime() < HIGH_RISK_WINDOW_MS,
  );
  if (recentHighRisk.length >= HIGH_RISK_SPIKE_THRESHOLD) {
    anomalies.push({
      id: "high-risk-spike",
      severity: "warning",
      title: "High-risk activity spike",
      detail: `${recentHighRisk.length} high-risk actions in the last 10 minutes — above normal threshold.`,
    });
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AnomalyBanner({
  rows,
  decisionRows,
}: {
  rows: ActionRow[];
  decisionRows: AuditEventRow[];
}) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const anomalies = useMemo(
    () => detectAnomalies(rows, decisionRows),
    [rows, decisionRows],
  );

  const visible = anomalies.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="mb-5 space-y-2">
      {visible.map((a) => (
        <div
          key={a.id}
          className={`flex items-start justify-between gap-3 rounded-lg border p-4 ${
            a.severity === "critical"
              ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-base leading-none">
              {a.severity === "critical" ? "🚨" : "⚠️"}
            </span>
            <div>
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="mt-0.5 text-xs opacity-80">{a.detail}</p>
            </div>
          </div>
          <button
            onClick={() => setDismissed((prev) => new Set([...prev, a.id]))}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
