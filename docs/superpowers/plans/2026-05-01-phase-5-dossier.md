# Phase 5: Dossier Builder + Swarm Scaffold — Implementation Plan

> Same execution pattern as prior phases.

**Goal:** A `workers/dossier_builder.py` CLI that turns per-client SQLite snapshots (Phase 4 output) into a structured JSON "dossier" — the exact input format the future 8-stage LoRA swarm will consume. Plus a `workers/swarm_orchestrator.py` stub that loads the dossier and prints the intended Ollama calls (without making them). Plus `prompts/` placeholders for the 8 stages.

**Why thin:** Operator's LoRA adapters aren't trained yet (few days of training out). Phase 5 thin slice locks the dossier contract + scaffolds the orchestrator so plugging in real LoRAs later is a file swap, not a rewrite.

**Out of scope for Phase 5:**
- Real Ollama swarm calls — orchestrator is intent-only stub
- Adapter training data prep
- Strategy / executor stages that need backlinks + crawl (Phase 4 v1.5 inputs)
- Tauri dashboard integration — that's Phase 6 (approval workflow)

---

## Group A — Dossier contract + builder

### Task A.1: Define the dossier schema

Create `docs/superpowers/specs/2026-05-01-dossier-schema.md` with the JSON contract. Locks the shape so future swarm prompts can reference fields by stable names.

### Task A.2: workers/dossier_builder.py

Reads `clients/<id>/gsc_snapshots.db` + `ga4_snapshots.db`, computes:
- `gsc_daily`: top N queries + pages by clicks for the target date
- `gsc_weekly`: 7-day rollup with position deltas (yesterday vs 7 days ago) — gainers, losers, striking distance (positions 4-15)
- `ga4_daily`: top landing pages by sessions for the target date
- `metadata`: client info, date range, source data freshness

Writes to `clients/<id>/dossiers/<YYYY-MM-DD>.json`.

Stages that need data Phase 4 doesn't have (backlinks, competitor SERPs, crawl, page-speed) appear in the dossier as `null` placeholders so the swarm can detect missing inputs and handle gracefully.

CLI: `python -m ingest.dossier_builder trak-automations --date 2026-04-30`

---

## Group B — Swarm scaffold

### Task B.1: workers/swarm_orchestrator.py

Loads a dossier JSON, walks the 8 stages, prints what *would* be sent to Ollama at each step (system prompt path + dossier slice). Does NOT call Ollama. Single file, ~150 lines.

CLI: `python -m ingest.swarm_orchestrator trak-automations --date 2026-04-30 --dry-run`

When LoRA adapters are ready, drop `--dry-run` flag and the orchestrator runs them sequentially. Refactor needed to actually call Ollama is ~30 lines.

### Task B.2: prompts/ scaffolding

8 directories matching the swarm stages from MARKETING_SWARM.md. Each contains a `system.md` placeholder. Operator fills these as adapters land.

```
prompts/
├── 01_keyword_serp_analyst/system.md
├── 02_technical_seo_auditor/system.md
├── 03_content_strategist/system.md
├── 04_onpage_optimizer/system.md
├── 05_link_strategist/system.md
├── 06_competitor_analyst/system.md
├── 07_strategy_synthesizer/system.md
└── 08_executor/system.md
```

Each `system.md` starts with a one-line "Stage N: <role>" marker so swarm_orchestrator.py can validate they exist before running.

---

## Final verification

- [ ] `python -m ingest.dossier_builder trak-automations` runs clean (even with empty SQLite) and writes a dossier JSON
- [ ] Dossier JSON validates against the schema doc
- [ ] `python -m ingest.swarm_orchestrator trak-automations --dry-run` prints 8 stage descriptions without errors
- [ ] All 8 prompt placeholder files exist
- [ ] No real Ollama calls made (verify with `lsof -i :11434` while running orchestrator — should be empty)
