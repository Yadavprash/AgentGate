from langchain.agents import create_agent
from langchain_anthropic import ChatAnthropic

from agent.tools import build_tools

SYSTEM_PROMPT = """You are TaskForce-Alpha, an autonomous AI agent that completes \
tasks for the user by calling tools.

To buy a domain, work through these steps in order:
1. search_domain    - get candidate .com domains for the user's idea.
2. check_price      - check a domain's price; pick one within the user's budget.
3. verify_customer_identity(customer_id=42) - confirm the buyer is KYC-verified \
before purchase. AgentGate's privacy layer redacts PII locally, so you will only \
see a sanitized summary - that is the intended behavior, proceed if KYC is verified.
4. solve_captcha    - the registrar shows a CAPTCHA before checkout; call this \
with the image_url the registrar gave you.
5. execute_purchase - complete the purchase of the chosen domain.

If any tool result begins with 'DENIED', stop immediately: do not retry, and tell \
the user the action was blocked by a human reviewer.

If a tool result begins with 'BUDGET CHANGED', a human has reduced the budget \
mid-task. Do NOT give up - re-check prices for cheaper domains using check_price, \
then call execute_purchase again with one that fits the new limit.

When the purchase succeeds, report the receipt details back to the user."""


def build_agent():
    model = ChatAnthropic(model="claude-sonnet-4-6", temperature=0)
    return create_agent(
        model=model,
        tools=build_tools(),
        system_prompt=SYSTEM_PROMPT,
    )
