# TRAK AUTOMATIONS — Project North Star

*Reference doc for cross-chat context. Sister doc to `TERMINUS.md` and `MARKETING_SWARM.md`. Same architectural family (Tauri desktop + LoRA-pattern decomposition chain), different surface: a single-operator AI-powered SEO/marketing agency dashboard managing 10-20 client websites simultaneously.*

> **Mission:** A 1-person AI-augmented SEO/marketing agency. One operator (Steve) manages 10-20 client websites through a single dashboard powered by a local 70B model. Daily automation produces prioritized action plans + drafted deliverables; operator reviews, approves, and either manually publishes (Mode A) or auto-publishes via CMS API (Mode B, v2).
>
> **Business model:** Agency-style retainer — clients pay $1,500-3,000/month for ongoing SEO management. Target: 12-15 clients = $216K-360K ARR with ~85-90% gross margin. Operator's leverage comes from the LLM doing 80% of the analytical/drafting work; operator focuses on review, editorial judgment, and client relationships.
>
> **Companion to TERMINUS:** uses the same architectural patterns (Tauri stack, multi-stage decomposition chain, dossier-based input, structured JSON outputs) but skips the LoRA training pipeline because the Mac M3 Max can run a frontier-class 70B model directly.

---

## Hardware

- **Primary:** MacBook Pro M3 Max, 128 GB unified memory
- **OS:** macOS Sonoma+
- **Backup:** RTX 4070 Ti Super 16 GB (Windows + WSL2) — kept warm for the TERMINUS swarm and as a future "premium tier" local-AI option

The 128 GB unified memory is the entire reason this build looks fundamentally different from MARKETING_SWARM.md. With 16 GB CUDA VRAM (TERMINUS), we needed an 8-adapter swarm to compose intelligence out of 7×3B specialists. With 128 GB unified memory, **a single 70B model fits in 4-bit with 80+ GB headroom** — so the entire training pipeline becomes unnecessary.

| What we save by going 70B-direct | Magnitude |
|---|---|
| Training data curation (1000 SEO scenarios) | ~3-4 weeks of manual work |
| LoRA training run (8 adapters × 50min + regen passes) | ~17 hours of compute time |
| Custom CUDA + Unsloth + bitsandbytes pipeline | weeks of debugging |
| Exposure-bias regen complexity | none — each call is self-contained |
| Adapter weight management at runtime | none — single model loaded once |
| **Time to MVP** | **3.5 months → ~14 weeks** |

---

## Tech stack

```
Mac M3 Max (128 GB unified memory)
├── Tauri 2.x (Rust + React)        ← dashboard UI, native .app
├── Python 3.11+                     ← ingestion + orchestration scripts
│   ├── google-api-python-client     (GSC + GA4 OAuth)
│   ├── ahrefs / dataforseo SDKs
│   ├── beautifulsoup4 + httpx       (site crawler)
│   ├── reportlab                    (weekly PDF reports)
│   └── ollama-python                (LLM client)
├── Ollama                           ← local LLM server on :11434
│   └── llama3.3:70b (4-bit, ~40 GB resident)
├── SQLite                           ← per-client data stores (WAL mode)
└── launchd                          ← daily cron at 6 AM (macOS native)
```

**Three tools, three responsibilities:** Tauri/Rust handles UI, Python handles data ingestion + orchestration, Ollama handles LLM inference. Easy to swap any one piece later without touching the others.

### Why Llama-3.3-70B-Instruct over alternatives

Comparison was tight, but Llama 3.3 wins for marketing/SEO specifically:

| Model | Verdict |
|---|---|
| **Llama-3.3-70B-Instruct** ⭐ | Best balance — strong instruction-following, reliable JSON output, mature marketing prose voice, no `<think>` tag overhead, fast inference |
| DeepSeek-R1-Distill-Llama-70B | Excellent reasoning but adds latency via verbose `<think>` blocks; marketing prose quality is okay-not-great |
| Qwen-2.5-72B-Instruct | Strong multilingual + math, slightly weaker English copy |
| Mixtral-8x22B | Faster (sparse MoE) but less reliable on long-form marketing content |

