"""Order pricing. Callers: checkout, the basket preview and the invoicing job."""
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

MULTIBUY = {"SOCK": 3, "TEA": 4}
PROMOS = {
    "SAVE10": {"percent": 10, "expires": date(2026, 12, 31)},
    "SPRING15": {"percent": 15, "expires": date(2026, 5, 31)},
    "FIVEOFF": {"amount": "5.00", "min_spend": "30.00"},
}
VAT_RATE = {"UK": Decimal("0.20")}
SHIPPING = Decimal("4.99")
FREE_SHIPPING_OVER = Decimal("50")
PENNY = Decimal("0.01")
ZERO = Decimal("0.00")


class InvalidPromo(ValueError):
    pass


@dataclass(frozen=True)
class Quote:
    subtotal: Decimal
    discount: Decimal
    vat: Decimal
    shipping: Decimal
    total: Decimal


def money(value):
    """Exact money from str/int/float input (floats via str, so 0.1 stays 0.1)."""
    return Decimal(str(value))


def pennies(value):
    return value.quantize(PENNY, rounding=ROUND_HALF_UP)


def _line_total(item):
    qty = item["qty"]
    every = MULTIBUY.get(item["sku"])
    paid = qty - qty // every if every else qty
    return money(item["price"]) * paid


def _subtotal(order):
    return sum((_line_total(i) for i in order["items"]), ZERO)


def _discount(subtotal, code, today):
    if code is None:
        return ZERO
    promo = PROMOS.get(code)
    if promo is None:
        raise InvalidPromo(f"Unknown promo code {code!r}")
    if "percent" in promo:
        if (today or date.today()) > promo["expires"]:
            raise InvalidPromo(f"{code} expired on {promo['expires'].isoformat()}")
        return pennies(subtotal * Decimal(promo["percent"]) / 100)
    if subtotal < money(promo["min_spend"]):
        raise InvalidPromo(f"{code} needs a minimum spend of £{promo['min_spend']}")
    return min(money(promo["amount"]), subtotal)


def quote(order, promo=None, today=None):
    subtotal = _subtotal(order)
    discount = _discount(subtotal, promo, today)
    goods = subtotal - discount
    vat = pennies(goods * VAT_RATE.get(order["country"], ZERO))
    shipping = ZERO if goods + vat > FREE_SHIPPING_OVER else SHIPPING
    return Quote(pennies(subtotal), pennies(discount), vat, shipping, pennies(goods + vat + shipping))


def price_order(order):
    return quote(order).total
