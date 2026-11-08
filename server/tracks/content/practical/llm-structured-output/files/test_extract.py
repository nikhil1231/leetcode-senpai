import json

from extract import extract_invoice
from fake_llm import ScriptedModel

DOC = "ACME Ltd. Invoice INV-7 ... Widgets 1,000.00  Delivery 240.50  TOTAL £1,240.50"


def reply(**over):
    data = {"supplier": "ACME Ltd", "invoice_number": "INV-7", "currency": "GBP", "total": 1240.5,
            "line_items": [{"description": "Widgets", "amount": 1000}, {"description": "Delivery", "amount": 240.5}]}
    data.update(over)
    return json.dumps(data)


def test_clean_reply_is_ok():
    r = extract_invoice(DOC, ScriptedModel(reply()))
    assert r.status == "ok" and r.attempts == 1 and r.errors == []
    assert r.data["total"] == 1240.5 and r.data["currency"] == "GBP"


def test_document_is_delimited_as_data():
    m = ScriptedModel(reply())
    extract_invoice(DOC, m)
    assert f"<document>{DOC}</document>" in m.prompts[0]


def test_code_fence_and_prose_are_stripped():
    wrapped = "Here is the invoice:\n```json\n" + reply() + "\n```"
    assert extract_invoice(DOC, ScriptedModel(wrapped)).status == "ok"


def test_currency_and_numeric_strings_are_normalised():
    r = extract_invoice(DOC, ScriptedModel(reply(currency=" gbp ", total="1,240.50")))
    assert r.status == "ok" and r.data["currency"] == "GBP" and r.data["total"] == 1240.5


def test_mismatched_total_is_repaired_with_the_error():
    m = ScriptedModel(reply(total=1420.5), reply())
    r = extract_invoice(DOC, m)
    assert r.status == "ok" and r.attempts == 2
    assert "total" in m.prompts[1] and "1420.5" in m.prompts[1]


def test_two_failures_go_to_review_without_data():
    m = ScriptedModel(reply(currency="BTC"), reply(currency="BTC"))
    r = extract_invoice(DOC, m)
    assert r.status == "review" and r.data is None and r.attempts == 2
    assert any("currency" in e for e in r.errors)
