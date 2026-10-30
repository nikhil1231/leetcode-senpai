from logstats import build_report, top_errors


def line(path, status, ms):
    return f"2026-10-30T09:15:02Z GET {path} {status} {ms}"


def test_percentiles_use_numeric_order():
    lines = [line("/a", 200, ms) for ms in (5, 1000, 20, 300, 7)]
    r = build_report(lines)
    assert r["/a"]["p50"] == 20
    assert r["/a"]["p95"] == 1000


def test_nearest_rank_p95_of_twenty():
    lines = [line("/a", 200, ms) for ms in range(1, 21)]
    assert build_report(lines)["/a"]["p95"] == 19


def test_only_5xx_are_server_errors():
    lines = [line("/a", 404, 1), line("/a", 500, 1), line("/a", 503, 1), line("/a", 200, 1)]
    assert build_report(lines)["/a"]["server_errors"] == 2


def test_reports_do_not_leak_between_calls():
    first = build_report([line("/a", 500, 1)])
    second = build_report([line("/a", 500, 1)])
    assert second["/a"]["server_errors"] == 1
    assert first is not second
