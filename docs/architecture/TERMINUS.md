# TERMINUS — Project North Star

*Reference doc to drop into any Claude session for context. Companion to `TERMINUS_ARCHITECTURE.md` (which covers infra/services/data layers); this doc focuses on **the AI swarm chain, training pipeline, and operational lessons**.*

> **Builder:** Steve (stevel62280@gmail.com) · **Goal:** Distill an elite Unusual Options Activity (UOA) specialist from Claude Sonnet 4.6 into a **local 7-adapter swarm** running on a single 4070 Ti Super, free of cloud cost at inference time. Long-term mission: family financial freedom via personal options-trading desktop.

---

## Hardware ceiling — read this first

- **GPU:** RTX 4070 Ti Super 16 GB (single)
- **OS:** Windows 11, with WSL2 Ubuntu for training
- **Practical model size:** **3B parameter base** with rank-32 LoRA adapters in 4-bit (Unsloth). Larger bases (7B+) fit but require compromises that hurt quality. The current swarm uses **SmolLM3-3B** (Apache 2.0, 36 layers, GQA 4:1, ChatML format).
- **VRAM during training:** ~5-7 GB working set, but PyTorch's caching allocator may show ~15 GB allocated. That's normal — as long as no OOM, it's fine.
- **VRAM during inference (live swarm):** ~7 GB total (base + 7 adapters + KV cache).
- **Coexistence:** Originally designed to coexist with a v3 14B Q4_K_M (8 GB) Ollama model. Currently the chain is the dominant workload.

---

## The two AI buttons

Both buttons consume the **identical dossier** built in `App.tsx` so head-to-head is fair:

| Button | What runs | Cost | Notes |
|---|---|---|---|
| 🟢 **TERMINUS** (green) | 7-adapter SmolLM3-3B swarm via Candle in Rust | $0 | Local, ~7 GB VRAM, ~5-10s end-to-end |
| 🔵 **Claude** (blue) | Claude Sonnet 4.6 API via `claude-sonnet-4-6` | ~$0.04-0.08/click | Cloud reference — gold-tier reasoning |

The dossier (live) has these sections, in this order, fed to BOTH paths:

```
WHALE ALERTS (ticker)              ← from whale_alerts.db / live tape
NEWS CATALYSTS (last 7d)           ← /catalyst/news/{ticker} (FinBERT-scored news_tape.db)
SEC FILINGS                        ← /catalyst/filings/{ticker} (ChromaDB RAG)
INSIDER ACTIVITY                   ← /catalyst/insider/{ticker} (ChromaDB RAG)
CATALYST CALENDAR (next 60d)       ← /catalyst/calendar/{ticker} (calendar.db + yfinance)
SPX GAMMA (only for SPX/SPY/QQQ/IWM) ← from Schwab option chain
```

**Macro/bond regime is intentionally OUT of the swarm chain** — it lives only on the right-rail UI card. Whale flow doesn't correlate with VIX/yields strongly enough at the per-ticker level to dominate analysis.

---

## The 7-adapter swarm chain

Architectural lineage:
- **v1 (April):** 4 adapters — whale + macro + risk + synth. Macro-heavy framing.
- **v2 (April 27):** 6 adapters — replaced macro slot with 3 catalyst hunters (news, filings, insider) to answer *"why did the whale buy?"* not *"what's the macro picture?"*
- **v3 (April 27, current):** 7 adapters — added **calendar** for time-arithmetic (expiry vs scheduled events). Crucial for biotech FDA / earnings-runner / FOMC-capture pattern recognition.

### The chain at runtime

