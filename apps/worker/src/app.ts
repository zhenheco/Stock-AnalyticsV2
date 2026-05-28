import { D1Repository } from "./repository/d1";
import type { Repository } from "./repository/types";
import { countRssItems, parsePttTitles, type Candidate, type DailySnapshot, type DataReadiness, type ReadinessCheck, type ReadinessStatus, type SourceRun } from "@stock-analytics/shared";
import { persistSourceEvents, recomputeCandidates, runIngestion, type IngestionSources } from "./ingest";
import { verifyIngestSignature } from "./security";
import { fetchLiveSources, type SourceEnv } from "./sources/live";
import { createWorkersAiClassifier, isClassifierEnabled, parseClassifierLimit, type EventClassifier, type WorkersAiBinding } from "./classifier";

interface AppOptions {
  repo: Repository;
  adminToken?: string;
  ingestToken?: string;
  sourceEnv?: SourceEnv;
  fetcher?: typeof fetch;
  ai?: WorkersAiBinding;
  classifierEnabled?: boolean;
  classifierModel?: string;
  classifierLimit?: number;
  now?: () => string;
}

export interface WorkerEnv {
  DB?: ConstructorParameters<typeof D1Repository>[0];
  ADMIN_TOKEN?: string;
  INGEST_WEBHOOK_TOKEN?: string;
  FINMIND_TOKEN?: string;
  FINMIND_SYMBOLS?: string;
  FINMIND_DYNAMIC_SYMBOL_LIMIT?: string;
  RSS_FEED_URLS?: string;
  RSS_FEED_URL?: string;
  TWSE_NEWS_URL?: string;
  MOPS_MATERIAL_URL?: string;
  PTT_STOCK_URL?: string;
  PTT_STOCK_PAGES?: string;
  AI?: WorkersAiBinding;
  LLM_CLASSIFIER_ENABLED?: string;
  LLM_CLASSIFIER_MODEL?: string;
  LLM_CLASSIFIER_LIMIT?: string;
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
    sourceEnv: env,
    ai: env.AI,
    classifierEnabled: isClassifierEnabled(env.LLM_CLASSIFIER_ENABLED),
    classifierModel: env.LLM_CLASSIFIER_MODEL,
    classifierLimit: parseClassifierLimit(env.LLM_CLASSIFIER_LIMIT)
  });
}

async function handleRequest(request: Request, options: AppOptions): Promise<Response> {
  const url = new URL(request.url);
  const classifier = eventClassifier(options);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (url.pathname === "/api/candidates" && request.method === "GET") {
    const candidates = await options.repo.listCandidates();
    const limit = parseLimit(url.searchParams.get("limit"));
    return json({
      candidates: candidates.slice(0, limit),
      updatedAt: latestCandidateTime(candidates)
    });
  }

  if (url.pathname === "/api/source-runs" && request.method === "GET") {
    return json({ runs: await options.repo.listSourceRuns() });
  }

  if (url.pathname === "/api/data-readiness" && request.method === "GET") {
    return json(await dataReadiness(options.repo, options.now?.() ?? new Date().toISOString()));
  }

  if (url.pathname === "/api/snapshots" && request.method === "GET") {
    return json({ snapshots: await options.repo.listSnapshots(parseLimit(url.searchParams.get("limit"))) });
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
    const symbol = body.symbol.toUpperCase();
    const name = body.name?.trim() || await findUniverseName(options.repo, symbol) || symbol;
    const entry = await options.repo.addWatchlist({
      symbol,
      name,
      ...(body.note?.trim() ? { note: body.note.trim() } : {}),
      ...(body.tags && body.tags.length > 0 ? { tags: body.tags } : {}),
      ...(typeof body.alertThreshold === "number" ? { alertThreshold: body.alertThreshold } : {})
    });
    return json(entry, 201);
  }

  const watchlistDeleteMatch = url.pathname.match(/^\/api\/watchlist\/([^/]+)$/);
  if (watchlistDeleteMatch?.[1] && request.method === "DELETE") {
    const denied = requireAdmin(request, options.adminToken);
    if (denied) {
      return denied;
    }

    const symbol = watchlistDeleteMatch[1].toUpperCase();
    if (!isValidSymbol(symbol)) {
      return json({ error: "Invalid watchlist symbol" }, 400);
    }
    return json({ removed: await options.repo.removeWatchlist(symbol) }, 202);
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
      finmindSymbols: await listDynamicFinMindSymbols(options.repo),
      fetcher: options.fetcher
    });
    await runIngestion({
      repo: options.repo,
      now,
      sources: body.sources ?? liveResult?.sources ?? {},
      classifier,
      classifierLimit: options.classifierLimit
    });
    await options.repo.saveSourceRuns(liveResult?.runs ?? deriveFixtureSourceRuns(body.sources ?? {}, now));
    return json({ candidateCount: (await options.repo.listCandidates()).length }, 202);
  }

  if (url.pathname === "/api/admin/run-score" && request.method === "POST") {
    const denied = requireAdmin(request, options.adminToken);
    if (denied) {
      return denied;
    }

    await recomputeCandidates(options.repo, {}, {
      classifier,
      classifierLimit: options.classifierLimit
    });
    return json({ candidateCount: (await options.repo.listCandidates()).length }, 202);
  }

  if (url.pathname === "/api/admin/snapshot" && request.method === "POST") {
    const denied = requireAdmin(request, options.adminToken);
    if (denied) {
      return denied;
    }

    const snapshot = await createDailySnapshot(options.repo, options.now?.() ?? new Date().toISOString());
    await options.repo.saveSnapshot(snapshot);
    return json(snapshot, 201);
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
    const now = options.now?.() ?? new Date().toISOString();
    await options.repo.saveSourceRuns([{
      id: `ptt:social:${now}`,
      source: "ptt",
      status: "ok",
      startedAt: now,
      finishedAt: now,
      itemCount: body.events.length,
      message: "signed social ingest accepted"
    }]);
    return json({ accepted: body.events.length }, 202);
  }

  return json({ error: "Not found" }, 404);
}

