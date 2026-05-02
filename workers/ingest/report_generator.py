"""Generate a weekly client PDF report.

Pulls the last 7 days of dossiers + approved decision files for one client,
renders a single PDF summarizing trends + deliverables shipped.

Run:
  python -m ingest.report_generator <client-id> [--week-ending YYYY-MM-DD]

Default week-ending: the most recent Friday (or today if today is Friday).
Output: clients/<id>/reports/<week-ending>.pdf
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from ._common import CLIENTS_DIR

CYAN = colors.HexColor("#06b6d4")
SLATE_DARK = colors.HexColor("#1e293b")
SLATE_MID = colors.HexColor("#475569")
SLATE_LIGHT = colors.HexColor("#cbd5e1")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    s: dict[str, ParagraphStyle] = {}
    s["title"] = ParagraphStyle(
        "title",
        parent=base["Heading1"],
        fontSize=22,
        leading=28,
        textColor=SLATE_DARK,
        spaceAfter=4,
    )
    s["subtitle"] = ParagraphStyle(
        "subtitle",
        parent=base["Normal"],
        fontSize=10,
        textColor=SLATE_MID,
        spaceAfter=18,
    )
    s["section"] = ParagraphStyle(
        "section",
        parent=base["Heading2"],
        fontSize=11,
        leading=16,
        textColor=CYAN,
        spaceBefore=12,
        spaceAfter=6,
        textTransform="uppercase",
    )
    s["body"] = ParagraphStyle(
        "body",
        parent=base["Normal"],
        fontSize=9,
        leading=12,
        textColor=SLATE_DARK,
    )
    s["muted"] = ParagraphStyle(
        "muted",
        parent=base["Normal"],
        fontSize=8,
        textColor=SLATE_MID,
        leading=11,
    )
    return s


def last_friday(today: dt.date) -> dt.date:
    """Return today if it's Friday, else the most recent past Friday."""
    weekday = today.weekday()  # Mon=0..Sun=6, Fri=4
    delta = (weekday - 4) % 7
    return today - dt.timedelta(days=delta)


def load_week(client_id: str, week_ending: dt.date) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    dossiers: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    for i in range(6, -1, -1):
        day = week_ending - dt.timedelta(days=i)
        d_path = CLIENTS_DIR / client_id / "dossiers" / f"{day.isoformat()}.json"
        if d_path.exists():
            try:
                dossiers.append(json.loads(d_path.read_text()))
            except Exception:
                pass
        a_path = CLIENTS_DIR / client_id / "approved" / f"{day.isoformat()}.json"
        if a_path.exists():
            try:
                decisions.append(json.loads(a_path.read_text()))
            except Exception:
                pass
    return dossiers, decisions


def aggregate_top(rows: list[dict[str, Any]], key: str, sum_fields: list[str], top_n: int = 10) -> list[dict[str, Any]]:
    """Aggregate `rows` (a list of {key, ...sum_fields}) by `key`, sum sum_fields."""
    agg: dict[str, dict[str, float]] = defaultdict(lambda: {f: 0 for f in sum_fields})
    for r in rows:
        k = r.get(key)
        if k is None:
            continue
        for f in sum_fields:
            agg[k][f] += float(r.get(f, 0) or 0)
    out = [{key: k, **vals} for k, vals in agg.items()]
    out.sort(key=lambda d: -d[sum_fields[0]])
    return out[:top_n]


