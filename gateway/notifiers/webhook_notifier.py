"""Generic webhook notifier — POST the action to any URL.

The customer's own system receives the payload, builds whatever UX it wants
(Jira ticket, ServiceNow change request, in-house tool), then calls back to:
    POST /decision/{action_id}/approve
    POST /decision/{action_id}/deny
    POST /decision/{action_id}/modify

Required env:
    WEBHOOK_URL=https://customer.example.com/bastion-callback
    WEBHOOK_SECRET=<shared secret used to sign outgoing payloads with HMAC>

The outgoing payload is signed with HMAC-SHA256 over the raw JSON body so
the customer can verify it came from Bastion (header: X-Bastion-Signature).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from typing import Any

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]

from gateway import pause
from gateway.models import InterceptRequest
from gateway.notifiers.base import Notifier


def _sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


class WebhookNotifier(Notifier):
    name = "webhook"

    def __init__(self) -> None:
        self.url = os.environ.get("WEBHOOK_URL", "")
        self.secret = os.environ.get("WEBHOOK_SECRET", "")
        self.callback_base = os.environ.get(
            "BASTION_PUBLIC_URL", "http://localhost:8000"
        ).rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self.url) and httpx is not None

    async def send(self, job_id: str, req: InterceptRequest) -> None:
        if not self.enabled:
            print(f"[webhook] DISABLED — set WEBHOOK_URL for {job_id}")
            return

        body = {
            "action_id": job_id,
            "agent_id": req.agent_id,
            "agent_name": req.agent_name,
            "tool": req.tool_name,
            "args": req.tool_args,
            "risk": req.risk,
            "mode": req.mode,
            "display": req.display,
            "approve_url": f"{self.callback_base}/decision/{job_id}/approve",
            "deny_url": f"{self.callback_base}/decision/{job_id}/deny",
            "modify_url": f"{self.callback_base}/decision/{job_id}/modify",
        }
        raw = json.dumps(body, separators=(",", ":")).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.secret:
            headers["X-Bastion-Signature"] = _sign(self.secret, raw)

        try:
            async with httpx.AsyncClient(timeout=10) as ac:
                resp = await ac.post(self.url, content=raw, headers=headers)
                resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            print(f"[webhook] delivery failed for {job_id}: {exc}")
            pause.resolve(
                job_id,
                {"decision": "denied", "payload": {"error": f"webhook delivery failed: {exc}"}},
            )

    async def on_decision(
        self, job_id: str, decision: str, payload: dict[str, Any] | None = None
    ) -> None:
        # Customer already knows — their callback is what produced the decision.
        return
