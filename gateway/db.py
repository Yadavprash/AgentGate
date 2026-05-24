"""Supabase access for the `actions` table (state machine + audit log).

If Supabase is not configured the gateway still runs: inserts return a local
uuid and updates are no-ops, so the core freeze/resume flow works without it
(only the live dashboard goes dark).
"""
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from gateway.config import settings

_client = None


def _get_client():
    global _client
    if _client is None:
        from supabase import create_client

        _client = create_client(settings.supabase_url, settings.supabase_service_key)
    return _client


async def insert_action(data: dict[str, Any]) -> str:
    """Insert an action row, return its id."""
    if not settings.supabase_enabled:
        return str(uuid.uuid4())

    def _do() -> str:
        res = _get_client().table("actions").insert(data).execute()
        return res.data[0]["id"]

    return await asyncio.to_thread(_do)


async def update_action(job_id: str, data: dict[str, Any]) -> None:
    if not settings.supabase_enabled:
        return

    def _do() -> None:
        _get_client().table("actions").update(data).eq("id", job_id).execute()

    await asyncio.to_thread(_do)


async def fetch_stale_intercepted(older_than_seconds: int) -> list[dict]:
    """Return actions stuck in 'intercepted' for longer than older_than_seconds.

    These are orphans from a previous gateway run whose in-memory asyncio.Event
    was lost on restart. We auto-deny them in the background sweep.
    """
    if not settings.supabase_enabled:
        return []

    cutoff = (
        datetime.now(timezone.utc) - timedelta(seconds=older_than_seconds)
    ).isoformat()

    def _do() -> list[dict]:
        res = (
            _get_client()
            .table("actions")
            .select("id, created_at")
            .eq("status", "intercepted")
            .lt("created_at", cutoff)
            .execute()
        )
        return res.data or []

    return await asyncio.to_thread(_do)


async def merge_action_display(job_id: str, additions: dict[str, Any]) -> None:
    """Read the row's current display jsonb, merge in additions, write back.
    Used for late-arriving fields like raw/redacted output."""
    if not settings.supabase_enabled:
        return

    def _do() -> None:
        client = _get_client()
        row = (
            client.table("actions")
            .select("display")
            .eq("id", job_id)
            .limit(1)
            .execute()
        )
        existing = (row.data[0].get("display") if row.data else None) or {}
        merged = {**existing, **additions}
        client.table("actions").update({"display": merged}).eq("id", job_id).execute()

    await asyncio.to_thread(_do)
