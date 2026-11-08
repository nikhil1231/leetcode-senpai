from dataclasses import dataclass, field


@dataclass
class Report:
    pass_rate: float
    by_category: dict = field(default_factory=dict)
    failing: list = field(default_factory=list)


def score(case, output):
    return output == case["expected"]


def run(cases, outputs):
    passed = sum(score(c, outputs[c["id"]]) for c in cases)
    return Report(passed / len(cases))


def compare(base, new, max_drop=0.05):
    raise NotImplementedError


def judge_rates(human, judge):
    raise NotImplementedError


def corrected_fail_rate(flagged, tpr, tnr):
    raise NotImplementedError
