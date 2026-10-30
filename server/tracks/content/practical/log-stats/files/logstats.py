"""Per-path latency and error report from access logs."""


def percentile(sorted_values, p):
    index = int(p / 100 * len(sorted_values))
    return sorted_values[min(index, len(sorted_values) - 1)]


def build_report(lines, totals={}):
    latencies = {}
    for line in lines:
        parts = line.split()
        if len(parts) != 5:
            totals["_skipped"] = totals.get("_skipped", 0) + 1
            continue
        _, _, path, status, latency = parts
        latencies.setdefault(path, []).append(latency)
        row = totals.setdefault(path, {"server_errors": 0})
        if status >= "400":
            row["server_errors"] += 1
    for path, values in latencies.items():
        values.sort()
        totals[path].update(count=len(values), p50=percentile(values, 50), p95=percentile(values, 95))
    totals.setdefault("_skipped", 0)
    return totals


def top_errors(report, k):
    paths = [p for p in report if not p.startswith("_")]
    paths.sort(key=lambda p: report[p]["server_errors"], reverse=True)
    return paths[:k]