```
                                   raw dossier (App.tsx → Rust)
                                            ↓
                  ┌─────────────────┬──────┴──┬─────────────────┬─────────────────┐
                  ↓                 ↓         ↓                 ↓                 ↓
          [1] WHALE adapter  [2] NEWS    [3] FILINGS    [4] INSIDER       [5] CALENDAR
             (option flow)   (catalyst)  (SEC docs)     (Form 4 buys)     (time arithmetic)
                  └─────────────────┴──────┬──┴─────────────────┴─────────────────┘
                                           ↓
                   raw + [WHALE] + [NEWS] + [FILINGS] + [INSIDER] + [CALENDAR]
                                           ↓
                                  [6] RISK adapter
                                  (synthesis + risk dim)
                                           ↓
                   raw + [WHALE] + [NEWS] + [FILINGS] + [INSIDER] + [CALENDAR] + [RISK]
                                           ↓
                                  [7] SYNTH adapter
                                  (final JSON: sentiment, confidence,
                                   strategy, reasoning, tags)
```

### Adapter responsibilities (one-line each)

| # | Adapter | Job | Reads | Writes |
|---|---|---|---|---|
| 1 | whale | "What did the institution do, in isolation?" Cite size/premium/V/OI ratio. | raw dossier | 1-2 sentences |
| 2 | news | "What news catalyst could explain the flow?" Cite headlines + FinBERT. | raw dossier | 1-2 sentences |
| 3 | filings | "What SEC filing supports/contradicts?" 10-Q/10-K/8-K material disclosures. | raw dossier | 1-2 sentences |
| 4 | insider | "Do execs confirm or contradict?" Form 4 buys/sells. | raw dossier | 1-2 sentences |
| 5 | calendar | "How does the expiry sit vs scheduled events?" Pure time arithmetic. | raw dossier | 1-2 sentences |
| 6 | risk | "Are signals aligned (directional) or contradicting (defensive)?" + IV/decay/sizing. | raw + 1-5 outputs | 2-3 sentences |
| 7 | synth | Final JSON: sentiment, confidence, strategy, reasoning, recommended_strategies, tags | raw + 1-6 outputs | strict JSON |

### Critical anti-pattern guards in every adapter prompt

- **Empty-data honesty:** if the dossier shows no news/filings/insider/calendar events, the adapter must say so plainly — *"No news catalyst identified in available data"* — NOT invent one.
- **No backtest-field leakage:** never reference internal field names like `STRATEGY_FIRED`, `HORIZON_FIRED`, `BACKTEST_GRADED`, `VOL_RATIO`, `ENTRY_CLOSE`. Plain English only.
- **SELL_PUT semantics:** SELL_PUT is BULLISH (premium collection on puts), not bearish. Every prompt has this rule.
- **V/OI when present, contracts when absent:** when the whale block shows OI > 0, name the V/OI multiple explicitly ("volume 13x open interest"). When absent, reason from contract count + premium without inventing OI.

---

## Training pipeline (offline)

Lives in WSL Ubuntu at `~/terminus-train/swarm-engine/`. Three phases, fully scripted in `train_all.sh` (sequential 9-stage chain).

### Phase 1 — Generate training data (Claude API)

Run from WSL (uses `swarm_env` venv):

```bash
python historical_dossier_builder.py --n 1000 --seed 42
```

What happens:
1. Sample 1,000 diverse whale events from `whale_flow.db` (capped at 4 per ticker via `MAX_EVENTS_PER_TICKER` for diversity)
2. For each event, **rebuild the dossier as-of-event-time**:
   - News: pre-event headlines from `news_tape.db` (time-filtered by `ts_ms`)
   - Filings: SEC docs from ChromaDB `quant_memory` collection with `date` metadata post-filter
   - Insider: Form 4 transactions from same ChromaDB collection
   - Calendar: macro events from `calendar.db` + per-ticker yfinance earnings (with day-offsets from BOTH event date and expiry date)
3. Two Claude Sonnet 4.6 API calls per event:
   - **Analyst pass** — write a 6-8 paragraph elite-trader analysis from the dossier
   - **Decomposer pass** — split that analysis into the 7-stage Pydantic schema (`whale_text`, `news_text`, `filings_text`, `insider_text`, `calendar_text`, `risk_text`, `synth_text`)
4. Fan out into **7 JSONL files** in `datasets/`:
   - First 5 stages share the SAME raw prompt (parallel decomposers)
   - Stage 6 (risk) prompt = raw + 5 upstream outputs
   - Stage 7 (synth) prompt = raw + 6 upstream outputs

