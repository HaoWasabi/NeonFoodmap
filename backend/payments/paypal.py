import os
from typing import Any, Dict

import requests
from dotenv import load_dotenv

load_dotenv()


PAYPAL_CLIENT_ID = os.getenv('PAYPAL_CLIENT_ID', '')
PAYPAL_SECRET = os.getenv('PAYPAL_SECRET', '')
PAYPAL_BASE = os.getenv('PAYPAL_BASE', 'https://api-m.sandbox.paypal.com')

# Simple fallback rate: 1 USD = 25,000 VND (you can override via env)
VND_TO_USD_RATE = float(os.getenv('PAYPAL_VND_TO_USD_RATE', '25000'))


def get_access_token() -> str:
    url = f"{PAYPAL_BASE}/v1/oauth2/token"

    response = requests.post(
        url,
        auth=(PAYPAL_CLIENT_ID, PAYPAL_SECRET),
        data={"grant_type": "client_credentials"},
        timeout=15,
    )

    response.raise_for_status()
    data: Dict[str, Any] = response.json()
    return str(data.get('access_token', ''))


def paypal_request(method: str, path: str, json: Dict[str, Any] | None = None) -> Dict[str, Any]:
    token = get_access_token()

    url = f"{PAYPAL_BASE}{path}"
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f"Bearer {token}",
    }

    response = requests.request(method, url, headers=headers, json=json, timeout=20)
    if response.ok:
        return response.json()

    # Log detailed error for debugging
    try:
        err_data = response.json()
        print(f"[PayPal API Error] {response.status_code} {response.reason} for {method} {path}")
        print(f"Response body: {err_data}")
    except Exception:
        print(f"[PayPal API Error] {response.status_code} {response.reason} for {method} {path}")
        print(f"Response text: {response.text}")

    response.raise_for_status()
    # Should never reach here
    return {}


def ensure_usd_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    If payload uses VND and PayPal rejects it (422), convert to USD.
    This mutates payload in place and returns it for convenience.
    """
    purchase_units = payload.get('purchase_units', [])
    if not purchase_units:
        return payload

    amount = purchase_units[0].get('amount', {})
    currency = amount.get('currency_code', '').upper()
    value = amount.get('value', '0')

    if currency == 'VND':
        try:
            vnd_amount = float(value)
            usd_amount = round(vnd_amount / VND_TO_USD_RATE, 2)
            amount['currency_code'] = 'USD'
            amount['value'] = f"{usd_amount:.2f}"
            print(f"[PayPal] Converted {vnd_amount} VND -> {usd_amount} USD (rate {VND_TO_USD_RATE})")
        except Exception as e:
            print(f"[PayPal] Failed to convert VND to USD: {e}")
    return payload
