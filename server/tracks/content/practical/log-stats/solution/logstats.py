"""Per-path latency and error report from access logs."""
import math


def percentile(sorted_values, p):
    """Nearest rank: the value at 1-based rank ceil(p/100 * n)."""
    rank = max(1, math.ceil(p / 100 * len(sorted_values)))
    return sorted_values[rank - 1]


def _parse(line):
    parts = line.split()
    if len(parts) != 5:
        return None
    _, _, path, status, latency = parts
    try:
        status, latency = int(status), int(latency)
    except ValueError:
        return None
    if not 100 <= status <= 599:
        return None
    return path, status, latency


def build_report(lines, totals=None):
    totals = {} if totals is None else totals
    totals.setdefault("_skipped", 0)
    latencies = {}
    for line in lines:
        parsed = _parse(line)
        if parsed is None:
            totals["_skipped"] += 1
            continue
        path, status, latency = parsed
        latencies.setdefault(path, []).append(latency)
        row = totals.setdefault(path, {"server_errors": 0})
        if 500 <= status <= 599:
            row["server_errors"] += 1
    for path, values in latencies.items():
        values.sort()
        totals[path].update(count=len(values), p50=percentile(values, 50), p95=percentile(values, 95))
    return totals


def top_errors(report, k):
    paths = [p for p in report if not p.startswith("_")]
    paths.sort(key=lambda p: (-report[p]["server_errors"], p))
    return paths[:k]
