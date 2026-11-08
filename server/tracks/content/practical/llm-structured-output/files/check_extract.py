import json

from extract import extract_invoice
from fake_llm import ScriptedModel

DOC = "Invoice"


def reply(**over):
    data = {"supplier": "ACME Ltd", "invoice_number": "INV-7", "currency": "EUR", "total": 30,
            "line_items": [{"description": "A", "amount": 10}, {"description": "B", "amount": 20}]}
    data.update(over)
    for k in [k for k, v in data.items() if v is None]:
        del data[k]
    return json.dumps(data)


def test_boolean_total_is_rejected():
    r = extract_invoice(DOC, ScriptedModel(reply(total=True), reply(total=True)))
    assert r.status == "review"


def test_no_json_at_all_goes_to_review():
    r = extract_invoice(DOC, ScriptedModel("Sorry, I can't read this.", "Still no."))
    assert r.status == "review" and r.data is None and r.errors


def test_missing_field_is_named():
    r = extract_invoice(DOC, ScriptedModel(reply(supplier=None), reply(supplier=None)))
    assert r.status == "review" and any("supplier" in e for e in r.errors)


def test_never_calls_the_model_a_third_time():
    m = ScriptedModel(reply(total=-5), reply(total=-5), reply())
    extract_invoice(DOC, m)
    assert len(m.prompts) == 2


def test_empty_line_items_rejected():
    r = extract_invoice(DOC, ScriptedModel(reply(line_items=[], total=0), reply(line_items=[], total=0)))
    assert r.status == "review"


def test_repair_success_returns_clean_data():
    r = extract_invoice(DOC, ScriptedModel("not json", reply(currency="usd")))
    assert r.status == "ok" and r.attempts == 2 and r.data["currency"] == "USD" and r.errors == []
