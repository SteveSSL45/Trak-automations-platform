"""Pull yesterday's GSC top queries + landing pages.

Run:
  python -m ingest.gsc <client-id> --site <gsc-property>

Where <gsc-property> is the GSC property URL exactly as registered:
  - URL-prefix property:  https://example.com/
  - Domain property:      sc-domain:example.com

Yesterday is GSC's most recent reliable date (today is partial / lagged).
"""
from __future__ import annotations

import argparse
import datetime as dt
import sys

from googleapiclient.discovery import build

from ._common import load_credentials, open_db

SCHEMA = """
CREATE TABLE IF NOT EXISTS gsc_daily (
    fetched_on         DATE NOT NULL,
    activity_date      DATE NOT NULL,
    dimension          TEXT NOT NULL,    -- 'query' or 'page'
    key                TEXT NOT NULL,    -- the query string or page URL
    clicks             INTEGER NOT NULL,
    impressions        INTEGER NOT NULL,
    ctr                REAL    NOT NULL,
    position           REAL    NOT NULL,
    site_url           TEXT    NOT NULL,
    PRIMARY KEY (activity_date, dimension, key, site_url)
);

CREATE INDEX IF NOT EXISTS idx_gsc_date  ON gsc_daily(activity_date);
CREATE INDEX IF NOT EXISTS idx_gsc_dim   ON gsc_daily(dimension);
"""


def fetch_dimension(service, site_url: str, day: dt.date, dimension: str) -> list[dict]:
    body = {
        "startDate": day.isoformat(),
        "endDate": day.isoformat(),
        "dimensions": [dimension],
        "rowLimit": 500,
    }
    resp = service.searchanalytics().query(siteUrl=site_url, body=body).execute()
    return resp.get("rows", [])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("client_id", help="TRAK client id (e.g. trak-automations)")
    ap.add_argument(
        "--site",
        required=True,
        help="GSC property URL (e.g. sc-domain:example.com or https://example.com/)",
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

    print(f"GSC ingest · client={args.client_id} · site={args.site} · date={target_day}")

    creds = load_credentials(args.client_id, "gsc")
    service = build("searchconsole", "v1", credentials=creds, cache_discovery=False)

    db = open_db(args.client_id, "gsc")
    db.executescript(SCHEMA)

    total = 0
    for dimension in ("query", "page"):
        rows = fetch_dimension(service, args.site, target_day, dimension)
        for r in rows:
            key = r["keys"][0]
            db.execute(
                "INSERT OR REPLACE INTO gsc_daily VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    fetched_on.isoformat(),
                    target_day.isoformat(),
                    dimension,
                    key,
                    int(r.get("clicks", 0)),
                    int(r.get("impressions", 0)),
                    float(r.get("ctr", 0)),
                    float(r.get("position", 0)),
                    args.site,
                ),
            )
        print(f"  {dimension}: {len(rows)} rows")
        total += len(rows)

    db.commit()
    db.close()
    print(f"Wrote {total} rows. DB: clients/{args.client_id}/gsc_snapshots.db")
    return 0


if __name__ == "__main__":
    sys.exit(main())
