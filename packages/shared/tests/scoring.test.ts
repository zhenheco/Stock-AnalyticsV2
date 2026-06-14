import { describe, expect, it } from "vitest";
import { scoreCandidates } from "../src/scoring";
import { validateLlmClassification } from "../src/llm";
import type { EventRecord } from "../src/types";

describe("scoreCandidates", () => {
  it("combines event count, source diversity, engagement, and sentiment into ranked candidates", () => {
    const events: EventRecord[] = [
      {
        id: "ptt-1",
        source: "ptt",
        symbol: "2330",
        title: "2330 台積電 AI 訂單熱議",
        url: "https://ptt.test/1",
        publishedAt: "2026-05-27T01:00:00.000Z",
        engagement: 30,
        tags: ["AI", "熱度"],
        sentiment: 4,
        reason: "討論熱度高"
      },
      {
        id: "rss-1",
        source: "rss",
        symbol: "2330",
        title: "台積電先進封裝需求升溫",
        url: "https://news.test/1",
        publishedAt: "2026-05-27T02:00:00.000Z",
        engagement: 0,
        tags: ["AI"],
        sentiment: 4,
        reason: "新聞與討論同向"
      },
      {
        id: "ptt-2",
        source: "ptt",
        symbol: "2317",
        title: "2317 鴻海短線討論",
        url: "https://ptt.test/2",
        publishedAt: "2026-05-27T02:00:00.000Z",
        engagement: 2,
        tags: ["短線"],
        sentiment: 3,
        reason: "單一來源"
      }
    ];

    const candidates = scoreCandidates(events, { "2330": "台積電", "2317": "鴻海" });

    expect(candidates[0]).toMatchObject({
      symbol: "2330",
      name: "台積電",
      eventCount: 2,
      sourceCount: 2,
      sourceEventCounts: { ptt: 1, rss: 1 },
      latestTitle: "台積電先進封裝需求升溫"
    });
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
  });

  it("ranks research catalysts above repetitive formal announcements", () => {
    const events: EventRecord[] = [
      {
        id: "rss-announce-1",
        source: "rss",
        symbol: "2356",
        title: "【公告】英業達股東會重要決議事項",
        url: "https://news.test/a1",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 0,
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件"
      },
      {
        id: "rss-announce-2",
        source: "rss",
        symbol: "2356",
        title: "【公告】英業達解除董事競業限制",
        url: "https://news.test/a2",
        publishedAt: "2026-05-27T05:10:00.000Z",
        engagement: 0,
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件"
      },
      {
        id: "rss-announce-3",
        source: "rss",
        symbol: "2356",
        title: "【公告】英業達股東會決議解除董事競業行為之限制",
        url: "https://news.test/a3",
        publishedAt: "2026-05-27T05:20:00.000Z",
        engagement: 0,
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件"
      },
      {
        id: "rss-announce-4",
        source: "rss",
        symbol: "2356",
        title: "【公告】英業達股東常會重要決議事項",
        url: "https://news.test/a4",
        publishedAt: "2026-05-27T05:30:00.000Z",
        engagement: 0,
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件"
      },
      {
        id: "rss-catalyst-1",
        source: "rss",
        symbol: "2328",
        title: "廣宇衝刺AI與機器人商機",
        url: "https://news.test/c1",
        publishedAt: "2026-05-27T06:00:00.000Z",
        engagement: 0,
        tags: ["AI", "產業題材"],
        sentiment: 4,
        reason: "AI 產業事件"
      }
    ];

    const candidates = scoreCandidates(events, { "2356": "英業達", "2328": "廣宇" });

    expect(candidates[0]).toMatchObject({
      symbol: "2328",
      tags: ["AI", "產業題材"]
    });
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
  });

  it("keeps heavily discounted announcement candidates at a non-negative score", () => {
    const candidates = scoreCandidates([
      {
        id: "rss-announcement",
        source: "rss",
        symbol: "2356",
        title: "【公告】英業達股東會重要決議事項",
        url: "https://news.test/a",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 0,
        tags: ["公告"],
        sentiment: 1,
        reason: "公告事件"
      }
    ], { "2356": "英業達" });

    expect(candidates[0]?.score).toBe(0);
  });

  it("deduplicates same-story events and exposes a score breakdown for research explainability", () => {
    const candidates = scoreCandidates([
      {
        id: "rss-story",
        source: "rss",
        symbol: "2330",
        title: "台積電 AI 訂單升溫",
        url: "https://news.test/2330",
        publishedAt: "2026-05-27T04:00:00.000Z",
        engagement: 0,
        tags: ["AI", "產業題材"],
        sentiment: 4,
        reason: "新聞事件"
      },
      {
        id: "rss-story-copy",
        source: "rss",
        symbol: "2330",
        title: "台積電 AI 訂單升溫",
        url: "https://mirror.test/2330",
        publishedAt: "2026-05-27T04:05:00.000Z",
        engagement: 0,
        tags: ["AI", "產業題材"],
        sentiment: 4,
        reason: "同題新聞轉載"
      },
      {
        id: "twse-story",
        source: "twse",
        symbol: "2330",
        title: "台積電 重大訊息說明 AI 先進製程需求",
        url: "https://twse.test/2330",
        publishedAt: "2026-05-27T04:10:00.000Z",
        engagement: 0,
        tags: ["官方訊息", "AI"],
        sentiment: 4,
        reason: "官方事件"
      }
    ], { "2330": "台積電" });

    expect(candidates[0]).toMatchObject({
      symbol: "2330",
      eventCount: 2,
      sourceCount: 2,
      sourceEventCounts: { rss: 1, twse: 1 },
      scoreBreakdown: {
        eventStrength: expect.any(Number),
        sourceConfidence: expect.any(Number),
        freshness: expect.any(Number),
        crossSourceBoost: expect.any(Number),
        watchlistBoost: 0
      }
    });
    expect(candidates[0]?.confidenceScore).toBeGreaterThanOrEqual(70);
    expect(candidates[0]?.reason).toContain("官方");
  });

  it("exposes a derivedSignal component in the score breakdown", () => {
    const candidates = scoreCandidates(
      [
        {
          id: "finmind-price-2330",
          source: "finmind",
          symbol: "2330",
          title: "2330 台積電 收 1000 漲 +6.2% 量 3.1x 爆量",
          url: "https://finmind.test/2330",
          publishedAt: "2026-05-27T01:00:00.000Z",
          engagement: 0,
          tags: ["價格量能"],
          sentiment: 3,
          reason: "FinMind 衍生訊號",
          metrics: { priceChangePct: 6.2, volumeRatio: 3.1 }
        }
      ],
      { "2330": "台積電" }
    );

    expect(candidates[0]?.scoreBreakdown?.derivedSignal).toBeGreaterThan(0);
  });
});

describe("validateLlmClassification", () => {
  it("keeps only safe lightweight classification fields", () => {
    const result = validateLlmClassification({
      sentiment: 9,
      tags: ["AI", "", "供應鏈", "ignored", "also ignored"],
      reason: "這是一個很長的理由".repeat(30),
      entry: 999
    });

    expect(result.sentiment).toBe(5);
    expect(result.tags).toEqual(["AI", "供應鏈", "ignored"]);
    expect(result.reason.length).toBeLessThanOrEqual(160);
  });
});
