"""HTTP client an agent uses to talk to the Bastion Gateway.

Responsibilities:
- Attach BASTION_API_KEY as a Bearer token on every request.
- Attach BASTION_AGENT_ID / BASTION_AGENT_VERSION as headers so the audit
  trail can identify which agent (and version) made the call.
- Retry transient failures with exponential backoff.
- Apply the configured fallback strategy (deny | allow | raise) when the
  gateway is permanently unreachable.
"""
from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx

from bastion_sdk.config import Config, get_config
from bastion_sdk.exceptions import (
    ApprovalTimeoutError,
    AuthError,
    BastionError,
    DeniedError,
    GatewayDownError,
)


# Long read timeout on the held POST: a high-risk call is kept open while a
# human decides. Connection / write / pool stay short.
_DEFAULT_READ_TIMEOUT = 320.0


def _build_timeout(cfg: Config) -> httpx.Timeout:
    connect = max(1.0, float(cfg.gateway_timeout))
    return httpx.Timeout(
        connect=connect, read=_DEFAULT_READ_TIMEOUT, write=connect, pool=connect
    )


def _default_headers(cfg: Config) -> dict[str, str]:
    headers: dict[str, str] = {}
    if cfg.api_key:
        headers["Authorization"] = f"Bearer {cfg.api_key}"
    if cfg.agent_id:
        headers["X-Bastion-Agent-Id"] = cfg.agent_id
    if cfg.agent_version:
        headers["X-Bastion-Agent-Version"] = cfg.agent_version
    return headers


def _is_transient_error(exc: Exception) -> bool:
    # Read timeouts on /intercept are EXPECTED for high-risk holds — don't retry them.
    if isinstance(exc, httpx.ReadTimeout):
        return False
    return isinstance(exc, (httpx.ConnectError, httpx.ConnectTimeout, httpx.NetworkError, httpx.RemoteProtocolError))


def _apply_fallback(
    cfg: Config, tool_name: str, last_error: Exception
) -> dict[str, Any]:
    """Build a synthetic response (or raise) per fallback strategy."""
    msg = f"Bastion gateway unreachable while gating '{tool_name}': {last_error}"
    if cfg.fallback_on_down == "allow":
        print(f"[bastion] WARN: gateway down, fallback=allow — letting '{tool_name}' pass.")
        return {"job_id": "", "decision": "approved", "payload": {"fallback": "allow"}}
    if cfg.fallback_on_down == "raise":
        raise GatewayDownError(msg) from last_error
    # default: deny
    raise DeniedError(msg, reason="gateway_unreachable") from last_error


