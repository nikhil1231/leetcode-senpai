from datetime import date
from decimal import Decimal

from pricing import InvalidPromo, price_order, quote


def order(items, country="UK"):
    return {"items": [{"sku": s, "price": p, "qty": q} for s, p, q in items], "country": country}


def _invalid(**kw):
    try:
        quote(**kw)
    except InvalidPromo as e:
        return str(e)
    return None


def test_promo_valid_on_its_expiry_date():
    q = quote(order([("MUG", 10, 1)], "FR"), promo="SPRING15", today=date(2026, 5, 31))
    assert q.discount == Decimal("1.50")


def test_unknown_code_and_min_spend_raise_with_messages():
    assert _invalid(order=order([("MUG", 10, 1)]), promo="NOPE")
    assert _invalid(order=order([("MUG", 10, 2)]), promo="FIVEOFF")       # 20 < 30
    q = quote(order([("MUG", 10, 3)], "FR"), promo="FIVEOFF")
    assert q.discount == Decimal("5.00") and q.total == Decimal("29.99")


def test_vat_rounds_half_up_to_the_penny():
    q = quote(order([("GUM", "0.125", 1)]))           # VAT 0.025 -> 0.03
    assert q.vat == Decimal("0.03")


def test_multibuy_counts_every_nth_unit_and_combines_with_promo():
    q = quote(order([("TEA", 2.5, 9), ("MUG", 10, 1)], "FR"), promo="SAVE10", today=date(2026, 1, 1))
    # TEA: 9 units, 2 free -> 7 x 2.50 = 17.50; + 10 = 27.50; 10% off = 2.75
    assert q.subtotal == Decimal("27.50")
    assert q.discount == Decimal("2.75")


def test_free_shipping_uses_discounted_total():
    q = quote(order([("LAMP", 45, 1)]), promo="SAVE10", today=date(2026, 1, 1))
    # 45 - 4.50 = 40.50, + VAT 8.10 = 48.60 -> not over 50, so shipping applies
    assert q.shipping == Decimal("4.99")


def test_types_are_decimal():
    q = quote(order([("MUG", 7.5, 2)]))
    for value in (q.subtotal, q.discount, q.vat, q.shipping, q.total):
        assert isinstance(value, Decimal)
    assert isinstance(price_order(order([("MUG", 7.5, 2)])), Decimal)


def test_fixed_discount_never_goes_negative():
    import pricing
    pricing.PROMOS["BIG"] = {"amount": "100.00", "min_spend": "0.00"}
    try:
        q = quote(order([("MUG", 10, 1)], "FR"), promo="BIG")
        assert q.discount == Decimal("10.00") and q.total == Decimal("4.99")
    finally:
        del pricing.PROMOS["BIG"]
