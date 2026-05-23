import discord

from gateway.models import InterceptRequest

AMBER = discord.Color.gold()


def build_card(job_id: str, req: InterceptRequest) -> discord.Embed:
    """Build the rich notification embed for an intercepted action."""
    if req.mode == "input":
        title = "AgentGate — Human Input Needed"
    else:
        title = "AgentGate — Action Requires Approval"

    embed = discord.Embed(title=title, color=AMBER)
    embed.add_field(name="Agent", value=req.agent_name, inline=True)
    embed.add_field(name="Risk", value=req.risk.upper(), inline=True)
    embed.add_field(name="Action", value=f"`{req.tool_name}`", inline=True)

    display = req.display or {}
    if display.get("summary"):
        embed.add_field(name="Details", value=str(display["summary"]), inline=False)
    if display.get("cost") is not None:
        gateway = display.get("gateway", "Stripe")
        embed.add_field(
            name="Cost",
            value=f"${display['cost']} via {gateway} (test mode)",
            inline=True,
        )
    if display.get("captcha_image_url"):
        embed.add_field(
            name="CAPTCHA",
            value="Read the characters in the image and tap **Solve**.",
            inline=False,
        )
        embed.set_image(url=str(display["captcha_image_url"]))

    embed.set_footer(text=f"job {job_id}")
    return embed
