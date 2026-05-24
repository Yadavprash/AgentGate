"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import AuditTable from "@/components/AuditTable";
import DecisionTable from "@/components/DecisionTable";
import HeroStats from "@/components/HeroStats";
import ThemeToggle from "@/components/ThemeToggle";
import ThreatBlocked from "@/components/ThreatBlocked";
import WhatClaudeSaw from "@/components/WhatClaudeSaw";
import ChainIntegrityBadge from "@/components/ChainIntegrityBadge";
import ActionDrawer from "@/components/ActionDrawer";
import ActorBreakdown from "@/components/ActorBreakdown";
import AnomalyBanner from "@/components/AnomalyBanner";
import HealthStatus from "@/components/HealthStatus";
import {
  supabase,
  supabaseConfigured,
  type ActionRow,
  type AuditEventRow,
} from "@/lib/supabase";

// ---------------------------------------------------------------------------
// CSV / JSON export helpers
// ---------------------------------------------------------------------------

function exportCSV(rows: ActionRow[]) {
  const headers = ["id", "agent_name", "tool_name", "risk", "status", "cost", "created_at", "decided_at"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const v = r[h as keyof ActionRow];
          if (v == null) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    ),
  ];
  download("agentgate-actions.csv", lines.join("\n"), "text/csv");
}

function exportJSON(rows: ActionRow[], events: AuditEventRow[]) {
  const blob = JSON.stringify({ actions: rows, audit_events: events }, null, 2);
  download("agentgate-export.json", blob, "application/json");
}

function download(filename: string, content: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [decisionRows, setDecisionRows] = useState<AuditEventRow[]>([]);
  const [live, setLive] = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionRow | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;

    sb.from("actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setRows(data as ActionRow[]);
      });

    sb.from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (data) setDecisionRows(data as AuditEventRow[]);
      });

    const actionsChannel = sb
      .channel("actions-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "actions" },
        (payload) => {
          const row = payload.new as ActionRow;
          if (!row?.id) return;
          setRows((prev) =>
            [row, ...prev.filter((r) => r.id !== row.id)].sort((a, b) =>
              b.created_at.localeCompare(a.created_at),
            ),
          );
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    const decisionsChannel = sb
      .channel("audit-events-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "audit_events" },
        (payload) => {
          const row = payload.new as AuditEventRow;
          if (!row?.id) return;
          setDecisionRows((prev) =>
            [row, ...prev.filter((r) => r.id !== row.id)]
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 200),
          );
        },
      )
      .subscribe();

    return () => {
      sb.removeChannel(actionsChannel);
      sb.removeChannel(decisionsChannel);
    };
  }, []);

  // Unique agent names for filter dropdown
  const agents = useMemo(
    () => Array.from(new Set(rows.map((r) => r.agent_name).filter(Boolean))).sort(),
    [rows],
  );

  // Build action ID → ActionRow map for DecisionTable agent lookup
  const actionMap = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, r])),
    [rows],
  );

  // Filtered views
  const filteredRows = useMemo(
    () => (agentFilter === "all" ? rows : rows.filter((r) => r.agent_name === agentFilter)),
    [rows, agentFilter],
  );

  const filteredDecisionRows = useMemo(() => {
    if (agentFilter === "all") return decisionRows;
    const ids = new Set(filteredRows.map((r) => r.id));
    return decisionRows.filter((e) => !e.action_id || ids.has(e.action_id));
  }, [decisionRows, filteredRows, agentFilter]);

  const handleExportCSV = useCallback(() => {
    exportCSV(filteredRows);
    setExportOpen(false);
  }, [filteredRows]);

  const handleExportJSON = useCallback(() => {
    exportJSON(filteredRows, filteredDecisionRows);
    setExportOpen(false);
  }, [filteredRows, filteredDecisionRows]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">Bastion SDK</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-500">
            Three-layer trust system for autonomous AI agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <HealthStatus />
          <ChainIntegrityBadge />
          <ThemeToggle />
          <Link
            href="/agents"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-emerald-200"
          >
            ▶ Agents
          </Link>
          <Link
            href="/pitch"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-purple-200"
          >
            View pitch →
          </Link>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              live
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400" : "bg-zinc-500"}`}
            />
            {live ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {!supabaseConfigured && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-100 p-4 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          Supabase is not configured. Create{" "}
          <code className="font-mono">dashboard/.env.local</code> with{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      {/* Anomaly banner — shown only when patterns are detected */}
      <AnomalyBanner rows={rows} decisionRows={decisionRows} />

      {/* ── Filter + Export bar ── */}
      {rows.length > 0 && (
        <div className="mb-5 flex items-center justify-between gap-3">
          {/* Agent filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-zinc-500">Agent</label>
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              <option value="all">All agents ({rows.length})</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a} ({rows.filter((r) => r.agent_name === a).length})
                </option>
              ))}
            </select>
          </div>

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ↓ Export
              <span className="text-zinc-400">{filteredRows.length} rows</span>
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                <button
                  onClick={handleExportCSV}
                  className="w-full rounded-t-lg px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Download CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  className="w-full rounded-b-lg border-t border-zinc-100 px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Download JSON
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <HeroStats rows={filteredRows} />
      <ThreatBlocked rows={filteredRows} />
      <WhatClaudeSaw rows={filteredRows} />
      <ActorBreakdown rows={filteredDecisionRows} actions={filteredRows} />
      <AuditTable rows={filteredRows} onSelect={setSelectedAction} />
      <DecisionTable rows={filteredDecisionRows} actionMap={actionMap} />

      <ActionDrawer
        action={selectedAction}
        allEvents={decisionRows}
        onClose={() => setSelectedAction(null)}
      />
    </main>
  );
}
