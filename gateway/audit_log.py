"""Tamper-evident append-only audit chain.

Every state transition on an action — intercepted, auto-approved, approved,
denied, completed, failed, timed-out, redaction, threat — is appended to the
`audit_events` table as a separate row. Each row's `this_hash` is
SHA-256(canonical_json(event) ‖ prev_hash), where prev_hash is the
`this_hash` of the previous row. Tampering with any row breaks the chain,
which `scripts/verify_audit_chain.py` detects.

Payloads must NOT contain raw PII. The audit log is auditable from outside
the device; only sanitized metadata (tool name, decision source, redacted
lengths, threat target URL, etc.) belongs here.
"""
import asyncio
import hashlib
import json
from typing import Any, Optional

from gateway.config import settings
from gateway.db import _get_client


def canonical(
    event_type: str,
    action_id: Optional[str],
    actor: str,
    decision_kind: str,
    decision_version: int,
    payload: dict[str, Any],
    prev_hash: str,
) -> str:
    """Canonical JSON serialization used as the input to the hash. Keys sorted,
    separators tight - identical input always produces identical bytes."""
    return json.dumps(
        {
            "event_type": event_type,
            "action_id": action_id,
            "actor": actor,
            "decision_kind": decision_kind,
            "decision_version": int(decision_version),
            "payload": payload,
            "prev_hash": prev_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def compute_hash(
    event_type: str,
    action_id: Optional[str],
    actor: str,
    decision_kind: str,
    decision_version: int,
    payload: dict[str, Any],
    prev_hash: str,
) -> str:
    return hashlib.sha256(
        canonical(
            event_type,
            action_id,
            actor,
            decision_kind,
            decision_version,
            payload,
            prev_hash,
        ).encode("utf-8")
    ).hexdigest()


async def record_event(
    event_type: str,
    action_id: Optional[str] = None,
    actor: str = "system",
    decision_kind: str = "completion",
    payload: Optional[dict[str, Any]] = None,
) -> None:
    """Append an event to the audit chain. Graceful no-op when Supabase is
    disabled (tests, dev without creds). Never raises - audit must never
    block the agent."""
    if not settings.supabase_enabled:
        return

    def _do() -> None:
        client = _get_client()
        # Fetch the latest event so we can chain.
        latest = (
            client.table("audit_events")
            .select("this_hash")
            .order("seq", desc=True)
            .limit(1)
            .execute()
        )
        prev_hash = latest.data[0]["this_hash"] if latest.data else ""

        # Version each action's decisions independently.
        decision_version = 1
        if action_id:
            last_action_event = (
                client.table("audit_events")
                .select("decision_version")
                .eq("action_id", action_id)
                .order("decision_version", desc=True)
                .limit(1)
                .execute()
            )
            if last_action_event.data:
                decision_version = int(last_action_event.data[0]["decision_version"]) + 1

        pl = payload or {}
        this_hash = compute_hash(
            event_type,
            action_id,
            actor,
            decision_kind,
            decision_version,
            pl,
            prev_hash,
        )

        client.table("audit_events").insert(
            {
                "action_id": action_id,
                "event_type": event_type,
                "actor": actor,
                "decision_kind": decision_kind,
                "decision_version": decision_version,
                "payload": pl,
                "prev_hash": prev_hash or None,
                "this_hash": this_hash,
            }
        ).execute()

    try:
        await asyncio.to_thread(_do)
    except Exception as exc:  # noqa: BLE001 - audit must not break the gateway
        print(f"[audit] failed to record {event_type}/{action_id}: {exc}")
