import { describe, expect, it } from "vitest";
import { normalizeFinMindRows, normalizeFinMindStockInfoRows, parsePttTitles, parseRssItems } from "../src/parsers";

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
      {
        source: "finmind",
        title: "2317 鴻海 close 180 volume 1000",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockPrice&data_id=2317",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 1000,
        symbols: ["2317"]
      }
    ]);
  });
});
