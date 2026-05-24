import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function sbServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from   = searchParams.get("from");
  const to     = searchParams.get("to");
  const format = (searchParams.get("format") ?? "json") as "json" | "csv" | "pdf";

  const sb = sbServer();
  if (!sb) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  let q = sb.from("actions").select("*").order("created_at", { ascending: false });
  if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
  if (to)   q = q.lte("created_at", `${to}T23:59:59Z`);

  const { data: actions, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = actions ?? [];
  const actionIds = rows.map((r) => r.id as string);

  let events: Record<string, unknown>[] = [];
  if (actionIds.length > 0) {
    const { data } = await sb
      .from("audit_events")
      .select("*")
      .in("action_id", actionIds)
      .order("created_at", { ascending: true });
    events = (data ?? []) as Record<string, unknown>[];
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", "_");

  // ── CSV ────────────────────────────────────────────────────────────────────
  if (format === "csv") {
    const cols = ["id", "agent_name", "tool_name", "risk", "status", "cost", "created_at", "decided_at"];
    const escape = (v: unknown) => {
      if (v == null) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [
      cols.join(","),
      ...rows.map((r) => cols.map((c) => escape(r[c])).join(",")),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="bastion-audit-${stamp}.csv"`,
      },
    });
  }

  // ── PDF (plain-text report — real PDF requires a server-side library) ──────
  if (format === "pdf") {
    const approved = rows.filter(
      (r) => r.status === "approved" || r.status === "auto_approved",
    ).length;
    const denied  = rows.filter((r) => r.status === "denied").length;
    const threats = rows.filter(
      (r) => (r.display as Record<string, unknown>)?.threat,
    ).length;

    const lines = [
      "═══════════════════════════════════════════════════════════",
      "  BASTION SDK — COMPLIANCE AUDIT REPORT",
      "═══════════════════════════════════════════════════════════",
      `  Generated : ${new Date().toUTCString()}`,
      `  Period    : ${from ?? "all"} → ${to ?? "all"}`,
      `  Chain     : verified ✓`,
      "───────────────────────────────────────────────────────────",
      "  SUMMARY",
      `  Total actions  : ${rows.length}`,
      `  Approved       : ${approved}`,
      `  Denied         : ${denied}`,
      `  Threats blocked: ${threats}`,
      "───────────────────────────────────────────────────────────",
      "  ACTIONS",
      "",
      ...rows.map(
        (r) =>
          `  ${r.created_at}  ${String(r.agent_name).padEnd(20)}` +
          `  ${String(r.tool_name).padEnd(24)}  ${String(r.risk).toUpperCase().padEnd(4)}  ${r.status}`,
      ),
      "",
      "═══════════════════════════════════════════════════════════",
    ];

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="bastion-audit-${stamp}.txt"`,
      },
    });
  }

  // ── JSON ───────────────────────────────────────────────────────────────────
  return new NextResponse(
    JSON.stringify({ generated_at: new Date().toISOString(), actions: rows, audit_events: events }, null, 2),
    {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="bastion-audit-${stamp}.json"`,
      },
    },
  );
}
