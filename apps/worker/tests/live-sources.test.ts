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
        if (url.includes("TaiwanStockInstitutionalInvestorsBuySell") || url.includes("TaiwanStockMarginPurchaseShortSale")) {
          return jsonResponse({ data: [] });
        }
        if (url.includes("TaiwanStockMonthRevenue")) {
          const symbol = new URL(url).searchParams.get("data_id");
          return jsonResponse({
            data: [
              { stock_id: "2330", date: "2026-05-01", revenue: 236021000000, revenue_month: 4, revenue_year: 2026 },
              { stock_id: "2317", date: "2026-05-01", revenue: 480000000000, revenue_month: 4, revenue_year: 2026 }
            ].filter((row) => row.stock_id === symbol)
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
        if (url.includes("openapi.twse.com.tw")) {
          return jsonResponse([
            {
              Title: "自115年5月27日起，永冠能源科技集團有限公司（永冠-KY，公司代號：1589）上市有價證券併案停止買賣",
              Url: "https://www.twse.com.tw/zh/about/news/news/content.html?id=1",
              Date: "1150525"
            }
          ]);
        }
        return textResponse("<div class=\"r-ent\"><div class=\"nrec\"><span>9</span></div><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">[標的] 2330 台積電 討論</a></div><div class=\"date\"> 5/27</div></div>");
      }
    });

    expect(result.sources.finmindRows).toHaveLength(4);
    expect(result.sources.finmindStockInfoRows).toHaveLength(2);
    expect(result.sources.rssXml).toContain("台積電");
    expect(result.sources.pttHtml).toContain("2330");
    expect(result.sources.twseNewsRows).toHaveLength(1);
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "finmind", status: "ok", itemCount: 6 }),
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 1 }),
      expect.objectContaining({ source: "ptt", status: "ok", itemCount: 1 }),
      expect.objectContaining({ source: "twse", status: "ok", itemCount: 1 })
    ]));
    expect(requested.some((entry) => entry.includes("Bearer token"))).toBe(true);
    expect(requested.some((entry) => entry.includes("dataset=TaiwanStockInfo"))).toBe(true);
  });

  it("fetches TWSE official OpenAPI news as a tokenless event source", async () => {
    const requested: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.includes("openapi.twse.com.tw")) {
          return jsonResponse([
            {
              Title: "東方風能科技股份有限公司上市股票自本（115）年5月27日起得為融資融券交易",
              Url: "https://www.twse.com.tw/zh/about/news/news/content.html?id=2",
              Date: "1150526"
            }
          ]);
        }
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        return textResponse("");
      }
    });

    expect(requested).toContain("https://openapi.twse.com.tw/v1/news/newsList");
    expect(result.sources.twseNewsRows).toEqual([
      expect.objectContaining({
        Title: "東方風能科技股份有限公司上市股票自本（115）年5月27日起得為融資融券交易"
      })
    ]);
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "twse", status: "ok", itemCount: 1 })
    ]));
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

  it("fetches recent PTT pages by following previous page links", async () => {
    const requested: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        PTT_STOCK_PAGES: "2",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://www.ptt.cc/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url.endsWith("/bbs/Stock/index.html")) {
          return textResponse(`
            <div class="btn-group-paging">
              <a class="btn wide" href="/bbs/Stock/index999.html">上頁</a>
            </div>
            <div class="r-ent">
              <div class="nrec"><span>9</span></div>
              <div class="title"><a href="/bbs/Stock/M.3.html">[標的] 2330 台積電 討論</a></div>
              <div class="date"> 5/27</div>
            </div>
          `);
        }
        if (url.endsWith("/bbs/Stock/index999.html")) {
          return textResponse(`
            <div class="r-ent">
              <div class="nrec"><span>12</span></div>
              <div class="title"><a href="/bbs/Stock/M.2.html">[新聞] 2317 鴻海 AI 伺服器</a></div>
              <div class="date"> 5/27</div>
            </div>
          `);
        }
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        return textResponse("");
      }
    });

    expect(requested).toEqual(expect.arrayContaining([
      "https://www.ptt.cc/bbs/Stock/index.html",
      "https://www.ptt.cc/bbs/Stock/index999.html"
    ]));
    expect(result.sources.pttHtml).toContain("2330 台積電");
    expect(result.sources.pttHtml).toContain("2317 鴻海");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "ptt", status: "ok", itemCount: 2 })
    ]));
  });

  it("retries transient RSS fetch exceptions before using fallback health", async () => {
    let rssAttempts = 0;
    let canceledBodies = 0;
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
            return cancellableResponse(522, () => {
              canceledBodies += 1;
            });
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
    expect(canceledBodies).toBe(1);
    expect(result.sources.rssXml).toContain("台積電");
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 1 })
    ]));
  });

  it("tries configured RSS fallback feeds and reports raw RSS item count", async () => {
    const requested: string[] = [];
    let canceledBodies = 0;
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
          return cancellableResponse(404, () => {
            canceledBodies += 1;
          });
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
    expect(canceledBodies).toBe(1);
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

  it("fetches anonymous FinMind price and chip rows when token is missing but symbols are configured", async () => {
    const requested: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        FINMIND_SYMBOLS: "2330",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input, init) => {
        const url = String(input);
        if (url.includes("finmindtrade")) {
          requested.push(`${init?.headers instanceof Headers ? init.headers.get("authorization") : ""} ${url}`);
        }
        if (url.includes("TaiwanStockInfo")) {
          return jsonResponse({ data: [] });
        }
        if (url.includes("TaiwanStockPrice")) {
          return jsonResponse({ data: [{ stock_id: "2330", stock_name: "台積電", close: 2300, Trading_Volume: 40272350 }] });
        }
        if (url.includes("TaiwanStockInstitutionalInvestorsBuySell")) {
          return jsonResponse({ data: [{ stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "Foreign_Investor", buy: 5000, sell: 1000 }] });
        }
        if (url.includes("TaiwanStockMarginPurchaseShortSale")) {
          return jsonResponse({ data: [{ date: "2026-05-27", name: "MarginPurchase", buy: 900, sell: 100, Return: 0, TodayBalance: 12000, YesBalance: 11200 }] });
        }
        return textResponse("");
      }
    });

    expect(result.sources.finmindRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ stock_id: "2330", close: 2300 }),
      expect.objectContaining({ stock_id: "2330", name: "Foreign_Investor" }),
      expect.objectContaining({ stock_id: "2330", name: "MarginPurchase" })
    ]));
    expect(requested.some((entry) => entry.includes("Bearer"))).toBe(false);
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "finmind",
        status: "partial",
        itemCount: 3,
        message: "FINMIND_TOKEN not configured; using anonymous limited price/chip/revenue data"
      })
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

  it("fetches FinMind chip and monthly revenue datasets for configured and dynamic symbols", async () => {
    const requestedDatasets: string[] = [];
    const result = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        FINMIND_TOKEN: "token",
        FINMIND_SYMBOLS: "2330",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      finmindSymbols: ["2317"],
      fetcher: async (input) => {
        const url = String(input);
        if (!url.includes("finmindtrade")) {
          return textResponse("");
        }
        const parsed = new URL(url);
        const dataset = parsed.searchParams.get("dataset") ?? "";
        const symbol = parsed.searchParams.get("data_id") ?? "";
        requestedDatasets.push(`${dataset}:${symbol}`);
        if (dataset === "TaiwanStockInfo") {
          return jsonResponse({ data: [] });
        }
        if (dataset === "TaiwanStockPrice") {
          return jsonResponse({ data: [{ stock_id: symbol, stock_name: symbol, close: 100, Trading_Volume: 10 }] });
        }
        if (dataset === "TaiwanStockInstitutionalInvestorsBuySell") {
          return jsonResponse({ data: [{ stock_id: symbol, stock_name: symbol, date: "2026-05-27", name: "Foreign_Investor", buy: 5000, sell: 1000 }] });
        }
        if (dataset === "TaiwanStockMarginPurchaseShortSale") {
          return jsonResponse({ data: [{ date: "2026-05-27", name: "MarginPurchase", buy: 900, sell: 100, Return: 0, TodayBalance: 12000, YesBalance: 11200 }] });
        }
        if (dataset === "TaiwanStockMonthRevenue") {
          return jsonResponse({ data: [{ stock_id: symbol, date: "2026-05-01", revenue: 236021000000, revenue_month: 4, revenue_year: 2026 }] });
        }
        return jsonResponse({ data: [] });
      }
    });

    expect(requestedDatasets).toEqual(expect.arrayContaining([
      "TaiwanStockInstitutionalInvestorsBuySell:2330",
      "TaiwanStockInstitutionalInvestorsBuySell:2317",
      "TaiwanStockMarginPurchaseShortSale:2330",
      "TaiwanStockMarginPurchaseShortSale:2317",
      "TaiwanStockMonthRevenue:2330",
      "TaiwanStockMonthRevenue:2317"
    ]));
    expect(result.sources.finmindRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ stock_id: "2330", name: "Foreign_Investor" }),
      expect.objectContaining({ stock_id: "2330", name: "MarginPurchase" }),
      expect.objectContaining({ stock_id: "2317", name: "Foreign_Investor" }),
      expect.objectContaining({ stock_id: "2317", name: "MarginPurchase" }),
      expect.objectContaining({ stock_id: "2330", revenue: 236021000000 }),
      expect.objectContaining({ stock_id: "2317", revenue: 236021000000 })
    ]));
    expect(result.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "finmind", status: "ok", itemCount: 8 })
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

function cancellableResponse(status: number, onCancel: () => void): Response {
  return new Response(new ReadableStream({
    cancel: onCancel
  }), { status });
}
