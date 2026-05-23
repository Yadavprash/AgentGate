"""Optional risk-policy file.

When `risk-policies.yaml` is present at the repo root (or at the path in
`AGENTGATE_POLICY_FILE`), per-tool `risk` / `mode` / `sensitive` flags are
sourced from YAML instead of from the developer's `gate()` call.

The pitch: security teams own policy in version control, via PR review.
Agent developers just call `gate(my_tool)` and the right policy is applied
automatically - no risk classification scattered across the codebase.

Schema:

    defaults:
      risk: low                  # applied to tools not listed
      mode: approval
      sensitive: false

    tools:
      execute_purchase:
        risk: high
        mode: approval
      enter_credentials:
        risk: low
        sensitive: true

Missing file => no policy, gate() flags are used as written. Missing pyyaml
=> same. Loading is cached on first read; call `reload()` in tests.
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


@lru_cache(maxsize=1)
def _load() -> dict[str, Any]:
    """Read the policy file. Returns {} if missing / unreadable / yaml absent."""
    if yaml is None:
        return {}

    explicit = os.environ.get("AGENTGATE_POLICY_FILE", "").strip()
    if explicit:
        candidates = [Path(explicit)]
    else:
        cwd = Path.cwd()
        candidates = [parent / "risk-policies.yaml" for parent in [cwd, *cwd.parents]]

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
    """Drop the cached policy so the next lookup re-reads the file. For tests."""
    _load.cache_clear()


def loaded() -> bool:
    """True if a risk-policies file was found and parsed."""
    return bool(_load())


def defaults() -> dict[str, Any]:
    """Return the `defaults:` block of the policy file (or {})."""
    return _load().get("defaults") or {}


def policy_for(tool_name: str) -> dict[str, Any]:
    """Return the per-tool policy entry, or {} if no entry exists."""
    tools = _load().get("tools") or {}
    return tools.get(tool_name) or {}
