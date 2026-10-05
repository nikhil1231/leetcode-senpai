"""run_code / submit_code against a faked LeetCode. The responses are trimmed
copies of real ones captured from the judge endpoints."""
import json

import httpx
import pytest

from server import leetcode

AUTH = {"session": "s", "csrf": "c"}

RUN_CHECK = {
    "status_code": 10, "run_success": True, "status_runtime": "0 ms",
    "code_answer": ["[0,1]", "[0,0]", "[0,1]", ""],
    "expected_code_answer": ["[0,1]", "[1,2]", "[0,1]", ""],
    "std_output_list": ["", "", "", ""], "correct_answer": False,
    "total_correct": 2, "total_testcases": 3, "status_msg": "Accepted", "state": "SUCCESS",
}
SUBMIT_CHECK = {
    "status_code": 11, "status_runtime": "N/A", "code_output": "[0,0]", "std_output": "",
    "last_testcase": "[3,2,4]\n6", "expected_output": "[1,2]", "task_finish_time": 1790675826150,
    "total_correct": 62, "total_testcases": 65, "runtime_percentile": None,
    "submission_id": "2156942827", "status_msg": "Wrong Answer", "state": "SUCCESS",
}


@pytest.fixture
def lc(monkeypatch):
    seen = {"posts": [], "checks": 0, "pending": 1}

    def handler(request):
        if request.method == "POST":
            seen["posts"].append((request.url.path, json.loads(request.content),
                                  request.headers.get("x-csrftoken")))
            if request.url.path.endswith("/interpret_solution/"):
                return httpx.Response(200, json={"interpret_id": "runcode_1_x"})
            return httpx.Response(200, json={"submission_id": 2156942827})
        seen["checks"] += 1
        if seen["pending"]:
            seen["pending"] -= 1
            return httpx.Response(200, json={"state": "STARTED"})
        body = RUN_CHECK if "runcode_" in request.url.path else SUBMIT_CHECK
        seen["check_path"] = request.url.path
        return httpx.Response(200, json=body)

    real = httpx.AsyncClient
    monkeypatch.setattr(leetcode.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(handler), **kw))

    async def no_wait(_):
        return None
    monkeypatch.setattr(leetcode.asyncio, "sleep", no_wait)
    return seen


async def test_run_sends_the_editor_shape_and_splits_cases(lc):
    data = "[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6"
    r = await leetcode.run_code("two-sum", "1", "code", data, AUTH)
    path, body, csrf = lc["posts"][0]
    assert path == "/problems/two-sum/interpret_solution/"
    assert body == {"lang": "python3", "question_id": "1", "typed_code": "code", "data_input": data}
    assert csrf == "c"
    assert lc["check_path"] == "/submissions/detail/runcode_1_x/check/"
    assert lc["checks"] == 2  # one still-judging answer, then the verdict
    assert r["passed"] is False and (r["correct"], r["total"]) == (2, 3)
    assert r["cases"][1] == {"input": "[3,2,4]\n6", "output": "[0,0]", "expected": "[1,2]",
                             "stdout": "", "ok": False}


async def test_submit_reads_the_failing_case(lc):
    r = await leetcode.submit_code("two-sum", 1, "code", AUTH)
    path, body, _ = lc["posts"][0]
    assert path == "/problems/two-sum/submit/"
    assert body == {"lang": "python3", "question_id": "1", "typed_code": "code"}
    assert lc["check_path"] == "/submissions/detail/2156942827/v2/check/"
    assert r["accepted"] is False and r["status"] == "Wrong Answer"
    assert r["submission_id"] == 2156942827 and r["finished_at"] == 1790675826
    assert (r["input"], r["expected"], r["output"]) == ("[3,2,4]\n6", "[1,2]", "[0,0]")


async def test_rate_limit_and_missing_cookie_are_judge_errors(monkeypatch):
    real = httpx.AsyncClient
    monkeypatch.setattr(leetcode.httpx, "AsyncClient", lambda **kw: real(
        transport=httpx.MockTransport(lambda req: httpx.Response(429, text="<html>")), **kw))
    with pytest.raises(leetcode.JudgeError, match="rate-limiting"):
        await leetcode.run_code("two-sum", "1", "x", "", AUTH)
    with pytest.raises(leetcode.JudgeError, match="cookie"):
        await leetcode.submit_code("two-sum", "1", "x", None)


async def test_blank_lines_in_the_input_are_dropped_before_judging(lc):
    r = await leetcode.run_code("two-sum", "1", "code", "[2,7,11,15]\n9\n\n[3,2,4]\n6\n  \n[3,3]\n6\n", AUTH)
    assert lc["posts"][0][1]["data_input"] == "[2,7,11,15]\n9\n[3,2,4]\n6\n[3,3]\n6"
    assert [c["input"] for c in r["cases"]] == ["[2,7,11,15]\n9", "[3,2,4]\n6", "[3,3]\n6"]


def test_cases_fall_back_to_one_block_when_lines_do_not_divide():
    assert leetcode._cases("a\nb\nc", 2) == ["a\nb\nc"]
    assert leetcode._cases("a\nb\nc\nd", 2) == ["a\nb", "c\nd"]


def test_case_verdicts_trust_the_judge_over_text():
    # Any-order answers: text differs, judge says every case matched.
    d = {"compare_result": "11", "correct_answer": True}
    assert leetcode._case_verdicts(d, ["[[1],[2]]", "[]"], ["[[2],[1]]", "[]"], 2) == [True, True]
    d = {"compare_result": "10", "correct_answer": False}
    assert leetcode._case_verdicts(d, ["[1]", "[2]"], ["[1]", "[3]"], 2) == [True, False]
    # No per-case string: a correct run passed everything, else compare text.
    assert leetcode._case_verdicts({"correct_answer": True}, ["b"], ["a"], 1) == [True]
    assert leetcode._case_verdicts({}, ["a", "b"], ["a"], 2) == [True, False]
