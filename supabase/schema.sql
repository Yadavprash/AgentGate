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
