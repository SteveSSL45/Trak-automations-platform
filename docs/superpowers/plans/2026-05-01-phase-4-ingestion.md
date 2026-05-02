# Phase 4: Python Ingestion Workers (GSC + GA4) — Implementation Plan

> Same execution pattern as Phases 1-3.

**Goal:** Two standalone Python scripts that pull yesterday's GSC + GA4 data for any pilot client and write the rows into per-client SQLite snapshots. Run from the CLI; no UI, no cron, no orchestrator. **Phase 4 done = you can run `python workers/ingest/gsc.py trak-automations` and `python workers/ingest/ga4.py trak-automations` and inspect the resulting `.db` files with `sqlite3`.**

**Architecture:**
- `workers/` is a Python package with its own venv. Independent of the Tauri app.
- Token bridge: Tauri's OAuth code (Phase 3) gets a new step that writes a per-client `credentials_<provider>.json` file alongside the Stronghold persist. Python reads that file via `google-auth`, which auto-refreshes access tokens from the long-lived refresh_token.
- Each ingest script: opens SQLite, calls Google API, inserts rows in idempotent upsert pattern (re-running same day overwrites that day's snapshot, doesn't dupe).
- No swarm, no analysis. Pure data ingestion.

**Out of scope:**
- Ahrefs / backlinks / crawl / PageSpeed (Phase 4 v1.5)
- daily_run.py orchestrator (Phase 5+)
- Last-ingestion timestamp in the dashboard UI (Phase 5+)
- launchd cron (Phase 7)
- "Live" data refresh button in the UI (later)

---

## Pre-flight

```bash
python3.11 --version    # need 3.11+
ls clients/trak-automations/credentials_gsc.json   # written by Tauri OAuth flow (after Phase 3 + the bridge added in Group A below)
```

If `credentials_gsc.json` doesn't exist yet, that's expected — Group A adds the bridge, then you re-do the OAuth grant once to write it.

---

## Group A — Token bridge (Tauri-side)

### Task A.1: Tauri writes credentials_<provider>.json on OAuth grant

**Files:**
- Modify: `apps/dashboard/src/state/stronghold-session.ts` (or new helper next to it)

When the `oauth:store-token` event fires (or in the same JS callback), additionally write a JSON file at `clients/<client-id>/credentials_<provider>.json` containing:

```json
{
  "client_id": "...",
  "client_secret": "...",
  "refresh_token": "...",
  "scopes": ["https://www.googleapis.com/auth/webmasters.readonly", ...]
}
```

