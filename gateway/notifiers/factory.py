"""Build the active notifier list from bastion-policy.yaml + env.

`notifications.channel` accepts a single name OR a list of names so a customer
can fan out (e.g. Slack for visibility + PagerDuty for paging). The discord
notifier is always added when DISCORD_BOT_TOKEN is set, for back-compat with
existing AgentGate deployments.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any

from bastion_sdk import policy
from gateway.config import settings
from gateway.models import InterceptRequest
from gateway.notifiers.base import Notifier
from gateway.notifiers.discord_notifier import DiscordNotifier
from gateway.notifiers.email_notifier import EmailNotifier
from gateway.notifiers.pagerduty_notifier import PagerDutyNotifier
from gateway.notifiers.slack_notifier import SlackNotifier
from gateway.notifiers.webhook_notifier import WebhookNotifier


_active: list[Notifier] | None = None


def reset_notifiers() -> None:
    global _active
    _active = None


def _configured_channels() -> list[str]:
    """Resolution order: policy yaml -> NOTIFICATION_CHANNELS env -> discord (legacy)."""
    notif = policy.notifications()
    channel = notif.get("channel") if isinstance(notif, dict) else None
    if isinstance(channel, list):
        return [str(c).lower().strip() for c in channel if c]
    if isinstance(channel, str) and channel.strip():
        return [channel.lower().strip()]

    env = os.environ.get("NOTIFICATION_CHANNELS", "").strip()
    if env:
        return [c.strip().lower() for c in env.split(",") if c.strip()]

    if settings.discord_enabled:
        return ["discord"]
    return []


def _build(channel: str) -> Notifier | None:
    if channel == "discord":
        return DiscordNotifier()
    if channel == "slack":
        return SlackNotifier()
    if channel == "pagerduty":
        return PagerDutyNotifier()
    if channel == "email":
        return EmailNotifier()
    if channel == "webhook":
        return WebhookNotifier()
    print(f"[notifiers] unknown channel: {channel!r} (ignoring)")
    return None


def active_notifiers() -> list[Notifier]:
    global _active
    if _active is not None:
        return _active

    notifiers: list[Notifier] = []
    seen: set[str] = set()
    for channel in _configured_channels():
        if channel in seen:
            continue
        seen.add(channel)
        n = _build(channel)
        if n is not None:
            notifiers.append(n)

    # If a customer set DISCORD_BOT_TOKEN but didn't list discord explicitly,
    # add it as a secondary channel so legacy deployments don't go silent.
    if "discord" not in seen and settings.discord_enabled:
        notifiers.append(DiscordNotifier())

    if not notifiers:
        print("[notifiers] no channel configured; approvals must go through POST /gate/decision")

    _active = notifiers
    return _active


async def start_notifiers() -> None:
    for n in active_notifiers():
        try:
            await n.start()
        except Exception as exc:  # noqa: BLE001
            print(f"[notifiers] {n.name}.start() raised: {exc}")


async def shutdown_notifiers() -> None:
    for n in active_notifiers():
        try:
            await n.stop()
        except Exception as exc:  # noqa: BLE001
            print(f"[notifiers] {n.name}.stop() raised: {exc}")


async def fanout_send(job_id: str, req: InterceptRequest) -> None:
    """Send the approval prompt to every active notifier in parallel."""
    notifiers = active_notifiers()
    if not notifiers:
        print(f"[notifiers] no active channel; action {job_id} needs manual /gate/decision")
        return
    await asyncio.gather(
        *(n.send(job_id, req) for n in notifiers), return_exceptions=True
    )


async def fanout_decision(
    job_id: str, decision: str, payload: dict[str, Any] | None = None
) -> None:
    """Tell every notifier a decision has been recorded — resolve incidents,
    update messages, etc."""
    await asyncio.gather(
        *(n.on_decision(job_id, decision, payload) for n in active_notifiers()),
        return_exceptions=True,
    )
