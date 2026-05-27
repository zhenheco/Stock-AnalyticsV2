import { describe, expect, it } from "vitest";
import { fetchLiveSources } from "../src/sources/live";

describe("fetchLiveSources", () => {
  it("fetches configured PTT, RSS, and FinMind sources", async () => {
    const requested: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        FINMIND_TOKEN: "token",
        FINMIND_SYMBOLS: "2330,2317",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input, init) => {
        const url = String(input);
        requested.push(`${init?.headers instanceof Headers ? init.headers.get("authorization") : ""} ${url}`);
        if (url.includes("finmindtrade") && url.includes("TaiwanStockInfo")) {
          return jsonResponse({
            data: [
              { stock_id: "2330", stock_name: "台積電", market_category: "上市", industry_category: "半導體業", type: "twse" },
              { stock_id: "2317", stock_name: "鴻海", market_category: "上市", industry_category: "其他電子業", type: "twse" }
            ]
          });
        }
        if (url.includes("finmindtrade")) {
          const symbol = new URL(url).searchParams.get("data_id");
          return jsonResponse({
            data: [
              { stock_id: "2330", stock_name: "台積電", close: 980, Trading_Volume: 1000 },
              { stock_id: "2317", stock_name: "鴻海", close: 180, Trading_Volume: 800 }
            ].filter((row) => row.stock_id === symbol)
          });
        }
        if (url.includes("rss.test")) {
          return textResponse("<rss><channel><item><title>台積電 2330 AI 新聞</title><link>https://news.test/1</link><pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate></item></channel></rss>");
        }
        return textResponse("<div class=\"r-ent\"><div class=\"nrec\"><span>9</span></div><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">[標的] 2330 台積電 討論</a></div><div class=\"date\"> 5/27</div></div>");
      }
    });

    expect(result.sources.finmindRows).toHaveLength(2);
    expect(result.sources.finmindStockInfoRows).toHaveLength(2);
    expect(result.sources.rssXml).toContain("台積電");
    expect(result.sources.pttHtml).toContain("2330");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "finmind", status: "ok", itemCount: 4 }),
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 1 }),
      expect.objectContaining({ source: "ptt", status: "ok", itemCount: 1 })
    ]));
    expect(requested.some((entry) => entry.includes("Bearer token"))).toBe(true);
    expect(requested.some((entry) => entry.includes("dataset=TaiwanStockInfo"))).toBe(true);
  });

  it("returns partial source data when one source fails", async () => {
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("rss.test")) {
          throw new Error("rss down");
        }
        return textResponse("<div class=\"r-ent\"><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">2330 台積電</a></div><div class=\"date\"> 5/27</div></div>");
      }
    });

    expect(result.sources.rssXml).toBeUndefined();
    expect(result.sources.pttHtml).toContain("台積電");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "rss", status: "failed", itemCount: 0 }),
      expect.objectContaining({ source: "ptt", status: "ok", itemCount: 1 })
    ]));
  });

  it("retries transient PTT server failures before marking the source failed", async () => {
    let pttAttempts = 0;
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("ptt.test")) {
          pttAttempts += 1;
          if (pttAttempts === 1) {
            return new Response("temporary ptt edge failure", { status: 522 });
          }
          return textResponse("<div class=\"r-ent\"><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">2330 台積電</a></div><div class=\"date\"> 5/27</div></div>");
        }
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        return textResponse("");
      }
    });

    expect(pttAttempts).toBe(2);
    expect(result.sources.pttHtml).toContain("台積電");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "ptt", status: "ok", itemCount: 1 })
    ]));
  });

  it("retries transient RSS fetch exceptions before using fallback health", async () => {
    let rssAttempts = 0;
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("rss.test")) {
          rssAttempts += 1;
          if (rssAttempts === 1) {
            throw new Error("connection reset");
          }
          return textResponse("<rss><channel><item><title>台積電 2330 AI 新聞</title><link>https://news.test/1</link><pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate></item></channel></rss>");
        }
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        return textResponse("<div class=\"r-ent\"><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">2330 台積電</a></div><div class=\"date\"> 5/27</div></div>");
      }
    });

    expect(rssAttempts).toBe(2);
    expect(result.sources.rssXml).toContain("台積電");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 1 })
    ]));
  });

  it("tries configured RSS fallback feeds and reports raw RSS item count", async () => {
    const requested: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URLS: "https://rss.test/empty.xml,https://rss.test/yahoo.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("empty.xml")) {
          return new Response("not found", { status: 404 });
        }
        if (url.includes("yahoo.xml")) {
          return textResponse(`
            <rss><channel><item>
              <title><![CDATA[廣宇衝刺AI與機器人商機]]></title>
              <link><![CDATA[https://news.test/2328]]></link>
              <pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate>
            </item></channel></rss>
          `);
        }
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        return textResponse("");
      }
    });

    expect(requested).toEqual(expect.arrayContaining([
      "https://rss.test/empty.xml",
      "https://rss.test/yahoo.xml"
    ]));
    expect(result.sources.rssXml).toContain("廣宇");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "rss",
        status: "partial",
        itemCount: 1,
        message: "1 RSS feed(s) failed"
      })
    ]));
  });

  it("fetches FinMind stock info without a token and leaves price data partial", async () => {
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({
            data: [
              { stock_id: "1402", stock_name: "遠東新", industry_category: "紡織纖維", type: "twse" }
            ]
          });
        }
        return textResponse("");
      }
    });

    expect(result.sources.finmindStockInfoRows).toEqual([
      expect.objectContaining({ stock_id: "1402", stock_name: "遠東新" })
    ]);
    expect(result.sources.finmindRows).toBeUndefined();
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "finmind", status: "partial", itemCount: 1 })
    ]));
  });

  it("merges configured and dynamic FinMind symbols for price fetching", async () => {
    const requestedSymbols: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        FINMIND_TOKEN: "token",
        FINMIND_SYMBOLS: "2330,2330",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      finmindSymbols: ["2317", "bad", "2330"],
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        if (url.includes("TaiwanStockPrice")) {
          const symbol = new URL(url).searchParams.get("data_id") ?? "";
          requestedSymbols.push(symbol);
          return jsonResponse({
            data: [{ stock_id: symbol, stock_name: symbol, close: 100, Trading_Volume: 10 }]
          });
        }
        return textResponse("");
      }
    });

    expect(requestedSymbols).toEqual(["2330", "2317"]);
    expect(result.sources.finmindRows).toHaveLength(2);
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "finmind", status: "ok", itemCount: 2 })
    ]));
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain" }
  });
}
