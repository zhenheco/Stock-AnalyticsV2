import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { MemoryRepository } from "../src/repository/memory";

describe("scheduled worker", () => {
  it("runs live ingestion with injected repository and fetcher", async () => {
    const repo = new MemoryRepository();

    await worker.scheduled({}, {
      ADMIN_TOKEN: "secret",
      RSS_FEED_URL: "https://rss.test/feed.xml",
      __repo: repo,
      __fetcher: async () => new Response("<rss><channel><item><title>台積電 2330 AI 新聞</title><link>https://news.test/1</link><pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate></item></channel></rss>")
    });

    expect(await repo.listCandidates()).toHaveLength(1);
    expect(await repo.listSnapshots()).toEqual([
      expect.objectContaining({ candidateCount: 1, topSymbols: ["2330"] })
    ]);
    expect(await repo.listSourceRuns()).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 1 })
    ]));
  });
});
