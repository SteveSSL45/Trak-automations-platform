# MARKETING-SWARM — Project North Star

*Reference doc for cross-chat context. Sister doc to `TERMINUS.md`. Same architectural pattern (Sonnet 4.6 → distilled local LoRA chain on SmolLM3-3B), different domain: SEO and marketing automation for a single company website.*

> **Mission:** Replace a 5-person SEO team with an 8-adapter local swarm that runs every morning, produces a prioritized action plan, drafts the actual deliverables (title tags, meta descriptions, content briefs, schema), and pushes them to a review queue. Frontier-quality reasoning at $0/day in API cost after a one-time ~$80 training run.

---

## Why this exists — economic + privacy case

| Approach | Cost / year | Privacy |
|---|---|---|
| 5-person in-house SEO team | $400K-600K | ✅ |
| External SEO agency | $80K-200K | ⚠️ shared with vendor |
| Daily Claude Sonnet 4.6 analysis | $1,800-3,600 | ⚠️ data sent to API |
| **Local 8-adapter swarm** | **~$80 one-time + $50/mo data feeds** | ✅ all local |

The local swarm doesn't replace human judgment — it **encodes the playbook of an elite SEO consultant**, runs it every day, and lets one human operator review/approve a plan that would take a team of 5 to produce manually.

---

## Hardware ceiling — same as TERMINUS

- **GPU:** RTX 4070 Ti Super 16 GB (or equivalent)
- **OS:** Windows + WSL2 Ubuntu, or native Linux
- **Practical model size:** 3B base for analyzer adapters, **optionally 7-8B base for the executor adapter** (content writing quality matters more than analysis prose)
- **VRAM during training:** ~5-7 GB working set per adapter
- **VRAM during inference:** ~7-9 GB (varies if mixed-base configuration)

**Mixed-base recommendation:**
- Analyzers (1-7 in chain): SmolLM3-3B — fast, accurate at structured analysis
- Executor (8): Qwen 2.5 7B Instruct or Llama 3.1 8B Instruct — meaningfully better content quality

This is a v2 optimization. Start with all 3B for MVP, swap executor base later if content quality is the limiting factor.

---

## The 8-adapter chain

### Architecture diagram

```
                              daily_seo_dossier
                                       │
        ┌──────────┬──────────┬───────┴───────┬───────────┬──────────┐
        ↓          ↓          ↓               ↓           ↓          ↓
   [1] KEYWORD  [2] CONTENT [3] TECHNICAL [4] COMPETITOR [5] BACKLINK [6] PERFORMANCE
       SCOUT       GAP        AUDIT          INTEL          INTEL       SIGNALS
        └──────────┴──────────┴───────┬───────┴───────────┴──────────┘
                                      ↓
                              [7] STRATEGY adapter
                          (priorities, sequencing, KPIs)
                                      ↓
                              [8] EXECUTOR adapter
                  (writes title tags, meta, content briefs, schema JSON)
                                      ↓
                          (optional) COMPLIANCE filter
                              (brand-voice + penalty-risk gate)
                                      ↓
                            today_action_plan.json
```

### Adapter responsibilities — detailed

#### 1. keyword_scout
**Job:** Find emerging ranking opportunities the team should target this week.
**Reads:** GSC query data (last 7d), keyword DB (Ahrefs/SEMrush), SERP volatility data.
**Outputs:** Top 5 keyword opportunities with intent classification, search volume, KD score, and "why now" justification.

**System prompt sketch:**
```
You are a senior keyword research analyst. From the dossier, identify
keywords meeting ALL of these criteria:
  - Site is positioned 4-15 (page 1 striking distance)
  - Search volume >= 100/mo
  - Commercial or informational intent (skip pure navigational)
  - Difficulty appropriate for the site's domain authority

Output: rank 5 by traffic-potential-per-effort. Include a one-sentence
"why this matters now" referencing recent SERP shifts or seasonal trends.
NEVER invent keyword volume numbers — cite only what's in the dossier.
```

#### 2. content_gap
**Job:** Identify topics competitors rank for that the site doesn't cover.
**Reads:** Competitor sitemaps, top-ranking pages for target keywords, your content inventory.
**Outputs:** Missing topics ranked by traffic potential and topical relevance to your business.