**v2 optimization:** swap in DeepSeek-R1-Distill-70B for *just* the strategy stage where deep reasoning helps most. Single-model MVP first.

```bash
# Mac install
brew install ollama
ollama pull llama3.3:70b           # ~40 GB, takes 15-30 min on good wifi
ollama serve                       # runs on localhost:11434
```

---

## The 8-stage chain — prompts, not trained adapters

Architectural pattern lifted directly from MARKETING_SWARM.md. Each "adapter" becomes a system prompt + structured-output schema. Every stage is an HTTP call to Ollama against the same 70B model.

```
                       daily_seo_dossier
                              │
        ┌──────────┬──────────┴──────────┬──────────┬──────────┐
        ↓          ↓                     ↓          ↓          ↓
   call Ollama with each system prompt below (parallel-able):
   ┌──────────────────────────────────────────────────────────────┐
   │ [1] keyword_scout.md      → keyword opportunities JSON       │
   │ [2] content_gap.md        → missing topics JSON              │
   │ [3] technical_audit.md    → severity-ranked issues JSON      │
   │ [4] competitor_intel.md   → competitive shifts JSON          │
   │ [5] backlink_intel.md     → outreach targets JSON            │
   │ [6] performance_signals.md → wins/losses JSON                │
   └──────────────────────────────────────────────────────────────┘
        └──────────────────────┬──────────────────────────────────┘
                               ↓
        call Ollama with [7] strategy.md (sees raw + 6 specialist outputs)
                               ↓
        call Ollama with [8] executor.md (sees raw + 7 upstream outputs)
                               ↓
                      action_plan.json  → dashboard
```

### Stage responsibilities (one-line each)

| # | Stage | System-prompt role | Output |
|---|---|---|---|
| 1 | keyword_scout | Senior keyword research analyst — find striking-distance opportunities | Top 5 keywords w/ volume, KD, intent, "why now" |
| 2 | content_gap | Topical authority analyst — what competitors cover that you don't | Ranked missing topics |
| 3 | technical_audit | Senior technical SEO — flag site-health issues by severity | Critical/High/Medium issues + fixes |
| 4 | competitor_intel | Competitive intelligence — what shifted this week | Strategic moves to react to (or ignore) |
| 5 | backlink_intel | Backlink strategist — outreach + recovery opportunities | Prioritized outreach targets |
| 6 | performance_signals | Performance analyst — what's trending up/down on the site | Wins to amplify, losses to investigate |
| 7 | strategy | Senior SEO strategist — synthesize 1-6 into prioritized weekly plan | Top 3 priorities w/ rationale + KPIs |
| 8 | executor | Content executor — produce ship-ready title tags, meta, briefs, schema | Ready-to-review deliverables |

### Critical anti-pattern guards (in every system prompt)

- **Empty-data honesty:** if dossier shows no GSC data / no competitor changes / no new backlinks, the stage must say so plainly — never invent activity to fill space
- **No fabricated metrics:** never invent search volumes, KD scores, traffic numbers, or position rankings. Cite ONLY what's in the dossier.
- **No reactive over-rotation:** competitors publishing new content doesn't always require us to react. Strategy stage must sometimes recommend "ignore."
- **Brand voice immutability:** executor stage must respect [BRAND_CONTEXT] — never violate prohibited claims or tonality rules
- **YMYL caution:** for medical/legal/finance industries, executor adds E-E-A-T signals + avoids ungrounded claims
- **Strict JSON output:** every stage's output must parse as valid JSON matching its schema. No markdown fencing, no preamble, no commentary.

### Sample system prompt — stage 1 (keyword_scout)

