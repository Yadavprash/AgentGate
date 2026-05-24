"""Public exception hierarchy for bastion-sdk.

All errors raised by the SDK derive from BastionError so callers can do a
single try/except. Specific subclasses let agents handle distinct failures
(approval denied vs. gateway unreachable vs. misconfiguration).
"""
from __future__ import annotations


class BastionError(Exception):
    """Base class for every error raised by bastion-sdk."""


class BastionConfigError(BastionError):
    """Raised when required config (API key, gateway URL, policy file) is
    missing or invalid. Surfaced at SDK init time so problems are caught
    before the agent makes its first tool call."""


class GatewayDownError(BastionError):
    """Raised when the Gateway is unreachable and the configured fallback
    strategy is `raise`. Agents that want to handle this themselves should
    set BASTION_FALLBACK_ON_DOWN=raise."""


class DeniedError(BastionError):
    """Raised when an action is denied by a human reviewer OR auto-denied
    because the gateway was unreachable with BASTION_FALLBACK_ON_DOWN=deny.

    Carries the action_id (if one was assigned before the denial) and the
    reason so the agent can log it or surface it to the user.
    """

    def __init__(self, message: str, *, action_id: str | None = None, reason: str | None = None) -> None:
        super().__init__(message)
        self.action_id = action_id
        self.reason = reason


class ApprovalTimeoutError(BastionError):
    """Raised when the gateway holds the request open longer than the
    approval timeout. Kept as a distinct error so agents can differentiate
    'no human responded' from 'a human denied'."""


class AuthError(BastionError):
    """Raised when the gateway rejects the SDK's API key with 401."""
