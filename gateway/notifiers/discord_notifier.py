"""Discord notifier — wraps the existing in-process bot."""
from __future__ import annotations

from typing import Any

from gateway.discord_bot import bot as _bot
from gateway.models import InterceptRequest
from gateway.notifiers.base import Notifier


class DiscordNotifier(Notifier):
    name = "discord"

    async def start(self) -> None:
        await _bot.start()

    async def stop(self) -> None:
        await _bot.stop()

    async def send(self, job_id: str, req: InterceptRequest) -> None:
        await _bot.send_card(job_id, req)

    async def on_decision(
        self, job_id: str, decision: str, payload: dict[str, Any] | None = None
    ) -> None:
        # The Discord bot resolves its own pause on button click, so the
        # gateway has nothing to do here. Hook left for symmetry.
        return
