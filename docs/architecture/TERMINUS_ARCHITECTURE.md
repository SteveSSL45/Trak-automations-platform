# TERMINUS — Architectural Reference

*Last updated: 2026-04-19*

A personal desktop options-trading terminal built to give a working trader an edge. Tauri (Rust + React) shell with three Python sidecars, five SQLite data stores, five AI systems, and direct wire-ins to Alpaca, yfinance, FRED, Unusual Whales, and (pending) Charles Schwab.

---

## 1. Layer diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TERMINUS DESKTOP APP                            │
│                     (Tauri — Windows, native)                          │
│                                                                        │
│  ┌──────────────────────────┐   ┌─────────────────────────────────┐   │
│  │  Rust backend (lib.rs)   │──▶│  React frontend (Vite + TSX)    │   │
│  │  • Tauri commands        │   │  • App.tsx (router/state)       │   │
│  │  • Alpaca WS streams     │   │  • TopBar / LeftPanel / etc.    │   │
│  │  • SQLite persistence    │   │  • PayoffHeatmap, AlertRail     │   │
│  │  • Whale detector (live) │   │  • SentimentCard, BiasCard      │   │
│  │  • 2B agent (candle)     │   │                                 │   │
│  └──────────────────────────┘   └─────────────────────────────────┘   │
└────────┬────────────────────┬────────────────────┬───────────┬────────┘
         │                    │                    │           │
    HTTP│:8010           HTTP│:8011            HTTP│:8012     HTTP│api.anthropic
         │                    │                    │           │
    ┌────▼──────┐        ┌────▼──────┐         ┌───▼────┐    ┌─▼────────┐
    │ Quant     │        │ Sentiment │         │ Schwab │    │ Claude   │
    │ Engine    │        │ Service   │         │ Svc    │    │ Sonnet   │
    │ FastAPI   │        │ FastAPI   │         │ FastAPI│    │ 4.6      │
    │ (Python)  │        │ (Python)  │         │ (WSL)  │    │ (cloud)  │
    └────┬──────┘        └────┬──────┘         └───┬────┘    └──────────┘
         │                    │                    │
         │             ┌──────▼──────┐             │
         │             │  FinBERT    │             │
         │             │  worker     │             │
         │             │  (polls DB) │             │
         │             └─────────────┘             │
         │                                         │
    ┌────▼─────────────────────────────────────────▼────┐
    │              SQLite DATA STORES                   │
    │    services/quant-engine/app/                     │
    │    ├─ opra_tape.db       (options trades)         │
    │    ├─ stock_tape.db      (stock prints)           │
    │    ├─ news_tape.db       (headlines + FinBERT)    │
    │    ├─ whale_alerts.db    (detector output)        │
    │    └─ uw_tape.db         (Unusual Whales 6-month) │
    └───────────────────────────────────────────────────┘

External feeds:
  Alpaca SIP WebSocket (stocks + options + news)
  Alpaca historical REST (trades, bars, chains)
  yfinance (2007+ daily bars for training)
  FRED (macro: rates, credit, sentiment)
  Unusual Whales REST (30-day labeled flow, already frozen locally)
  Schwab Trader API (pending app approval — for SPX/NDX/VIX)
  Anthropic API (Claude 4.6)
