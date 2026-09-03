"""Local dashboard + the API the Chrome extension reads the profile from."""

import json
import threading
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from . import store
from .aggregator import scrape, SOURCES
from .config import METROS, REFRESH_AFTER_HOURS

ROOT = Path(__file__).resolve().parent.parent
PROFILE_PATH = ROOT / "profile.json"

app = Flask(__name__, static_folder=str(ROOT / "web"), static_url_path="")

# Guards against overlapping scrapes when several tabs load at once.
_scrape_lock = threading.Lock()
_scrape_state = {"running": False, "last": None}


@app.after_request
def cors(resp):
    """The extension calls this API from the page it is autofilling."""
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return resp


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/api/jobs")
def api_jobs():
    conn = store.connect()
    try:
        jobs = store.query_jobs(
            conn,
            metro=request.args.get("metro"),
            status=request.args.get("status"),
            source=request.args.get("source"),
            search=request.args.get("q"),
            days=request.args.get("days"),
            limit=int(request.args.get("limit", 1000)),
        )
        return jsonify({"jobs": jobs, "count": len(jobs)})
    finally:
        conn.close()


@app.route("/api/stats")
def api_stats():
    conn = store.connect()
    try:
        s = store.stats(conn)
        s["metros"] = list(METROS)
        s["sources_available"] = list(SOURCES)
        s["scraping"] = _scrape_state["running"]
        return jsonify(s)
    finally:
        conn.close()


@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    """Refresh sources. `stale_only` is what the dashboard sends on load."""
    stale_only = request.json.get("stale_only", False) if request.is_json else False
    only = request.json.get("sources") if request.is_json else None

    if not _scrape_lock.acquire(blocking=False):
        return jsonify({"ok": False, "error": "a scrape is already running"}), 409
    try:
        _scrape_state["running"] = True
        report = scrape(only=only, stale_only=stale_only)
        _scrape_state["last"] = report
        return jsonify({"ok": True, "report": report})
    finally:
        _scrape_state["running"] = False
        _scrape_lock.release()


@app.route("/api/jobs/<job_id>/status", methods=["POST"])
def api_status(job_id):
    status = (request.json or {}).get("status", "")
    conn = store.connect()
    try:
        ok = store.set_status(conn, job_id, status)
        return jsonify({"ok": ok}), (200 if ok else 404)
    except ValueError as e:
        return jsonify({"ok": False, "error": str(e)}), 400
    finally:
        conn.close()


# Keys the extension is allowed to write back. Anything else it offers is
# ignored, so a bad rule on the client can never invent profile fields or
# smuggle in something sensitive.
LEARNABLE_KEYS = {
    "first_name", "last_name", "full_name", "email", "phone",
    "address", "city", "state", "zip", "country",
    "linkedin", "github", "portfolio",
    "school", "degree", "major", "gpa",
    "graduation_month", "graduation_year",
    "work_authorized", "requires_sponsorship",
    "gender", "race", "veteran_status", "disability_status",
    "start_date", "how_did_you_hear",
}

# A learned value longer than this is almost certainly an essay, not a field.
MAX_LEARNED_LEN = 200


def _read_profile() -> dict:
    if not PROFILE_PATH.exists():
        return {}
    try:
        return json.loads(PROFILE_PATH.read_text())
    except json.JSONDecodeError:
        return {}


@app.route("/api/profile")
def api_profile():
    """Served to the extension so autofill has values to type."""
    if not PROFILE_PATH.exists():
        return jsonify({"error": "no profile.json",
                        "hint": "copy profile.example.json to profile.json"}), 404
    return jsonify(_read_profile())


@app.route("/api/profile/learn", methods=["POST"])
def api_profile_learn():
    """Merge values the user typed into a form back into profile.json.

    A blank field is filled from what was observed. A field that already holds
    a value is only replaced when the client marks it a correction -- the user
    edited a value we had autofilled -- so a stale answer can be fixed by
    typing over it, while an unrelated form never clobbers a known value.
    """
    body = request.json or {}
    incoming = body.get("values") or {}
    corrections = set(body.get("corrected") or [])
    profile = _read_profile()

    learned, corrected, ignored = {}, {}, []
    for key, value in incoming.items():
        if key not in LEARNABLE_KEYS or not isinstance(value, str):
            ignored.append(key)
            continue
        value = value.strip()
        if not value or len(value) > MAX_LEARNED_LEN:
            ignored.append(key)
            continue

        existing = str(profile.get(key, "")).strip()
        if not existing:
            profile[key] = value
            learned[key] = value
        elif existing != value and key in corrections:
            profile[key] = value
            corrected[key] = value

    if learned or corrected:
        _write_profile(profile)
    return jsonify({"ok": True, "learned": learned,
                    "corrected": corrected, "ignored": ignored})


@app.route("/api/profile/set", methods=["POST"])
def api_profile_set():
    """Set or clear one profile field deliberately (popup edit / forget)."""
    body = request.json or {}
    key = body.get("key")
    if key not in LEARNABLE_KEYS:
        return jsonify({"ok": False, "error": f"not a profile field: {key}"}), 400

    value = body.get("value", "")
    if not isinstance(value, str) or len(value) > MAX_LEARNED_LEN:
        return jsonify({"ok": False, "error": "invalid value"}), 400

    profile = _read_profile()
    profile[key] = value.strip()
    _write_profile(profile)
    return jsonify({"ok": True, "key": key, "value": profile[key]})


def _write_profile(profile: dict) -> None:
    """Write atomically, so an interrupted write cannot truncate the file."""
    tmp = PROFILE_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(profile, indent=2) + "\n")
    tmp.replace(PROFILE_PATH)


def main():
    import argparse
    p = argparse.ArgumentParser(description="JobAgent dashboard")
    p.add_argument("--port", type=int, default=5137)
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args()
    print(f"\n  JobAgent  ->  http://{args.host}:{args.port}")
    print(f"  Sources auto-refresh when older than {REFRESH_AFTER_HOURS}h\n")
    app.run(host=args.host, port=args.port, debug=False)


if __name__ == "__main__":
    main()