```
You are a senior keyword research analyst. Given a site's daily SEO dossier,
identify the TOP 5 keyword opportunities the team should target this week.

Selection criteria (ALL must be true):
  - Currently positioned 4-15 (page 1 striking distance) per [GSC_WEEKLY]
  - Search volume >= 100/mo
  - Commercial or informational intent (skip pure navigational)
  - Difficulty appropriate for site's domain authority

For each opportunity, output:
  - keyword (exact phrase)
  - current_position (integer)
  - search_volume (cite from dossier)
  - keyword_difficulty (cite from dossier)
  - intent (commercial | informational | transactional)
  - why_now (1 sentence — recent SERP shift, seasonality, or strategic fit)
  - estimated_impact (low | medium | high — based on traffic potential)

Output strict JSON:
{
  "opportunities": [
    {"keyword": "...", "current_position": ..., "search_volume": ..., ...},
    ...
  ],
  "summary": "<1-2 sentence overview of the opportunity landscape this week>"
}

Constraints:
- NEVER invent search volume or KD numbers — cite only what's in [KEYWORD_OPPORTUNITIES]
- If the dossier has fewer than 5 valid opportunities, return what exists. Don't pad.
- Skip keywords already covered by completed actions in [ACTIONS_LOG]
```

The other 7 stage prompts follow the same pattern — clear role, strict criteria, structured JSON output, anti-fabrication guards.

---

## Daily SEO dossier — input format

Same structure as MARKETING_SWARM.md but slightly tweaked for daily-vs-weekly cadence and multi-client context. Built once per day per client by the ingestion pipeline.

```
[CLIENT_OVERVIEW]
Domain: acmecorp.com
Industry: B2B SaaS — fintech-payments
Primary topic clusters: payments-api, developer-tools, compliance
Domain Rating: 52 (Ahrefs)
Indexed pages: 1,247
30-day baseline: 145K visits, 2,400 conversions
Brand voice: technical, confident, never flippant
Target audience: B2B SaaS engineering leaders + product managers
[END_CLIENT_OVERVIEW]

[GSC_DAILY] (last 24h) — top queries, position deltas, mobile vs desktop
[GSC_WEEKLY] (7d trend) — gainers, losers, striking-distance opportunities
[GA4_DAILY] — top landing pages, conversion events, traffic sources
[KEYWORD_OPPORTUNITIES] — striking-distance with volume + KD + intent
[COMPETITOR_DELTA] (week over week) — new pages, ranking shifts, backlinks
[BACKLINK_DELTA] — new, lost, broken inbound
[TECHNICAL_AUDIT] — Core Web Vitals, indexing, schema, mobile
[BRAND_CONTEXT] — voice, prohibited claims, regulated-industry constraints
[CONVERSION_GOALS] — primary conversion + targets
[CURRENT_QUARTER_FOCUS] — strategic priorities (passed in by operator)
[ACTIONS_LOG] (last 30 days) — what we did + what status (so we don't repeat)
```

Typical dossier size: 3,000-5,000 tokens. Llama 3.3 70B handles this comfortably with room for the system prompt + reasoning + structured output.

---

## Multi-client architecture

Single-operator dashboard managing 10-20 clients. Each "tenant" is a client company with isolated data and credentials.

### Per-client file layout

```
clients/
├── acme-corp/
│   ├── client_config.json          (domain, contact, brand context, KPI goals)
│   ├── credentials.enc              (Tauri stronghold — GSC + GA4 OAuth tokens)
│   ├── gsc_snapshots.db             (daily GSC pulls — query/page/position history)
│   ├── ga4_snapshots.db
│   ├── competitor_intel.db
│   ├── backlink_history.db
│   ├── site_crawl.db
│   ├── action_plans/                (one JSON per day)
│   │   ├── 2026-04-30.json
│   │   ├── 2026-04-29.json
│   │   └── ...
│   ├── deliverables/                (drafts + published artifacts)
│   ├── reports/                     (weekly client PDFs)
│   └── actions_log.db               (approved/skipped/published history)
├── foo-inc/
└── bar-llc/

shared/
├── master_credentials.enc           (Anthropic, Ahrefs, DataForSEO — operator-level keys)
├── master_settings.json
└── ahrefs_api_cache/                (shared across clients to amortize cost)
```

**File-per-client is intentional.** Easy to back up a single client, archive when they leave, or migrate to a new machine. Cross-client analytics happens via Python aggregation scripts when needed.

### Operator's daily workflow