**Critical constraint:** Filter out topics that would dilute the site's topical authority. A SaaS company shouldn't suddenly write about cooking recipes even if they have keyword opportunity.

#### 3. technical_audit
**Job:** Flag site-health issues that could be tanking rankings or conversions.
**Reads:** PageSpeed Insights API, crawler output (Screaming Frog or homebrew), GSC indexing report, mobile usability flags.
**Outputs:** Top 3-5 issues by severity (Critical / High / Medium / Low) with specific fix recommendations.

**Severity ladder:**
- Critical: indexing blocked, robots.txt errors, site-wide canonical issues
- High: Core Web Vitals failing, broken internal links above 5%, missing schema on product pages
- Medium: page-speed regressions, schema warnings, duplicate meta descriptions
- Low: image alt-text gaps, sitemap freshness

#### 4. competitor_intel
**Job:** What are the top 3 competitors doing differently this week?
**Reads:** Competitor publishing frequency, ranking position deltas, new pages, new backlinks acquired.
**Outputs:** Strategic shifts you should react to (e.g., "Competitor X published 5 long-form guides on topic Y this week — they're targeting your bottom-funnel keywords").

**Critical constraint:** Don't recommend reactionary catch-up. The output should be: "this is what they're doing → here's whether/how to respond." Sometimes the answer is "ignore."

#### 5. backlink_intel
**Job:** Identify outreach opportunities and recover lost links.
**Reads:** Ahrefs/Moz/SEMrush backlink data, broken links pointing at the site, competitor backlink profiles.
**Outputs:** 3-5 prioritized backlink targets (sites/journalists to contact + the angle).

#### 6. performance_signals
**Job:** What's trending up/down on YOUR site this week?
**Reads:** GSC click/impression deltas, GA4 engagement and conversion deltas.
**Outputs:** Wins to amplify, losses to investigate, surprising patterns.

**Common patterns it should recognize:**
- A page rising in impressions but flat in clicks → title/meta CTR problem
- A page falling in position after recent edits → over-optimization
- A new conversion event spike → traffic source worth tripling down on
- A category-wide ranking decline → algorithm update or technical issue

#### 7. strategy
**Job:** Synthesize 1-6 into a prioritized weekly plan.
**Reads:** All 6 specialist outputs + business context (conversion goals, current quarter focus).
**Outputs:** Top 3 priorities with sequencing, KPI targets, and rationale.

**Critical:** This is the adapter most prone to the **exposure-bias problem** in TERMINUS — it must be trained on REAL adapter outputs from the 6 analyzers, not Claude's pristine versions. Same `regen_upstream.py` fix.

**Output format:**
```json
{
  "priorities": [
    {
      "rank": 1,
      "title": "Fix Core Web Vitals on /pricing page",
      "rationale": "Highest-conversion page failing LCP — 23% of mobile traffic affected",
      "estimated_impact": "+8-12% pricing-page conversions",
      "effort": "M",
      "owner_role": "engineer",
      "deadline_days": 7
    },
    ...
  ],
  "this_week_kpi_targets": {...},
  "rationale_summary": "Technical issues are the binding constraint this week..."
}
```

#### 8. executor
**Job:** Produce the actual deliverables — copy, schema, content briefs.
**Reads:** Strategy output + brand voice guide + content guidelines.
**Outputs:** Ready-to-ship artifacts — exact title tags, meta descriptions, content briefs (not full articles), schema JSON, internal linking suggestions.

**This is where mixing in a 7-8B base model makes a real difference.** A 3B model can produce competent meta descriptions; an 8B model produces measurably better ones (more specific, better CTR-driving language).

**Constraint:** This adapter should not write full long-form articles directly. Its job is high-leverage micro-copy + content briefs that humans (or a separate fine-tuned writer model) flesh out.

#### (Optional) Compliance gate
**Job:** Last-line review for brand-voice violations, Google penalty triggers, regulated-industry compliance.
**Implementation:** This can be a 9th adapter trained on rejected/approved historical pairs, OR a deterministic rule-set (regex patterns + keyword blocklists), OR a Claude API fallback for ambiguous cases.

**For MVP:** rule-based filter is fine. Upgrade to learned compliance adapter once you have 100+ historical "approved/rejected" labeled examples.

