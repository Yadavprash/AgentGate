"""Local-LLM redaction via Ollama. Falls back gracefully — never raises."""
from __future__ import annotations

import re

try:
    import httpx
except ImportError:  # pragma: no cover
    httpx = None  # type: ignore[assignment]

from bastion_sdk.redactor.base import RedactionResult, RedactorBackend


_PROMPT = (
    "Summarize the following content in one short sentence. STRIP ALL "
    "personally identifiable information: names, dates of birth, phone "
    "numbers, addresses, email addresses, ID numbers, card numbers. Replace "
    "each redacted item with a placeholder in square brackets, e.g. [NAME], "
    "[EMAIL], [CARD]. Output only the summary, no preamble.\n\n"
    "---\n{content}\n---\n\nSummary:"
)

_PLACEHOLDER_RE = re.compile(r"\[([A-Z_]+)\]")


class OllamaBackend(RedactorBackend):
    """Posts to a local Ollama instance. On any error returns the original
    text with empty fields — the factory will fall back to regex."""

    name = "ollama"

    def __init__(self, endpoint: str, model: str, *, timeout: float = 20.0) -> None:
        self.endpoint = endpoint.rstrip("/")
        self.model = model
        self.timeout = timeout

    def redact(self, text: str) -> RedactionResult:
        if not text or httpx is None or not self.endpoint:
            return RedactionResult(text=text, fields=[])

        try:
            resp = httpx.Client(timeout=self.timeout).post(
                f"{self.endpoint}/api/generate",
                json={
                    "model": self.model,
                    "prompt": _PROMPT.format(content=text),
                    "stream": False,
                },
            )
            resp.raise_for_status()
            redacted = (resp.json().get("response", "") or "").strip()
        except Exception:  # noqa: BLE001 - fail-closed; let the caller fall back
            return RedactionResult(text=text, fields=[])

        if not redacted:
            return RedactionResult(text=text, fields=[])

        fields = sorted(set(_PLACEHOLDER_RE.findall(redacted)))
        return RedactionResult(text=redacted, fields=fields)
