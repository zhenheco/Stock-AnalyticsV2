import { describe, expect, it } from "vitest";
import type { Candidate, EventRecord, FinMindMetrics } from "@stock-analytics/shared";
import { MemoryRepository } from "../src/repository/memory";

describe("MemoryRepository finmind metrics", () => {
  it("preserves metrics on saved events when listed back", async () => {
    const repo = new MemoryRepository();
    const metrics: FinMindMetrics = { revenueYoYPct: 42, isRecentHigh: true, liquidityTier: "充足" };
    const stored: EventRecord = {
      id: "finmind-2330-rev",
      source: "finmind",
      symbol: "2330",
      title: "2330 月營收 YoY +42.0%",
      url: "https://example.com/finmind-2330-rev",
      publishedAt: "2026-05-27T00:00:00.000Z",
      engagement: 0,
      tags: ["營收高成長"],
      sentiment: 3,
      reason: "finmind 衍生訊號",
      metrics
    };

    await repo.saveEvents([stored]);

    await expect(repo.listEventsForSymbol("2330")).resolves.toEqual([
      expect.objectContaining({ id: "finmind-2330-rev", metrics })
    ]);
  });

  it("preserves candidate metrics across a save/list re-score cycle", async () => {
    const repo = new MemoryRepository();
    const metrics: FinMindMetrics = { priceChangePct: 9.8, limitFlag: "limit_up", volumeRatio: 4.1 };
    const candidate: Candidate = {
      symbol: "2454",
      name: "聯發科",
      score: 7,
      eventCount: 1,
      sourceCount: 1,
      latestTitle: "2454 漲停 量比 4.1x",
      latestAt: "2026-05-27T00:00:00.000Z",
      sources: ["finmind"],
      tags: ["漲停"],
      reason: "finmind 衍生訊號命中",
      metrics
    };

    await repo.saveCandidates([candidate]);
    const reread = await repo.listCandidates();
    await repo.saveCandidates(reread);

    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "2454", metrics })
    ]);
  });
});