```

---

## 2. Tauri desktop app

### 2.1 Rust backend

Lives at `apps/desktop/src-tauri/src/`. Entry point is `main.rs` → `advanced_options_terminal_lib::run()` (in `lib.rs`).

| Module | Responsibility |
|---|---|
| `lib.rs` | `run()` — Tauri builder, manages state, spawns stream tasks, registers all commands |
| `main.rs` | Windows-only entry, calls `lib::run()` |
| `commands.rs` | ~40 Tauri commands the frontend calls (watchlist, chain, orders, sentiment, whale alerts, Schwab proxy, institutional bias, etc.) |
| `agent.rs` | **TERMINUS 2B custom agent** — full transformer (embed → 28 attention+FFN layers → norm → tied lm_head). Has RoPE, causal mask, Qwen tokenizer. Loaded into VRAM at boot via candle-core. **Currently wired to `analyze_flow` command but UNTRAINED — waiting for real training data.** |
| `tape_logger.rs` | Batched SQLite writer for OPRA option trades → `opra_tape.db` |
| `stock_tape_logger.rs` | Batched SQLite writer for stock trades → `stock_tape.db` |
| `news_tape_logger.rs` | Batched SQLite writer for news → `news_tape.db` |
| `whale_detector.rs` | Real-time Stage-1 + Stage-2 whale detection on every OPRA trade ≥$100k/500ct. Writes to `whale_alerts.db`, emits `whale-alert` events to UI |
| `scanner_commands.rs` | Legacy scanner from the Python quant engine era. Still registered for backward compat; UI Scanner tab was removed |

### 2.2 Streaming

Three WebSocket connections live in `crates/trading-core/src/streaming.rs`:

| Stream | URL | Persists to | UI event |
|---|---|---|---|
| Stock | `wss://stream.data.alpaca.markets/v2/sip` | `stock_tape.db` | `market-data-bar` / `market-data-trade` / `market-data-quote` |
| Options (OPRA) | `wss://stream.data.alpaca.markets/v1beta1/opra` | `opra_tape.db` | `option-quote-update` / `option-trade-update` |
| News | `wss://stream.data.alpaca.markets/v1beta1/news` | `news_tape.db` | `news-update` |

Each stream auto-reconnects with exponential backoff. Stock stream also swaps between day-session (`sip`) and overnight (`boats`/`overnight`) URLs based on market clock.

### 2.3 React frontend

Entry: `apps/desktop/src/main.tsx` → `App.tsx`.

**Layout** (as of 2026-04-19):

```
┌──────────────────────────────────────────────────────────────────────┐
│ TERMINUS · Analysis Alerts Charts Strategy DailyPlan · ... · Port/Eq │  ← TopBar
├─────────────┬────────────────────────────────────────┬───────────────┤
│             │                                        │               │
│  TERMINUS   │           ChainWorkspace  OR           │ SentimentCard │
│  AI panel   │           StrategyWorkspace OR         │ BiasCard      │
│  (Claude    │           PlanView                     │               │
│   analysis  │                                        │ RightRail     │
│   + chat)   │                                        │ (toggleable): │
│  + mini     │                                        │  Alerts /     │
│  TradingView│                                        │  Watchlist /  │
│  chart      ├────────────────────────────────────────┤  News /       │
│  (collapse) │  BottomDock (order entry + payoff)     │  Actions /    │
│             │  Roll-expiration · Payoff SVG · Cash   │  Movers       │
│             │  Max P/L · BE · Open Positions         │               │
└─────────────┴────────────────────────────────────────┴───────────────┘
```

**Key components:**

| Component | Purpose |
|---|---|
| `TopBar` | Top navigation, account metrics |
| `LeftPanel` | Claude analysis button + play cards + chat, with collapsible TradingView-style chart at bottom |
| `ChainWorkspace` | Options chain grid with live OPRA streaming greeks |
| `StrategyWorkspace` | Builder with legs + expiration picker + **PayoffHeatmap** |
| `PayoffHeatmap` | Strike × time P&L grid with auto-IV solver, edge panel, expected-move stat, gold profit-zone outlines |
| `PayoffDiagram` | Inline SVG payoff curve in BottomDock |
| `BottomDock` | Order entry: roll-expiration picker, leg list, summary strip, payoff diagram |
| `SentimentCard` | Daily XGBoost regime reading with fire animation on high-confidence bull signals |
| `InstitutionalBiasCard` | Per-ticker call-vs-put dollar tilt over 1d/5d/10d/20d |
| `AlertRail` | Whale-alert feed with HUGE / HOT / ALL filter chips — clicking an alert jumps to Strategy with the whale's contract pre-loaded |
| `WatchlistRail` | Add/remove symbols, click to set active |
| `NewsRail` | Alpaca news per ticker/watchlist |
| `MoversRail`, `CorporateActionsRail` | Self-explanatory |

---

## 3. Python sidecars

All four services run in WSL under `~/terminus-train/sentiment/` (single shared venv).

