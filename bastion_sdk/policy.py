"""Risk policy file loader (`bastion-policy.yaml`).

Security and compliance teams own risk classification in version control.
Agent developers just call `gate(my_tool)` — the policy file decides what
risk level applies. Per-tool entries override the developer's gate() args.

Schema (matches IMPLEMENTATION_ROADMAP T1-3):

    version: 1
    defaults:
      risk: low                 # low | high
      sensitive: false
      mode: approval            # approval | monitor | shadow | input

    notifications:
      channel: slack            # discord | slack | pagerduty | email | webhook
      webhook_url: https://hooks.slack.com/xxx

    tools:
      execute_payment:
        risk: high
        mode: approval
      fetch_patient_record:
        risk: low
        sensitive: true

The loader walks up from CWD looking for `bastion-policy.yaml`. Explicit
override via BASTION_POLICY_FILE wins.
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError:  # pragma: no cover
    yaml = None  # type: ignore[assignment]


POLICY_FILENAMES = ("bastion-policy.yaml",)
VALID_RISK = {"low", "high"}
VALID_MODE = {"approval", "monitor", "shadow", "input"}
VALID_CHANNEL = {"discord", "slack", "pagerduty", "email", "webhook"}


class PolicyValidationError(ValueError):
    """Raised by validate_policy(). Includes a list of human-readable errors."""

    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


@lru_cache(maxsize=1)
def _load() -> dict[str, Any]:
    """Read the policy file. Returns {} if missing, unreadable, or yaml absent."""
    if yaml is None:
        return {}

    explicit = os.environ.get("BASTION_POLICY_FILE", "").strip()
    if explicit:
        candidates: list[Path] = [Path(explicit)]
    else:
        cwd = Path.cwd()
        candidates = []
        for parent in [cwd, *cwd.parents]:
            for name in POLICY_FILENAMES:
                candidates.append(parent / name)

    for path in candidates:
        if path.is_file():
            try:
                with path.open(encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                if isinstance(data, dict):
                    return data
            except Exception:  # noqa: BLE001
                return {}
    return {}


def reload() -> None:
    """Drop the cached policy. Call from tests after writing a new file."""
    _load.cache_clear()


def loaded() -> bool:
    return bool(_load())


def defaults() -> dict[str, Any]:
    d = _load().get("defaults") or {}
    return d if isinstance(d, dict) else {}


def notifications() -> dict[str, Any]:
    """Return the `notifications:` block — channel + per-channel settings."""
    n = _load().get("notifications") or {}
    return n if isinstance(n, dict) else {}


def policy_for(tool_name: str) -> dict[str, Any]:
    """Return the per-tool policy entry, or {} if no entry exists.

    Notably we do NOT mix in `defaults` here: callers treat a non-empty dict
    as "policy overrides developer args", and applying defaults would silently
    override every gate() call. Use `defaults()` directly when you need them.
    """
    tools = _load().get("tools") or {}
    entry = tools.get(tool_name) if isinstance(tools, dict) else None
    return entry if isinstance(entry, dict) else {}


def anomaly_detection() -> dict[str, Any]:
    """Return the `anomaly_detection:` block (Tier 3 feature, parsed here so
    the YAML schema stays in one place)."""
    a = _load().get("anomaly_detection") or {}
    return a if isinstance(a, dict) else {}


def validate_policy(path: str | os.PathLike[str] | None = None) -> list[str]:
    """Validate a policy file. Returns a list of error strings (empty == OK).

    Used by `bastion validate-policy`. Errors include unknown keys, bad enum
    values, and references to risk levels / modes / channels that the SDK
    does not understand.
    """
    if yaml is None:
        return ["pyyaml is not installed; run `pip install pyyaml`."]

    if path is None:
        if not _load():
            return ["No bastion-policy.yaml found."]
        data = _load()
    else:
        p = Path(path)
        if not p.is_file():
            return [f"Policy file not found: {p}"]
        try:
            with p.open(encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
        except Exception as exc:  # noqa: BLE001
            return [f"YAML parse error: {exc}"]
        if not isinstance(data, dict):
            return ["Top-level must be a mapping."]

    errors: list[str] = []

    version = data.get("version")
    if version is not None and version != 1:
        errors.append(f"Unsupported policy version: {version} (expected 1).")

    d = data.get("defaults") or {}
    if d and not isinstance(d, dict):
        errors.append("`defaults:` must be a mapping.")
    else:
        if d.get("risk") and d["risk"] not in VALID_RISK:
            errors.append(f"defaults.risk: {d['risk']!r} not in {sorted(VALID_RISK)}")
        if d.get("mode") and d["mode"] not in VALID_MODE:
            errors.append(f"defaults.mode: {d['mode']!r} not in {sorted(VALID_MODE)}")
        if "sensitive" in d and not isinstance(d["sensitive"], bool):
            errors.append("defaults.sensitive must be a bool.")

    notif = data.get("notifications") or {}
    if notif and not isinstance(notif, dict):
        errors.append("`notifications:` must be a mapping.")
    elif notif.get("channel") and notif["channel"] not in VALID_CHANNEL:
        errors.append(
            f"notifications.channel: {notif['channel']!r} not in {sorted(VALID_CHANNEL)}"
        )

    tools = data.get("tools") or {}
    if tools and not isinstance(tools, dict):
        errors.append("`tools:` must be a mapping.")
    else:
        for name, entry in tools.items():
            if not isinstance(entry, dict):
                errors.append(f"tools.{name}: must be a mapping.")
                continue
            if entry.get("risk") and entry["risk"] not in VALID_RISK:
                errors.append(f"tools.{name}.risk: invalid value {entry['risk']!r}")
            if entry.get("mode") and entry["mode"] not in VALID_MODE:
                errors.append(f"tools.{name}.mode: invalid value {entry['mode']!r}")
            if "sensitive" in entry and not isinstance(entry["sensitive"], bool):
                errors.append(f"tools.{name}.sensitive: must be a bool")

    return errors
