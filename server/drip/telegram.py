"""Telegram Bot API transport: the one choke point tests replace. Raises on any failure."""
import threading
import httpx

from .. import config

POLL = 20

_CLIENT: httpx.Client | None = None
_LOCK = threading.Lock()


def get_client() -> httpx.Client:
    global _CLIENT
    if _CLIENT is None or _CLIENT.is_closed:
        with _LOCK:
            if _CLIENT is None or _CLIENT.is_closed:
                _CLIENT = httpx.Client(
                    limits=httpx.Limits(max_keepalive_connections=5, max_connections=10, keepalive_expiry=60.0),
                    timeout=httpx.Timeout(30.0),
                )
    return _CLIENT


def close():
    """Close the persistent HTTP client if open."""
    global _CLIENT
    with _LOCK:
        if _CLIENT is not None:
            try:
                if not _CLIENT.is_closed:
                    _CLIENT.close()
            finally:
                _CLIENT = None


def call(method, **params):
    timeout = (params.get('timeout') or 0) + 15
    client = get_client()
    r = client.post(f'{config.TELEGRAM_API}/bot{config.TELEGRAM_BOT_TOKEN}/{method}', json=params, timeout=timeout)
    data = r.json()
    if not data.get('ok'):
        raise RuntimeError(f'Telegram {method} failed: {data.get("description", r.status_code)}')
    return data['result']


def upload(method, field, filename, data, mime, **params):
    """A call that sends a file (sendAudio): multipart, other parameters as form fields."""
    client = get_client()
    r = client.post(f'{config.TELEGRAM_API}/bot{config.TELEGRAM_BOT_TOKEN}/{method}',
                    data={k: str(v) for k, v in params.items()},
                    files={field: (filename, data, mime)}, timeout=120)
    out = r.json()
    if not out.get('ok'):
        raise RuntimeError(f'Telegram {method} failed: {out.get("description", r.status_code)}')
    return out['result']


def download(file_id):
    path = call('getFile', file_id=file_id)['file_path']
    client = get_client()
    r = client.get(f'{config.TELEGRAM_API}/file/bot{config.TELEGRAM_BOT_TOKEN}/{path}', timeout=30)
    r.raise_for_status()
    return r.content
