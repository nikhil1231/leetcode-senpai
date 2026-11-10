"""GET /api/search-index: everything the command palette can jump to, in one flat list.

Pages, lessons and exercises come from static course content; problems come from the user's library.
Nothing here depends on the model.
"""
from fastapi import APIRouter, Depends

from . import auth
from .store import get_store
from .system_design_curriculum import LESSONS as SD_LESSONS
from .tracks import courses, practical

router = APIRouter(prefix='/api', tags=['search'])

COURSE_NAMES = {'fundamentals': 'Fundamentals', 'ai': 'AI Engineering'}


def lessons():
    out = [{'kind': 'lesson', 'title': l['title'], 'sub': 'System Design lesson', 'route': f"#/system-design/lesson/{l['id']}"}
           for l in SD_LESSONS.values()]
    from .tutor.lessons import map_areas
    out += [{'kind': 'lesson', 'title': f'Overview: {t}', 'sub': 'System Design area overview (pass one)', 'route': f'#/system-design/map/{c}'}
            for c, t, _ in map_areas()]
    from .tutor import overviews
    from .tutor.lessons import track_area
    out += [{'kind': 'lesson', 'title': f'Overview: {track_area(s, c)[0]}', 'sub': f'{COURSE_NAMES[s]} area overview',
             'route': f'#/{s}/map/{c}'} for s in overviews.TRACKS for c in overviews.areas(s)]
    for track, name in COURSE_NAMES.items():
        for cat in courses.overview(track, [], 0)['course']:
            out += [{'kind': 'lesson', 'title': l['title'], 'sub': f'{name} lesson', 'route': f"#/{track}/lesson/{l['id']}"}
                    for l in cat['lessons']]
    out += [{'kind': 'exercise', 'title': i['label'], 'sub': 'Practical exercise', 'route': f"#/practical/exercise/{i['topic']}"}
            for i in practical.ITEMS]
    return out


def problems(store):
    return [{'kind': 'problem', 'title': f"{p.get('number') or ''} {p.get('title') or p['slug']}".strip(),
             'sub': ' · '.join(x for x in (p.get('neetcode_category'), p.get('difficulty')) if x), 'slug': p['slug']}
            for p in store.list_problems()]


@router.get('/search-index')
def search_index(uid: str = Depends(auth.require_user)):
    return {'items': lessons() + problems(get_store(uid))}