---

## Daily SEO dossier — format

Built once per day by the ingestion job. This is the structured input that all 8 adapters consume.

```
[SITE_OVERVIEW]
Domain: example.com
Primary topic clusters: SaaS-payments, fintech-API, developer-tools
Total indexed pages: 1,247
Domain Rating (Ahrefs): 52
30-day traffic baseline: 145,000 organic visits, 2,400 conversions
[END_SITE_OVERVIEW]

[GSC_DAILY]
(yesterday)
Top 20 queries by clicks:
  1. "stripe alternative" — 312 clicks, 4,120 impr, pos 3.2 (mobile-heavy)
  2. "payment api pricing" — 287 clicks, 5,030 impr, pos 4.1
  ...
Position deltas (24h):
  ↑ "developer payment integration" pos 8 → pos 5
  ↓ "merchant onboarding api" pos 6 → pos 11 [investigate]
[END_GSC_DAILY]

[GSC_WEEKLY]
(last 7 days, rolling)
Queries gaining position: [list of 10]
Queries losing position: [list of 10]
NEW queries (impressions but no clicks — title/meta opportunity): [list of 15]
[END_GSC_WEEKLY]

[GA4_DAILY]
Top 5 landing pages by sessions: ...
Bounce rate by traffic source: ...
Conversion events: ...
Notable: /pricing page bounce rate spiked from 32% to 41% yesterday
[END_GA4_DAILY]

[KEYWORD_OPPORTUNITIES]
Keywords positioned 4-15 (striking distance):
  - "stripe vs adyen" — vol 3,400/mo, KD 35, current pos 7, intent commercial
  - "payment fraud detection api" — vol 1,200/mo, KD 28, current pos 11
  ...
[END_KEYWORD_OPPORTUNITIES]

[COMPETITOR_DELTA]
(last 7 days vs prior 7 days)
Stripe.com:
  - Published 3 new docs pages on "subscription billing"
  - Gained 47 new backlinks (top: TechCrunch article)
  - Position changes for shared keywords: ↑ "payment api" pos 1→1, ↑ "stripe alternative" pos 12→8
Adyen.com:
  - No notable changes
Square.com:
  - Lost top-3 ranking on "small business payments"
[END_COMPETITOR_DELTA]

[BACKLINK_DELTA]
New backlinks (this week): 12 (top: Forbes contributor article DR 92)
Lost backlinks: 3 (medium quality, recoverable)
Broken inbound: 1 → /old-blog/post that 404s, redirect target identified
[END_BACKLINK_DELTA]

[TECHNICAL_AUDIT]
Core Web Vitals (last 24h):
  - /pricing — LCP 3.4s (POOR), FID OK, CLS OK ← critical
  - /docs/* — LCP 2.1s OK, FID OK, CLS OK
Indexing: 1,247 indexed of 1,289 in sitemap (42 pages need investigation)
Schema: 23 product pages missing Product schema
Mobile usability: 0 errors
[END_TECHNICAL_AUDIT]

[BRAND_CONTEXT]
Voice: technical but accessible, confident, never flippant
Audience: B2B SaaS engineering leaders + product managers
Prohibited: comparative claims about uptime, "fastest" or "best" superlatives without data,
            mentioning competitors negatively in body content (OK in alt-keyword pages)
Regulated-industry constraints: PCI compliance language must match approved templates
[END_BRAND_CONTEXT]

[CONVERSION_GOALS]
Primary: API key signup (current 1.8% from organic, target 2.5%)
Secondary: pricing page → demo request (current 0.4%, target 0.7%)
Engagement: docs time-on-page (current 2:14 avg, target 3:00)
[END_CONVERSION_GOALS]

[CURRENT_QUARTER_FOCUS]
Q4 2026 priority: capture "stripe alternative" cluster (commercial intent, expanding pie)
Secondary: improve developer-tools content depth (technical authority)
Deprioritized: brand-awareness top-funnel content
[END_CURRENT_QUARTER_FOCUS]
```

This dossier is ~3,000-4,000 tokens. Fits comfortably within SmolLM3-3B's 2,048 trained context after typical pruning of less-relevant sections per adapter.

---

## Data sources & APIs