### 3.1 Quant Engine — port 8010

Lives at `services/quant-engine/app/main.py`. FastAPI.

Key endpoints:
- `POST /strategy-surface` — Black-Scholes P&L matrix for the builder (back-solves IV from entry price, returns `leg_ivs`)
- `POST /strategy-legs` — Reconstruct canonical legs from a named strategy (Iron Condor, Straddle, etc.)
- `POST /analyze-with-quantbrain` — Legacy DeepSeek-R1-8B fine-tune via Ollama (retained for chat box in LeftPanel)
- `POST /chat-with-quantbrain` — Ticker chat
- `POST /analyze-flow` — Scanner enrichment for ≥$50k trades
- `POST /generate-daily-plan` — Produces morning daily plan (claude-powered or heuristic)
- `/recommend-spreads`, `/strategy-backtest`, etc.

### 3.2 Sentiment Service — port 8011

`~/terminus-train/sentiment/serve.py`. FastAPI.

| Endpoint | Purpose |
|---|---|
| `GET /sentiment` | Today's XGBoost BEAR/NEUT/BULL reading + SHAP feature contributions |
| `GET /sentiment/history?days=30` | Recent OOS predictions |
| `GET /institutional-bias?days=5&limit=25` | Per-ticker whale dollar tilt from `opra_tape.db` |
| `GET /health` | Liveness |

Loads `sentiment_latest.json` (~2 MB XGBoost model) + `features_latest.txt` at startup.

### 3.3 Schwab Service — port 8012 (pending)

`~/terminus-train/sentiment/schwab_service.py`. FastAPI wrapping Schwab Trader API.

Endpoints: `/schwab/health`, `/schwab/quote`, `/schwab/option-chain`, `/schwab/price-history`.

Token management: `~/.terminus/schwab_tokens.json`, auto-refreshed every 25 min (Schwab access tokens expire at 30 min). Full OAuth re-auth needed weekly (`python schwab_auth.py`).

