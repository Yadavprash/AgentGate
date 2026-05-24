"""End-to-end test against a real Uvicorn server, driving the real demo tools.

Run only this: pytest -m integration
Skip it:       pytest -m "not integration"
"""
import socket
import threading
import time

import httpx
import pytest
import uvicorn

from gateway import pause
from gateway.config import settings

pytestmark = pytest.mark.integration


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


@pytest.fixture(scope="module")
def live_server():
    port = _free_port()
    config = uvicorn.Config(
        "gateway.main:app", host="127.0.0.1", port=port, log_level="warning"
    )
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    base = f"http://127.0.0.1:{port}"
    for _ in range(50):
        try:
            httpx.get(f"{base}/healthz", timeout=1)
            break
        except Exception:  # noqa: BLE001
            time.sleep(0.1)
    else:
        raise RuntimeError("gateway did not start")

    yield base

    server.should_exit = True
    thread.join(timeout=5)


def _build_tools(monkeypatch, base_url):
    """Build the real demo tools wired to the live server."""
    monkeypatch.setattr("bastion_sdk.gate._default_client", None)
    monkeypatch.setenv("BASTION_GATEWAY_URL", base_url)
    from agent.tools import build_tools

    return build_tools()


def test_low_risk_tool_passes_through(live_server, monkeypatch):
    search, _check, _verify, _captcha, _purchase = _build_tools(
        monkeypatch, live_server
    )
    out = search.invoke({"idea": "coffee shop"})
    assert "brewdropcafe.com" in out


def test_high_risk_freeze_and_resume(live_server, monkeypatch):
    _search, _check, _verify, _captcha, purchase = _build_tools(
        monkeypatch, live_server
    )

    result: dict[str, str] = {}

    def run_tool():
        result["out"] = purchase.invoke(
            {"domain": "brewdropcafe.com", "price": 14.99}
        )

    worker = threading.Thread(target=run_tool)
    worker.start()

    job_id = None
    for _ in range(50):
        if pause._events:
            job_id = next(iter(pause._events))
            break
        time.sleep(0.1)
    assert job_id, "high-risk call never froze / registered a job"

    httpx.post(
        f"{live_server}/gate/decision",
        headers={"x-gate-secret": settings.gate_shared_secret},
        json={"job_id": job_id, "decision": "approved"},
        timeout=10,
    )

    worker.join(timeout=10)
    assert "PURCHASE COMPLETE" in result["out"]
