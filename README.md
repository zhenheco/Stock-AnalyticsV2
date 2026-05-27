# Stock AnalyticsV2

Cloudflare-native personal Taiwan stock event radar.

The MVP focuses on research discovery, not trading advice. It combines lightweight events from FinMind, PTT titles, and RSS/news sources into a dashboard that explains why a stock surfaced.

## Apps

- `apps/worker` - Cloudflare Worker API, D1 migration, ingestion, lightweight Workers AI classification, scoring, HMAC social ingest.
- `apps/web` - React/Vite dashboard for event candidates, stock research, and watchlist.
- `packages/shared` - shared parsers, entity extraction, types, scoring, and LLM output validation.

## MVP Routes

- `GET /api/candidates`
- `GET /api/data-readiness`
- `GET /api/stocks/:symbol/research`
- `GET /api/watchlist`
- `GET /api/source-runs`
- `GET /api/universe?limit=0`
- `POST /api/watchlist` with `x-admin-token`
- `DELETE /api/watchlist/:symbol` with `x-admin-token`
- `POST /api/admin/run-ingest` with `x-admin-token`
- `POST /api/admin/run-score` with `x-admin-token`
- `POST /api/ingest/social` with `x-ingest-signature: sha256=<hmac>`

## Live Sources

`POST /api/admin/run-ingest` accepts either fixture payloads for tests or an empty body for live ingestion.

Live ingestion currently connects:

- FinMind `TaiwanStockPrice` through `https://api.finmindtrade.com/api/v4/data`, one configured symbol at a time.
- FinMind `TaiwanStockInstitutionalInvestorsBuySell` and `TaiwanStockMarginPurchaseShortSale` for lightweight chip events.
- FinMind `TaiwanStockMonthRevenue` for low-frequency monthly revenue events.
- FinMind `TaiwanStockInfo` as the Taiwan stock universe. This can bootstrap company names without a token.
- PTT Stock board recent title pages, with `over18=1` cookie and title-level extraction only.
- Yahoo Taiwan stock RSS and Liberty Times finance RSS in production, configurable through `RSS_FEED_URLS`.
- Optional Workers AI lightweight classification for short PTT/RSS event titles.

Environment config:

- `FINMIND_TOKEN` - optional 1Password reference locally and Cloudflare secret in production. When absent, the Worker still attempts anonymous limited FinMind price/chip/revenue ingestion and marks readiness as degraded.
- `FINMIND_SYMBOLS` - comma-separated Taiwan stock symbols to fetch from FinMind.
- `FINMIND_DYNAMIC_SYMBOL_LIMIT` - maximum watchlist/candidate symbols to add to FinMind price/chip/revenue fetching. Defaults to `20`, capped at `20` for Worker/API time budgets.
- `RSS_FEED_URLS` / `RSS_FEED_URL` - comma-separated RSS feeds. Production uses Yahoo Taiwan stock news plus Liberty Times finance RSS after live smoke checks; failed feeds are reported as partial while healthy feeds still ingest.
- `PTT_STOCK_URL` - defaults to `https://www.ptt.cc/bbs/Stock/index.html`.
- `PTT_STOCK_PAGES` - number of recent PTT Stock board pages to fetch. Defaults to `1`, capped at `5`; production uses `3`.
- `LLM_CLASSIFIER_ENABLED` - set to `true` to use the Cloudflare Workers AI binding for short-text event classification.
- `LLM_CLASSIFIER_MODEL` - Workers AI chat model. Defaults to `@cf/meta/llama-3.1-8b-instruct`.
- `LLM_CLASSIFIER_LIMIT` - maximum non-FinMind events to classify per ingestion or scoring run. Defaults to `8`, capped at `20` to leave Worker cron timeout headroom.

The cron trigger runs the same live ingestion path. Source fetch failures are partial: a failed RSS/PTT/FinMind call is skipped so the remaining sources can still update the radar. Data readiness also marks a source as degraded when its latest run is more than 3 hours old, so a stopped cron does not look healthy.

