"""Choose and cache the configured redactor backend.

BASTION_REDACTOR = regex | ollama | custom  (default: regex)
BASTION_REDACTOR_CLASS = dotted.path.to.MyClass  (when BASTION_REDACTOR=custom)

On any failure to construct or use a non-regex backend, we fall back to
regex with a warning. Redaction is fail-closed — we never return raw PII
because the configured backend errored.
"""
from __future__ import annotations

import importlib
import sys

from bastion_sdk.config import get_config
from bastion_sdk.redactor.base import RedactionResult, RedactorBackend
from bastion_sdk.redactor.ollama_backend import OllamaBackend
from bastion_sdk.redactor.regex_backend import RegexBackend


_cached: RedactorBackend | None = None


def reset_redactor() -> None:
    """Drop the cached redactor. For tests."""
    global _cached
    _cached = None


def _load_custom(dotted: str) -> RedactorBackend | None:
    """Import a customer-supplied subclass. Returns None on failure."""
    if "." not in dotted:
        print(f"[redactor] BASTION_REDACTOR_CLASS={dotted!r} is not a dotted path.", file=sys.stderr)
        return None
    module_path, _, attr = dotted.rpartition(".")
    try:
        module = importlib.import_module(module_path)
        cls = getattr(module, attr)
        instance = cls()
    except Exception as exc:  # noqa: BLE001
        print(f"[redactor] failed to load custom redactor {dotted}: {exc}", file=sys.stderr)
        return None
    if not isinstance(instance, RedactorBackend):
        print(
            f"[redactor] {dotted} does not subclass RedactorBackend; falling back.",
            file=sys.stderr,
        )
        return None
    return instance


def get_redactor() -> RedactorBackend:
    """Return the configured redactor backend, falling back to regex."""
    global _cached
    if _cached is not None:
        return _cached

    cfg = get_config()
    choice = (cfg.redactor or "regex").lower()

    backend: RedactorBackend | None = None
    if choice == "ollama":
        if cfg.ollama_endpoint:
            backend = OllamaBackend(cfg.ollama_endpoint, cfg.ollama_model)
        else:
            print("[redactor] BASTION_REDACTOR=ollama but OLLAMA_ENDPOINT unset; using regex.", file=sys.stderr)
    elif choice == "custom":
        backend = _load_custom(cfg.redactor_class) if cfg.redactor_class else None
        if backend is None:
            print("[redactor] BASTION_REDACTOR=custom failed to load; using regex.", file=sys.stderr)

    if backend is None:
        backend = RegexBackend()

    _cached = backend
    return backend


def redact(text: str) -> tuple[str, str, list[str]]:
    """Convenience wrapper: try the configured backend, fall back to regex on
    empty output, return (redacted_text, backend_name, fields_redacted)."""
    if not text:
        return text, "noop", []

    backend = get_redactor()
    try:
        result = backend.redact(text)
    except Exception as exc:  # noqa: BLE001 - fail-closed
        print(f"[redactor] {backend.name} backend raised: {exc}; falling back to regex.", file=sys.stderr)
        result = RegexBackend().redact(text)
        return result.text, "regex", result.fields

    # If a non-regex backend produced nothing useful, fall back to regex so we
    # never return raw PII just because (say) Ollama was unreachable.
    if backend.name != "regex" and (result.text == text or not result.text.strip()):
        fallback = RegexBackend().redact(text)
        return fallback.text, "regex", fallback.fields

    return result.text, backend.name, result.fields