**Cost:** ~$57 for 1,000 events with Sonnet 4.6 (5.25M input @ $3/M + 2.76M output @ $15/M).
**Time:** ~17 hours wall-clock on a single API thread.
**Resumable:** checkpoint saved every 10 events to `datasets/.dossier_progress.json`.

**Defaults (in `historical_dossier_builder.py`):**
- `MAX_EVENTS_PER_TICKER = 4` — diversity guard
- `--max-tokens 4096` — bumped from 2048 to prevent JSON truncation on the 7-field schema
- `--model claude-sonnet-4-6` — Sonnet 4.6 default; `--model claude-opus-4-7` for ~3x cost frontier quality

### Phase 2 — Train the 7 adapters (local GPU)

Run from WSL (uses `swarm_env` with `unsloth`, `trl`, `peft`, `bitsandbytes`):

```bash
./train_all.sh   # full 9-stage chain, idempotent + resumable
```

Internally executes:

```
Stage A: 5 first-stage adapters (independent, sequential ~50 min each):
  python train_agent.py whale       → lora_whale_spotter/
  python train_agent.py news        → lora_news/
  python train_agent.py filings     → lora_filings/
  python train_agent.py insider     → lora_insider/
  python train_agent.py calendar    → lora_calendar/

Stage B: risk (depends on Stage A):
  python regen_upstream.py risk     → rebuilds datasets/risk.jsonl using REAL trained-adapter outputs (~3.5h)
  python train_agent.py risk        → lora_risk/

Stage C: synth (depends on Stage A + B):
  python regen_upstream.py synth    → rebuilds datasets/synth.jsonl using REAL outputs (~5h)
  python train_agent.py synth       → lora_synth/
```

**Total wall time:** ~14-17 hours on a 4070 Ti Super.

**train_agent.py settings (per adapter):**
- Base: `unsloth/SmolLM3-3B-bnb-4bit` (4-bit, max_seq=2048)
- LoRA: `r=32`, `alpha=32`, `dropout=0`, target modules = `q,k,v,o,gate,up,down` (all 7)
- 5 epochs, `per_device_train_batch_size=2`, `gradient_accumulation_steps=4` (effective batch=8)
- AdamW 8-bit, cosine LR scheduler, 2e-4 LR, 0.03 warmup
- bf16 if supported (4070 Ti Super does), else fp16
- Saves to `lora_<name>/adapter_model.safetensors` (~242 MB each)

### Phase 2 critical concept — the exposure-bias fix

The first 5 adapters can be trained directly on Claude's idealized decomposition because they all read the **same raw dossier** at training time and runtime — input distribution matches.

