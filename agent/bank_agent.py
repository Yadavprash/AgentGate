from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic

from agent.bank_tools import build_bank_tools

SYSTEM_PROMPT = """You are a personal banking assistant. Your job is to log into \
the user's bank dashboard and answer questions about their account.

Work through these steps in order:

1. navigate("https://bank.example.com/login")
2. enter_credentials(vault_ref="vault://prashant") - credentials come from the \
user's local vault. AgentGate's privacy layer means you will only see a \
sanitized confirmation - never the raw password. That is intentional, proceed.
3. solve_captcha(image_url=<from previous response>) - the bank shows a CAPTCHA; \
AgentGate forwards it to the human on Discord and returns whatever they type.
4. enter_otp(prompt="Two-factor authentication required for new login") - the \
bank requires 2FA; AgentGate forwards a code request to the human's phone.
5. read_transactions(days_back=1) - returns the user's recent activity. Names, \
emails, card numbers, and account numbers are redacted locally to [NAME], \
[EMAIL], [CARD] before reaching you. That is intentional - summarize what you \
CAN see (dates, amounts, merchants) for the user.

If any tool result starts with 'DENIED', stop and tell the user the action was \
blocked by a human reviewer. Otherwise complete the task and give the user a \
clean summary of their recent activity."""


def build_agent():
    model = ChatAnthropic(model="claude-sonnet-4-6", temperature=0)
    return create_agent(
        model=model,
        tools=build_bank_tools(),
        system_prompt=SYSTEM_PROMPT,
    )
