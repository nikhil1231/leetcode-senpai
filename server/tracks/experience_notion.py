"""Experience material from Notion, as Job Scout passes it on. Pure; no I/O.

Notion holds the stories and the question bank; Job Scout reads them, writes the model answers (a general pack and
one per role pack) and sends everything in its Senpai feed, which Senpai caches as `senpai_career/material`. This
module turns that cache into what the Experience track works with: prompts keyed by the same ids as before (so
practice history carries over), read-only stories, the model answer for a prompt, and a drift report of what is out
of step. Without the cache, the built-in prompts in experience_content still work.
"""
import re

from .experience_content import BY_ID as BUILTIN, COMPETENCIES, KINDS, PROBES, PROMPTS

COMP_BY_TITLE = {t.lower(): cid for cid, t, _ in COMPETENCIES}
KIND_SIGNALS = {
    'Introduction': 'Ninety seconds: where you have worked, one or two things you built, and why this role is next.',
    'Motivation': 'Specific and forward-looking: a real reason tied to your experience and to this role.',
    'Story': 'A specific situation, what you did and why, a concrete result, and what you learned.',
}
REF_RX = re.compile(r'\[(?:st|cv|tex|proj|bh|q)\.[A-Za-z0-9_./-]+\]\s?')


def comps(titles, fallback=()):
    ids = [COMP_BY_TITLE[t.lower()] for t in titles or [] if t.lower() in COMP_BY_TITLE]
    return ids or list(fallback)


def prompts(material):
    """Active prompts: the Notion bank when synced (built-in probes and signals kept where the id matches), plus any
    role-specific questions from in-flight role packs; the built-in list otherwise."""
    qs = (material or {}).get('questions') or []
    if not qs:
        return [dict(p, kind=KINDS.get(p['id'], 'Story'), rounds=[], source='builtin') for p in PROMPTS]
    out = []
    for q in qs:
        if not q.get('active'):
            continue
        base = BUILTIN.get(q['id']) or {}
        kind = q.get('kind') or 'Story'
        out.append({'id': q['id'], 'text': q['text'], 'competencies': comps(q.get('competencies'), base.get('competencies') or ['growth']),
                    'probes': base.get('probes') or PROBES[:3], 'signals': base.get('signals') or KIND_SIGNALS.get(kind, KIND_SIGNALS['Story']),
                    'kind': kind, 'rounds': q.get('rounds') or [], 'source': 'notion'})
    seen = {p['id'] for p in out}
    for app in applications(material):
        for item in (app.get('answers') or {}).get('items') or []:
            if item.get('extra') and item['id'] not in seen:
                seen.add(item['id'])
                out.append({'id': item['id'], 'text': item['text'], 'competencies': ['growth'],
                            'probes': [f['question'] for f in item.get('follow_ups') or []] or PROBES[:3],
                            'signals': item.get('why') or KIND_SIGNALS.get(item.get('kind'), KIND_SIGNALS['Story']),
                            'kind': item.get('kind') or 'Story', 'rounds': item.get('rounds') or [],
                            'source': 'role', 'company': app['company'], 'job_id': app['job_id']})
    return out


def known_prompt_ids(material):
    """Every id practice may be keyed on, inactive ones included, so old history still counts."""
    ids = set(BUILTIN)
    ids |= {q['id'] for q in (material or {}).get('questions') or []}
    ids |= {p['id'] for p in prompts(material)}
    return ids


def strip_refs(text):
    return REF_RX.sub('', text or '')


def stories(material):
    return [{'id': s['id'], 'source': 'notion', 'title': s['title'], 'summary': s.get('summary') or '',
             'competencies': comps(s.get('competencies')), 'themes': s.get('themes') or [],
             'status': s.get('status') or 'Draft', 'employer': s.get('employer') or '', 'period': s.get('period') or '',
             'url': s.get('url'), 'body': strip_refs(s.get('body_md')), 'hash': s.get('hash')}
            for s in (material or {}).get('stories') or []]


def applications(material):
    return (material or {}).get('applications') or []


