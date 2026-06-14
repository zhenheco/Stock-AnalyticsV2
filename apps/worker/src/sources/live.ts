import {
  countRssItems,
  parsePttTitles,
  type FinMindRow,
  type FinMindStockInfoRow,
  type MopsMaterialInfoRow,
  type SourceKind,
  type SourceRun,
  type TwseNewsRow
} from "@stock-analytics/shared";
import type { IngestionSources } from "../ingest";

export interface SourceEnv {
  FINMIND_TOKEN?: string;
  FINMIND_SYMBOLS?: string;
  FINMIND_DYNAMIC_SYMBOL_LIMIT?: string;
  RSS_FEED_URLS?: string;
  RSS_FEED_URL?: string;
  TWSE_NEWS_URL?: string;
  MOPS_MATERIAL_URL?: string;
  PTT_STOCK_URL?: string;
  PTT_STOCK_PAGES?: string;
}

export interface FetchLiveSourcesInput {
  now: string;
  env: SourceEnv;
  finmindSymbols?: string[];
  fetcher?: typeof fetch;
}

export interface LiveSourceResult {
  sources: IngestionSources;
  runs: SourceRun[];
}

interface FinMindResponse {
  data?: FinMindRow[];
}

interface FinMindStockInfoResponse {
  data?: FinMindStockInfoRow[];
}

const FINMIND_ENDPOINT = "https://api.finmindtrade.com/api/v4/data";
const DEFAULT_TWSE_NEWS_URL = "https://openapi.twse.com.tw/v1/news/newsList";
const DEFAULT_MOPS_MATERIAL_URL = "https://mops.twse.com.tw/mops/web/t05sr01_1";
const DEFAULT_PTT_STOCK_URL = "https://www.ptt.cc/bbs/Stock/index.html";
const DEFAULT_RSS_FEED_URL = "https://tw.stock.yahoo.com/rss?category=news";
const DEFAULT_FETCH_ATTEMPTS = 2;

export async function fetchLiveSources(input: FetchLiveSourcesInput): Promise<LiveSourceResult> {
  const fetcher = input.fetcher ?? fetch;
  const [ptt, rss, twse, mops, finmind] = await Promise.all([
    fetchPttSource(fetcher, input.env, input.now),
    fetchRssSources(fetcher, input.env, input.now),
    fetchTwseNewsSource(fetcher, input.env, input.now),
    fetchMopsMaterialSource(fetcher, input.env, input.now),
    fetchFinMindSources(fetcher, input.env, input.now, input.finmindSymbols ?? [])
  ]);

  return {
    sources: {
      ...(ptt.body ? { pttHtml: ptt.body } : {}),
      ...(rss.body ? { rssXml: rss.body } : {}),
      ...(twse.rows.length > 0 ? { twseNewsRows: twse.rows } : {}),
      ...(mops.rows.length > 0 ? { mopsMaterialRows: mops.rows } : {}),
      ...(finmind.rows.length > 0 ? { finmindRows: finmind.rows } : {}),
      ...(finmind.stockInfoRows.length > 0 ? { finmindStockInfoRows: finmind.stockInfoRows } : {})
    },
    runs: [ptt.run, rss.run, twse.run, mops.run, finmind.run]
  };
}

async function fetchPttSource(fetcher: typeof fetch, env: SourceEnv, now: string): Promise<{ body?: string; run: SourceRun }> {
  const pageLimit = parsePttPageLimit(env.PTT_STOCK_PAGES);
  let nextUrl: string | undefined = env.PTT_STOCK_URL ?? DEFAULT_PTT_STOCK_URL;
  const bodies: string[] = [];
  let failedCount = 0;

  for (let page = 0; page < pageLimit && nextUrl; page += 1) {
    const currentUrl = nextUrl;
    const result = await fetchTextSource("ptt", fetcher, currentUrl, now, {
      headers: new Headers({
        cookie: "over18=1",
        "user-agent": "StockAnalyticsV2/0.1"
      }),
      countItems: (body) => parsePttTitles(body).length
    });

    if (!result.body) {
      failedCount += 1;
      if (page === 0) {
        return result;
      }
      break;
    }

    bodies.push(result.body);
    nextUrl = extractPttPreviousPageUrl(result.body, currentUrl);
  }

  const itemCount = bodies.reduce((total, body) => total + parsePttTitles(body).length, 0);
  const status = failedCount > 0 ? "partial" : "ok";
  return {
    ...(bodies.length > 0 ? { body: bodies.join("\n") } : {}),
    run: buildRun(
      "ptt",
      now,
      status,
      itemCount,
      failedCount > 0 ? `${failedCount} PTT page(s) failed` : undefined
    )
  };
}

