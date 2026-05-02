"""Pull yesterday's GA4 top landing pages.

Run:
  python -m ingest.ga4 <client-id> --property-id <numeric-id>

Find the numeric property ID in GA4 Admin → Property → Property Settings
(top right). It looks like "123456789", not the friendly property name.

Phase 4 thin slice covers landing-page sessions/users only. Conversion
events come in a follow-up — they need an extra dimension (eventName)
filtered to isConversionEvent.
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys

from googleapiclient.discovery import build

from ._common import load_credentials, open_db

SCHEMA = """
CREATE TABLE IF NOT EXISTS ga4_daily (
    fetched_on    DATE NOT NULL,
    activity_date DATE NOT NULL,
    metric_kind   TEXT NOT NULL,    -- 'landing_page' (more later)
    key           TEXT NOT NULL,
    sessions      INTEGER,
    users         INTEGER,
    property_id   TEXT NOT NULL,
    PRIMARY KEY (activity_date, metric_kind, key, property_id)
);

CREATE INDEX IF NOT EXISTS idx_ga4_date  ON ga4_daily(activity_date);
CREATE INDEX IF NOT EXISTS idx_ga4_kind  ON ga4_daily(metric_kind);
"""


def fetch_landing_pages(creds, property_id: str, day: dt.date) -> list[dict]:
    service = build("analyticsdata", "v1beta", credentials=creds, cache_discovery=False)
    body = {
        "dateRanges": [{"startDate": day.isoformat(), "endDate": day.isoformat()}],
        "dimensions": [{"name": "landingPage"}],
        "metrics": [{"name": "sessions"}, {"name": "totalUsers"}],
        "limit": 200,
    }
    resp = (
        service.properties()
        .runReport(property=f"properties/{property_id}", body=body)
        .execute()
    )
    return resp.get("rows", [])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("client_id", help="TRAK client id (e.g. trak-automations)")
    ap.add_argument(
        "--property-id",
        required=True,
        help="GA4 property ID (numeric — see GA4 Admin → Property Settings)",
    )
    ap.add_argument(
        "--date",
        default=None,
        help="ISO date to fetch (defaults to yesterday)",
    )
    args = ap.parse_args()

    target_day = (
        dt.date.fromisoformat(args.date) if args.date else dt.date.today() - dt.timedelta(days=1)
    )
    fetched_on = dt.date.today()

    print(
        f"GA4 ingest · client={args.client_id} · property={args.property_id} · date={target_day}"
    )

    creds = load_credentials(args.client_id, "ga4")

    db = open_db(args.client_id, "ga4")
    db.executescript(SCHEMA)

    rows = fetch_landing_pages(creds, args.property_id, target_day)
    for r in rows:
        page = r["dimensionValues"][0]["value"]
        sessions = int(r["metricValues"][0]["value"])
        users = int(r["metricValues"][1]["value"])
        db.execute(
            "INSERT OR REPLACE INTO ga4_daily VALUES (?,?,?,?,?,?,?)",
            (
                fetched_on.isoformat(),
                target_day.isoformat(),
                "landing_page",
                page,
                sessions,
                users,
                args.property_id,
            ),
        )
    print(f"  landing_page: {len(rows)} rows")

    db.commit()
    db.close()
    print(f"Wrote {len(rows)} rows. DB: clients/{args.client_id}/ga4_snapshots.db")
    return 0


if __name__ == "__main__":
    sys.exit(main())
