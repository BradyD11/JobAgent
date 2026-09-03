"""LinkedIn via the public guest job-search endpoint.

Uses the same unauthenticated endpoint that serves logged-out visitors, so
no credentials are stored and no account is put at risk. Returns 10 HTML
cards per page.
"""

import re
from html import unescape
from urllib.parse import urlencode

from .base import polite_get, SourceError
from ..models import Job, is_swe_title, is_internship, match_metros

NAME = "LinkedIn"

ENDPOINT = "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"

# geoId keeps results tighter than a free-text location.
GEO = {
    "SF Bay Area": "90000084",
    "NYC": "90000070",
    "Seattle": "90000091",
    "Austin": "90000059",
    "LA": "90000049",
}

PAGES_PER_METRO = 4  # 10 results per page

_CARD = re.compile(r"<li>(.*?)</li>", re.S)
_TITLE = re.compile(r'base-search-card__title">\s*(.*?)\s*</h3>', re.S)
_COMPANY = re.compile(r'hidden-nested-link"[^>]*>\s*(.*?)\s*</a>', re.S)
_LOC = re.compile(r'job-search-card__location">\s*(.*?)\s*</span>', re.S)
# The class attribute carries trailing utility classes, so match loosely.
_URL = re.compile(r'<a[^>]*base-card__full-link[^>]*href="([^"?]+)')
_DATE = re.compile(r'datetime="([\d-]+)"')


def fetch() -> list[Job]:
    jobs, errors = [], 0
    for metro, geo_id in GEO.items():
        for page in range(PAGES_PER_METRO):
            params = {
                "keywords": "software engineer intern",
                "geoId": geo_id,
                "f_E": "1",         # experience level: internship
                "f_TPR": "r2592000",  # posted in the last 30 days
                "start": page * 10,
            }
            try:
                html = polite_get(f"{ENDPOINT}?{urlencode(params)}").text
            except Exception:
                errors += 1
                break
            cards = _CARD.findall(html)
            if not cards:
                break
            for card in cards:
                job = _parse(card, metro)
                if job:
                    jobs.append(job)
    if not jobs and errors:
        raise SourceError("LinkedIn guest endpoint unreachable")
    return jobs


def _parse(card: str, metro: str) -> Job | None:
    def grab(rx):
        m = rx.search(card)
        return unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip() if m else ""

    title, company, loc = grab(_TITLE), grab(_COMPANY), grab(_LOC)
    if not title or not is_swe_title(title) or not is_internship(title):
        return None

    # Trust the metro we searched, but prefer what the card itself says.
    metros = match_metros(loc) or [metro]

    m = _URL.search(card)
    return Job(
        source=NAME,
        title=title,
        company=company,
        location=loc or metro,
        url=m.group(1) if m else "",
        metros=metros,
        posted=grab(_DATE) or None,
    )
