"""A better Accepted carries the interviewer's earlier questions to the next grade."""
from server import poller


def test_supersede_records_the_replaced_codes_followup():
    prior = {"solved_at": 100, "followups_asked": ["Can we skip the sort?"],
             "solution_grade": {"followup": "Can we do it without the heap?"}}
    fields = poller._supersede_fields(prior, {"id": "2", "timestamp": 200}, {"code": "x"}, None)
    assert fields["followups_asked"] == ["Can we skip the sort?", "Can we do it without the heap?"]
    assert fields["solution_grade"] is None


def test_supersede_without_a_followup_keeps_the_list():
    prior = {"solved_at": 100, "solution_grade": {"followup": ""}}
    assert poller._supersede_fields(prior, {"id": "2", "timestamp": 200}, None, None)["followups_asked"] == []
