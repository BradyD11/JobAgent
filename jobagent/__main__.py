"""CLI: python -m jobagent {scrape,list,serve,stats}"""

import argparse
import json
import sys

from . import store
from .aggregator import scrape, SOURCES


def cmd_scrape(args):
    report = scrape(only=args.sources, stale_only=args.stale_only)
    for name, r in sorted(report["sources"].items()):
        mark = "ok  " if r.get("ok") else "FAIL"
        detail = r.get("count", r.get("error", ""))
        print(f"  {mark} {name:16} {detail}")
    if report["skipped"]:
        print(f"  skipped (fresh): {', '.join(report['skipped'])}")
    print(f"\n  {report.get('raw', 0)} raw -> {report['total']} unique "
          f"({report['new']} new, {report['updated']} updated)")


def cmd_list(args):
    conn = store.connect()
    jobs = store.query_jobs(conn, metro=args.metro, status=args.status,
                            source=args.source, search=args.q,
                            days=args.days, limit=args.limit)
    if args.json:
        print(json.dumps(jobs, indent=2))
        return
    if not jobs:
        print("  no matching jobs")
        return
    for j in jobs:
        metros = ", ".join(j["metros"])
        print(f"  {j['company'][:24]:26} {j['title'][:46]:48} {metros[:22]:24} "
              f"{j['posted'] or '':10} {j['source'][:18]}")
    print(f"\n  {len(jobs)} jobs")


def cmd_stats(args):
    s = store.stats(store.connect())
    print(f"  total: {s['total']}")
    print("  by metro: " + ", ".join(f"{k} {v}" for k, v in sorted(s["by_metro"].items())))
    print("  by status: " + ", ".join(f"{k} {v}" for k, v in sorted(s["by_status"].items())))
    print("  sources:")
    for r in s["sources"]:
        mark = "ok  " if r["ok"] else "FAIL"
        print(f"    {mark} {r['source']:16} {r['job_count']:5}  {r['ran_at']}"
              + (f"  {r['error']}" if r["error"] else ""))


def cmd_serve(args):
    from .server import app
    print(f"\n  JobAgent  ->  http://127.0.0.1:{args.port}\n")
    app.run(host="127.0.0.1", port=args.port)


def main():
    p = argparse.ArgumentParser(prog="jobagent")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("scrape", help="fetch from all job boards")
    s.add_argument("--sources", nargs="*", choices=list(SOURCES))
    s.add_argument("--stale-only", action="store_true",
                   help="skip sources refreshed recently")
    s.set_defaults(fn=cmd_scrape)

    l = sub.add_parser("list", help="list stored jobs")
    l.add_argument("--metro")
    l.add_argument("--status")
    l.add_argument("--source")
    l.add_argument("-q", help="search title/company")
    l.add_argument("--days", type=int)
    l.add_argument("--limit", type=int, default=100)
    l.add_argument("--json", action="store_true")
    l.set_defaults(fn=cmd_list)

    t = sub.add_parser("stats", help="summary of the database")
    t.set_defaults(fn=cmd_stats)

    v = sub.add_parser("serve", help="run the dashboard")
    v.add_argument("--port", type=int, default=5137)
    v.set_defaults(fn=cmd_serve)

    args = p.parse_args()
    sys.exit(args.fn(args) or 0)


if __name__ == "__main__":
    main()
