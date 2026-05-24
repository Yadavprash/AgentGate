"""Pluggable local PII redaction.

Public surface:
    RedactorBackend     — abstract base class
    RegexBackend        — default, no deps
    OllamaBackend       — opt-in, sends to local LLM
    get_redactor()      — returns the configured backend (cached)
    redact(text)        — convenience wrapper: returns (redacted_text, backend_name, fields)

Backends never make non-localhost network calls. If a backend errors, the
factory falls back to regex (fail-closed: PII never leaks because we fail).
"""
from bastion_sdk.redactor.base import RedactorBackend, RedactionResult
from bastion_sdk.redactor.regex_backend import RegexBackend
from bastion_sdk.redactor.ollama_backend import OllamaBackend
from bastion_sdk.redactor.factory import get_redactor, redact, reset_redactor

__all__ = [
    "RedactorBackend",
    "RedactionResult",
    "RegexBackend",
    "OllamaBackend",
    "get_redactor",
    "redact",
    "reset_redactor",
]
