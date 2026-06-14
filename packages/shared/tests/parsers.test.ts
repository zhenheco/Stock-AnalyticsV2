import { describe, expect, it } from "vitest";
import { normalizeFinMindRows, normalizeFinMindStockInfoRows, normalizeMopsMaterialInfoRows, normalizeTwseNewsRows, parsePttTitles, parseRssItems } from "../src/parsers";

describe("parsePttTitles", () => {
  it("extracts title, url, push count, published time, and mentioned symbols", () => {
    const html = `
      <div class="r-ent">
        <div class="nrec"><span class="hl f2">12</span></div>
        <div class="title"><a href="/bbs/Stock/M.1.html">[標的] 2330 台積電 AI 需求</a></div>
        <div class="date"> 5/27</div>
      </div>
    `;

    expect(parsePttTitles(html, "https://www.ptt.cc")).toEqual([
      {
        source: "ptt",
        title: "[標的] 2330 台積電 AI 需求",
        url: "https://www.ptt.cc/bbs/Stock/M.1.html",
        publishedAt: "2026-05-27T00:00:00.000+08:00",
        engagement: 12,
        symbols: ["2330"]
      }
    ]);
  });

  it("keeps PTT dates valid when parsing real board row structure", () => {
    const html = `
      <div class="r-ent">
        <div class="nrec"><span class="hl f2">5</span></div>
        <div class="title"><a href="/bbs/Stock/M.2.html">Re: [新聞] 台積電分紅爭議</a></div>
        <div class="meta"><div class="author">abc</div><div class="date"> 5/27</div></div>
      </div>
      <div class="r-ent">
        <div class="title"><a href="/bbs/Stock/M.3.html">[閒聊] 2026/05/27 盤中閒聊</a></div>
        <div class="meta"><div class="date"> 5/27</div></div>
      </div>
    `;

    expect(parsePttTitles(html, "https://www.ptt.cc")).toEqual([
      expect.objectContaining({
        title: "Re: [新聞] 台積電分紅爭議",
        publishedAt: "2026-05-27T00:00:00.000+08:00",
        symbols: ["2330"]
      })
    ]);
  });

  it("does not treat percentage figures in PTT titles as stock symbols", () => {
    const html = `
      <div class="r-ent">
        <div class="title"><a href="/bbs/Stock/M.4.html">[情報] 3037 欣興 4月自結 1.85 年增:4725%</a></div>
        <div class="meta"><div class="date"> 5/27</div></div>
      </div>
    `;

    expect(parsePttTitles(html, "https://www.ptt.cc", {}, new Set(["3037", "4725"]))).toEqual([
      expect.objectContaining({
        title: "[情報] 3037 欣興 4月自結 1.85 年增:4725%",
        symbols: ["3037"]
      })
    ]);
  });
});

describe("parseRssItems", () => {
  it("extracts RSS items with related Taiwan stock symbols", () => {
    const xml = `
      <rss><channel>
        <item>
          <title>台積電 2330 先進封裝需求升溫</title>
          <link>https://example.com/news/1</link>
          <pubDate>Wed, 27 May 2026 01:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;

    expect(parseRssItems(xml)).toEqual([
      {
        source: "rss",
        title: "台積電 2330 先進封裝需求升溫",
        url: "https://example.com/news/1",
        publishedAt: "2026-05-27T01:00:00.000Z",
        engagement: 0,
        symbols: ["2330"]
      }
    ]);
  });

  it("extracts symbols from configured company aliases when titles omit stock codes", () => {
    const xml = `
      <rss><channel>
        <item>
          <title>南帝乳膠產品報價升溫</title>
          <link>https://example.com/news/2</link>
          <pubDate>Wed, 27 May 2026 01:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;

    expect(parseRssItems(xml, { 南帝: "2108" })).toEqual([
      expect.objectContaining({
        title: "南帝乳膠產品報價升溫",
        symbols: ["2108"]
      })
    ]);
  });

  it("cleans CDATA wrappers from RSS titles and links", () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[廣宇衝刺AI與機器人商機]]></title>
          <link><![CDATA[https://news.test/2328]]></link>
          <pubDate>Wed, 27 May 2026 01:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;

    expect(parseRssItems(xml, { 廣宇: "2328" })).toEqual([
      {
        source: "rss",
        title: "廣宇衝刺AI與機器人商機",
        url: "https://news.test/2328",
        publishedAt: "2026-05-27T01:00:00.000Z",
        engagement: 0,
        symbols: ["2328"]
      }
    ]);
  });

  it("filters numeric RSS matches to known stock symbols when a universe is provided", () => {
    const xml = `
      <rss><channel>
        <item>
          <title>2026年AI支出達8000億 台積電2330受惠</title>
          <link>https://example.com/news/3</link>
          <pubDate>Wed, 27 May 2026 01:00:00 GMT</pubDate>
        </item>
      </channel></rss>
    `;

    expect(parseRssItems(xml, {}, new Set(["2330"]))).toEqual([
      expect.objectContaining({
        symbols: ["2330"]
      })
    ]);
  });
});

