import { describe, expect, it } from "vitest";
import { runIngestion } from "../src/ingest";
import { MemoryRepository } from "../src/repository/memory";

describe("runIngestion", () => {
  it("normalizes configured sources, stores events, and updates candidates", async () => {
    const repo = new MemoryRepository();

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        pttHtml: `
          <div class="r-ent">
            <div class="nrec"><span class="hl f3">25</span></div>
            <div class="title"><a href="/bbs/Stock/M.2.html">[新聞] 2330 台積電 AI 需求升溫</a></div>
            <div class="date"> 5/27</div>
          </div>
        `,
        rssXml: `
          <rss><channel><item>
            <title>台積電 2330 先進封裝訂單增加</title>
            <link>https://news.test/tsmc</link>
            <pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate>
          </item></channel></rss>
        `,
        finmindRows: [{ stock_id: "2330", stock_name: "台積電", close: 980, Trading_Volume: 1000 }]
      }
    });

    const candidates = await repo.listCandidates();
    const events = await repo.listEventsForSymbol("2330");

    expect(events).toHaveLength(3);
    expect(candidates[0]).toMatchObject({
      symbol: "2330",
      name: "台積電",
      sourceCount: 3
    });
  });
});
