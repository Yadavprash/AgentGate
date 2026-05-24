"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import AuditTable from "@/components/AuditTable";
import DecisionTable from "@/components/DecisionTable";
import HeroStats from "@/components/HeroStats";
import ThreatBlocked from "@/components/ThreatBlocked";
import WhatClaudeSaw from "@/components/WhatClaudeSaw";
import ActionDrawer from "@/components/ActionDrawer";
import ActorBreakdown from "@/components/ActorBreakdown";
import AnomalyBanner from "@/components/AnomalyBanner";
import {
  supabase,
  supabaseConfigured,
  type ActionRow,
  type AuditEventRow,
} from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Export helpers
// ---------------------------------------------------------------------------

function exportCSV(rows: ActionRow[]) {
  const headers = ["id", "agent_name", "tool_name", "risk", "status", "cost", "created_at", "decided_at"];
  const lines = [
    headers.join(","),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = r[h as keyof ActionRow];
        if (v == null) return "";
        const s = String(v);
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    ),
  ];
  download("agentgate-actions.csv", lines.join("\n"), "text/csv");
}

function exportJSON(rows: ActionRow[], events: AuditEventRow[]) {
  download("agentgate-export.json", JSON.stringify({ actions: rows, audit_events: events }, null, 2), "application/json");
}

function download(filename: string, content: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TIME_PRESETS = ["Last 1h", "Last 24h", "Last 7d", "All time"];

export default function Home() {
  const [rows, setRows]               = useState<ActionRow[]>([]);
  const [decisionRows, setDecisionRows] = useState<AuditEventRow[]>([]);
  const [live, setLive]               = useState(false);
  const [selectedAction, setSelectedAction] = useState<ActionRow | null>(null);
  const [agentFilter, setAgentFilter] = useState("all");
  const [timeFilter, setTimeFilter]   = useState("Last 24h");
  const [exportOpen, setExportOpen]   = useState(false);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;

    sb.from("actions").select("*").order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => { if (data) setRows(data as ActionRow[]); });

    sb.from("audit_events").select("*").order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { if (data) setDecisionRows(data as AuditEventRow[]); });

    const ch1 = sb.channel("actions-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "actions" }, (payload) => {
        const row = payload.new as ActionRow;
        if (!row?.id) return;
        setRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      })
      .subscribe((s) => setLive(s === "SUBSCRIBED"));

    const ch2 = sb.channel("audit-events-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_events" }, (payload) => {
        const row = payload.new as AuditEventRow;
        if (!row?.id) return;
        setDecisionRows((prev) => [row, ...prev.filter((r) => r.id !== row.id)].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200));
      })
      .subscribe();

    return () => { sb.removeChannel(ch1); sb.removeChannel(ch2); };
  }, []);

  const agents = useMemo(
    () => Array.from(new Set(rows.map((r) => r.agent_name).filter(Boolean))).sort(),
    [rows],
  );
  const actionMap = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.id, r])),
    [rows],
  );
  const filteredRows = useMemo(
    () => (agentFilter === "all" ? rows : rows.filter((r) => r.agent_name === agentFilter)),
    [rows, agentFilter],
  );
  const filteredDecisionRows = useMemo(() => {
    if (agentFilter === "all") return decisionRows;
    const ids = new Set(filteredRows.map((r) => r.id));
    return decisionRows.filter((e) => !e.action_id || ids.has(e.action_id));
  }, [decisionRows, filteredRows, agentFilter]);

  const handleExportCSV  = useCallback(() => { exportCSV(filteredRows); setExportOpen(false); }, [filteredRows]);
  const handleExportJSON = useCallback(() => { exportJSON(filteredRows, filteredDecisionRows); setExportOpen(false); }, [filteredRows, filteredDecisionRows]);

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">

      {/* Anomaly banner */}
      <AnomalyBanner rows={rows} decisionRows={decisionRows} />

      {/* Supabase config warning */}
      {!supabaseConfigured && (
        <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          Supabase not configured. Create{" "}
          <code className="font-mono">dashboard/.env.local</code> with{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      {/* ── Title + filter bar ── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Bastion SDK</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Three-layer trust system for autonomous AI agents
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Agent filter */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#13161f] dark:text-zinc-200"
          >
            <option value="all">All Agents</option>
            {agents.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          {/* Time filter */}
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value)}
            className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#13161f] dark:text-zinc-200"
          >
            {TIME_PRESETS.map((t) => <option key={t}>{t}</option>)}
          </select>

          <Link
            href="/pitch"
            className="rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-sm font-medium text-purple-400 hover:bg-purple-500/20"
          >
            View pitch →
          </Link>

          {/* Live indicator */}
          <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
            live
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-zinc-300 bg-zinc-100 text-zinc-500 dark:border-white/[0.06] dark:bg-white/[0.03] dark:text-zinc-500"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-400" : "bg-zinc-400"}`} />
            {live ? "Live" : "Connecting…"}
          </span>

          {/* Export */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-[#13161f] dark:text-zinc-400 dark:hover:bg-white/[0.05]"
            >
              ↓ Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-black/[0.08] bg-white shadow-xl dark:border-white/[0.06] dark:bg-[#13161f]">
                <button onClick={handleExportCSV} className="w-full px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/[0.04]">
                  Download CSV
                </button>
                <button onClick={handleExportJSON} className="w-full border-t border-black/[0.06] px-4 py-2.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.04]">
                  Download JSON
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hero stats */}
      <HeroStats rows={filteredRows} />

      {/* Two-column middle section */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_420px]">

        {/* Left column */}
        <div className="space-y-4">
          <ThreatBlocked rows={filteredRows} />
          <WhatClaudeSaw rows={filteredRows} />
          <ActorBreakdown rows={filteredDecisionRows} actions={filteredRows} />
        </div>

        {/* Right column — Decision Trail */}
        <DecisionTable rows={filteredDecisionRows} actionMap={actionMap} />
      </div>

      {/* Full-width Actions table */}
      <div className="mt-5">
        <AuditTable rows={filteredRows} onSelect={setSelectedAction} />
      </div>

      <ActionDrawer
        action={selectedAction}
        allEvents={decisionRows}
        onClose={() => setSelectedAction(null)}
      />
    </main>
  );
}
