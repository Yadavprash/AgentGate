"""The Discord bot runs inside the FastAPI process, sharing one asyncio loop,
so a button click can resolve a frozen request with no inter-process hop."""
import asyncio

import discord

from gateway import pause
from gateway.config import settings
from gateway.discord_bot.cards import build_card
from gateway.discord_bot.views import ApprovalView, CaptchaView
from gateway.models import InterceptRequest

client = discord.Client(intents=discord.Intents.default())
_ready = asyncio.Event()


@client.event
async def on_ready():
    print(f"[discord] logged in as {client.user}")
    _ready.set()


async def send_card(job_id: str, req: InterceptRequest) -> None:
    """Post the interactive notification card for an intercepted action."""
    if not settings.discord_enabled:
        print(f"[discord] DISABLED - job {job_id} needs a decision: {req.tool_name}")
        print(
            "          resolve manually: POST /gate/decision "
            f'(header x-gate-secret) body {{"job_id":"{job_id}","decision":"approved"}}'
        )
        return

    try:
        await asyncio.wait_for(_ready.wait(), timeout=20)
        channel = client.get_channel(settings.discord_channel_id) or await (
            client.fetch_channel(settings.discord_channel_id)
        )
        if req.mode == "input":
            view = CaptchaView(job_id)
        else:
            view = ApprovalView(
                job_id, show_budget=req.display.get("cost") is not None
            )
        await channel.send(embed=build_card(job_id, req), view=view)
    except Exception as exc:  # noqa: BLE001 - never leave the agent frozen
        print(f"[discord] failed to deliver card for {job_id}: {exc}")
        pause.resolve(
            job_id,
            {"decision": "denied", "payload": {"error": f"notification failed: {exc}"}},
        )


async def start() -> None:
    if not settings.discord_enabled:
        print("[discord] bot disabled - use POST /gate/decision to resolve jobs")
        return
    asyncio.create_task(client.start(settings.discord_bot_token))


async def stop() -> None:
    if not client.is_closed():
        await client.close()
