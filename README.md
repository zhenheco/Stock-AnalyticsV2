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
- `POST /api/watchlist` with `x-admin-token`
- `POST /api/admin/run-ingest` with `x-admin-token`
- `POST /api/admin/run-score` with `x-admin-token`
- `POST /api/ingest/social` with `x-ingest-signature: sha256=<hmac>`

## Development

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

For local secret injection, use 1Password references via `op run --env-file=.env -- <command>`. Do not commit raw secrets.

## Deferred

- Real-time tick data.
- Full historical price cache in D1.
- Long-form LLM summaries.
- Trading advice, backtesting, Discord push, and simulation portfolio.
