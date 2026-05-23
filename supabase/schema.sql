-- AgentGate — actions table doubles as the state machine and the audit log.
-- Run this in the Supabase SQL editor.

create table if not exists actions (
  id               uuid primary key default gen_random_uuid(),
  agent_id         text not null,
  agent_name       text not null,
  tool_name        text not null,
  tool_args        jsonb not null default '{}',
  risk             text not null check (risk in ('low','high')),
  mode             text not null default 'approval' check (mode in ('approval','input')),
  status           text not null default 'intercepted'
                     check (status in ('auto_approved','intercepted','approved',
                                        'denied','completed','timed_out','failed')),
  display          jsonb default '{}',   -- cost, captcha_image_url, email_draft, ...
  decision_payload jsonb,                -- human-supplied value for INPUT mode
  cost             numeric,
  created_at       timestamptz not null default now(),
  decided_at       timestamptz,
  completed_at     timestamptz
);

create index if not exists actions_created_at_idx on actions (created_at desc);

-- Stream every insert/update to the dashboard via Supabase Realtime.
alter publication supabase_realtime add table actions;

-- The gateway writes with the service_role key (bypasses RLS).
-- The dashboard reads with the anon key, so expose a read-only policy.
alter table actions enable row level security;

drop policy if exists "anon read actions" on actions;
create policy "anon read actions"
  on actions for select
  to anon
  using (true);


-- ============================================================================
-- audit_events — tamper-evident append-only event log.
--
-- The `actions` table above is the LIVE state of each intercepted call (rows
-- get UPDATEd as the action progresses from intercepted -> approved -> ...).
-- This table is the IMMUTABLE history: one row per state transition, chained
-- by SHA-256 hashes so any mid-chain tampering is detectable.
--
-- Verify with:  python scripts/verify_audit_chain.py
-- ============================================================================

create table if not exists audit_events (
  id           uuid primary key default gen_random_uuid(),
  seq          bigserial unique not null,
  action_id    uuid references actions(id),
  event_type   text not null check (event_type in (
                 'intercepted','auto_approved','approved','denied',
                 'timed_out','completed','failed','redaction','threat',
                 'final_response'
               )),
  actor        text not null default 'system' check (actor in ('ai','human','system')),
  decision_kind text not null default 'completion' check (decision_kind in (
                 'tool_call','approval','input','final_response',
                 'completion','redaction','threat'
               )),
  decision_version bigint not null default 1,
  payload      jsonb not null default '{}',
  prev_hash    text,                                  -- null for the very first event
  this_hash    text not null,                         -- sha256( canonical( event ) )
  created_at   timestamptz not null default now()
);

-- Backward-compatible upgrades for existing deployments where the table may
-- already exist from older schema versions.
alter table audit_events add column if not exists actor text;
alter table audit_events add column if not exists decision_kind text;
alter table audit_events add column if not exists decision_version bigint;

-- Existing deployments may still have the pre-versioning event_type check.
alter table audit_events drop constraint if exists audit_events_event_type_check;
alter table audit_events
  add constraint audit_events_event_type_check
  check (event_type in (
    'intercepted','auto_approved','approved','denied',
    'timed_out','completed','failed','redaction','threat',
    'final_response'
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
    'completion','redaction','threat'
  ));

create index if not exists audit_events_seq_idx on audit_events(seq);
create index if not exists audit_events_action_idx on audit_events(action_id);
create unique index if not exists audit_events_action_decision_version_idx
  on audit_events(action_id, decision_version);

-- Block UPDATE / DELETE at the database level. A SQL admin can still drop the
-- rule, but tampering then changes the schema itself — visible in `pg_rewrite`
-- and disrupts the chain immediately on the next event. Combined with the
-- hash verifier, this catches the casual "let me just delete that row in the
-- Supabase dashboard" case which is the realistic threat for most teams.
create or replace rule audit_events_no_update as on update to audit_events do instead nothing;
create or replace rule audit_events_no_delete as on delete to audit_events do instead nothing;

-- Realtime feed so the dashboard can show "audit chain: N events" live.
alter publication supabase_realtime add table audit_events;

alter table audit_events enable row level security;
drop policy if exists "anon read audit_events" on audit_events;
create policy "anon read audit_events"
  on audit_events for select
  to anon
  using (true);
