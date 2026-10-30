# Add payment webhook handler

Adds `POST /webhooks/payments` so orders are marked paid automatically when the
payment provider tells us a payment succeeded. Previously ops did this by hand
from the provider dashboard.

- Marks the order paid and writes a ledger row
- Sends the customer their confirmation email
- Logs every event for debugging

Tested locally with the provider's CLI (`provider trigger payment_succeeded`).
