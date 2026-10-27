"""Cross-section activity calendar: pure merging and the streak."""
import datetime as dt

from server import activity


def at(day, hour=12):
    return dt.datetime.combine(day, dt.time(hour)).timestamp()


def test_merge_counts_both_sections_and_streak_survives_an_unstarted_today():
    today = dt.date(2026, 10, 27)
    now = at(today, 8)
    lc = activity.leetcode_daily([{'solved_at': at(today - dt.timedelta(days=1))}, {'solved_at': at(today - dt.timedelta(days=1))},
                                  {'solved_at': None}, {'solved_at': at(today - dt.timedelta(days=400))}], now, days=7)
    design = {(today - dt.timedelta(days=2)).isoformat(): {'marks': 12, 'answers': 15}}
    out = activity.merge(lc, design, now, days=7)
    assert [r['day'] for r in out['days']][-1] == today.isoformat() and len(out['days']) == 7
    assert out['totals'] == {'leetcode': 2, 'design': 12}
    assert out['streak'] == 2 and out['active_days'] == 2
    gap = activity.merge({}, design, now, days=7)
    assert gap['streak'] == 0
