import { describe, expect, it } from "vitest";
import { normalizeFinMindStockInfoRows, parsePttTitles, parseRssItems } from "../src/parsers";

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