describe("normalizeTwseNewsRows", () => {
  it("normalizes TWSE OpenAPI news rows into official source events", () => {
    expect(normalizeTwseNewsRows([
      {
        Title: "自115年5月27日起，永冠能源科技集團有限公司（永冠-KY，公司代號：1589）上市有價證券併案停止買賣",
        Url: "https://www.twse.com.tw/zh/about/news/news/content.html?id=1",
        Date: "1150525"
      },
      {
        Title: "市場制度宣導未提及個股",
        Url: "https://www.twse.com.tw/zh/about/news/news/content.html?id=2",
        Date: "1150524"
      }
    ], { "永冠-KY": "1589" })).toEqual([
      {
        source: "twse",
        title: "自115年5月27日起，永冠能源科技集團有限公司（永冠-KY，公司代號：1589）上市有價證券併案停止買賣",
        url: "https://www.twse.com.tw/zh/about/news/news/content.html?id=1",
        publishedAt: "2026-05-25T00:00:00.000+08:00",
        engagement: 0,
        symbols: ["1589"]
      }
    ]);
  });
});

describe("normalizeFinMindStockInfoRows", () => {
  it("normalizes TaiwanStockInfo rows into a Taiwan stock universe", () => {
    expect(normalizeFinMindStockInfoRows([
      {
        stock_id: "2330",
        stock_name: "台積電",
        market_category: "上市",
        industry_category: "半導體業",
        type: "twse"
      },
      {
        stock_id: "0050",
        stock_name: "元大台灣50",
        market_category: "上市",
        industry_category: "ETF",
        type: "ETF"
      },
      {
        stock_id: "TWA00",
        stock_name: "加權指數",
        market_category: "Index",
        industry_category: "指數",
        type: "index"
      }
    ], "2026-05-27T05:00:00.000Z")).toEqual([
      {
        symbol: "2330",
        name: "台積電",
        market: "上市",
        industry: "半導體業",
        securityType: "stock",
        updatedAt: "2026-05-27T05:00:00.000Z"
      },
      {
        symbol: "0050",
        name: "元大台灣50",
        market: "上市",
        industry: "ETF",
        securityType: "etf",
        updatedAt: "2026-05-27T05:00:00.000Z"
      }
    ]);
  });
});

