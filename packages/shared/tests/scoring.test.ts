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

  it("computes derivedSignal from aggregated metrics with the rescaled formula", () => {
    // priceChangePct 6.2 -> min(3, 6.2/4)=1.55
    // volumeRatio 3.1 -> min(2, max(0, 3.1-1))=2
    // limitFlag none -> 0
    // revenueYoYPct 40 -> min(3, 40/15)=2.6667
    // isRecentHigh true -> 0.5
    // sum = 1.55 + 2 + 0 + 2.6667 + 0.5 = 6.7167 -> round1 = 6.7
    const candidates = scoreCandidates(
      [
        {
          id: "finmind-summary-3324",
          source: "finmind",
          symbol: "3324",
          title: "3324 雙鴻 收 500 漲 +6.2% 量 3.1x 爆量",
          url: "https://finmind.test/3324",
          publishedAt: "2026-05-27T01:00:00.000Z",
          engagement: 0,
          tags: ["價格量能", "營收"],
          sentiment: 3,
          reason: "FinMind 衍生訊號",
          metrics: {
            priceChangePct: 6.2,
            volumeRatio: 3.1,
            revenueYoYPct: 40,
            isRecentHigh: true
          }
        }
      ],
      { "3324": "雙鴻" }
    );

    expect(candidates[0]?.scoreBreakdown?.derivedSignal).toBe(6.7);
  });

  it("adds derivedSignal into rawScore so a strong derived signal lifts the score", () => {
    const base = {
      id: "finmind-quiet-2002",
      source: "finmind" as const,
      symbol: "2002",
      title: "2002 中鋼 收 30 漲 +0.1% 量 1.0x",
      url: "https://finmind.test/2002",
      publishedAt: "2026-05-27T01:00:00.000Z",
      engagement: 0,
      tags: ["價格量能"],
      sentiment: 3,
      reason: "FinMind 衍生訊號"
    };
    const quiet = scoreCandidates([{ ...base, metrics: { priceChangePct: 0.1, volumeRatio: 1.0 } }], { "2002": "中鋼" });
    const strong = scoreCandidates(
      [{ ...base, metrics: { priceChangePct: 9.8, volumeRatio: 4, limitFlag: "limit_up", revenueYoYPct: 60, isRecentHigh: true } }],
      { "2002": "中鋼" }
    );

    expect(strong[0]?.score ?? 0).toBeGreaterThan(quiet[0]?.score ?? 0);
  });

  it("keeps derivedSignal in the same magnitude band as other components (does not overwhelm)", () => {
    // theoretical max: 3 + 2 + 1 + 3 + 0.5 = 9.5
    const candidates = scoreCandidates(
      [
        {
          id: "finmind-max-1234",
          source: "finmind",
          symbol: "1234",
          title: "1234 漲停爆量高成長",
          url: "https://finmind.test/1234",
          publishedAt: "2026-05-27T01:00:00.000Z",
          engagement: 0,
          tags: ["價格量能"],
          sentiment: 3,
          reason: "FinMind 衍生訊號",
          metrics: { priceChangePct: 50, volumeRatio: 10, limitFlag: "limit_up", revenueYoYPct: 100, isRecentHigh: true }
        }
      ],
      { "1234": "強訊號" }
    );

    expect(candidates[0]?.scoreBreakdown?.derivedSignal).toBeLessThanOrEqual(9.5);
    expect(candidates[0]?.scoreBreakdown?.derivedSignal).toBeGreaterThanOrEqual(3);
  });

  it("aggregates the strongest derived metrics across a symbol's events", () => {
    const candidates = scoreCandidates(
      [
        {
          id: "finmind-price-6505",
          source: "finmind",
          symbol: "6505",
          title: "6505 台塑化 收 90 漲 +2.0% 量 1.5x",
          url: "https://finmind.test/6505-price-a",
          publishedAt: "2026-05-26T01:00:00.000Z",
          engagement: 0,
          tags: ["價格量能"],
          sentiment: 3,
          reason: "FinMind 價格摘要",
          metrics: { priceChangePct: 2.0, volumeRatio: 1.5 }
        },
        {
          id: "finmind-price-6505-b",
          source: "finmind",
          symbol: "6505",
          title: "6505 台塑化 收 80 跌 -8.5% 量 3.0x 爆量",
          url: "https://finmind.test/6505-price-b",
          publishedAt: "2026-05-27T01:00:00.000Z",
          engagement: 0,
          tags: ["價格量能"],
          sentiment: 2,
          reason: "FinMind 價格摘要",
          metrics: { priceChangePct: -8.5, volumeRatio: 3.0, limitFlag: "limit_down" }
        },
        {
          id: "finmind-revenue-6505",
          source: "finmind",
          symbol: "6505",
          title: "6505 台塑化 2026/5 月營收 YoY +25% 近3月高",
          url: "https://finmind.test/6505-revenue",
          publishedAt: "2026-05-27T02:00:00.000Z",
          engagement: 0,
          tags: ["營收"],
          sentiment: 4,
          reason: "FinMind 營收摘要",
          metrics: { revenueYoYPct: 25, revenueMoMPct: 5, isRecentHigh: true }
        }
      ],
      { "6505": "台塑化" }
    );

    expect(candidates[0]?.metrics).toMatchObject({
      priceChangePct: -8.5,
      volumeRatio: 3.0,
      limitFlag: "limit_down",
      revenueYoYPct: 25,
      revenueMoMPct: 5,
      isRecentHigh: true
    });
  });

  it("does not let raw FinMind volume dominate via engagement (engagement=0 summary)", () => {
    // Both candidates have engagement 0 (FinMind summary contract). The large-cap with
    // a flat derived signal must NOT outrank the small-cap with strong derived signal,
    // proving raw volume no longer leaks into the score through engagementScore.
    const largeCapQuiet = scoreCandidates(
      [
        {
          id: "finmind-2330-quiet",
          source: "finmind",
          symbol: "2330",
          title: "2330 台積電 收 1000 漲 +0.2% 量 1.0x",
          url: "https://finmind.test/2330-quiet",
          publishedAt: "2026-05-27T01:00:00.000Z",
          engagement: 0,
          tags: ["價格量能"],
          sentiment: 3,
          reason: "FinMind 衍生訊號",
          metrics: { priceChangePct: 0.2, volumeRatio: 1.0 }
        }
      ],
      { "2330": "台積電" }
    );

    expect(largeCapQuiet[0]?.scoreBreakdown?.derivedSignal).toBe(0.1);
  });

  it("ranks a high-YoY small-cap above a quiet high-volume large-cap", () => {
    const events: EventRecord[] = [
      {
        id: "finmind-largecap",
        source: "finmind",
        symbol: "2317",
        title: "2317 鴻海 收 200 漲 +0.3% 量 1.1x",
        url: "https://finmind.test/2317",
        publishedAt: "2026-05-27T01:00:00.000Z",
        engagement: 0,
        tags: ["價格量能"],
        sentiment: 3,
        reason: "FinMind 衍生訊號",
        metrics: { priceChangePct: 0.3, volumeRatio: 1.1 }
      },
      {
        id: "finmind-smallcap",
        source: "finmind",
        symbol: "3324",
        title: "3324 雙鴻 2026/5 月營收 YoY +40% 近3月高",
        url: "https://finmind.test/3324",
        publishedAt: "2026-05-27T01:00:00.000Z",
        engagement: 0,
        tags: ["營收", "價格量能"],
        sentiment: 4,
        reason: "FinMind 衍生訊號",
        metrics: { priceChangePct: 5.0, volumeRatio: 2.5, revenueYoYPct: 40, isRecentHigh: true }
      }
    ];

    const candidates = scoreCandidates(events, { "2317": "鴻海", "3324": "雙鴻" });

    expect(candidates[0]?.symbol).toBe("3324");
    expect(candidates[0]?.score ?? 0).toBeGreaterThan(candidates[1]?.score ?? 0);
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
