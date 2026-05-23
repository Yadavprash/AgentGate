"""In-process registry that freezes and resumes intercepted agent requests.

A high-risk `/gate/intercept` request awaits an asyncio.Event keyed by job_id.
The Discord button callback (same event loop) calls resolve() to wake it.
"""
import asyncio

_events: dict[str, asyncio.Event] = {}
_results: dict[str, dict] = {}


def register(job_id: str) -> None:
    _events[job_id] = asyncio.Event()


def resolve(job_id: str, result: dict) -> bool:
    """Wake a frozen request with a decision. Returns False if job is unknown."""
    event = _events.get(job_id)
    if event is None or event.is_set():
        return False
    _results[job_id] = result
    event.set()
    return True


async def wait(job_id: str, timeout: float) -> dict:
    """Block until the job is resolved; raises asyncio.TimeoutError on expiry."""
    await asyncio.wait_for(_events[job_id].wait(), timeout)
    return _results.get(job_id, {})


def cleanup(job_id: str) -> None:
    _events.pop(job_id, None)
    _results.pop(job_id, None)
