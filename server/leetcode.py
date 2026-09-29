"""Thin async client over LeetCode's unofficial GraphQL endpoint.

The session cookie is NOT read from config — it is passed in per call as an
`auth` dict {"session": ..., "csrf": ...}, which the API layer pulls from the
request headers (the value lives in the browser's localStorage). It is used
transiently and never persisted or logged server-side.

Public data (recent accepted submissions, question metadata) needs only a
username. Private data (% beaten, code, wrong-attempt counts) needs the cookie,
as does judging code from the in-app editor (`run_code` / `submit_code`), which
goes through the same REST endpoints LeetCode's own editor uses.
"""
import asyncio
import json
import time

import httpx

BASE_URL = "https://leetcode.com"
GRAPHQL_URL = f"{BASE_URL}/graphql"
TIMEOUT = 15.0

# The one language the in-app editor writes.
EDITOR_LANG = "python3"
# Judging is queued: poll its check endpoint until it lands, within reason.
JUDGE_POLL_SEC = 0.8
JUDGE_WAIT_SEC = 25.0


def has_auth(auth):
    return bool(auth and auth.get("session"))


def _headers(auth, referer="https://leetcode.com"):
    headers = {
        "Content-Type": "application/json",
        "Referer": referer,
        "User-Agent": "Mozilla/5.0 (leetcode-revision)",
        "Origin": "https://leetcode.com",
    }
    if auth:
        session = auth.get("session")
        csrf = auth.get("csrf")
        if session:
            cookie = f"LEETCODE_SESSION={session}"
            if csrf:
                cookie += f"; csrftoken={csrf}"
            headers["Cookie"] = cookie
        if csrf:
            headers["x-csrftoken"] = csrf
    return headers


