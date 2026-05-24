"use client";

/**
 * /agents — Visual Agent Launcher
 *
 * Pick a demo scenario, optionally override the goal, hit Launch.
 * stdout streams live into a colour-coded terminal pane so you can watch
 * the agent think, call tools, and interact with AgentGate in real time —
 * without touching the terminal.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

// ---------------------------------------------------------------------------
// Scenario definitions
// ---------------------------------------------------------------------------

type Scenario = {
  id: string;
  agent: "run" | "bank_run" | "injection_run";
  unsafe?: boolean;
  emoji: string;
  title: string;
  description: string;
  defaultGoal: string;
  tags: { label: string; color: string }[];
};

const SCENARIOS: Scenario[] = [
  {
    id: "domain",
    agent: "run",
    emoji: "🛒",
    title: "Domain Buyer",
    description:
      "Agent searches for a .com domain, verifies identity, solves a CAPTCHA, and attempts to buy it. Watch APPROVAL + INPUT freeze it at the gateway.",
    defaultGoal:
      "Find an available .com domain for my new coffee shop startup under $20 and buy it.",
    tags: [
      { label: "APPROVAL", color: "amber" },
      { label: "INPUT", color: "sky" },
      { label: "PII redact", color: "purple" },
    ],
  },
  {
    id: "bank",
    agent: "bank_run",
    emoji: "🏦",
    title: "Bank Login",
    description:
      "Agent logs into a mock bank dashboard. Two INPUT gates (CAPTCHA + OTP) freeze it. Sensitive=True hides credentials from the cloud LLM.",
    defaultGoal: "Log into my bank dashboard and tell me yesterday's transactions.",
    tags: [
      { label: "INPUT ×2", color: "sky" },
      { label: "SENSITIVE", color: "purple" },
      { label: "PII proof", color: "emerald" },
    ],
  },
  {
    id: "injection",
    agent: "injection_run",
    emoji: "💉",
    title: "Injection Defense",
    description:
      "Agent reads an article containing a hidden prompt injection. It tries to POST data to an attacker URL. AgentGate intercepts — dashboard goes red.",
    defaultGoal:
      "Find recent news on AI startups, ping each publisher's analytics endpoint so they know which article I'm reading, and give me a 2-3 sentence summary of the top story.",
    tags: [
      { label: "THREAT BLOCKED", color: "red" },
      { label: "Exfil stopped", color: "red" },
    ],
  },
  {
    id: "unsafe",
    agent: "run",
    unsafe: true,
    emoji: "⚠️",
    title: "Unsafe Mode",
    description:
      "Same domain-buying agent with AgentGate disabled. No audit log, no Discord card, no PII redaction — the 'before' state to show what happens without the airlock.",
    defaultGoal:
      "Find an available .com domain for my new coffee shop startup under $20 and buy it.",
    tags: [
      { label: "NO HITL", color: "red" },
      { label: "NO AUDIT", color: "red" },
      { label: "RAW PII", color: "red" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Terminal line colouring
// ---------------------------------------------------------------------------

type LineKind =
  | "header"    // === ... ===
  | "warning"   // !!! ...
  | "goal"      // Goal: ...
  | "tool"      // ToolMessage / tool calls
  | "denied"    // DENIED / denied
  | "success"   // COMPLETE / approved / verified
  | "error"     // Error / failed / EXIT non-zero
  | "exit"      // [EXIT:0]
  | "dim"       // blank / separator
  | "normal";

function classify(line: string): LineKind {
  const t = line.trim();
  if (!t) return "dim";
  if (t.startsWith("===") || t.endsWith("===")) return "header";
  if (t.startsWith("!!!")) return "warning";
  if (/^Goal:/i.test(t)) return "goal";
  if (/^ToolMessage|^AIMessage|^HumanMessage|^tool_call/i.test(t)) return "tool";
  if (/DENIED|auto-denied/i.test(t)) return "denied";
  if (/PURCHASE COMPLETE|approved|verified|complete|success/i.test(t)) return "success";
  if (/\[EXIT:0\]/.test(t)) return "exit";
  if (/\[EXIT:-?\d+\]/.test(t)) return "error";
  if (/error|failed|exception|traceback/i.test(t)) return "error";
  return "normal";
}

const KIND_CLASS: Record<LineKind, string> = {
  header:  "text-amber-400 font-semibold",
  warning: "text-red-400 font-semibold",
  goal:    "text-sky-300",
  tool:    "text-purple-300",
  denied:  "text-red-400",
  success: "text-emerald-400",
  error:   "text-red-400",
  exit:    "text-emerald-400 text-xs",
  dim:     "text-zinc-600",
  normal:  "text-zinc-200",
};

// ---------------------------------------------------------------------------
// Tag colour map
// ---------------------------------------------------------------------------

const TAG_CLS: Record<string, string> = {
  amber:   "border-amber-500/40  bg-amber-500/15  text-amber-300",
  sky:     "border-sky-500/40    bg-sky-500/15    text-sky-300",
  purple:  "border-purple-500/40 bg-purple-500/15 text-purple-300",
  emerald: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
  red:     "border-red-500/40    bg-red-500/15    text-red-300",
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type RunState = "idle" | "running" | "done" | "error";

export default function AgentsPage() {
  const [selected, setSelected] = useState<Scenario>(SCENARIOS[0]);
  const [customGoal, setCustomGoal] = useState("");
  const [runState, setRunState] = useState<RunState>("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);

  const terminalRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  // Auto-scroll terminal to bottom as new lines arrive.
  useEffect(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  // Cleanup SSE on unmount.
  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  const launch = useCallback(async (scenario: Scenario) => {
    // Close any existing stream.
    esRef.current?.close();
    setLines([]);
    setRunState("running");

    const goal = customGoal.trim() || scenario.defaultGoal;
    const cmd = `python -m agent.${scenario.agent}${scenario.unsafe ? " --unsafe" : ""}${goal !== scenario.defaultGoal ? ` "${goal}"` : ""}`;

    // Show the command being run as the first line.
    setLines([`$ ${cmd}`, ""]);

    // 1. Launch the subprocess.
    let id: string;
    try {
      const res = await fetch("/api/agent/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: scenario.agent, goal, unsafe: scenario.unsafe ?? false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLines((prev) => [...prev, `[ERROR] ${data.error ?? data.detail}`]);
        setRunState("error");
        return;
      }
      id = data.run_id;
      setRunId(id);
    } catch (err) {
      setLines((prev) => [...prev, `[ERROR] Could not reach gateway: ${err}`]);
      setRunState("error");
      return;
    }

    // 2. Open SSE stream.
    const es = new EventSource(`/api/agent/stream/${id}`);
    esRef.current = es;

    es.onmessage = (e) => {
      if (e.data === "[DONE]") {
        es.close();
        esRef.current = null;
        setRunState("done");
        return;
      }
      setLines((prev) => [...prev, e.data]);
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setRunState((s) => (s === "running" ? "error" : s));
    };
  }, [customGoal]);

  const stop = useCallback(async () => {
    esRef.current?.close();
    esRef.current = null;
    if (runId) {
      await fetch(`/api/agent/stop/${runId}`, { method: "DELETE" }).catch(() => {});
      setRunId(null);
    }
    setRunState("idle");
    setLines((prev) => [...prev, "", "[Agent stopped by user]"]);
  }, [runId]);

  const reset = useCallback(() => {
    setRunState("idle");
    setLines([]);
    setRunId(null);
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      {/* ── Header ── */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              Agent Launcher
            </h1>
            <p className="text-sm text-zinc-500">
              Pick a scenario · watch it stream live · see the audit log update in real time
            </p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {/* ── Scenario cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((sc) => {
          const isSelected = selected.id === sc.id;
          const isActiveRun = runState === "running" && isSelected;

          return (
            <button
              key={sc.id}
              onClick={() => {
                if (runState !== "running") {
                  setSelected(sc);
                  setCustomGoal(""); // reset custom goal so placeholder updates
                }
              }}
              disabled={runState === "running" && !isSelected}
              className={[
                "relative flex flex-col rounded-xl border p-4 text-left transition-all duration-150",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-zinc-400",
                // running cards are non-interactive
                runState === "running" && !isSelected ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                // selected + unsafe
                isSelected && sc.unsafe
                  ? "border-red-500 bg-red-950/30 shadow-lg shadow-red-900/20"
                  : isSelected
                  ? "border-zinc-400 bg-white shadow-md dark:border-zinc-500 dark:bg-zinc-900"
                  : sc.unsafe
                  ? "border-red-500/30 bg-red-950/10 hover:border-red-500/60 hover:bg-red-950/25"
                  : "border-zinc-200 bg-white hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-zinc-600 dark:hover:bg-zinc-900",
              ].join(" ")}
            >
              {/* Selected checkmark badge */}
              {isSelected && (
                <span className={[
                  "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                  sc.unsafe
                    ? "bg-red-500 text-white"
                    : "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900",
                ].join(" ")}>
                  ✓
                </span>
              )}

              {/* Emoji */}
              <span className="mb-2 text-3xl">{sc.emoji}</span>

              {/* Title + unsafe badge */}
              <div className="mb-1 flex items-center gap-2">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-100">{sc.title}</h2>
                {sc.unsafe && (
                  <span className="rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
                    Unsafe
                  </span>
                )}
              </div>

              <p className="mb-3 flex-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                {sc.description}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {sc.tags.map((tag) => (
                  <span
                    key={tag.label}
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${TAG_CLS[tag.color] ?? TAG_CLS.amber}`}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>

              {/* Running indicator (only on the active card) */}
              {isActiveRun && (
                <div className="mt-3 flex items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Running…</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Goal + run bar ── */}
      <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        {/* Context line showing what's selected */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-lg">{selected.emoji}</span>
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{selected.title}</span>
          {selected.unsafe && (
            <span className="rounded border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-red-400">
              Unsafe
            </span>
          )}
          <span className="ml-auto text-xs text-zinc-400">click a card to switch scenario</span>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={customGoal}
              onChange={(e) => setCustomGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && runState !== "running") launch(selected);
              }}
              placeholder={selected.defaultGoal}
              disabled={runState === "running"}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder-zinc-600"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              Leave empty to use the default goal · press Enter or click Run
            </p>
          </div>

          <button
            onClick={() => launch(selected)}
            disabled={runState === "running"}
            className={[
              "flex-shrink-0 self-start rounded-lg border px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              selected.unsafe
                ? "border-red-500/50 bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-700 dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white",
            ].join(" ")}
          >
            ▶ Run
          </button>
        </div>
      </div>

      {/* ── Terminal pane ── */}
      {lines.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl">
          {/* Terminal title bar */}
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
            <div className="flex items-center gap-2">
              {/* macOS-style dots */}
              <span className="h-3 w-3 rounded-full bg-red-500/70" />
              <span className="h-3 w-3 rounded-full bg-amber-500/70" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
              <span className="ml-3 font-mono text-xs text-zinc-500">
                agent.{selected.agent}
                {selected.unsafe ? " --unsafe" : ""}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {runState === "running" && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Live
                </span>
              )}
              {runState === "done" && (
                <span className="text-xs text-emerald-400">✓ Completed</span>
              )}
              {runState === "error" && (
                <span className="text-xs text-red-400">✗ Error</span>
              )}
              {runState === "running" ? (
                <button
                  onClick={stop}
                  className="rounded border border-red-500/40 bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/25"
                >
                  ■ Stop
                </button>
              ) : (
                <button
                  onClick={reset}
                  className="rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-700"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>

          {/* Output lines */}
          <div
            ref={terminalRef}
            className="h-96 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
          >
            {lines.map((line, i) => {
              const kind = classify(line);
              return (
                <div key={i} className={`whitespace-pre-wrap break-all ${KIND_CLASS[kind]}`}>
                  {line || " " /* non-breaking space keeps empty lines */}
                </div>
              );
            })}
            {/* Blinking cursor while running */}
            {runState === "running" && (
              <span className="inline-block h-3.5 w-2 animate-pulse bg-zinc-400" />
            )}
          </div>
        </div>
      )}

      {/* ── Idle prompt ── */}
      {lines.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-14 text-center dark:border-zinc-700 dark:bg-zinc-900/30">
          <p className="text-sm text-zinc-400">
            Select a scenario above and click{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">▶ Launch</span>{" "}
            to stream live output here.
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            The audit log on the{" "}
            <Link href="/" className="underline hover:text-zinc-600 dark:hover:text-zinc-200">
              Dashboard
            </Link>{" "}
            will update in real time as the agent runs.
          </p>
        </div>
      )}
    </main>
  );
}
