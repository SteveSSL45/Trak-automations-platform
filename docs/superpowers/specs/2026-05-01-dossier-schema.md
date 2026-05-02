# Dossier JSON Schema

> Status: Phase 5 thin slice. Locked enough for the swarm orchestrator to depend on. Subject to expansion when Phase 4 v1.5 adds backlinks / crawl / PageSpeed sources.

The dossier is the **single input** to the 8-stage swarm chain. One dossier per client per day. Lives at `clients/<client-id>/dossiers/<YYYY-MM-DD>.json`.

## Top-level shape

```json
{
  "schema_version": "0.1",
  "client_id": "trak-automations",
  "client_name": "Trak Automations",
  "client_domain": "trakautomations.com",
  "industry": "AI/automation agency (eat-your-own-dog-food)",
  "date": "2026-04-30",
  "generated_at_unix": 1714521600,
  "data_freshness": {
    "gsc_last_fetched": "2026-04-30",
    "ga4_last_fetched": "2026-04-30",
    "ahrefs_last_fetched": null,
    "crawl_last_fetched": null,
    "pagespeed_last_fetched": null
  },
  "gsc_daily": { ... },
  "gsc_weekly": { ... },
  "ga4_daily": { ... },
  "ahrefs": null,
  "crawl": null,
  "pagespeed": null,
  "competitors": null
}
```

`null` sections mean "data source not yet wired up" — swarm prompts must detect and degrade gracefully (master spec § "Empty-data honesty").

## `gsc_daily` (yesterday)

```json
{
  "date": "2026-04-30",
  "site_url": "sc-domain:trakautomations.com",
  "top_queries": [
    { "query": "trak automations", "clicks": 12, "impressions": 340, "ctr": 0.035, "position": 8.4 }
  ],
  "top_pages": [
    { "page": "https://trakautomations.com/", "clicks": 18, "impressions": 540, "ctr": 0.033, "position": 11.2 }
  ],
  "totals": { "clicks": 42, "impressions": 1240, "avg_position": 12.7 }
}
```

`top_queries` and `top_pages` are sorted by clicks descending, capped at 25 each.

## `gsc_weekly` (last 7 days)

```json
{
  "range": { "start": "2026-04-24", "end": "2026-04-30" },
  "gainers": [
    { "query": "lawn care swarm", "position_delta": -4.2, "current_position": 6.1, "previous_position": 10.3, "clicks_7d": 8 }
  ],
  "losers": [
    { "query": "automated seo", "position_delta": 5.7, "current_position": 18.4, "previous_position": 12.7, "clicks_7d": 1 }
  ],
  "striking_distance": [
    { "query": "ai marketing dashboard", "current_position": 6.4, "impressions_7d": 280, "clicks_7d": 4 }
  ],
  "totals_7d": { "clicks": 184, "impressions": 7820, "avg_position": 13.1 }
}
```

`position_delta` is signed: negative = improved (positions lower-numbered are better in SERPs), positive = worsened.

`striking_distance` = queries currently in positions 4-15 with non-trivial impressions — the most actionable improvement targets.

`gainers` / `losers` / `striking_distance` capped at 15 entries each.

## `ga4_daily` (yesterday)

```json
{
  "date": "2026-04-30",
  "property_id": "535548482",
  "top_landing_pages": [
    { "page": "/", "sessions": 24, "users": 19 }
  ],
  "totals": { "sessions": 87, "users": 64 }
}
```

`top_landing_pages` capped at 25.

Conversion events come in a follow-up — when wired, add `top_conversions: [{ event_name, count }]`.

## `ahrefs` / `crawl` / `pagespeed` / `competitors`

`null` placeholders for Phase 4 v1.5+. Schema TBD when those sources land. Swarm prompts that depend on them must check for `null` and emit "no data available" rather than fabricating.

## Schema versioning

The top-level `schema_version` field bumps on breaking changes. Swarm prompts pin to a specific version; an unknown version aborts with an error rather than guessing.

- `0.1` — Phase 5 thin slice (GSC daily/weekly + GA4 daily)
- `0.2` — Phase 4 v1.5 (adds Ahrefs, crawl, PageSpeed)
- `1.0` — first version after the swarm runs in production for 2+ weeks without prompt rewrites
