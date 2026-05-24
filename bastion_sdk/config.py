"""Environment-driven configuration for bastion-sdk.

A single Config dataclass is loaded once at import time. Tests can rebuild
it with `reload_config()` after monkey-patching env vars.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Literal


FallbackStrategy = Literal["deny", "allow", "raise"]


def _env(name: str, *, default: str = "") -> str:
    return os.environ.get(name, "") or default


def _env_int(name: str, *, default: int = 0) -> int:
    raw = _env(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Config:
    api_key: str
    agent_id: str
    agent_version: str
    gateway_url: str
    gateway_timeout: int
    gateway_retries: int
    fallback_on_down: FallbackStrategy
    redactor: str
    ollama_endpoint: str
    ollama_model: str
    redactor_class: str
    disabled: bool
    log_level: str

    def require_api_key(self) -> str:
        """Returns the API key, raising BastionConfigError if it is unset.
        Called by client paths that actually need authentication, NOT at
        import time — so tests and offline usage stay usable."""
        if not self.api_key:
            from bastion_sdk.exceptions import BastionConfigError

            raise BastionConfigError(
                "BASTION_API_KEY is not set. Generate one with "
                "`bastion keygen` and add it to your environment."
            )
        return self.api_key


def load_config() -> Config:
    return Config(
        api_key=_env("BASTION_API_KEY"),
        agent_id=_env("BASTION_AGENT_ID", default="default-agent"),
        agent_version=_env("BASTION_AGENT_VERSION"),
        gateway_url=_env("BASTION_GATEWAY_URL", default="http://localhost:8000").rstrip("/"),
        gateway_timeout=_env_int("BASTION_GATEWAY_TIMEOUT", default=5),
        gateway_retries=_env_int("BASTION_GATEWAY_RETRIES", default=3),
        fallback_on_down=_normalize_fallback(_env("BASTION_FALLBACK_ON_DOWN", default="deny")),
        redactor=_env("BASTION_REDACTOR", default="regex").lower(),
        ollama_endpoint=_env("OLLAMA_ENDPOINT"),
        ollama_model=_env("OLLAMA_MODEL", default="llama3.2"),
        redactor_class=_env("BASTION_REDACTOR_CLASS"),
        disabled=_env("BASTION_DISABLED") == "1",
        log_level=_env("BASTION_LOG_LEVEL", default="INFO").upper(),
    )


def _normalize_fallback(raw: str) -> FallbackStrategy:
    v = (raw or "deny").strip().lower()
    if v in ("deny", "allow", "raise"):
        return v  # type: ignore[return-value]
    return "deny"


_config: Config | None = None


def get_config() -> Config:
    global _config
    if _config is None:
        _config = load_config()
    return _config


def reload_config() -> Config:
    """For tests: re-read env vars and rebuild the cached Config."""
    global _config
    _config = load_config()
    return _config
