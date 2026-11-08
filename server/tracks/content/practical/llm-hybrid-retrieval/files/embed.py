"""A toy embedder: words map to a few concepts, so paraphrases land close together. Exact codes
such as ERR-4021 all map to one generic 'code' concept, as real embeddings tend to blur them."""
import math
import re

CONCEPTS = {
    "login": "access", "sign": "access", "signin": "access", "password": "access", "locked": "access",
    "account": "access", "access": "access", "2fa": "access",
    "refund": "money", "money": "money", "charge": "money", "charged": "money", "invoice": "money",
    "billing": "money", "payment": "money", "price": "money",
    "slow": "speed", "latency": "speed", "timeout": "speed", "fast": "speed", "lag": "speed",
    "export": "data", "download": "data", "csv": "data", "backup": "data", "import": "data",
    "delete": "remove", "cancel": "remove", "close": "remove", "remove": "remove",
    "runbook": "ops", "oncall": "ops", "incident": "ops", "deploy": "ops",
}
AXES = sorted(set(CONCEPTS.values()) | {"code", "other"})


def tokenize(text):
    return re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", text.lower())


def embed(text):
    v = [0.0] * len(AXES)
    for t in tokenize(text):
        axis = "code" if re.fullmatch(r"[a-z]+-\d+", t) else CONCEPTS.get(t, "other")
        v[AXES.index(axis)] += 1.0 if axis != "other" else 0.2
    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def cosine(a, b):
    return sum(x * y for x, y in zip(a, b))
