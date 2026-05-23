"""HTTP client an agent uses to talk to the AgentGate gateway."""
import os
from typing import Any, Optional

import httpx


class ApprovalTimeoutError(Exception):
    """Raised when no human responds before the gateway's timeout."""


class GateClient:
    _last_job_by_agent: dict[str, str] = {}

    def __init__(
        self,
        base_url: Optional[str] = None,
        agent_id: str = "agent-001",
        agent_name: str = "TaskForce-Alpha",
    ):
        self.base_url = (
            base_url or os.getenv("AGENTGATE_GATEWAY_URL", "http://localhost:8000")
        ).rstrip("/")
        self.agent_id = agent_id
        self.agent_name = agent_name
        # Long read timeout: a high-risk call is held open while a human decides.
        self._http = httpx.Client(
            timeout=httpx.Timeout(connect=10.0, read=320.0, write=10.0, pool=10.0)
        )

    def intercept(
        self,
        tool_name: str,
        tool_args: dict[str, Any],
        risk: str = "low",
        mode: str = "approval",
        display: Optional[dict[str, Any]] = None,
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
            resp = self._http.post(f"{self.base_url}/gate/intercept", json=body)
        except httpx.ReadTimeout as exc:
            raise ApprovalTimeoutError(
                f"No human decision for '{tool_name}' in time."
            ) from exc

        if resp.status_code == 408:
            raise ApprovalTimeoutError(f"Approval for '{tool_name}' timed out.")
        resp.raise_for_status()
        result = resp.json()
        job_id = result.get("job_id")
        if isinstance(job_id, str) and job_id:
            GateClient._last_job_by_agent[self.agent_id] = job_id
        return result

    def complete(self, job_id: str, status: str = "completed") -> None:
        """Best-effort report that an approved action finished running."""
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

    def last_job_id(self) -> Optional[str]:
        """Return the latest intercepted action id for this agent id."""
        return GateClient._last_job_by_agent.get(self.agent_id)

    def report_final_response(
        self,
        action_id: str,
        summary: str,
        status: str = "completed",
    ) -> None:
        """Push final agent response metadata into the audit trail.
        Best-effort: failures never block the agent process."""
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