| Source | What | Cost (1-site, 1-team scale) | API/access |
|---|---|---|---|
| **Google Search Console** | Query/page/position/CTR data | Free | `searchanalytics.query` API |
| **Google Analytics 4** | Engagement + conversion events | Free | GA4 Data API |
| **Ahrefs API** | Keyword volume, KD, competitor SERPs, backlinks | $99/mo Lite, $199/mo Standard | REST API |
| **DataForSEO** | SERP scraping, keyword volatility | $0.0005/keyword query — pay per use | REST API |
| **PageSpeed Insights** | Core Web Vitals, performance | Free (5K req/day) | API |
| **Your CMS** | Content inventory, publishing, schema | Free | WordPress / Webflow / Strapi REST |
| **Crawler** | Internal links, schema, broken links | Free (homebrew) or $200/yr Screaming Frog | CLI |
| **Email outreach platform** (optional) | Backlink outreach automation | $50/mo (Pitchbox / Postaga) | REST |

**Lean MVP stack (~$50-100/month):** GSC + GA4 + DataForSEO (pay-per-use, ~$30/mo at moderate volume) + PageSpeed + homebrew crawler. Skip Ahrefs/SEMrush until you've proven value.

**Scale-up (~$200-400/month):** Add Ahrefs API for richer backlink + competitor data once the swarm is producing daily plans your team is actually executing.

---

## Training pipeline — mirrors TERMINUS Phase 1-2-3

### Phase 1 — Generate training data via Claude Sonnet 4.6

The hardest part is **curating diverse, realistic SEO scenarios**. Suggested mix for 1,000 examples:

| Source | Count | Notes |
|---|---|---|
| Real client cases (anonymized) | 200 | Best signal — actual outcomes documented |
| Public case studies | 300 | Backlinko, Search Engine Journal, Moz Top 10, Aleyda Solis blog, etc. — reverse-engineer the dossier from the case study |
| Synthetic edge cases | 500 | Generated by Claude with consultant-level prompts: "site with X traffic struggling with Y commercial intent keyword, here's the right diagnosis" |

**Edge cases to deliberately include:**
- Google algorithm update penalties (HCU, core updates, spam updates)
- Local SEO scenarios (single-location vs multi-location)
- E-commerce vs B2B SaaS vs media vs lead-gen
- Multilingual / international SEO (hreflang, ccTLDs)
- Regulated industries (medical, legal, finance) with YMYL constraints
- Sites recovering from manual actions
- Brand-new sites with no domain authority
- Established sites in saturated niches

**Cost & time:**
```
historical_seo_dossier_builder.py --n 1000

API calls per scenario: 2 (analyst + decomposer)
Token estimate per scenario: 5K input + 3K output = 8K total
Total tokens: 8K × 1000 = 8M
Cost on Sonnet 4.6: $24 input + $45 output = ~$69
Wall time: ~12-15 hours
```

### Phase 2 — Train the 8 LoRAs

Same `train_agent.py` pattern as TERMINUS. The chain:

```
Stage A — 6 analyzer adapters (independent, can train sequentially or in parallel):
  python train_agent.py keyword_scout         → lora_keyword_scout/
  python train_agent.py content_gap           → lora_content_gap/
  python train_agent.py technical_audit       → lora_technical_audit/
  python train_agent.py competitor_intel      → lora_competitor_intel/
  python train_agent.py backlink_intel        → lora_backlink_intel/
  python train_agent.py performance_signals   → lora_performance_signals/

Stage B — strategy (depends on Stage A):
  python regen_upstream.py strategy           → rebuild strategy.jsonl with REAL adapter outputs
  python train_agent.py strategy              → lora_strategy/

Stage C — executor (depends on Stage A + B):
  python regen_upstream.py executor           → rebuild executor.jsonl with REAL adapter outputs incl. strategy
  python train_agent.py executor              → lora_executor/

(Optional) Stage D — compliance:
  python regen_upstream.py compliance
  python train_agent.py compliance            → lora_compliance/
```

**Total wall time:** ~17-20h on a 4070 Ti Super.

### Phase 2 critical — exposure-bias fix carries over

