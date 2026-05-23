"""Unit tests for the local PII redactor."""
from agentgate_sdk.redactor import redact, regex_redact


def test_email_redacted():
    out = regex_redact("Contact me at alice@example.com please")
    assert "alice@example.com" not in out
    assert "[EMAIL]" in out


def test_phone_redacted():
    out = regex_redact("Call +91 98765 43210 or 555-123-4567 today")
    assert "98765" not in out
    assert "555-123-4567" not in out
    assert "[PHONE]" in out


def test_card_number_redacted():
    out = regex_redact("Card on file: 4242 4242 4242 4242")
    assert "4242 4242 4242 4242" not in out
    assert "[CARD]" in out


def test_ssn_redacted():
    out = regex_redact("SSN: 123-45-6789")
    assert "123-45-6789" not in out
    assert "[SSN]" in out


def test_dob_label_redacted():
    out = regex_redact("DOB: 1985-03-15")
    assert "1985-03-15" not in out


def test_redact_returns_backend(monkeypatch):
    monkeypatch.delenv("LOCAL_LLM_URL", raising=False)
    out, backend = redact("Email me at foo@bar.com")
    assert backend == "regex"
    assert "[EMAIL]" in out


def test_redact_noop_on_empty():
    out, backend = redact("")
    assert backend == "noop"
    assert out == ""
