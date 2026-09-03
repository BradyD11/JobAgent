"""Shared HTTP helpers for job sources."""

import time
import requests

from ..config import BROWSER_HEADERS, REQUEST_TIMEOUT, RATE_LIMIT_DELAY

_last_request_at: dict[str, float] = {}


def polite_get(url: str, headers: dict | None = None, **kwargs) -> requests.Response:
    """GET with browser headers and a per-host delay."""
    host = requests.utils.urlparse(url).netloc
    elapsed = time.time() - _last_request_at.get(host, 0)
    if elapsed < RATE_LIMIT_DELAY:
        time.sleep(RATE_LIMIT_DELAY - elapsed)
    h = dict(BROWSER_HEADERS)
    if headers:
        h.update(headers)
    resp = requests.get(url, headers=h, timeout=REQUEST_TIMEOUT, **kwargs)
    _last_request_at[host] = time.time()
    resp.raise_for_status()
    return resp


class SourceError(Exception):
    """A source failed; the run continues with the other sources."""
