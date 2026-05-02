# Phase 6: Operator Approval Workflow — Implementation Plan

> Same execution pattern as prior phases. Thin slice.

**Goal:** The Tauri dashboard's per-client view (currently a stub) becomes a real working surface: shows today's dossier + a mock action plan, with approve/edit/reject buttons. Decisions persist to `clients/<id>/approved/<date>.json`. When the LoRA swarm comes online, the action plan source swaps from mock data to `swarm_runs/<date>/08_executor.json` — UI unchanged.

**Out of scope:**
- Real swarm output (deferred until adapters trained — Phase 5 + later)
- Approval history view (single-day-only for thin slice)
- WordPress auto-publish (Mode B from master spec — Phase 8+)
- Pushover / email notifications when a plan is ready (Phase 7)

## Tasks

### A.1: Tauri commands (`read_dossier`, `read_action_plan`, `write_decisions`)

`apps/dashboard/src-tauri/src/dossier/`:
- `mod.rs` — module wiring
- `commands.rs` — three commands

Paths anchor to `app_data_dir/clients/<client_id>/`:
- `dossiers/<date>.json` → read
- `swarm_runs/<date>/08_executor.json` → read (if present, else use mock)
- `approved/<date>.json` → write

### A.2: JS wrappers + types (`src/lib/dossier.ts`)

Type defs matching the Phase 5 schema doc. `readDossier()`, `writeDecisions()`.

### B.1: Replace `pages/Dashboard.tsx`

Currently shows a placeholder. Replace with:
- Header: client name + date selector (defaults to yesterday)
- "Today's data" section: GSC daily, weekly gainers/losers/striking-distance, GA4 daily
- "Proposed actions" section: action plan deliverables, each with Approve/Edit/Reject
- "Decisions" footer: summary count, "Save decisions" button

### B.2: Mock action plan source

`src/lib/mock-action-plan.ts` — exports `MOCK_ACTION_PLAN: ActionPlan` with 3-4 hardcoded deliverables that match the shape the swarm will produce. Easy to delete in one commit when the real swarm runs.

## Verification

- [ ] `npm run tauri dev`, click Trak Automations in sidebar
- [ ] Dashboard shows dossier sections (mostly "no data" since the site is new — that's fine)
- [ ] Mock action plan with 3-4 deliverables is visible
- [ ] Approve/Edit/Reject buttons mutate the row's state
- [ ] Click "Save decisions" → file appears at `~/Library/Application Support/com.trakautomations.dashboard/clients/trak-automations/approved/<date>.json`
- [ ] Reopening the date shows previously-saved decisions persisted
