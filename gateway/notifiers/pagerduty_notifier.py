"""PagerDuty notifier — fires an incident per high-risk action.

Uses PagerDuty Events API v2:
    POST https://events.pagerduty.com/v2/enqueue

Each intercepted action creates a `trigger` event keyed by the action_id;
on approval/denial we send a matching `resolve` so the incident closes
automatically. PagerDuty deduplicates by `dedup_key` so retries are safe.

Required env:
    PAGERDUTY_ROUTING_KEY=<from the integration's settings>

End-to-end verification needs a real PagerDuty service — TODO marked.
"""
from __future__ import annotations

import os
from typing import Any

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]

from gateway.models import InterceptRequest
from gateway.notifiers.base import Notifier


_ENQUEUE_URL = "https://events.pagerduty.com/v2/enqueue"


class PagerDutyNotifier(Notifier):
    name = "pagerduty"

    def __init__(self, routing_key: str | None = None) -> None:
        self.routing_key = routing_key or os.environ.get("PAGERDUTY_ROUTING_KEY", "")

    @property
    def enabled(self) -> bool:
        return bool(self.routing_key) and httpx is not None

    async def send(self, job_id: str, req: InterceptRequest) -> None:
        if not self.enabled:
            print(f"[pagerduty] DISABLED — set PAGERDUTY_ROUTING_KEY for {job_id}")
            return
        severity = "critical" if req.risk == "high" else "warning"
        summary = f"Bastion: agent {req.agent_name} is attempting `{req.tool_name}` ({req.risk})"
        payload = {
            "routing_key": self.routing_key,
            "event_action": "trigger",
            "dedup_key": f"bastion:{job_id}",
            "payload": {
                "summary": summary,
                "severity": severity,
                "source": req.agent_name,
                "component": req.tool_name,
                "custom_details": {
                    "agent_id": req.agent_id,
                    "tool_args": req.tool_args,
                    "display": req.display,
                    "action_id": job_id,
                },
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10) as ac:
                resp = await ac.post(_ENQUEUE_URL, json=payload)
                resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            print(f"[pagerduty] enqueue failed for {job_id}: {exc}")

    async def on_decision(
        self, job_id: str, decision: str, payload: dict[str, Any] | None = None
    ) -> None:
        """Resolve the incident now that a decision is in."""
        if not self.enabled:
            return
        body = {
            "routing_key": self.routing_key,
            "event_action": "resolve",
            "dedup_key": f"bastion:{job_id}",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as ac:
                await ac.post(_ENQUEUE_URL, json=body)
        except Exception as exc:  # noqa: BLE001
            print(f"[pagerduty] resolve failed for {job_id}: {exc}")