async function fetchRssSources(fetcher: typeof fetch, env: SourceEnv, now: string): Promise<{ body?: string; run: SourceRun }> {
  const urls = parseRssUrls(env);
  const results = await Promise.all(urls.map(async (url) => {
    const result = await fetchTextSource("rss", fetcher, url, now, {
      countItems: countRssItems
    });
    return { url, ...result };
  }));
  const bodies = results.flatMap((result) => result.body ? [result.body] : []);
  const itemCount = bodies.reduce((total, body) => total + countRssItems(body), 0);
  const failedCount = results.filter((result) => result.run.status === "failed").length;
  const status = failedCount === urls.length ? "failed" : failedCount > 0 ? "partial" : "ok";

  return {
    ...(bodies.length > 0 ? { body: bodies.join("\n") } : {}),
    run: buildRun(
      "rss",
      now,
      status,
      itemCount,
      failedCount > 0 ? `${failedCount} RSS feed(s) failed` : undefined
    )
  };
}

async function fetchTwseNewsSource(fetcher: typeof fetch, env: SourceEnv, now: string): Promise<{ rows: TwseNewsRow[]; run: SourceRun }> {
  const url = env.TWSE_NEWS_URL ?? DEFAULT_TWSE_NEWS_URL;
  const response = await safeFetch(fetcher, url, {
    headers: new Headers({
      accept: "application/json",
      "user-agent": "StockAnalyticsV2/0.1"
    })
  });
  if (!response?.ok) {
    return {
      rows: [],
      run: buildRun("twse", now, "failed", 0, response ? `HTTP ${response.status}` : "Fetch failed")
    };
  }

  const body = await readJson<unknown>(response);
  const rows = Array.isArray(body) ? body.filter(isTwseNewsRow) : [];
  return {
    rows,
    run: buildRun("twse", now, "ok", rows.length)
  };
}

async function fetchMopsMaterialSource(fetcher: typeof fetch, env: SourceEnv, now: string): Promise<{ rows: MopsMaterialInfoRow[]; run: SourceRun }> {
  const url = env.MOPS_MATERIAL_URL ?? DEFAULT_MOPS_MATERIAL_URL;
  const response = await safeFetch(fetcher, url, {
    headers: new Headers({
      accept: "application/json,text/html",
      "user-agent": "StockAnalyticsV2/0.1"
    })
  });
  if (!response?.ok) {
    return {
      rows: [],
      run: buildRun("mops", now, "failed", 0, response ? `HTTP ${response.status}` : "Fetch failed")
    };
  }

  const contentType = response.headers.get("content-type") ?? "";
  const rows = contentType.includes("json")
    ? parseMopsJson(await readJson<unknown>(response))
    : parseMopsHtml(await response.text(), url);
  return {
    rows,
    run: buildRun("mops", now, "ok", rows.length)
  };
}

