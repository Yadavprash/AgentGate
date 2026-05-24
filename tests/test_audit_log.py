"""Pure-function tests for the audit-chain hashing. No Supabase involved."""
import asyncio
import time
from unittest.mock import patch

import pytest

from gateway.audit_log import canonical, compute_hash, record_event


def test_canonical_is_deterministic():
    """Same inputs must always produce identical bytes — keys sorted, etc."""
    a = canonical("approved", "abc", "human", "approval", 2, {"x": 1, "y": 2}, "prev")
    b = canonical("approved", "abc", "human", "approval", 2, {"y": 2, "x": 1}, "prev")
    assert a == b


def test_compute_hash_changes_when_event_changes():
    """Different content -> different hash."""
    h1 = compute_hash("approved", "abc", "human", "approval", 1, {"x": 1}, "prev0")
    h2 = compute_hash("denied", "abc", "human", "approval", 1, {"x": 1}, "prev0")
    h3 = compute_hash("approved", "abc", "human", "approval", 1, {"x": 2}, "prev0")
    h4 = compute_hash("approved", "abc", "human", "approval", 1, {"x": 1}, "prev1")
    h5 = compute_hash("approved", "xyz", "human", "approval", 1, {"x": 1}, "prev0")
    h6 = compute_hash("approved", "abc", "ai", "approval", 1, {"x": 1}, "prev0")
    h7 = compute_hash("approved", "abc", "human", "input", 1, {"x": 1}, "prev0")
    h8 = compute_hash("approved", "abc", "human", "approval", 2, {"x": 1}, "prev0")

    assert h1 != h2
    assert h1 != h3
    assert h1 != h4
    assert h1 != h5
    assert h1 != h6
    assert h1 != h7
    assert h1 != h8


def test_compute_hash_is_sha256_hex():
    h = compute_hash("approved", "abc", "human", "approval", 1, {}, "")
    assert len(h) == 64
    assert all(c in "0123456789abcdef" for c in h)


def test_chain_links_predictably():
    """If the verifier walks forward, prev_hash[N] should equal this_hash[N-1]."""
    h1 = compute_hash("intercepted", "a", "ai", "tool_call", 1, {"tool": "x"}, "")
    h2 = compute_hash("approved", "a", "human", "approval", 2, {}, h1)
    h3 = compute_hash("completed", "a", "system", "completion", 3, {}, h2)

    # Reordering or tampering breaks the chain.
    tampered = compute_hash("approved", "a", "human", "approval", 2, {"hacked": True}, h1)
    assert tampered != h2
    # And the next event's hash would diverge too because it'd be chained off
    # the recomputed (tampered) value rather than the original.
    h3_after_tamper = compute_hash("completed", "a", "system", "completion", 3, {}, tampered)
    assert h3_after_tamper != h3


def test_decision_version_changes_hash_for_same_payload():
    h1 = compute_hash("approved", "a", "human", "approval", 1, {"ok": True}, "prev")
    h2 = compute_hash("approved", "a", "human", "approval", 2, {"ok": True}, "prev")
    assert h1 != h2


class _FakeQuery:
    """One per `.table()` call, mirroring postgrest's per-query builder lifecycle."""

    def __init__(self, store: list[dict]):
        self._store = store
        self._order_col: str | None = None
        self._order_desc = False
        self._filter_col: str | None = None
        self._filter_val = None
        self._limit_n: int | None = None
        self._insert_payload: dict | None = None

    def select(self, _cols: str):
        return self

    def order(self, col: str, desc: bool = False):
        self._order_col = col
        self._order_desc = desc
        return self

    def eq(self, col: str, val):
        self._filter_col = col
        self._filter_val = val
        return self

    def limit(self, n: int):
        self._limit_n = n
        return self

    def insert(self, payload: dict):
        self._insert_payload = payload
        return self

    def execute(self):
        if self._insert_payload is None:
            # READ — sleep widens the read-then-write gap so the race actually fires
            # when the lock is removed.
            time.sleep(0.005)
            rows = list(self._store)
            if self._filter_col:
                rows = [r for r in rows if r.get(self._filter_col) == self._filter_val]
            if self._order_col:
                rows.sort(
                    key=lambda r: r.get(self._order_col, 0),
                    reverse=self._order_desc,
                )
            if self._limit_n is not None:
                rows = rows[: self._limit_n]
            return type("Res", (), {"data": rows})()

        # WRITE.
        row = dict(self._insert_payload)
        row["seq"] = len(self._store) + 1
        self._store.append(row)
        return type("Res", (), {"data": [row]})()


class _FakeSupabaseClient:
    """Mimics the Supabase client; `.table()` returns a fresh per-call builder."""

    def __init__(self, store: list[dict]):
        self._store = store

    def table(self, name: str):
        assert name == "audit_events"
        return _FakeQuery(self._store)


@pytest.mark.asyncio
async def test_chain_is_intact_under_concurrent_writes():
    """N concurrent record_event calls must produce a chain whose prev_hash links
    are consistent walking forward. Without the asyncio.Lock around the
    read-latest -> insert sequence, two concurrent calls would both link off the
    same prev_hash and the second insert would have a stale prev_hash."""
    store: list[dict] = []

    class _Settings:
        supabase_enabled = True

    with patch("gateway.audit_log.settings", _Settings()), patch(
        "gateway.audit_log._get_client", return_value=_FakeSupabaseClient(store)
    ):
        await asyncio.gather(
            *[
                record_event(
                    "auto_approved",
                    action_id=f"action-{i}",
                    actor="ai",
                    decision_kind="tool_call",
                    payload={"i": i},
                )
                for i in range(20)
            ]
        )

    assert len(store) == 20, "every event should have been inserted"

    # Walk the chain forward and assert each prev_hash equals the prior this_hash.
    store.sort(key=lambda r: r["seq"])
    prev = ""
    for row in store:
        stored_prev = row.get("prev_hash") or ""
        assert stored_prev == prev, (
            f"chain broken at seq #{row['seq']}: stored prev_hash {stored_prev!r} "
            f"!= expected {prev!r} (race condition leaked through the lock)"
        )
        prev = row["this_hash"]
