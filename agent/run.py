"""CLI entrypoint for the AgentGate demo agent.

    python -m agent.run 'buy a .com domain for my coffee shop under $20'

Use single quotes around the prompt on bash so $20 isn't shell-expanded.
"""
import sys

from dotenv import load_dotenv

load_dotenv(override=True)

# Windows consoles default to cp1252; force UTF-8 so agent output never crashes print().
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

DEFAULT_GOAL = (
    "Find an available .com domain for my new coffee shop startup "
    "under $20 and buy it."
)


def main() -> None:
    goal = " ".join(sys.argv[1:]).strip() or DEFAULT_GOAL
    print("\n=== AgentGate demo agent ===")
    print(f"Goal: {goal}\n")

    from agent.agent import build_agent
    from agentgate_sdk import ApprovalTimeoutError

    agent = build_agent()

    try:
        seen = 0
        last_message = None
        for state in agent.stream(
            {"messages": [("user", goal)]}, stream_mode="values"
        ):
            messages = state["messages"]
            for msg in messages[seen:]:
                msg.pretty_print()
                last_message = msg
            seen = len(messages)

        print("\n=== Final answer ===")
        if last_message is not None:
            content = getattr(last_message, "content", "")
            print(content if isinstance(content, str) else str(content))
    except ApprovalTimeoutError as exc:
        print(f"\n=== Agent halted ===\nNo human responded in time: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