```
6:00 AM — launchd kicks daily_run.py:
  for each client in clients/:
    ingest GSC, GA4, competitor data, backlinks, crawl, pagespeed
    build dossier
    run swarm → 8 Ollama calls → action_plans/today.json
    flag urgent issues to operator inbox

6:30 AM — Pushover ping:
  "TRAK morning run: 15 clients processed. 47 action items pending review."

8:30 AM — Operator opens dashboard:
  - Quick scan of all 15 clients (color-coded health badges)
  - Sort priority items by impact across all clients
  - Bulk-approve safe items (meta description tweaks, schema additions)
  - Flag content drafts for editorial review (5-10 across all clients)

9:00 AM - 12:00 PM:
  - Review content drafts (15-20 min each)
  - Edit/approve as needed
  - Approved drafts saved to deliverables/ folder for manual publish (Mode A)
    OR pushed to client WordPress automatically (Mode B, v2)

2:00 PM:
  - Outreach work the swarm can't do (actual emails, calls, manual research)
  - Client check-ins (weekly calls, monthly reports)

5:00 PM — End of day:
  - Approve any straggler items
  - Quick check on yesterday's published changes — any issues?
```

A 1-person operation with 15 clients × $1,500/mo = $22.5K MRR. The swarm absorbs the labor of what would otherwise be a 5-person team's analytical/drafting work.

---

## Two operating modes — Mode A vs Mode B

How approved swarm outputs reach client websites:

### Mode A — Review-only (MVP, weeks 1-14)
- TRAK shows the proposed change in dashboard
- Operator clicks Approve
- TRAK saves the change to `clients/<name>/deliverables/` as a copy-pasteable artifact
- Operator manually logs into client's WordPress and applies the change

```
Pros: zero risk of bad publish, full operator control, no API integration needed
Cons: ~30-60 sec manual labor per item × 50 items/day = 30-50 min daily
```

### Mode B — Hybrid auto-publish (v2, after 60-90 days of trust)
Risk-graded auto-publish based on item type:

| Risk class | Examples | Behavior on approve |
|---|---|---|
| Low | Meta descriptions, schema JSON, internal links, image alt | Auto-push to live site via WordPress REST API |
| Medium | Title tag changes, H1 changes | Push to WordPress as DRAFT — operator clicks publish in WP admin |
| High | New content, homepage edits, navigation changes | Stays in TRAK as a brief — operator writes/publishes manually |

```
Pros: saves 70-80% of manual labor for the most common items
Cons: requires WP API integration per client (~2 hours setup per client)
       requires risk classifier (rule-based for v2, learned later)
```

### Mode C — Full auto-publish (NOT supported, ever)

Would never sleep again. Not building it.

---

## Action plan output schema

Final shape of what the swarm produces per client per day:

```json
{
  "date": "2026-04-30",
  "client": "acme-corp",
  "domain": "acmecorp.com",
  "priorities": [
    {
      "rank": 1,
      "category": "technical",
      "title": "Fix Core Web Vitals LCP regression on /pricing page",
      "rationale": "Highest-converting page (4.2% CR) hit LCP 3.4s yesterday — affects 23% of mobile traffic. Likely cause: new hero image not optimized.",
      "estimated_impact": "+8-12% pricing page conversions; recover ~$8K/mo",
      "effort": "M",
      "owner_role": "engineer",
      "deadline_days": 7,
      "risk_class": "medium",
      "deliverables_ref": ["technical_briefs/2026-04-30-pricing-lcp.md"]
    },
    ...
  ],
  "deliverables": {
    "title_tag_revisions": [
      {
        "url": "/pricing",
        "current": "Pricing | Acme",
        "proposed": "Stripe Alternative Pricing — Save 30% with Acme",
        "rationale": "CTR 1.4% vs 2.8% benchmark; commercial intent keyword match",
        "risk_class": "medium",
        "status": "pending_review"
      }
    ],
    "meta_description_revisions": [...],
    "schema_additions": [...],
    "content_briefs": [...]
  },
  "kpi_targets_this_week": {
    "organic_traffic": "+3% WoW",
    "pricing_page_conversions": "+5% WoW"
  },
  "confidence": 78,
  "synth_summary": "Technical issues are the binding constraint this week...",
  "_stages": {
    "keyword_scout": "...",
    "content_gap": "...",
    "technical_audit": "...",
    "competitor_intel": "...",
    "backlink_intel": "...",
    "performance_signals": "...",
    "strategy": "..."
  }
}
```