def answer_for(material, prompt_id, job_id=None):
    """The model answer for a prompt: the role pack's when job_id is given and it has one, else the general pack's."""
    packs = []
    if job_id is not None:
        packs += [(a.get('answers'), a['company']) for a in applications(material) if a['job_id'] == job_id]
    packs.append(((material or {}).get('general_answers'), None))
    for pack, company in packs:
        for item in (pack or {}).get('items') or []:
            if item['id'] == prompt_id and item.get('answer'):
                return {'company': company, 'stale': bool((pack or {}).get('stale')),
                        'generated_at': (pack or {}).get('generated_at'),
                        **{k: item.get(k) for k in ('story_id', 'answer', 'short_answer', 'follow_ups', 'caveats', 'why')}}
    return None


def answers_by_prompt(material):
    """prompt id -> [{company or None, ...}] for every pack that answers it (general first)."""
    out = {}
    for pack, company, job_id in [((material or {}).get('general_answers'), None, None)] + \
            [(a.get('answers'), a['company'], a['job_id']) for a in applications(material)]:
        for item in (pack or {}).get('items') or []:
            if item.get('answer'):
                out.setdefault(item['id'], []).append({'company': company, 'job_id': job_id})
    return out


def drift(material, job_record, prompt_rows, story_rows, tracker=(), pack_states=None):
    """What is out of step between Notion, Job Scout and Senpai, most useful first. Each: {kind, text, fix}."""
    out = []
    if (job_record or {}).get('error'):
        out.append({'kind': 'feed', 'text': f"Job Scout couldn't be reached last time: {job_record['error']}",
                    'fix': 'Senpai keeps using the last copy it has.'})
    if not material:
        return out + [{'kind': 'feed', 'text': 'No stories from Notion yet.',
                       'fix': 'They arrive with the next Job Scout sync (every few hours).'}]
    gen = material.get('general_answers')
    if not gen:
        out.append({'kind': 'answers', 'text': 'No model answers yet.',
                    'fix': 'Job Scout builds them on its next heartbeat; they need LocalRouter to be free.'})
    elif gen.get('stale'):
        out.append({'kind': 'answers', 'text': 'Model answers predate your latest Notion edits.',
                    'fix': 'Job Scout rebuilds them on its next heartbeat.'})
    for a in applications(material):
        if (a.get('role_pack') or {}).get('stale'):
            out.append({'kind': 'answers', 'text': f"The {a['company']} role pack predates your latest Notion edits.",
                        'fix': f"Regenerate it on the job's page in Job Scout."})
    for s in story_rows:
        if s.get('source') == 'notion' and s.get('status') != 'Ready':
            out.append({'kind': 'story', 'text': f"“{s['title']}” is marked {s['status']} in Notion.",
                        'fix': 'Fill in what the page says is missing, then set it to Ready.'})
        if s.get('source') == 'local':
            out.append({'kind': 'story', 'text': f"“{s['title']}” only exists in Senpai.",
                        'fix': 'Copy it into the Notion Stories database so Job Scout can use it.'})
    covered = {c for s in story_rows if s.get('status', 'Ready') == 'Ready' for c in s.get('competencies') or []}
    lonely = [p for p in prompt_rows if p.get('kind', 'Story') == 'Story' and not set(p['competencies']) & covered]
    if lonely:
        out.append({'kind': 'coverage', 'text': f"{len(lonely)} question{'s have' if len(lonely) != 1 else ' has'} no Ready "
                    f"story to answer {'them' if len(lonely) != 1 else 'it'}, such as “{lonely[0]['text']}”",
                    'fix': 'Add a story in Notion with that competency, or tag an existing one.'})
    for t in tracker:
        mine = (pack_states or {}).get(t['topic'])
        if mine and t.get('state') and mine != t['state']:
            out.append({'kind': 'tracker', 'topic': t['topic'], 'state': mine,
                        'text': f"Notion's tracker says {t['state']} for {t['topic']}; your Senpai answers suggest {mine}.",
                        'fix': 'Suggest the change; it waits in Job Scout for your approval.'})
    return out
