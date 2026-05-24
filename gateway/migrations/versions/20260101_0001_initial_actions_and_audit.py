"""initial actions + audit_events tables

Revision ID: 0001_initial
Revises:
Create Date: 2026-01-01

This baseline migration brings a fresh database up to the same shape as
running `supabase/schema.sql` from scratch. Customers who already ran the
SQL file should `alembic stamp 0001_initial` instead of `upgrade head` so
Alembic records the baseline without re-running anything.
"""
from alembic import op
import sqlalchemy as sa


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("create extension if not exists pgcrypto")

    op.execute(
        """
        create table if not exists actions (
          id               uuid primary key default gen_random_uuid(),
          agent_id         text not null,
          agent_name       text not null,
          agent_version    text,
          tool_name        text not null,
          tool_args        jsonb not null default '{}',
          risk             text not null check (risk in ('low','high')),
          mode             text not null default 'approval'
                              check (mode in ('approval','input','monitor','shadow')),
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
        """
    )
    op.execute("create index if not exists actions_created_at_idx on actions (created_at desc)")
    op.execute("create index if not exists actions_trace_id_idx on actions (trace_id)")

    op.execute(
        """
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
        )
        """
    )
    op.execute("create index if not exists audit_events_seq_idx on audit_events(seq)")
    op.execute("create index if not exists audit_events_action_idx on audit_events(action_id)")
    op.execute(
        "create unique index if not exists audit_events_action_decision_version_idx "
        "on audit_events(action_id, decision_version)"
    )
    op.execute("create or replace rule audit_events_no_update as on update to audit_events do instead nothing")
    op.execute("create or replace rule audit_events_no_delete as on delete to audit_events do instead nothing")


def downgrade() -> None:
    op.execute("drop table if exists audit_events cascade")
    op.execute("drop table if exists actions cascade")
