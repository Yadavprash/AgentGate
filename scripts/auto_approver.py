"""Auto-approver for demo runs.

Polls Supabase `actions` rows for status='intercepted' and posts an `approved`
decision to the gateway's `/gate/decision` endpoint using `x-gate-secret`.

Environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
  GATEWAY_URL (default http://localhost:8000)
  GATE_SHARED_SECRET
  POLL_INTERVAL (seconds, default 1)

Usage:
  python scripts/auto_approver.py

NOTE: Intended for demo/hackathon only. Don't use in production.
"""
import os
import time
import typing
import sys
import argparse

import httpx


def env(name: str, required: bool = False) -> typing.Optional[str]:
    v = os.environ.get(name)
    if required and not v:
        print(f"Missing env {name}")
        sys.exit(1)
    return v


SUPABASE_URL = env("SUPABASE_URL")
SUPABASE_SERVICE_KEY = env("SUPABASE_SERVICE_KEY")
GATEWAY_URL = env("AGENTGATE_GATEWAY_URL") or env("GATEWAY_URL") or "http://localhost:8000"
GATE_SHARED_SECRET = env("GATE_SHARED_SECRET") or env("AGENTGATE_SHARED_SECRET")
POLL_INTERVAL = float(env("POLL_INTERVAL") or "1")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Auto-approver for demo runs")
    p.add_argument("--dry-run", action="store_true", help="Do everything except POST decisions")
    p.add_argument("--limit", type=int, default=0, help="Stop after approving N actions (0 = unlimited)")
    p.add_argument("--agent-filter", type=str, default=None, help="Only approve actions for agent_name containing this string")
    p.add_argument("--verbose", action="store_true", help="Enable verbose logging")
    return p.parse_args()


ARGS = parse_args()


if not SUPABASE_URL or not SUPABASE_SERVICE_KEY or not GATE_SHARED_SECRET:
    print("SUPABASE_URL, SUPABASE_SERVICE_KEY, and GATE_SHARED_SECRET are required in env to run auto-approver.")
    sys.exit(1)

try:
    from supabase import create_client
except Exception as exc:  # pragma: no cover - optional dependency
    print("supabase package is required. Install with: pip install supabase"
          "\nFalling back to no-op.")
    raise

client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
http = httpx.Client(timeout=10.0)

print("Auto-approver starting. Polling Supabase for intercepted actions...")

seen = set()
approved_count = 0


def _post_with_retries(url: str, json: dict, headers: dict | None = None, retries: int = 3, backoff: float = 0.5) -> httpx.Response:
    last_exc = None
    for attempt in range(1, retries + 1):
        try:
            return http.post(url, json=json, headers=headers, timeout=5.0)
        except Exception as exc:
            last_exc = exc
            if attempt == retries:
                raise
            time.sleep(backoff * (2 ** (attempt - 1)))


try:
    while True:
        try:
            rows = (
                client.table("actions")
                .select("id, status, created_at, agent_name, tool_name, display")
                .eq("status", "intercepted")
                .order("created_at", {"ascending": False})
                .limit(100)
                .execute()
            )
            data = rows.data or []
            for r in data:
                job_id = r.get("id")
                agent_name = (r.get("agent_name") or "")
                if not job_id or job_id in seen:
                    continue
                if ARGS.agent_filter and ARGS.agent_filter not in agent_name:
                    if ARGS.verbose:
                        print(f"Skipping {job_id} due to agent_filter: {agent_name}")
                    continue
                print(f"Found intercepted job {job_id} (tool={r.get('tool_name')}, agent={agent_name}) — approving")
                body = {"job_id": job_id, "decision": "approved"}
                headers = {"x-gate-secret": GATE_SHARED_SECRET}
                try:
                    if ARGS.dry_run:
                        print(f"Dry-run: would POST decision for {job_id}")
                        seen.add(job_id)
                    else:
                        resp = _post_with_retries(f"{GATEWAY_URL.rstrip('/')}/gate/decision", json=body, headers=headers, retries=3, backoff=0.3)
                        if resp.status_code == 200:
                            print(f"Approved {job_id}")
                            seen.add(job_id)
                            approved_count += 1
                        else:
                            print(f"Failed to approve {job_id}: {resp.status_code} {resp.text}")
                    if ARGS.limit and ARGS.limit > 0 and approved_count >= ARGS.limit:
                        print(f"Reached limit of {ARGS.limit} approvals; exiting.")
                        raise KeyboardInterrupt
                except Exception as exc:
                    print(f"HTTP error approving {job_id}: {exc}")
        except Exception as exc:
            print(f"Error polling supabase: {exc}")
        time.sleep(POLL_INTERVAL)
except KeyboardInterrupt:
    print("Exiting auto-approver")
    sys.exit(0)
