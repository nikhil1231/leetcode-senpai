"""Thin async client over LeetCode's unofficial GraphQL endpoint.

The session cookie is NOT read from config — it is passed in per call as an
`auth` dict {"session": ..., "csrf": ...}, which the API layer pulls from the
request headers (the value lives in the browser's localStorage). It is used
transiently and never persisted or logged server-side.

Public data (recent accepted submissions, question metadata) needs only a
username. Private data (% beaten, code, wrong-attempt counts) needs the cookie.
"""
import json

import httpx

GRAPHQL_URL = "https://leetcode.com/graphql"
TIMEOUT = 15.0


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
    questionFrontendId
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


async def problemset_page(topic=None, difficulty=None, skip=0, limit=50, auth=None):
    """Public. Browse the global problem set. Returns {total, questions:[...]}.

    `topic` is a LeetCode tag slug (e.g. 'two-pointers'); `difficulty` is one of
    Easy/Medium/Hard.
    """
    filters = {}
    if difficulty and difficulty in _DIFFICULTY_FILTER:
        filters["difficulty"] = _DIFFICULTY_FILTER[difficulty]
    if topic:
        filters["tags"] = [topic]
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
