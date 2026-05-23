"""`gate()` — wrap a plain function as a LangChain tool routed through AgentGate.

    search   = gate(search_domain,   risk="low")
    captcha  = gate(solve_captcha,   risk="high", mode="input")
    purchase = gate(execute_purchase, risk="high", mode="approval")
    verify   = gate(verify_identity,  risk="low", sensitive=True)
"""
import functools
import inspect
import os
from typing import Any, Callable, Optional

from langchain_core.tools import StructuredTool

from agentgate_sdk import policy
from agentgate_sdk.client import GateClient
from agentgate_sdk.redactor import redact as _redact


_default_client: Optional[GateClient] = None


def _client() -> GateClient:
    global _default_client
    if _default_client is None:
        _default_client = GateClient()
    return _default_client


def _first_line(text: Optional[str]) -> str:
    return (text or "").strip().split("\n")[0].strip()


def gate(
    func: Callable[..., Any],
    *,
    risk: str = "low",
    mode: str = "approval",
    sensitive: bool = False,
    name: Optional[str] = None,
    description: Optional[str] = None,
    display: Optional[Callable[[dict], dict] | dict] = None,
    client: Optional[GateClient] = None,
) -> StructuredTool:
    """Return a LangChain StructuredTool that gates `func` through AgentGate.

    When `sensitive=True`, the SDK strips raw args before the intercept call
    and pipes the tool's output through a LOCAL redactor (regex or Ollama)
    before returning to the agent. The cloud LLM never sees the raw values.
    """
    tool_name = name or func.__name__
    tool_desc = description or _first_line(func.__doc__) or tool_name

    # `--unsafe` / AGENTGATE_DISABLED bypass - returns the tool unwrapped, no
    # gateway, no HITL, no redaction. Used on stage to demo what happens WITHOUT
    # AgentGate so the contrast lands.
    if os.environ.get("AGENTGATE_DISABLED") == "1":
        return StructuredTool.from_function(
            func=func, name=tool_name, description=tool_desc
        )

    # Optional risk-policy override. If risk-policies.yaml lists this tool, the
    # YAML wins - security teams own policy in version control, developers just
    # call gate(my_tool) and pick up the right risk/mode/sensitive flags.
    pol = policy.policy_for(tool_name)
    if pol:
        risk = pol.get("risk", risk)
        mode = pol.get("mode", mode)
        sensitive = pol.get("sensitive", sensitive)

    gate_client = client or _client()

    @functools.wraps(func)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        bound = inspect.signature(func).bind(*args, **kwargs)
        bound.apply_defaults()
        call_args = dict(bound.arguments)

        # For sensitive tools, raw arg values stay local - log only key names.
        intercept_args = (
            {k: "[redacted]" for k in call_args} if sensitive else call_args
        )

        disp = display(call_args) if callable(display) else dict(display or {})
        if sensitive:
            disp["redacted"] = True

        result = gate_client.intercept(
            tool_name, intercept_args, risk=risk, mode=mode, display=disp
        )

        if result.get("decision") == "denied":
            payload = result.get("payload") or {}
            if "new_budget" in payload:
                nb = float(payload["new_budget"])
                return (
                    f"BUDGET CHANGED: the human reduced the max budget to ${nb:.2f}. "
                    "Re-check prices for cheaper options and try the action again with "
                    f"a choice under ${nb:.2f} - do not give up."
                )
            return (
                f"DENIED: a human reviewer blocked '{tool_name}'. Do not retry — "
                "tell the user the action was not approved."
            )

        if mode == "input":
            payload = result.get("payload") or {}
            return payload.get("answer", payload)

        # APPROVAL mode, approved: run the real tool.
        output = func(*args, **kwargs)

        if sensitive:
            # PII redaction happens locally before the agent (cloud LLM) ever sees it.
            raw_text = str(output)
            redacted, backend = _redact(raw_text)
            # Push both to the gateway so the dashboard can render the
            # before/after panel - best effort, never blocks.
            gate_client.report_redaction(
                result.get("job_id", ""), raw_text, redacted, backend
            )
            output = f"[PII redacted locally via {backend}] {redacted}"

        if risk == "high":
            gate_client.complete(result.get("job_id", ""), "completed")
        return output

    return StructuredTool.from_function(
        func=wrapped, name=tool_name, description=tool_desc
    )
