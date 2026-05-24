import asyncio
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from gateway import audit_log, db, notifiers, pause
from gateway.auth import AuthDep, verify_api_key
from gateway.config import settings
from gateway.models import (
    CompleteRequest,
    DecisionRequest,
    FinalResponseRequest,
    InterceptRequest,
    InterceptResponse,
    RedactionRequest,
)

router = APIRouter()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Health endpoints (T2-5 — included because the gateway-down fallback in
# T1-6 needs something for customers to point health checks at)
# ---------------------------------------------------------------------------


_started_at = time.monotonic()


@router.get("/healthz")
async def healthz() -> dict:
    return {
        "status": "ok",
        "discord": settings.discord_enabled,
        "supabase": settings.supabase_enabled,
    }


@router.get("/health")
async def health() -> dict:
    components = {
        "database": "ok" if settings.supabase_enabled else "disabled",
        "discord": "ok" if settings.discord_enabled else "disabled",
        "notifiers": "ok" if notifiers.active_notifiers() else "none-configured",
    }
    overall = "ok" if all(v != "error" for v in components.values()) else "degraded"
    return {
        "status": overall,
        "version": "1.0.0",
        "components": components,
        "uptime_seconds": int(time.monotonic() - _started_at),
    }


@router.get("/health/live")
async def live() -> dict:
    return {"alive": True}


@router.get("/health/ready")
async def ready() -> dict:
    if settings.supabase_enabled or notifiers.active_notifiers():
        return {"ready": True}
    raise HTTPException(status_code=503, detail="no notifier and no database configured")


# ---------------------------------------------------------------------------
# Intercept — the core airlock
# ---------------------------------------------------------------------------


@router.post("/gate/intercept", response_model=InterceptResponse)
async def intercept(req: InterceptRequest, auth: AuthDep) -> InterceptResponse:
    """The airlock. Low-risk calls pass through; high-risk calls freeze here."""
    # Prefer the agent_id pinned by the API key so a leaked key can't be
    # used to log actions under someone else's agent_id.
    pinned_agent_id = auth.get("agent_id") if auth else None
    effective_agent_id = pinned_agent_id if pinned_agent_id and pinned_agent_id != "anonymous" else req.agent_id

    base_row = {
        "agent_id": effective_agent_id,
        "agent_name": req.agent_name,
        "tool_name": req.tool_name,
        "tool_args": req.tool_args,
        "risk": req.risk,
        "mode": req.mode,
        "display": req.display,
        "cost": req.display.get("cost"),
    }

    if req.risk == "low":
        job_id = await db.insert_action({**base_row, "status": "auto_approved"})
        await audit_log.record_event(
            "auto_approved",
            action_id=job_id,
            actor="ai",
            decision_kind="tool_call",
            payload={
                "agent": req.agent_name,
                "tool": req.tool_name,
                "risk": req.risk,
                "sensitive": bool(req.display.get("redacted")),
            },
        )
        return InterceptResponse(job_id=job_id, decision="approved")

    # High-risk: create the job, ping notifiers, freeze the request.
    job_id = await db.insert_action({**base_row, "status": "intercepted"})
    await audit_log.record_event(
        "intercepted",
        action_id=job_id,
        actor="ai",
        decision_kind="tool_call",
        payload={
            "agent": req.agent_name,
            "tool": req.tool_name,
            "risk": req.risk,
            "mode": req.mode,
            "cost": req.display.get("cost"),
            "threat": bool(req.display.get("threat")),
        },
    )
    pause.register(job_id)

    # Fan out the prompt to every active channel (Discord + Slack + …).
    asyncio.create_task(notifiers.fanout_send(job_id, req))

    try:
        result = await pause.wait(job_id, settings.approval_timeout)
    except asyncio.TimeoutError:
        timeout_mins = settings.approval_timeout // 60
        reason = (
            f"Auto-denied: no human response within {timeout_mins} minute"
            f"{'s' if timeout_mins != 1 else ''}"
        )
        await db.update_action(
            job_id,
            {
                "status": "denied",
                "decided_at": _now(),
                "decision_payload": {"reason": reason},
            },
        )
        await audit_log.record_event(
            "denied",
            action_id=job_id,
            actor="system",
            decision_kind="approval",
            payload={"reason": reason},
        )
        await notifiers.fanout_decision(job_id, "denied", {"reason": reason})
        raise HTTPException(status_code=408, detail=reason)
    finally:
        pause.cleanup(job_id)

    decision = result.get("decision", "denied")
    payload = result.get("payload")
    await db.update_action(
        job_id,
        {"status": decision, "decision_payload": payload, "decided_at": _now()},
    )
    decision_kind = "input" if req.mode == "input" else "approval"
    await audit_log.record_event(
        decision,
        action_id=job_id,
        actor="human",
        decision_kind=decision_kind,
    )
    await notifiers.fanout_decision(job_id, decision, payload)
    return InterceptResponse(job_id=job_id, decision=decision, payload=payload)


# ---------------------------------------------------------------------------
# Decision endpoints — multiple ingress paths, same pause.resolve underneath.
# ---------------------------------------------------------------------------


def _verify_hmac(raw: bytes, signature: str | None) -> bool:
    if not signature:
        return False
    expected = hmac.new(
        settings.gate_shared_secret.encode(), raw, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)


@router.post("/gate/decision")
async def decision(request: Request) -> dict:
    """Legacy decision route. Auth via HMAC body signature or shared-secret header.
    Used by the existing Discord button infrastructure and by the test suite."""
    raw = await request.body()
    signed_ok = _verify_hmac(raw, request.headers.get("x-gate-signature"))
    secret_ok = request.headers.get("x-gate-secret") == settings.gate_shared_secret
    if not (signed_ok or secret_ok):
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        req = DecisionRequest.model_validate_json(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"invalid body: {exc}")

    ok = pause.resolve(req.job_id, {"decision": req.decision, "payload": req.payload})
    if not ok:
        raise HTTPException(status_code=404, detail="unknown or already-resolved job")
    return {"ok": True}


@router.post("/decision/{action_id}/{verb}")
async def decision_rest(
    action_id: str, verb: str, request: Request, auth: AuthDep
) -> dict:
    """RESTful decision endpoint used by the webhook channel's callbacks.

    POST /decision/{action_id}/approve
    POST /decision/{action_id}/deny
    POST /decision/{action_id}/modify   (body: {"payload": {...}})
    """
    if verb not in ("approve", "deny", "modify"):
        raise HTTPException(status_code=404, detail="unknown verb")
    body: dict[str, Any] = {}
    if verb == "modify":
        try:
            body = await request.json() or {}
        except Exception:
            body = {}

    decision_value = (
        "approved" if verb == "approve" else "denied" if verb == "deny" else "approved"
    )
    payload = body.get("payload") if verb == "modify" else None
    ok = pause.resolve(action_id, {"decision": decision_value, "payload": payload})
    if not ok:
        raise HTTPException(status_code=404, detail="unknown or already-resolved action")
    return {"ok": True, "decision": decision_value}


# ---------------------------------------------------------------------------
# Slack interactivity callback
# ---------------------------------------------------------------------------


def _verify_slack_signature(raw: bytes, timestamp: str, signature: str) -> bool:
    """Slack signs the raw body. https://api.slack.com/authentication/verifying-requests-from-slack"""
    secret = os.environ.get("SLACK_SIGNING_SECRET", "")
    if not secret or not timestamp or not signature:
        return False
    try:
        if abs(time.time() - int(timestamp)) > 60 * 5:
            return False
    except ValueError:
        return False
    basestring = f"v0:{timestamp}:".encode() + raw
    expected = "v0=" + hmac.new(secret.encode(), basestring, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/notify/slack/callback")
async def slack_callback(request: Request) -> dict:
    """Slack posts form-encoded `payload=<json>` here when a user clicks a button."""
    raw = await request.body()
    ok = _verify_slack_signature(
        raw,
        request.headers.get("X-Slack-Request-Timestamp", ""),
        request.headers.get("X-Slack-Signature", ""),
    )
    if not ok:
        raise HTTPException(status_code=401, detail="invalid slack signature")

    # Slack sends form-urlencoded.
    from urllib.parse import parse_qs

    parsed = parse_qs(raw.decode("utf-8"))
    payload_raw = (parsed.get("payload") or [""])[0]
    try:
        payload = json.loads(payload_raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=422, detail="invalid payload json")

    actions = payload.get("actions") or []
    if not actions:
        return {"ok": True, "no_action": True}

    value = actions[0].get("value", "")
    try:
        verb, job_id = value.split("|", 1)
    except ValueError:
        raise HTTPException(status_code=422, detail="malformed action value")

    decision_value = "approved" if verb == "approve" else "denied"
    pause.resolve(job_id, {"decision": decision_value, "payload": None})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Email approve/deny link
# ---------------------------------------------------------------------------


@router.get("/notify/email/{token}")
async def email_decision(token: str) -> dict:
    """A signed link from the email notifier resolves the pause."""
    from gateway.notifiers.email_notifier import _verify_decision_token

    verified = _verify_decision_token(token)
    if verified is None:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    job_id, decision_value = verified
    ok = pause.resolve(job_id, {"decision": decision_value, "payload": None})
    if not ok:
        raise HTTPException(status_code=404, detail="unknown or already-resolved action")
    return {"ok": True, "decision": decision_value}


# ---------------------------------------------------------------------------
# Completion, redaction, final response
# ---------------------------------------------------------------------------


@router.post("/gate/complete")
async def complete(req: CompleteRequest, auth: AuthDep) -> dict:
    await db.update_action(
        req.job_id, {"status": req.status, "completed_at": _now()}
    )
    await audit_log.record_event(
        req.status,
        action_id=req.job_id,
        actor="system",
        decision_kind="completion",
    )
    return {"ok": True}


@router.post("/gate/redaction")
async def redaction(req: RedactionRequest, auth: AuthDep) -> dict:
    await db.merge_action_display(
        req.job_id,
        {
            "raw_output": req.raw_output,
            "redacted_output": req.redacted_output,
            "redaction_backend": req.backend,
        },
    )
    await audit_log.record_event(
        "redaction",
        action_id=req.job_id,
        actor="system",
        decision_kind="redaction",
        payload={
            "backend": req.backend,
            "raw_length": len(req.raw_output),
            "redacted_length": len(req.redacted_output),
        },
    )
    return {"ok": True}


@router.post("/gate/final_response")
async def final_response(req: FinalResponseRequest, auth: AuthDep) -> dict:
    await audit_log.record_event(
        "final_response",
        action_id=req.action_id,
        actor="ai",
        decision_kind="final_response",
        payload={
            "status": req.status,
            "summary": req.summary,
            "answer_length": req.answer_length,
        },
    )
    return {"ok": True}