Just like TERMINUS, the strategy and executor adapters MUST be trained on real upstream-adapter outputs, not Claude's idealized versions. Otherwise they'll degrade catastrophically at runtime when fed rougher real-adapter text.

`regen_upstream.py strategy` flow:
```python
for each of 1000 dossiers:
    keyword_out         = trained_keyword_scout(dossier)        # REAL output
    content_gap_out     = trained_content_gap(dossier)
    technical_out       = trained_technical_audit(dossier)
    competitor_out      = trained_competitor_intel(dossier)
    backlink_out        = trained_backlink_intel(dossier)
    performance_out     = trained_performance_signals(dossier)

    new_prompt = dossier + 6 [SECTION]: section_out blocks
    label = Claude's strategy_text (kept as the gold target)
    write to datasets/strategy.jsonl
```

Same pattern, one layer deeper, for `executor`.

### Phase 3 — Daily runtime

```bash
#!/bin/bash
# daily_seo_run.sh — scheduled at 6:00 AM via cron / Task Scheduler

cd ~/marketing-swarm

# 1. Ingest fresh data into local SQLite
python ingest/gsc.py --since "yesterday"
python ingest/ga4.py --since "yesterday"
python ingest/competitor_serps.py --top-3
python ingest/backlinks.py
python ingest/site_crawl.py
python ingest/pagespeed.py --pages-from sitemap.xml

# 2. Build today's dossier
python build_seo_dossier.py --date today > today_dossier.txt

# 3. Run the swarm
./run_seo_swarm.sh today_dossier.txt > today_action_plan.json

# 4. Compliance filter (rule-based for MVP, learned adapter later)
python compliance_check.py today_action_plan.json > approved_actions.json

# 5. Notify team / push to dashboard
python notify_team.py approved_actions.json
```

---

## Code layout (planned)

Mirrors TERMINUS structure for portability and shared learnings:

### Desktop UI (Tauri, optional Phase 4)

| File | Role |
|---|---|
| `src/App.tsx` | Daily Action Plan dashboard (cards for each priority + approve buttons) |
| `src/components/PriorityCard.tsx` | Per-priority UI: rationale, estimated impact, owner, approve/skip |
| `src/components/DraftReview.tsx` | Show executor outputs (title tags, meta, content briefs) for review |
| `src-tauri/src/swarm/mod.rs` | 8-adapter chain orchestration (lift from TERMINUS, change adapter names) |

### Python ingestion + training (WSL)

| File | Role |
|---|---|
| `ingest/gsc.py` | Daily GSC pull, writes to `gsc_snapshots.db` |
| `ingest/ga4.py` | Daily GA4 pull |
| `ingest/competitor_serps.py` | DataForSEO competitor SERP fetching |
| `ingest/backlinks.py` | Ahrefs/Moz API pull |
| `ingest/site_crawl.py` | Homebrew crawler or Screaming Frog CLI wrapper |
| `ingest/pagespeed.py` | PageSpeed Insights API for top pages |
| `build_seo_dossier.py` | Aggregates ingestion outputs into the structured dossier |
| `historical_seo_dossier_builder.py` | Training-data generator (Claude Sonnet 4.6) |
| `decompose.py` | Pydantic 8-stage decomposition schema |
| `train_agent.py` | Single-adapter trainer (lift from TERMINUS) |
| `regen_upstream.py` | Exposure-bias fix for strategy + executor (lift from TERMINUS) |
| `train_all.sh` | Master orchestrator (lift from TERMINUS, extend to 10-stage chain) |

### Local SQLite stores

| DB | Contents |
|---|---|
| `gsc_snapshots.db` | Daily GSC pulls — query/page/position/clicks/impressions over time |
| `ga4_snapshots.db` | Daily GA4 pulls — landing-page engagement, conversion events |
| `competitor_intel.db` | Competitor publishing log, ranking position history, backlink deltas |
| `backlink_history.db` | Inbound backlinks, lost links, outreach status |
| `site_crawl.db` | Internal link graph, schema audit, broken links |
| `actions_log.db` | Daily action plans + approved/skipped status + outcome correlation |

The `actions_log.db` is critical for the **feedback loop**: track which approved actions correlate with positive ranking/traffic deltas 30/60/90 days later. Feeds into next quarterly retrain.

---

## Daily action plan output schema

