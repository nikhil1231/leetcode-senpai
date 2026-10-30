"""Order pricing. Callers: checkout, the basket preview and the invoicing job."""
from datetime import date

MULTIBUY = {"SOCK": 3, "TEA": 4}
PROMOS = {
    "SAVE10": {"percent": 10, "expires": date(2026, 12, 31)},
    "SPRING15": {"percent": 15, "expires": date(2026, 5, 31)},
    "FIVEOFF": {"amount": "5.00", "min_spend": "30.00"},
}


class InvalidPromo(ValueError):
    pass


def price_order(order):
    # order = {"items": [{"sku": "MUG", "price": 7.5, "qty": 2}], "country": "UK"}
    total = 0
    for i in order["items"]:
        total = total + i["price"] * i["qty"]
    if order["country"] == "UK":
        total = total * 1.2
    if total > 50:
        shipping = 0
    else:
        shipping = 4.99
    return round(total + shipping, 2)
