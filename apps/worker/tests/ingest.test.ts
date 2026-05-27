import { describe, expect, it } from "vitest";
import { recomputeCandidates, runIngestion } from "../src/ingest";
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

  it("uses FinMind stock info universe to enrich social-only candidate names", async () => {
    const repo = new MemoryRepository();

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        finmindStockInfoRows: [
          {
            stock_id: "2330",
            stock_name: "台積電",
            market_category: "上市",
            industry_category: "半導體業",
            type: "twse"
          },
          {
            stock_id: "2317",
            stock_name: "鴻海",
            market_category: "上市",
            industry_category: "其他電子業",
            type: "twse"
          }
        ],
        pttHtml: `
          <div class="r-ent">
            <div class="nrec"><span class="hl f3">25</span></div>
            <div class="title"><a href="/bbs/Stock/M.2.html">[新聞] 2330 AI 需求升溫</a></div>
            <div class="date"> 5/27</div>
          </div>
        `
      }
    });

    await expect(repo.listUniverse()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({
        symbol: "2330",
        name: "台積電",
        industry: "半導體業"
      })
    ]));
    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({
        symbol: "2330",
        name: "台積電"
      })
    ]);
  });

  it("uses an optional lightweight classifier for stored event tags and reasons", async () => {
    const repo = new MemoryRepository();

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        rssXml: `
          <rss><channel><item>
            <title>台積電 2330 AI 供應鏈訂單升溫</title>
            <link>https://news.test/tsmc-ai</link>
            <pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate>
          </item></channel></rss>
        `
      },
      classifier: {
        classify: async () => ({
          sentiment: 5,
          tags: ["AI", "供應鏈"],
          reason: "LLM 判斷為 AI 供應鏈事件"
        })
      }
    });

    await expect(repo.listEventsForSymbol("2330")).resolves.toEqual([
      expect.objectContaining({
        sentiment: 5,
        tags: ["AI", "供應鏈"],
        reason: "LLM 判斷為 AI 供應鏈事件"
      })
    ]);
  });

  it("only updates currently relevant universe symbols after the initial bootstrap", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2317",
      name: "鴻海",
      market: "上市",
      industry: "其他電子業",
      securityType: "stock",
      updatedAt: "2026-05-26T03:00:00.000Z"
    }]);

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        finmindStockInfoRows: [
          { stock_id: "2330", stock_name: "台積電", industry_category: "半導體業", type: "twse" },
          { stock_id: "2317", stock_name: "鴻海", industry_category: "其他電子業", type: "twse" }
        ],
        pttHtml: `
          <div class="r-ent">
            <div class="title"><a href="/bbs/Stock/M.2.html">[新聞] 2330 AI 需求升溫</a></div>
            <div class="date"> 5/27</div>
          </div>
        `
      }
    });

    await expect(repo.listUniverse()).resolves.toEqual([
      expect.objectContaining({ symbol: "2317", updatedAt: "2026-05-26T03:00:00.000Z" }),
      expect.objectContaining({ symbol: "2330", updatedAt: "2026-05-27T03:00:00.000Z" })
    ]);
  });

  it("uses stored universe aliases to ingest events that mention only company names", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2108",
      name: "南帝",
      market: "上市",
      industry: "橡膠工業",
      securityType: "stock",
      updatedAt: "2026-05-26T03:00:00.000Z"
    }]);

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        rssXml: `
          <rss><channel><item>
            <title>南帝乳膠報價升溫</title>
            <link>https://news.test/nantex</link>
            <pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate>
          </item></channel></rss>
        `
      }
    });

    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({
        symbol: "2108",
        name: "南帝",
        latestTitle: "南帝乳膠報價升溫"
      })
    ]);
  });

  it("does not ingest arbitrary four-digit numbers from RSS as stock symbols", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2330",
      name: "台積電",
      market: "上市",
      industry: "半導體業",
      securityType: "stock",
      updatedAt: "2026-05-26T03:00:00.000Z"
    }]);

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        rssXml: `
          <rss><channel><item>
            <title>2026年AI支出達8000億 台積電2330受惠</title>
            <link>https://news.test/ai-spend</link>
            <pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate>
          </item></channel></rss>
        `
      }
    });

    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "2330", name: "台積電" })
    ]);
  });

  it("does not ingest valid stock codes from RSS when they are only ordinary numbers", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2034",
      name: "允強",
      market: "上市",
      industry: "鋼鐵工業",
      securityType: "stock",
      updatedAt: "2026-05-26T03:00:00.000Z"
    }]);

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        rssXml: `
          <rss><channel><item>
            <title>黃仁勳點名台灣電力 2034年前都沒問題</title>
            <link>https://news.test/power</link>
            <pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate>
          </item></channel></rss>
        `
      }
    });

    await expect(repo.listCandidates()).resolves.toEqual([]);
  });

  it("drops stale events whose stored symbol only came from a percentage figure", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([
      {
        symbol: "3037",
        name: "欣興",
        market: "上市",
        industry: "電子零組件業",
        securityType: "stock",
        updatedAt: "2026-05-27T05:00:00.000Z"
      },
      {
        symbol: "4725",
        name: "信昌化",
        market: "上市",
        industry: "化學工業",
        securityType: "stock",
        updatedAt: "2026-05-27T05:00:00.000Z"
      }
    ]);
    await repo.saveEvents([
      {
        id: "ptt:3037:https://ptt.test/1",
        source: "ptt",
        symbol: "3037",
        title: "[情報] 3037 欣興 4月自結 1.85 年增:4725%",
        url: "https://ptt.test/1",
        publishedAt: "2026-05-27T00:00:00.000+08:00",
        engagement: 0,
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件，可信但催化程度較低"
      },
      {
        id: "ptt:4725:https://ptt.test/1",
        source: "ptt",
        symbol: "4725",
        title: "[情報] 3037 欣興 4月自結 1.85 年增:4725%",
        url: "https://ptt.test/1",
        publishedAt: "2026-05-27T00:00:00.000+08:00",
        engagement: 0,
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件，可信但催化程度較低"
      }
    ]);

    await recomputeCandidates(repo);

    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "3037", name: "欣興" })
    ]);
  });

  it("drops stale empty FinMind price events created from unsupported rows", async () => {
    const repo = new MemoryRepository();
    await repo.saveEvents([
      {
        id: "finmind:2330:https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockPrice&data_id=2330",
        source: "finmind",
        symbol: "2330",
        title: "2330 台積電 close N/A volume 0",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockPrice&data_id=2330",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 0,
        tags: ["價格量能"],
        sentiment: 3,
        reason: "finmind 事件訊號命中"
      },
      {
        id: "finmind:2330:https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=2330&name=Foreign_Investor",
        source: "finmind",
        symbol: "2330",
        title: "2330 台積電 外資 買超 8810922 股",
        url: "https://finmindtrade.com/analysis/#/data/api?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=2330&name=Foreign_Investor",
        publishedAt: "2026-05-27T05:00:00.000Z",
        engagement: 8810922,
        tags: ["籌碼", "價格量能"],
        sentiment: 3,
        reason: "FinMind 籌碼訊號命中"
      }
    ]);

    await recomputeCandidates(repo);

    await expect(repo.listEventsForSymbol("2330")).resolves.toEqual([
      expect.objectContaining({
        title: "2330 台積電 外資 買超 8810922 股"
      })
    ]);
  });

  it("classifies formal announcements separately from research catalysts", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([
      {
        symbol: "2356",
        name: "英業達",
        market: "上市",
        industry: "電腦及週邊設備業",
        securityType: "stock",
        updatedAt: "2026-05-26T03:00:00.000Z"
      },
      {
        symbol: "2328",
        name: "廣宇",
        market: "上市",
        industry: "電子零組件業",
        securityType: "stock",
        updatedAt: "2026-05-26T03:00:00.000Z"
      }
    ]);

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        rssXml: `
          <rss><channel>
            <item>
              <title>【公告】英業達股東會重要決議事項</title>
              <link>https://news.test/2356-a</link>
              <pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate>
            </item>
            <item>
              <title>廣宇衝刺AI與機器人商機</title>
              <link>https://news.test/2328-c</link>
              <pubDate>Wed, 27 May 2026 03:00:00 GMT</pubDate>
            </item>
          </channel></rss>
        `
      }
    });

    await expect(repo.listEventsForSymbol("2356")).resolves.toEqual([
      expect.objectContaining({
        tags: expect.arrayContaining(["公告"]),
        sentiment: 2
      })
    ]);
    await expect(repo.listEventsForSymbol("2328")).resolves.toEqual([
      expect.objectContaining({
        tags: expect.arrayContaining(["AI", "產業題材"]),
        sentiment: 4
      })
    ]);
    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "2328" }),
      expect.objectContaining({ symbol: "2356" })
    ]);
  });

  it("classifies FinMind chip rows as chip signals", async () => {
    const repo = new MemoryRepository();

    await runIngestion({
      repo,
      now: "2026-05-27T03:00:00.000Z",
      sources: {
        finmindRows: [
          { stock_id: "2330", stock_name: "台積電", date: "2026-05-27", name: "Foreign_Investor", buy: 5000, sell: 1000 } as any
        ]
      }
    });

    await expect(repo.listEventsForSymbol("2330")).resolves.toEqual([
      expect.objectContaining({
        title: "2330 台積電 外資 買超 4000 股",
        tags: expect.arrayContaining(["籌碼"]),
        reason: "FinMind 籌碼訊號命中"
      })
    ]);
  });

  it("reclassifies stored events when recomputing candidates after classifier changes", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2356",
      name: "英業達",
      market: "上市",
      industry: "電腦及週邊設備業",
      securityType: "stock",
      updatedAt: "2026-05-26T03:00:00.000Z"
    }]);
    await repo.saveEvents([{
      id: "rss:2356:https://news.test/old-announcement",
      source: "rss",
      symbol: "2356",
      title: "【公告】英業達股東會重要決議事項",
      url: "https://news.test/old-announcement",
      publishedAt: "2026-05-27T02:00:00.000Z",
      engagement: 0,
      tags: [],
      sentiment: 3,
      reason: "rss 事件訊號命中"
    }]);

    await recomputeCandidates(repo);

    await expect(repo.listEventsForSymbol("2356")).resolves.toEqual([
      expect.objectContaining({
        tags: ["公告"],
        sentiment: 2,
        reason: "公告事件，可信但催化程度較低"
      })
    ]);
  });
});