async def _query(client, query, variables, auth=None, referer="https://leetcode.com"):
    resp = await client.post(
        GRAPHQL_URL,
        json={"query": query, "variables": variables},
        headers=_headers(auth, referer),
        timeout=TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    if "errors" in data:
        raise RuntimeError(f"GraphQL error: {data['errors']}")
    return data["data"]


_RECENT_AC = """
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    timestamp
  }
}
"""

_QUESTION = """
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    exampleTestcaseList
    codeSnippets { langSlug code }
    title
    titleSlug
    difficulty
    isPaidOnly
    likes
    dislikes
    stats
    content
    similarQuestions
    topicTags { name slug }
  }
}
"""

_PROBLEMSET = """
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(
    categorySlug: $categorySlug
    limit: $limit
    skip: $skip
    filters: $filters
  ) {
    total: totalNum
    questions: data {
      questionFrontendId
      title
      titleSlug
      difficulty
      acRate
      isPaidOnly
      topicTags { name slug }
    }
  }
}
"""

_SUBMISSION_DETAILS = """
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtimePercentile
    memoryPercentile
    lang { name }
    code
  }
}
"""

# Kept apart from _SUBMISSION_DETAILS so a field LeetCode renames here can only
# cost the failing-input nicety, never the code of an accepted solve.
_FAILED_DETAILS = """
query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    lastTestcase
    expectedOutput
    codeOutput
    runtimeError
  }
}
"""

_USER_STATUS = """
query globalData {
  userStatus {
    isSignedIn
    username
  }
}
"""

_SUBMISSION_LIST = """
query submissionList($offset: Int!, $limit: Int!, $questionSlug: String!) {
  questionSubmissionList(offset: $offset, limit: $limit, questionSlug: $questionSlug) {
    submissions { id statusDisplay lang timestamp }
  }
}
"""


async def recent_ac(username, limit=20, auth=None):
    """Public. Returns [{id, title, titleSlug, timestamp(int)}]."""
    async with httpx.AsyncClient() as client:
        data = await _query(client, _RECENT_AC, {"username": username, "limit": limit}, auth)
    out = []
    for s in data.get("recentAcSubmissionList") or []:
        out.append({
            "id": int(s["id"]),
            "title": s["title"],
            "titleSlug": s["titleSlug"],
            "timestamp": int(s["timestamp"]),
        })
    return out


async def question(slug, auth=None):
    """Public. Returns metadata dict (with likes/dislikes/similar) or None."""
    async with httpx.AsyncClient() as client:
        data = await _query(
            client, _QUESTION, {"titleSlug": slug}, auth,
            referer=f"https://leetcode.com/problems/{slug}/",
        )
    q = data.get("question")
    if not q:
        return None
    likes = q.get("likes")
    dislikes = q.get("dislikes")
    like_ratio = None
    if likes is not None and dislikes is not None and (likes + dislikes) > 0:
        like_ratio = round(likes / (likes + dislikes), 4)
    return {
        "frontend_id": int(q["questionFrontendId"]) if q.get("questionFrontendId") else None,
        "title": q["title"],
        "difficulty": q.get("difficulty") or "Unknown",
        "tags": [t["name"] for t in (q.get("topicTags") or [])],
        "paid_only": bool(q.get("isPaidOnly")),
        "likes": likes,
        "dislikes": dislikes,
        "like_ratio": like_ratio,
        "ac_rate": _ac_rate(q.get("stats")),
        "content_html": q.get("content"),
        "similar_slugs": _similar_slugs(q.get("similarQuestions")),
        # What the in-app editor needs: the id LeetCode's judge is keyed by (not
        # the number shown on the site), the starter code and the example inputs.
        "question_id": str(q["questionId"]) if q.get("questionId") else None,
        "starter_code": next((s["code"] for s in (q.get("codeSnippets") or [])
                              if s.get("langSlug") == EDITOR_LANG), None),
        "example_testcases": list(q.get("exampleTestcaseList") or []),
    }


def _ac_rate(stats_json):
    if not stats_json:
        return None
    try:
        s = json.loads(stats_json)
        raw = s.get("acRate")  # e.g. "49.5%"
        return round(float(str(raw).rstrip("%")), 1) if raw is not None else None
    except Exception:
        return None


def _similar_slugs(similar_json):
    if not similar_json:
        return []
    try:
        return [q["titleSlug"] for q in json.loads(similar_json)]
    except Exception:
        return []


_DIFFICULTY_FILTER = {"Easy": "EASY", "Medium": "MEDIUM", "Hard": "HARD"}


async def problemset_page(topic=None, difficulty=None, skip=0, limit=50, auth=None,
                          search=None):
    """Public. Browse the global problem set. Returns {total, questions:[...]}.

    `topic` is a LeetCode tag slug (e.g. 'two-pointers'); `difficulty` is one of
    Easy/Medium/Hard. `search` is LeetCode's own keyword filter, which matches a
    problem number exactly and a title loosely — the only way to reach a slug
    from a number, since the question query is keyed by slug.
    """
    filters = {}
    if difficulty and difficulty in _DIFFICULTY_FILTER:
        filters["difficulty"] = _DIFFICULTY_FILTER[difficulty]
    if topic:
        filters["tags"] = [topic]
    if search:
        filters["searchKeywords"] = str(search)
    async with httpx.AsyncClient() as client:
        data = await _query(
            client, _PROBLEMSET,
            {"categorySlug": "", "skip": skip, "limit": limit, "filters": filters},
            auth,
        )
    lst = data.get("problemsetQuestionList") or {}
    out = []
    for q in lst.get("questions") or []:
        out.append({
            "frontend_id": int(q["questionFrontendId"]) if q.get("questionFrontendId") else None,
            "title": q["title"],
            "slug": q["titleSlug"],
            "difficulty": q.get("difficulty") or "Unknown",
            "ac_rate": round(q["acRate"], 1) if q.get("acRate") is not None else None,
            "paid_only": bool(q.get("isPaidOnly")),
            "tags": [t["name"] for t in (q.get("topicTags") or [])],
            "tag_slugs": [t["slug"] for t in (q.get("topicTags") or [])],
        })
    return {"total": lst.get("total"), "questions": out}


async def submission_details(submission_id, auth):
    """Auth required. Returns {runtime_percentile, memory_percentile, lang, code} or None."""
    if not has_auth(auth):
        return None
    async with httpx.AsyncClient() as client:
        data = await _query(client, _SUBMISSION_DETAILS, {"submissionId": submission_id}, auth)
    d = data.get("submissionDetails")
    if not d:
        return None
    lang = d.get("lang") or {}
    return {
        "runtime_percentile": d.get("runtimePercentile"),
        "memory_percentile": d.get("memoryPercentile"),
        "lang": lang.get("name"),
        "code": d.get("code"),
    }


async def signed_in_as(auth):
    """Is this cookie still good? Returns the LeetCode username, or None.

    The cheapest authenticated call there is — `userStatus` takes no arguments
    and answers from the session alone, which is exactly the thing in question.
    An unauthenticated caller gets a well-formed reply with `isSignedIn: false`
    rather than an error, so a dead cookie is a value here, not an exception.
    Anything that *does* raise (offline, LeetCode down) is the caller's to read
    as "unknown" — never as "expired".
    """
    if not has_auth(auth):
        return None
    async with httpx.AsyncClient() as client:
        data = await _query(client, _USER_STATUS, {}, auth)
    status = data.get("userStatus") or {}
    return status.get("username") if status.get("isSignedIn") else None


async def wrong_attempts_between(slug, start_ts, end_ts, auth):
    """Auth required. Count of non-Accepted submissions for `slug` in [start, end]."""
    if not has_auth(auth):
        return None
    async with httpx.AsyncClient() as client:
        data = await _query(
            client, _SUBMISSION_LIST,
            {"offset": 0, "limit": 40, "questionSlug": slug}, auth,
            referer=f"https://leetcode.com/problems/{slug}/submissions/",
        )
    lst = (data.get("questionSubmissionList") or {}).get("submissions") or []
    count = 0
    for s in lst:
        ts = int(s["timestamp"])
        if start_ts <= ts <= end_ts and s.get("statusDisplay") != "Accepted":
            count += 1
    return count


_FAILED_STATUSES = ("Wrong Answer", "Runtime Error", "Time Limit Exceeded",
                    "Memory Limit Exceeded", "Output Limit Exceeded")


def _clip(value, limit=300):
    text = str(value or "").strip()
    return text if len(text) <= limit else text[:limit] + "…"


async def failed_tests_between(slug, start_ts, end_ts, auth, limit=2):
    """Auth required. The failing inputs of the latest `limit` wrong submissions
    for `slug` in [start, end]: [{status, input, expected, output}], newest first."""
    if not has_auth(auth):
        return []
    async with httpx.AsyncClient() as client:
        data = await _query(
            client, _SUBMISSION_LIST,
            {"offset": 0, "limit": 40, "questionSlug": slug}, auth,
            referer=f"https://leetcode.com/problems/{slug}/submissions/",
        )
        lst = (data.get("questionSubmissionList") or {}).get("submissions") or []
        failed = sorted(
            (s for s in lst
             if start_ts <= int(s["timestamp"]) <= end_ts
             and s.get("statusDisplay") in _FAILED_STATUSES),
            key=lambda s: int(s["timestamp"]), reverse=True)[:limit]
        out = []
        for sub in failed:
            try:
                d = (await _query(client, _FAILED_DETAILS,
                                  {"submissionId": int(sub["id"])}, auth)
                     ).get("submissionDetails") or {}
            except Exception:
                d = {}
            out.append({
                "status": sub.get("statusDisplay"),
                "input": _clip(d.get("lastTestcase")),
                "expected": _clip(d.get("expectedOutput"), 120),
                "output": _clip(d.get("codeOutput") or d.get("runtimeError"), 120),
            })
    return out


# ---- judging (in-app editor) -------------------------------------------------

class JudgeError(RuntimeError):
    """LeetCode wouldn't judge this (rate limit, dead cookie, queue timeout).
    Its message is written for the editor to show as-is."""


async def _judge(slug, path, body, check_path, auth):
    """POST code to a judge endpoint, then poll its check endpoint to a verdict."""
    if not has_auth(auth):
        raise JudgeError("Judging needs your LeetCode cookie — set it in Settings.")
    headers = _headers(auth, referer=f"{BASE_URL}/problems/{slug}/")
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{BASE_URL}/problems/{slug}/{path}/", json=body,
                                 headers=headers, timeout=TIMEOUT)
        if resp.status_code == 429:
            raise JudgeError("LeetCode is rate-limiting — wait a few seconds and try again.")
        if resp.status_code in (401, 403):
            raise JudgeError("LeetCode refused the cookie — refresh it in Settings.")
        resp.raise_for_status()
        started = resp.json()
        if started.get("error"):
            raise JudgeError(str(started["error"]))
        job = started.get("interpret_id") or started.get("submission_id")
        if not job:
            raise JudgeError("LeetCode didn't queue the code.")
        deadline = time.monotonic() + JUDGE_WAIT_SEC
        while True:
            check = await client.get(f"{BASE_URL}/submissions/detail/{job}/{check_path}",
                                     headers=headers, timeout=TIMEOUT)
            check.raise_for_status()
            data = check.json()
            if data.get("state") == "SUCCESS":
                return job, data
            if time.monotonic() > deadline:
                raise JudgeError("LeetCode is taking too long to judge — try again.")
            await asyncio.sleep(JUDGE_POLL_SEC)