The `_stages` field exposes each stage's raw output for transparency / debugging — same pattern as TERMINUS's swarm output JSON.

---

## Repo structure

```
trak-automations/
├── apps/
│   └── dashboard/                   ← Tauri app (Rust + React)
│       ├── src/                     (React UI)
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── ClientSidebar.tsx
│       │   │   ├── ClientPicker.tsx
│       │   │   ├── ActionPlanCard.tsx
│       │   │   ├── DeliverableReview.tsx
│       │   │   ├── ConnectionsPanel.tsx
│       │   │   └── PromptPlayground.tsx    ← dev tool
│       │   └── lib/
│       │       └── tauri.ts                ← Rust command bindings
│       ├── src-tauri/               (Rust backend)
│       │   ├── src/
│       │   │   ├── lib.rs
│       │   │   ├── ollama.rs               ← HTTP client for Ollama
│       │   │   ├── credentials.rs          ← Stronghold-based encrypted store
│       │   │   ├── client_manager.rs
│       │   │   └── workers.rs              ← invokes Python workers
│       │   └── Cargo.toml
│       └── package.json
├── workers/
│   ├── ingest/
│   │   ├── gsc_client.py
│   │   ├── ga4_client.py
│   │   ├── ahrefs_client.py
│   │   ├── dataforseo_client.py
│   │   ├── pagespeed_client.py
│   │   └── site_crawler.py
│   ├── dossier_builder.py
│   ├── swarm_orchestrator.py        ← runs 8 prompts against Ollama
│   ├── report_generator.py          ← weekly PDFs for clients
│   └── daily_run.py                 ← launchd entrypoint
├── prompts/                         ← system prompts for each "stage"
│   ├── 01_keyword_scout.md
│   ├── 02_content_gap.md
│   ├── 03_technical_audit.md
│   ├── 04_competitor_intel.md
│   ├── 05_backlink_intel.md
│   ├── 06_performance_signals.md
│   ├── 07_strategy.md
│   └── 08_executor.md
├── clients/                         ← per-client data (gitignored)
├── shared/                          ← operator-level keys + caches
├── scripts/
│   ├── add_client.py                ← onboard a new client interactively
│   ├── refresh_oauth.py             ← refresh expired Google tokens
│   └── export_client.py             ← archive a client when they leave
├── tests/
└── TRAK_AUTOMATIONS.md              ← this doc
```

---

## Build phases — 14-week MVP path

UI work is intentionally distributed throughout so you're never building 4 weeks of backend before seeing anything visual.

### Phase 1 — Tauri shell + multi-client sidebar (weeks 1-2)
- Sidebar nav with mock client list (3 hardcoded clients)
- Top bar with client picker dropdown
- Empty main content area with "select a client" placeholder
- Settings page skeleton

**UI checkpoint:** beautiful empty dashboard. Iterate on fonts, colors, sidebar widths, navigation patterns until it feels right before adding complexity.

### Phase 2 — Ollama integration + 70B inference proof (week 3)
- Install Ollama, pull `llama3.3:70b`
- Build Rust HTTP client in Tauri that calls Ollama's `/api/generate`
- "Prompt Playground" dev tab — system + user text boxes, run button, streaming response

**UI checkpoint:** prompt-engineering UX. Good streaming feedback when waiting 30-60s for a response.

### Phase 3 — Connections system per client (weeks 4-5)
- Encrypted credential store via Tauri stronghold
- Per-client OAuth flows for Google services (GSC + GA4)
- Connection status indicators (🟢 healthy / 🟡 needs reauth / 🔴 broken)
- "Add Client" wizard (3 steps: basic info → connect Google → confirm)
- "Test connection" button per integration

**UI checkpoint:** the Connections UX is the biggest UX investment. Refine until it feels like Linear or Notion's integrations panel.

### Phase 4 — Daily ingestion workers (weeks 6-7)
- Python scripts for each data source — output to per-client SQLite
- Per-client database schema with WAL mode
- Manual "Refresh data" button in dashboard for testing

**UI checkpoint:** data presentation polish. Each client's main page shows raw data cards (recent GSC queries, top GA4 pages, recent backlinks). This is where the dashboard starts to feel professional.

