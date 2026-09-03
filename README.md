# JobAgent

Got tired of swapping between job boards so this 
aggregates SWE internships from four job boards into one triage list, and
autofills the applications.

Targets **SF Bay Area, NYC, Seattle, Austin, LA**.

## Setup

```bash
pip3 install -r requirements.txt
cp profile.example.json profile.json   # starts empty; the extension fills it in
python3 -m jobagent serve
```

You can edit `profile.json` by hand at any time, but you do not have to — the
extension learns your details from the first application you fill in.

Open <http://127.0.0.1:5137>. Sources refresh automatically when older than
6 hours; the Refresh button forces a full pull.

### The Chrome extension

1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the `extension/` folder.
3. On any application page, click the JobAgent icon → **Fill this application**.

The extension reads `profile.json` from the local server, so keep the server
running. It **never submits** a form — you review and send.

### It learns as you apply

`profile.json` starts empty on purpose. Fill in an application by hand and the
extension remembers each answer — work authorization, sponsorship, veteran and
disability status, school, GPA, links — so the next application is already
filled. The popup lists everything it has remembered, with an × to forget any
value.

- **Blanks are filled from what you type.** Nothing is asked; it just learns.
- **Typing over an autofilled value corrects it.** A stale answer is fixed by
  editing it once on any form.
- **An unrelated form cannot clobber a known value** — only an edit you make to
  a field the extension itself filled counts as a correction.
- **Never learned:** passwords, SSNs and government IDs, payment details,
  salary expectations, and free-text essays. The same guard that blocks those
  from being filled blocks them from being read.
- Values learned while the server is down are queued and saved next time.

Covers Greenhouse, Lever, Ashby, Workday, Workable, SmartRecruiters, iCIMS,
Jobvite, BambooHR, Breezy, Rippling and tal.net.

## Sources

| Source | How it is read | Yield |
|---|---|---|
| **Simplify** | Public JSON feed from the Pitt CSC / Simplify GitHub repo | ~430 |
| **LinkedIn** | Public guest job-search endpoint — no login, no stored credentials | ~115 |
| **Work at a Startup** | Jobs embedded in the page's Inertia payload | ~3 |
| **Jobright** | Server-rendered `__NEXT_DATA__` | ~1 |

Simplify does most of the work. Jobright and Work at a Startup gate real search
behind a login and ignore their own query filters on public pages, so they
contribute a handful of listings each — everything they return is re-filtered
locally rather than trusted. A source that fails is reported in the footer;
the others still run.

Nothing here uses your credentials or an authenticated session.

## CLI

```bash
python3 -m jobagent scrape                 # pull from every source
python3 -m jobagent scrape --stale-only    # skip sources fetched recently
python3 -m jobagent list --metro NYC       # filter the stored list
python3 -m jobagent list -q stripe --json
python3 -m jobagent stats                  # counts and per-source health
```

## How filtering works

A listing is kept when the title reads as software engineering, the posting is
an internship, and the location matches one of the five metros. Titles like
"Sales Engineer", "Mechanical Engineer" and "Engineering Manager" are excluded;
"Newark, CA" and "Newark, NJ" resolve to different metros. The same role posted
to two boards collapses into one row, tagged with both sources.

Marking a job saved, applied or dismissed survives every later scrape.

## Layout

```
jobagent/          scraping, matching, storage, Flask server
  sources/         one module per job board
web/               dashboard (vanilla JS, no build step)
extension/         Chrome MV3 autofill
data/jobs.db       SQLite, created on first run
profile.json       your details — starts empty, learned as you apply (gitignored)
```
