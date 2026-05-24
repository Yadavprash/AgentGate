"""Deterministic regex-based redaction. Fast, no deps, fully offline."""
from __future__ import annotations

import re

from bastion_sdk.redactor.base import RedactionResult, RedactorBackend


# Order matters: specific patterns first, broader ones last, so e.g. the
# phone pattern does not swallow the start of a 16-digit card.
_PATTERNS: list[tuple[str, re.Pattern[str], str]] = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w.-]+\.\w+"), "[EMAIL]"),
    (
        "NAME",
        re.compile(r"(?i)\b(Name|Customer Name|Full name|Patient Name)[:\s]+[^\n,]+"),
        r"\1: [NAME]",
    ),
    ("CARD", re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), "[CARD]"),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    ("DATE_OF_BIRTH", re.compile(r"(?i)\b(DOB|Date of Birth|Born)[:\s]+[^\n,]+"), r"\1: [DATE]"),
    ("DATE", re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), "[DATE]"),
    ("URL", re.compile(r"https?://[^\s,]+"), "[URL]"),
    ("IP_ADDRESS", re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"), "[IP]"),
    ("PHONE", re.compile(r"\+?\d[\d\s\-()]{8,18}\d"), "[PHONE]"),
]


class RegexBackend(RedactorBackend):
    name = "regex"

    def redact(self, text: str) -> RedactionResult:
        if not text:
            return RedactionResult(text=text, fields=[])

        out = text
        found: list[str] = []
        for label, pattern, replacement in _PATTERNS:
            new_out, n = pattern.subn(replacement, out)
            if n > 0 and label not in found:
                found.append(label)
            out = new_out
        return RedactionResult(text=out, fields=found)