describe("normalizeFinMindRows", () => {
  it("uses stock_id as the symbol without treating volume as another stock code", () => {
    expect(normalizeFinMindRows([
      { stock_id: "2317", stock_name: "鴻海", close: 180, Trading_Volume: 1000 }
    ], "2026-05-27T05:00:00.000Z")).toEqual([
      expect.objectContaining({
        source: "finmind",
        title: "2317 鴻海 收 180",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockPrice&data_id=2317",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 0,
        symbols: ["2317"]
      })
    ]);
  });

  it("normalizes institutional buy/sell rows into chip events", () => {
    expect(normalizeFinMindRows([
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "Foreign_Investor", buy: 5000, sell: 1000 }
    ], "2026-05-27T05:00:00.000Z")).toEqual([
      {
        source: "finmind",
        title: "2330 台積電 外資 買超 4000 股",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=2330&name=Foreign_Investor",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 4000,
        symbols: ["2330"]
      }
    ]);
  });

  it("normalizes margin purchase rows into chip events", () => {
    expect(normalizeFinMindRows([
      {
        stock_id: "2330",
        stock_name: "台積電",
        date: "2026-05-27",
        name: "MarginPurchase",
        buy: 900,
        sell: 100,
        Return: 0,
        TodayBalance: 12000,
        YesBalance: 11200
      }
    ], "2026-05-27T05:00:00.000Z")).toEqual([
      {
        source: "finmind",
        title: "2330 台積電 融資增加 800 張 餘額 12000",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockMarginPurchaseShortSale&data_id=2330&name=MarginPurchase",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 800,
        symbols: ["2330"]
      }
    ]);
  });

  it("keeps institutional/margin chip rows one event per row with metrics undefined", () => {
    const events = normalizeFinMindRows([
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "Foreign_Investor", buy: 5000, sell: 1000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "MarginPurchase", buy: 900, sell: 100, Return: 0, TodayBalance: 12000, YesBalance: 11200 }
    ], "2026-05-27T05:00:00.000Z");

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.metrics === undefined)).toBe(true);
    expect(events[0]).toMatchObject({ title: "2330 台積電 外資 買超 4000 股", engagement: 4000 });
    expect(events[1]).toMatchObject({ title: "2330 台積電 融資增加 800 張 餘額 12000", engagement: 800 });
  });

  it("accepts an optional symbol→securityType map without breaking chip rows", () => {
    const securityTypes = new Map<string, import("../src/types").SecurityType>([["2330", "stock"]]);
    const events = normalizeFinMindRows([
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "Foreign_Investor", buy: 5000, sell: 1000 }
    ], "2026-05-27T05:00:00.000Z", securityTypes);

    expect(events).toEqual([
      expect.objectContaining({ title: "2330 台積電 外資 買超 4000 股", metrics: undefined })
    ]);
  });

  it("groups price rows per symbol into one summary event with metrics and engagement 0", () => {
    const securityTypes = new Map<string, import("../src/types").SecurityType>([["2330", "stock"]]);
    const priceRows = [
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-26", close: 924.6, Trading_Volume: 3000, Trading_money: 2_773_800 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-25", close: 900, Trading_Volume: 3000, Trading_money: 2_700_000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-24", close: 890, Trading_Volume: 3000, Trading_money: 2_670_000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-23", close: 880, Trading_Volume: 3000, Trading_money: 2_640_000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-22", close: 870, Trading_Volume: 3000, Trading_money: 2_610_000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-21", close: 860, Trading_Volume: 3000, Trading_money: 2_580_000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", close: 985, Trading_Volume: 30000, Trading_money: 29_550_000 }
    ];

    const events = normalizeFinMindRows(priceRows, "2026-05-27T05:00:00.000Z", securityTypes);

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toBeDefined();
    if (!event) {
      throw new Error("expected price summary event");
    }
    expect(event.source).toBe("finmind");
    expect(event.engagement).toBe(0);
    expect(event.url).toBe("https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockPrice&data_id=2330");
    expect(event.symbols).toEqual(["2330"]);
    expect(event.title).toContain("2330 台積電 收 985");
    expect(event.title).toContain("漲 +6.5%");
    expect(event.title).toContain("量 10.0x");
    expect(event.title).toContain("爆量");
    expect(event.metrics).toMatchObject({ priceChangePct: 6.53, volumeRatio: 10 });
    expect(event.metrics?.limitFlag).toBeUndefined();
  });

  it("labels a negative price summary as 跌 (not 漲) and tags 跌停", () => {
    const securityTypes = new Map<string, import("../src/types").SecurityType>([["2330", "stock"]]);
    const priceRows = [
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-26", close: 1000, Trading_Volume: 3000 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", close: 900, Trading_Volume: 3000 }
    ];

    const events = normalizeFinMindRows(priceRows, "2026-05-27T05:00:00.000Z", securityTypes);
    const event = events[0];
    expect(event).toBeDefined();
    if (!event) {
      throw new Error("expected price summary event");
    }
    expect(event.title).toContain("跌 -10.0%");
    expect(event.title).not.toContain("漲 -");
    expect(event.title).toContain("跌停");
    expect(event.metrics?.limitFlag).toBe("limit_down");
  });

  it("emits a limit-up summary title only for stock security type", () => {
    const stockTypes = new Map<string, import("../src/types").SecurityType>([["2330", "stock"]]);
    const etfTypes = new Map<string, import("../src/types").SecurityType>([["0050", "etf"]]);
    const limitRows = (id: string) => [
      { stock_id: id, stock_name: id, date: "2026-05-26", close: 100, Trading_Volume: 5000, Trading_money: 500_000 },
      { stock_id: id, stock_name: id, date: "2026-05-25", close: 100, Trading_Volume: 5000, Trading_money: 500_000 },
      { stock_id: id, stock_name: id, date: "2026-05-24", close: 100, Trading_Volume: 5000, Trading_money: 500_000 },
      { stock_id: id, stock_name: id, date: "2026-05-23", close: 100, Trading_Volume: 5000, Trading_money: 500_000 },
      { stock_id: id, stock_name: id, date: "2026-05-22", close: 100, Trading_Volume: 5000, Trading_money: 500_000 },
      { stock_id: id, stock_name: id, date: "2026-05-27", close: 110, Trading_Volume: 5000, Trading_money: 550_000 }
    ];

    const stockEvent = normalizeFinMindRows(limitRows("2330"), "2026-05-27T05:00:00.000Z", stockTypes)[0];
    const etfEvent = normalizeFinMindRows(limitRows("0050"), "2026-05-27T05:00:00.000Z", etfTypes)[0];
    expect(stockEvent).toBeDefined();
    expect(etfEvent).toBeDefined();
    if (!stockEvent || !etfEvent) {
      throw new Error("expected price summary events");
    }

    expect(stockEvent.title).toContain("漲停");
    expect(stockEvent.metrics?.limitFlag).toBe("limit_up");
    expect(etfEvent.title).not.toContain("漲停");
    expect(etfEvent.metrics?.limitFlag).toBeUndefined();
  });

  it("groups revenue rows per symbol into one summary event with YoY/MoM/近N月高 framing", () => {
    const revenueRows = [
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-10", revenue: 52_000_000_000, revenue_year: 2026, revenue_month: 5 },
      { stock_id: "2330", stock_name: "台積電", date: "2026-04-10", revenue: 46_000_000_000, revenue_year: 2026, revenue_month: 4 },
      { stock_id: "2330", stock_name: "台積電", date: "2025-05-10", revenue: 38_000_000_000, revenue_year: 2025, revenue_month: 5 }
    ];

    const events = normalizeFinMindRows(revenueRows, "2026-05-27T05:00:00.000Z");

    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toBeDefined();
    if (!event) {
      throw new Error("expected revenue summary event");
    }
    expect(event.engagement).toBe(0);
    expect(event.url).toBe("https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockMonthRevenue&data_id=2330");
    expect(event.title).toContain("2330 台積電 2026/5 月營收");
    expect(event.title).toContain("YoY +36.8%");
    expect(event.title).toContain("MoM +13%");
    expect(event.title).toContain("近3月高");
    expect(event.metrics).toMatchObject({ revenueYoYPct: 36.84, isRecentHigh: true });
  });

  it("normalizes monthly revenue rows into fundamental events", () => {
    expect(normalizeFinMindRows([
      {
        stock_id: "2330",
        stock_name: "台積電",
        date: "2026-05-01",
        revenue: 236021000000,
        revenue_month: 4,
        revenue_year: 2026
      }
    ], "2026-05-27T05:00:00.000Z")).toEqual([
      expect.objectContaining({
        source: "finmind",
        title: "2330 台積電 2026/4 月營收 2360.2億",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockMonthRevenue&data_id=2330",
        publishedAt: "2026-05-01T00:00:00.000Z",
        engagement: 0,
        symbols: ["2330"]
      })
    ]);
  });

  it("skips unsupported FinMind rows instead of creating empty price events", () => {
    expect(normalizeFinMindRows([
      { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "MarginPurchaseCashRepayment", buy: 0, sell: 0 }
    ], "2026-05-27T05:00:00.000Z")).toEqual([]);
  });
});

describe("normalizeMopsMaterialInfoRows", () => {
  it("normalizes MOPS material information rows into official evidence events", () => {
    expect(normalizeMopsMaterialInfoRows([
      {
        companyId: "2330",
        companyName: "台積電",
        title: "代子公司公告取得機器設備",
        url: "https://mops.twse.com.tw/mops/web/t05sr01_1",
        date: "115/05/27",
        time: "18:30:00"
      }
    ])).toEqual([
      {
        source: "mops",
        title: "2330 台積電 代子公司公告取得機器設備",
        url: "https://mops.twse.com.tw/mops/web/t05sr01_1",
        publishedAt: "2026-05-27T18:30:00.000+08:00",
        engagement: 0,
        symbols: ["2330"]
      }
    ]);
  });
});
