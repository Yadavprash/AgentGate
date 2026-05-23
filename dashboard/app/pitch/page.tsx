"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, supabaseConfigured, type ActionRow } from "@/lib/supabase";

type Display = Record<string, unknown> | null;

export default function Pitch() {
  const [rows, setRows] = useState<ActionRow[]>([]);

  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    sb.from("actions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (data) setRows(data as ActionRow[]);
      });
  }, []);

  const stats = {
    total: rows.length,
    high: rows.filter((r) => r.risk === "high").length,
    blocked: rows
      .filter((r) => r.status === "denied" || r.status === "timed_out")
      .reduce((s, r) => s + (r.cost ?? 0), 0),
    redactions: rows.filter(
      (r) => (r.display as Display)?.redacted === true,
    ).length,
    threats: rows.filter((r) => (r.display as Display)?.threat === true)
      .length,
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16">
      {/* HERO */}
      <section className="mb-16">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-purple-500/40 bg-purple-500/10 px-3 py-1 text-xs font-medium text-purple-300">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          B2A · Infrastructure for autonomous AI
        </div>
        <h1 className="mb-4 text-5xl font-semibold tracking-tight text-zinc-100 sm:text-6xl">
          AgentGate
        </h1>
        <p className="mb-6 max-w-2xl text-xl text-zinc-300">
          The airlock for autonomous AI agents.
        </p>
        <p className="max-w-2xl text-base leading-relaxed text-zinc-400">
          The second your AI agent tries to do something risky — spend money,
          send a message, touch private data — AgentGate freezes it
          mid-execution, pings a human on Discord, and resumes the agent the
          instant they tap Approve. Sensitive data gets stripped on the device
          before the cloud LLM ever sees it. Every decision streams to a
          real-time audit log.
        </p>
        <p className="mt-6 max-w-2xl rounded-lg border-l-2 border-red-500/60 bg-red-500/5 px-4 py-3 text-sm text-zinc-300">
          <span className="font-semibold text-red-300">In July 2025</span>,
          Replit&apos;s autonomous coding AI deleted a customer&apos;s
          production database. The CEO publicly apologized.{" "}
          <span className="font-semibold text-zinc-100">
            AgentGate is the one line of code that would have stopped that.
          </span>
        </p>
      </section>

      {/* LIVE STATS */}
      {supabaseConfigured && rows.length > 0 && (
        <section className="mb-16">
          <div className="mb-3 text-xs uppercase tracking-wide text-zinc-500">
            Live from this AgentGate instance
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Actions audited" value={stats.total} accent="zinc" />
            <Stat
              label="High-risk intercepts"
              value={stats.high}
              accent="amber"
            />
            <Stat
              label="PII redactions"
              value={stats.redactions}
              accent="purple"
            />
            <Stat label="Threats caught" value={stats.threats} accent="red" />
          </div>
        </section>
      )}

      {/* THREE LAYERS */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-semibold text-zinc-100">
          Three layers of trust, one line of code
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Layer
            num="1"
            title="PII never leaves the device"
            body="Tools marked sensitive route through a local redactor (regex or Ollama) before any output reaches the cloud LLM. Names, addresses, card numbers, OTP codes — stripped on your laptop."
            accent="purple"
          />
          <Layer
            num="2"
            title="Risky actions wait for a human"
            body="Mark a tool high-risk and the agent's tool call freezes at the gateway. A rich card lands on Discord in under 2 seconds. One tap to Approve, Deny, or Modify Budget."
            accent="amber"
          />
          <Layer
            num="3"
            title="Every action is auditable"
            body="Auto-passed reads, intercepted writes, denials, redactions — all streamed live to a Postgres-backed dashboard with status chips, threat banners, and side-by-side privacy proof."
            accent="emerald"
          />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-semibold text-zinc-100">How it works</h2>
        <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-5 font-mono text-xs leading-relaxed text-zinc-300">
{`  ┌──────────┐       ┌─────────────┐       ┌──────────┐
  │          │       │             │       │  HUMAN   │
  │    AI    │──────>│  AGENTGATE  │──────>│ on phone │
  │  AGENT   │       │             │       │ (Discord)│
  │          │<──────│  (airlock)  │<──────│          │
  └──────────┘       └─────────────┘       └──────────┘
                            │
                            ▼
                      [ audit log ]`}
        </pre>
        <p className="mt-3 text-sm text-zinc-400">
          The gateway and Discord bot share one Python process, so a button
          tap directly wakes the frozen HTTP request — no polling, no queue.
          Resume feels instant.
        </p>
      </section>

      {/* THREE DEMOS */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-semibold text-zinc-100">
          Three demos, one airlock
        </h2>
        <div className="space-y-4">
          <Demo
            cmd="python -m agent.run"
            title="Domain buying"
            sub="APPROVAL + INPUT (CAPTCHA) + Modify Budget + real Razorpay charge"
          />
          <Demo
            cmd="python -m agent.bank_run"
            title="Bank login (human-as-tool)"
            sub="INPUT × 2 (CAPTCHA + OTP) + sensitive × 2 (credentials + transactions); WhatClaudeSaw panel proves PII stayed local"
          />
          <Demo
            cmd="python -m agent.injection_run"
            title="Prompt-injection defense"
            sub={
              <>
                Agent gets hijacked by an indirect prompt injection; AgentGate
                catches the exfiltration{" "}
                <span className="font-semibold text-red-300">
                  before any byte leaves the laptop
                </span>
                .
              </>
            }
          />
          <Demo
            cmd="python -m agent.run --unsafe"
            title="Bypass mode (the contrast)"
            sub="Same agent, no airlock. Razorpay charge happens with no audit, no approval, no redaction. The 'before' shot."
          />
        </div>
      </section>

      {/* TECH */}
      <section className="mb-16">
        <h2 className="mb-6 text-2xl font-semibold text-zinc-100">
          Built on
        </h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            "FastAPI",
            "discord.py",
            "Supabase (Postgres + Realtime)",
            "Anthropic Claude (claude-sonnet-4-6)",
            "LangChain",
            "Razorpay test mode",
            "Next.js 14 + Tailwind",
            "Docker Compose",
            "32 automated tests",
          ].map((t) => (
            <span
              key={t}
              className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300"
            >
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="mb-1 text-lg font-semibold text-zinc-100">
              Open the live audit dashboard
            </h3>
            <p className="text-sm text-zinc-400">
              Watch interceptions, denials, and PII redactions stream in real
              time as the agent runs.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-emerald-950 hover:bg-emerald-400"
          >
            Open dashboard →
          </Link>
        </div>
      </section>

      <footer className="mt-12 text-center text-xs text-zinc-600">
        Built during a 3-day hackathon. Code at{" "}
        <code className="font-mono">github.com/Yadavprash/AgentGate</code>.
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: "zinc" | "amber" | "purple" | "red" | "emerald";
}) {
  const tone = {
    zinc: "text-zinc-100 border-zinc-800",
    amber: "text-amber-300 border-amber-500/40",
    purple: "text-purple-300 border-purple-500/40",
    red: "text-red-300 border-red-500/40",
    emerald: "text-emerald-300 border-emerald-500/40",
  }[accent];
  return (
    <div className={`rounded-lg border bg-zinc-900/50 p-4 ${tone.split(" ")[1]}`}>
      <div className="text-xs uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-semibold ${tone.split(" ")[0]}`}>
        {value}
      </div>
    </div>
  );
}

function Layer({
  num,
  title,
  body,
  accent,
}: {
  num: string;
  title: string;
  body: string;
  accent: "purple" | "amber" | "emerald";
}) {
  const tone = {
    purple: "border-purple-500/40 bg-purple-500/5 text-purple-300",
    amber: "border-amber-500/40 bg-amber-500/5 text-amber-300",
    emerald: "border-emerald-500/40 bg-emerald-500/5 text-emerald-300",
  }[accent];
  return (
    <div className={`rounded-lg border p-5 ${tone}`}>
      <div className="mb-2 text-2xl font-bold">{num}</div>
      <div className="mb-2 text-base font-semibold text-zinc-100">{title}</div>
      <div className="text-sm leading-relaxed text-zinc-400">{body}</div>
    </div>
  );
}

function Demo({
  cmd,
  title,
  sub,
}: {
  cmd: string;
  title: string;
  sub: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-1 font-mono text-xs text-emerald-300">{cmd}</div>
      <div className="text-base font-medium text-zinc-100">{title}</div>
      <div className="mt-1 text-sm text-zinc-400">{sub}</div>
    </div>
  );
}
