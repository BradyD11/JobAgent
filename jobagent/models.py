"""Job normalization, metro/role matching, and de-duplication."""

import hashlib
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

from .config import (
    METROS, SWE_TITLE_TERMS, SWE_TITLE_EXCLUDE,
    INTERN_TERMS, INTERN_EXCLUDE,
)

REMOTE_TERMS = ("remote", "anywhere", "distributed")


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def match_metros(location: str) -> list[str]:
    """Return every target metro named in a raw location string.

    A posting may list several cities, so this returns a list rather than
    a single best guess.
    """
    loc = _norm(location)
    if not loc:
        return []
    hits = []
    for metro, needles in METROS.items():
        if any(n in loc for n in needles):
            hits.append(metro)
    return hits


def is_remote(location: str) -> bool:
    return any(t in _norm(location) for t in REMOTE_TERMS)


def is_swe_title(title: str) -> bool:
    """True when the title names a software-engineering role."""
    t = _norm(title)
    if not t:
        return False
    if any(x in t for x in SWE_TITLE_EXCLUDE):
        return False
    return any(term in t for term in SWE_TITLE_TERMS)


def is_internship(title: str, extra: str = "") -> bool:
    """True when the posting is an internship.

    `extra` carries source-specific hints (employment type, term labels)
    that often say "Internship" when the title itself does not.
    """
    t = _norm(title)
    blob = _norm(f"{title} {extra}")
    if any(x in t for x in INTERN_EXCLUDE):
        return False
    return any(term in blob for term in INTERN_TERMS)


@dataclass
class Job:
    source: str
    title: str
    company: str
    location: str
    url: str
    metros: list[str] = field(default_factory=list)
    posted: Optional[str] = None
    salary: Optional[str] = None
    summary: Optional[str] = None
    remote: bool = False
    sponsorship: Optional[str] = None
    job_id: str = ""

    def __post_init__(self):
        if not self.metros:
            self.metros = match_metros(self.location)
        self.remote = is_remote(self.location)
        if not self.job_id:
            self.job_id = self.fingerprint()

    def fingerprint(self) -> str:
        """Stable id from company+title+metro, so the same role posted to
        two boards collapses into one row."""
        key = "|".join([
            _norm(self.company),
            re.sub(r"[^a-z0-9 ]", "", _norm(self.title)),
            ",".join(sorted(self.metros)),
        ])
        return hashlib.sha1(key.encode()).hexdigest()[:16]

    def to_dict(self) -> dict:
        return asdict(self)


def dedupe(jobs: list[Job]) -> list[Job]:
    """Collapse duplicates across sources, preferring the richer record."""
    best: dict[str, Job] = {}
    for j in jobs:
        cur = best.get(j.job_id)
        if cur is None or _score(j) > _score(cur):
            if cur is not None:
                # Keep a note of every board the role appeared on.
                j.source = _merge_sources(cur.source, j.source)
            best[j.job_id] = j
        elif cur is not None:
            cur.source = _merge_sources(cur.source, j.source)
    return list(best.values())


def _merge_sources(a: str, b: str) -> str:
    parts = []
    for s in (a or "").split("+") + (b or "").split("+"):
        s = s.strip()
        if s and s not in parts:
            parts.append(s)
    return "+".join(parts)


def _score(j: Job) -> int:
    """Prefer records with an apply URL, salary, and a summary."""
    s = 0
    if j.url:
        s += 4
    if j.salary:
        s += 2
    if j.summary:
        s += 1
    if j.posted:
        s += 1
    return s
