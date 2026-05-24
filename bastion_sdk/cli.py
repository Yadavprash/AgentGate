"""bastion — the single CLI for setup, ops, and diagnostics.

Sub-commands:
    bastion init                — scaffold bastion-policy.yaml + .env.example
    bastion keygen              — print a fresh sk-live API key + its SHA-256 hash
    bastion validate-policy     — lint bastion-policy.yaml
    bastion verify-chain        — run the audit-chain integrity check
    bastion migrate             — apply pending Alembic migrations
    bastion migrate --check     — report current head vs. pending
    bastion status              — health-check the gateway, DB, notifiers

Built on top of `argparse` to keep the dependency footprint small. The
roadmap suggests Typer/Click; argparse keeps `pip install bastion-sdk` from
dragging in optional deps. If a future Tier 2 needs them, swap easily.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


# ----------------------- init -----------------------

_POLICY_TEMPLATE = """\
# bastion-policy.yaml — Bastion risk policy.
# Owned by security/compliance. PR-reviewed. Developers call gate(my_tool)
# and the entries below decide risk + sensitivity + mode automatically.

version: 1

defaults:
  risk: low
  sensitive: false
  mode: approval        # approval | monitor | shadow | input

notifications:
  channel: discord      # discord | slack | pagerduty | email | webhook

tools:
  # execute_payment:
  #   risk: high
  #   mode: approval
  # fetch_patient_record:
  #   risk: low
  #   sensitive: true
"""

_ENV_TEMPLATE = """\
# Minimum required (4 vars)
BASTION_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
DISCORD_BOT_TOKEN=

# Identity (recommended)
BASTION_AGENT_ID=
BASTION_AGENT_VERSION=

# Gateway behaviour
BASTION_GATEWAY_URL=http://localhost:8000
BASTION_FALLBACK_ON_DOWN=deny
BASTION_GATEWAY_TIMEOUT=5
BASTION_GATEWAY_RETRIES=3

# Redaction
BASTION_REDACTOR=regex
OLLAMA_ENDPOINT=
OLLAMA_MODEL=llama3.2
"""


def cmd_init(args: argparse.Namespace) -> int:
    cwd = Path.cwd()
    policy = cwd / "bastion-policy.yaml"
    envfile = cwd / ".env.example"

    wrote: list[str] = []
    if policy.exists() and not args.force:
        print(f"skip: {policy} already exists (use --force to overwrite)")
    else:
        policy.write_text(_POLICY_TEMPLATE, encoding="utf-8")
        wrote.append(str(policy))
    if envfile.exists() and not args.force:
        print(f"skip: {envfile} already exists (use --force to overwrite)")
    else:
        envfile.write_text(_ENV_TEMPLATE, encoding="utf-8")
        wrote.append(str(envfile))

    if wrote:
        print("Wrote:")
        for p in wrote:
            print(f"  - {p}")
    print(
        "\nNext: edit .env.example -> .env, run `bastion keygen` to mint your "
        "first API key, then start the gateway."
    )
    return 0


# ----------------------- keygen -----------------------


def cmd_keygen(args: argparse.Namespace) -> int:
    from gateway.auth import generate_api_key, hash_key

    key = generate_api_key()
    h = hash_key(key)
    print(key)
    print(
        f"\n# Hash to store in api_keys.key_hash (DO NOT store the plaintext):\n{h}\n",
        file=sys.stderr,
    )
    if args.insert:
        agent_id = args.agent_id or "default-agent"
        try:
            from gateway import db
            from gateway.config import settings
            import asyncio

            if not settings.supabase_enabled:
                print(
                    "[keygen] Supabase not configured; cannot insert row. "
                    "Store the hash manually.",
                    file=sys.stderr,
                )
                return 0

            def _insert() -> None:
                client = db._get_client()
                client.table("api_keys").insert(
                    {"key_hash": h, "agent_id": agent_id, "description": args.description or ""}
                ).execute()

            asyncio.run(_to_thread(_insert))
            print(f"[keygen] inserted row for agent_id={agent_id}", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001
            print(f"[keygen] insert failed: {exc}", file=sys.stderr)
            return 1
    return 0


async def _to_thread(fn):
    import asyncio

    return await asyncio.to_thread(fn)


# ----------------------- validate-policy -----------------------


def cmd_validate_policy(args: argparse.Namespace) -> int:
    from bastion_sdk import policy

    errors = policy.validate_policy(args.path)
    if not errors:
        print("ok")
        return 0
    print("policy errors:")
    for e in errors:
        print(f"  - {e}")
    return 1


# ----------------------- verify-chain -----------------------


def cmd_verify_chain(args: argparse.Namespace) -> int:
    # Defer to the existing verifier script if present, otherwise import the
    # in-package function.
    here = Path(__file__).resolve().parent.parent
    script = here / "scripts" / "verify_audit_chain.py"
    if script.is_file():
        os.execvp(sys.executable, [sys.executable, str(script)])
    print("verify-chain script not found in repo; nothing to do.")
    return 1


# ----------------------- migrate -----------------------


def cmd_migrate(args: argparse.Namespace) -> int:
    try:
        from alembic import command
        from alembic.config import Config
    except ImportError:
        print("alembic is not installed; run `pip install alembic`.", file=sys.stderr)
        return 1

    ini = Path("alembic.ini")
    if not ini.is_file():
        print("alembic.ini not found in CWD.", file=sys.stderr)
        return 1

    cfg = Config(str(ini))
    if args.check:
        command.current(cfg, verbose=True)
        command.heads(cfg, verbose=True)
        return 0
    command.upgrade(cfg, args.revision or "head")
    return 0


# ----------------------- status -----------------------


def cmd_status(args: argparse.Namespace) -> int:
    import httpx

    base = os.environ.get("BASTION_GATEWAY_URL", "http://localhost:8000").rstrip("/")
    try:
        resp = httpx.get(f"{base}/health", timeout=5)
        body = resp.json()
    except Exception as exc:  # noqa: BLE001
        print(f"gateway unreachable at {base}: {exc}")
        return 1
    print(json.dumps(body, indent=2))
    return 0 if body.get("status") == "ok" else 2


# ----------------------- entry point -----------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="bastion", description="Bastion — agent airlock CLI")
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("init", help="scaffold bastion-policy.yaml + .env.example")
    sp.add_argument("--force", action="store_true", help="overwrite existing files")
    sp.set_defaults(func=cmd_init)

    sp = sub.add_parser("keygen", help="generate a new API key")
    sp.add_argument("--insert", action="store_true", help="insert hash into api_keys")
    sp.add_argument("--agent-id", default=None, help="pin this key to an agent_id")
    sp.add_argument("--description", default=None)
    sp.set_defaults(func=cmd_keygen)

    sp = sub.add_parser("validate-policy", help="lint bastion-policy.yaml")
    sp.add_argument("path", nargs="?", default=None)
    sp.set_defaults(func=cmd_validate_policy)

    sp = sub.add_parser("verify-chain", help="run audit-chain integrity check")
    sp.set_defaults(func=cmd_verify_chain)

    sp = sub.add_parser("migrate", help="apply pending alembic migrations")
    sp.add_argument("--check", action="store_true", help="report current revision only")
    sp.add_argument("--revision", default=None)
    sp.set_defaults(func=cmd_migrate)

    sp = sub.add_parser("status", help="health-check the gateway")
    sp.set_defaults(func=cmd_status)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args) or 0)


if __name__ == "__main__":
    raise SystemExit(main())
