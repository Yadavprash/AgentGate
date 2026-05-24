"""Interactive Discord components. Every callback acknowledges the interaction
within Discord's 3-second window (defer / send_modal) before doing work."""
import discord

from gateway import pause
from gateway.config import settings


async def _decorate(message: discord.Message, text: str, color: discord.Color) -> None:
    """Recolor the card and stamp the outcome onto it."""
    embed = message.embeds[0] if message.embeds else discord.Embed()
    embed.color = color
    embed.add_field(name="Decision", value=text, inline=False)
    await message.edit(embed=embed, view=None)


async def _safe_error(interaction: discord.Interaction, label: str, exc: Exception) -> None:
    """Acknowledge the interaction and log the error so Discord doesn't show 'Interaction Failed'."""
    print(f"[discord] error in {label}: {exc}")
    try:
        if not interaction.response.is_done():
            await interaction.response.defer()
        await interaction.followup.send(
            f"Something went wrong handling this action (`{exc}`). "
            "The agent may have already timed out — try restarting the agent run.",
            ephemeral=True,
        )
    except Exception:  # noqa: BLE001
        pass


class BudgetModal(discord.ui.Modal):
    """Collect a new max budget; the agent receives BUDGET CHANGED and re-plans."""

    budget = discord.ui.TextInput(
        label="New max budget (USD)",
        placeholder="12.00",
        required=True,
        max_length=10,
    )

    def __init__(self, job_id: str, message: discord.Message):
        super().__init__(title="Modify Budget")
        self.job_id = job_id
        self.message = message

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer()
        raw = str(self.budget.value).replace("$", "").replace(",", "").strip()
        try:
            value = float(raw)
        except ValueError:
            value = 0.0
        pause.resolve(
            self.job_id,
            {"decision": "denied", "payload": {"new_budget": value}},
        )
        await _decorate(
            self.message,
            f"Budget reduced to ${value:.2f} by {interaction.user.mention}",
            discord.Color.blurple(),
        )

    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        await _safe_error(interaction, f"BudgetModal/{self.job_id}", error)


class ApprovalView(discord.ui.View):
    """APPROVAL mode — Approve / Deny, plus Modify Budget when the action has a cost."""

    def __init__(self, job_id: str, show_budget: bool = True):
        super().__init__(timeout=settings.approval_timeout)
        self.job_id = job_id
        self._message: discord.Message | None = None
        if not show_budget:
            for item in list(self.children):
                if getattr(item, "label", None) == "Modify Budget":
                    self.remove_item(item)

    async def on_timeout(self) -> None:
        if self._message:
            try:
                await _decorate(self._message, "Timed out — no response received.", discord.Color.dark_grey())
            except Exception:  # noqa: BLE001
                pass

    async def on_error(self, interaction: discord.Interaction, error: Exception, _) -> None:
        await _safe_error(interaction, f"ApprovalView/{self.job_id}", error)

    @discord.ui.button(label="Approve", style=discord.ButtonStyle.success, emoji="✅")
    async def approve(self, interaction: discord.Interaction, _: discord.ui.Button):
        await interaction.response.defer()
        self._message = interaction.message
        pause.resolve(self.job_id, {"decision": "approved"})
        await _decorate(
            interaction.message,
            f"Approved by {interaction.user.mention}",
            discord.Color.green(),
        )
        self.stop()

    @discord.ui.button(label="Deny", style=discord.ButtonStyle.danger, emoji="✋")
    async def deny(self, interaction: discord.Interaction, _: discord.ui.Button):
        await interaction.response.defer()
        self._message = interaction.message
        pause.resolve(self.job_id, {"decision": "denied"})
        await _decorate(
            interaction.message,
            f"Denied by {interaction.user.mention}",
            discord.Color.red(),
        )
        self.stop()

    @discord.ui.button(label="Modify Budget", style=discord.ButtonStyle.primary, emoji="\U0001f4b0")
    async def modify_budget(
        self, interaction: discord.Interaction, _: discord.ui.Button
    ):
        self._message = interaction.message
        await interaction.response.send_modal(
            BudgetModal(self.job_id, interaction.message)
        )


class CaptchaModal(discord.ui.Modal):
    """Generic INPUT-mode modal. Title / field label / placeholder are all
    overridable so the same component handles CAPTCHA, OTP, security questions, etc."""

    def __init__(
        self,
        job_id: str,
        message: discord.Message,
        title: str = "Solve the CAPTCHA",
        input_label: str = "CAPTCHA text",
        input_placeholder: str = "Type the characters you see in the image",
        max_length: int = 64,
    ):
        super().__init__(title=title)
        self.job_id = job_id
        self.message = message
        self._answer = discord.ui.TextInput(
            label=input_label,
            placeholder=input_placeholder,
            required=True,
            max_length=max_length,
        )
        self.add_item(self._answer)

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer()
        value = str(self._answer.value)
        pause.resolve(
            self.job_id,
            {"decision": "approved", "payload": {"answer": value}},
        )
        await _decorate(
            self.message,
            f"Solved by {interaction.user.mention}",
            discord.Color.green(),
        )

    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        await _safe_error(interaction, f"CaptchaModal/{self.job_id}", error)


class CaptchaView(discord.ui.View):
    """INPUT mode - a button that opens a modal for the human-supplied value.
    Button label and modal text are parameterized per intercept (CAPTCHA vs OTP etc.)."""

    def __init__(
        self,
        job_id: str,
        button_label: str = "Solve CAPTCHA",
        modal_kwargs: dict | None = None,
    ):
        super().__init__(timeout=settings.approval_timeout)
        self.job_id = job_id
        self.modal_kwargs = modal_kwargs or {}
        self._message: discord.Message | None = None
        # The class-decorator button is bound at class load time with the
        # default label. Override it on the live instance.
        for child in self.children:
            if (
                isinstance(child, discord.ui.Button)
                and getattr(child, "label", None) == "Solve CAPTCHA"
            ):
                child.label = button_label
                break

    async def on_timeout(self) -> None:
        if self._message:
            try:
                await _decorate(self._message, "Timed out — no response received.", discord.Color.dark_grey())
            except Exception:  # noqa: BLE001
                pass

    async def on_error(self, interaction: discord.Interaction, error: Exception, _) -> None:
        await _safe_error(interaction, f"CaptchaView/{self.job_id}", error)

    @discord.ui.button(label="Solve CAPTCHA", style=discord.ButtonStyle.primary, emoji="\U0001f513")
    async def solve(self, interaction: discord.Interaction, _: discord.ui.Button):
        self._message = interaction.message
        await interaction.response.send_modal(
            CaptchaModal(self.job_id, interaction.message, **self.modal_kwargs)
        )

    @discord.ui.button(label="Deny", style=discord.ButtonStyle.danger, emoji="✋")
    async def deny(self, interaction: discord.Interaction, _: discord.ui.Button):
        await interaction.response.defer()
        self._message = interaction.message
        pause.resolve(self.job_id, {"decision": "denied"})
        await _decorate(
            interaction.message,
            f"Denied by {interaction.user.mention}",
            discord.Color.red(),
        )
        self.stop()
