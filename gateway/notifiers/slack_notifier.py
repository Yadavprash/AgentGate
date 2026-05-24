"""Slack notifier using Block Kit + interactive buttons.

Wire-up (customer side):
1. Create a Slack app, enable Interactivity & Shortcuts, set the request URL
   to `https://<your-gateway>/notify/slack/callback`.
2. Add a webhook URL (or bot token + chat:write scope) and put it in env:
       SLACK_WEBHOOK_URL=https://hooks.slack.com/...
       SLACK_SIGNING_SECRET=<from the app's "Basic Information">
3. Set `notifications.channel: slack` in bastion-policy.yaml.

The callback handler verifies the Slack signature, then resolves the
gateway pause exactly the same way the Discord button does.

NOTE: This implementation focuses on the OUTBOUND path (sending the card).
The inbound /notify/slack/callback route exists in gateway/routes.py.
End-to-end verification needs a real Slack app — TODO marked below.
"""
from __future__ import annotations

import os
from typing import Any

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]

from gateway import pause
from gateway.models import InterceptRequest
from gateway.notifiers.base import Notifier


def _blocks(job_id: str, req: InterceptRequest) -> list[dict]:
    risk_emoji = ":rotating_light:" if req.risk == "high" else ":warning:"
    args_pretty = ", ".join(f"{k}={v}" for k, v in (req.tool_args or {}).items()) or "—"
    cost = req.display.get("cost") if req.display else None
    fields = [
        {"type": "mrkdwn", "text": f"*Agent*\n{req.agent_name} ({req.agent_id})"},
        {"type": "mrkdwn", "text": f"*Tool*\n`{req.tool_name}`"},
        {"type": "mrkdwn", "text": f"*Risk*\n{req.risk}"},
        {"type": "mrkdwn", "text": f"*Mode*\n{req.mode}"},
    ]
    if cost is not None:
        fields.append({"type": "mrkdwn", "text": f"*Estimated cost*\n${cost}"})
    if req.display.get("threat"):
        fields.append({"type": "mrkdwn", "text": "*Threat flag*\n:rotating_light: yes"})

    actions = [
        {
            "type": "button",
            "style": "primary",
            "text": {"type": "plain_text", "text": "Approve"},
            "value": f"approve|{job_id}",
            "action_id": "bastion_approve",
        },
        {
            "type": "button",
            "style": "danger",
            "text": {"type": "plain_text", "text": "Deny"},
            "value": f"deny|{job_id}",
            "action_id": "bastion_deny",
        },
    ]

    return [
        {
            "type": "header",
            "text": {"type": "plain_text", "text": f"{risk_emoji} Bastion: action awaiting approval"},
        },
        {"type": "section", "fields": fields},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"*Args*\n```{args_pretty}```"}},
        {"type": "context", "elements": [{"type": "mrkdwn", "text": f"action_id `{job_id}`"}]},
        {"type": "actions", "elements": actions},
    ]


class SlackNotifier(Notifier):
    name = "slack"

    def __init__(self, webhook_url: str | None = None) -> None:
        self.webhook_url = webhook_url or os.environ.get("SLACK_WEBHOOK_URL", "")

    @property
    def enabled(self) -> bool:
        return bool(self.webhook_url) and httpx is not None

    async def send(self, job_id: str, req: InterceptRequest) -> None:
        if not self.enabled:
            print(f"[slack] DISABLED — set SLACK_WEBHOOK_URL to receive card for {job_id}")
            return
        try:
            async with httpx.AsyncClient(timeout=10) as ac:
                resp = await ac.post(
                    self.webhook_url,
                    json={
                        "text": f"Bastion: {req.tool_name} awaiting approval ({req.risk})",
                        "blocks": _blocks(job_id, req),
                    },
                )
                resp.raise_for_status()
        except Exception as exc:  # noqa: BLE001 - never leave the agent frozen
            print(f"[slack] failed to deliver card for {job_id}: {exc}")
            pause.resolve(
                job_id,
                {"decision": "denied", "payload": {"error": f"slack delivery failed: {exc}"}},
            )

    async def on_decision(
        self, job_id: str, decision: str, payload: dict[str, Any] | None = None
    ) -> None:
        # TODO(credentials): post a follow-up message to the original thread
        # marking the action approved/denied. Needs a bot token + chat:write
        # and the original message ts (returned by the initial Web API call).
        return
