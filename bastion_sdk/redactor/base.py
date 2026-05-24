"""Abstract redactor backend."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RedactionResult:
    """What a backend returns. `text` is the redacted output, `fields` lists
    the PII categories that were detected (e.g. ['EMAIL', 'CARD'])."""

    text: str
    fields: list[str] = field(default_factory=list)


class RedactorBackend:
    """Abstract redactor. Subclasses must implement `redact()`.

    name        — short identifier used in audit logs ("regex", "ollama", "custom").
    redact(t)   — return RedactionResult. MUST NOT raise: return the original
                  text with fields=[] if the backend can't redact, and let the
                  caller fall back.
    """

    name: str = "abstract"

    def redact(self, text: str) -> RedactionResult:
        raise NotImplementedError
