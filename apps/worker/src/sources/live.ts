import {
  parsePttTitles,
  parseRssItems,
  type FinMindRow,
  type FinMindStockInfoRow,
  type SourceKind,
  type SourceRun
} from "@stock-analytics/shared";
import type { IngestionSources } from "../ingest";

export interface SourceEnv {
  FINMIND_TOKEN?: string;
  FINMIND_SYMBOLS?: string;
  RSS_FEED_URL?: string;
  PTT_STOCK_URL?: string;
}

export interface FetchLiveSourcesInput {
  now: string;
  env: SourceEnv;
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
const DEFAULT_PTT_STOCK_URL = "https://www.ptt.cc/bbs/Stock/index.html";
const DEFAULT_RSS_FEED_URL = "https://tw.stock.yahoo.com/rss?category=news";

export async function fetchLiveSources(input: FetchLiveSourcesInput): Promise<LiveSourceResult> {
  const fetcher = input.fetcher ?? fetch;
  const [ptt, rss, finmind] = await Promise.all([
    fetchTextSource("ptt", fetcher, input.env.PTT_STOCK_URL ?? DEFAULT_PTT_STOCK_URL, input.now, {
      headers: new Headers({
        cookie: "over18=1",
        "user-agent": "StockAnalyticsV2/0.1"
      }),
      countItems: (body) => parsePttTitles(body).length
    }),
    fetchTextSource("rss", fetcher, input.env.RSS_FEED_URL ?? DEFAULT_RSS_FEED_URL, input.now, {
      countItems: (body) => parseRssItems(body).length
    }),
    fetchFinMindSources(fetcher, input.env, input.now)
  ]);

  return {
    sources: {
      ...(ptt.body ? { pttHtml: ptt.body } : {}),
      ...(rss.body ? { rssXml: rss.body } : {}),
      ...(finmind.rows.length > 0 ? { finmindRows: finmind.rows } : {}),
      ...(finmind.stockInfoRows.length > 0 ? { finmindStockInfoRows: finmind.stockInfoRows } : {})
    },
    runs: [ptt.run, rss.run, finmind.run]
  };
}

async function fetchFinMindSources(
  fetcher: typeof fetch,
  env: SourceEnv,
  now: string
): Promise<{ rows: FinMindRow[]; stockInfoRows: FinMindStockInfoRow[]; run: SourceRun }> {
  const startedAt = now;
  const symbols = parseSymbols(env.FINMIND_SYMBOLS);

  const [stockInfoRows, rows] = await Promise.all([
    fetchFinMindStockInfoRows(fetcher, env.FINMIND_TOKEN),
    env.FINMIND_TOKEN ? fetchFinMindPriceRows(fetcher, env.FINMIND_TOKEN, symbols, now) : Promise.resolve([])
  ]);

  const flatRows = rows.flat();
  const itemCount = flatRows.length + stockInfoRows.length;
  const missingPriceConfig = !env.FINMIND_TOKEN || symbols.length === 0;
  return {
    rows: flatRows,
    stockInfoRows,
    run: buildRun(
      "finmind",
      startedAt,
      itemCount > 0 && !missingPriceConfig ? "ok" : "partial",
      itemCount,
      missingPriceConfig ? "FINMIND_TOKEN or FINMIND_SYMBOLS not configured for price data" : itemCount > 0 ? undefined : "No FinMind rows returned"
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

async function fetchFinMindPriceRows(fetcher: typeof fetch, token: string, symbols: string[], now: string): Promise<FinMindRow[][]> {
  if (symbols.length === 0) {
    return [];
  }

  return Promise.all(symbols.map(async (symbol) => {
    const url = new URL(FINMIND_ENDPOINT);
    url.searchParams.set("dataset", "TaiwanStockPrice");
    url.searchParams.set("data_id", symbol);
    url.searchParams.set("start_date", now.slice(0, 10));

    const response = await safeFetch(fetcher, url.toString(), {
      headers: new Headers({ authorization: `Bearer ${token}` })
    });
    if (!response?.ok) {
      return [];
    }
    const body = await readJson<FinMindResponse>(response);
    return body.data ?? [];
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
  try {
    return await fetcher(input, init);
  } catch {
    return undefined;
  }
}

async function readJson<T extends { data?: unknown[] }>(response: Response): Promise<T> {
  try {
    return await response.json() as T;
  } catch {
    return {} as T;
  }
}

function parseSymbols(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => /^\d{4,6}[A-Z]?$/.test(symbol));
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