```json
{
  "date": "2026-04-30",
  "site": "example.com",
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
      "deliverables_ref": ["technical_briefs/2026-04-30-pricing-lcp.md"]
    },
    {
      "rank": 2,
      "category": "content",
      "title": "Publish 'Stripe vs Adyen' comparison page",
      "rationale": "Currently positioned 7 for 'stripe alternative' (3,400 vol/mo). Competitor coverage gap — direct comparison page absent. Commercial intent.",
      "estimated_impact": "+1,200 visits/mo at 2.1% conversion = ~25 demos/mo",
      "effort": "L",
      "owner_role": "content",
      "deadline_days": 14,
      "deliverables_ref": ["content_briefs/2026-04-30-stripe-vs-adyen.md"]
    },
    {
      "rank": 3,
      "category": "outreach",
      "title": "Reclaim 3 lost backlinks from medium-DR sources",
      "rationale": "Lost 3 backlinks last week (DR 45-60). All recoverable — hosts moved URLs but didn't update outbound links. Target email templates drafted.",
      "estimated_impact": "Restore lost referring domains; minimal ranking impact but compound long-term",
      "effort": "S",
      "owner_role": "outreach",
      "deadline_days": 5,
      "deliverables_ref": ["outreach_drafts/2026-04-30-link-reclaim.md"]
    }
  ],
  "deliverables": {
    "title_tag_revisions": [
      {
        "url": "/pricing",
        "current": "Pricing | Example",
        "proposed": "Stripe Alternative Pricing — Save 30% with Example",
        "rationale": "CTR 1.4% vs 2.8% benchmark; commercial intent keyword match"
      }
    ],
    "meta_description_revisions": [...],
    "schema_additions": [
      {
        "url": "/products/payment-api",
        "schema_type": "Product",
        "json_ld": "...",
        "validation_status": "passed"
      }
    ],
    "content_briefs": [
      {
        "title": "Stripe vs Adyen — A Developer's Comparison Guide",
        "target_keyword": "stripe vs adyen",
        "search_intent": "commercial_comparison",
        "target_word_count": 2200,
        "outline": [...],
        "internal_link_targets": [...],
        "external_research_required": [...]
      }
    ]
  },
  "kpi_targets_this_week": {
    "organic_traffic": "+3% WoW",
    "pricing_page_conversions": "+5% WoW",
    "indexed_pages": "1,260 (currently 1,247)"
  },
  "confidence": 78,
  "synth_summary": "Technical issues are the binding constraint this week — fix LCP first, then content gap second. Outreach is low-effort recovery work for off-hours.",
  "_agents": {
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

The `_agents` field exposes each adapter's raw output for transparency / debugging — same pattern as TERMINUS's swarm output JSON.

---

## Critical anti-pattern guards (in every adapter prompt)

Direct lifts from TERMINUS, adapted for SEO domain:

- **Empty-data honesty:** if the dossier shows no GSC data / no competitor changes / no new backlinks, the adapter must say so plainly — *"No notable competitor shifts detected this week"* — NEVER invent activity to fill space.
- **No fabricated metrics:** never invent search volumes, KD scores, traffic numbers, or position rankings. Cite ONLY what's in the dossier.
- **No reactive over-rotation:** if a competitor publishes 5 new pages, the answer isn't always "publish 5 new pages." The strategy adapter must consider whether reaction is the right move.
- **Brand voice immutability:** the executor adapter must respect the [BRAND_CONTEXT] section. If brand voice says "never use 'fastest' without data," the adapter cannot generate a meta description with "fastest payment API."
- **YMYL caution:** for Your-Money-Your-Life industries (medical, legal, finance), the executor must add E-E-A-T signals (author bio refs, sourcing, credentials) and avoid ungrounded claims.

---

## Differences from TERMINUS

| | TERMINUS | Marketing-Swarm |
|---|---|---|
| **Trigger** | User clicks button on a ticker | Cron job, daily at 6 AM |
| **Input cadence** | Per-event (live tape) | Once per day (batch ingestion) |
| **Time horizon of decisions** | Same-day to weeks | Days to months (SEO compounds slowly) |
| **Cost of error** | Real money loss instantly | Slow ranking growth, recoverable |
| **Synthesizer outputs** | Trade JSON (sentiment, strategy, confidence) | Action plan + draft deliverables |
| **Compliance gate** | None (paper-trade safety) | **Critical** — Google penalty triggers, brand voice, regulatory |
| **Adapter count** | 7 | **8** (adds executor for content drafting) |
| **Base model** | SmolLM3-3B for everything | **Mixed** — 3B for analyzers, 7-8B for executor |
| **Training data source** | Whale events from `whale_flow.db` | Curated SEO case studies (manual + synthetic) |
| **Refresh cadence** | Sunday retrain | Quarterly retrain on rolling case-study DB |
| **Frontier-model fallback** | Blue Claude button next to swarm button | Claude only for monthly strategic review (not per-day) |
| **Auto-execution** | Optional paper-trader | Optional CMS auto-publish on approve |
| **UI** | Tauri desktop, real-time | Tauri desktop OR web dashboard (team friendly) |
| **Feedback loop** | Outcome correlation via prediction outcomes | 30/60/90-day ranking/traffic correlation in `actions_log.db` |

---

## MVP roadmap — 4 phases

### Phase 1 — Single adapter proof of value (2 weeks)

Build only `keyword_scout`. Daily run that ingests GSC + a keyword DB and outputs "5 ranking opportunities for tomorrow."

**Success criterion:** if the recommendations beat what your team would generate manually for 2 weeks, the concept is validated. If they don't, debug the prompt / training data before scaling up.

**What you need:**
- GSC API access + Python ingest script
- One keyword data source (DataForSEO is cheapest to start)
- 100 curated training scenarios (focus only on keyword-research cases)
- One trained LoRA on SmolLM3-3B
- A simple cron job + Slack/email output

**Cost: ~$10 for training data + $30/mo data feeds.**

### Phase 2 — Add the 5 other analysis adapters (4-6 weeks)

Expand to all 6 first-stage adapters. Output is now 6 separate cards (no synthesis yet). Train each adapter independently following the same pattern.

**Success criterion:** the 6 adapters produce outputs that, manually combined by a human, would form a coherent weekly plan.

### Phase 3 — Add strategy + executor (3-4 weeks)

Wire up the synthesizer chain with `regen_upstream.py` for both strategy and executor. Now the system produces a coherent prioritized plan + drafted deliverables, not 6 disconnected reports.

**Success criterion:** the daily plan + drafts can be reviewed and approved in under 15 minutes by one person, vs. ~4 hours for a manual SEO audit.

### Phase 4 — Compliance gate + auto-execution (4-6 weeks)

Add the brand-voice/penalty-risk filter (rule-based first, learned adapter v2). Wire approved actions to CMS APIs (WordPress, Webflow) for one-click execution.

**Success criterion:** for low-risk actions (meta description updates, schema additions), the system reaches "approve once, auto-publish" reliability. High-risk actions (full content publishing) stay human-in-the-loop.

**Total to MVP: ~3-4 months.** Same order of magnitude as TERMINUS.

---

## Operational learnings to anticipate (from TERMINUS lessons)

- **Don't run training jobs twice.** Same `pgrep -cf` duplicate-launch guard pattern.
- **Disable Windows sleep / hibernate during training.** Same `powercfg /change standby-timeout-ac 0`.
- **WAL mode on all writer SQLite DBs.** Prevent concurrency corruption (we lost news_tape.db once for this).
- **CRLF in `.env` will silently mangle API keys.** Same workaround: parse keys with `grep | cut | tr -d '\r\n'`.
- **`max_tokens` on JSON-output decompositions needs headroom.** Set 4096+ when the schema has 8 fields.
- **`stdbuf -oL -eL` + `PYTHONUNBUFFERED=1` in the training orchestrator** so tqdm output isn't buffered by 30+ minutes.
- **Resume logic in `regen_upstream.py`.** Open in append mode, count existing rows, skip first N. Already proven in TERMINUS.

---

## Quick-reference commands (planned)

```bash
# Ingest yesterday's data manually
cd ~/marketing-swarm
python ingest/gsc.py --since "yesterday"
python ingest/ga4.py --since "yesterday"