def _judge_error(d):
    return (d.get("full_compile_error") or d.get("compile_error")
            or d.get("full_runtime_error") or d.get("runtime_error") or None)


def clean_input(data_input):
    """A run's test input without blank lines. Every parameter is one line and
    none is ever empty (an empty string is written `""`), so a blank line is a
    stray Enter — which would shift every parameter after it."""
    return "\n".join(line for line in (data_input or "").split("\n") if line.strip())


def _cases(data_input, total):
    """Split a run's newline-joined input back into one string per case."""
    lines = (data_input or "").split("\n")
    if not total or len(lines) % total:
        return [data_input or ""]
    per = len(lines) // total
    return ["\n".join(lines[i:i + per]) for i in range(0, len(lines), per)]


async def run_code(slug, question_id, code, data_input, auth):
    """Auth required. Judge `code` on `data_input` against LeetCode's reference
    answer, like the editor's Run. Raises JudgeError when it can't be judged."""
    data_input = clean_input(data_input)
    body = {"lang": EDITOR_LANG, "question_id": str(question_id),
            "typed_code": code, "data_input": data_input}
    _, d = await _judge(slug, "interpret_solution", body, "check/", auth)
    total = d.get("total_testcases") or 0
    inputs = _cases(data_input, total)
    answers = d.get("code_answer") or []
    expected = d.get("expected_code_answer") or []
    stdout = d.get("std_output_list") or []
    cases = [{"input": inputs[i] if i < len(inputs) else "",
              "output": answers[i] if i < len(answers) else None,
              "expected": expected[i] if i < len(expected) else None,
              "stdout": stdout[i] if i < len(stdout) else ""}
             for i in range(total)]
    error = _judge_error(d)
    return {
        "status": d.get("status_msg"),
        # A run's status reads "Accepted" whenever the code ran at all; whether
        # it matched the reference answer is correct_answer.
        "passed": bool(d.get("correct_answer")) and not error,
        "correct": d.get("total_correct"), "total": total,
        "cases": cases, "error": error, "runtime": d.get("status_runtime"),
    }


async def submit_code(slug, question_id, code, auth):
    """Auth required. Submit `code` for judging on the full test set."""
    body = {"lang": EDITOR_LANG, "question_id": str(question_id), "typed_code": code}
    job, d = await _judge(slug, "submit", body, "v2/check/", auth)
    finished = d.get("task_finish_time")
    return {
        "status": d.get("status_msg"),
        "accepted": d.get("status_msg") == "Accepted",
        "submission_id": int(d.get("submission_id") or job),
        "finished_at": int(finished / 1000) if finished else int(time.time()),
        "correct": d.get("total_correct"), "total": d.get("total_testcases"),
        "input": d.get("last_testcase") or None,
        "expected": d.get("expected_output") or None,
        "output": d.get("code_output") or None,
        "stdout": d.get("std_output") or None,
        "error": _judge_error(d),
        "runtime_percentile": d.get("runtime_percentile"),
        "memory_percentile": d.get("memory_percentile"),
        "runtime": d.get("status_runtime"), "memory": d.get("status_memory"),
    }
