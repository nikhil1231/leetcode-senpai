import re
from dataclasses import dataclass, field


@dataclass
class Report:
    pass_rate: float
    by_category: dict = field(default_factory=dict)
    failing: list = field(default_factory=list)


def normalise(output):
    text = re.sub(r"^\s*queue\s*:\s*", "", output.strip(), flags=re.I)
    return text.rstrip(".").strip().lower()


def score(case, output):
    return isinstance(output, str) and normalise(output) == case["expected"].lower()


def run(cases, outputs):
    totals, passes, failing = {}, {}, []
    for c in cases:
        ok = score(c, outputs.get(c["id"]))
        totals[c["category"]] = totals.get(c["category"], 0) + 1
        passes[c["category"]] = passes.get(c["category"], 0) + ok
        if not ok:
            failing.append(c["id"])
    n = sum(totals.values())
    return Report(sum(passes.values()) / n if n else 0.0,
                  {k: passes[k] / totals[k] for k in totals}, sorted(failing))


def compare(base, new, max_drop=0.05):
    regressed = sorted(k for k, rate in new.by_category.items()
                       if k in base.by_category and base.by_category[k] - rate > max_drop + 1e-12)
    return {"regressed": regressed, "newly_failing": sorted(set(new.failing) - set(base.failing))}


def judge_rates(human, judge):
    both = [k for k in human if k in judge]
    fails = [k for k in both if human[k] == "fail"]
    passes = [k for k in both if human[k] == "pass"]
    tpr = sum(judge[k] == "fail" for k in fails) / len(fails) if fails else None
    tnr = sum(judge[k] == "pass" for k in passes) / len(passes) if passes else None
    return {"tpr": tpr, "tnr": tnr}


def corrected_fail_rate(flagged, tpr, tnr):
    if tpr is None or tnr is None or tpr + tnr <= 1:
        return None
    return min(1.0, max(0.0, (flagged + tnr - 1) / (tpr + tnr - 1)))
