"""HTTP client an agent uses to talk to the AgentGate gateway."""
import os
from typing import Any, Optional

import httpx


class ApprovalTimeoutError(Exception):
    """Raised when no human responds before the gateway's timeout."""


class GateClient:
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
        return resp.json()

    def complete(self, job_id: str, status: str = "completed") -> None:
        """Best-effort report that an approved action finished running."""
        try:
            self._http.post(
                f"{self.base_url}/gate/complete",
                json={"job_id": job_id, "status": status},
            )
        except Exception:  # noqa: BLE001 - completion ping is non-critical
            pass
