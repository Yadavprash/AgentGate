"use client";

/**
 * ChainIntegrityBadge
 *
 * Fetches all audit_events in seq-ascending order, re-implements the Python
 * canonical() + SHA-256 hash in the browser, and verifies that every row's
 * this_hash matches a fresh recomputation — proving the log is tamper-evident.
 *
 * Re-verifies automatically whenever a new INSERT lands on audit_events via
 * Supabase Realtime. Click the badge to trigger a manual re-verify.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured, type AuditEventRow } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Hash helpers — must match gateway/audit_log.py canonical() exactly
// ---------------------------------------------------------------------------

/** Recursively sort object keys so JSON output matches Python's sort_keys=True. */
function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object).sort()) {
      out[k] = sortedJson((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

/**
 * Canonical JSON string — mirrors Python:
 *   json.dumps({...}, sort_keys=True, separators=(",", ":"))
 * prevHash is always a string ("" for the genesis event).
 */
function makeCanonical(row: AuditEventRow, prevHash: string): string {
  return JSON.stringify(
    sortedJson({
      event_type: row.event_type,
      action_id: row.action_id,
      actor: row.actor,
      decision_kind: row.decision_kind,
      decision_version: row.decision_version,
      payload: row.payload,
      prev_hash: prevHash,
    }),
  );
}

async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyRows(
  rows: AuditEventRow[],
): Promise<{ failures: number }> {
  let prevHash = "";
  let failures = 0;

  for (const row of rows) {
    // Check 1: prev_hash pointer is consistent with the running chain.
    const storedPrev = row.prev_hash ?? "";
    if (storedPrev !== prevHash) failures++;

    // Check 2: this_hash matches a fresh recomputation.
    const recomputed = await sha256hex(makeCanonical(row, prevHash));
    if (recomputed !== row.this_hash) failures++;

    prevHash = row.this_hash;
  }

  return { failures };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type VerifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ok"; count: number }
  | { status: "broken"; count: number; failures: number };

export default function ChainIntegrityBadge() {
  const [state, setState] = useState<VerifyState>({ status: "idle" });

  const verify = useCallback(async () => {
    if (!supabase) return;
    setState({ status: "loading" });

    const { data, error } = await supabase
      .from("audit_events")
      .select("*")
      .order("seq", { ascending: true });

    if (error || !data) {
      setState({ status: "idle" });
      return;
    }
    if (data.length === 0) {
      setState({ status: "empty" });
      return;
    }

    const rows = data as AuditEventRow[];
    const { failures } = await verifyRows(rows);

    setState(
      failures === 0
        ? { status: "ok", count: rows.length }
        : { status: "broken", count: rows.length, failures },
    );
  }, []);

  // Initial verify + re-verify on new inserts.
  useEffect(() => {
    if (!supabaseConfigured || !supabase) return;
    verify();

    const channel = supabase
      .channel("chain-integrity-watch")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_events" },
        () => verify(),
      )
      .subscribe();

    return () => { supabase!.removeChannel(channel); };
  }, [verify]);

  if (!supabaseConfigured) return null;

  // ---- Render states ----

  if (state.status === "idle" || state.status === "loading") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
        <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-400" />
        Verifying chain…
      </span>
    );
  }

  if (state.status === "empty") {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-zinc-300 bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
        <span className="h-2 w-2 rounded-full bg-zinc-400" />
        No audit events
      </span>
    );
  }

  if (state.status === "ok") {
    return (
      <button
        onClick={verify}
        title="Click to re-verify the audit chain"
        className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-500/25 dark:text-emerald-300"
      >
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        ✓ Chain Verified · {state.count} events
      </button>
    );
  }

  // broken
  return (
    <button
      onClick={verify}
      title="Click to re-verify"
      className="threat-pulse inline-flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/15 px-3 py-1 text-xs font-medium text-red-700 dark:text-red-300"
    >
      <span className="h-2 w-2 rounded-full bg-red-400" />
      🚨 Chain Broken · {state.failures} tampered
    </button>
  );
}
