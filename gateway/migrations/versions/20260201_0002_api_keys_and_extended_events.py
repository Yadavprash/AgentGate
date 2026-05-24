"""api_keys table + extended event_type whitelist

Revision ID: 0002_api_keys_and_extended_events
Revises: 0001_initial
Create Date: 2026-02-01

Adds:
- api_keys table (T1-2)
- auth_failure / anomaly_detected / gateway_unreachable / usage_report event types
- agent_version column on actions (T2-2 — preview, helps Tier 1 deployments
  start emitting agent_version immediately)
"""
from alembic import op


revision = "0002_api_keys_and_extended_events"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("alter table actions add column if not exists agent_version text")

    op.execute("alter table audit_events drop constraint if exists audit_events_event_type_check")
    op.execute(
        """
        alter table audit_events
          add constraint audit_events_event_type_check
          check (event_type in (
            'intercepted','auto_approved','approved','denied',
            'timed_out','completed','failed','redaction','threat',
            'final_response',
            'auth_failure','anomaly_detected','gateway_unreachable','usage_report'
          ))
        """
    )

    op.execute("alter table audit_events drop constraint if exists audit_events_decision_kind_check")
    op.execute(
        """
        alter table audit_events
          add constraint audit_events_decision_kind_check
          check (decision_kind in (
            'tool_call','approval','input','final_response',
            'completion','redaction','threat',
            'auth','anomaly','usage'
          ))
        """
    )

    op.execute(
        """
        create table if not exists api_keys (
          id          uuid primary key default gen_random_uuid(),
          key_hash    text unique not null,
          agent_id    text not null,
          description text,
          created_by  text,
          created_at  timestamptz not null default now(),
          revoked_at  timestamptz,
          expires_at  timestamptz
        )
        """
    )
    op.execute("create index if not exists api_keys_agent_id_idx on api_keys (agent_id)")
    op.execute("create index if not exists api_keys_revoked_idx on api_keys (revoked_at)")
    op.execute("alter table api_keys enable row level security")


def downgrade() -> None:
    op.execute("drop table if exists api_keys cascade")
    op.execute("alter table actions drop column if exists agent_version")
    # We deliberately keep the broader event_type / decision_kind checks on
    # downgrade — narrowing them could violate existing rows.
