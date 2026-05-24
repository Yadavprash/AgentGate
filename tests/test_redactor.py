"""Unit tests for the local PII redactor."""
from bastion_sdk.redactor import RegexBackend, redact


def _regex(text: str) -> str:
    return RegexBackend().redact(text).text


def test_email_redacted():
    assert "[EMAIL]" in _regex("Contact me at alice@example.com please")
    assert "alice@example.com" not in _regex("Contact me at alice@example.com please")


def test_phone_redacted():
    out = _regex("Call +91 98765 43210 or 555-123-4567 today")
    assert "98765" not in out
    assert "555-123-4567" not in out
    assert "[PHONE]" in out


def test_card_number_redacted():
    out = _regex("Card on file: 4242 4242 4242 4242")
    assert "4242 4242 4242 4242" not in out
    assert "[CARD]" in out


def test_ssn_redacted():
    out = _regex("SSN: 123-45-6789")
    assert "123-45-6789" not in out
    assert "[SSN]" in out


def test_dob_label_redacted():
    assert "1985-03-15" not in _regex("DOB: 1985-03-15")


def test_redact_returns_backend(monkeypatch):
    monkeypatch.delenv("LOCAL_LLM_URL", raising=False)
    out, backend, _fields = redact("Email me at foo@bar.com")
    assert backend == "regex"
    assert "[EMAIL]" in out


def test_redact_noop_on_empty():
    out, backend, _fields = redact("")
    assert backend == "noop"
    assert out == ""
