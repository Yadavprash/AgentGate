"""Route tests for the gateway, run in-process via ASGITransport."""
import asyncio

from gateway.config import settings


async def test_healthz(client):
    resp = await client.get("/healthz")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["discord"] is False
    assert body["supabase"] is False


async def test_low_risk_autopass(client):
    resp = await client.post(
        "/gate/intercept",
        json={
            "agent_id": "a1",
            "agent_name": "TaskForce-Alpha",
            "tool_name": "search_domain",
            "tool_args": {"idea": "coffee"},
            "risk": "low",
            "mode": "approval",
            "display": {},
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["decision"] == "approved"
    assert body["job_id"]


async def _intercept_high(client, mode="approval", tool="execute_purchase"):
    return await client.post(
        "/gate/intercept",
        json={
            "agent_id": "a1",
            "agent_name": "TaskForce-Alpha",
            "tool_name": tool,
            "tool_args": {"domain": "brewdropcafe.com", "price": 14.99},
            "risk": "high",
            "mode": mode,
            "display": {"cost": 14.99},
        },
    )


async def _resolve(client, job_id, decision, payload=None):
    body = {"job_id": job_id, "decision": decision}
    if payload is not None:
        body["payload"] = payload
    return await client.post(
        "/gate/decision",
        headers={"x-gate-secret": settings.gate_shared_secret},
        json=body,
    )


async def test_high_risk_approve(client, captured_jobs):
    task = asyncio.create_task(_intercept_high(client))
    await asyncio.sleep(0.2)
    assert len(captured_jobs) == 1

    decision = await _resolve(client, captured_jobs[0], "approved")
    assert decision.status_code == 200

    resp = await task
    assert resp.status_code == 200
    assert resp.json()["decision"] == "approved"


async def test_high_risk_deny(client, captured_jobs):
    task = asyncio.create_task(_intercept_high(client))
    await asyncio.sleep(0.2)

    await _resolve(client, captured_jobs[0], "denied")
    resp = await task
    assert resp.json()["decision"] == "denied"


async def test_input_mode_returns_payload(client, captured_jobs):
    task = asyncio.create_task(
        _intercept_high(client, mode="input", tool="solve_captcha")
    )
    await asyncio.sleep(0.2)

    await _resolve(client, captured_jobs[0], "approved", payload={"answer": "7G4K9"})
    resp = await task
    body = resp.json()
    assert body["decision"] == "approved"
    assert body["payload"]["answer"] == "7G4K9"


async def test_decision_bad_secret(client):
    resp = await client.post(
        "/gate/decision",
        headers={"x-gate-secret": "wrong"},
        json={"job_id": "x", "decision": "approved"},
    )
    assert resp.status_code == 401


async def test_decision_unknown_job(client):
    resp = await _resolve(client, "does-not-exist", "approved")
    assert resp.status_code == 404


async def test_decision_via_hmac(client, captured_jobs):
    """The HMAC-signed body path - what real external webhooks should use."""
    import hashlib
    import hmac as _hmac
    import json

    task = asyncio.create_task(_intercept_high(client))
    await asyncio.sleep(0.2)
    body = json.dumps(
        {"job_id": captured_jobs[0], "decision": "approved"}
    ).encode()
    sig = _hmac.new(
        settings.gate_shared_secret.encode(), body, hashlib.sha256
    ).hexdigest()

    resp = await client.post(
        "/gate/decision",
        content=body,
        headers={"x-gate-signature": sig, "content-type": "application/json"},
    )
    assert resp.status_code == 200
    resolved = await task
    assert resolved.json()["decision"] == "approved"


async def test_decision_bad_hmac(client):
    resp = await client.post(
        "/gate/decision",
        content=b'{"job_id":"x","decision":"approved"}',
        headers={
            "x-gate-signature": "deadbeef" * 8,
            "content-type": "application/json",
        },
    )
    assert resp.status_code == 401


async def test_timeout(client, captured_jobs, monkeypatch):
    monkeypatch.setattr(settings, "approval_timeout", 0.5)
    resp = await _intercept_high(client)
    assert resp.status_code == 408


async def test_complete(client):
    resp = await client.post(
        "/gate/complete", json={"job_id": "any", "status": "completed"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
