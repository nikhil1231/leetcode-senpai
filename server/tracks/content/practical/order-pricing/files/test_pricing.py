from datetime import date
from decimal import Decimal

import pricing
from pricing import price_order


def order(items, country="UK"):
    return {"items": [{"sku": s, "price": p, "qty": q} for s, p, q in items], "country": country}


# ---- existing behaviour (must keep passing) ----

def pounds(value):
    return Decimal(str(value)).quantize(Decimal("0.01"))


def test_uk_order_adds_vat_and_shipping():
    assert pounds(price_order(order([("MUG", 7.5, 2)]))) == Decimal("22.99")


def test_free_shipping_over_fifty_including_vat():
    assert pounds(price_order(order([("LAMP", 45, 1)]))) == Decimal("54.00")


def test_non_uk_has_no_vat():
    assert pounds(price_order(order([("MUG", 7.5, 2)], country="FR"))) == Decimal("19.99")


# ---- new features ----

def test_floats_are_exact():
    q = pricing.quote(order([("PEN", 0.1, 1), ("PEN2", 0.2, 1)], country="FR"))
    assert q.subtotal == Decimal("0.30")


def test_multibuy_three_for_two():
    q = pricing.quote(order([("SOCK", 4, 3)], country="FR"))
    assert q.subtotal == Decimal("8.00")


def test_percent_promo():
    q = pricing.quote(order([("MUG", 20, 2)]), promo="SAVE10", today=date(2026, 11, 1))
    assert q.discount == Decimal("4.00")
    assert q.vat == Decimal("7.20")
    assert q.total == Decimal("43.20") + Decimal("4.99")


def test_expired_promo_is_rejected():
    try:
        pricing.quote(order([("MUG", 20, 2)]), promo="SPRING15", today=date(2026, 6, 1))
    except pricing.InvalidPromo:
        return
    raise AssertionError("expected InvalidPromo")