def build_pdf(
    client_id: str,
    client_name: str,
    client_domain: str | None,
    week_ending: dt.date,
    dossiers: list[dict[str, Any]],
    decisions: list[dict[str, Any]],
    out_path: Path,
) -> None:
    styles = _styles()
    doc = SimpleDocTemplate(
        str(out_path),
        pagesize=letter,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        title=f"{client_name} — Weekly Report — {week_ending.isoformat()}",
    )

    story: list[Any] = []

    # Header
    story.append(Paragraph(client_name, styles["title"]))
    week_start = week_ending - dt.timedelta(days=6)
    subtitle_parts = [f"Weekly report · {week_start.isoformat()} → {week_ending.isoformat()}"]
    if client_domain:
        subtitle_parts.insert(0, client_domain)
    story.append(Paragraph(" · ".join(subtitle_parts), styles["subtitle"]))

    if not dossiers:
        story.append(
            Paragraph(
                "No dossiers found for this week. Run "
                "<code>python -m ingest.daily_run --date YYYY-MM-DD</code> for each day first.",
                styles["body"],
            )
        )
        doc.build(story)
        return

    # Aggregate week-level totals
    week_clicks = sum((d.get("gsc_daily") or {}).get("totals", {}).get("clicks", 0) for d in dossiers)
    week_impressions = sum((d.get("gsc_daily") or {}).get("totals", {}).get("impressions", 0) for d in dossiers)
    week_sessions = sum((d.get("ga4_daily") or {}).get("totals", {}).get("sessions", 0) for d in dossiers)
    week_users = sum((d.get("ga4_daily") or {}).get("totals", {}).get("users", 0) for d in dossiers)

    # Summary
    story.append(Paragraph("Week summary", styles["section"]))
    summary_data = [
        ["GSC clicks", f"{int(week_clicks):,}"],
        ["GSC impressions", f"{int(week_impressions):,}"],
        ["GA4 sessions", f"{int(week_sessions):,}"],
        ["GA4 users", f"{int(week_users):,}"],
    ]
    story.append(_kv_table(summary_data))

    # Top queries (aggregated across the week)
    all_queries: list[dict[str, Any]] = []
    for d in dossiers:
        all_queries.extend((d.get("gsc_daily") or {}).get("top_queries") or [])
    top_queries = aggregate_top(all_queries, "query", ["clicks", "impressions"], 10)
    story.append(Paragraph("Top queries this week", styles["section"]))
    if top_queries:
        story.append(
            _data_table(
                ["Query", "Clicks", "Impressions"],
                [[r["query"], int(r["clicks"]), int(r["impressions"])] for r in top_queries],
            )
        )
    else:
        story.append(Paragraph("No GSC query data this week.", styles["muted"]))

    # Position movers — pull from the most recent dossier's gsc_weekly
    latest = dossiers[-1]
    weekly = latest.get("gsc_weekly") or {}
    gainers = weekly.get("gainers") or []
    losers = weekly.get("losers") or []
    striking = weekly.get("striking_distance") or []

    story.append(Paragraph("Position movers (vs prior 7 days)", styles["section"]))
    if gainers or losers:
        rows = []
        for g in gainers[:5]:
            rows.append(
                [
                    f"↑ {g['query']}",
                    f"{g['previous_position']:.1f} → {g['current_position']:.1f}",
                    f"{g['position_delta']:+.1f}",
                ]
            )
        for l in losers[:5]:
            rows.append(
                [
                    f"↓ {l['query']}",
                    f"{l['previous_position']:.1f} → {l['current_position']:.1f}",
                    f"{l['position_delta']:+.1f}",
                ]
            )
        story.append(_data_table(["Query", "Position", "Δ"], rows))
    else:
        story.append(Paragraph("No notable movers this week.", styles["muted"]))

    # Striking distance
    story.append(Paragraph("Striking-distance opportunities (positions 4–15)", styles["section"]))
    if striking:
        story.append(
            _data_table(
                ["Query", "Position", "Impressions / week"],
                [
                    [s["query"], f"{s['current_position']:.1f}", f"{int(s['impressions_7d']):,}"]
                    for s in striking[:8]
                ],
            )
        )
    else:
        story.append(Paragraph("No striking-distance queries identified.", styles["muted"]))

    # Top landing pages (aggregated GA4)
    all_pages: list[dict[str, Any]] = []
    for d in dossiers:
        all_pages.extend((d.get("ga4_daily") or {}).get("top_landing_pages") or [])
    top_pages = aggregate_top(all_pages, "page", ["sessions", "users"], 10)
    story.append(Paragraph("Top landing pages this week", styles["section"]))
    if top_pages:
        story.append(
            _data_table(
                ["Page", "Sessions", "Users"],
                [[r["page"], int(r["sessions"]), int(r["users"])] for r in top_pages],
            )
        )
    else:
        story.append(Paragraph("No GA4 sessions recorded this week.", styles["muted"]))

    # Deliverables shipped
    story.append(Paragraph("Deliverables shipped this week", styles["section"]))
    counter: Counter[str] = Counter()
    approved_examples: list[tuple[str, str]] = []
    for dec_file in decisions:
        for dec in dec_file.get("decisions", []):
            if dec.get("action") in ("approve", "edit"):
                kind = "?"
                # We don't store the kind in the decision file (just deliverable_id).
                # For thin slice we just count approve+edit decisions.
                counter[dec.get("action", "?")] += 1
                approved_examples.append((dec.get("deliverable_id", "?"), dec.get("action", "?")))
    if counter:
        rows = [[k.capitalize(), str(v)] for k, v in counter.most_common()]
        story.append(_kv_table(rows))
        if approved_examples[:6]:
            story.append(Spacer(1, 6))
            for did, act in approved_examples[:6]:
                story.append(
                    Paragraph(
                        f"<font color='#475569'>{act}</font> &nbsp; {did}",
                        styles["muted"],
                    )
                )
    else:
        story.append(Paragraph("No approved deliverables this week.", styles["muted"]))

    # Footer
    story.append(Spacer(1, 24))
    now = dt.datetime.now().strftime("%Y-%m-%d %H:%M")
    story.append(
        Paragraph(
            f"Generated {now} by Trak Automations · "
            f"<font color='{CYAN.hexval()}'>trakautomations.com</font>",
            styles["muted"],
        )
    )

    doc.build(story)


def _kv_table(rows: list[list[str]]) -> Table:
    t = Table(rows, colWidths=[2.0 * inch, 4.7 * inch])
    t.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
                ("TEXTCOLOR", (0, 0), (0, -1), SLATE_MID),
                ("TEXTCOLOR", (1, 0), (1, -1), SLATE_DARK),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, SLATE_LIGHT),
            ]
        )
    )
    return t


def _data_table(headers: list[str], rows: list[list[Any]]) -> Table:
    data = [headers] + [[str(c) for c in r] for r in rows]
    t = Table(data, repeatRows=1)
    t.setStyle(
        TableStyle(
            [
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 8),
                ("FONT", (0, 1), (-1, -1), "Helvetica", 8.5),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("BACKGROUND", (0, 0), (-1, 0), SLATE_DARK),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, -2), 0.3, SLATE_LIGHT),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.white]),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ]
        )
    )
    return t


def generate(client_id: str, week_ending: dt.date) -> Path:
    # Reuse client meta from dossier_builder
    from . import dossier_builder

    meta = dossier_builder.CLIENT_META.get(client_id, {})
    client_name = meta.get("name", client_id)
    client_domain = meta.get("domain")

    dossiers, decisions = load_week(client_id, week_ending)
    out_dir = CLIENTS_DIR / client_id / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{week_ending.isoformat()}.pdf"

    build_pdf(client_id, client_name, client_domain, week_ending, dossiers, decisions, out_path)
    return out_path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("client_id")
    ap.add_argument("--week-ending", help="ISO date (defaults to most recent Friday)")
    args = ap.parse_args()

    week_ending = (
        dt.date.fromisoformat(args.week_ending) if args.week_ending else last_friday(dt.date.today())
    )

    out_path = generate(args.client_id, week_ending)
    print(f"Wrote: {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
