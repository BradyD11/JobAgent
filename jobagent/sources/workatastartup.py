"""Y Combinator's Work at a Startup.

Jobs are embedded in the Inertia.js `data-page` attribute of the public jobs
page. The site 406s on a bare request, so full browser headers are required
(supplied by polite_get). Its robots.txt has an empty Disallow, i.e. crawling
is permitted. The public page serves ~30 jobs and does not paginate, so this
source is a supplement rather than a primary feed.
"""

import json
import re
from html import unescape
from urllib.parse import urlencode

from .base import polite_get, SourceError
from ..models import Job, is_swe_title, is_internship, match_metros

NAME = "WorkAtAStartup"

JOBS_URL = "https://www.workatastartup.com/jobs"

# Role slugs the site accepts; each returns a different slice of listings.
ROLES = ["eng", "ops", "product"]

_DATA_PAGE = re.compile(r'data-page="([^"]+)"')


def fetch() -> list[Job]:
    jobs, seen, errors = [], set(), 0
    for role in ROLES:
        params = {"role": role, "jobType": "intern"}
        try:
            html = polite_get(f"{JOBS_URL}?{urlencode(params)}").text
            rows = _rows(html)
        except Exception:
            errors += 1
            continue
        for row in rows:
            job = _parse(row)
            if job and job.job_id not in seen:
                seen.add(job.job_id)
                jobs.append(job)
    if not jobs and errors:
        raise SourceError("Work at a Startup unreachable")
    return jobs


def _rows(html: str) -> list[dict]:
    m = _DATA_PAGE.search(html)
    if not m:
        return []
    try:
        data = json.loads(unescape(m.group(1)))
    except json.JSONDecodeError:
        return []
    return data.get("props", {}).get("jobs", []) or []


def _parse(row: dict) -> Job | None:
    title = row.get("title") or ""
    # The site ignores jobType=intern, so check the field it returns.
    if not is_internship(title, row.get("jobType") or ""):
        return None
    if not is_swe_title(f"{title} {row.get('roleType') or ''}"):
        return None

    location = row.get("location") or ""
    metros = match_metros(location)
    if not metros:
        return None

    company = row.get("companyName") or ""
    batch = row.get("companyBatch")
    slug = row.get("companySlug")
    return Job(
        source=NAME,
        title=title,
        company=f"{company} ({batch})" if batch else company,
        location=location,
        # Prefer the public company page; applyUrl is a login redirect.
        url=f"https://www.workatastartup.com/companies/{slug}" if slug
            else (row.get("applyUrl") or ""),
        metros=metros,
        salary=row.get("salary"),
        summary=row.get("companyOneLiner"),
    )
