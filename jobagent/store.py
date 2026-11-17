"""SQLite persistence for jobs, application status, and source freshness."""

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import Job

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "jobs.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    job_id      TEXT PRIMARY KEY,
    source      TEXT NOT NULL,
    title       TEXT NOT NULL,
    company     TEXT NOT NULL,
    location    TEXT,
    url         TEXT,
    metros      TEXT,
    posted      TEXT,
    salary      TEXT,
    summary     TEXT,
    remote      INTEGER DEFAULT 0,
    sponsorship TEXT,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new',
    notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen ON jobs(last_seen);

CREATE TABLE IF NOT EXISTS source_runs (
    source     TEXT PRIMARY KEY,
    ran_at     TEXT NOT NULL,
    job_count  INTEGER DEFAULT 0,
    ok         INTEGER DEFAULT 1,
    error      TEXT
);
"""

# Untouched listings no board has returned in 3 days are closed postings; hide them.
# Anything the user acted on (saved, applied...) stays visible.
LIVE = "(status != 'new' OR last_seen >= strftime('%Y-%m-%dT%H:%M:%S', 'now', '-3 days'))"

STATUSES = ("new", "saved", "applied", "interviewing", "rejected", "dismissed")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def upsert_jobs(conn: sqlite3.Connection, jobs: list[Job]) -> tuple[int, int]:
    """Insert new jobs, refresh existing ones. Returns (new, updated).

    A job's status and notes are never overwritten, so marking something
    'applied' survives later scrapes.
    """
    now = _now()
    new = updated = 0
    for j in jobs:
        row = conn.execute(
            "SELECT job_id FROM jobs WHERE job_id = ?", (j.job_id,)
        ).fetchone()
        if row:
            conn.execute(
                """UPDATE jobs SET last_seen=?, source=?, url=COALESCE(NULLIF(?, ''), url),
                   salary=COALESCE(?, salary), summary=COALESCE(?, summary)
                   WHERE job_id=?""",
                (now, j.source, j.url, j.salary, j.summary, j.job_id),
            )
            updated += 1
        else:
            conn.execute(
                """INSERT INTO jobs (job_id, source, title, company, location, url,
                   metros, posted, salary, summary, remote, sponsorship,
                   first_seen, last_seen, status)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new')""",
                (j.job_id, j.source, j.title, j.company, j.location, j.url,
                 json.dumps(j.metros), j.posted, j.salary, j.summary,
                 int(j.remote), j.sponsorship, now, now),
            )
            new += 1
    conn.commit()
    return new, updated


def record_run(conn, source: str, count: int, ok: bool = True, error: str | None = None):
    conn.execute(
        """INSERT INTO source_runs (source, ran_at, job_count, ok, error)
           VALUES (?,?,?,?,?)
           ON CONFLICT(source) DO UPDATE SET
             ran_at=excluded.ran_at, job_count=excluded.job_count,
             ok=excluded.ok, error=excluded.error""",
        (source, _now(), count, int(ok), error),
    )
    conn.commit()


def is_stale(conn, source: str, hours: float) -> bool:
    row = conn.execute(
        "SELECT ran_at, ok FROM source_runs WHERE source = ?", (source,)
    ).fetchone()
    if not row or not row["ok"]:
        return True
    try:
        ran = datetime.fromisoformat(row["ran_at"])
    except ValueError:
        return True
    return datetime.now(timezone.utc) - ran > timedelta(hours=hours)


def query_jobs(conn, metro=None, status=None, source=None, search=None,
               days=None, limit=1000) -> list[dict]:
    sql = f"SELECT * FROM jobs WHERE {LIVE}"
    args: list = []
    if metro:
        sql += " AND metros LIKE ?"
        args.append(f"%{metro}%")
    if status:
        sql += " AND status = ?"
        args.append(status)
    else:
        sql += " AND status != 'dismissed'"
    if source:
        sql += " AND source LIKE ?"
        args.append(f"%{source}%")
    if search:
        sql += " AND (title LIKE ? OR company LIKE ?)"
        args += [f"%{search}%", f"%{search}%"]
    if days:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=int(days))).isoformat()
        sql += " AND first_seen >= ?"
        args.append(cutoff)
    sql += " ORDER BY (posted IS NULL), posted DESC, first_seen DESC LIMIT ?"
    args.append(limit)

    out = []
    for r in conn.execute(sql, args):
        d = dict(r)
        d["metros"] = json.loads(d["metros"] or "[]")
        d["remote"] = bool(d["remote"])
        out.append(d)
    return out


def set_status(conn, job_id: str, status: str) -> bool:
    if status not in STATUSES:
        raise ValueError(f"unknown status: {status}")
    cur = conn.execute("UPDATE jobs SET status=? WHERE job_id=?", (status, job_id))
    conn.commit()
    return cur.rowcount > 0


def stats(conn) -> dict:
    total = conn.execute(f"SELECT COUNT(*) c FROM jobs WHERE status!='dismissed' AND {LIVE}").fetchone()["c"]
    by_status = {r["status"]: r["c"] for r in conn.execute(
        f"SELECT status, COUNT(*) c FROM jobs WHERE {LIVE} GROUP BY status")}
    runs = [dict(r) for r in conn.execute(
        "SELECT * FROM source_runs ORDER BY source")]
    by_metro: dict[str, int] = {}
    for r in conn.execute(f"SELECT metros FROM jobs WHERE status!='dismissed' AND {LIVE}"):
        for m in json.loads(r["metros"] or "[]"):
            by_metro[m] = by_metro.get(m, 0) + 1
    return {"total": total, "by_status": by_status,
            "by_metro": by_metro, "sources": runs}
