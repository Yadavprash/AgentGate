"""Abstract notifier."""
from __future__ import annotations

from typing import Any

from gateway.models import InterceptRequest


class Notifier:
    """Override `send()` at minimum. The rest have safe defaults so partial
    implementations work — e.g. Slack overrides on_decision to update the
    original message; the webhook notifier doesn't need to."""

    name: str = "abstract"

    async def start(self) -> None:
        """Lifecycle: called once when the gateway boots. Open connections,
        log in, etc. No-op default."""
        return

    async def stop(self) -> None:
        """Lifecycle: called once on shutdown. No-op default."""
        return

    async def send(self, job_id: str, req: InterceptRequest) -> None:
        """Deliver an approval prompt for `job_id`. MUST NOT raise — on
        failure resolve the gateway pause with a denial so the agent never
        hangs (see helpers below)."""
        raise NotImplementedError

    async def on_decision(
        self, job_id: str, decision: str, payload: dict[str, Any] | None = None
    ) -> None:
        """Optional: react to a decision (close incident, update message)."""
        return