async function fetchFinMindSources(
  fetcher: typeof fetch,
  env: SourceEnv,
  now: string,
  dynamicSymbols: string[]
): Promise<{ rows: FinMindRow[]; stockInfoRows: FinMindStockInfoRow[]; run: SourceRun }> {
  const startedAt = now;
  const symbols = mergeSymbols(parseSymbols(env.FINMIND_SYMBOLS), dynamicSymbols, parseSymbolLimit(env.FINMIND_DYNAMIC_SYMBOL_LIMIT));

  const [stockInfoRows, priceRows, institutionalRows, marginRows, monthlyRevenueRows] = await Promise.all([
    fetchFinMindStockInfoRows(fetcher, env.FINMIND_TOKEN),
    fetchFinMindRowsByDataset(fetcher, env.FINMIND_TOKEN, symbols, now, "TaiwanStockPrice", priceStartDate(now)),
    fetchFinMindRowsByDataset(fetcher, env.FINMIND_TOKEN, symbols, now, "TaiwanStockInstitutionalInvestorsBuySell"),
    fetchFinMindRowsByDataset(fetcher, env.FINMIND_TOKEN, symbols, now, "TaiwanStockMarginPurchaseShortSale"),
    fetchFinMindRowsByDataset(fetcher, env.FINMIND_TOKEN, symbols, now, "TaiwanStockMonthRevenue", revenueStartDate(now))
  ]);

  const flatRows = [...priceRows, ...institutionalRows, ...marginRows, ...monthlyRevenueRows].flat();
  const itemCount = flatRows.length + stockInfoRows.length;
  const missingSignalConfig = symbols.length === 0;
  const anonymousSignalRows = !env.FINMIND_TOKEN && flatRows.length > 0;
  return {
    rows: flatRows,
    stockInfoRows,
    run: buildRun(
      "finmind",
      startedAt,
      itemCount > 0 && !missingSignalConfig && !anonymousSignalRows ? "ok" : "partial",
      itemCount,
      missingSignalConfig
        ? "FINMIND_SYMBOLS not configured for price/chip/revenue data"
        : anonymousSignalRows
          ? "FINMIND_TOKEN not configured; using anonymous limited price/chip/revenue data"
          : itemCount > 0 ? undefined : "No FinMind rows returned"
    )
  };
}

async function fetchFinMindStockInfoRows(fetcher: typeof fetch, token: string | undefined): Promise<FinMindStockInfoRow[]> {
  const url = new URL(FINMIND_ENDPOINT);
  url.searchParams.set("dataset", "TaiwanStockInfo");

  const response = await safeFetch(fetcher, url.toString(), token ? {
    headers: new Headers({ authorization: `Bearer ${token}` })
  } : undefined);
  if (!response?.ok) {
    return [];
  }
  const body = await readJson<FinMindStockInfoResponse>(response);
  return body.data ?? [];
}

async function fetchFinMindRowsByDataset(
  fetcher: typeof fetch,
  token: string | undefined,
  symbols: string[],
  now: string,
  dataset: "TaiwanStockPrice" | "TaiwanStockInstitutionalInvestorsBuySell" | "TaiwanStockMarginPurchaseShortSale"
    | "TaiwanStockMonthRevenue",
  startDate = now.slice(0, 10)
): Promise<FinMindRow[][]> {
  if (symbols.length === 0) {
    return [];
  }

  return Promise.all(symbols.map(async (symbol) => {
    const url = new URL(FINMIND_ENDPOINT);
    url.searchParams.set("dataset", dataset);
    url.searchParams.set("data_id", symbol);
    url.searchParams.set("start_date", startDate);

    const response = await safeFetch(fetcher, url.toString(), {
      ...(token ? { headers: new Headers({ authorization: `Bearer ${token}` }) } : {})
    });
    if (!response?.ok) {
      return [];
    }
    const body = await readJson<FinMindResponse>(response);
    return (body.data ?? []).map((row) => ({
      ...row,
      stock_id: row.stock_id ?? symbol
    }));
  }));
}

async function fetchTextSource(
  source: SourceKind,
  fetcher: typeof fetch,
  url: string,
  now: string,
  options: RequestInit & { countItems: (body: string) => number }
): Promise<{ body?: string; run: SourceRun }> {
  const { countItems, ...init } = options;
  const response = await safeFetch(fetcher, url, init);
  if (!response?.ok) {
    return {
      run: buildRun(source, now, "failed", 0, response ? `HTTP ${response.status}` : "Fetch failed")
    };
  }
  const body = await response.text();
  return {
    body,
    run: buildRun(source, now, "ok", countItems(body))
  };
}