Implementation:
- Use `@tauri-apps/plugin-fs` to write the file (need to add the plugin + capability scope for the project's `clients/` dir)
- OR — simpler — add a Rust command `write_credentials_for_python(client_id, provider, blob)` that takes the blob and writes the relevant fields to disk

**Going with the Rust approach** — keeps the JS side stateless, avoids adding the fs plugin just for this.

- [ ] Add `write_credentials_for_python` Tauri command
- [ ] Wire it into the existing `oauth:store-token` event handler in `stronghold-session.ts`
- [ ] Re-grant Trak Automations × GSC + GA4 to populate the files
- [ ] Commit

---

## Group B — Python venv + project structure

### Task B.1: Create workers/ Python package

**Files:**
- Create: `workers/pyproject.toml`
- Create: `workers/.python-version` (just "3.11")
- Create: `workers/ingest/__init__.py`
- Create: `workers/ingest/_common.py` (shared helpers — load credentials, open SQLite)

```toml
# workers/pyproject.toml
[project]
name = "trak-workers"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "google-auth>=2.30",
    "google-auth-oauthlib>=1.2",
    "google-api-python-client>=2.150",
]
```

- [ ] **Step 1: Create venv**

```bash
cd workers
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e .   # install in editable mode using pyproject.toml
```

- [ ] **Step 2: Add `workers/.venv/` to gitignore** (probably already covered by root `.venv/`)

- [ ] **Step 3: Commit**

---

### Task B.2: Shared helpers (`workers/ingest/_common.py`)

```python
import json
import sqlite3
from pathlib import Path
from typing import Any
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

REPO_ROOT = Path(__file__).resolve().parents[2]
CLIENTS_DIR = REPO_ROOT / "clients"

def load_credentials(client_id: str, provider: str) -> Credentials:
    path = CLIENTS_DIR / client_id / f"credentials_{provider}.json"
    if not path.exists():
        raise FileNotFoundError(f"missing {path} — run the OAuth flow in the dashboard first")
    raw = json.loads(path.read_text())
    creds = Credentials(
        token=None,  # access_token; google-auth will refresh from refresh_token
        refresh_token=raw["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=raw["client_id"],
        client_secret=raw["client_secret"],
        scopes=raw.get("scopes", []),
    )
    creds.refresh(Request())
    return creds

def open_db(client_id: str, source: str) -> sqlite3.Connection:
    db_path = CLIENTS_DIR / client_id / f"{source}_snapshots.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")  # per master spec — multi-reader friendly
    return conn
```

- [ ] Commit

---

## Group C — GSC ingest

### Task C.1: workers/ingest/gsc.py

Pulls yesterday's queries + landing pages + positions for a given client. Writes to `clients/<id>/gsc_snapshots.db`.

```python
"""Pull yesterday's GSC top queries + pages."""
import argparse
import datetime as dt
from googleapiclient.discovery import build
from ._common import load_credentials, open_db

SCHEMA = """
CREATE TABLE IF NOT EXISTS gsc_daily (
    fetched_on  DATE NOT NULL,
    query_or_page_date DATE NOT NULL,
    dimension   TEXT NOT NULL,    -- "query" or "page"
    key         TEXT NOT NULL,    -- query string or page URL
    clicks      INTEGER NOT NULL,
    impressions INTEGER NOT NULL,
    ctr         REAL NOT NULL,
    position    REAL NOT NULL,
    PRIMARY KEY (query_or_page_date, dimension, key)
);
CREATE INDEX IF NOT EXISTS idx_gsc_date ON gsc_daily(query_or_page_date);
"""

def fetch_dimension(service, site_url: str, day: dt.date, dimension: str):
    body = {
        "startDate": day.isoformat(),
        "endDate": day.isoformat(),
        "dimensions": [dimension],
        "rowLimit": 500,
    }
    return service.searchanalytics().query(siteUrl=site_url, body=body).execute().get("rows", [])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("client_id")
    ap.add_argument("--site", required=True, help="GSC property URL, e.g. sc-domain:trakautomations.com")
    args = ap.parse_args()

    creds = load_credentials(args.client_id, "gsc")
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)

    yesterday = dt.date.today() - dt.timedelta(days=1)
    fetched = dt.date.today()

    db = open_db(args.client_id, "gsc")
    db.executescript(SCHEMA)

    for dimension in ("query", "page"):
        rows = fetch_dimension(service, args.site, yesterday, dimension)
        for r in rows:
            key = r["keys"][0]
            db.execute(
                "INSERT OR REPLACE INTO gsc_daily VALUES (?,?,?,?,?,?,?,?)",
                (fetched, yesterday, dimension, key,
                 int(r.get("clicks", 0)), int(r.get("impressions", 0)),
                 float(r.get("ctr", 0)), float(r.get("position", 0))),
            )
        print(f"  {dimension}: {len(rows)} rows")

    db.commit()
    db.close()
    print(f"Wrote clients/{args.client_id}/gsc_snapshots.db")

if __name__ == "__main__":
    main()
```

Run: `python -m workers.ingest.gsc trak-automations --site sc-domain:trakautomations.com`

- [ ] Implement
- [ ] Run + verify rows in SQLite (`sqlite3 clients/trak-automations/gsc_snapshots.db "SELECT count(*) FROM gsc_daily"`)
- [ ] Commit

---

## Group D — GA4 ingest

### Task D.1: workers/ingest/ga4.py

Pulls yesterday's top landing pages + conversion events. Needs the GA4 **property ID** (numeric, looks like `123456789`) — different from the property name shown in the GA4 admin UI.

```python
"""Pull yesterday's GA4 top landing pages + conversions."""
import argparse
import datetime as dt
from googleapiclient.discovery import build
from ._common import load_credentials, open_db

SCHEMA = """
CREATE TABLE IF NOT EXISTS ga4_daily (
    fetched_on   DATE NOT NULL,
    activity_date DATE NOT NULL,
    metric_kind  TEXT NOT NULL,   -- "landing_page" or "conversion"
    key          TEXT NOT NULL,   -- page URL or event name
    sessions     INTEGER,
    users        INTEGER,
    conversions  INTEGER,
    PRIMARY KEY (activity_date, metric_kind, key)
);
"""

def fetch_landing_pages(creds, property_id: str, day: dt.date):
    # GA4 Data API runs through analyticsdata.googleapis.com
    from googleapiclient.discovery import build as build_data
    service = build_data("analyticsdata", "v1beta", credentials=creds, cache_discovery=False)
    body = {
        "dateRanges": [{"startDate": day.isoformat(), "endDate": day.isoformat()}],
        "dimensions": [{"name": "landingPage"}],
        "metrics": [{"name": "sessions"}, {"name": "totalUsers"}],
        "limit": 200,
    }
    resp = service.properties().runReport(
        property=f"properties/{property_id}", body=body
    ).execute()
    return resp.get("rows", [])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("client_id")
    ap.add_argument("--property-id", required=True, help="GA4 property ID (numeric)")
    args = ap.parse_args()

    creds = load_credentials(args.client_id, "ga4")
    yesterday = dt.date.today() - dt.timedelta(days=1)
    fetched = dt.date.today()

    db = open_db(args.client_id, "ga4")
    db.executescript(SCHEMA)

    rows = fetch_landing_pages(creds, args.property_id, yesterday)
    for r in rows:
        page = r["dimensionValues"][0]["value"]
        sessions = int(r["metricValues"][0]["value"])
        users = int(r["metricValues"][1]["value"])
        db.execute(
            "INSERT OR REPLACE INTO ga4_daily VALUES (?,?,?,?,?,?,?)",
            (fetched, yesterday, "landing_page", page, sessions, users, None),
        )
    print(f"  landing_pages: {len(rows)} rows")
    db.commit()
    db.close()
    print(f"Wrote clients/{args.client_id}/ga4_snapshots.db")

if __name__ == "__main__":
    main()
```

Run: `python -m workers.ingest.ga4 trak-automations --property-id 123456789`

GA4 conversion events left as a follow-up — adds an extra dimension (`eventName`) to the report and filters for events where `isConversionEvent = true`. Skipped for thin slice.

- [ ] Implement
- [ ] Run + verify rows
- [ ] Commit

---

## Final verification

- [ ] `clients/trak-automations/credentials_gsc.json` and `..._ga4.json` exist after re-doing OAuth grant
- [ ] `python -m workers.ingest.gsc trak-automations --site sc-domain:trakautomations.com` runs cleanly, prints row counts, creates `clients/trak-automations/gsc_snapshots.db`
- [ ] `python -m workers.ingest.ga4 trak-automations --property-id <id>` ditto for `ga4_snapshots.db`
- [ ] `sqlite3 clients/trak-automations/gsc_snapshots.db "SELECT * FROM gsc_daily LIMIT 5"` returns real rows
- [ ] All commits scoped (no `.venv/`, no `*.db`, no `credentials_*.json` in git — verify with `git status`)

---

## Self-review

**Spec coverage:** Master spec § Phase 4 wants 6 ingest sources. This thin slice does 2 (GSC + GA4). The other 4 (Ahrefs, backlinks, crawl, PageSpeed) defer to Phase 4 v1.5. Architecture (Python under `workers/`, per-client SQLite, OAuth via shared file) is established now so adding more is just more `workers/ingest/<source>.py` files.

**Token bridge tradeoff:** Writing `credentials_<provider>.json` to the operator's filesystem trades Stronghold's encryption-at-rest for simpler Python integration. Risk: if someone steals the laptop they get refresh tokens. Same risk as Stronghold under most threat models (the master password could be brute-forced or shoulder-surfed). Phase 7+ can move Python through a Tauri-mediated token-fetch endpoint if the threat model tightens.

**Out-of-scope discipline:** No swarm, no orchestrator, no UI. Phase 5 builds on top of these SQLite snapshots.
