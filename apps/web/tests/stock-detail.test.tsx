import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatMetricChips, groupResearchEvents, summarizeResearch, StockDetail } from "../src/pages/StockDetail";
import type { EventRecord } from "@stock-analytics/shared";

describe("StockDetail", () => {
  it("renders an external TradingView link instead of a custom chart", () => {
    const html = renderToString(<StockDetail symbol="2330" events={[]} />);

    expect(html).toContain("TradingView");
    expect(html).toContain("TWSE:2330");
  });

  it("renders connected universe metadata when available", () => {
    const html = renderToString(<StockDetail
      symbol="2330"
      stock={{
        symbol: "2330",
        name: "台積電",
        market: "上市",
        industry: "半導體業",
        securityType: "stock",
        updatedAt: "2026-05-27T05:00:00.000Z"
      }}
      events={[]}
    />);

    expect(html).toContain("2330 台積電");
    expect(html).toContain("半導體業");
  });

  it("keeps stock research clearly separated from trading advice", () => {
    const html = renderToString(<StockDetail symbol="2330" events={[]} />);

    expect(html).toContain("研究用途");
    expect(html).toContain("不是買賣建議");
  });

  it("renders an add-to-watchlist action when the stock is not tracked", () => {
    const html = renderToString(<StockDetail
      symbol="2330"
      stock={{
        symbol: "2330",
        name: "台積電",
        market: "上市",
        industry: "半導體業",
        securityType: "stock",
        updatedAt: "2026-05-27T05:00:00.000Z"
      }}
      events={[]}
      isWatchlisted={false}
      onAddToWatchlist={() => undefined}
    />);

    expect(html).toContain("加入追蹤");
    expect(html).not.toContain("移除追蹤");
  });

  it("renders a remove action when the stock is already tracked", () => {
    const html = renderToString(<StockDetail
      symbol="2330"
      events={[]}
      isWatchlisted
      onRemoveFromWatchlist={() => undefined}
    />);

    expect(html).toContain("已追蹤");
    expect(html).toContain("移除追蹤");
  });

  it("summarizes event count, source count, sentiment, and top tags", () => {
    expect(summarizeResearch([
      event({ id: "rss:1", source: "rss", tags: ["AI", "產業題材"], sentiment: 4 }),
      event({ id: "ptt:1", source: "ptt", tags: ["AI", "討論熱度"], sentiment: 3 })
    ])).toEqual({
      eventCount: 2,
      sourceCount: 2,
      averageSentiment: 3.5,
      topTags: ["AI", "產業題材", "討論熱度"]
    });
  });

  it("renders research summary cards and event metadata", () => {
    const html = renderToString(<StockDetail
      symbol="2330"
      events={[
        event({ id: "rss:1", source: "rss", title: "台積電 AI 訂單升溫", tags: ["AI", "產業題材"], sentiment: 4 }),
        event({ id: "ptt:1", source: "ptt", title: "Re: 台積電討論", tags: ["討論熱度"], sentiment: 3 })
      ]}
    />);

    expect(html).toContain("研究摘要");
    expect(html).toContain("事件數");
    expect(html).toContain("來源數");
    expect(html).toContain("平均情緒");
    expect(html).toContain("rss");
    expect(html).toContain("AI");
  });

  it("groups stock evidence into social, news, official, market, and revenue lanes", () => {
    const groups = groupResearchEvents([
      event({ id: "ptt:1", source: "ptt", tags: ["討論熱度"] }),
      event({ id: "rss:1", source: "rss", tags: ["AI"] }),
      event({ id: "mops:1", source: "mops", tags: ["重大訊息"] }),
      event({ id: "finmind:price", source: "finmind", tags: ["價格量能"] }),
      event({ id: "finmind:revenue", source: "finmind", tags: ["營收"] })
    ]);

    expect(groups.map((group) => [group.id, group.events.length])).toEqual([
      ["social", 1],
      ["news", 1],
      ["official", 1],
      ["market", 1],
      ["revenue", 1]
    ]);
  });

  it("renders research lanes so connected data sources are visible", () => {
    const html = renderToString(<StockDetail
      symbol="2330"
      events={[
        event({ id: "ptt:1", source: "ptt", title: "台積電討論熱度升溫", tags: ["討論熱度"] }),
        event({ id: "rss:1", source: "rss", title: "台積電 AI 新聞", tags: ["AI"] }),
        event({ id: "mops:1", source: "mops", title: "台積電重大訊息", tags: ["重大訊息"] }),
        event({ id: "finmind:price", source: "finmind", title: "2330 close 1200 volume 5000", tags: ["價格量能"] }),
        event({ id: "finmind:revenue", source: "finmind", title: "2330 2026/4 月營收 4107.3 億元", tags: ["營收"] })
      ]}
    />);

    expect(html).toContain("社群討論");
    expect(html).toContain("新聞時事");
    expect(html).toContain("官方重訊");
    expect(html).toContain("價格/籌碼");
    expect(html).toContain("營收基本面");
    expect(html).toContain("台積電討論熱度升溫");
    expect(html).toContain("月營收");
  });

  it("formats present event metrics into research chips", () => {
    expect(formatMetricChips({
      revenueYoYPct: 18.6,
      revenueMoMPct: -4.2,
      priceChangePct: 9.98,
      volumeRatio: 2.7,
      liquidityTier: "偏低",
      isRecentHigh: true
    })).toEqual([
      { key: "revenueYoY", label: "YoY +18.6%" },
      { key: "revenueMoM", label: "MoM -4.2%" },
      { key: "priceChange", label: "漲跌 +10.0%" },
      { key: "volumeRatio", label: "量比 2.7x" },
      { key: "liquidity", label: "流動性 偏低" },
      { key: "recentHigh", label: "近期新高" }
    ]);
  });

  it("omits chips for undefined fields and returns empty for missing metrics", () => {
    expect(formatMetricChips({ priceChangePct: 3.0 })).toEqual([
      { key: "priceChange", label: "漲跌 +3.0%" }
    ]);
    expect(formatMetricChips(undefined)).toEqual([]);
    expect(formatMetricChips({})).toEqual([]);
    expect(formatMetricChips({ isRecentHigh: false })).toEqual([]);
  });
});

function event(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "rss:2330:test",
    source: "rss",
    symbol: "2330",
    title: "台積電 AI 訂單升溫",
    url: "https://news.test/2330",
    publishedAt: "2026-05-27T05:00:00.000Z",
    engagement: 0,
    tags: ["AI"],
    sentiment: 4,
    reason: "rss 事件訊號命中",
    ...overrides
  };
}