async function safeFetch(fetcher: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response | undefined> {
  let lastResponse: Response | undefined;
  for (let attempt = 1; attempt <= DEFAULT_FETCH_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      if (!isRetryableResponse(response) || attempt === DEFAULT_FETCH_ATTEMPTS) {
        if (!response.ok) {
          await cancelResponseBody(response);
        }
        return response;
      }
      await cancelResponseBody(response);
      lastResponse = response;
    } catch {
      if (attempt === DEFAULT_FETCH_ATTEMPTS) {
        return undefined;
      }
    }
  }
  return lastResponse;
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Body cancellation is best-effort; fetch status handling should continue.
  }
}

function isRetryableResponse(response: Response): boolean {
  return response.status === 408 || response.status === 429 || response.status >= 500;
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function isTwseNewsRow(value: unknown): value is TwseNewsRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.Title === "string" && typeof row.Url === "string" && typeof row.Date === "string";
}

function parseMopsJson(value: unknown): MopsMaterialInfoRow[] {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray((value as { data?: unknown })?.data)
      ? (value as { data: unknown[] }).data
      : [];
  return rows.filter(isMopsMaterialRow);
}

function parseMopsHtml(html: string, baseUrl: string): MopsMaterialInfoRow[] {
  return (html.match(/<tr[\s\S]*?<\/tr>/g) ?? []).flatMap((rowHtml) => {
    const cells = (rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) ?? [])
      .map((cell) => cell.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    const link = rowHtml.match(/href="([^"]+)"/)?.[1];
    const companyId = cells.find((cell) => /^\d{4,6}[A-Z]?$/.test(cell));
    const title = cells.find((cell) => cell.includes("公告") || cell.includes("重大") || cell.length > 12);
    if (!companyId || !title) {
      return [];
    }
    return [{
      companyId,
      companyName: cells[cells.indexOf(companyId) + 1],
      title,
      url: link ? new URL(link, baseUrl).toString() : baseUrl,
      date: cells.find((cell) => /^\d{3}\/?\d{2}\/?\d{2}$/.test(cell.replace(/\s/g, ""))),
      time: cells.find((cell) => /^\d{1,2}:\d{2}/.test(cell))
    }];
  });
}

function isMopsMaterialRow(value: unknown): value is MopsMaterialInfoRow {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.companyId === "string" && typeof row.title === "string";
}

function parseSymbols(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => /^\d{4,6}[A-Z]?$/.test(symbol));
}

function mergeSymbols(configured: string[], dynamic: string[], limit: number): string[] {
  const symbols = [...configured, ...dynamic]
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^\d{4,6}[A-Z]?$/.test(symbol));
  return [...new Set(symbols)].slice(0, limit);
}

function parseSymbolLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 20;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 20);
}

function parsePttPageLimit(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 1;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 5);
}

function parseRssUrls(env: SourceEnv): string[] {
  const configured = env.RSS_FEED_URLS ?? env.RSS_FEED_URL ?? DEFAULT_RSS_FEED_URL;
  const urls = configured
    .split(/[\n,]/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith("https://"));
  return urls.length > 0 ? urls : [DEFAULT_RSS_FEED_URL];
}

function revenueStartDate(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    return now.slice(0, 10);
  }
  parsed.setUTCDate(parsed.getUTCDate() - 75);
  return parsed.toISOString().slice(0, 10);
}

function priceStartDate(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    return now.slice(0, 10);
  }
  parsed.setUTCDate(parsed.getUTCDate() - 45);
  return parsed.toISOString().slice(0, 10);
}

function extractPttPreviousPageUrl(html: string, currentUrl: string): string | undefined {
  const match = html.match(/<a[^>]+href="([^"]+)"[^>]*>[^<]*上頁[^<]*<\/a>/);
  if (!match?.[1]) {
    return undefined;
  }
  return new URL(match[1], currentUrl).toString();
}

function buildRun(
  source: SourceKind,
  startedAt: string,
  status: SourceRun["status"],
  itemCount: number,
  message?: string
): SourceRun {
  return {
    id: `${source}:${startedAt}`,
    source,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    itemCount,
    ...(message ? { message } : {})
  };
}
