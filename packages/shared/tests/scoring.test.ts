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
      latestTitle: "台積電先進封裝需求升溫"
    });
    expect(candidates[0]?.score).toBeGreaterThan(candidates[1]?.score ?? 0);
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