### Phase 5 — Dossier builder + 8-stage swarm chain (weeks 8-9)
- `dossier_builder.py` aggregates ingestion outputs into structured input
- `swarm_orchestrator.py` runs all 8 Ollama calls in sequence
- Action plan view per client with prioritized recommendations

**UI checkpoint:** the action plan UI is the *core* user experience. Cards for each priority with rationale, impact estimate, approve/skip buttons. Drafted deliverables (title tags, meta descriptions, content briefs) shown inline.

### Phase 6 — Approval workflow + history (weeks 10-11)
- Each approved/skipped item logged to `actions_log.db`
- Per-client history view: "things we did this month"
- Bulk actions (select multiple → approve all)
- Filter/search across action history

**UI checkpoint:** workflow ergonomics. How fast can you process 50 items per morning? Keyboard shortcuts, smart defaults, batch operations. Time yourself processing a backlog — target <30 min/day across 15 clients.

### Phase 7 — Daily cron via launchd (week 12)
- macOS launchd `.plist` triggers `workers/daily_run.py` at 6 AM weekdays
- Pushover notification on completion + on errors
- "Last Run" status badge in dashboard header

### Phase 8 — Auto-generated weekly client reports (week 13)
- `report_generator.py` produces branded PDF per client showing:
  - Week's KPIs (organic traffic, conversions, key rankings)
  - Items completed this week (by category)
  - Issues flagged
  - Next week's priorities (preview)
- "Generate Report" button per client + email-to-client integration

**UI checkpoint:** PDF design polish. Branded, professional, scannable. This is what clients see — it sells the value.

### Phase 9 — Mac app packaging + signing (week 14)
- `cargo tauri build` produces `.app` bundle
- Code-sign with your Apple Developer account
- Notarize with Apple to bypass Gatekeeper warnings
- Drag-to-Applications installer

**MVP ship target: end of week 14 with 3-5 paying client pilot.**

---

## What ships at MVP (week 14)

✅ Multi-client dashboard, native Mac app
✅ 3-5 paying client pilot
✅ Daily ingestion of GSC + GA4 + competitor + backlinks + crawl + pagespeed
✅ 8-stage Llama-3.3-70B analysis chain producing action plans
✅ Drafted deliverables (title tags, meta, briefs, schema) for human review
✅ Mode A: review-only, manual publish to client CMS
✅ Auto-generated weekly client PDFs
✅ Pushover notifications on issues
✅ Encrypted per-client credential store

## What's deferred to v2

- Mode B (hybrid auto-publish via WordPress REST API)
- Local TERMINUS-style swarm for premium privacy-conscious clients (uses Windows GPU)
- Multi-flow expansion (Sales, Customer Support, Content Repurposing flows)
- Client-facing read-only portal
- Multi-operator team license
- Advanced reporting (custom KPIs, A/B test tracking, attribution)
- Risk-class classifier for auto-publish gating

---

## Connection management UX — the differentiator

Most "integration panels" in business tools feel like janky checkboxes. TRAK's needs to feel polished because every client onboarding starts here.

### Design principles

- **Card-per-integration.** Each connection is a card with logo, status badge, and clear actions.
- **Status as primary signal.** Green/yellow/red badge on every card. No hunting for "is this working?"
- **Test connection button.** Every integration card has a one-click verification — clicks it, sees real data flow.
- **Reauth on yellow.** When a token's about to expire, the card goes yellow with a "Reauthorize" button. Click → OAuth flow → green again.
- **Add new integration via "+" button** that's always visible. No hidden menus.

### Connection states

```
🟢 Connected     Last verified <date>; data flowing
🟡 Needs reauth  Token expires in <N> days OR was unable to fetch data on last attempt
🔴 Broken        Last 3 fetches failed; needs operator attention
⚪ Not connected Integration available but never set up for this client
```

### Required integrations (MVP)
- Google Search Console (OAuth)
- Google Analytics 4 (OAuth)
- Anthropic API (master key, shared across all clients) — for occasional Claude fallback
- Ollama (always available locally, no setup needed)

