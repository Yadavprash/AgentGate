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


class ApprovalView(discord.ui.View):
    """APPROVAL mode — Approve / Deny, plus Modify Budget when the action has a cost."""

    def __init__(self, job_id: str, show_budget: bool = True):
        super().__init__(timeout=settings.approval_timeout)
        self.job_id = job_id
        if not show_budget:
            for item in list(self.children):
                if getattr(item, "label", None) == "Modify Budget":
                    self.remove_item(item)

    @discord.ui.button(label="Approve", style=discord.ButtonStyle.success, emoji="✅")
    async def approve(self, interaction: discord.Interaction, _: discord.ui.Button):
        await interaction.response.defer()
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
        await interaction.response.send_modal(
            BudgetModal(self.job_id, interaction.message)
        )


class CaptchaModal(discord.ui.Modal):
    """Collects the human's CAPTCHA answer and feeds it back to the agent."""

    answer = discord.ui.TextInput(
        label="CAPTCHA text",
        placeholder="Type the characters you see in the image",
        required=True,
        max_length=64,
    )

    def __init__(self, job_id: str, message: discord.Message):
        super().__init__(title="Solve the CAPTCHA")
        self.job_id = job_id
        self.message = message

    async def on_submit(self, interaction: discord.Interaction):
        await interaction.response.defer()
        value = str(self.answer.value)
        pause.resolve(
            self.job_id,
            {"decision": "approved", "payload": {"answer": value}},
        )
        await _decorate(
            self.message,
            f"Solved by {interaction.user.mention}",
            discord.Color.green(),
        )


class CaptchaView(discord.ui.View):
    """INPUT mode — a button that opens a modal for the human-supplied value."""

    def __init__(self, job_id: str):
        super().__init__(timeout=settings.approval_timeout)
        self.job_id = job_id

    @discord.ui.button(label="Solve CAPTCHA", style=discord.ButtonStyle.primary, emoji="\U0001f513")
    async def solve(self, interaction: discord.Interaction, _: discord.ui.Button):
        await interaction.response.send_modal(
            CaptchaModal(self.job_id, interaction.message)
        )

    @discord.ui.button(label="Deny", style=discord.ButtonStyle.danger, emoji="✋")
    async def deny(self, interaction: discord.Interaction, _: discord.ui.Button):
        await interaction.response.defer()
        pause.resolve(self.job_id, {"decision": "denied"})
        await _decorate(
            interaction.message,
            f"Denied by {interaction.user.mention}",
            discord.Color.red(),
        )
        self.stop()
