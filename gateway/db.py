"""Supabase access for the `actions` table (state machine + audit log).

If Supabase is not configured the gateway still runs: inserts return a local
uuid and updates are no-ops, so the core freeze/resume flow works without it
(only the live dashboard goes dark).
"""
import asyncio
import uuid
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
