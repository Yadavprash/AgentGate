"""Email notifier — SMTP with signed-JWT approve/deny links.

The link approach avoids inboxes needing a login. The token is a short-lived
JWT (HS256) signed with BASTION_DASHBOARD_SECRET; the gateway's
`/notify/email/{token}` route verifies it and resolves the pause.

Required env:
    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TO
    BASTION_DASHBOARD_SECRET   (also reused by dashboard RBAC)

The JWT side requires PyJWT — added to the optional `notifiers` extra in
pyproject.toml. End-to-end verification needs a real SMTP server.
"""
from __future__ import annotations

import os
import smtplib
import ssl
import time
from email.message import EmailMessage
from typing import Any

from gateway import pause
from gateway.config import settings
from gateway.models import InterceptRequest
from gateway.notifiers.base import Notifier


def _sign_decision_token(job_id: str, decision: str, ttl_seconds: int = 1800) -> str:
    """Mint a signed token that grants permission to resolve `job_id` as
    `decision`. Falls back to HMAC if PyJWT isn't installed (good enough
    for the demo — JWT is just a richer envelope)."""
    secret = (
        os.environ.get("BASTION_DASHBOARD_SECRET")
        or settings.gate_shared_secret
        or "changeme"
    )
    exp = int(time.time()) + ttl_seconds
    try:
        import jwt  # type: ignore

        return jwt.encode(
            {"job_id": job_id, "decision": decision, "exp": exp},
            secret,
            algorithm="HS256",
        )
    except ImportError:
        # Fallback: HMAC-SHA256 over "job_id|decision|exp" — tiny but signed.
        import hashlib
        import hmac

        msg = f"{job_id}|{decision}|{exp}".encode()
        sig = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
        return f"{job_id}.{decision}.{exp}.{sig}"


def _verify_decision_token(token: str) -> tuple[str, str] | None:
    """Return (job_id, decision) if the token is valid + unexpired."""
    secret = (
        os.environ.get("BASTION_DASHBOARD_SECRET")
        or settings.gate_shared_secret
        or "changeme"
    )
    try:
        import jwt  # type: ignore

        data = jwt.decode(token, secret, algorithms=["HS256"])
        return str(data["job_id"]), str(data["decision"])
    except ImportError:
        pass
    except Exception:
        return None
    # Fallback HMAC verification
    try:
        import hashlib
        import hmac

        job_id, decision, exp_str, sig = token.split(".")
        exp = int(exp_str)
        if exp < int(time.time()):
            return None
        msg = f"{job_id}|{decision}|{exp}".encode()
        expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        return job_id, decision
    except Exception:
        return None


def _link(base_url: str, job_id: str, decision: str) -> str:
    token = _sign_decision_token(job_id, decision)
    return f"{base_url.rstrip('/')}/notify/email/{token}"


def _html_body(job_id: str, req: InterceptRequest, base_url: str) -> str:
    approve = _link(base_url, job_id, "approved")
    deny = _link(base_url, job_id, "denied")
    args_rows = "".join(
        f"<tr><td><code>{k}</code></td><td>{v}</td></tr>"
        for k, v in (req.tool_args or {}).items()
    )
    cost_row = ""
    if req.display.get("cost") is not None:
        cost_row = f"<tr><td><b>Estimated cost</b></td><td>${req.display['cost']}</td></tr>"
    return f"""\
<html><body style="font-family:system-ui,sans-serif">
<h2>Bastion: action awaiting approval</h2>
<table>
  <tr><td><b>Agent</b></td><td>{req.agent_name} ({req.agent_id})</td></tr>
  <tr><td><b>Tool</b></td><td><code>{req.tool_name}</code></td></tr>
  <tr><td><b>Risk</b></td><td>{req.risk}</td></tr>
  {cost_row}
</table>
<h3>Args</h3>
<table>{args_rows}</table>
<p style="margin-top:16px">
  <a href="{approve}" style="background:#16a34a;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Approve</a>
  &nbsp;
  <a href="{deny}" style="background:#dc2626;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Deny</a>
</p>
<p style="color:#888;font-size:12px">Links expire in 30 minutes. action_id: <code>{job_id}</code></p>
</body></html>"""


class EmailNotifier(Notifier):
    name = "email"

    def __init__(self) -> None:
        self.host = os.environ.get("SMTP_HOST", "")
        self.port = int(os.environ.get("SMTP_PORT", "587") or "587")
        self.user = os.environ.get("SMTP_USER", "")
        self.password = os.environ.get("SMTP_PASSWORD", "")
        self.sender = os.environ.get("SMTP_FROM") or self.user
        self.recipient = os.environ.get("SMTP_TO", "")
        self.base_url = os.environ.get("BASTION_PUBLIC_URL", "http://localhost:8000")

    @property
    def enabled(self) -> bool:
        return bool(self.host and self.user and self.password and self.recipient)

    async def send(self, job_id: str, req: InterceptRequest) -> None:
        if not self.enabled:
            print(f"[email] DISABLED — set SMTP_* env vars for {job_id}")
            return

        msg = EmailMessage()
        msg["Subject"] = f"[Bastion] {req.tool_name} awaiting approval ({req.risk})"
        msg["From"] = self.sender
        msg["To"] = self.recipient
        msg.set_content(
            f"Action {job_id}: {req.agent_name} wants to call {req.tool_name} "
            f"({req.risk}). Visit your dashboard or use the HTML buttons in this email."
        )
        msg.add_alternative(_html_body(job_id, req, self.base_url), subtype="html")

        try:
            import asyncio

            await asyncio.to_thread(self._send_sync, msg)
        except Exception as exc:  # noqa: BLE001
            print(f"[email] send failed for {job_id}: {exc}")
            pause.resolve(
                job_id,
                {"decision": "denied", "payload": {"error": f"email delivery failed: {exc}"}},
            )

    def _send_sync(self, msg: EmailMessage) -> None:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(self.host, self.port) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ctx)
            smtp.login(self.user, self.password)
            smtp.send_message(msg)
