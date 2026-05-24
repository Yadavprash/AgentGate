"use client";

import { useEffect, useState } from "react";

type HealthData = {
  status: "ok" | "degraded" | "unreachable";
  version?: string;
  components?: Record<string, string>;
  uptime_seconds?: number;
};

function uptimeLabel(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function HealthStatus() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/health");
        const data: HealthData = await res.json();
        setHealth(data);
      } catch {
        setHealth({ status: "unreachable" });
      }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, []);

  if (!health) return null;

  const { status } = health;
  const color =
    status === "ok"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "degraded"
      ? "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300"
      : "border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-300";

  const dot =
    status === "ok"
      ? "bg-emerald-400"
      : status === "degraded"
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${color}`}
        title="Gateway health"
      >
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        Gateway {status === "ok" ? "OK" : status === "degraded" ? "Degraded" : "Down"}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-lg border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Gateway Health
              </span>
              {health.version && (
                <span className="text-[10px] text-zinc-400">v{health.version}</span>
              )}
            </div>

            {health.components && (
              <div className="space-y-1">
                {Object.entries(health.components).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between">
                    <span className="text-[11px] capitalize text-zinc-500">{k}</span>
                    <span
                      className={`text-[11px] font-medium ${
                        v === "ok"
                          ? "text-emerald-600 dark:text-emerald-400"
                          : v === "error"
                          ? "text-red-600 dark:text-red-400"
                          : "text-zinc-400"
                      }`}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {health.uptime_seconds != null && (
              <div className="mt-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                <span className="text-[10px] text-zinc-400">
                  Uptime: {uptimeLabel(health.uptime_seconds)}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
