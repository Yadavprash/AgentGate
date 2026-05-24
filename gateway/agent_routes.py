"""
Routes for launching and streaming demo agents directly from the dashboard UI.

POST /agent/launch   → spawn a subprocess, return run_id
GET  /agent/stream/{run_id} → SSE stream of stdout+stderr
DELETE /agent/run/{run_id} → terminate a running agent
"""

import asyncio
import os
import sys
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()

# Registry: run_id → live subprocess
_runs: dict[str, asyncio.subprocess.Process] = {}

ALLOWED_AGENTS = {"run", "bank_run", "injection_run"}


class LaunchRequest(BaseModel):
    agent: str       # "run" | "bank_run" | "injection_run"
    goal: str = ""   # overrides the agent's DEFAULT_GOAL when non-empty
    unsafe: bool = False


@router.post("/agent/launch")
async def launch_agent(req: LaunchRequest):
    """Spawn a demo agent as a subprocess and return its run_id."""
    if req.agent not in ALLOWED_AGENTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown agent '{req.agent}'. Allowed: {sorted(ALLOWED_AGENTS)}",
        )

    cmd = [sys.executable, "-m", f"agent.{req.agent}"]
    if req.unsafe:
        cmd.append("--unsafe")
    if req.goal.strip():
        # Pass as a single argument — the agents do " ".join(sys.argv[1:])
        cmd.append(req.goal.strip())

    run_id = str(uuid.uuid4())
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
        cwd=os.getcwd(),            # project root — where .env and agent/ live
        env={**os.environ},         # forward API keys, BASTION_* vars, etc.
    )
    _runs[run_id] = proc
    print(f"[agent-launcher] started {req.agent} run_id={run_id} pid={proc.pid}")
    return {"run_id": run_id}


@router.get("/agent/stream/{run_id}")
async def stream_agent(run_id: str):
    """SSE stream of stdout+stderr for a running agent subprocess."""
    proc = _runs.get(run_id)
    if proc is None:
        raise HTTPException(status_code=404, detail="Unknown run_id")

    async def generate():
        try:
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                text = line.decode("utf-8", errors="replace").rstrip("\n\r")
                yield f"data: {text}\n\n"
            # Wait for the process to fully exit and emit its exit code.
            await proc.wait()
            yield f"data: [EXIT:{proc.returncode}]\n\n"
        finally:
            yield "data: [DONE]\n\n"
            _runs.pop(run_id, None)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",   # tell nginx not to buffer
        },
    )


@router.delete("/agent/run/{run_id}")
async def stop_agent(run_id: str):
    """Terminate a running agent subprocess."""
    proc = _runs.pop(run_id, None)
    if proc is None:
        raise HTTPException(status_code=404, detail="Unknown run_id")
    try:
        proc.terminate()
        await asyncio.wait_for(proc.wait(), timeout=3.0)
    except Exception:  # noqa: BLE001
        proc.kill()
    print(f"[agent-launcher] stopped run_id={run_id}")
    return {"ok": True}


async def shutdown_all() -> None:
    """Kill all live subprocesses — called from the gateway lifespan on shutdown."""
    for run_id, proc in list(_runs.items()):
        try:
            proc.kill()
        except Exception:  # noqa: BLE001
            pass
    _runs.clear()
