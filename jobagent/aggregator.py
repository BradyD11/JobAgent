"""Runs every source, de-duplicates, and persists the results."""

import concurrent.futures as cf

from . import store
from .config import REFRESH_AFTER_HOURS
from .models import dedupe
from .sources import simplify, linkedin, jobright, workatastartup

SOURCES = {
    simplify.NAME: simplify,
    linkedin.NAME: linkedin,
    jobright.NAME: jobright,
    workatastartup.NAME: workatastartup,
}


def scrape(only: list[str] | None = None, stale_only: bool = False,
           conn=None) -> dict:
    """Fetch from each source in parallel and store the merged results.

    `stale_only` skips sources refreshed within REFRESH_AFTER_HOURS, which is
    what the dashboard uses on load. A source that fails is reported but does
    not stop the others.
    """
    own_conn = conn is None
    conn = conn or store.connect()
    try:
        names = [n for n in SOURCES if not only or n in only]
        if stale_only:
            names = [n for n in names
                     if store.is_stale(conn, n, REFRESH_AFTER_HOURS)]

        report = {"sources": {}, "skipped": [
            n for n in SOURCES if (not only or n in only) and n not in names]}
        if not names:
            report.update(new=0, updated=0, total=0)
            return report

        collected = []
        with cf.ThreadPoolExecutor(max_workers=len(names)) as pool:
            futures = {pool.submit(SOURCES[n].fetch): n for n in names}
            for fut in cf.as_completed(futures):
                name = futures[fut]
                try:
                    jobs = fut.result()
                    collected.extend(jobs)
                    report["sources"][name] = {"ok": True, "count": len(jobs)}
                    store.record_run(conn, name, len(jobs), ok=True)
                except Exception as exc:
                    msg = f"{type(exc).__name__}: {exc}"
                    report["sources"][name] = {"ok": False, "error": msg}
                    store.record_run(conn, name, 0, ok=False, error=msg)

        merged = dedupe(collected)
        new, updated = store.upsert_jobs(conn, merged)
        report.update(new=new, updated=updated, total=len(merged),
                      raw=len(collected))
        return report
    finally:
        if own_conn:
            conn.close()
