"""Simplify / Pitt CSC internship list.

Public JSON feed maintained daily in a GitHub repo. The richest and most
reliable of the four sources.
"""

from datetime import datetime, timezone

from .base import polite_get, SourceError
from ..models import Job, is_swe_title, match_metros

NAME = "Simplify"

FEED_URLS = [
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2027-Internships/dev/.github/scripts/listings.json",
    "https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json",
]

# Feed categories that count as software engineering.
SWE_CATEGORIES = {
    "Software", "Software Engineering",
    "AI/ML/Data", "Data Science, AI & Machine Learning",
}


def fetch() -> list[Job]:
    data = None
    for url in FEED_URLS:
        try:
            data = polite_get(url).json()
            break
        except Exception:
            continue
    if data is None:
        raise SourceError("Simplify feed unreachable")

    jobs = []
    for row in data:
        if not row.get("active") or not row.get("is_visible", True):
            continue
        if row.get("category") not in SWE_CATEGORIES:
            continue

        title = row.get("title") or ""
        # Every row in this feed is an internship, so only the role must match.
        if not is_swe_title(title):
            continue

        locations = row.get("locations") or []
        metros = []
        for loc in locations:
            metros.extend(m for m in match_metros(loc) if m not in metros)
        if not metros:
            continue

        jobs.append(Job(
            source=NAME,
            title=title,
            company=row.get("company_name") or "",
            location=", ".join(locations),
            url=row.get("url") or "",
            metros=metros,
            posted=_ts(row.get("date_posted")),
            sponsorship=row.get("sponsorship"),
            summary=", ".join(row.get("terms") or []) or None,
        ))
    return jobs


def _ts(epoch) -> str | None:
    if not epoch:
        return None
    try:
        return datetime.fromtimestamp(int(epoch), tz=timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OSError, TypeError):
        return None
