"use client";

import { useState } from "react";

type Format = "pdf" | "json" | "csv";
type Preset = "7d" | "30d" | "90d" | "Q1 2026";

function presetDates(p: Preset): { from: string; to: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const sub = (d: Date, days: number) => { const x = new Date(d); x.setDate(x.getDate() - days); return x; };
  if (p === "7d")  return { from: fmt(sub(now, 7)),  to: fmt(now) };
  if (p === "30d") return { from: fmt(sub(now, 30)), to: fmt(now) };
  if (p === "90d") return { from: fmt(sub(now, 90)), to: fmt(now) };
  return { from: "2026-01-01", to: "2026-03-31" };
}

const RECENT_EXPORTS = [
  { id: "1", by: "vinay",   range: "Apr 1 – Apr 30",  format: "PDF",  size: "2.4 MB", time: "today 14:32" },
  { id: "2", by: "auditor", range: "Q1 2026",          format: "JSON", size: "8.1 MB", time: "yesterday" },
];

export default function AuditPage() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [from, setFrom]     = useState("2026-04-01");
  const [to, setTo]         = useState("2026-04-30");
  const [format, setFormat] = useState<Format>("pdf");
  const [includes, setIncludes] = useState({
    chain: true, stats: true, actors: true, events: true, rawArgs: false,
  });
  const [generating, setGenerating] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  function applyPreset(p: Preset) {
    setPreset(p);
    const d = presetDates(p);
    setFrom(d.from);
    setTo(d.to);
  }

  async function generate() {
    setGenerating(true);
    setExportError(null);
    try {
      const params = new URLSearchParams({ from, to, format });
      const res = await fetch(`/api/audit/export?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setExportError(data.error ?? `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `bastion-audit.${format === "pdf" ? "txt" : format}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setExportError(String(err));
    } finally {
      setGenerating(false);
    }
  }

  const toggleInclude = (k: keyof typeof includes) =>
    setIncludes((p) => ({ ...p, [k]: !p[k] }));

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Compliance Export</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Generate audit reports for regulators, legal counsel, or internal review.
        </p>
      </div>

      {/* Two-column builder */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">

        {/* Left: Date range + Format */}
        <div className="space-y-4">

          {/* Date range */}
          <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.06] dark:bg-[#13161f]">
            <div className="border-b border-black/[0.06] px-5 py-3 dark:border-white/[0.04]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Date Range</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center gap-3">
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">From</p>
                  <input
                    type="date"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    className="rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-2 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">To</p>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-2 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                {(["7d", "30d", "90d", "Q1 2026"] as Preset[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      preset === p
                        ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                        : "border border-black/[0.08] text-zinc-500 hover:border-zinc-400 dark:border-white/[0.06] dark:text-zinc-400"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Format */}
          <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.06] dark:bg-[#13161f]">
            <div className="border-b border-black/[0.06] px-5 py-3 dark:border-white/[0.04]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Format</span>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {([
                ["pdf",  "PDF", "signed, for auditors"],
                ["json", "JSON", "raw + full chain"],
                ["csv",  "CSV", "tabular"],
              ] as [Format, string, string][]).map(([val, label, desc]) => (
                <label key={val} className="flex cursor-pointer items-center gap-3">
                  <div className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    format === val ? "border-sky-500 bg-sky-500" : "border-zinc-400 dark:border-zinc-600"
                  }`}>
                    {format === val && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                  </div>
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</span>
                  <span className="text-xs text-zinc-500">{desc}</span>
                  <input type="radio" className="sr-only" value={val} checked={format === val} onChange={() => setFormat(val)} />
                </label>
              ))}
            </div>
          </div>

          {/* Recent exports */}
          <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.06] dark:bg-[#13161f]">
            <div className="border-b border-black/[0.06] px-5 py-3 dark:border-white/[0.04]">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Recent Exports</span>
            </div>
            <div className="divide-y divide-black/[0.05] dark:divide-white/[0.04]">
              {RECENT_EXPORTS.map((exp) => (
                <div key={exp.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {exp.range} · {exp.format}
                    </p>
                    <p className="text-[11px] text-zinc-500">{exp.by} · {exp.size} · {exp.time}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-emerald-400">✓ ready</span>
                    <button className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-400 dark:hover:bg-white/[0.05]">
                      ⬇ Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Report contents + Generate */}
        <div className="rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.06] dark:bg-[#13161f]">
          <div className="border-b border-black/[0.06] px-5 py-3 dark:border-white/[0.04]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Report Contents</span>
          </div>
          <div className="px-5 py-4 space-y-3">
            {([
              ["chain",   "Chain verification result",  true],
              ["stats",   "Summary statistics",         true],
              ["actors",  "Actor breakdown",            true],
              ["events",  "Full event table + hashes",  true],
              ["rawArgs", "Raw tool arguments",         false],
            ] as [keyof typeof includes, string, boolean][]).map(([k, label, recommended]) => (
              <label key={k} className="flex cursor-pointer items-center gap-3">
                <div
                  onClick={() => toggleInclude(k)}
                  className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors ${
                    includes[k]
                      ? "border-sky-500 bg-sky-500"
                      : "border-zinc-400 dark:border-zinc-600"
                  }`}
                >
                  {includes[k] && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 10" fill="currentColor">
                      <path d="M8.5 2L4 7 1.5 4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="flex-1 text-sm text-zinc-700 dark:text-zinc-300">{label}</span>
                {!recommended && (
                  <span className="text-[10px] text-amber-400">off for HIPAA</span>
                )}
              </label>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1 px-5 py-6">
            <p className="text-xs text-zinc-500">
              The report will include a cover page with chain integrity verification, followed by the selected sections above.
              PDF reports are digitally stamped with the export timestamp and signing key prefix.
            </p>
          </div>

          {/* Generate button */}
          <div className="border-t border-black/[0.06] px-5 py-4 dark:border-white/[0.04] space-y-2">
            {exportError && (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                ✕ {exportError}
              </p>
            )}
            <button
              onClick={generate}
              disabled={generating}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate Export"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
