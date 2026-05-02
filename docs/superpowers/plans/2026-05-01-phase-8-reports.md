# Phase 8: Weekly Client PDF Reports — Implementation Plan

> Same execution pattern as prior phases. Thin slice.

**Goal:** A `workers/ingest/report_generator.py` script that produces a per-client weekly PDF summarizing the week's GSC + GA4 trends and approved deliverables. Operator emails the PDF to the client themselves (no auto-send for thin slice). Daily orchestrator picks up a Friday trigger so the reports get generated automatically once a week.

**Architecture:**
- ReportLab (Python PDF library, pure-Python, no system deps).
- Reads 7 days of dossier JSONs + 7 days of `approved/<date>.json` decision files for the target client.
- Output: `clients/<id>/reports/<week-ending-YYYY-MM-DD>.pdf`.
- Hooked into `daily_run.py`: if today is Friday (after the daily ingest finishes), also generate weekly reports for every client.

**Out of scope:**
- Auto-email to client (Phase 8 v1.5 — needs SMTP creds or Resend API)
- Charts / graphs (text + tables only for thin slice; can add `matplotlib`-rendered PNGs later)
- Custom per-client branding (single visual style across all clients)
- WordPress auto-publish of approved deliverables (Phase 8+ Mode B from master spec)

## Tasks

### A.1: Add reportlab to workers deps

`workers/pyproject.toml` gets `reportlab>=4`. Pure-Python install, no brew.

### A.2: workers/ingest/report_generator.py

Single file, ~250 lines. Functions:
- `load_week(client_id, week_ending)` → list of dossiers + list of decision files
- `build_pdf(client_id, week_ending, dossiers, decisions, out_path)` → uses ReportLab Platypus

PDF sections:
1. **Header**: client name + domain + week ending date
2. **Summary**: weekly totals (clicks, impressions, sessions, users)
3. **Top queries this week**: aggregated from 7 daily dossiers
4. **Position movers**: gainers + losers from the most recent dossier's `gsc_weekly`
5. **Striking-distance opportunities**: from same source
6. **Top landing pages**: aggregated GA4
7. **Deliverables shipped this week**: from approved decision files, grouped by `kind`
8. **Footer**: generated timestamp + brand mark

Style: dark slate-on-white-ish (printable), cyan accent for headers. Inter font isn't bundled in ReportLab; falls back to Helvetica.

CLI: `python -m ingest.report_generator <client-id> [--week-ending YYYY-MM-DD]`. Default week-ending = last Friday.

### A.3: Daily orchestrator hook

In `daily_run.py`, after the per-client pipeline completes: if today is Friday, also call `report_generator.generate(client_id, today)` for each successful client.

## Verification

- [ ] `python -m ingest.report_generator trak-automations` produces a PDF
- [ ] `open clients/trak-automations/reports/<date>.pdf` opens in Preview
- [ ] Sections all render (even if mostly "no data" rows for the new site)
- [ ] On a manual Friday-run of `daily_run.py`, a PDF gets created in `reports/`
