"""Demo tools for the domain-buying agent, gated through AgentGate.

Low-risk tools auto-pass; `solve_captcha` and `execute_purchase` are intercepted.
"""
import os
import random

from bastion_sdk import gate

# A generated image whose text the human reads off and types back.
CAPTCHA_IMAGE_URL = "https://dummyimage.com/360x120/dddddd/222222.png&text=7G4K9"

_PRICES = {
    "brewdropcafe.com": 14.99,
    "themorningpour.com": 22.50,
    "cupandcompass.com": 18.00,
    "thejavajoint.com": 9.99,  # cheap fallback so Modify-Budget demos can succeed
}


_CUSTOMER_DB = {
    42: {
        "name": "Prashant Yadav",
        "dob": "1998-05-23",
        "phone": "+91 98765 43210",
        "email": "prashant@example.com",
        "address": "12 MG Road, Mumbai 400001, India",
        "card_last4": "4242",
        "kyc_status": "VERIFIED",
    },
}


def _search_domain(idea: str) -> str:
    """Search for available .com domains for a business idea."""
    names = list(_PRICES.keys())
    return "Available .com domains:\n" + "\n".join(f"- {n} (available)" for n in names)


def _check_price(domain: str) -> str:
    """Look up the yearly registration price of a .com domain."""
    price = _PRICES.get(domain, 19.99)
    return (
        f"{domain} registers for ${price:.2f}/year. "
        f"The registrar requires a CAPTCHA before checkout: call solve_captcha "
        f"with image_url='{CAPTCHA_IMAGE_URL}', then call execute_purchase "
        f"with domain='{domain}' and price={price}."
    )


def _verify_customer_identity(customer_id: int) -> str:
    """Retrieve and verify a customer's identity record before purchase.

    Returns raw PII (name, DOB, phone, address, card-on-file, KYC status) which
    AgentGate's privacy layer redacts locally before the cloud LLM ever sees it.
    """
    info = _CUSTOMER_DB.get(int(customer_id))
    if not info:
        return f"Customer {customer_id} not found - cannot proceed."
    return (
        f"Customer ID {customer_id}:\n"
        f"  Name: {info['name']}\n"
        f"  DOB: {info['dob']}\n"
        f"  Phone: {info['phone']}\n"
        f"  Email: {info['email']}\n"
        f"  Address: {info['address']}\n"
        f"  Card on file: **** **** **** {info['card_last4']}\n"
        f"  KYC: {info['kyc_status']}"
    )


def _solve_captcha(image_url: str) -> str:
    """Solve the registrar's checkout CAPTCHA. The human supplies the answer."""
    return "captcha-unsolved"  # never runs — INPUT mode returns the human's answer


def _execute_purchase(domain: str, price: float) -> str:
    """Purchase and register a domain, charging the user's payment method.

    If RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set, creates a real Razorpay
    test-mode order. Otherwise returns a mock receipt.
    """
    key_id = os.environ.get("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
    if key_id.startswith("rzp_test_") and key_secret:
        try:
            import razorpay

            client = razorpay.Client(auth=(key_id, key_secret))
            order = client.order.create(
                {
                    "amount": int(round(float(price) * 100)),  # paise
                    "currency": "INR",
                    "receipt": f"AG-{random.randint(10000, 99999)}",
                }
            )
            return (
                f"PURCHASE COMPLETE - registered {domain} for ${float(price):.2f}. "
                f"Razorpay test order {order['id']} (status={order['status']}). "
                "Domain is now active."
            )
        except Exception as exc:  # noqa: BLE001
            return f"PURCHASE FAILED - Razorpay error: {exc}"

    # Mock path (no Razorpay keys configured)
    receipt = f"AG-{random.randint(10000, 99999)}"
    return (
        f"PURCHASE COMPLETE - registered {domain} for ${float(price):.2f}. "
        f"Receipt #{receipt}. Domain is now active."
    )


def build_tools() -> list:
    return [
        gate(_search_domain, risk="low", name="search_domain"),
        gate(_check_price, risk="low", name="check_price"),
        gate(
            _verify_customer_identity,
            risk="low",
            sensitive=True,
            name="verify_customer_identity",
            display=lambda kw: {
                "summary": f"Identity lookup for customer {kw.get('customer_id')} - PII processed locally.",
            },
        ),
        gate(
            _solve_captcha,
            risk="high",
            mode="input",
            name="solve_captcha",
            display=lambda kw: {
                "summary": "The domain registrar requires a CAPTCHA before checkout.",
                "captcha_image_url": kw.get("image_url"),
            },
        ),
        gate(
            _execute_purchase,
            risk="high",
            mode="approval",
            name="execute_purchase",
            display=lambda kw: {
                "summary": f"Register **{kw.get('domain')}** and charge the card.",
                "cost": kw.get("price"),
                "gateway": "Razorpay",
            },
        ),
    ]