**Status:** code live, **app pending Schwab developer approval**. Intended for SPX/NDX/VIX index options (Alpaca doesn't cover these) + optional order routing.

### 3.4 FinBERT News Enrichment Worker

`~/terminus-train/sentiment/news_enrich.py`. Background loop (not HTTP).

Polls `news_tape.db` every 10s for rows where `sentiment_score IS NULL`, scores each headline+summary batch with ProsusAI/FinBERT on CUDA, writes back `sentiment_score`, `sentiment_label`, `scored_at`, `scored_by`.

---

## 4. Data stores

All SQLite DBs live at `C:\options-terminal\services\quant-engine\app\`. WSL reaches them via `/mnt/c/options-terminal/services/quant-engine/app/`.

| DB | Schema highlights | Retention | Growth source |
|---|---|---|---|
| `opra_tape.db` | `opra_tape(ts, ticker, option_sym, put_call, price, size, premium, trade_side)` | 7-day rolling (live) + 30d backfilled | OPRA WebSocket + Alpaca historical /trades |
| `stock_tape.db` | `stock_tape(ts_ms, ticker, price, size)` | 7-day rolling (live) + 7d backfilled | SIP WebSocket + Alpaca historical /trades |
| `news_tape.db` | `news_tape(...headline, summary, ..., sentiment_score, sentiment_label, ...)` | 90-day rolling | News WebSocket + FinBERT worker |
| `whale_alerts.db` | `whale_alerts(ts_ms, ticker, option_symbol, ..., direction, hedge_confidence, verdict, reasoning)` | 90-day rolling | `whale_detector.rs` Stage-1 + Stage-2 |
| `uw_tape.db` | `uw_flow_alerts`, `uw_darkpool`, `uw_congress` | **Frozen** — 8,677 flow alerts + 3,788 darkpool prints over 6 months | UW API one-time pull via `uw_backfill.py` |

**Sentiment training data** lives under `~/terminus-train/sentiment/data/`:
- `raw/` — 19 years of daily bars from yfinance (35 tickers, ~1,300 rows each)
- `raw/fred_*.parquet` — macro series from FRED
- `features/features.parquet` — 45-col engineered feature table
- `features/labeled.parquet` — with forward-5d return + BEAR/NEUT/BULL labels
- `features/oos_predictions.parquet` — walk-forward OOS for confidence-threshold analysis
- `models/sentiment_latest.json` — current XGBoost model
- `uw_parquet/` — parquet mirrors of `uw_tape.db`
- `uw_raw/` — audit trail JSON per UW-day per endpoint

---

## 5. AI layer — 5 distinct systems

| System | Type | Location | Status | Used for |
|---|---|---|---|---|
| **Claude Sonnet 4.6** | Cloud LLM via Anthropic API | `commands.rs::analyze_with_claude` | Live | Analyze button in LeftPanel → strategy recommendations with JSON plays |
| **XGBoost Sentiment** | Gradient-boosted trees | Python sidecar :8011 | Live | Daily market regime reading in SentimentCard. Backtested Sharpe 2.88 at conf ≥ 0.60 |
| **FinBERT News** | Pretrained financial BERT | Python worker on CUDA | Live | Per-headline sentiment score written to news_tape.db |
| **Whale Detector** | Deterministic (stats + OCC parsing + MM hedge correlation) | `whale_detector.rs` | Live | Real-time whale alerts feed in AlertRail |
| **TERMINUS 2B Agent** | Custom from-scratch transformer | `agent.rs` (Rust/candle) | **Wired, UNTRAINED** | Intended future: direct in-process inference for ticker analysis |
| QuantBrain (legacy) | DeepSeek-R1-8B Unsloth LoRA | Ollama `:11434` + `:8010` wrapper | Live but fading | Chat box in LeftPanel ("Ask TERMINUS about SPY") |

---

## 6. Key workflows

### 6.1 Morning startup (`start-morning.cmd`)

Runs 7 steps:
1. Ollama (skip if already running) — serves QuantBrain on :11434
2. Quant Engine → :8010 (cmd /k with venv activated)
3. Sentiment API → :8011 (WSL)
4. FinBERT News Enrichment worker (WSL, background)
5. Schwab sidecar → :8012 (WSL, pending approval)
6. Tauri desktop app (`npm run tauri dev`)
7. Daily Plan generation (`curl :8010/generate-daily-plan`)

### 6.2 Whale alert → trade decision

1. Alpaca OPRA WebSocket → every option trade parsed in `streaming.rs::option_stream_loop`
2. `on_option_trade` callback (in `lib.rs`) runs in parallel:
   - Tape logger persists the trade to `opra_tape.db`
   - Whale detector evaluates: `premium ≥ $100k AND size ≥ 500`
3. If trigger hits, `whale_detector::analyze` spawns async task:
   - Queries `stock_tape.db` for ±60s window around the option trade
   - Computes stock volume ratio vs 30-min baseline, net price move in bps
   - Infers direction from MM hedge footprint if `trade_side=UNK`
   - Produces verdict: `HUGE_BUY_NOW` / `STRONG_WATCH` / `WATCH`
4. Alert persisted to `whale_alerts.db`, emitted as `whale-alert` event
5. AlertRail in right panel updates (debounced), filtered by HOT / HUGE / ALL
6. User clicks an alert:
   - `App.handleWhaleAlertClick`: sets active symbol, stashes alert, flips to Strategy view
   - `StrategyWorkspace` parses OCC symbol, builds a single leg, opens Builder
   - `PayoffHeatmap` receives the leg + winrate hint (auto-set from historical priors: BUY_CALL 65-68%, BUY_PUT 33%, etc.)
   - Back-solves IV from entry price, computes expected move, shows edge panel with HAS EDGE / NO EDGE verdict
7. User decides → edits legs → Preview/Submit in BottomDock → Alpaca paper/live

### 6.3 Daily sentiment read

1. `fetch.py --full` pulls 35 tickers × 19 years from yfinance + 6 FRED series to parquet (one-time, incremental after)
2. `features.py` builds a 45-column feature matrix (trend, momentum, vol, cross-asset, breadth, macro, calendar) with strict look-ahead discipline
3. `labels.py` adds `forward_ret_5d` + `label ∈ {BEARISH, NEUTRAL, BULLISH}` using ±1% thresholds
4. `train.py --tune 30` does walk-forward training with Optuna — 4-5 folds across 2010-2026
5. `evaluate.py --tune 30` generates OOS predictions + confidence threshold sweep → `oos_predictions.parquet`
6. `serve.py` at :8011 loads `sentiment_latest.json` + feature list, reads last row of `features.parquet`, returns prediction + SHAP contributions
7. Tauri's SentimentCard polls `:8011/sentiment` every 5 min, displays signal + top drivers + confidence-conditional "⚡ HIGH CONVICTION · GO LONG" fire effect when `BULLISH conf ≥ 0.55`

---

## 7. Order-entry flow (BottomDock)

Unified panel with four sections:
1. **Top bar**: structure badge (auto-detected, e.g. "Bull Call Spread · Debit $0.41"), roll-expiration dropdown, quantity, quick-strategy picker, Clear, Preview/Submit
2. **Legs column**: colored BUY/SELL strips with contract name, delta, IV, exec price, × remove
3. **Summary strip**: Cash / Max Profit / Max Loss / Breakeven
4. **Payoff diagram** (inline SVG): shows profit curve vs stock price with breakeven markers and spot line
5. **Open Positions strip**: inline horizontal row at the bottom with Close buttons

Roll-expiration: changing the dropdown re-maps all current legs to the same strike+type on the new expiration (fetches new chain if needed). Lets user swap dates without clearing the whole ticket.

---

## 8. Strategy Workspace + PayoffHeatmap detail

Entry to Strategy view pre-populates via props (`pendingWhaleAlert`, `onConsumePendingAlert`) from a click in AlertRail.

Heatmap rendering:
- **Stats bar (6 cols)**: NET DEBIT / MAX LOSS / MAX PROFIT / CHANCE OF PROFIT / BREAKEVEN / EXPECTED MOVE
- **Edge panel**: Strategy Winrate slider (+ 50/57/65/70 preset buttons) / NEED R:R / POSITION R:R (or "R:R AT +1σ" for unbounded long calls) / EXPECTED VALUE / HAS EDGE badge
- **Strike number line**: SPY/ticker marker + all leg strikes as pills
- **P&L table**: strikes on Y, time on X (labels use hours for <1d, days for <7d, weeks for ≥7d)
  - Cells color-coded green/red by P&L magnitude
  - Gold outline + inset glow on cells where `P&L ≥ (1-winrate)/winrate × maxLoss` — the EV-positive exit zone
  - Row padding auto-scales with row count so few-strike ranges still fill the container
- **Controls**: RANGE slider (±% strike range) / IV slider with live back-solved value displayed (e.g. "IV: 38.0% (base 38.0% × 1.00)")
- **View tabs**: Profit/Loss $ / Profit/Loss % / Contract Value / % of Max Risk

Backend: `/strategy-surface` POST receives legs + entry_price. For each leg with entry_price > 0, it re-solves IV via bisection so the matrix is anchored to reality. Returns `leg_ivs[]` so the frontend can display actual market-implied vol.

---

## 9. External data sources

| Source | Access | Coverage | Used for |
|---|---|---|---|
| **Alpaca** (paid SIP) | WebSocket + REST | US stocks/ETFs/options/news, real-time + ~2 years historical | Primary data feed: streaming + trading + most of the training option data |
| **yfinance** | REST (free, unofficial) | Daily OHLCV back to 2007+ for most tickers, indices | Deep history for sentiment-model training (can't get indices via Alpaca) |
| **FRED** | REST (free API key) | Macro (rates, credit spreads, UMich sentiment) | Sentiment model features |
| **Unusual Whales** | REST (paid, frozen) | 30-day labeled options flow + darkpool + congress | Ground-truth for whale-detector tuning (captured locally, subscription cancellable) |
| **Schwab Trader** | REST + OAuth (pending) | SPX/NDX/VIX index options + order routing | Augments Alpaca for the one gap it can't fill |
| **Anthropic API** | REST | Claude Sonnet 4.6 | Options strategy analysis in LeftPanel |

**Known-cannot-get via Alpaca**: SPX, SPXW, NDX, RUT, VIX options (indices aren't tradeable on Alpaca). Schwab adapter is the planned fill.

---

## 10. Known limitations / future work

**TERMINUS 2B agent**:
- Has architecture (RoPE, causal mask, tied embeddings, SiLU FFN, LayerNorm, Qwen tokenizer, 2.5B params)
- Has weight-loading pipeline (candle `VarBuilder::from_mmaped_safetensors`)
- **Never properly trained** — `dummy_trades.json` has 2 examples. Needs real training data (thousands of labeled flashcards) for a narrow-domain specialist
- Either swap to fine-tune an existing base (Qwen2.5-1.5B via Unsloth) OR collect thousands of options-flow → analysis flashcards

**Schwab index-options integration**:
- Full code written, waiting on app approval from developer.schwab.com
- Once approved: OAuth → stored tokens → SPX/NDX/VIX quotes + chains + (future) order submission
- Rust commands already registered (`get_schwab_health`, `get_schwab_quote`, `get_schwab_option_chain`)

**Historical stock tape for older UW alerts**:
- Current `stock_tape.db` only covers ~7 days
- UW's 8,677 flow alerts span 6 months
- For Stage-2 hedge correlation on older alerts, need deeper stock-tick backfill (potentially 6+ GB of data)

**4-agent whale analysis system** (speced, not built):
- Spotter (trigger interpretation, Llama 3.2-1B fine-tune)
- Technical Analyst (chart setup, Qwen 2.5-1.5B fine-tune)
- Macro Sentinel (news + SEC catalyst extraction, Llama 3.2-3B fine-tune) — closest to built, reuses existing QuantBrain pipeline
- Risk Manager (position sizing, Llama 3.2-1B OR pure Python Kelly formula)
- Build order: Macro Sentinel first (has most pre-existing infra)

**Sentiment model upgrades**:
- Currently 48.2% accuracy on 3-class, Sharpe 2.88 at conf ≥ 0.60 on walk-forward holdout
- Strategy beats buy-hold by narrow margin
- High-leverage improvement: confidence filtering + ONNX export for zero-Python in-process inference

---

## 11. Where things live — file map

```
C:\options-terminal\                                   ← repo root
├── apps\desktop\
│   ├── src-tauri\src\
│   │   ├── main.rs              ← thin entry
│   │   ├── lib.rs               ← Tauri run(), stream setup
│   │   ├── commands.rs          ← ~40 Tauri commands
│   │   ├── agent.rs             ← TERMINUS 2B custom agent
│   │   ├── whale_detector.rs    ← live whale alerts
│   │   ├── tape_logger.rs       ← OPRA batched writer
│   │   ├── stock_tape_logger.rs ← stock batched writer
│   │   ├── news_tape_logger.rs  ← news batched writer
│   │   └── scanner_commands.rs  ← legacy
│   ├── src\
│   │   ├── App.tsx              ← main router/state
│   │   ├── components\
│   │   │   ├── TopBar.tsx
│   │   │   ├── LeftPanel.tsx
│   │   │   ├── ChainWorkspace.tsx
│   │   │   ├── BottomDock.tsx
│   │   │   ├── SentimentCard.tsx
│   │   │   ├── InstitutionalBiasCard.tsx
│   │   │   ├── AlertRail.tsx
│   │   │   ├── WatchlistRail.tsx
│   │   │   ├── PayoffDiagram.tsx
│   │   │   ├── strategy\
│   │   │   │   ├── StrategyWorkspace.tsx
│   │   │   │   └── PayoffHeatmap.tsx
│   │   │   └── ...
│   │   └── lib\tauri.ts          ← all typed command wrappers
│   └── ...
│
├── crates\
│   ├── trading-core\src\streaming.rs  ← WebSocket loops (stock/option/news)
│   └── scanner-core\                  ← legacy scanner engine
│
├── services\quant-engine\app\
│   ├── main.py                        ← FastAPI :8010
│   ├── options_math.py                ← Black-Scholes + payoff matrix (IV solver)
│   ├── strategy_legs.py               ← canonical-leg builder
│   ├── scanner.py, recommender.py     ← legacy enrichment
│   ├── quantbrain.py                  ← Ollama wrapper
│   ├── opra_tape.db                   ← LIVE + BACKFILLED
│   ├── stock_tape.db                  ← LIVE + BACKFILLED
│   ├── news_tape.db                   ← LIVE + FINBERT SCORES
│   ├── whale_alerts.db                ← LIVE
│   └── uw_tape.db                     ← FROZEN (6-month UW capture)
│
├── historical_data\bars\              ← legacy 5-year Alpaca CSVs (kept as reference)
├── start-morning.cmd                  ← launches everything in order
└── TERMINUS_ARCHITECTURE.md           ← this file


\\wsl.localhost\Ubuntu\home\steve\terminus-train\     ← WSL side (training + AI sidecars)
├── Agents\                            ← TERMINUS 2B Python training code
│   ├── terminus_agent.py              ← architecture + training loop
│   ├── terminus_dataloader.py         ← Qwen tokenizer + flashcards
│   ├── dummy_trades.json              ← (only 2 examples — needs expansion)
│   └── terminus_agent_v2_safe.safetensors  ← current (undertrained) weights
└── sentiment\
    ├── .venv\                         ← shared Python venv
    ├── requirements.txt
    ├── fetch.py                       ← yfinance + FRED data puller
    ├── features.py                    ← feature engineering
    ├── labels.py                      ← forward-return labels
    ├── train.py                       ← XGBoost + Optuna walk-forward
    ├── evaluate.py                    ← OOS + confidence sweep
    ├── serve.py                       ← FastAPI :8011 (sentiment + inst-bias)
    ├── schwab_auth.py                 ← one-time OAuth + weekly refresh
    ├── schwab_service.py              ← FastAPI :8012
    ├── news_enrich.py                 ← FinBERT worker (background)
    ├── uw_backfill.py                 ← one-shot UW 30-day capture
    ├── alpaca_options_backfill.py     ← one-shot Alpaca OPRA backfill
    ├── backfill_stock_ticks.py        ← one-shot stock tick backfill
    ├── backtest_whales.py             ← whale detector replay + forward returns
    ├── backtest_uw_alerts.py          ← UW labels forward-return validation
    └── data\
        ├── raw\                       ← per-ticker parquets (19 years)
        ├── features\                  ← features.parquet + labeled.parquet + oos_predictions.parquet
        ├── models\                    ← sentiment_latest.json + versioned history
        └── uw_parquet\, uw_raw\       ← frozen UW capture
```

---

## 12. Environment variables (WSL `~/.terminus_env`)

```bash
export OPTIONPRO_ALPACA_DATA_KEY="..."
export OPTIONPRO_ALPACA_DATA_SECRET="..."
export OPTIONPRO_ALPACA_API_KEY="..."
export OPTIONPRO_ALPACA_API_SECRET="..."
export OPTIONPRO_ALPACA_PAPER="true"
export OPTIONPRO_ALPACA_DATA_FEED="sip"
export FRED_API_KEY="..."
export UNUSUAL_WHALES_TOKEN="..."         # frozen data captured — can rotate/cancel
export SCHWAB_APP_KEY="..."                # pending approval
export SCHWAB_APP_SECRET="..."
export ANTHROPIC_API_KEY="..."
```

---

## 13. Back-of-envelope — what's real today

- 5 AI systems deployed locally or via cloud
- 5 live databases (4 growing, 1 frozen at 12k rows)
- 3 streaming WebSockets (stocks + options + news)
- 45-feature XGBoost sentiment model, Sharpe 2.88 on walk-forward holdout
- 8,677 labeled whale events from UW, cross-validatable against your own detector
- Real-time whale detection firing on every $100k+ OPRA print
- End-to-end path: whale fires → alert → click → Strategy view with correct leg + auto-solved IV + expected move + winrate-aware edge panel + gold-highlighted exit zones

Enough said. Good luck Monday.