### Optional integrations (v1.5+)
- Ahrefs API (master key) — backlinks + competitor SERPs
- DataForSEO (master key) — keyword data + SERP scraping
- PageSpeed Insights (free, API key)
- WordPress REST API (per client) — only needed for Mode B
- Email provider (per operator) — for client weekly report delivery

---

## Pricing & economics

### Operator side (Steve)

Per-client revenue: $1,500-3,000/mo (industry standard for boutique SEO retainer)
Cost per client per month:
- Anthropic API (occasional Claude fallback): ~$5
- Ahrefs API share: ~$15-30
- DataForSEO share: ~$10-20
- PageSpeed: $0 (free)
- Ollama compute: $0 (your hardware)
- **Total ~$30-55/client/month**

Margin: ~$1,450-2,945/client/month = **95-98% gross margin**.

15 clients × $1,500/mo = **$22,500 MRR / $270K ARR** as a 1-person operation.

### Operator's time budget

- 5-7 hrs/day reviewing + approving + editing
- 2-3 hrs/day on outreach + client comms
- 1-2 hrs/day on misc (admin, planning, occasional content writing the swarm can't do)
- **Total: ~10-12 hrs/day, 5 days/week**

Sustainable for one person; would NOT scale beyond 20-25 clients without hiring an editor or a second operator.

### Client side

Standard SEO retainer pricing — $1,500-3,000/mo. Compete on:
- **Speed** (daily action plans vs typical weekly cycles)
- **Comprehensiveness** (technical audit + content + backlink + competitor analysis daily, not monthly)
- **Transparency** (weekly PDF reports show exactly what was done + impact estimates)
- **Risk-managed** (review-mode means no rogue auto-publishes)

---

## Operational learnings (from TERMINUS, expected to apply here)

Carry these over from the TERMINUS build:

- **Don't run cron jobs twice.** Add `pgrep -cf` duplicate-launch guard to `daily_run.py`.
- **Disable Mac sleep during the daily run window.** macOS equivalent: `caffeinate -i` wraps long-running processes.
- **WAL mode on all writer SQLite DBs.** Prevent concurrent-writer corruption.
- **CRLF in `.env`** — same workaround if `.env` files are edited on a Windows machine and synced over.
- **`stdbuf -oL -eL` + `PYTHONUNBUFFERED=1`** in the orchestrator so progress logs aren't 30-min stale.
- **Resume logic in long-running scripts.** If `swarm_orchestrator.py` is killed mid-run (Mac sleep, crash), resume from the last completed client.
- **OAuth refresh tokens expire.** Schedule monthly health-check that exercises every client's GSC + GA4 connection and yellow-flags failures.
- **Ollama model unload behavior.** Llama 3.3 70B takes ~30-60s to load into memory. Keep Ollama warm during business hours; let it unload overnight for memory hygiene.

### New gotchas specific to this build

- **launchd quirks:** macOS jobs only fire when the user is logged in (not at login screen). Need `LaunchAgent` (user-level) not `LaunchDaemon` (system-level) unless you want it to run with no user logged in.
- **App Sandbox + Tauri:** if you ever distribute through Mac App Store, sandbox restrictions block local file access outside the app's container. For self-distributed (Developer ID notarized), no issue.
- **GSC OAuth refresh token expires after 6 months** of inactivity. If a client pauses service, reactivating requires a new OAuth dance.
- **Ahrefs API rate limits** — 60 req/min on Standard plan. With 15 clients × 5 calls each = 75 calls — may need to throttle or batch.

---

## Quick-reference commands

```bash
# Add a new client interactively
python scripts/add_client.py
# Prompts for: domain, contact email, brand voice, target keywords,
# then walks through Google OAuth handshake

# Manually run today's swarm for one client (testing)
python workers/daily_run.py --client acme-corp --skip-ingest

# Refresh just GSC data for one client
python workers/ingest/gsc_client.py --client acme-corp --since "yesterday"

# Test a single prompt against Ollama
python -c "
from workers.swarm_orchestrator import call_ollama
result = call_ollama('prompts/01_keyword_scout.md', open('test_dossier.txt').read())
print(result)
"

# View today's action plan as JSON
jq '.priorities[] | {rank, title, category}' clients/acme-corp/action_plans/$(date +%Y-%m-%d).json

# Generate a weekly report PDF for a client
python workers/report_generator.py --client acme-corp --week-ending today

# Launch dev mode (Tauri hot reload)
cd apps/dashboard && npm run tauri dev

# Build production .app
cd apps/dashboard && npm run tauri build

# Check Ollama is healthy
curl localhost:11434/api/tags

# Ollama performance benchmark
ollama run llama3.3:70b "Hello, write a one-sentence response."
# Should return in 1-3 seconds for short response

# View action history for one client (last 7 days)
sqlite3 clients/acme-corp/actions_log.db "
  SELECT date, title, status, traffic_delta_30d
  FROM actions
  WHERE date >= date('now', '-7 days')
  ORDER BY date DESC, rank ASC;
"
```

---

## What we lift verbatim from TERMINUS / MARKETING_SWARM patterns

These transfer with minor adaptation:

- **The 8-stage decomposition pattern** (parallel decomposers → strategy → executor)
- **Dossier-as-input** structure (TERMINUS dossier → SEO dossier; same shape)
- **Anti-pattern guards** in every prompt (no fabrication, empty-data honesty)
- **Per-client SQLite stores in WAL mode**
- **Encrypted credential storage** (Stronghold/AES)
- **Pushover notifications** on completion + errors
- **Resume logic** in long-running orchestrators
- **Tauri shell** with React frontend + Rust backend
- **CLI scripts** that the dashboard can invoke

What's genuinely new for TRAK:

- Multi-client management (TERMINUS is single-user)
- Ollama integration (instead of Candle/CUDA)
- macOS launchd (instead of Windows Task Scheduler / WSL cron)
- Per-client OAuth flows (instead of single user's API keys)
- WordPress REST integration (Mode B v2)
- Weekly client PDF report generation
- Mac code-signing + notarization for distribution

---

## Glossary

- **Action plan** — the daily output: prioritized list of what to do today + drafted deliverables
- **Adapter** (legacy term from TERMINUS) — in TRAK, this is just a system prompt for one stage in the chain
- **Compliance gate** — final filter that rejects outputs violating brand voice or Google guidelines (rule-based for MVP)
- **Connection** — an authorized integration with a third-party service (GSC, GA4, etc.) for one specific client
- **Dossier** — the structured daily input fed to all 8 stages
- **E-E-A-T** — Google's quality signals: Experience, Expertise, Authoritativeness, Trustworthiness
- **HCU** — Helpful Content Update (Google algorithm update penalizing low-value content)
- **KD** — Keyword Difficulty (0-100 score from Ahrefs/SEMrush)
- **Mode A** — review-only operating mode (operator manually publishes approved changes)
- **Mode B** — hybrid auto-publish operating mode (low-risk items auto-publish, high-risk stays manual)
- **Operator** — the single human running TRAK (initially: Steve)
- **SERP volatility** — how much top-10 results shift day-to-day for a keyword
- **Stage** — one node in the 8-stage chain (replaces "adapter" terminology since nothing is trained)
- **Striking distance keyword** — currently positioned 4-15, one optimization away from page 1
- **Topical authority** — Google's measure of how thoroughly a site covers a topic cluster
- **YMYL** — Your-Money-Your-Life industries (medical, legal, finance) requiring elevated E-E-A-T

---

## TL;DR — recipe summary

```
TRAK Automations = MARKETING_SWARM pattern, but:
  - On Mac M3 Max instead of Windows + WSL + CUDA
  - 70B raw model (Llama 3.3) via Ollama instead of trained 8x3B swarm
  - System prompts instead of LoRA training
  - Multi-client agency dashboard instead of single-tenant
  - Single operator (Steve) running 10-20 client websites

Cost:
  $0 training cost (no LoRAs to train)
  $30-55/client/mo data feeds + occasional API
  Hardware sunk cost (existing Mac)

Time to MVP:
  ~14 weeks (3.5 months) to running 3-5 client pilot

Revenue:
  Target: 12-15 clients × $1,500/mo = $216K-270K ARR
  Margin: 95-98% gross
```

---

*Last updated: 2026-04-30 · Maintained by: Steve + Claude (collaborative)*
*Sister doc to TERMINUS.md and MARKETING_SWARM.md*
