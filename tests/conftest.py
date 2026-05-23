"""Shared pytest fixtures. Every test runs fully offline — Discord and Supabase
are forced off, so no network, no credentials, no real server (except the one
explicit integration test)."""
import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport

from gateway import pause
from gateway.config import settings
from gateway.discord_bot import bot as discord_bot
from gateway.main import app


@pytest.fixture(autouse=True)
def disable_external(monkeypatch):
    """Force fully-offline mode regardless of any .env present."""
    monkeypatch.setattr(settings, "supabase_url", "")
    monkeypatch.setattr(settings, "supabase_service_key", "")
    monkeypatch.setattr(settings, "discord_bot_token", "")
    monkeypatch.setattr(settings, "discord_channel_id", 0)
    # Keep tests fully offline - no Razorpay calls, no Ollama calls.
    monkeypatch.setenv("RAZORPAY_KEY_ID", "")
    monkeypatch.setenv("RAZORPAY_KEY_SECRET", "")
    monkeypatch.setenv("LOCAL_LLM_URL", "")


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
    """Capture job_ids the gateway hands to the Discord bot. High-risk tests need
    this because /gate/intercept only returns the job_id after it is resolved."""
    jobs: list[str] = []

    async def fake_send_card(job_id, req):
        jobs.append(job_id)

    monkeypatch.setattr(discord_bot, "send_card", fake_send_card)
    return jobs


class StubGateClient:
    """Stand-in for GateClient — returns a canned decision and records calls."""

    def __init__(self, response: dict):
        self.response = dict(response)
        self.intercept_calls: list[dict] = []
        self.complete_calls: list[dict] = []
        self.redaction_calls: list[dict] = []

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

    def complete(self, job_id, status="completed"):
        self.complete_calls.append({"job_id": job_id, "status": status})

    def report_redaction(self, job_id, raw, redacted, backend):
        self.redaction_calls.append(
            {
                "job_id": job_id,
                "raw": raw,
                "redacted": redacted,
                "backend": backend,
            }
        )


@pytest.fixture
def stub_client_factory():
    """Returns the StubGateClient class so a test can build one with its response."""
    return StubGateClient
