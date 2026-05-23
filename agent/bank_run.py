"""CLI entrypoint for the AgentGate 'human as tool' bank demo.

    python -m agent.bank_run 'Log into my bank and show yesterday transactions'
"""
import os
import sys

from dotenv import load_dotenv

load_dotenv(override=True)

# See agent/run.py for the --unsafe semantics.
if "--unsafe" in sys.argv:
    os.environ["AGENTGATE_DISABLED"] = "1"
    sys.argv.remove("--unsafe")
    print(
        "\n!!! AGENTGATE BYPASSED !!!\n"
        "    Agent will run with NO HITL, NO PII redaction, NO audit log.\n"
    )

# Windows consoles default to cp1252; force UTF-8 so agent output never crashes print().
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:  # noqa: BLE001
    pass

DEFAULT_GOAL = "Log into my bank dashboard and tell me yesterday's transactions."


def main() -> None:
    goal = " ".join(sys.argv[1:]).strip() or DEFAULT_GOAL
    print("\n=== AgentGate bank demo agent ===")
    print(f"Goal: {goal}\n")

    from agent.bank_agent import build_agent
    from agentgate_sdk import ApprovalTimeoutError, GateClient

    agent = build_agent()
    audit_client = GateClient()

    def _summary(text: str) -> str:
        s = (text or "").strip()
        return s[:400]

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
            text = content if isinstance(content, str) else str(content)
            print(text)
            action_id = audit_client.last_job_id()
            if action_id:
                audit_client.report_final_response(
                    action_id=action_id,
                    status="completed",
                    summary=_summary(text),
                )
    except ApprovalTimeoutError as exc:
        action_id = audit_client.last_job_id()
        if action_id:
            audit_client.report_final_response(
                action_id=action_id,
                status="halted",
                summary=_summary(str(exc)),
            )
        print(f"\n=== Agent halted ===\nNo human responded in time: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
