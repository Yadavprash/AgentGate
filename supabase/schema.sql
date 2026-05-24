-- Bastion (formerly AgentGate) — schema for the gateway.
-- Run this in the Supabase SQL editor.

create table if not exists actions (
  id               uuid primary key default gen_random_uuid(),
  agent_id         text not null,
  agent_name       text not null,
  agent_version    text,
  tool_name        text not null,
  tool_args        jsonb not null default '{}',
  risk             text not null check (risk in ('low','high')),
  mode             text not null default 'approval' check (mode in ('approval','input','monitor','shadow')),
  status           text not null default 'intercepted'
                     check (status in ('auto_approved','intercepted','approved',
                                        'denied','completed','timed_out','failed')),
  display          jsonb default '{}',
  decision_payload jsonb,
  cost             numeric,
  trace_id         uuid,
  parent_action_id uuid references actions(id),
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  completed_at     timestamptz
);

-- Backward-compatible adds for existing deployments.
alter table actions add column if not exists agent_version text;
alter table actions add column if not exists trace_id uuid;
alter table actions add column if not exists parent_action_id uuid references actions(id);

create index if not exists actions_created_at_idx on actions (created_at desc);
create index if not exists actions_trace_id_idx on actions (trace_id);

alter publication supabase_realtime add table actions;

alter table actions enable row level security;
drop policy if exists "anon read actions" on actions;
create policy "anon read actions"
  on actions for select
  to anon
  using (true);


-- ============================================================================
-- audit_events — tamper-evident append-only event log.
-- ============================================================================

create table if not exists audit_events (
  id           uuid primary key default gen_random_uuid(),
  seq          bigserial unique not null,
  action_id    uuid references actions(id),
  event_type   text not null,
  actor        text not null default 'system' check (actor in ('ai','human','system')),
  decision_kind text not null default 'completion',
  decision_version bigint not null default 1,
  payload      jsonb not null default '{}',
  prev_hash    text,
  this_hash    text not null,
  created_at   timestamptz not null default now()
);

-- Backward-compatible upgrades for older deployments.
alter table audit_events add column if not exists actor text;
alter table audit_events add column if not exists decision_kind text;
alter table audit_events add column if not exists decision_version bigint;

-- Refresh the event_type whitelist with the new Bastion events.
alter table audit_events drop constraint if exists audit_events_event_type_check;
alter table audit_events
  add constraint audit_events_event_type_check
  check (event_type in (
    'intercepted','auto_approved','approved','denied',
    'timed_out','completed','failed','redaction','threat',
    'final_response',
    -- Bastion 1.x additions:
    'auth_failure','anomaly_detected','gateway_unreachable','usage_report'
  ));

update audit_events set actor = 'system' where actor is null;
update audit_events set decision_kind = 'completion' where decision_kind is null;
update audit_events set decision_version = 1 where decision_version is null;

with ranked as (
  select id, row_number() over (partition by action_id order by seq) as rn
  from audit_events
  where action_id is not null
)
update audit_events ae
set decision_version = ranked.rn
from ranked
where ae.id = ranked.id;

alter table audit_events alter column actor set default 'system';
alter table audit_events alter column actor set not null;
alter table audit_events alter column decision_kind set default 'completion';
alter table audit_events alter column decision_kind set not null;
alter table audit_events alter column decision_version set default 1;
alter table audit_events alter column decision_version set not null;

alter table audit_events drop constraint if exists audit_events_actor_check;
alter table audit_events
  add constraint audit_events_actor_check
  check (actor in ('ai','human','system'));

alter table audit_events drop constraint if exists audit_events_decision_kind_check;
alter table audit_events
  add constraint audit_events_decision_kind_check
  check (decision_kind in (
    'tool_call','approval','input','final_response',
    'completion','redaction','threat',
    'auth','anomaly','usage'
  ));

create index if not exists audit_events_seq_idx on audit_events(seq);
create index if not exists audit_events_action_idx on audit_events(action_id);
create unique index if not exists audit_events_action_decision_version_idx
  on audit_events(action_id, decision_version);

create or replace rule audit_events_no_update as on update to audit_events do instead nothing;
create or replace rule audit_events_no_delete as on delete to audit_events do instead nothing;

alter publication supabase_realtime add table audit_events;

alter table audit_events enable row level security;
drop policy if exists "anon read audit_events" on audit_events;
create policy "anon read audit_events"
  on audit_events for select
  to anon
  using (true);


-- ============================================================================
-- api_keys — SDK authentication (T1-2).
--
-- Plaintext keys NEVER live here; only their SHA-256 hash. Customers see a
-- key once at creation and never again. `agent_id` pins which agent identity
-- the key may write actions for, so a leaked key can't impersonate another
-- agent in the same tenant.
-- ============================================================================

create table if not exists api_keys (
  id          uuid primary key default gen_random_uuid(),
  key_hash    text unique not null,
  agent_id    text not null,
  description text,
  created_by  text,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  expires_at  timestamptz
);

create index if not exists api_keys_agent_id_idx on api_keys (agent_id);
create index if not exists api_keys_revoked_idx on api_keys (revoked_at);

alter table api_keys enable row level security;
-- No public read policy: the anon dashboard role MUST NOT see key hashes.
