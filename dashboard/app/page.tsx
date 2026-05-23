"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AuditTable from "@/components/AuditTable";
import DecisionTable from "@/components/DecisionTable";
import HeroStats from "@/components/HeroStats";
import ThreatBlocked from "@/components/ThreatBlocked";
import WhatClaudeSaw from "@/components/WhatClaudeSaw";
import {
  supabase,
  supabaseConfigured,
  type ActionRow,
  type AuditEventRow,
} from "@/lib/supabase";

export default function Home() {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [decisionRows, setDecisionRows] = useState<AuditEventRow[]>([]);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;

    sb
      .from("actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (data) setRows(data as ActionRow[]);
      });

    sb
      .from("audit_events")
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

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">AgentGate</h1>
          <p className="text-sm text-zinc-500">
            Three-layer trust system for autonomous AI agents
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/pitch"
            className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-purple-200"
          >
            View pitch →
          </Link>
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
              live
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-zinc-700 bg-zinc-800 text-zinc-400"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                live ? "bg-emerald-400" : "bg-zinc-500"
              }`}
            />
            {live ? "Live" : "Connecting…"}
          </span>
        </div>
      </header>

      {!supabaseConfigured && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Supabase is not configured. Create{" "}
          <code className="font-mono">dashboard/.env.local</code> with{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      <HeroStats rows={rows} />
      <ThreatBlocked rows={rows} />
      <WhatClaudeSaw rows={rows} />
      <AuditTable rows={rows} />
      <DecisionTable rows={decisionRows} />
    </main>
  );
}
