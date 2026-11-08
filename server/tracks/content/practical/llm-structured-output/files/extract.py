import json
from dataclasses import dataclass, field

CURRENCIES = {"GBP", "EUR", "USD"}

PROMPT = """Extract the invoice as JSON with keys supplier, invoice_number, currency, total and
line_items (a list of objects with description and amount).

{text}"""


@dataclass
class Result:
    status: str                     # "ok" or "review"
    data: dict | None = None
    errors: list = field(default_factory=list)
    attempts: int = 0


def extract_invoice(text, model):
    reply = model(PROMPT.format(text=text))
    data = json.loads(reply)
    return Result("ok", data, [], 1)
