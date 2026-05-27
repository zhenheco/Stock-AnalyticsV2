import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { summarizeResearch, StockDetail } from "../src/pages/StockDetail";
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
