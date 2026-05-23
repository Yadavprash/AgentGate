import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

// Null when env vars are missing so the UI can show a setup hint instead of crashing.
export const supabase = supabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;

export type ActionStatus =
  | "auto_approved"
  | "intercepted"
  | "approved"
  | "denied"
  | "completed"
  | "timed_out"
  | "failed";

export type AuditEventType =
  | "intercepted"
  | "auto_approved"
  | "approved"
  | "denied"
  | "timed_out"
  | "completed"
  | "failed"
  | "redaction"
  | "threat"
  | "final_response";

export type DecisionActor = "ai" | "human" | "system";

export type DecisionKind =
  | "tool_call"
  | "approval"
  | "input"
  | "final_response"
  | "completion"
  | "redaction"
  | "threat";

export type ActionRow = {
  id: string;
  agent_id: string;
  agent_name: string;
  tool_name: string;
  tool_args: Record<string, unknown>;
  risk: "low" | "high";
  mode: "approval" | "input";
  status: ActionStatus;
  display: Record<string, unknown>;
  cost: number | null;
  created_at: string;
  decided_at: string | null;
  completed_at: string | null;
};

export type AuditEventRow = {
  id: string;
  seq?: number;
  action_id: string | null;
  event_type: AuditEventType;
  actor: DecisionActor | null;
  decision_kind: DecisionKind | null;
  decision_version: number | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  prev_hash?: string | null;
  this_hash?: string | null;
};

export async function fetchAuditEvents(actionId: string) {
  if (!supabase) return [] as AuditEventRow[];
  const { data } = await supabase
    .from("audit_events")
    .select("*")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true });
  return (data || []) as AuditEventRow[];
}
>>>>>>> origin/main
