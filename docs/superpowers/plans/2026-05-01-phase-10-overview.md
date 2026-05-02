# Phase 10: Multi-client Overview + Add-Client UI — Implementation Plan

> Same execution pattern. UI refresh on top of finished MVP.

**Goal:** Default landing changes from "no client selected → empty state" to a real multi-client dashboard. Each pilot client gets a tile showing OAuth status, weekly metrics, today's deliverable counts. Operator can add a new client via a modal — no more code edits to onboard.

**Architecture:**
- Client list moves from hardcoded `apps/dashboard/src/lib/clients.ts` to a JSON file at `app_data_dir/clients.json`. Single source of truth — Python ingestion + Tauri UI both read it.
- Three new Rust commands: `read_clients()`, `add_client(client)`, `update_client(id, patch)`.
- `/` route renders new `Overview.tsx` (multi-client grid). Current `Dashboard.tsx` moves to `/clients/:id` (drill-down detail).
- Sidebar reads dynamically from the JSON; adding a client makes it appear in the sidebar immediately.
- Python's `daily_run.py` reads gsc_site + ga4_property_id from `clients.json` — no more hardcoded CLIENT_PROPERTIES dict.

**Out of scope:**
- Delete client (manual JSON edit for now)
- Reorder clients (saved order = insertion order)
- Per-client custom branding / icons (sticks with the existing iconName enum for thin slice)

## Tasks

### A.1: Rust commands for the clients.json store

Create `apps/dashboard/src-tauri/src/clients/{mod,commands}.rs`:
- `Client` struct: id, name, domain, industry, icon_name, gsc_site (Option), ga4_property_id (Option), created_at_unix
- `read_clients()` → `Vec<Client>`. If file doesn't exist, returns the same 3 pilot clients hardcoded for now (acts as a one-time seed).
- `add_client(client: Client)` → appends if id is unique, else returns error. Persists.
- `update_client(id, patch)` → merges fields (used to fill in gsc_site/ga4_property_id later).

### A.2: Refactor JS to read clients dynamically

`lib/clients.ts` keeps the `Client` interface but the `CLIENTS` const becomes a hook `useClients()` powered by the new Rust command + cached in a Zustand slice. All components reading `CLIENTS` switch to the hook.

Components touched: `Sidebar.tsx`, `TopBar.tsx`, `Settings.tsx` (per-client connection rows), `Dashboard.tsx`.

### B.1: New `pages/Overview.tsx` — multi-client grid

Each card:
- Client name + domain (clicks open `/clients/:id`)
- Two small status pills: GSC connected/needs/missing, GA4 connected/needs/missing
- Week-to-date metrics: GSC clicks, GA4 sessions (read from latest available dossier)
- Deliverables for today: "X / Y decided"
- Right-corner: industry tagline

Layout: CSS grid, `repeat(auto-fill, minmax(280px, 1fr))` so it scales to 1-N columns.

### B.2: Move per-client view to `/clients/:id`

App.tsx Routes:
- `/` → `<Overview />`
- `/clients/:clientId` → `<Dashboard />` (use `useParams` for active client; sidebar `onSelectClient` navigates to this path)
- `/settings` → unchanged

Active-client Zustand slice still useful for "which one is the sidebar highlighting".

### C.1: Add-client modal

Trigger: button at the top of `Overview.tsx`. Opens an in-page modal (no new route; modal stack up with backdrop).
Fields: id (auto-derived from name slug; editable), name, domain, industry, icon (radio group with the 3 existing icons + a default "Building"), gsc_site (optional, with placeholder text), ga4_property_id (optional).
On submit: calls `add_client`, refreshes the client list, closes the modal.

### D.1: Python migration

`workers/ingest/daily_run.py` reads `clients.json` instead of hardcoding `CLIENT_PROPERTIES`. Skips clients that don't have `gsc_site` or `ga4_property_id` filled in.

`workers/ingest/dossier_builder.py` reads client metadata (name, domain, industry) from `clients.json` instead of the hardcoded `CLIENT_META` dict.

## Verification

- [ ] `npm run tauri dev` opens to a multi-client grid (3 pilots visible)
- [ ] Clicking a card opens the per-client detail at `/clients/<id>`
- [ ] Sidebar still lists clients and navigates correctly
- [ ] Add-client modal opens, validates uniqueness, persists to `clients.json`, new client appears in sidebar + grid immediately
- [ ] `cat ~/Library/Application\ Support/com.trakautomations.dashboard/clients.json` shows the new entry
- [ ] Python: `python -m ingest.daily_run` skips the new client (no GSC creds yet) without erroring
