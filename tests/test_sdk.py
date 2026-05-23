"""Tests for the gate() LangChain wrapper, using a stub gateway client."""
from agentgate_sdk.langchain import gate


def _search(idea: str) -> str:
    """Search for domains."""
    return f"searched: {idea}"


def test_low_risk_runs_tool(stub_client_factory):
    stub = stub_client_factory({"job_id": "j1", "decision": "approved"})
    tool = gate(_search, risk="low", name="search", client=stub)

    assert tool.invoke({"idea": "coffee"}) == "searched: coffee"
    assert stub.complete_calls == []  # low-risk sends no completion ping


def test_high_approve_runs_and_completes(stub_client_factory):
    stub = stub_client_factory({"job_id": "j2", "decision": "approved"})
    tool = gate(_search, risk="high", mode="approval", name="search", client=stub)

    assert tool.invoke({"idea": "tea"}) == "searched: tea"
    assert stub.complete_calls == [{"job_id": "j2", "status": "completed"}]


def test_high_deny_returns_denied(stub_client_factory):
    stub = stub_client_factory({"job_id": "j3", "decision": "denied"})
    calls: list[str] = []

    def _impl(idea: str) -> str:
        """Real implementation that must not run when denied."""
        calls.append(idea)
        return "ran"

    tool = gate(_impl, risk="high", mode="approval", name="t", client=stub)
    out = tool.invoke({"idea": "y"})

    assert out.startswith("DENIED")
    assert calls == []  # the real function was never called


def test_modify_budget_returns_budget_changed(stub_client_factory):
    stub = stub_client_factory(
        {"job_id": "jB", "decision": "denied", "payload": {"new_budget": 12.0}}
    )
    calls: list[str] = []

    def _impl(idea: str) -> str:
        """Real impl that must not run when budget changed."""
        calls.append(idea)
        return "ran"

    tool = gate(_impl, risk="high", mode="approval", name="t", client=stub)
    out = tool.invoke({"idea": "x"})

    assert out.startswith("BUDGET CHANGED")
    assert "$12.00" in out
    assert calls == []  # real function not called


def test_input_mode_returns_answer(stub_client_factory):
    stub = stub_client_factory(
        {"job_id": "j4", "decision": "approved", "payload": {"answer": "7G4K9"}}
    )

    def _captcha(image_url: str) -> str:
        """The body must not run in INPUT mode."""
        return "should-not-run"

    tool = gate(_captcha, risk="high", mode="input", name="solve_captcha", client=stub)
    assert tool.invoke({"image_url": "http://img"}) == "7G4K9"


def test_sensitive_redacts_output_and_args(stub_client_factory, monkeypatch):
    """Sensitive tools strip args before intercept and redact output before return."""
    # Ensure no local LLM is configured - exercise the regex backend.
    monkeypatch.delenv("LOCAL_LLM_URL", raising=False)
    stub = stub_client_factory({"job_id": "jS", "decision": "approved"})

    def _lookup(customer_id: int) -> str:
        """Return raw PII."""
        return (
            f"Customer {customer_id}: Name: Jane Doe, "
            "Email: jane@example.com, Phone: +1 555-123-4567, "
            "Card: 4242 4242 4242 4242"
        )

    tool = gate(_lookup, risk="low", sensitive=True, name="lookup", client=stub)
    out = tool.invoke({"customer_id": 99})

    # 1. Output going back to the agent is PII-free
    assert "Jane Doe" not in out
    assert "jane@example.com" not in out
    assert "555-123-4567" not in out
    assert "4242 4242 4242 4242" not in out
    assert "[PII redacted locally" in out

    # 2. Raw args were never logged via intercept
    sent = stub.intercept_calls[0]
    assert sent["tool_args"] == {"customer_id": "[redacted]"}
    assert sent["display"].get("redacted") is True


def test_policy_yaml_overrides_gate_args(stub_client_factory, tmp_path, monkeypatch):
    """risk-policies.yaml is the source of truth - its entries OVERRIDE
    whatever the developer passed to gate()."""
    from agentgate_sdk import policy

    policy_file = tmp_path / "risk-policies.yaml"
    policy_file.write_text(
        "tools:\n"
        "  policy_pinned_tool:\n"
        "    risk: high\n"
        "    mode: approval\n",
        encoding="utf-8",
    )
    monkeypatch.setenv("AGENTGATE_POLICY_FILE", str(policy_file))
    policy.reload()

    stub = stub_client_factory({"job_id": "jp", "decision": "approved"})

    def _impl(thing: str) -> str:
        """A function the developer mistakenly marked low-risk."""
        return f"ran with {thing}"

    # Developer passes risk='low' - policy file should override to 'high'.
    tool = gate(_impl, risk="low", name="policy_pinned_tool", client=stub)
    tool.invoke({"thing": "x"})

    sent = stub.intercept_calls[0]
    assert sent["risk"] == "high", "policy file should have overridden risk=low"
    assert sent["mode"] == "approval"


def test_display_callable_receives_args(stub_client_factory):
    stub = stub_client_factory({"job_id": "j5", "decision": "approved"})
    tool = gate(
        _search,
        risk="high",
        mode="approval",
        name="search",
        display=lambda kw: {"summary": f"idea={kw['idea']}"},
        client=stub,
    )

    tool.invoke({"idea": "coffee"})
    assert stub.intercept_calls[0]["display"] == {"summary": "idea=coffee"}


def test_stub_client_supports_final_response_calls(stub_client_factory):
    stub = stub_client_factory({"job_id": "j6", "decision": "approved"})
    stub.report_final_response("j6", "done", status="completed")
    assert stub.final_response_calls == [
        {"action_id": "j6", "summary": "done", "status": "completed"}
    ]
