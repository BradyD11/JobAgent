# JobAgent

## What it is
A local-first aggregator that pulls SWE internship listings from four job boards
(Simplify, LinkedIn, Jobright, Work at a Startup), filters them to five target
metros, de-duplicates across boards, and presents them in a triage dashboard.
A companion Chrome extension autofills application forms from a saved profile.

## Who it is for
One person — a CS student running a self-directed internship search. Single
user, runs on their own machine, no accounts, no hosting.

## The job to be done
Turn ~500 raw listings into a short list of applications sent. The daily loop is:
open the dashboard, see what is new, scan fast, dismiss noise, apply to the good
ones without retyping the same twenty fields.

## Truths that shape the design
- **Volume is the problem.** ~500 active jobs at any time; the SF Bay Area alone
  carries ~250. Density beats decoration.
- **Triage is the primary verb.** Most rows get dismissed. Dismissing must be
  cheaper than reading.
- **Status is durable.** Marking a job applied survives every later scrape.
- **Sources are unequal.** Simplify supplies ~85% of listings; Jobright and Work
  at a Startup contribute a handful each and are best-effort.
- **Data is imperfect.** Salary, summary, and posted date are often missing.
  Every field must degrade without leaving a hole in the layout.

## Constraints
- Runs at localhost, offline-capable against a local SQLite database.
- No credentials for any job board; only public, unauthenticated endpoints.
- The extension fills forms but never submits them — the user reviews and sends.

## Success
A day's listings triaged in a couple of minutes, and an application filled in
one click instead of ten minutes of retyping.
