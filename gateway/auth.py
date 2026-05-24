"""API key authentication for the Bastion Gateway.

Customers generate a key with `bastion keygen` and pass it via:

    Authorization: Bearer sk-live-...

The key is hashed (SHA-256) before being stored in Supabase. On every
protected request we hash the inbound key and look it up. Failures are
logged to the audit chain as `auth_failure` events so chain integrity
sees them.

When Supabase is not configured (tests, offline dev), auth is bypassed —
the gateway still runs end-to-end. To force auth even without Supabase,
set BASTION_REQUIRE_AUTH=1.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import secrets
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import Depends, Header, HTTPException, status

from gateway import db
from gateway.config import settings


# In-memory cache: hash -> (api_key_id, agent_id, expires_at). Avoid one DB
# round-trip per request. Cleared in tests via reset_auth_cache().
_cache: dict[str, dict] = {}
_cache_lock = asyncio.Lock()


def hash_key(plaintext: str) -> str:
    """SHA-256 of the key. Never store plaintext keys in the DB."""
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_api_key(prefix: str = "sk-live") -> str:
    """Generate a high-entropy API key with a recognizable prefix."""
    token = secrets.token_urlsafe(32)
    return f"{prefix}-{token}"


def reset_auth_cache() -> None:
    _cache.clear()


def require_auth() -> bool:
    """True if the gateway must authenticate every request.

    By default: required when Supabase is enabled OR BASTION_REQUIRE_AUTH=1.
    Forced off when BASTION_REQUIRE_AUTH=0 (handy for hackathon demos)."""
    explicit = os.environ.get("BASTION_REQUIRE_AUTH", "").strip()
    if explicit == "1":
        return True
    if explicit == "0":
        return False
    return settings.supabase_enabled


async def _lookup_key(key_hash: str) -> Optional[dict]:
    """Look up an API key by hash. None if not found, expired, or revoked."""
    cached = _cache.get(key_hash)
    if cached is not None:
        return cached

    if not settings.supabase_enabled:
        return None

    def _do() -> Optional[dict]:
        client = db._get_client()
        res = (
            client.table("api_keys")
            .select("id, agent_id, revoked_at, expires_at")
            .eq("key_hash", key_hash)
            .limit(1)
            .execute()
        )
        if not res.data:
            return None
        row = res.data[0]
        if row.get("revoked_at"):
            return None
        if row.get("expires_at"):
            try:
                exp = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
                if exp < datetime.now(timezone.utc):
                    return None
            except Exception:  # noqa: BLE001
                pass
        return row

    row = await asyncio.to_thread(_do)
    if row is not None:
        async with _cache_lock:
            _cache[key_hash] = row
    return row


async def verify_api_key(
    authorization: Annotated[Optional[str], Header()] = None,
    x_bastion_agent_id: Annotated[Optional[str], Header()] = None,
) -> dict:
    """FastAPI dependency: validates Bearer token, returns the key record.

    The returned dict carries agent_id so handlers / audit code can correlate
    actions back to the issuing customer.
    """
    if not require_auth():
        # Auth is disabled (offline dev / tests). Surface the agent id header
        # so audit rows still get an agent identity.
        return {"agent_id": x_bastion_agent_id or "anonymous", "id": None}

    if not authorization or not authorization.lower().startswith("bearer "):
        await _audit_auth_failure("missing_or_malformed_header", x_bastion_agent_id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        await _audit_auth_failure("empty_token", x_bastion_agent_id)
        raise HTTPException(status_code=401, detail="Empty bearer token.")

    record = await _lookup_key(hash_key(token))
    if record is None:
        await _audit_auth_failure("unknown_key", x_bastion_agent_id)
        raise HTTPException(status_code=401, detail="Invalid or revoked API key.")

    if x_bastion_agent_id:
        record = {**record, "agent_id": x_bastion_agent_id}
    return record


async def _audit_auth_failure(reason: str, agent_id: Optional[str]) -> None:
    """Append an auth_failure event to the chain. Best-effort: never raises."""
    try:
        from gateway import audit_log

        await audit_log.record_event(
            "auth_failure",
            actor="system",
            decision_kind="auth",
            payload={"reason": reason, "agent_id": agent_id or "anonymous"},
        )
    except Exception:  # noqa: BLE001
        pass


AuthDep = Annotated[dict, Depends(verify_api_key)]