function eventClassifier(options: AppOptions): EventClassifier | undefined {
  if (!options.classifierEnabled || !options.ai) {
    return undefined;
  }
  return createWorkersAiClassifier(options.ai, options.classifierModel);
}

function latestCandidateTime(candidates: Array<{ latestAt: string }>): string | null {
  return candidates.reduce<string | null>((latest, candidate) => {
    if (!candidate.latestAt) {
      return latest;
    }
    return !latest || candidate.latestAt > latest ? candidate.latestAt : latest;
  }, null);
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

const SOURCE_FRESHNESS_HOURS = 3;

async function dataReadiness(repo: Repository, now: string): Promise<DataReadiness> {
  const [candidates, runs, universeCount, watchlist] = await Promise.all([
    repo.listCandidates(),
    repo.listSourceRuns(),
    repo.countUniverse(),
    repo.listWatchlist()
  ]);
  const latestRuns = latestRunsBySource(runs);
  const checks = [
    checkUniverse(universeCount),
    checkCandidates(candidates.length),
    checkSocialEvents(latestRuns, now),
    checkOfficialEvents(latestRuns, now),
    checkFinMindSignals(latestRuns, now)
  ];

  return {
    status: overallReadiness(checks),
    updatedAt: latestCandidateTime(candidates) ?? latestRuns[0]?.startedAt ?? null,
    counts: {
      candidates: candidates.length,
      universe: universeCount,
      watchlist: watchlist.length
    },
    checks
  };
}

function checkUniverse(count: number): ReadinessCheck {
  if (count >= 1000) {
    return { id: "universe", label: "股票主檔", status: "ready", message: `${count} 檔股票主檔已可用` };
  }
  return { id: "universe", label: "股票主檔", status: "missing", message: `股票主檔只有 ${count} 檔，需先完成 FinMind TaiwanStockInfo 同步` };
}

function checkCandidates(count: number): ReadinessCheck {
  if (count > 0) {
    return { id: "candidates", label: "候選股", status: "ready", message: `${count} 檔候選股已產出` };
  }
  return { id: "candidates", label: "候選股", status: "missing", message: "尚未產出候選股，請先執行資料同步與評分" };
}

function checkSocialEvents(latestRuns: SourceRun[], now: string): ReadinessCheck {
  const ptt = latestRuns.find((run) => run.source === "ptt");
  const rss = latestRuns.find((run) => run.source === "rss");
  if ((ptt && !isFreshRun(ptt, now)) || (rss && !isFreshRun(rss, now))) {
    return { id: "social-events", label: "社群/時事", status: "degraded", message: `PTT 或 RSS 最近一次同步已超過 ${SOURCE_FRESHNESS_HOURS} 小時，請檢查 cron 或手動同步` };
  }
  if (ptt?.status === "ok" && rss?.status === "ok") {
    return { id: "social-events", label: "社群/時事", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" };
  }
  return { id: "social-events", label: "社群/時事", status: "degraded", message: "PTT 或 RSS 最近一次同步不完整，系統會保留既有資料並重試" };
}

function checkOfficialEvents(latestRuns: SourceRun[], now: string): ReadinessCheck {
  const twse = latestRuns.find((run) => run.source === "twse");
  const mops = latestRuns.find((run) => run.source === "mops");
  if ((twse && !isFreshRun(twse, now)) || (mops && !isFreshRun(mops, now))) {
    return {
      id: "official-events",
      label: "官方公告",
      status: "degraded",
      message: `TWSE/MOPS 官方來源最近一次同步已超過 ${SOURCE_FRESHNESS_HOURS} 小時，請檢查 cron 或手動同步`
    };
  }
  if (twse?.status === "ok" || mops?.status === "ok") {
    return {
      id: "official-events",
      label: "官方公告",
      status: "ready",
      message: mops?.status === "ok" ? "TWSE/MOPS 官方來源最近一次同步正常" : "TWSE 官方 OpenAPI newsList 最近一次同步正常"
    };
  }
  return {
    id: "official-events",
    label: "官方公告",
    status: "degraded",
    message: twse?.message ?? "TWSE 官方 OpenAPI newsList 尚未完成最近一次同步"
  };
}

function checkFinMindSignals(latestRuns: SourceRun[], now: string): ReadinessCheck {
  const finmind = latestRuns.find((run) => run.source === "finmind");
  if (finmind && !isFreshRun(finmind, now)) {
    return {
      id: "finmind-signals",
      label: "FinMind 價格/籌碼/營收",
      status: "degraded",
      message: `FinMind 最近一次同步已超過 ${SOURCE_FRESHNESS_HOURS} 小時，請檢查 cron 或手動同步`
    };
  }
  if (finmind?.status === "ok") {
    return { id: "finmind-signals", label: "FinMind 價格/籌碼/營收", status: "ready", message: "FinMind 價格、籌碼與營收資料已接通" };
  }
  if (finmind?.message?.includes("anonymous limited price/chip")) {
    return {
      id: "finmind-signals",
      label: "FinMind 價格/籌碼/營收",
      status: "ready",
      message: "FinMind 價格、籌碼與營收資料已用免 token 降級模式接通；設定 FINMIND_TOKEN 可提高額度穩定性"
    };
  }
  if (finmind?.message?.includes("FINMIND_TOKEN")) {
    return { id: "finmind-signals", label: "FinMind 價格/籌碼/營收", status: "missing", message: "FINMIND_TOKEN 尚未設定，價格、籌碼與營收資料未進入事件管線" };
  }
  return { id: "finmind-signals", label: "FinMind 價格/籌碼/營收", status: "degraded", message: finmind?.message ?? "FinMind 尚未完成最近一次同步" };
}

function isFreshRun(run: SourceRun, now: string): boolean {
  const startedAtMs = Date.parse(run.startedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) {
    return true;
  }
  return nowMs - startedAtMs <= SOURCE_FRESHNESS_HOURS * 60 * 60 * 1000;
}

function latestRunsBySource(runs: SourceRun[]): SourceRun[] {
  const bySource = new Map<SourceRun["source"], SourceRun>();
  for (const run of runs) {
    const current = bySource.get(run.source);
    if (!current || run.startedAt > current.startedAt) {
      bySource.set(run.source, run);
    }
  }
  return [...bySource.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function overallReadiness(checks: ReadinessCheck[]): ReadinessStatus {
  if (checks.some((check) => check.status === "missing" && check.id !== "finmind-signals")) {
    return "missing";
  }
  if (checks.some((check) => check.status !== "ready")) {
    return "degraded";
  }
  return "ready";
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

function isWatchlistInput(input: unknown): input is { symbol: string; name?: string; note?: string; tags?: string[]; alertThreshold?: number } {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  const record = input as Record<string, unknown>;
  return typeof record.symbol === "string" && isValidSymbol(record.symbol)
    && (record.name === undefined || (typeof record.name === "string" && record.name.trim().length > 0))
    && (record.note === undefined || typeof record.note === "string")
    && (record.tags === undefined || (Array.isArray(record.tags) && record.tags.every((tag) => typeof tag === "string" && tag.trim().length > 0)))
    && (record.alertThreshold === undefined || (typeof record.alertThreshold === "number" && record.alertThreshold >= 0 && record.alertThreshold <= 20));
}

async function findUniverseName(repo: Repository, symbol: string): Promise<string | null> {
  return (await repo.listUniverse()).find((stock) => stock.symbol === symbol)?.name ?? null;
}

function isValidSymbol(symbol: string): boolean {
  return /^\d{4,6}[A-Z]?$/.test(symbol);
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
    "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-token,x-ingest-signature"
  };
}

function deriveFixtureSourceRuns(sources: IngestionSources, now: string) {
  const finmindItemCount = (sources.finmindRows?.length ?? 0) + (sources.finmindStockInfoRows?.length ?? 0);
  const pttItemCount = sources.pttHtml ? parsePttTitles(sources.pttHtml).length : 0;
  const rssItemCount = sources.rssXml ? countRssItems(sources.rssXml) : 0;
  const twseItemCount = sources.twseNewsRows?.length ?? 0;
  const mopsItemCount = sources.mopsMaterialRows?.length ?? 0;

  return [
    ...(sources.pttHtml ? [{
      id: `ptt:${now}`,
      source: "ptt" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: pttItemCount
    }] : []),
    ...(sources.rssXml ? [{
      id: `rss:${now}`,
      source: "rss" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: rssItemCount
    }] : []),
    ...(twseItemCount > 0 ? [{
      id: `twse:${now}`,
      source: "twse" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: twseItemCount
    }] : []),
    ...(mopsItemCount > 0 ? [{
      id: `mops:${now}`,
      source: "mops" as const,
      status: "ok" as const,
      startedAt: now,
      finishedAt: now,
      itemCount: mopsItemCount
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

export async function createDailySnapshot(repo: Repository, now: string): Promise<DailySnapshot> {
  const [candidates, runs, previous] = await Promise.all([
    repo.listCandidates(),
    repo.listSourceRuns(),
    repo.listSnapshots(1)
  ]);
  const topCandidates = candidates.slice(0, 20);
  const previousSymbols = previous[0]?.topSymbols ?? [];
  const previousScores = previousScoreMap(previous[0], candidates);
  const currentScores = new Map(topCandidates.map((candidate) => [candidate.symbol, candidate.score]));
  return {
    id: `snapshot:${now}`,
    createdAt: now,
    candidateCount: candidates.length,
    topSymbols: topCandidates.slice(0, 10).map((candidate) => candidate.symbol),
    scores: Object.fromEntries(topCandidates.map((candidate) => [candidate.symbol, candidate.score])),
    sourceStatusCounts: countRunStatuses(runs),
    drift: {
      newSymbols: topCandidates.map((candidate) => candidate.symbol).filter((symbol) => !previousSymbols.includes(symbol)).slice(0, 10),
      droppedSymbols: previousSymbols.filter((symbol) => !currentScores.has(symbol)).slice(0, 10),
      scoreChanges: topCandidates
        .flatMap((candidate) => {
          const from = previousScores.get(candidate.symbol);
          if (from === undefined || Math.abs(candidate.score - from) < 0.5) {
            return [];
          }
          return [{
            symbol: candidate.symbol,
            from,
            to: candidate.score,
            delta: Math.round((candidate.score - from) * 10) / 10
          }];
        })
        .slice(0, 10)
    }
  };
}

function previousScoreMap(previous: DailySnapshot | undefined, currentCandidates: Candidate[]): Map<string, number> {
  if (!previous) {
    return new Map();
  }
  if (previous.scores) {
    return new Map(Object.entries(previous.scores));
  }
  const changes = new Map(previous.drift.scoreChanges.map((change) => [change.symbol, change.to]));
  for (const symbol of previous.topSymbols) {
    if (!changes.has(symbol)) {
      const current = currentCandidates.find((candidate) => candidate.symbol === symbol);
      if (current) {
        changes.set(symbol, current.score);
      }
    }
  }
  return changes;
}

function countRunStatuses(runs: SourceRun[]): DailySnapshot["sourceStatusCounts"] {
  return runs.reduce<DailySnapshot["sourceStatusCounts"]>((counts, run) => ({
    ...counts,
    [run.status]: (counts[run.status] ?? 0) + 1
  }), { ok: 0, partial: 0, failed: 0 });
}

async function listDynamicFinMindSymbols(repo: Repository): Promise<string[]> {
  const [watchlist, candidates] = await Promise.all([
    repo.listWatchlist(),
    repo.listCandidates()
  ]);
  return [
    ...watchlist.map((item) => item.symbol),
    ...candidates.map((candidate) => candidate.symbol)
  ];
}
