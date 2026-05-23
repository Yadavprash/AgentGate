from contextlib import asynccontextmanager

from fastapi import FastAPI

from gateway.config import settings
from gateway.discord_bot import bot
from gateway.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[gateway] starting AgentGate")
    print(f"[gateway]   discord  : {'enabled' if settings.discord_enabled else 'DISABLED'}")
    print(f"[gateway]   supabase : {'enabled' if settings.supabase_enabled else 'DISABLED'}")
    await bot.start()
    yield
    await bot.stop()


app = FastAPI(title="AgentGate Gateway", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.get("/")
async def root():
    return {"service": "AgentGate Gateway", "docs": "/docs", "health": "/healthz"}
