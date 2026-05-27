import { D1Repository } from "./repository/d1";
import type { Repository } from "./repository/types";
import { persistSourceEvents, recomputeCandidates, runIngestion, type IngestionSources } from "./ingest";
import { verifyIngestSignature } from "./security";
import { fetchLiveSources, type SourceEnv } from "./sources/live";

interface AppOptions {
  repo: Repository;
  adminToken?: string;
  ingestToken?: string;
  sourceEnv?: SourceEnv;
  fetcher?: typeof fetch;
}

export interface WorkerEnv {
  DB?: ConstructorParameters<typeof D1Repository>[0];
  ADMIN_TOKEN?: string;
  INGEST_WEBHOOK_TOKEN?: string;
  FINMIND_TOKEN?: string;
  FINMIND_SYMBOLS?: string;
  RSS_FEED_URL?: string;
  PTT_STOCK_URL?: string;
}

export function createApp(options: AppOptions) {
  return {
    async fetch(request: Request): Promise<Response> {
      return handleRequest(request, options);
    }
  };
}

export function appFromEnv(env: WorkerEnv) {
  if (!env.DB) {
    throw new Error("DB binding is required");
  }
  return createApp({
    repo: new D1Repository(env.DB),
    adminToken: env.ADMIN_TOKEN,
    ingestToken: env.INGEST_WEBHOOK_TOKEN,
    sourceEnv: env
  });
}

async function handleRequest(request: Request, options: AppOptions): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === "/api/candidates" && request.method === "GET") {
    const candidates = await options.repo.listCandidates();
    return json({
      candidates,
      updatedAt: candidates[0]?.latestAt ?? null
    });
  }

  if (url.pathname === "/api/source-runs" && request.method === "GET") {
    return json({ runs: await options.repo.listSourceRuns() });
  }

  if (url.pathname === "/api/universe" && request.method === "GET") {
    const limit = parseLimit(url.searchParams.get("limit"));
    return json({
      stocks: await options.repo.listUniverse(limit),
      count: await options.repo.countUniverse()
    });
  }

  const stockMatch = url.pathname.match(/^\/api\/stocks\/([^/]+)\/research$/);
  if (stockMatch?.[1] && request.method === "GET") {
    const symbol = stockMatch[1].toUpperCase();
    const events = await options.repo.listEventsForSymbol(symbol);
    const stock = (await options.repo.listUniverse()).find((item) => item.symbol === symbol) ?? null;
    return json({ symbol, stock, events });
  }

  if (url.pathname === "/api/watchlist" && request.method === "GET") {
    return json({ watchlist: await options.repo.listWatchlist() });
  }

  if (url.pathname === "/api/watchlist" && request.method === "POST") {
    const denied = requireAdmin(request, options.adminToken);
    if (denied) {
      return denied;
    }

    const body = await readJson(request);
    if (!isWatchlistInput(body)) {
      return json({ error: "Invalid watchlist payload" }, 400);
    }
    const entry = await options.repo.addWatchlist({ symbol: body.symbol, name: body.name });
    return json(entry, 201);
  }

  if (url.pathname === "/api/admin/run-ingest" && request.method === "POST") {
    const denied = requireAdmin(request, options.adminToken);
    if (denied) {
      return denied;
    }

    const body = await readJson(request);
    if (!isAdminIngestInput(body)) {
      return json({ error: "Invalid ingestion payload" }, 400);
    }

    const now = body.now ?? new Date().toISOString();
    const liveResult = body.sources ? undefined : await fetchLiveSources({
      now,
      env: options.sourceEnv ?? {},
      fetcher: options.fetcher
    });
    await runIngestion({
      repo: options.repo,
      now,
      sources: body.sources ?? liveResult?.sources ?? {}
    });
    await options.repo.saveSourceRuns(liveResult?.runs ?? deriveFixtureSourceRuns(body.sources ?? {}, now));
    return json({ candidateCount: (await options.repo.listCandidates()).length }, 202);
  }

  if (url.pathname === "/api/admin/run-score" && request.method === "POST") {
    const denied = requireAdmin(request, options.adminToken);
    if (denied) {
      return denied;
    }

    await recomputeCandidates(options.repo);
    return json({ candidateCount: (await options.repo.listCandidates()).length }, 202);
  }

  if (url.pathname === "/api/ingest/social" && request.method === "POST") {
    if (!options.ingestToken) {
      return json({ error: "Ingest token is not configured" }, 503);
    }
    const rawBody = await request.text();
    const valid = await verifyIngestSignature(rawBody, options.ingestToken, request.headers.get("x-ingest-signature"));
    if (!valid) {
      return json({ error: "Unauthorized" }, 401);
    }

    const body = parseJson(rawBody);
    if (!isSocialIngestInput(body)) {
      return json({ error: "Invalid social ingest payload" }, 400);
    }
    await persistSourceEvents(options.repo, body.events);
    return json({ accepted: body.events.length }, 202);
  }

  return json({ error: "Not found" }, 404);
}

function requireAdmin(request: Request, adminToken?: string): Response | null {
  if (!adminToken) {
    return json({ error: "Admin token is not configured" }, 503);
  }
  if (request.headers.get("x-admin-token") === adminToken) {
    return null;
  }
  return json({ error: "Unauthorized" }, 401);
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 100;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.min(Math.max(Math.trunc(parsed), 0), 500);
}

function isWatchlistInput(input: unknown): input is { symbol: string; name: string } {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return typeof record.symbol === "string" && /^\d{4,6}[A-Z]?$/.test(record.symbol)
    && typeof record.name === "string" && record.name.trim().length > 0;
}

function isAdminIngestInput(input: unknown): input is { now?: string; sources?: IngestionSources } {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return (record.sources === undefined || (typeof record.sources === "object" && record.sources !== null))
    && (record.now === undefined || typeof record.now === "string");
}

function isSocialIngestInput(input: unknown): input is { events: Array<{
  source: "ptt";
  title: string;
  url: string;
  publishedAt: string;
  engagement: number;
  symbols: string[];
}> } {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const events = (input as Record<string, unknown>).events;
  return Array.isArray(events) && events.every((event) => {
    if (typeof event !== "object" || event === null) {
      return false;
    }
    const record = event as Record<string, unknown>;
    return record.source === "ptt"
      && typeof record.title === "string"
      && typeof record.url === "string"
      && typeof record.publishedAt === "string"
      && typeof record.engagement === "number"
      && Array.isArray(record.symbols)
      && record.symbols.every((symbol) => typeof symbol === "string");
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-token"
  };
}

function deriveFixtureSourceRuns(sources: IngestionSources, now: string) {
  const finmindItemCount = (sources.finmindRows?.length ?? 0) + (sources.finmindStockInfoRows?.length ?? 0);

  return [
    ...(sources.pttHtml ? [{
      id: `ptt:${now}`,
      source: "ptt" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: 1
    }] : []),
    ...(sources.rssXml ? [{
      id: `rss:${now}`,
      source: "rss" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: 1
    }] : []),
    ...(finmindItemCount > 0 ? [{
      id: `finmind:${now}`,
      source: "finmind" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: finmindItemCount
    }] : [])
  ];
}
