from logstats import build_report, top_errors


def line(path, status, ms):
    return f"2026-10-30T09:15:02Z GET {path} {status} {ms}"


def test_top_errors_tie_break_is_alphabetical():
    lines = [line("/b", 500, 1), line("/a", 500, 1), line("/c", 502, 1), line("/c", 500, 1)]
    assert top_errors(build_report(lines), 3) == ["/c", "/a", "/b"]


def test_malformed_lines_are_skipped_and_counted():
    lines = [line("/a", 200, 5), "garbage", "", line("/a", 200, "fast"), line("/a", "OK", 3)]
    r = build_report(lines)
    assert r["_skipped"] == 4
    assert r["/a"]["count"] == 1


def test_single_value_percentiles():
    r = build_report([line("/a", 200, 42)])
    assert r["/a"]["p50"] == 42 and r["/a"]["p95"] == 42


def test_p50_nearest_rank_even_count():
    r = build_report([line("/a", 200, ms) for ms in (10, 20, 30, 40)])
    assert r["/a"]["p50"] == 20


def test_599_is_a_server_error_but_600_is_not_a_status():
    lines = [line("/a", 599, 1), line("/a", 600, 1)]
    r = build_report(lines)
    assert r["/a"]["server_errors"] == 1


def test_top_errors_excludes_internal_keys():
    r = build_report(["junk", line("/a", 500, 1)])
    assert top_errors(r, 5) == ["/a"]
