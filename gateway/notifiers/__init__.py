"""Notifier abstraction.

Each notifier knows how to:
- `send(action)`     — deliver an interactive approval prompt (button, modal, link).
- `on_decision(...)` — react to a decision recorded externally (e.g. resolve
                       a PagerDuty incident, edit the original Slack message).
- `start()` / `stop()` — lifecycle hooks called by the gateway lifespan.

`get_notifiers()` reads bastion-policy.yaml's `notifications:` block (or
falls back to Discord for back-compat with the original AgentGate setup)
and constructs the active list. The gateway fans the same action out to
every active notifier — companies often run two: Slack for visibility +
PagerDuty for on-call rotation.
"""
from gateway.notifiers.base import Notifier
from gateway.notifiers.factory import (
    active_notifiers,
    fanout_decision,
    fanout_send,
    reset_notifiers,
    shutdown_notifiers,
    start_notifiers,
)

__all__ = [
    "Notifier",
    "active_notifiers",
    "fanout_decision",
    "fanout_send",
    "reset_notifiers",
    "shutdown_notifiers",
    "start_notifiers",
]