# Build today's dossier
python build_seo_dossier.py --date today

# Smoke-test a single adapter
python -c "
from unsloth import FastLanguageModel
m, t = FastLanguageModel.from_pretrained(model_name='lora_keyword_scout', max_seq_length=2048, load_in_4bit=True)
FastLanguageModel.for_inference(m)
prompt = open('today_dossier.txt').read()
inputs = t.apply_chat_template([{'role':'user','content':prompt}], return_tensors='pt', add_generation_prompt=True).to('cuda')
out = m.generate(inputs, max_new_tokens=400, do_sample=False, pad_token_id=t.eos_token_id)
print(t.decode(out[0][inputs.shape[1]:], skip_special_tokens=True))
"

# Run full daily chain
./run_seo_swarm.sh today_dossier.txt > today_action_plan.json

# View today's plan
jq '.priorities[] | {rank, title, rationale}' today_action_plan.json

# Check action history (what did we do last week, what was the outcome?)
sqlite3 actions_log.db "
SELECT date, title, status, traffic_delta_30d
FROM actions
WHERE date >= date('now', '-7 days')
ORDER BY date DESC, rank ASC;
"

# Quarterly retrain (when training data has grown by 100+ scenarios)
./train_all.sh
```

---

## Glossary

- **Action plan** — the daily output: prioritized list of what to do today + drafted deliverables
- **Adapter** — a LoRA weight set specializing the base model for one task
- **Compliance gate** — final filter that rejects outputs violating brand voice or Google guidelines
- **Dossier** — the structured daily input fed to all 8 adapters
- **E-E-A-T** — Google's quality signals: Experience, Expertise, Authoritativeness, Trustworthiness
- **Exposure bias** — mismatch between training inputs (Claude's idealized) and runtime inputs (real adapter output) — fixed by `regen_upstream.py`
- **HCU** — Helpful Content Update (Google algorithm update penalizing low-value content)
- **KD** — Keyword Difficulty (0-100 score from Ahrefs/SEMrush)
- **SERP volatility** — how much the top-10 results shift day-to-day for a keyword (signal of algorithm activity)
- **Striking distance keyword** — currently positioned 4-15, one optimization away from page 1
- **Topical authority** — Google's measure of how thoroughly a site covers a topic cluster
- **YMYL** — Your-Money-Your-Life industries (medical, legal, finance) requiring elevated E-E-A-T

---

## What to copy verbatim from TERMINUS

These transfer with no modification — change only adapter names + dataset paths:

- `decompose.py` — Pydantic schema pattern
- `train_agent.py` — works as-is
- `regen_upstream.py` — same exposure-bias fix
- `train_all.sh` — extend to 10-stage chain
- Resume / duplicate-guard / Pushover notification patterns
- Tauri Rust swarm engine (`mod.rs`) — works for any LoRA chain with config changes
- `.bashrc` non-interactive guard, CRLF .env workaround, sleep prevention

These need new code:
- All `ingest/*.py` scripts (GSC, GA4, Ahrefs, etc.)
- `build_seo_dossier.py`
- `compliance_check.py`
- CMS auto-execution layer (per platform)
- Action-outcome correlation (`actions_log.db` schema + 30/60/90-day deltas)

---

## TL;DR — recipe summary

```
Marketing-Swarm = TERMINUS pattern with:
  6 analyzer adapters (parallel) + strategy + executor (synthesizers) + compliance (filter)

Replace:
  whale_flow.db          → site_snapshots.db (GSC, GA4, competitor, backlinks)
  catalyst hunters       → SEO analyzers
  risk + synth           → strategy + executor
  trade JSON             → action plan JSON
  paper-trader           → CMS auto-publish (Phase 4)
  Sunday retrain         → quarterly retrain

Cost:
  ~$80 one-time training (Claude API for training-data generation)
  ~$50/mo data feeds (DataForSEO + cheap APIs)
  $0/day inference cost (local hardware)

Time:
  ~16-18 hours training on a 4070 Ti Super
  ~3-4 months MVP build (4 phases of de-risking)

Hardware:
  Same as TERMINUS — RTX 4070 Ti Super 16 GB, Windows + WSL2 Ubuntu
```

---

*Last updated: 2026-04-30 · Maintained by: Steve + Claude (collaborative)*
*Sister doc to TERMINUS.md*
