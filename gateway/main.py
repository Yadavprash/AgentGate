import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI

from gateway import audit_log, db, notifiers
from gateway.agent_routes import router as agent_router
from gateway.agent_routes import shutdown_all as shutdown_agents
from gateway.config import settings
from gateway.routes import router


async def _deny_stale(job_id: str, reason: str) -> None:
    """Mark a single orphaned intercepted action as denied and append an audit event."""
    now = datetime.now(timezone.utc).isoformat()
    await db.update_action(
        job_id,
        {
            "status": "denied",
            "decided_at": now,
            "decision_payload": {"reason": reason},
        },
    )
    await audit_log.record_event(
        "denied",
        action_id=job_id,
        actor="system",
        decision_kind="approval",
        payload={"reason": reason},
    )
    print(f"[sweep] auto-denied stale action {job_id}: {reason}")


async def _sweep_stale_actions() -> None:
    """Find intercepted actions older than approval_timeout and deny them.

    Runs every 60 s in addition to the synchronous sweep at startup, so
    nothing stays frozen indefinitely.
    """
    timeout_mins = settings.approval_timeout // 60
    reason = (
        f"Auto-denied: no human response within {timeout_mins} minute"
        f"{'s' if timeout_mins != 1 else ''}"
    )
    while True:
        try:
            stale = await db.fetch_stale_intercepted(settings.approval_timeout)
            for row in stale:
                await _deny_stale(row["id"], reason)
        except Exception as exc:  # noqa: BLE001
            print(f"[sweep] error during stale-action sweep: {exc}")
        await asyncio.sleep(60)


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[gateway] starting Bastion")
    print(f"[gateway]   supabase  : {'enabled' if settings.supabase_enabled else 'DISABLED'}")
    active = notifiers.active_notifiers()
    print(f"[gateway]   notifiers : {', '.join(n.name for n in active) or 'NONE'}")
    print(f"[gateway]   timeout   : {settings.approval_timeout}s → auto-deny")
    await notifiers.start_notifiers()
    sweep_task = asyncio.create_task(_sweep_stale_actions())
    yield
    sweep_task.cancel()
    await shutdown_agents()
    await notifiers.shutdown_notifiers()


app = FastAPI(title="Bastion Gateway", version="1.0.0", lifespan=lifespan)
app.include_router(router)
app.include_router(agent_router)


@app.get("/")
async def root():
    return {"service": "Bastion Gateway", "docs": "/docs", "health": "/health"}
