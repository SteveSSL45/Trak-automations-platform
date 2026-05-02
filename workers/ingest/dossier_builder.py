"""Build a daily dossier JSON from per-client SQLite snapshots.

This is the single input to the 8-stage swarm chain. Schema:
docs/superpowers/specs/2026-05-01-dossier-schema.md

Run:
  python -m ingest.dossier_builder <client-id> [--date YYYY-MM-DD]

Reads:  clients/<id>/gsc_snapshots.db, ga4_snapshots.db
Writes: clients/<id>/dossiers/<date>.json

Phase 5 thin slice: GSC daily + weekly + GA4 daily. Backlinks / crawl /
PageSpeed / competitors sit as null placeholders until Phase 4 v1.5.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

from ._common import CLIENTS_DIR, db_path

SCHEMA_VERSION = "0.1"
TOP_N = 25
WEEKLY_TOP_N = 15

# Per-client metadata. Phase 1 hardcoded these in apps/dashboard/src/lib/clients.ts;
# Phase 5 mirrors here. Phase 3 (per-client OAuth) implies the operator manages a list,
# so eventually this lives in clients/<id>/client_config.json (Phase 3 v1.5+).
CLIENT_META: dict[str, dict[str, str]] = {
    "trak-automations": {
        "name": "Trak Automations",
        "domain": "trakautomations.com",
        "industry": "AI/automation agency (eat-your-own-dog-food)",
    },
    "lawn-care-co": {
        "name": "Lawn Care Co.",
        "domain": "lawncare-pilot.com",
        "industry": "Lawn care + landscaping (Genesee County)",
    },
    "home-improvement-co": {
        "name": "Home Improvement Co.",
        "domain": "homeimprovement-pilot.com",
        "industry": "Home remodeling + handyman (Genesee County)",
    },
}


def _has_table(conn: sqlite3.Connection, table: str) -> bool:
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    )
    return cur.fetchone() is not None


def _last_fetch_date(conn: sqlite3.Connection, table: str) -> str | None:
    if not _has_table(conn, table):
        return None
    cur = conn.execute(f"SELECT max(fetched_on) FROM {table}")
    row = cur.fetchone()
    return row[0] if row and row[0] else None


def build_gsc_daily(conn: sqlite3.Connection, target_day: dt.date) -> dict[str, Any] | None:
    if not _has_table(conn, "gsc_daily"):
        return None
    site_row = conn.execute(
        "SELECT site_url FROM gsc_daily WHERE activity_date=? LIMIT 1",
        (target_day.isoformat(),),
    ).fetchone()
    site_url = site_row[0] if site_row else None

    queries = conn.execute(
        """SELECT key, clicks, impressions, ctr, position
           FROM gsc_daily
           WHERE activity_date=? AND dimension='query'
           ORDER BY clicks DESC, impressions DESC
           LIMIT ?""",
        (target_day.isoformat(), TOP_N),
    ).fetchall()
    pages = conn.execute(
        """SELECT key, clicks, impressions, ctr, position
           FROM gsc_daily
           WHERE activity_date=? AND dimension='page'
           ORDER BY clicks DESC, impressions DESC
           LIMIT ?""",
        (target_day.isoformat(), TOP_N),
    ).fetchall()

    totals_row = conn.execute(
        """SELECT
             COALESCE(sum(clicks),0),
             COALESCE(sum(impressions),0),
             COALESCE(avg(position),0)
           FROM gsc_daily WHERE activity_date=? AND dimension='query'""",
        (target_day.isoformat(),),
    ).fetchone()

    return {
        "date": target_day.isoformat(),
        "site_url": site_url,
        "top_queries": [
            {"query": q, "clicks": c, "impressions": i, "ctr": ctr, "position": p}
            for q, c, i, ctr, p in queries
        ],
        "top_pages": [
            {"page": k, "clicks": c, "impressions": i, "ctr": ctr, "position": p}
            for k, c, i, ctr, p in pages
        ],
        "totals": {
            "clicks": int(totals_row[0]),
            "impressions": int(totals_row[1]),
            "avg_position": float(totals_row[2]),
        },
    }


def build_gsc_weekly(conn: sqlite3.Connection, target_day: dt.date) -> dict[str, Any] | None:
    if not _has_table(conn, "gsc_daily"):
        return None
    week_start = target_day - dt.timedelta(days=6)
    prev_window_end = week_start - dt.timedelta(days=1)
    prev_window_start = prev_window_end - dt.timedelta(days=6)

    # Aggregate current 7d per query
    current = conn.execute(
        """SELECT key,
                  sum(clicks)      AS clicks_7d,
                  sum(impressions) AS impressions_7d,
                  avg(position)    AS avg_pos
           FROM gsc_daily
           WHERE dimension='query' AND activity_date BETWEEN ? AND ?
           GROUP BY key""",
        (week_start.isoformat(), target_day.isoformat()),
    ).fetchall()

    # Aggregate previous 7d per query
    previous_rows = conn.execute(
        """SELECT key, avg(position) AS avg_pos
           FROM gsc_daily
           WHERE dimension='query' AND activity_date BETWEEN ? AND ?
           GROUP BY key""",
        (prev_window_start.isoformat(), prev_window_end.isoformat()),
    ).fetchall()
    previous = {row[0]: row[1] for row in previous_rows}

    gainers: list[dict[str, Any]] = []
    losers: list[dict[str, Any]] = []
    striking: list[dict[str, Any]] = []
    for key, clicks_7d, imp_7d, cur_pos in current:
        prev_pos = previous.get(key)
        if prev_pos is not None:
            delta = cur_pos - prev_pos  # negative = improved
            entry = {
                "query": key,
                "position_delta": float(delta),
                "current_position": float(cur_pos),
                "previous_position": float(prev_pos),
                "clicks_7d": int(clicks_7d),
            }
            if delta < -1.0:
                gainers.append(entry)
            elif delta > 1.0:
                losers.append(entry)
        if 4.0 <= cur_pos <= 15.0 and imp_7d >= 50:
            striking.append(
                {
                    "query": key,
                    "current_position": float(cur_pos),
                    "impressions_7d": int(imp_7d),
                    "clicks_7d": int(clicks_7d),
                }
            )

    gainers.sort(key=lambda r: r["position_delta"])  # most negative first
    losers.sort(key=lambda r: -r["position_delta"])  # most positive first
    striking.sort(key=lambda r: -r["impressions_7d"])

    totals_row = conn.execute(
        """SELECT
             COALESCE(sum(clicks),0),
             COALESCE(sum(impressions),0),
             COALESCE(avg(position),0)
           FROM gsc_daily
           WHERE dimension='query' AND activity_date BETWEEN ? AND ?""",
        (week_start.isoformat(), target_day.isoformat()),
    ).fetchone()

    return {
        "range": {"start": week_start.isoformat(), "end": target_day.isoformat()},
        "gainers": gainers[:WEEKLY_TOP_N],
        "losers": losers[:WEEKLY_TOP_N],
        "striking_distance": striking[:WEEKLY_TOP_N],
        "totals_7d": {
            "clicks": int(totals_row[0]),
            "impressions": int(totals_row[1]),
            "avg_position": float(totals_row[2]),
        },
    }


def build_ga4_daily(conn: sqlite3.Connection, target_day: dt.date) -> dict[str, Any] | None:
    if not _has_table(conn, "ga4_daily"):
        return None
    prop_row = conn.execute(
        "SELECT property_id FROM ga4_daily WHERE activity_date=? LIMIT 1",
        (target_day.isoformat(),),
    ).fetchone()
    property_id = prop_row[0] if prop_row else None

    pages = conn.execute(
        """SELECT key, sessions, users
           FROM ga4_daily
           WHERE activity_date=? AND metric_kind='landing_page'
           ORDER BY sessions DESC
           LIMIT ?""",
        (target_day.isoformat(), TOP_N),
    ).fetchall()

    totals_row = conn.execute(
        """SELECT COALESCE(sum(sessions),0), COALESCE(sum(users),0)
           FROM ga4_daily
           WHERE activity_date=? AND metric_kind='landing_page'""",
        (target_day.isoformat(),),
    ).fetchone()

    return {
        "date": target_day.isoformat(),
        "property_id": property_id,
        "top_landing_pages": [
            {"page": k, "sessions": int(s), "users": int(u)} for k, s, u in pages
        ],
        "totals": {"sessions": int(totals_row[0]), "users": int(totals_row[1])},
    }


def build_dossier(client_id: str, target_day: dt.date) -> dict[str, Any]:
    meta = CLIENT_META.get(client_id, {})

    # Open both DBs (read-only). Missing files are fine — sections become null.
    gsc_path = db_path(client_id, "gsc")
    ga4_path = db_path(client_id, "ga4")
    gsc_conn = sqlite3.connect(gsc_path) if gsc_path.exists() else None
    ga4_conn = sqlite3.connect(ga4_path) if ga4_path.exists() else None

    gsc_daily = build_gsc_daily(gsc_conn, target_day) if gsc_conn else None
    gsc_weekly = build_gsc_weekly(gsc_conn, target_day) if gsc_conn else None
    ga4_daily = build_ga4_daily(ga4_conn, target_day) if ga4_conn else None

    freshness = {
        "gsc_last_fetched": _last_fetch_date(gsc_conn, "gsc_daily") if gsc_conn else None,
        "ga4_last_fetched": _last_fetch_date(ga4_conn, "ga4_daily") if ga4_conn else None,
        "ahrefs_last_fetched": None,
        "crawl_last_fetched": None,
        "pagespeed_last_fetched": None,
    }

    if gsc_conn:
        gsc_conn.close()
    if ga4_conn:
        ga4_conn.close()

    return {
        "schema_version": SCHEMA_VERSION,
        "client_id": client_id,
        "client_name": meta.get("name", client_id),
        "client_domain": meta.get("domain"),
        "industry": meta.get("industry"),
        "date": target_day.isoformat(),
        "generated_at_unix": int(time.time()),
        "data_freshness": freshness,
        "gsc_daily": gsc_daily,
        "gsc_weekly": gsc_weekly,
        "ga4_daily": ga4_daily,
        "ahrefs": None,
        "crawl": None,
        "pagespeed": None,
        "competitors": None,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("client_id", help="TRAK client id")
    ap.add_argument("--date", help="ISO date (defaults to yesterday)")
    args = ap.parse_args()

    target_day = (
        dt.date.fromisoformat(args.date) if args.date else dt.date.today() - dt.timedelta(days=1)
    )

    dossier = build_dossier(args.client_id, target_day)

    out_dir = CLIENTS_DIR / args.client_id / "dossiers"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{target_day.isoformat()}.json"
    out_path.write_text(json.dumps(dossier, indent=2, sort_keys=False))

    sections = [
        ("gsc_daily", dossier["gsc_daily"]),
        ("gsc_weekly", dossier["gsc_weekly"]),
        ("ga4_daily", dossier["ga4_daily"]),
    ]
    print(f"Dossier · client={args.client_id} · date={target_day} · {out_path}")
    for name, value in sections:
        if value is None:
            print(f"  {name}: (no data)")
        elif name == "gsc_daily":
            print(
                f"  {name}: {len(value['top_queries'])} queries, "
                f"{len(value['top_pages'])} pages, "
                f"{value['totals']['clicks']} clicks total"
            )
        elif name == "gsc_weekly":
            print(
                f"  {name}: {len(value['gainers'])} gainers, "
                f"{len(value['losers'])} losers, "
                f"{len(value['striking_distance'])} striking-distance"
            )
        elif name == "ga4_daily":
            print(
                f"  {name}: {len(value['top_landing_pages'])} pages, "
                f"{value['totals']['sessions']} sessions"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
