"""In-process registry that freezes and resumes intercepted agent requests.

A high-risk `/gate/intercept` request awaits an asyncio.Event keyed by job_id.
The Discord button callback (same event loop) calls resolve() to wake it.
"""
import asyncio
import os
import json
from typing import Optional

_events: dict[str, asyncio.Event] = {}
_results: dict[str, dict] = {}

# Optional Redis-backed durable store (demo-friendly fallback). If REDIS_URL is
# provided and `redis.asyncio` is available, resolved decisions are persisted
# so they can be retrieved after a gateway restart.
_redis_client: Optional[object] = None
_redis_prefix = "agentgate:pause"
_redis_url = os.getenv("AGENTGATE_REDIS_URL") or os.getenv("REDIS_URL")
if _redis_url:
    try:
        import redis.asyncio as _aioredis  # type: ignore

        _redis_client = _aioredis.from_url(_redis_url, encoding="utf-8", decode_responses=True)
    except Exception:
        _redis_client = None


def register(job_id: str) -> None:
    _events[job_id] = asyncio.Event()


def resolve(job_id: str, result: dict) -> bool:
    """Wake a frozen request with a decision. Returns False if job is unknown."""
    event = _events.get(job_id)
    if event is None or event.is_set():
        return False
    _results[job_id] = result
    event.set()
    # Persist result to Redis for durability (best-effort).
    if _redis_client is not None:
        try:
            # store JSON string with a TTL
            _redis_client.set(f"{_redis_prefix}:result:{job_id}", json.dumps(result), ex=60 * 60)
        except Exception:
            pass
    return True


async def wait(job_id: str, timeout: float) -> dict:
    """Block until the job is resolved; raises asyncio.TimeoutError on expiry."""
    # If we have an in-memory event, wait on it (fast path).
    event = _events.get(job_id)
    if event is not None:
        await asyncio.wait_for(event.wait(), timeout)
        return _results.get(job_id, {})

    # No in-memory event (possibly after restart). Poll Redis for a persisted result.
    if _redis_client is not None:
        deadline = asyncio.get_event_loop().time() + timeout
        while True:
            try:
                raw = await _redis_client.get(f"{_redis_prefix}:result:{job_id}")
                if raw:
                    try:
                        return json.loads(raw)
                    except Exception:
                        return {}
            except Exception:
                # ignore transient redis errors
                pass
            if asyncio.get_event_loop().time() >= deadline:
                raise asyncio.TimeoutError()
            await asyncio.sleep(0.25)

    # Fallback: no event and no redis result
    raise asyncio.TimeoutError()


def cleanup(job_id: str) -> None:
    _events.pop(job_id, None)
    _results.pop(job_id, None)
