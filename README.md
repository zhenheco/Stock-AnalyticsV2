# Stock AnalyticsV2

Cloudflare-native personal Taiwan stock event radar.

The MVP focuses on research discovery, not trading advice. It combines lightweight events from FinMind, PTT titles, and one RSS/news source into a dashboard that explains why a stock surfaced.

## Apps

- `apps/worker` - Cloudflare Worker API, D1 migration, ingestion, scoring, HMAC social ingest.
- `apps/web` - React/Vite dashboard for event candidates, stock research, and watchlist.
- `packages/shared` - shared parsers, entity extraction, types, scoring, and LLM output validation.

## MVP Routes

- `GET /api/candidates`
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
- FinMind `TaiwanStockInstitutionalInvestorsBuySell` and `TaiwanStockMarginPurchaseShortSale` for lightweight chip events when `FINMIND_TOKEN` is configured.
- FinMind `TaiwanStockInfo` as the Taiwan stock universe. This can bootstrap company names without a token; price rows still require `FINMIND_TOKEN`.
- PTT Stock board title page, with `over18=1` cookie and title-level extraction only.
- Yahoo Taiwan stock RSS by default, configurable through `RSS_FEED_URL`.

Environment config:

- `FINMIND_TOKEN` - 1Password reference locally, Cloudflare secret in production.
- `FINMIND_SYMBOLS` - comma-separated Taiwan stock symbols to fetch from FinMind.
- `FINMIND_DYNAMIC_SYMBOL_LIMIT` - maximum watchlist/candidate symbols to add to FinMind price/chip fetching. Defaults to `20`, capped at `20` for Worker/API time budgets.
- `RSS_FEED_URLS` / `RSS_FEED_URL` - comma-separated RSS fallback feeds. The production default uses Yahoo Taiwan stock news because it has been stable from Cloudflare Workers; add extra feeds only after smoke-testing them from Worker.
- `PTT_STOCK_URL` - defaults to `https://www.ptt.cc/bbs/Stock/index.html`.

The cron trigger runs the same live ingestion path. Source fetch failures are partial: a failed RSS/PTT/FinMind call is skipped so the remaining sources can still update the radar.

Entity extraction uses explicit stock codes plus universe-backed company aliases. Longer overlapping aliases win, so a title mentioning `聯發科` does not also create a false hit for `聯發`.
Percentage figures are removed before numeric symbol extraction, so a title such as `年增:4725%` does not create a false `4725` candidate.

FinMind price/chip ingestion combines configured `FINMIND_SYMBOLS` with current watchlist and candidate symbols, de-duplicates them, and applies `FINMIND_DYNAMIC_SYMBOL_LIMIT` to stay within Worker/API time budgets. FinMind rows trust the structured `stock_id` field so volume numbers are not misread as stock symbols.

Scoring favors research catalysts such as AI, industry demand, revenue, and price/volume events. Formal announcements are still retained as evidence but are discounted so they do not crowd out stronger research signals.

## Dashboard

- Radar page shows candidate stocks and source health.
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
curl https://stock-analytics-v2-worker.acejou27.workers.dev/api/candidates
curl https://stock-analytics-v2-worker.acejou27.workers.dev/api/source-runs
curl "https://stock-analytics-v2-worker.acejou27.workers.dev/api/universe?limit=0"
```

## Deferred

- Real-time tick data.
- Full historical price cache in D1.
- Long-form LLM summaries.
- Trading advice, backtesting, Discord push, and simulation portfolio.
