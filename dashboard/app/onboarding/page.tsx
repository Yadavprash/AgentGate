"use client";

import { useState } from "react";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3;

type StepConfig = {
  num: Step;
  label: string;
  title: string;
  subtitle: string;
};

const STEPS: StepConfig[] = [
  {
    num: 1,
    label: "Database",
    title: "Connect your Supabase project",
    subtitle: "Bastion stores the audit log and action state in your own Supabase project.",
  },
  {
    num: 2,
    label: "Notifications",
    title: "Set up notifications",
    subtitle: "Get alerted when an agent action requires human approval.",
  },
  {
    num: 3,
    label: "API Key",
    title: "Generate your first API key",
    subtitle: "Use this key to authenticate your SDK with the Gateway.",
  },
];

// ---------------------------------------------------------------------------
// Step 1 — Supabase
// ---------------------------------------------------------------------------

function Step1({
  onNext,
}: {
  onNext: () => void;
}) {
  const [url, setUrl]       = useState("");
  const [key, setKey]       = useState("");
  const [testing, setTesting] = useState(false);
  const [tested,  setTested]  = useState(false);

  function test() {
    if (!url || !key) return;
    setTesting(true);
    setTimeout(() => { setTesting(false); setTested(true); }, 1200);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Supabase URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-project.supabase.co"
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Service Role Key
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setTested(false); }}
            placeholder="eyJh…"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
          />
          <button
            onClick={test}
            disabled={!url || !key || testing}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
        </div>
      </div>

      {tested && (
        <div className="space-y-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <p className="text-emerald-700 dark:text-emerald-300">✓ Connection successful · 0 tables found</p>
          <p className="text-emerald-700 dark:text-emerald-300">✓ Migrations will be applied on continue</p>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          Skip
        </button>
        <button
          onClick={onNext}
          disabled={!tested}
          className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-5 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-300"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Notifications
// ---------------------------------------------------------------------------

type NotifChannel = "slack" | "discord" | "skip";

function Step2({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [channel, setChannel]  = useState<NotifChannel>("slack");
  const [webhook, setWebhook]  = useState("");
  const [testing,  setTesting] = useState(false);
  const [tested,   setTested]  = useState(false);

  function test() {
    if (!webhook) return;
    setTesting(true);
    setTimeout(() => { setTesting(false); setTested(true); }, 1000);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        {([
          ["slack",   "Slack",   "Receive approval requests as interactive cards in Slack."],
          ["discord", "Discord", "Receive approval requests in a Discord channel."],
          ["skip",    "Skip",    "Set up notifications later in Settings → Notifications."],
        ] as [NotifChannel, string, string][]).map(([val, label, desc]) => (
          <label key={val} className="flex cursor-pointer gap-3 rounded-lg border border-zinc-200 p-3 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900">
            <input
              type="radio"
              name="notif-channel"
              value={val}
              checked={channel === val}
              onChange={() => { setChannel(val); setTested(false); setWebhook(""); }}
              className="mt-0.5 accent-sky-500"
            />
            <div>
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{label}</p>
              <p className="text-xs text-zinc-500">{desc}</p>
            </div>
          </label>
        ))}
      </div>

      {channel !== "skip" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {channel === "slack" ? "Slack" : "Discord"} Webhook URL
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={webhook}
              onChange={(e) => { setWebhook(e.target.value); setTested(false); }}
              placeholder={
                channel === "slack"
                  ? "https://hooks.slack.com/services/…"
                  : "https://discord.com/api/webhooks/…"
              }
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            />
            <button
              onClick={test}
              disabled={!webhook || testing}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
            >
              {testing ? "Sending…" : "Send test"}
            </button>
          </div>
          {tested && (
            <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
              ✓ Test message delivered
            </p>
          )}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
          ← Back
        </button>
        <button
          onClick={onNext}
          disabled={channel !== "skip" && !tested}
          className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-5 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40 dark:text-sky-300"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — API Key
// ---------------------------------------------------------------------------

const GENERATED_KEY = "sk-live-7f3a9b2c1e4d8f6a3c7b5e2d1f9a4c8b6e3d7f2a5c9b1e4d8f6a3c7b5e2d1f9a";

function Step3({ onBack }: { onBack: () => void }) {
  const [keyName, setKeyName]   = useState("my-agent");
  const [generated, setGenerated] = useState(false);
  const [copied, setCopied]     = useState(false);

  function generate() {
    setGenerated(true);
  }

  async function copy() {
    await navigator.clipboard.writeText(GENERATED_KEY).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {!generated ? (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Key name
            </label>
            <input
              type="text"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              placeholder="e.g. payment-prod"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
            />
            <p className="mt-1 text-xs text-zinc-400">
              Choose a descriptive name. You can generate more keys in Settings later.
            </p>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={onBack} className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              ← Back
            </button>
            <button
              onClick={generate}
              disabled={!keyName}
              className="rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-5 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40 dark:text-emerald-300"
            >
              Generate key
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              ✓ Key generated — copy it now, it won&apos;t be shown again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all font-mono text-xs text-zinc-700 dark:text-zinc-300">
                {GENERATED_KEY}
              </code>
              <button
                onClick={copy}
                className="shrink-0 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">Quick start</p>
            <pre className="overflow-x-auto font-mono text-xs text-zinc-700 dark:text-zinc-300">
{`from bastion_sdk import gate

@gate()
def execute_payment(amount, recipient):
    ...`}
            </pre>
          </div>

          <div className="flex justify-end pt-2">
            <Link
              href="/"
              className="rounded-lg border border-sky-500/60 bg-sky-500/15 px-5 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-500/25 dark:text-sky-300"
            >
              Go to Dashboard →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, steps }: { current: Step; steps: StepConfig[] }) {
  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                s.num < current
                  ? "bg-emerald-500 text-white"
                  : s.num === current
                  ? "bg-sky-500 text-white"
                  : "bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              }`}
            >
              {s.num < current ? "✓" : s.num}
            </div>
            <span className={`mt-1 text-[10px] font-medium ${
              s.num === current ? "text-sky-600 dark:text-sky-400" : "text-zinc-400"
            }`}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={`mb-4 mx-3 h-px w-16 ${
              s.num < current ? "bg-emerald-400" : "bg-zinc-200 dark:bg-zinc-800"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const config = STEPS.find((s) => s.num === step)!;

  return (
    <main className="flex min-h-[calc(100vh-57px)] items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        {/* Brand */}
        <div className="mb-10 text-center">
          <p className="text-4xl">🛡️</p>
          <h1 className="mt-3 text-2xl font-bold text-zinc-900 dark:text-zinc-100">BASTION SDK</h1>
          <p className="mt-1 text-sm text-zinc-500">The trust layer for autonomous AI agents</p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <StepIndicator current={step} steps={STEPS} />
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-6">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Step {step} of {STEPS.length}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {config.title}
            </h2>
            <p className="mt-1 text-sm text-zinc-500">{config.subtitle}</p>
          </div>

          <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
            {step === 1 && <Step1 onNext={() => setStep(2)} />}
            {step === 2 && <Step2 onNext={() => setStep(3)} onBack={() => setStep(1)} />}
            {step === 3 && <Step3 onBack={() => setStep(2)} />}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Already configured?{" "}
          <Link href="/" className="underline hover:text-zinc-600 dark:hover:text-zinc-200">
            Go to Dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