Entity extraction uses explicit stock codes plus universe-backed company aliases. Longer overlapping aliases win, so a title mentioning `聯發科` does not also create a false hit for `聯發`.
Percentage figures are removed before numeric symbol extraction, so a title such as `年增:4725%` does not create a false `4725` candidate.

FinMind price/chip/revenue ingestion combines configured `FINMIND_SYMBOLS` with current watchlist and candidate symbols, de-duplicates them, and applies `FINMIND_DYNAMIC_SYMBOL_LIMIT` to stay within Worker/API time budgets. If `FINMIND_TOKEN` is missing, it uses anonymous limited requests when FinMind allows them; adding the token improves quota stability. FinMind rows trust the structured `stock_id` field so volume numbers are not misread as stock symbols.

Classification stores only lightweight fields: sentiment `1-5`, up to three event tags, and one short reason. If Workers AI is unavailable, invalid, over limit, or the event is structured FinMind data, ingestion falls back to the deterministic classifier.

Scoring favors research catalysts such as AI, industry demand, revenue, and price/volume events. Formal announcements are still retained as evidence but are discounted so they do not crowd out stronger research signals.

## Dashboard

- Radar page shows candidate stocks and source health.
- Data readiness panel summarizes candidate, universe, social/news, and FinMind price/chip/revenue connection state.
- Stock detail page shows event evidence, watchlist controls, and links out to TradingView instead of storing full historical price data.
- Watchlist page includes a personal add form. The admin token is sent as `x-admin-token` and cached in browser local storage for convenience.

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

For local secret injection, use 1Password references via `op run --env-file=.env -- <command>`. Do not commit raw secrets.

## FinMind Secret Sync

FinMind price/chip/revenue ingestion can run in anonymous limited mode, but a non-empty `op://Dev/stock-analytics-v2/FINMIND_TOKEN` improves quota stability.
The helper below reports only token presence/length and readiness, never the token value:

```bash
pnpm check:secrets
pnpm check:finmind-secret
```

After the 1Password item is filled, sync it into Cloudflare and run a production ingestion smoke:

```bash
pnpm sync:finmind-secret
pnpm complete:production
```

Expected final readiness is `finmind-signals=ready` when token-backed ingestion works, or `finmind-signals=degraded` when anonymous limited price/chip/revenue rows are flowing. If the token is still empty, the sync script exits before touching Cloudflare secrets.
`pnpm complete:production` runs the closeout sequence: secret presence check, FinMind secret sync plus ingestion smoke, then the strict production ready gate.

## Deployment

```bash
pnpm migrate:remote
pnpm deploy:worker
pnpm --filter @stock-analytics/web build
pnpm deploy:web
```

Cloudflare resources:

- D1: `stock-analytics-v2` (`8b370f1c-9f22-47b5-b615-a5ecd26a21b2`)
- Worker: `stock-analytics-v2-worker` at `https://stock-analytics-v2-worker.acejou27.workers.dev`
- Pages: `stock-analytics-v2` at `https://stock-analytics-v2.pages.dev`

Production smoke endpoints:

```bash
pnpm check:production
pnpm check:production:ready
curl https://stock-analytics-v2-worker.acejou27.workers.dev/api/candidates
curl https://stock-analytics-v2-worker.acejou27.workers.dev/api/data-readiness
curl https://stock-analytics-v2-worker.acejou27.workers.dev/api/source-runs
curl "https://stock-analytics-v2-worker.acejou27.workers.dev/api/universe?limit=0"
```

`pnpm check:production` checks the deployed Pages bundle, Worker readiness, top candidate source contribution counts, and FinMind token presence without printing raw secrets.
`pnpm check:production:ready` runs the same checks and exits non-zero until all readiness checks, top candidate source counts, Pages assets, and FinMind token presence are ready.

## Deferred

- Real-time tick data.
- Full historical price cache in D1.
- Long-form LLM summaries.
- Trading advice, backtesting, Discord push, and simulation portfolio.
