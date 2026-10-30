"""Telegram Bot API transport: the one choke point tests replace. Raises on any failure."""
import httpx

from .. import config

POLL = 20


def call(method, **params):
    timeout = (params.get('timeout') or 0) + 15
    r = httpx.post(f'{config.TELEGRAM_API}/bot{config.TELEGRAM_BOT_TOKEN}/{method}', json=params, timeout=timeout)
    data = r.json()
    if not data.get('ok'):
        raise RuntimeError(f'Telegram {method} failed: {data.get("description", r.status_code)}')
    return data['result']


def download(file_id):
    path = call('getFile', file_id=file_id)['file_path']
    r = httpx.get(f'{config.TELEGRAM_API}/file/bot{config.TELEGRAM_BOT_TOKEN}/{path}', timeout=30)
    r.raise_for_status()
    return r.content
