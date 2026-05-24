"""bastion-sdk — the airlock for autonomous AI agents.

    from bastion_sdk import gate
    gated = gate(my_tool, risk="high", sensitive=True)

See ARCHITECTURE.md and the README for the full picture.
"""
from bastion_sdk.gate import gate, async_gate
from bastion_sdk.client import BastionClient
from bastion_sdk.redactor import RedactorBackend
from bastion_sdk.exceptions import (
    ApprovalTimeoutError,
    AuthError,
    BastionConfigError,
    BastionError,
    DeniedError,
    GatewayDownError,
)

__version__ = "1.0.0"

__all__ = [
    "gate",
    "async_gate",
    "BastionClient",
    "RedactorBackend",
    "ApprovalTimeoutError",
    "AuthError",
    "BastionConfigError",
    "BastionError",
    "DeniedError",
    "GatewayDownError",
]
