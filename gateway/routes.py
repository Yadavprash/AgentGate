import asyncio
import hashlib
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from gateway import audit_log, db, pause
from gateway.config import settings
from gateway.discord_bot import bot as discord_bot
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


@router.get("/healthz")
async def healthz():
    return {
        "status": "ok",
        "discord": settings.discord_enabled,
        "supabase": settings.supabase_enabled,
    }


@router.post("/gate/intercept", response_model=InterceptResponse)
async def intercept(req: InterceptRequest):
    """The airlock. Low-risk calls pass through; high-risk calls freeze here."""
    base_row = {
        "agent_id": req.agent_id,
        "agent_name": req.agent_name,
        "tool_name": req.tool_name,
        "tool_args": req.tool_args,
        "risk": req.risk,
        "mode": req.mode,
        "display": req.display,
        "cost": req.display.get("cost"),
    }

    # Low-risk: log as auto-approved and return immediately.
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

    # High-risk: create the job, ping Discord, then freeze the request.
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
    asyncio.create_task(discord_bot.send_card(job_id, req))

    try:
        result = await pause.wait(job_id, settings.approval_timeout)
    except asyncio.TimeoutError:
        await db.update_action(job_id, {"status": "timed_out", "decided_at": _now()})
        await audit_log.record_event(
            "timed_out",
            action_id=job_id,
            actor="system",
            decision_kind="approval",
        )
        raise HTTPException(status_code=408, detail="approval timed out")
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
    return InterceptResponse(job_id=job_id, decision=decision, payload=payload)


def _verify_hmac(raw: bytes, signature: str | None) -> bool:
    """Verify HMAC-SHA256(body, GATE_SHARED_SECRET). Hex digest, case-insensitive."""
    if not signature:
        return False
    expected = hmac.new(
        settings.gate_shared_secret.encode(), raw, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature.lower(), expected)


@router.post("/gate/decision")
async def decision(request: Request):
    """Resolve a frozen job externally. Accept either:
      - `x-gate-signature: <hex>` — HMAC-SHA256 of the raw request body (recommended for
        anything reachable from the public internet); or
      - `x-gate-secret: <shared secret>` — plain shared-secret header (dev convenience).
    The primary path is still the in-process Discord button callback, which bypasses this
    endpoint entirely and calls pause.resolve directly.
    """
    raw = await request.body()
    signed_ok = _verify_hmac(raw, request.headers.get("x-gate-signature"))
    secret_ok = request.headers.get("x-gate-secret") == settings.gate_shared_secret

    if not (signed_ok or secret_ok):
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        req = DecisionRequest.model_validate_json(raw)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"invalid body: {exc}")

    ok = pause.resolve(
        req.job_id, {"decision": req.decision, "payload": req.payload}
    )
    if not ok:
        raise HTTPException(status_code=404, detail="unknown or already-resolved job")
    return {"ok": True}


@router.post("/gate/complete")
async def complete(req: CompleteRequest):
    """The SDK reports here once an approved action has actually run."""
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
async def redaction(req: RedactionRequest):
    """SDK pushes the local redactor's input/output here so the dashboard can
    show a side-by-side "what was on the device" vs "what the cloud LLM saw"."""
    await db.merge_action_display(
        req.job_id,
        {
            "raw_output": req.raw_output,
            "redacted_output": req.redacted_output,
            "redaction_backend": req.backend,
        },
    )
    # Audit chain records only sanitized metadata - no raw PII in the log.
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
async def final_response(req: FinalResponseRequest):
    """SDK reports the final agent output decision as an audit event."""
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
