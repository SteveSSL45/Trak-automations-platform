# Trak Automations Platform

A single-operator AI-powered SEO/marketing agency dashboard. Mac M3 Max desktop application managing 10–20 client websites simultaneously, powered by a local LoRA-adapter swarm.

> **Sister project to:** [`trak-automations-web`](https://github.com/SteveSSL45/trak-automations-web) — the public marketing site at [trakautomations.com](https://trakautomations.com) that attracts clients to this service.

---

## What this is

The website sells the service. **This codebase delivers the service.**

Once a contractor signs up at trakautomations.com, their site is added to this dashboard. Every morning at 6 AM, the platform:

1. Ingests fresh data per client (Google Search Console, GA4, competitor SERPs, backlinks, site crawl, page-speed)
2. Builds a structured daily SEO dossier per client
3. Runs an 8-stage local LoRA swarm chain to produce a prioritized action plan + drafted deliverables (title tags, meta descriptions, content briefs, schema)
4. Surfaces the day's actions in the dashboard for review
5. Operator approves → either copy-pastes to client CMS (Mode A) or auto-publishes via WordPress REST API (Mode B, v2)

One person manages 10–20 retainer clients. Target: 12-15 clients × $1,500/mo = $216K-270K ARR with ~95% gross margin.

## First clients (pilot)

1. Lawn-care company (mid-Michigan)
2. Home-improvement company (mid-Michigan)
3. **trakautomations.com itself** — eat-your-own-dog-food client, generates the live `/case-study` data on the marketing site

## Architecture summary

- **Mac M3 Max, 128 GB unified memory** — primary build target
- **Tauri 2.x** (Rust + React) desktop app — `apps/dashboard/`
- **Python workers** for ingestion + orchestration — `workers/`
- **Local LoRA swarm** — 8-adapter chain on a shared base model, training cloned from the TERMINUS pattern. Adapters retrained on SEO/internet-marketing data instead of options-trading data.
- **SQLite per client** in WAL mode — `clients/<name>/*.db`
- **launchd cron** at 6 AM weekdays for the daily run

Full architecture: [`TRAK_AUTOMATIONS.md`](./TRAK_AUTOMATIONS.md). Sister architecture references in [`docs/architecture/`](./docs/architecture/).

## Repository status

🚧 **Phase 1 in progress.** Tauri shell + multi-client sidebar implemented; awaiting visual polish + production .app verification. Other directories (`workers/`, `prompts/`) remain placeholders for later phases.

### Build phases (per `TRAK_AUTOMATIONS.md` § "Build phases — 14-week MVP path")

| Phase | What it ships | Plan file |
|---|---|---|
| **1** | Tauri shell + multi-client sidebar | [`docs/superpowers/plans/2026-04-28-phase-1-tauri-shell.md`](./docs/superpowers/plans/2026-04-28-phase-1-tauri-shell.md) 🚧 |
| 2 | Ollama integration + 70B inference proof | (later) |
| 3 | Connections per client (GSC + GA4 OAuth) | (later) |
| 4 | Daily ingestion workers | (later) |
| 5 | Dossier builder + 8-stage swarm chain | (later) |
| 6 | Approval workflow + history | (later) |
| 7 | launchd cron + Pushover alerts | (later) |
| 8 | Weekly client PDF reports | (later) |
| 9 | Mac app packaging + signing | (later) |

## Local development (Mac)

Prerequisites:

- macOS 14+ (Apple Silicon)
- Xcode Command Line Tools (`xcode-select --install`)
- Node 22 LTS or newer (via nvm or Homebrew)
- Rust + Cargo (via [rustup](https://rustup.rs/))
- Ollama (`brew install ollama`) — Phase 2+
- Python 3.11+ (`brew install python@3.11`) — Phase 4+

Run the dashboard (Phase 1):

```bash
cd apps/dashboard
npm install
npm run tauri dev      # native window, hot-reloads on save
npm run tauri build    # produces apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app
```

See [`apps/dashboard/README.md`](./apps/dashboard/README.md) for stack details, source layout, and build artifact paths.

## Built artifacts

After `npm run tauri build` in `apps/dashboard/`:
- `apps/dashboard/src-tauri/target/release/bundle/macos/Trak Automations.app` — drag to `/Applications/`

First-launch Gatekeeper warning is expected (unsigned). Phase 9 of the master spec handles code-signing + notarization for real distribution.

## Repo layout

```
trak-automations-platform/
├── README.md                     ← you are here
├── TRAK_AUTOMATIONS.md           ← master spec / North Star
├── apps/
│   └── dashboard/                ← Tauri app (Rust + React) — Phase 1
├── workers/
│   ├── ingest/                   ← Python ingestion scripts (per data source) — Phase 4
│   ├── dossier_builder.py        ← Phase 5
│   ├── swarm_orchestrator.py     ← Phase 5
│   ├── report_generator.py       ← Phase 8
│   └── daily_run.py              ← Phase 7 (launchd entrypoint)
├── prompts/                      ← system prompts per swarm stage — Phase 5
├── clients/                      ← per-client data (gitignored, .gitkeep only)
├── shared/                       ← operator-level keys + caches (gitignored except .gitkeep)
├── scripts/                      ← onboarding, OAuth refresh, etc.
├── tests/
└── docs/
    ├── architecture/             ← reference docs (TERMINUS family)
    └── superpowers/plans/        ← phase-by-phase implementation plans
```

## License

Proprietary. All rights reserved. Not for redistribution.

---

*Last updated: 2026-05-01*