class BastionClient:
    """Synchronous client. The async variant (`async_intercept`) exists on
    the same instance and uses httpx.AsyncClient under the hood.

    """

    # Class-level so any test or runner can read the latest action id by agent.
    _last_job_by_agent: dict[str, str] = {}

    def __init__(
        self,
        base_url: str | None = None,
        agent_id: str | None = None,
        agent_name: str = "TaskForce-Alpha",
        *,
        config: Config | None = None,
    ) -> None:
        self.cfg = config or get_config()
        self.base_url = (base_url or self.cfg.gateway_url).rstrip("/")
        self.agent_id = agent_id or self.cfg.agent_id
        self.agent_name = agent_name
        self._timeout = _build_timeout(self.cfg)
        self._headers = _default_headers(self.cfg)
        self._http = httpx.Client(timeout=self._timeout, headers=self._headers)

    # ---------- retry/fallback core ----------

    def _request_with_retry(
        self, method: str, path: str, *, json: dict[str, Any], tool_name: str
    ) -> httpx.Response:
        """POST/GET with exponential backoff. Honors cfg.gateway_retries.
        Raises the final exception so the caller can apply fallback."""
        attempts = max(1, int(self.cfg.gateway_retries))
        last_exc: Exception | None = None
        for attempt in range(attempts):
            try:
                resp = self._http.request(method, f"{self.base_url}{path}", json=json)
                return resp
            except httpx.ReadTimeout:
                raise  # propagate untouched — caller treats this as ApprovalTimeout
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if not _is_transient_error(exc) or attempt == attempts - 1:
                    break
                # 1s, 2s, 4s — capped by configured retries
                time.sleep(2 ** attempt)
        assert last_exc is not None  # for type-checkers
        raise last_exc

    def _raise_for_status(self, resp: httpx.Response, tool_name: str) -> None:
        if resp.status_code == 401:
            raise AuthError(
                "Gateway rejected the API key (401). Check BASTION_API_KEY."
            )
        if resp.status_code == 408:
            raise ApprovalTimeoutError(f"Approval for '{tool_name}' timed out.")
        resp.raise_for_status()

    # ---------- public API ----------

    def intercept(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        risk: str = "low",
        mode: str = "approval",
        display: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Route a tool call through the gateway. Blocks for high-risk calls
        until a human decides. Returns {job_id, decision, payload}."""
        body = {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "risk": risk,
            "mode": mode,
            "display": display or {},
        }

        try:
            resp = self._request_with_retry(
                "POST", "/gate/intercept", json=body, tool_name=tool_name
            )
        except httpx.ReadTimeout as exc:
            raise ApprovalTimeoutError(
                f"No human decision for '{tool_name}' in time."
            ) from exc
        except (AuthError, BastionError):
            raise
        except Exception as exc:  # noqa: BLE001 - transport-level
            return _apply_fallback(self.cfg, tool_name, exc)

        self._raise_for_status(resp, tool_name)
        result = resp.json()
        job_id = result.get("job_id")
        if isinstance(job_id, str) and job_id:
            BastionClient._last_job_by_agent[self.agent_id] = job_id
        return result

    def complete(self, job_id: str, status: str = "completed") -> None:
        """Best-effort report that an approved action finished running."""
        if not job_id:
            return
        try:
            self._http.post(
                f"{self.base_url}/gate/complete",
                json={"job_id": job_id, "status": status},
            )
        except Exception:  # noqa: BLE001 - completion ping is non-critical
            pass

    def report_redaction(
        self, job_id: str, raw: str, redacted: str, backend: str
    ) -> None:
        """Push raw + redacted text to the gateway so the dashboard can show
        side-by-side proof. Best-effort: failures never block the agent."""
        if not job_id:
            return
        try:
            self._http.post(
                f"{self.base_url}/gate/redaction",
                json={
                    "job_id": job_id,
                    "raw_output": raw,
                    "redacted_output": redacted,
                    "backend": backend,
                },
            )
        except Exception:  # noqa: BLE001
            pass

    def last_job_id(self) -> str | None:
        return BastionClient._last_job_by_agent.get(self.agent_id)

    def report_final_response(
        self, action_id: str, summary: str, status: str = "completed"
    ) -> None:
        if not action_id:
            return
        try:
            self._http.post(
                f"{self.base_url}/gate/final_response",
                json={
                    "action_id": action_id,
                    "status": status,
                    "summary": summary,
                    "answer_length": len(summary or ""),
                },
            )
        except Exception:  # noqa: BLE001
            pass

    # ---------- async path (T2-1) ----------

    async def async_intercept(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        risk: str = "low",
        mode: str = "approval",
        display: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        body = {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "tool_name": tool_name,
            "tool_args": tool_args,
            "risk": risk,
            "mode": mode,
            "display": display or {},
        }
        attempts = max(1, int(self.cfg.gateway_retries))
        last_exc: Exception | None = None
        async with httpx.AsyncClient(timeout=self._timeout, headers=self._headers) as ac:
            for attempt in range(attempts):
                try:
                    resp = await ac.post(f"{self.base_url}/gate/intercept", json=body)
                    self._raise_for_status(resp, tool_name)
                    result = resp.json()
                    job_id = result.get("job_id")
                    if isinstance(job_id, str) and job_id:
                        BastionClient._last_job_by_agent[self.agent_id] = job_id
                    return result
                except httpx.ReadTimeout as exc:
                    raise ApprovalTimeoutError(
                        f"No human decision for '{tool_name}' in time."
                    ) from exc
                except (AuthError, BastionError):
                    raise
                except Exception as exc:  # noqa: BLE001
                    last_exc = exc
                    if not _is_transient_error(exc) or attempt == attempts - 1:
                        break
                    await asyncio.sleep(2 ** attempt)
        return _apply_fallback(self.cfg, tool_name, last_exc or RuntimeError("unknown"))

