"""Jobright via its server-rendered __NEXT_DATA__ payload.

Jobright gates real search behind a login. Its public pages ignore every
query-string filter and pagination param -- the embedded `query` object comes
back with an empty `jobTypes` no matter what is asked for -- and serve one
generic page of ~20 recent jobs. So this source fetches that single page and
filters it locally. It contributes little on its own and is best treated as a
bonus on top of Simplify and LinkedIn.
"""

import json
import re
from urllib.parse import urlencode

from .base import polite_get, SourceError
from ..models import Job, is_swe_title, is_internship, match_metros

NAME = "Jobright"

SEARCH_URL = "https://jobright.ai/jobs/search"

# Kept only to vary the request; Jobright does not honour these server-side.
CITIES = {
    "SF Bay Area": "San Francisco, CA",
    "NYC": "New York, NY",
    "Seattle": "Seattle, WA",
    "Austin": "Austin, TX",
    "LA": "Los Angeles, CA",
}

_NEXT = re.compile(
    r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', re.S
)


def fetch() -> list[Job]:
    jobs = []
    seen = set()
    for metro, city in CITIES.items():
        params = {
            "jobTitle": "software engineer intern",
            "city": city,
            "jobTypes": "Internship",
        }
        try:
            html = polite_get(f"{SEARCH_URL}?{urlencode(params)}").text
        except Exception as exc:
            raise SourceError(f"Jobright unreachable: {exc}") from exc
        for row in _job_list(html):
            job = _parse(row, metro)
            if job and job.url not in seen:
                seen.add(job.url)
                jobs.append(job)
    return jobs


def _job_list(html: str) -> list[dict]:
    m = _NEXT.search(html)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []
    return data.get("props", {}).get("pageProps", {}).get("jobList", []) or []


def _parse(row: dict, metro: str) -> Job | None:
    # Rows are either the job itself or a wrapper holding jobResult.
    job = row.get("jobResult") or row
    company = row.get("companyResult") or {}

    title = job.get("jobTitle") or job.get("jobNlpTitle") or ""
    employment = job.get("employmentType") or ""
    if not is_swe_title(title) or not is_internship(title, employment):
        return None

    locations = job.get("jobLocations") or [job.get("jobLocation") or ""]
    location = ", ".join(x for x in locations if x)
    metros = match_metros(location)
    if not metros:
        # Jobright returns out-of-area rows for a city query; drop them
        # rather than assuming the metro we asked for.
        return None

    job_id = job.get("jobId") or ""
    return Job(
        source=NAME,
        title=title,
        company=company.get("companyName") or job.get("companyName") or "",
        location=location,
        url=f"https://jobright.ai/jobs/info/{job_id}" if job_id else "",
        metros=metros,
        posted=(job.get("publishTime") or "")[:10] or None,
        summary=job.get("jobSummary"),
    )
