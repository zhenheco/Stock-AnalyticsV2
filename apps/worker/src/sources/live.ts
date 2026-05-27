import type { FinMindRow } from "@stock-analytics/shared";
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

interface FinMindResponse {
  data?: FinMindRow[];
}

const FINMIND_ENDPOINT = "https://api.finmindtrade.com/api/v4/data";
const DEFAULT_PTT_STOCK_URL = "https://www.ptt.cc/bbs/Stock/index.html";
const DEFAULT_RSS_FEED_URL = "https://tw.stock.yahoo.com/rss?category=news";

export async function fetchLiveSources(input: FetchLiveSourcesInput): Promise<IngestionSources> {
  const fetcher = input.fetcher ?? fetch;
  const [pttHtml, rssXml, finmindRows] = await Promise.all([
    fetchText(fetcher, input.env.PTT_STOCK_URL ?? DEFAULT_PTT_STOCK_URL, {
      headers: new Headers({
        cookie: "over18=1",
        "user-agent": "StockAnalyticsV2/0.1"
      })
    }),
    fetchText(fetcher, input.env.RSS_FEED_URL ?? DEFAULT_RSS_FEED_URL),
    fetchFinMindRows(fetcher, input.env, input.now)
  ]);

  return {
    ...(pttHtml ? { pttHtml } : {}),
    ...(rssXml ? { rssXml } : {}),
    ...(finmindRows.length > 0 ? { finmindRows } : {})
  };
}

async function fetchFinMindRows(fetcher: typeof fetch, env: SourceEnv, now: string): Promise<FinMindRow[]> {
  const symbols = parseSymbols(env.FINMIND_SYMBOLS);
  if (!env.FINMIND_TOKEN || symbols.length === 0) {
    return [];
  }

  const rows = await Promise.all(symbols.map(async (symbol) => {
    const url = new URL(FINMIND_ENDPOINT);
    url.searchParams.set("dataset", "TaiwanStockPrice");
    url.searchParams.set("data_id", symbol);
    url.searchParams.set("start_date", now.slice(0, 10));

    const response = await safeFetch(fetcher, url.toString(), {
      headers: new Headers({ authorization: `Bearer ${env.FINMIND_TOKEN}` })
    });
    if (!response?.ok) {
      return [];
    }
    const body = await response.json() as FinMindResponse;
    return body.data ?? [];
  }));

  return rows.flat();
}

async function fetchText(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<string | undefined> {
  const response = await safeFetch(fetcher, url, init);
  if (!response?.ok) {
    return undefined;
  }
  return await response.text();
}

async function safeFetch(fetcher: typeof fetch, input: RequestInfo | URL, init?: RequestInit): Promise<Response | undefined> {
  try {
    return await fetcher(input, init);
  } catch {
    return undefined;
  }
}

function parseSymbols(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter((symbol) => /^\d{4,6}[A-Z]?$/.test(symbol));
}
