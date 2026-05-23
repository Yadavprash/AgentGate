"""Walk the audit_events hash chain and flag any tampering.

    $ python scripts/verify_audit_chain.py

Exit codes:
    0  chain verified across every event
    1  one or more events failed verification (tampering, deletion, or
       admin-level UPDATE that bypassed the no-update rule)
    2  configuration error (no Supabase, no events table)

This is the demo's "admin can't quietly erase a denial" beat - if a row is
modified out-of-band, this script catches it and exits non-zero.
"""
from __future__ import annotations

import os
import sys

from dotenv import load_dotenv

load_dotenv(override=True)

try:  # noqa: SIM105
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

# Make `from gateway.audit_log import canonical` work when run from repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gateway.audit_log import compute_hash  # noqa: E402

GREEN = "\033[92m"
RED = "\033[91m"
DIM = "\033[2m"
BOLD = "\033[1m"
RESET = "\033[0m"


def main() -> int:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not url or not key or "xxxx" in url:
        print("Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).")
        return 2

    from supabase import create_client

    client = create_client(url, key)
    try:
        rows = (
            client.table("audit_events")
            .select("*")
            .order("seq", desc=False)
            .execute()
            .data
        )
    except Exception as exc:  # noqa: BLE001
        print(f"Could not read audit_events: {exc}")
        print("Did you apply the audit_events block in supabase/schema.sql?")
        return 2

    if not rows:
        print("No audit events recorded yet. Run an agent first.")
        return 0

    print(f"{BOLD}AgentGate audit-chain verifier{RESET}")
    print(f"{DIM}Walking {len(rows)} events from seq #1 ...{RESET}\n")

    prev_hash = ""
    failures: list[tuple[int, str]] = []
    last_version_by_action: dict[str, int] = {}

    for row in rows:
        seq = row["seq"]
        stored_prev = row.get("prev_hash") or ""
        stored_this = row["this_hash"]
        action_id = row.get("action_id")
        actor = row.get("actor") or "system"
        decision_kind = row.get("decision_kind") or "completion"
        decision_version = int(row.get("decision_version") or 1)

        # Check 1: prev_hash chains to the previous row.
        if stored_prev != prev_hash:
            failures.append(
                (
                    seq,
                    f"prev_hash does not match prior event's this_hash "
                    f"(chain broken — event(s) inserted, deleted, or reordered)",
                )
            )

        # Check 2: this_hash is correct for the row's contents + the
        # expected prev_hash (the one we computed walking forward).
        recomputed = compute_hash(
            row["event_type"],
            action_id,
            actor,
            decision_kind,
            decision_version,
            row.get("payload") or {},
            prev_hash,
        )
        if recomputed != stored_this:
            failures.append(
                (seq, "this_hash mismatch (this row's contents were tampered)")
            )

        # Check 3: decision versions are monotonic per action.
        if action_id:
            prev_action_ver = last_version_by_action.get(action_id)
            if prev_action_ver is None:
                if decision_version != 1:
                    failures.append(
                        (
                            seq,
                            "decision_version should start at 1 for each action",
                        )
                    )
            elif decision_version != prev_action_ver + 1:
                failures.append(
                    (
                        seq,
                        "decision_version is not strictly increasing by 1 for this action",
                    )
                )
            last_version_by_action[action_id] = decision_version

        prev_hash = stored_this

    print(f"{BOLD}Result:{RESET}")
    if not failures:
        print(f"  {GREEN}✓ Audit chain VERIFIED across {len(rows)} events.{RESET}")
        print(f"  {GREEN}  No tampering detected.{RESET}")
        return 0

    print(f"  {RED}✗ AUDIT INTEGRITY FAILED.{RESET}")
    print(f"  {RED}  {len(failures)} mismatch(es) found:{RESET}\n")
    for seq, reason in failures:
        print(f"  {RED}  seq #{seq}: {reason}{RESET}")
    print(
        f"\n  {DIM}Someone tampered with the database after these events were "
        f"written.{RESET}"
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
