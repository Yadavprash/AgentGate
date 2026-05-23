"use client";

import { useEffect, useMemo, useState } from "react";
import AuditTable from "@/components/AuditTable";
import { supabase, supabaseConfigured, type ActionRow } from "@/lib/supabase";

export default function Home() {
  const [rows, setRows] = useState<ActionRow[]>([]);
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

    const channel = sb
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

    return () => {
      sb.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      intercepted: rows.filter((r) => r.status === "intercepted").length,
      denied: rows.filter((r) => r.status === "denied").length,
      passed: rows.filter((r) =>
        ["auto_approved", "approved", "completed"].includes(r.status),
      ).length,
    };
  }, [rows]);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">AgentGate</h1>
          <p className="text-sm text-zinc-500">
            Live audit log of intercepted AI agent actions
          </p>
        </div>
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
      </header>

      {!supabaseConfigured && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
          Supabase is not configured. Create{" "}
          <code className="font-mono">dashboard/.env.local</code> with{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </div>
      )}

      <div className="mb-6 grid grid-cols-4 gap-4">
        <Stat label="Total actions" value={stats.total} />
        <Stat label="Auto / approved" value={stats.passed} tone="emerald" />
        <Stat label="Awaiting human" value={stats.intercepted} tone="amber" />
        <Stat label="Blocked" value={stats.denied} tone="red" />
      </div>

      <AuditTable rows={rows} />
    </main>
  );
}

function Stat({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number;
  tone?: "zinc" | "emerald" | "amber" | "red";
}) {
  const colors: Record<string, string> = {
    zinc: "text-zinc-100",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    red: "text-red-300",
  };
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${colors[tone]}`}>
        {value}
      </div>
    </div>
  );
}
