"""`gate()` — wrap any Python function as a Bastion-gated LangChain tool.

    search   = gate(search_domain,   risk="low")
    captcha  = gate(solve_captcha,   risk="high", mode="input")
    purchase = gate(execute_purchase, risk="high", mode="approval")
    verify   = gate(verify_identity,  risk="low", sensitive=True)

If `func` is async, gate() returns a coroutine wrapper automatically. The
explicit `async_gate()` exists for callers that want to be explicit.
"""
from __future__ import annotations

import asyncio
import functools
import inspect
import re
from typing import Any, Callable, Optional

from langchain_core.tools import StructuredTool

from bastion_sdk import policy
from bastion_sdk.client import BastionClient
from bastion_sdk.config import get_config
from bastion_sdk.redactor import redact as _redact


_default_client: Optional[BastionClient] = None
_PII_TOKEN_RE = re.compile(r"\[[A-Z_]+\]")


def _client() -> BastionClient:
    global _default_client
    if _default_client is None:
        _default_client = BastionClient()
    return _default_client


def _first_line(text: Optional[str]) -> str:
    return (text or "").strip().split("\n")[0].strip()


def _resolve_policy(
    tool_name: str,
    risk: str,
    mode: str,
    sensitive: bool,
) -> tuple[str, str, bool]:
    """Merge developer-supplied flags with bastion-policy.yaml. Policy wins."""
    pol = policy.policy_for(tool_name)
    if pol:
        risk = pol.get("risk", risk)
        mode = pol.get("mode", mode)
        sensitive = pol.get("sensitive", sensitive)
    return risk, mode, sensitive


def _denied_message(tool_name: str, payload: dict[str, Any]) -> str:
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


def _post_process(
    output: Any,
    tool_name: str,
    sensitive: bool,
    risk: str,
    intercept_result: dict[str, Any],
    gate_client: BastionClient,
) -> Any:
    """Shared sync/async post-processing: redact if sensitive, ping complete
    if high-risk."""
    if sensitive:
        raw_text = str(output)
        redacted, backend, fields = _redact(raw_text)
        tokens_found = _PII_TOKEN_RE.findall(redacted)
        token_summary = (
            ", ".join(sorted(set(tokens_found))) if tokens_found else
            (", ".join(fields) if fields else "none (semantic summary)")
        )
        print(
            f"[redactor] tool={tool_name} backend={backend} "
            f"raw_len={len(raw_text)} redacted_len={len(redacted)} "
            f"pii_tokens={token_summary}"
        )
        gate_client.report_redaction(intercept_result.get("job_id", ""), raw_text, redacted, backend)
        output = f"[PII redacted locally via {backend}] {redacted}"

    if risk == "high":
        gate_client.complete(intercept_result.get("job_id", ""), "completed")
    return output


def _make_sync_wrapper(
    func: Callable[..., Any],
    *,
    tool_name: str,
    risk: str,
    mode: str,
    sensitive: bool,
    display: Optional[Callable[[dict], dict] | dict],
    gate_client: BastionClient,
) -> Callable[..., Any]:
    sig = inspect.signature(func)

    @functools.wraps(func)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        call_args = dict(bound.arguments)

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
            return _denied_message(tool_name, result.get("payload") or {})

        if mode == "input":
            payload = result.get("payload") or {}
            return payload.get("answer", payload)

        output = func(*args, **kwargs)
        return _post_process(output, tool_name, sensitive, risk, result, gate_client)

    return wrapped


def _make_async_wrapper(
    func: Callable[..., Any],
    *,
    tool_name: str,
    risk: str,
    mode: str,
    sensitive: bool,
    display: Optional[Callable[[dict], dict] | dict],
    gate_client: BastionClient,
) -> Callable[..., Any]:
    sig = inspect.signature(func)

    @functools.wraps(func)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        call_args = dict(bound.arguments)

        intercept_args = (
            {k: "[redacted]" for k in call_args} if sensitive else call_args
        )

        disp = display(call_args) if callable(display) else dict(display or {})
        if sensitive:
            disp["redacted"] = True

        result = await gate_client.async_intercept(
            tool_name, intercept_args, risk=risk, mode=mode, display=disp
        )

        if result.get("decision") == "denied":
            return _denied_message(tool_name, result.get("payload") or {})

        if mode == "input":
            payload = result.get("payload") or {}
            return payload.get("answer", payload)

        output = await func(*args, **kwargs)
        return _post_process(output, tool_name, sensitive, risk, result, gate_client)

    return wrapped


def gate(
    func: Callable[..., Any],
    *,
    risk: str = "low",
    mode: str = "approval",
    sensitive: bool = False,
    name: Optional[str] = None,
    description: Optional[str] = None,
    display: Optional[Callable[[dict], dict] | dict] = None,
    client: Optional[BastionClient] = None,
) -> StructuredTool:
    """Wrap `func` so every call routes through the Bastion gateway.

    Sync and async functions both work — gate() detects and adapts. The
    explicit `async_gate()` alias exists for readability.
    """
    tool_name = name or func.__name__
    tool_desc = description or _first_line(func.__doc__) or tool_name

    cfg = get_config()
    if cfg.disabled:
        return StructuredTool.from_function(
            func=func, name=tool_name, description=tool_desc
        )

    risk, mode, sensitive = _resolve_policy(tool_name, risk, mode, sensitive)
    gate_client = client or _client()

    is_async = asyncio.iscoroutinefunction(func)
    if is_async:
        wrapped = _make_async_wrapper(
            func,
            tool_name=tool_name,
            risk=risk,
            mode=mode,
            sensitive=sensitive,
            display=display,
            gate_client=gate_client,
        )
        return StructuredTool.from_function(
            coroutine=wrapped, name=tool_name, description=tool_desc
        )

    wrapped = _make_sync_wrapper(
        func,
        tool_name=tool_name,
        risk=risk,
        mode=mode,
        sensitive=sensitive,
        display=display,
        gate_client=gate_client,
    )
    return StructuredTool.from_function(
        func=wrapped, name=tool_name, description=tool_desc
    )


def async_gate(
    func: Callable[..., Any],
    **kwargs: Any,
) -> StructuredTool:
    """Explicit async-only gate. Raises if `func` is not a coroutine function."""
    if not asyncio.iscoroutinefunction(func):
        raise TypeError(
            f"async_gate({func.__name__}): expected async def, got sync function. "
            "Use gate() for sync functions."
        )
    return gate(func, **kwargs)