**Risk and synth are different.** At runtime, they read the OUTPUT of the trained upstream adapters (rougher, slightly distribution-shifted from Claude's pristine version). If we trained risk on Claude's idealized upstream text, it would degrade catastrophically at runtime when fed real adapter output.

**`regen_upstream.py` fixes this:**
1. Run all 5 trained first-stage adapters on each of the 1,050 raw prompts → get REAL adapter outputs
2. Rebuild risk's training prompt: `raw + [WHALE]: real_whale_out + [NEWS]: real_news_out + ...`
3. Keep Claude's idealized `risk_text` as the LABEL
4. Train risk on `(real_upstream → idealized_risk_label)` pairs

Same for synth, one layer deeper (also runs trained risk on top).

This is **scheduled sampling at the agent level**. Without it, the chain looks great in unit tests (pristine inputs) but falls apart at runtime.

### Phase 3 — Rebuild Tauri to ship the new chain

```bash
cd /mnt/c/options-terminal/apps/desktop/src-tauri
cargo build --release
```

The Rust swarm code (`src/swarm/mod.rs`) loads adapters from `\\wsl.localhost\Ubuntu\home\steve\terminus-train\swarm-engine\` at first click of the green TERMINUS button (lazy-load to keep VRAM free until needed).

---

## Code layout (the parts that matter)

### Desktop (Tauri Rust + React) — `apps/desktop/`

| File | Role |
|---|---|
| `src/App.tsx` | Main UI; `handleSwarmAnalyze` builds the dossier (whale + news + filings + insider + calendar + gamma) and calls `runSwarmAnalysis` |
| `src/components/LeftPanel.tsx` | Agent breakdown UI — shows each adapter's output |
| `src/lib/tauri.ts` | Frontend wrappers: `getCatalystNews`, `getCatalystFilings`, `getCatalystInsider`, `getCatalystCalendar`, `runSwarmAnalysis` |
| `src-tauri/src/swarm/mod.rs` | **The 7-adapter chain orchestrator.** Defines `ADAPTER_*` constants, `*_prompt()` functions, and `run_swarm_analysis` Tauri command |
| `src-tauri/src/swarm/engine.rs` | Candle-based base+LoRA inference; `apply_adapter()` hot-swaps LoRAs |
| `src-tauri/src/swarm/lora_llama.rs` | Llama-architecture transformer with NoPE-every-4th-layer (SmolLM3 quirk) |
| `src-tauri/src/swarm/adapter.rs` | LoRA weight parsing from `adapter_model.safetensors` |
| `src-tauri/src/scanner_commands.rs` | Whale flow detector + alert ingestion |

### Quant-engine (Python FastAPI) — `services/quant-engine/`

| File | Role |
|---|---|
| `app/main.py` | All FastAPI endpoints: `/catalyst/news/{ticker}`, `/catalyst/filings/{ticker}`, `/catalyst/insider/{ticker}`, `/catalyst/calendar/{ticker}`, `/analyze-with-quantbrain`, etc. |
| `app/db.py` | `whale_flow.db` schema + `log_whale_alert()`. Has `open_interest` + `voi_ratio` columns (added 2026-04-27 for biotech UOA detection) |
| `app/dossier.py` | Reference dossier builder (used by some pipelines) |
| `app/scanner.py` | `generate_flow_alert()` — fetches OI from Alpaca synchronously per whale and computes V/OI |
| `app/calendar_feed.py` | `calendar.db` + macro-events seed (FOMC × 8, CPI × 12, NFP × 12, OPEX × 12 hardcoded for 2026) + yfinance per-ticker earnings/ex-div |
| `app/backfill_catalyst_type.py` | One-shot Haiku 4.5 batch classifier that populates `catalyst_type` in `news_tape.db` (controlled vocab: earnings/guidance/fda_approval/analyst/mna/product/regulatory/insider/corporate_action/macro/other) |
| `app/quantbrain.py` | `_get_collection()` for ChromaDB RAG access |
| `app/claude_validator.py` | Claude-as-validator pipeline for prediction outcome correlation |
| `app/plan_generator.py` | Daily trading plan generator (uses Claude Sonnet 4.6 unconditionally — fixed 2026-04-27 to prevent Ollama auto-load) |
| `app/pushover.py` | Phone notifications (env: `PUSHOVER_APP_TOKEN`, `PUSHOVER_USER_KEY`) |

### Training (WSL Ubuntu) — `~/terminus-train/swarm-engine/`

| File | Role |
|---|---|
| `historical_dossier_builder.py` | **Primary training-data generator.** Walks `whale_flow.db`, rebuilds dossier as-of-event-time, calls Claude Sonnet 4.6 for analyst+decomposer, fans out to 7 JSONL files |
| `decompose.py` | Alternative decomposer for existing single-stage source datasets |
| `train_agent.py` | Single-adapter trainer; takes one of `whale/news/filings/insider/calendar/risk/synth` as arg |
| `regen_upstream.py risk` | Runs 5 trained adapters on every prompt to rebuild risk's training data with REAL upstream |
| `regen_upstream.py synth` | Same, plus runs trained risk for synth's training data |
| `train_all.sh` | **Master orchestrator.** Runs all 9 stages sequentially with idempotent resume, duplicate-launch guard, optional Pushover notifications |
| `swarm_env/` | venv with unsloth + trl + peft + bitsandbytes + chromadb + yfinance + anthropic |
| `datasets/` | Output: `whale.jsonl`, `news.jsonl`, `filings.jsonl`, `insider.jsonl`, `calendar.jsonl`, `risk.jsonl`, `synth.jsonl` (~1,050 rows each) |
| `lora_*` | Trained adapter folders. The `.llama32_archive` ones are leftover from the old Llama 3.2 3B + rank-16 swarm — IGNORE THEM |

---

## Data sources

| Source | Where | What | Notes |
|---|---|---|---|
| Alpaca | `OPTIONPRO_ALPACA_*` env | Live options tape, OI snapshots, news headlines | Primary live data feed |
| Schwab | `SCHWAB_CLIENT_*` env, `services/schwab-svc/` | Option chains, gamma walls, paper-trade execution | OAuth refresh every 7d (refresh_token), 30 min (access_token). Token refresh script: `python3 schwab_auth.py` |
| Anthropic | `ANTHROPIC_API_KEY` env | Claude Sonnet 4.6 (default), Haiku 4.5 (catalyst classifier), Opus 4.7 (frontier quality, optional) | Use `claude-sonnet-4-6` exact ID; never date-suffixed |
| FinBERT | local model | Sentiment scoring for news_tape | Background worker polls news_tape.db |
| ChromaDB | `rag_database/` | RAG over SEC filings + Form 4s + earnings transcripts | 734 rows in `quant_memory` collection (as of last check) |
| yfinance | direct lib | Earnings dates, ex-div dates | KNOWN LEAK: returns next-as-of-now, not as-of-event date — fine for live use, slight bias for historical training |

### Key SQLite databases (in `services/quant-engine/app/`)

| DB | Schema highlight | Notes |
|---|---|---|
| `whale_flow.db` | `whale_flow` table with ticker, side, strike, expires, premium, volume, **open_interest**, **voi_ratio**, sentiment, score, tags | Live whale alerts. ~12 days of data as of late April. **WAL mode enabled** to prevent contention corruption. |
| `news_tape.db` | `news_tape` with FinBERT scores + **catalyst_type** (Haiku-backfilled) | 2,964 rows post-recovery (lost ~94 to a corruption event 2026-04-27, recovered via Python defensive walk). **WAL mode enabled.** |
| `calendar.db` | `events` with ticker (NULL for global), event_type, event_date, description, source, confidence | Created 2026-04-27. Holds 44 macro events for 2026 (FOMC/CPI/NFP/OPEX) + per-ticker earnings populated on-demand by `/catalyst/calendar/{ticker}` |
| `opra_tape.db` | OPRA option-print log | Has corrupted twice — keep WAL on, don't write concurrently from multiple processes |
| `stock_tape.db` | Stock prints | |

---

## Recent architectural decisions (the "why")

**2026-04-27: Macro out, catalyst hunters in (4 → 6 adapters).**
Steve realized: *"when I analyze a ticker I saw on whale alerts what should happen is, 1-search news for catalyst 2-search earnings 3-search SEC 4-insider buys, macro isn't really a big factor in whale flow."* Macro-heavy framing was wrong for per-ticker UOA. Macro stayed only on the right-rail UI card. Replaced macro adapter with three catalyst hunters: news, filings, insider.

**2026-04-27 (later): Calendar adapter added (6 → 7 adapters).**
Biotech FDA case study revealed gap: a $300k call buy with PDUFA in 24 days needs the model to compute *"expiry sits before/after the catalyst"* — that's neither news nor filings nor insider, it's pure time-arithmetic. Built `calendar_feed.py` + new adapter. The calendar adapter outputs things like *"expiry sits 7d before earnings = pre-event IV-expansion play, not the print itself."*

**2026-04-27: OI in whale_flow.**
The biotech-UOA tell *"volume 13x open interest"* was invisible because `whale_flow.db` had no OI column. Added `open_interest` + `voi_ratio`. `scanner.py` now fetches OI synchronously from Alpaca per whale (~300ms latency, fine at whale-grade rate of dozens/day). **Historical events from before this fix have OI=0** — model is taught to interpret "OI not available" as "use absolute volume only."

**2026-04-27: catalyst_type backfill on news_tape.**
3,058 rows had `catalyst_type` NULL (FinBERT scored sentiment but never tagged catalyst type). Backfilled with Claude Haiku 4.5 batch classifier (controlled vocab) for ~$0.10. Lets the news adapter optionally filter retrieval (not currently used in live retrieval — kept open for future optimization).

**2026-04-27 → 2026-04-28: `max_tokens` bumped 2048 → 4096 in decomposer.**
The 7-field JSON consistently truncated at ~4,500 chars on 2048-token responses. Bumping fixed all JSON validation errors (smoke test went from 1-failure 5-empty to 0-failure 0-empty).

**2026-04-28: `train_all.sh` got `stdbuf -oL -eL` + `PYTHONUNBUFFERED=1`.**
Without it, tqdm's progress bar gets caught in Python's stdout buffer and the log appears 30+ minutes stale. Patched for all future runs.

---

## Operational learnings / pitfalls

**CRLF line endings in `config/.env`.** The file was authored on Windows (CRLF). `set -a; source /mnt/c/options-terminal/config/.env; set +a` produces `: command not found` errors and silently mangles values with trailing `\r` that break HTTP API calls (Pushover, Anthropic). Workaround: parse specific keys with `grep ... | cut ... | tr -d '\r\n'`. Permanent fix: `dos2unix config/.env`.

**Don't run `train_all.sh` twice.** Two parallel training jobs on one GPU = ~15 GB VRAM, ~50% throughput each, no wall-time benefit. The current script has a `pgrep -cf` guard at the top that aborts duplicates. (Added 2026-04-28 after a real incident.)

**Ollama auto-restarts.** The systemd unit auto-loads models on socket activation, eating ~14 GB VRAM. Permanent disable:
```bash
wsl.exe -d Ubuntu -u root -- bash -c "systemctl stop ollama; systemctl disable ollama; pkill -9 -f ollama"
```
The plan generator (`plan_generator.py`) was triggering Ollama via `query_quantbrain_outlook()` — fixed 2026-04-27 to call Claude Sonnet 4.6 unconditionally instead.

**OPRA / news_tape SQLite corruption.** Both have corrupted at least once under multi-writer contention. **All writer DBs should be in WAL mode.** Recovery pattern (when `.recover` and `.dump` both fail to rebuild a clean DB):

```python
# Defensively walk row IDs with try/except, skipping unreadable pages.
# See _recover_news.py from the 2026-04-27 incident for the template.
```

**WSL has its own venv + system-Python split.**
- Quant-engine FastAPI: `services/quant-engine/.venv/Scripts/python.exe` (Windows-style venv, runs on Windows)
- Training: `~/terminus-train/swarm-engine/swarm_env/bin/activate` (Linux-style venv, runs in WSL)
- These have DIFFERENT package sets — `yfinance`, `chromadb`, `anthropic` had to be installed in BOTH for things to work end-to-end.

**Schwab token refresh.** `refresh_token` lasts 7 days. When TERMINUS sits idle through a weekend, it expires and Schwab returns 401 Unauthorized. Walk through the OAuth flow to recover:
```bash
cd services/schwab-svc && python3 schwab_auth.py
# Paste returned URL into browser, login, copy callback URL with ?code=
# Bulletproof one-liner for the 49s window:
read -p "Paste URL: " URL && CODE=$(python3 -c "import sys; from urllib.parse import urlparse, parse_qs; print(parse_qs(urlparse(sys.argv[1]).query)['code'][0])" "$URL") && python3 schwab_auth.py --code "$CODE"
```

**Don't put `cd <current-directory>` before git commands** — it triggers a permission prompt and isn't necessary; git already operates on the working tree.

---

## Quick-reference commands

```bash
# === Watch live training ===
less +F ~/terminus-train/swarm-engine/train_all.log
# Inside: Ctrl+C to scroll, F to follow, G to bottom, q to quit

# === Stage progress at a glance ===
grep -E "START|DONE|FAIL|SKIP" ~/terminus-train/swarm-engine/train_all.log | tail -15

# === Adapter completion checklist ===
ls -la ~/terminus-train/swarm-engine/lora_*/adapter_model.safetensors 2>/dev/null
# Ignore *.llama32_archive — those are old. New adapters are 242 MB each.

# === GPU sanity ===
nvidia-smi --query-gpu=memory.used,memory.total,utilization.gpu --format=csv

# === Find what's eating VRAM ===
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv
pgrep -af "train_all.sh|train_agent.py|regen_upstream|ollama"

# === Re-decompose existing analyses (if you have golden_handcrafted.jsonl etc.) ===
python decompose.py --n 50         # smoke test
python decompose.py --n 1000       # production

# === Build training data from whale events (the main path) ===
python historical_dossier_builder.py --n 50                # smoke
python historical_dossier_builder.py --n 1000 --seed 42    # production

# === Full training chain ===
nohup ./train_all.sh > /dev/null 2>&1 &
tail -F ~/terminus-train/swarm-engine/train_all.log

# === Test an adapter quickly ===
python -c "
from unsloth import FastLanguageModel
m, t = FastLanguageModel.from_pretrained(model_name='lora_news', max_seq_length=2048, load_in_4bit=True)
FastLanguageModel.for_inference(m)
prompt = 'Ticker: AFRM ... [your dossier text]'
inputs = t.apply_chat_template([{'role':'user','content':prompt}], return_tensors='pt', add_generation_prompt=True).to('cuda')
out = m.generate(inputs, max_new_tokens=200, do_sample=False, pad_token_id=t.eos_token_id)
print(t.decode(out[0][inputs.shape[1]:], skip_special_tokens=True))
"

# === After training: rebuild Tauri to ship the new chain ===
cd /mnt/c/options-terminal/apps/desktop/src-tauri
cargo build --release

# === Live test the swarm ===
# Launch TERMINUS, click the green Swarm button on a ticker.
# The chain loads on first click (~30s); subsequent clicks reuse cache.
```

---

## When NOT to invoke this skill / how to use this doc

- **Use this doc** when starting a new chat about TERMINUS code, training, swarm architecture, or operational issues. It's the fastest way to get a fresh Claude session up to speed.
- **Do NOT** treat the section labels as gospel — TERMINUS is a fast-moving personal project. If something here contradicts what you see in the actual code, the code wins. Update this doc when material decisions change.
- The companion `TERMINUS_ARCHITECTURE.md` (April 19) covers the broader infrastructure (Tauri ↔ FastAPI services ↔ SQLite stores ↔ AI systems) at a higher level. This doc is the **swarm-and-training** deep dive.

---

## Glossary

- **Adapter** — a LoRA weight set that "specializes" the SmolLM3-3B base for one task. ~242 MB on disk, ~80 MB in VRAM.
- **Dossier** — the structured input fed to both the green TERMINUS button and the blue Claude button. Built in `App.tsx` (live) or `historical_dossier_builder.py` (training).
- **Decomposition** — splitting a single Claude analysis into 7 self-contained stages, one per adapter. The Pydantic schema is `Decomposition` in both `decompose.py` and `historical_dossier_builder.py`.
- **Exposure bias** — the mismatch between training-time inputs (Claude's pristine decomposition) and runtime inputs (real adapter outputs). Fixed by `regen_upstream.py`.
- **V/OI ratio** — volume divided by open interest. > 2x = new positioning, the canonical institutional-conviction tell. Especially diagnostic for biotech FDA-catalyst trades.
- **Whale grade** — premium ≥ $100k AND volume ≥ 50 contracts. The minimum bar for `whale_flow.db` ingestion.
- **0DTE** — zero days to expiration. Same-day expiry options. Pure intraday momentum/scalp plays, not catalyst capture.
- **PDUFA** — Prescription Drug User Fee Act decision date — the FDA's deadline to approve or reject an NDA. The biggest single catalyst in biotech UOA.

---

*Last updated: 2026-04-28 · Maintained by: Steve + Claude (collaborative)*
