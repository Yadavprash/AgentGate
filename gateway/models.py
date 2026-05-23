from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class InterceptRequest(BaseModel):
    agent_id: str
    agent_name: str
    tool_name: str
    tool_args: dict[str, Any] = Field(default_factory=dict)
    risk: Literal["low", "high"] = "low"
    mode: Literal["approval", "input"] = "approval"
    display: dict[str, Any] = Field(default_factory=dict)


class InterceptResponse(BaseModel):
    job_id: str
    decision: Literal["approved", "denied"]
    payload: Optional[dict[str, Any]] = None


class DecisionRequest(BaseModel):
    job_id: str
    decision: Literal["approved", "denied"]
    payload: Optional[dict[str, Any]] = None


class CompleteRequest(BaseModel):
    job_id: str
    status: Literal["completed", "failed"] = "completed"


class RedactionRequest(BaseModel):
    """SDK reports back what the local PII redactor saw vs what it returned."""

    job_id: str
    raw_output: str
    redacted_output: str
    backend: str = "regex"


class FinalResponseRequest(BaseModel):
    """SDK reports a summarized final agent response for audit continuity."""

    action_id: str
    status: Literal["completed", "halted", "failed"] = "completed"
    summary: str = ""
    answer_length: int = 0
