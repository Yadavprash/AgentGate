"use client";

import { useState } from "react";

type Tab = "api-keys" | "notifications" | "redaction" | "team" | "webhooks" | "gateway";
type RedactionBackend = "regex" | "ollama" | "custom";

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{children}</p>
  );
}

function CardPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/[0.08] bg-white dark:border-white/[0.06] dark:bg-[#13161f]">
      {children}
    </div>
  );
}

function CardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3.5 dark:border-white/[0.04]">
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? "bg-sky-500" : "bg-zinc-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tab: API Keys
// ---------------------------------------------------------------------------

type ApiKey = { name: string; prefix: string; lastUsed: string; created: string; active: boolean };

const MOCK_KEYS: ApiKey[] = [
  { name: "payment-prod",    prefix: "sk-live-7f3a…", lastUsed: "2 min ago",  created: "2026-03-12", active: true  },
  { name: "payment-staging", prefix: "sk-live-c1e9…", lastUsed: "1 day ago",  created: "2026-02-28", active: true  },
  { name: "analytics-dev",   prefix: "sk-live-9b22…", lastUsed: "never",       created: "2026-04-30", active: false },
];

function ApiKeysTab() {
  const [keys, setKeys] = useState<ApiKey[]>(MOCK_KEYS);
  const [revoking, setRevoking] = useState<string | null>(null);

  function revoke(name: string) {
    setRevoking(name);
    setTimeout(() => { setKeys((prev) => prev.filter((k) => k.name !== name)); setRevoking(null); }, 800);
  }

  return (
    <CardPanel>
      <CardHeader>
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">API Keys</p>
          <p className="mt-0.5 text-xs text-zinc-500">Used by your SDK to authenticate with the Gateway.</p>
        </div>
        <button className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/25">
          + Generate new
        </button>
      </CardHeader>

      <div className="divide-y divide-black/[0.05] dark:divide-white/[0.04]">
        {keys.map((k) => (
          <div key={k.name} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10">
                <svg className="h-4 w-4 text-sky-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 8a6 6 0 01-7.743 5.743L10 14l-1 1-1 1H6v2H2v-4l4.257-4.257A6 6 0 1118 8zm-6-4a1 1 0 100 2 2 2 0 012 2 1 1 0 102 0 4 4 0 00-4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{k.name}</p>
                <p className="font-mono text-[11px] text-zinc-500">{k.prefix}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="hidden sm:block text-right">
                <p className="text-xs text-zinc-500">Last used</p>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{k.lastUsed}</p>
              </div>
              <div className="hidden sm:block text-right">
                <p className="text-xs text-zinc-500">Created</p>
                <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{k.created}</p>
              </div>
              {k.active ? (
                <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">active</span>
              ) : (
                <span className="rounded-md border border-zinc-600/40 bg-zinc-500/10 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">unused</span>
              )}
              <button
                onClick={() => revoke(k.name)}
                disabled={revoking === k.name}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {revoking === k.name ? "Revoking…" : "Revoke"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-black/[0.05] px-5 py-3 dark:border-white/[0.04]">
        <p className="text-xs text-amber-400">
          ⚠ Revoked keys remain valid for 24 hours to allow rotation.
        </p>
      </div>
    </CardPanel>
  );
}

// ---------------------------------------------------------------------------
// Tab: Notifications
// ---------------------------------------------------------------------------

type Channel = { id: string; name: string; icon: string; connected: boolean; detail?: string };

const CHANNELS: Channel[] = [
  { id: "discord",   name: "Discord",   icon: "💬", connected: true,  detail: "Channel: #bastion-alerts" },
  { id: "slack",     name: "Slack",     icon: "📢", connected: true,  detail: "Channel: #ai-approvals" },
  { id: "pagerduty", name: "PagerDuty", icon: "🚨", connected: false },
  { id: "email",     name: "Email",     icon: "✉️", connected: false },
  { id: "webhook",   name: "Webhook",   icon: "🔗", connected: false },
];

const ROUTING_RULES = `if risk == high       → notify Slack + Discord
if anomaly_detected   → notify PagerDuty
if threat_blocked     → notify Slack + email security@…`;

function NotificationsTab() {
  return (
    <CardPanel>
      <CardHeader>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Notification Channels</p>
      </CardHeader>
      <div className="divide-y divide-black/[0.05] dark:divide-white/[0.04]">
        {CHANNELS.map((ch) => (
          <div key={ch.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-base">{ch.icon}</span>
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{ch.name}</p>
                {ch.detail && <p className="text-[11px] text-zinc-500">{ch.detail}</p>}
                {!ch.connected && <p className="text-[11px] text-zinc-600">Not configured</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {ch.connected ? (
                <>
                  <span className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Connected
                  </span>
                  <button className="rounded-lg border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-400 dark:hover:bg-white/[0.05] transition-colors">
                    Edit
                  </button>
                </>
              ) : (
                <button className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-400 hover:bg-sky-500/25 transition-colors">
                  + Connect
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-black/[0.05] px-5 py-4 dark:border-white/[0.04]">
        <SectionLabel>Routing rules</SectionLabel>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-black/[0.08] bg-zinc-50 p-3 font-mono text-xs leading-relaxed text-zinc-700 dark:border-white/[0.06] dark:bg-[#0d1020] dark:text-zinc-300">
          {ROUTING_RULES}
        </pre>
      </div>
    </CardPanel>
  );
}

// ---------------------------------------------------------------------------
// Tab: Redaction
// ---------------------------------------------------------------------------

const TEST_INPUT  = "Patient John Doe, DOB 1985-03-12, card 4111-1111-1111-1111";
const TEST_OUTPUT = "Patient [NAME], DOB [DATE_OF_BIRTH], card [CARD]";
const TEST_LABELS = "Detected: NAME, DATE_OF_BIRTH, CARD";

function RedactionTab() {
  const [backend, setBackend] = useState<RedactionBackend>("regex");
  const [endpoint, setEndpoint] = useState("http://localhost:11434");
  const [model, setModel]       = useState("llama3.2");
  const [fallback, setFallback] = useState(true);
  const [testRunning, setTestRunning] = useState(false);
  const [testDone, setTestDone]       = useState(false);

  function runTest() { setTestDone(false); setTestRunning(true); setTimeout(() => { setTestRunning(false); setTestDone(true); }, 1000); }

  return (
    <CardPanel>
      <CardHeader>
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">PII Redaction Backend</p>
          <p className="mt-0.5 text-xs text-zinc-500">Choose how tool outputs are scanned for sensitive data.</p>
        </div>
      </CardHeader>
      <div className="px-5 py-4 space-y-5">

        {/* Backend selector as pill toggles */}
        <div>
          <SectionLabel>Engine</SectionLabel>
          <div className="mt-2 flex flex-wrap gap-2">
            {([
              ["regex",  "Regex",  "fast, deterministic"],
              ["ollama", "Ollama", "semantic, context-aware"],
              ["custom", "Custom", "your own Python class"],
            ] as [RedactionBackend, string, string][]).map(([val, label, desc]) => (
              <button
                key={val}
                onClick={() => setBackend(val)}
                className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${
                  backend === val
                    ? "border-sky-500/50 bg-sky-500/10"
                    : "border-black/[0.08] bg-zinc-50 hover:border-zinc-400 dark:border-white/[0.06] dark:bg-[#0f1118] dark:hover:border-white/[0.12]"
                }`}
              >
                <span className={`text-sm font-semibold ${backend === val ? "text-sky-400" : "text-zinc-800 dark:text-zinc-200"}`}>
                  {label}
                </span>
                <span className="text-[11px] text-zinc-500 mt-0.5">{desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Ollama config */}
        {backend === "ollama" && (
          <div className="space-y-3 rounded-xl border border-black/[0.08] p-4 dark:border-white/[0.06]">
            <SectionLabel>Ollama Configuration</SectionLabel>
            <div className="grid grid-cols-[80px_1fr] items-center gap-3">
              <span className="text-xs text-zinc-500">Endpoint</span>
              <input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200"
              />
              <span className="text-xs text-zinc-500">Model</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200"
              >
                <option>llama3.2</option>
                <option>llama3.1</option>
                <option>mistral</option>
              </select>
              <span className="text-xs text-zinc-500">Status</span>
              <span className="text-xs text-emerald-400">● Reachable · 1.2 GB loaded · avg 340 ms</span>
              <span className="text-xs text-zinc-500">Fallback</span>
              <div className="flex items-center gap-2">
                <Toggle checked={fallback} onChange={setFallback} />
                <span className="text-xs text-zinc-500">Use regex if Ollama is unreachable</span>
              </div>
            </div>
          </div>
        )}

        {/* Test panel */}
        <div className="rounded-xl border border-black/[0.08] p-4 dark:border-white/[0.06]">
          <SectionLabel>Test</SectionLabel>
          <div className="mt-3 space-y-2">
            <div className="flex items-start gap-3">
              <span className="w-16 shrink-0 text-[11px] text-zinc-500 pt-0.5">Input</span>
              <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{TEST_INPUT}</span>
            </div>
            {testDone && (
              <>
                <div className="flex items-start gap-3">
                  <span className="w-16 shrink-0 text-[11px] text-zinc-500 pt-0.5">Output</span>
                  <span className="font-mono text-xs text-sky-400">{TEST_OUTPUT}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-16 shrink-0 text-[11px] text-zinc-500" />
                  <span className="text-[11px] text-zinc-500">{TEST_LABELS}</span>
                </div>
              </>
            )}
            <div className="flex justify-end pt-1">
              <button
                onClick={runTest}
                disabled={testRunning}
                className="rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-300 dark:hover:bg-white/[0.05]"
              >
                {testRunning ? "Running…" : "Run test"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </CardPanel>
  );
}

// ---------------------------------------------------------------------------
// Tab: Team
// ---------------------------------------------------------------------------

type TeamMember = { email: string; initials: string; color: string; role: string; lastActive: string };

const TEAM: TeamMember[] = [
  { email: "vinay@bastion.com",    initials: "VU", color: "bg-blue-500",   role: "Admin",     lastActive: "now" },
  { email: "samiksha@bastion.com", initials: "SC", color: "bg-teal-500",   role: "Admin",     lastActive: "2 hours ago" },
  { email: "ops@acme.com",         initials: "OA", color: "bg-purple-500", role: "Approver",  lastActive: "1 day ago" },
  { email: "auditor@acme.com",     initials: "AU", color: "bg-amber-500",  role: "Auditor",   lastActive: "3 days ago" },
  { email: "dev@acme.com",         initials: "DA", color: "bg-zinc-500",   role: "Developer", lastActive: "1 hour ago" },
];

const ROLE_DEFS = [
  { role: "Admin",     desc: "full access, approve/deny, manage settings" },
  { role: "Approver",  desc: "approve/deny only, no settings access" },
  { role: "Auditor",   desc: "read-only, can run compliance exports" },
  { role: "Developer", desc: "read-only view of their own agent's actions" },
];

function RolePill({ role }: { role: string }) {
  const cls =
    role === "Admin"     ? "border-sky-500/40 bg-sky-500/10 text-sky-400" :
    role === "Approver"  ? "border-amber-500/40 bg-amber-500/10 text-amber-400" :
    role === "Auditor"   ? "border-purple-500/40 bg-purple-500/10 text-purple-400" :
                           "border-zinc-600/40 bg-zinc-500/10 text-zinc-400";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{role}</span>
  );
}

function TeamTab() {
  return (
    <CardPanel>
      <CardHeader>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Team Access</p>
        <button className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-sky-500/25">
          + Invite user
        </button>
      </CardHeader>

      <div className="divide-y divide-black/[0.05] dark:divide-white/[0.04]">
        {TEAM.map((m) => (
          <div key={m.email} className="flex items-center justify-between px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-white/[0.02] transition-colors">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${m.color}`}>
                {m.initials}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{m.email}</p>
                <p className="text-[11px] text-zinc-500">Active {m.lastActive}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <RolePill role={m.role} />
              <button className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
                Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-black/[0.05] px-5 py-4 dark:border-white/[0.04]">
        <SectionLabel>Roles</SectionLabel>
        <div className="mt-2 space-y-1.5">
          {ROLE_DEFS.map(({ role, desc }) => (
            <p key={role} className="text-xs text-zinc-500">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">{role}</span>
              {" — "}{desc}
            </p>
          ))}
        </div>
      </div>
    </CardPanel>
  );
}

// ---------------------------------------------------------------------------
// Tab: Webhooks
// ---------------------------------------------------------------------------

function WebhooksTab() {
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");

  return (
    <CardPanel>
      <CardHeader>
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Outbound Webhooks</p>
          <p className="mt-0.5 text-xs text-zinc-500">Receive real-time POST notifications for gate events.</p>
        </div>
      </CardHeader>
      <div className="px-5 py-4 space-y-4">
        <div>
          <SectionLabel>Add endpoint</SectionLabel>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app.com/webhooks/bastion"
                className="w-full rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200"
              />
              <input
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="Signing secret (optional)"
                className="w-full rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200"
              />
            </div>
            <button
              disabled={!url}
              className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-black/[0.10] px-5 py-10 text-center dark:border-white/[0.08]">
          <p className="text-sm text-zinc-500">No webhooks configured yet.</p>
          <p className="mt-1.5 text-xs text-zinc-600">
            Fires on:{" "}
            {["intercepted", "approved", "denied", "threat"].map((e, i) => (
              <span key={e}>
                {i > 0 && <span className="mx-1 text-zinc-700">·</span>}
                <code className="font-mono">{e}</code>
              </span>
            ))}
          </p>
        </div>
      </div>
    </CardPanel>
  );
}

// ---------------------------------------------------------------------------
// Tab: Gateway
// ---------------------------------------------------------------------------

type ComponentEntry = { name: string; latency?: string; detail: string; ok: boolean };

const COMPONENTS: ComponentEntry[] = [
  { name: "Database (Supabase)", latency: "12ms p95",  detail: "ok",                                    ok: true },
  { name: "Notifier (Slack)",    latency: "89ms p95",  detail: "ok",                                    ok: true },
  { name: "Redactor (Ollama)",   latency: "340ms p95", detail: "ok",                                    ok: true },
  { name: "Audit chain",                               detail: "last verify 30s ago · ✓ integrity ok",  ok: true },
  { name: "Stale sweeper",                             detail: "last run 47s ago · 2 actions denied",   ok: true },
];

function GatewayTab() {
  const [timeout_,  setTimeout_] = useState("600");
  const [fallback,  setFallback] = useState("deny");
  const [httpTo,    setHttpTo]   = useState("5");
  const [retries,   setRetries]  = useState("3");
  const [logLevel,  setLogLevel] = useState("INFO");
  const [saved,     setSaved]    = useState(false);

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2000); }

  return (
    <CardPanel>
      <CardHeader>
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Gateway Status</p>
          <p className="mt-0.5 text-xs text-zinc-500">v1.2.0 · uptime 14d 3h · 127 actions/hour</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          All systems operational
        </span>
      </CardHeader>

      {/* Components */}
      <div className="border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.04]">
        <SectionLabel>Components</SectionLabel>
        <div className="mt-2 divide-y divide-black/[0.05] overflow-hidden rounded-xl border border-black/[0.08] dark:divide-white/[0.04] dark:border-white/[0.06]">
          {COMPONENTS.map((c) => (
            <div key={c.name} className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-[#0f1118]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${c.ok ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="flex-1 text-xs text-zinc-700 dark:text-zinc-300">{c.name}</span>
              {c.latency && <span className="text-xs tabular-nums text-zinc-500">{c.latency}</span>}
              <span className="text-xs text-zinc-500">{c.detail}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Settings in 2-col grid */}
      <div className="px-5 py-4">
        <SectionLabel>Settings</SectionLabel>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            {
              label: "Approval timeout",
              hint: "auto-deny after this",
              node: (
                <div className="flex items-center gap-2">
                  <input type="number" value={timeout_} onChange={(e) => setTimeout_(e.target.value)}
                    className="w-20 rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200" />
                  <span className="text-xs text-zinc-500">seconds</span>
                </div>
              ),
            },
            {
              label: "Fallback on down",
              hint: "when Gateway is unreachable",
              node: (
                <select value={fallback} onChange={(e) => setFallback(e.target.value)}
                  className="rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200">
                  <option value="deny">deny</option>
                  <option value="allow">allow</option>
                </select>
              ),
            },
            {
              label: "HTTP timeout",
              node: (
                <div className="flex items-center gap-2">
                  <input type="number" value={httpTo} onChange={(e) => setHttpTo(e.target.value)}
                    className="w-20 rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200" />
                  <span className="text-xs text-zinc-500">seconds</span>
                </div>
              ),
            },
            {
              label: "Retry attempts",
              node: (
                <input type="number" value={retries} onChange={(e) => setRetries(e.target.value)}
                  className="w-20 rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200" />
              ),
            },
            {
              label: "Log level",
              node: (
                <select value={logLevel} onChange={(e) => setLogLevel(e.target.value)}
                  className="rounded-lg border border-black/[0.08] bg-zinc-50 px-3 py-1.5 text-sm text-zinc-800 focus:outline-none dark:border-white/[0.08] dark:bg-[#0f1118] dark:text-zinc-200">
                  {["DEBUG", "INFO", "WARNING", "ERROR"].map((l) => <option key={l}>{l}</option>)}
                </select>
              ),
            },
          ].map(({ label, hint, node }) => (
            <div key={label} className="rounded-xl border border-black/[0.08] p-4 dark:border-white/[0.06]">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</p>
              {hint && <p className="text-[11px] text-zinc-500 mb-2">{hint}</p>}
              <div className="mt-2">{node}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
          <button
            onClick={save}
            className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-4 py-1.5 text-sm font-semibold text-sky-400 hover:bg-sky-500/25 transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>
    </CardPanel>
  );
}

// ---------------------------------------------------------------------------
// Tab bar + Page
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string }[] = [
  { id: "api-keys",       label: "API Keys" },
  { id: "notifications",  label: "Notifications" },
  { id: "redaction",      label: "Redaction" },
  { id: "team",           label: "Team" },
  { id: "webhooks",       label: "Webhooks" },
  { id: "gateway",        label: "Gateway" },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("api-keys");

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-zinc-500">
          Configure API keys, notifications, redaction, team access, and gateway behaviour.
        </p>
      </div>

      {/* Tab bar */}
      <div className="mb-5 flex gap-0.5 overflow-x-auto rounded-xl border border-black/[0.08] bg-white p-1 dark:border-white/[0.06] dark:bg-[#13161f]">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === id
                ? "bg-zinc-900 text-white dark:bg-white/[0.08] dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "api-keys"      && <ApiKeysTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "redaction"     && <RedactionTab />}
      {tab === "team"          && <TeamTab />}
      {tab === "webhooks"      && <WebhooksTab />}
      {tab === "gateway"       && <GatewayTab />}
    </main>
  );
}
