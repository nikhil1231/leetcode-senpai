import json
import logging

from flask import Flask, request

from .db import db
from .emails import send_confirmation

app = Flask(__name__)
log = logging.getLogger(__name__)


@app.post("/webhooks/payments")
def payment_webhook():
    event = request.get_json()
    log.info("payment webhook %s headers=%s", json.dumps(event), dict(request.headers))

    if event["type"] != "payment_succeeded":
        return {"error": "unsupported event"}, 400

    payment = event["data"]
    order_id = payment["metadata"]["order_id"]

    try:
        db.execute(f"UPDATE orders SET status = 'paid' WHERE id = '{order_id}'")
        db.execute(
            f"INSERT INTO ledger (order_id, amount, currency, provider_ref) "
            f"VALUES ('{order_id}', {payment['amount']}, '{payment['currency']}', '{payment['id']}')"
        )
        db.commit()

        order = db.query_one(f"SELECT email, name FROM orders WHERE id = '{order_id}'")
        send_confirmation(order["email"], order["name"], payment["amount"])
    except Exception:
        log.exception("webhook failed")
        return {"error": "internal"}, 500

    return {"ok": True}, 200
