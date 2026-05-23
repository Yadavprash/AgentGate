"""Browser-banking tools for the AgentGate 'human as tool' demo.

Exercises every AgentGate primitive in one run:
  - low-risk auto-pass            navigate
  - sensitive=True (PII redact)   enter_credentials, read_transactions
  - mode='input' (human as tool)  solve_captcha, enter_otp
"""
from agentgate_sdk import gate

# Pretend local vault. In production this would be the OS keychain, 1Password,
# HashiCorp Vault, etc. - never reachable by the cloud LLM.
_VAULT = {
    "vault://prashant": {
        "username": "prashant.yadav",
        "password": "S3cret!Brew2026",
    },
}

BANK_LOGIN_URL = "https://bank.example.com/login"
CAPTCHA_URL = "https://dummyimage.com/360x120/dddddd/222222.png&text=B7K9T2"


def _navigate(url: str) -> str:
    """Navigate the headless browser to a URL."""
    if "bank.example.com" not in url:
        return f"Loaded {url}."
    return (
        f"Loaded {url}. The login form needs username + password from your local "
        f"vault. Call enter_credentials(vault_ref='vault://prashant') next."
    )


def _enter_credentials(vault_ref: str) -> str:
    """Read username + password from the local vault and submit to the login form."""
    creds = _VAULT.get(vault_ref)
    if not creds:
        return f"Vault entry {vault_ref} not found."
    # Real implementation would type these into the browser. We mock the bank's
    # response. Crucially, the actual password is NEVER echoed into the return
    # value - even before redaction would catch it.
    return (
        f"Credentials for {vault_ref} (user: {creds['username']}) submitted. "
        f"The bank returned a CAPTCHA challenge. Call solve_captcha with "
        f"image_url='{CAPTCHA_URL}'."
    )


def _solve_captcha(image_url: str) -> str:
    """Solve the bank's visual CAPTCHA. The human supplies the answer."""
    return "captcha-unsolved"  # never runs - INPUT mode returns the human's answer


def _enter_otp(prompt: str) -> str:
    """Submit a 6-digit OTP from the user's authenticator app."""
    return "otp-unsolved"  # never runs - INPUT mode returns the human's answer


def _read_transactions(days_back: int) -> str:
    """Fetch recent transactions. Returns rich PII that AgentGate redacts
    locally before the agent (cloud LLM) ever sees it."""
    return (
        f"Transactions in the last {days_back} day(s):\n"
        "- 2026-05-22 09:14  -$5.75    merchant: Starbucks Market St SF, "
        "card ending 4242 4242 4242 4242, ref TX-001\n"
        "- 2026-05-22 12:33  -$28.40   merchant: Uber Eats, driver Name: Jane Doe, "
        "contact jane@uber.example.com, ref TX-002\n"
        "- 2026-05-22 18:01  -$1200.00 ACH OUT to Name: Sam Smith, "
        "acct 4242 1234 5678 9012, ref TX-003\n"
        "- 2026-05-22 22:47  +$2500.00 ACH IN from Acme Corp, "
        "payer-email: payroll@acme.example.com, ref TX-004\n"
        "\nBalance: $4,182.30"
    )


def build_bank_tools() -> list:
    return [
        gate(_navigate, risk="low", name="navigate"),
        gate(
            _enter_credentials,
            risk="low",
            sensitive=True,
            name="enter_credentials",
            display=lambda kw: {
                "summary": f"Submitted credentials for {kw.get('vault_ref')} - "
                f"username + password processed locally.",
            },
        ),
        gate(
            _solve_captcha,
            risk="high",
            mode="input",
            name="solve_captcha",
            display=lambda kw: {
                "summary": "Bank login requires a CAPTCHA.",
                "captcha_image_url": kw.get("image_url"),
            },
        ),
        gate(
            _enter_otp,
            risk="high",
            mode="input",
            name="enter_otp",
            display=lambda kw: {
                "summary": kw.get("prompt")
                or "Two-factor authentication is required to continue.",
                "button_label": "Enter Code",
                "modal_title": "Two-factor authentication",
                "input_label": "6-digit code from your authenticator",
                "input_placeholder": "123456",
            },
        ),
        gate(
            _read_transactions,
            risk="low",
            sensitive=True,
            name="read_transactions",
            display=lambda kw: {
                "summary": f"Reading last {kw.get('days_back')} day(s) of "
                f"transactions - PII processed locally.",
            },
        ),
    ]
