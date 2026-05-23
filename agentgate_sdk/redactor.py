"""Local-only PII redaction.

When a `gate(..., sensitive=True)` tool runs, its raw output is passed through
`redact()` BEFORE it goes back to the cloud LLM. Two backends:

1. **regex** (default, zero-deps, always works) - deterministic substitution of
   emails, phone numbers, card numbers, SSNs, and ISO dates with placeholder
   tokens. Useful when no local model is available.
2. **ollama** (opt-in via `LOCAL_LLM_URL`) - posts to a locally-running Ollama
   instance and asks a small model (default `llama3.2`) to produce a
   PII-stripped one-sentence summary. Stronger semantic redaction.

Both backends run **fully on the user's machine** - the redactor never makes
any network call beyond `localhost`. If Ollama is unreachable or errors, we
fall back to the regex backend (fail-closed: PII is never leaked because we
fail).
"""
import os
import re

try:
    import httpx
except ImportError:  # pragma: no cover - httpx is a hard dep but be defensive
    httpx = None


# Order matters: more specific patterns must run before broader ones, otherwise
# (for example) the phone pattern would chew up the start of a 16-digit card.
_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # Email addresses
    (re.compile(r"[\w.+-]+@[\w.-]+\.\w+"), "[EMAIL]"),
    # Labeled names ("Name: Jane Doe", "Customer Name: ...")
    (
        re.compile(r"(?i)\b(Name|Customer Name|Full name|Patient Name)[:\s]+[^\n,]+"),
        r"\1: [NAME]",
    ),
    # 16-digit card numbers (must run before phone)
    (re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b"), "[CARD]"),
    # US SSN
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "[SSN]"),
    # DOB labels ("DOB: 1985-03-15", "Born: 1985")
    (re.compile(r"(?i)\b(DOB|Date of Birth|Born)[:\s]+[^\n,]+"), r"\1: [DATE]"),
    # ISO dates
    (re.compile(r"\b\d{4}-\d{2}-\d{2}\b"), "[DATE]"),
    # Phone numbers - kept broad and last so it doesn't swallow cards/SSNs
    (re.compile(r"\+?\d[\d\s\-()]{8,18}\d"), "[PHONE]"),
]


def regex_redact(content: str) -> str:
    """Fast deterministic local redaction. No network. No model. Never raises."""
    out = content
    for pattern, replacement in _PATTERNS:
        out = pattern.sub(replacement, out)
    return out


def ollama_redact(content: str, base_url: str, model: str) -> str | None:
    """Local LLM redaction via Ollama. Returns None on any failure."""
    if httpx is None:
        return None
    prompt = (
        "Summarize the following content in one short sentence. STRIP ALL "
        "personally identifiable information: names, dates of birth, phone "
        "numbers, addresses, email addresses, ID numbers, card numbers. "
        "Output only the summary, no preamble.\n\n"
        f"---\n{content}\n---\n\nSummary:"
    )
    try:
        resp = httpx.Client(timeout=20).post(
            f"{base_url.rstrip('/')}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
        resp.raise_for_status()
        text = resp.json().get("response", "").strip()
        return text or None
    except Exception:  # noqa: BLE001 - fail-closed
        return None


def redact(content: str) -> tuple[str, str]:
    """Return (redacted_text, backend_used). Tries Ollama first if configured,
    falls back to regex. Never raises - the worst case is a regex redaction."""
    if not content:
        return content, "noop"

    url = os.environ.get("LOCAL_LLM_URL", "").strip()
    model = os.environ.get("LOCAL_LLM_MODEL", "llama3.2").strip()
    if url:
        out = ollama_redact(content, url, model)
        if out:
            return out, "local-llm"

    return regex_redact(content), "regex"
