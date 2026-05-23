"""Pure-function tests for the audit-chain hashing. No Supabase involved."""
from gateway.audit_log import canonical, compute_hash


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
