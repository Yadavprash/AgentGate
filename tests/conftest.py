"""Shared pytest fixtures. Every test runs fully offline — Discord, Supabase,
and notifiers are forced off, so no network, no credentials, no real server
(except the one explicit integration test)."""
import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport

from bastion_sdk import policy
from bastion_sdk.config import reload_config
from bastion_sdk.redactor import reset_redactor
from gateway import auth, pause, notifiers
from gateway.config import settings
from gateway.main import app


@pytest.fixture(autouse=True)
def disable_external(monkeypatch):
    """Force fully-offline mode regardless of any .env present."""
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_service_key", "")
    monkeypatch.setattr(settings, "discord_bot_token", "")
    monkeypatch.setattr(settings, "discord_channel_id", 0)
    monkeypatch.setenv("RAZORPAY_KEY_ID", "")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "")
    monkeypatch.setenv("LOCAL_LLM_URL", "")
    monkeypatch.setenv("OLLAMA_ENDPOINT", "")
    # Auth is forced off when Supabase is disabled. Tests assert this path
    # works end-to-end (no Authorization header sent).
    monkeypatch.setenv("BASTION_REQUIRE_AUTH", "0")
    # Drop caches so each test sees a fresh policy / config / redactor.
    policy.reload()
    reload_config()
    reset_redactor()
    auth.reset_auth_cache()
    notifiers.reset_notifiers()


@pytest.fixture(autouse=True)
def clean_pause():
    """Drop any leftover frozen jobs between tests."""
    yield
    pause._events.clear()
    pause._results.clear()


@pytest_asyncio.fixture
async def client():
    """In-process HTTP client for the gateway app — no real server."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(
        transport=transport, base_url="http://test"
    ) as http_client:
        yield http_client


@pytest.fixture
def captured_jobs(monkeypatch):
    """Capture job_ids the gateway hands to its notifier pipeline. High-risk
    tests need this because /gate/intercept only returns the job_id AFTER it
    is resolved — and tests need that id to call /gate/decision."""
    jobs: list[str] = []

    async def fake_fanout_send(job_id, req):
        jobs.append(job_id)

    async def fake_fanout_decision(job_id, decision, payload=None):
        return

    monkeypatch.setattr(notifiers, "fanout_send", fake_fanout_send)
    monkeypatch.setattr(notifiers, "fanout_decision", fake_fanout_decision)
    return jobs


class StubGateClient:
    """Stand-in for BastionClient — returns a canned decision, records calls."""

    def __init__(self, response: dict):
        self.response = dict(response)
        self.intercept_calls: list[dict] = []
        self.complete_calls: list[dict] = []
        self.redaction_calls: list[dict] = []
        self.final_response_calls: list[dict] = []

    def intercept(self, tool_name, tool_args, risk="low", mode="approval", display=None):
        self.intercept_calls.append(
            {
                "tool_name": tool_name,
                "tool_args": dict(tool_args),
                "risk": risk,
                "mode": mode,
                "display": display,
            }
        )
        return self.response

    async def async_intercept(self, tool_name, tool_args, risk="low", mode="approval", display=None):
        return self.intercept(tool_name, tool_args, risk=risk, mode=mode, display=display)

    def complete(self, job_id, status="completed"):
        self.complete_calls.append({"job_id": job_id, "status": status})

    def report_redaction(self, job_id, raw, redacted, backend):
        self.redaction_calls.append(
            {"job_id": job_id, "raw": raw, "redacted": redacted, "backend": backend}
        )

    def report_final_response(self, action_id, summary, status="completed"):
        self.final_response_calls.append(
            {"action_id": action_id, "summary": summary, "status": status}
        )


@pytest.fixture
def stub_client_factory():
    return StubGateClient
