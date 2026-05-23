"""Unit tests for the freeze/resume registry."""
import asyncio

import pytest

from gateway import pause


async def test_register_resolve_wait():
    pause.register("job1")
    assert pause.resolve("job1", {"decision": "approved"}) is True
    result = await pause.wait("job1", timeout=1)
    assert result == {"decision": "approved"}


async def test_wait_times_out():
    pause.register("job2")
    with pytest.raises(asyncio.TimeoutError):
        await pause.wait("job2", timeout=0.2)


def test_resolve_unknown_job():
    assert pause.resolve("nope", {"decision": "approved"}) is False


async def test_resolve_twice_returns_false():
    pause.register("job3")
    assert pause.resolve("job3", {"decision": "approved"}) is True
    assert pause.resolve("job3", {"decision": "denied"}) is False


def test_cleanup_removes_keys():
    pause.register("job4")
    pause.resolve("job4", {"x": 1})
    pause.cleanup("job4")
    assert "job4" not in pause._events
    assert "job4" not in pause._results
