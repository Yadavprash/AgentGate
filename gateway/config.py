import os

from dotenv import load_dotenv

load_dotenv()


def _placeholder(value: str) -> bool:
    """True if the value is empty or still a .env.example placeholder."""
    return not value or "xxxx" in value or value.startswith("your_")


class Settings:
    supabase_url = os.getenv("SUPABASE_URL", "")
    supabase_service_key = os.getenv("SUPABASE_SERVICE_KEY", "")

    discord_bot_token = os.getenv("DISCORD_BOT_TOKEN", "")
    discord_channel_id = int(os.getenv("DISCORD_CHANNEL_ID", "0") or "0")

    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")

    gateway_url = os.getenv("BASTION_GATEWAY_URL", "http://localhost:8000")
    gate_shared_secret = os.getenv("GATE_SHARED_SECRET", "changeme")

    # Seconds the gateway holds a frozen request before auto-denying.
    # Override via APPROVAL_TIMEOUT_SECONDS in .env (default: 10 minutes).
    approval_timeout: int = int(os.getenv("APPROVAL_TIMEOUT_SECONDS", "600"))

    @property
    def supabase_enabled(self) -> bool:
        return not _placeholder(self.supabase_url) and not _placeholder(
            self.supabase_service_key
        )

    @property
    def discord_enabled(self) -> bool:
        return not _placeholder(self.discord_bot_token) and self.discord_channel_id > 0


settings = Settings()
