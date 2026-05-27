import { describe, expect, it } from "vitest";
import type { Candidate, SourceRun } from "@stock-analytics/shared";
import { createApp } from "../src/app";
import { MemoryRepository } from "../src/repository/memory";
import { signIngestBody } from "../src/security";

describe("worker routes", () => {
  it("returns ranked candidates with update metadata", async () => {
    const repo = new MemoryRepository();
    await repo.saveCandidates([
      {
        symbol: "2330",
        name: "台積電",
        score: 8.4,
        eventCount: 2,
        sourceCount: 2,
        latestTitle: "台積電先進封裝需求升溫",
        latestAt: "2026-05-27T02:00:00.000Z",
        sources: ["ptt", "rss"],
        tags: ["AI"],
        reason: "新聞與討論同步升溫"
      }
    ]);
    const app = createApp({ repo, adminToken: "secret", now: () => "2026-05-27T06:00:00.000Z" });

    const response = await app.fetch(new Request("https://api.test/api/candidates"));
    const body = await response.json() as { candidates: unknown[]; updatedAt: string };

    expect(response.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(body.updatedAt).toBe("2026-05-27T02:00:00.000Z");
  });

  it("returns the newest candidate event time as candidates update metadata", async () => {
    const repo = new MemoryRepository();
    await repo.saveCandidates([
      candidate({
        symbol: "2330",
        score: 9.2,
        latestAt: "2026-05-27T02:00:00.000Z"
      }),
      candidate({
        symbol: "2328",
        score: 4.8,
        latestAt: "2026-05-27T08:30:00.000Z"
      })
    ]);
    const app = createApp({ repo, adminToken: "secret", now: () => "2026-05-27T09:00:00.000Z" });

    const response = await app.fetch(new Request("https://api.test/api/candidates"));
    const body = await response.json() as { updatedAt: string };

    expect(response.status).toBe(200);
    expect(body.updatedAt).toBe("2026-05-27T08:30:00.000Z");
  });

  it("returns recent source health runs", async () => {
    const repo = new MemoryRepository();
    await repo.saveSourceRuns([
      {
        id: "rss:2026-05-27T05:00:00.000Z",
        source: "rss",
        status: "ok",
        startedAt: "2026-05-27T05:00:00.000Z",
        finishedAt: "2026-05-27T05:00:01.000Z",
        itemCount: 3
      }
    ]);
    const app = createApp({ repo, adminToken: "secret", now: () => "2026-05-27T06:00:00.000Z" });

    const response = await app.fetch(new Request("https://api.test/api/source-runs"));
    const body = await response.json() as { runs: unknown[] };

    expect(response.status).toBe(200);
    expect(body.runs).toEqual([
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 3 })
    ]);
  });

  it("returns data readiness with a FinMind price/chip/revenue gap when token-backed rows are missing", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse(Array.from({ length: 1200 }, (_, index) => ({
      symbol: String(1000 + index),
      name: `公司${index}`,
      securityType: "stock" as const,
      updatedAt: "2026-05-27T05:00:00.000Z"
    })));
    await repo.saveCandidates([{
      symbol: "2330",
      name: "台積電",
      score: 8.4,
      eventCount: 2,
      sourceCount: 2,
      latestTitle: "台積電 AI 訂單",
      latestAt: "2026-05-27T05:00:00.000Z",
      sources: ["rss", "ptt"],
      tags: ["AI"],
      reason: "事件訊號"
    }]);
    await repo.saveSourceRuns([
      sourceRun({ source: "rss", status: "ok", itemCount: 50 }),
      sourceRun({ source: "ptt", status: "ok", itemCount: 10 }),
      sourceRun({
        source: "finmind",
        status: "partial",
        itemCount: 4114,
        message: "FINMIND_TOKEN or FINMIND_SYMBOLS not configured for price/chip/revenue data"
      })
    ]);
    const app = createApp({ repo, adminToken: "secret", now: () => "2026-05-27T06:00:00.000Z" });

    const response = await app.fetch(new Request("https://api.test/api/data-readiness"));
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.counts).toEqual({ candidates: 1, universe: 1200, watchlist: 0 });
    expect(body.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "finmind-signals", status: "missing", message: expect.stringContaining("FINMIND_TOKEN") }),
      expect.objectContaining({ id: "social-events", status: "ready" }),
      expect.objectContaining({ id: "universe", status: "ready" })
    ]));
  });

  it("uses the newest candidate event time for data readiness updatedAt", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse(Array.from({ length: 1200 }, (_, index) => ({
      symbol: String(1000 + index),
      name: `公司${index}`,
      securityType: "stock" as const,
      updatedAt: "2026-05-27T05:00:00.000Z"
    })));
    await repo.saveCandidates([
      candidate({
        symbol: "2330",
        score: 9.2,
        latestAt: "2026-05-27T02:00:00.000Z"
      }),
      candidate({
        symbol: "2328",
        score: 4.8,
        latestAt: "2026-05-27T08:30:00.000Z"
      })
    ]);
    await repo.saveSourceRuns([
      sourceRun({ source: "rss", status: "ok", itemCount: 50, startedAt: "2026-05-27T08:00:00.000Z" }),
      sourceRun({ source: "ptt", status: "ok", itemCount: 10, startedAt: "2026-05-27T08:00:00.000Z" }),
      sourceRun({ source: "finmind", status: "ok", itemCount: 4274, startedAt: "2026-05-27T08:00:00.000Z" })
    ]);
    const app = createApp({ repo, adminToken: "secret", now: () => "2026-05-27T09:00:00.000Z" });

    const response = await app.fetch(new Request("https://api.test/api/data-readiness"));
    const body = await response.json() as { updatedAt: string };

    expect(response.status).toBe(200);
    expect(body.updatedAt).toBe("2026-05-27T08:30:00.000Z");
  });

  it("marks anonymous FinMind price, chip, and revenue data as degraded instead of missing", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse(Array.from({ length: 1200 }, (_, index) => ({
      symbol: String(1000 + index),
      name: `公司${index}`,
      securityType: "stock" as const,
      updatedAt: "2026-05-27T05:00:00.000Z"
    })));
    await repo.saveCandidates([{
      symbol: "2330",
      name: "台積電",
      score: 8.4,
      eventCount: 3,
      sourceCount: 3,
      latestTitle: "2330 台積電 close 2300 volume 40272350",
      latestAt: "2026-05-27T05:00:00.000Z",
      sources: ["rss", "ptt", "finmind"],
      tags: ["AI", "價格量能"],
      reason: "事件訊號"
    }]);
    await repo.saveSourceRuns([
      sourceRun({ source: "rss", status: "ok", itemCount: 50 }),
      sourceRun({ source: "ptt", status: "ok", itemCount: 10 }),
      sourceRun({
        source: "finmind",
        status: "partial",
        itemCount: 3,
        message: "FINMIND_TOKEN not configured; using anonymous limited price/chip/revenue data"
      })
    ]);
    const app = createApp({ repo, adminToken: "secret", now: () => "2026-05-27T06:00:00.000Z" });

    const response = await app.fetch(new Request("https://api.test/api/data-readiness"));
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "finmind-signals",
        status: "degraded",
        message: "FinMind 價格、籌碼與營收資料已用免 token 降級模式接通；設定 FINMIND_TOKEN 可提高額度穩定性"
      })
    ]));
  });

  it("marks otherwise healthy source runs as degraded when they are stale", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse(Array.from({ length: 1200 }, (_, index) => ({
      symbol: String(1000 + index),
      name: `公司${index}`,
      securityType: "stock" as const,
      updatedAt: "2026-05-27T05:00:00.000Z"
    })));
    await repo.saveCandidates([{
      symbol: "2330",
      name: "台積電",
      score: 8.4,
      eventCount: 3,
      sourceCount: 3,
      latestTitle: "台積電 AI 訂單",
      latestAt: "2026-05-27T05:00:00.000Z",
      sources: ["rss", "ptt", "finmind"],
      tags: ["AI"],
      reason: "事件訊號"
    }]);
    await repo.saveSourceRuns([
      sourceRun({ source: "rss", status: "ok", itemCount: 50, startedAt: "2026-05-27T05:00:00.000Z" }),
      sourceRun({ source: "ptt", status: "ok", itemCount: 10, startedAt: "2026-05-27T05:00:00.000Z" }),
      sourceRun({ source: "finmind", status: "ok", itemCount: 4274, startedAt: "2026-05-27T05:00:00.000Z" })
    ]);
    const app = createApp({
      repo,
      adminToken: "secret",
      now: () => "2026-05-27T10:30:00.000Z"
    });

    const response = await app.fetch(new Request("https://api.test/api/data-readiness"));
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "social-events",
        status: "degraded",
        message: expect.stringContaining("已超過 3 小時")
      }),
      expect.objectContaining({
        id: "finmind-signals",
        status: "degraded",
        message: expect.stringContaining("已超過 3 小時")
      })
    ]));
  });

  it("returns universe metadata for connected Taiwan stock master data", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2330",
      name: "台積電",
      market: "上市",
      industry: "半導體業",
      securityType: "stock",
      updatedAt: "2026-05-27T05:00:00.000Z"
    }]);
    const app = createApp({ repo, adminToken: "secret" });

    await repo.upsertUniverse([{
      symbol: "2317",
      name: "鴻海",
      market: "上市",
      industry: "其他電子業",
      securityType: "stock",
      updatedAt: "2026-05-27T05:00:00.000Z"
    }]);

    const response = await app.fetch(new Request("https://api.test/api/universe?limit=2"));
    const body = await response.json() as { stocks: unknown[]; count: number };

    expect(response.status).toBe(200);
    expect(body.count).toBe(2);
    expect(body.stocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbol: "2330", name: "台積電", industry: "半導體業" })
    ]));
  });

  it("uses universe names when recomputing candidates from stored events", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2330",
      name: "台積電",
      market: "上市",
      industry: "半導體業",
      securityType: "stock",
      updatedAt: "2026-05-27T05:00:00.000Z"
    }]);
    await repo.saveEvents([{
      id: "rss:2330:test",
      source: "rss",
      symbol: "2330",
      title: "2330 AI 訂單",
      url: "https://news.test/a",
      publishedAt: "2026-05-27T02:00:00.000Z",
      engagement: 0,
      tags: ["AI"],
      sentiment: 4,
      reason: "新聞事件"
    }]);
    const app = createApp({ repo, adminToken: "secret" });

    await app.fetch(new Request("https://api.test/api/admin/run-score", {
      method: "POST",
      headers: { "x-admin-token": "secret" }
    }));

    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "2330", name: "台積電" })
    ]);
  });

  it("requires admin token to mutate watchlist", async () => {
    const app = createApp({ repo: new MemoryRepository(), adminToken: "secret" });

    const response = await app.fetch(new Request("https://api.test/api/watchlist", {
      method: "POST",
      body: JSON.stringify({ symbol: "2330", name: "台積電" })
    }));

    expect(response.status).toBe(401);
  });

  it("fails closed for admin mutation endpoints when admin token is not configured", async () => {
    const app = createApp({ repo: new MemoryRepository() });

    const response = await app.fetch(new Request("https://api.test/api/admin/run-score", {
      method: "POST"
    }));

    expect(response.status).toBe(503);
  });

  it("adds and lists watchlist entries with a valid admin token", async () => {
    const app = createApp({ repo: new MemoryRepository(), adminToken: "secret" });

    const created = await app.fetch(new Request("https://api.test/api/watchlist", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "secret" },
      body: JSON.stringify({ symbol: "2330", name: "台積電" })
    }));
    const listed = await app.fetch(new Request("https://api.test/api/watchlist"));
    const body = await listed.json() as { watchlist: unknown[] };

    expect(created.status).toBe(201);
    expect(body.watchlist).toEqual([{ symbol: "2330", name: "台積電", addedAt: expect.any(String) }]);
  });

  it("removes watchlist entries with a valid admin token", async () => {
    const repo = new MemoryRepository();
    await repo.addWatchlist({ symbol: "2330", name: "台積電" });
    const app = createApp({ repo, adminToken: "secret" });

    const denied = await app.fetch(new Request("https://api.test/api/watchlist/2330", {
      method: "DELETE"
    }));
    const removed = await app.fetch(new Request("https://api.test/api/watchlist/2330", {
      method: "DELETE",
      headers: { "x-admin-token": "secret" }
    }));
    const listed = await app.fetch(new Request("https://api.test/api/watchlist"));
    const body = await listed.json() as { watchlist: unknown[] };

    expect(denied.status).toBe(401);
    expect(removed.status).toBe(202);
    expect(await removed.json()).toEqual({ removed: true });
    expect(body.watchlist).toEqual([]);
  });

  it("allows browser preflight for watchlist delete requests", async () => {
    const app = createApp({ repo: new MemoryRepository(), adminToken: "secret" });

    const response = await app.fetch(new Request("https://api.test/api/watchlist/2330", {
      method: "OPTIONS"
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
    expect(response.headers.get("access-control-allow-headers")).toContain("x-admin-token");
  });

  it("allows browser preflight for signed social ingest requests", async () => {
    const app = createApp({ repo: new MemoryRepository(), ingestToken: "ingest-secret" });

    const response = await app.fetch(new Request("https://api.test/api/ingest/social", {
      method: "OPTIONS"
    }));

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(response.headers.get("access-control-allow-headers")).toContain("content-type");
    expect(response.headers.get("access-control-allow-headers")).toContain("x-ingest-signature");
  });

  it("runs fixture ingestion through an admin endpoint", async () => {
    const app = createApp({ repo: new MemoryRepository(), adminToken: "secret", ingestToken: "ingest-secret" });

    const response = await app.fetch(new Request("https://api.test/api/admin/run-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "secret" },
      body: JSON.stringify({
        now: "2026-05-27T03:00:00.000Z",
        sources: {
          rssXml: "<rss><channel><item><title>台積電 2330 AI 訂單</title><link>https://news.test/a</link><pubDate>Wed, 27 May 2026 02:00:00 GMT</pubDate></item></channel></rss>"
        }
      })
    }));
    const body = await response.json() as { candidateCount: number };

    expect(response.status).toBe(202);
    expect(body.candidateCount).toBe(1);
    expect(await app.fetch(new Request("https://api.test/api/source-runs")).then((res) => res.json()))
      .toMatchObject({ runs: [expect.objectContaining({ source: "rss", status: "ok" })] });
  });

  it("runs live ingestion through an admin endpoint when no sources payload is supplied", async () => {
    const app = createApp({
      repo: new MemoryRepository(),
      adminToken: "secret",
      sourceEnv: {
        RSS_FEED_URL: "https://rss.test/feed.xml"
      },
      fetcher: async () => new Response("<rss><channel><item><title>台積電 2330 AI 新聞</title><link>https://news.test/1</link><pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate></item></channel></rss>")
    });

    const response = await app.fetch(new Request("https://api.test/api/admin/run-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "secret" },
      body: JSON.stringify({})
    }));
    const body = await response.json() as { candidateCount: number };

    expect(response.status).toBe(202);
    expect(body.candidateCount).toBe(1);
  });

  it("uses Workers AI for lightweight live event classification when configured", async () => {
    const aiRequests: unknown[] = [];
    const repo = new MemoryRepository();
    const app = createApp({
      repo,
      adminToken: "secret",
      sourceEnv: {
        RSS_FEED_URL: "https://rss.test/feed.xml"
      },
      ai: {
        run: async (_model: string, input: unknown) => {
          aiRequests.push(input);
          return {
            response: JSON.stringify({
              sentiment: 5,
              tags: ["AI", "供應鏈"],
              reason: "Workers AI 短文本分類"
            })
          };
        }
      },
      classifierEnabled: true,
      classifierLimit: 5,
      fetcher: async () => new Response("<rss><channel><item><title>台積電 2330 AI 訂單升溫</title><link>https://news.test/1</link><pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate></item></channel></rss>")
    });

    const response = await app.fetch(new Request("https://api.test/api/admin/run-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "secret" },
      body: JSON.stringify({})
    }));

    expect(response.status).toBe(202);
    expect(aiRequests).toHaveLength(1);
    await expect(repo.listEventsForSymbol("2330")).resolves.toEqual([
      expect.objectContaining({
        sentiment: 5,
        tags: ["AI", "供應鏈"],
        reason: "Workers AI 短文本分類"
      })
    ]);
  });

  it("includes watchlist symbols when fetching live FinMind prices", async () => {
    const repo = new MemoryRepository();
    await repo.addWatchlist({ symbol: "2317", name: "鴻海" });
    const requestedSymbols: string[] = [];
    const app = createApp({
      repo,
      adminToken: "secret",
      sourceEnv: {
        FINMIND_TOKEN: "token",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("TaiwanStockInfo")) {
          return new Response(JSON.stringify({ data: [{ stock_id: "2317", stock_name: "鴻海", type: "twse" }] }));
        }
        if (url.includes("TaiwanStockPrice")) {
          const symbol = new URL(url).searchParams.get("data_id") ?? "";
          requestedSymbols.push(symbol);
          return new Response(JSON.stringify({ data: [{ stock_id: symbol, stock_name: "鴻海", close: 180, Trading_Volume: 1000 }] }));
        }
        return new Response("");
      }
    });

    const response = await app.fetch(new Request("https://api.test/api/admin/run-ingest", {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "secret" },
      body: JSON.stringify({})
    }));
    const body = await response.json() as { candidateCount: number };

    expect(requestedSymbols).toEqual(["2317"]);
    expect(response.status).toBe(202);
    expect(body.candidateCount).toBe(1);
  });

  it("recomputes candidates from stored events through an admin endpoint", async () => {
    const repo = new MemoryRepository();
    await repo.saveEvents([{
      id: "rss:2330:test",
      source: "rss",
      symbol: "2330",
      title: "台積電 2330 AI 訂單",
      url: "https://news.test/a",
      publishedAt: "2026-05-27T02:00:00.000Z",
      engagement: 0,
      tags: ["AI"],
      sentiment: 4,
      reason: "新聞事件"
    }]);
    const app = createApp({ repo, adminToken: "secret", ingestToken: "ingest-secret" });

    const response = await app.fetch(new Request("https://api.test/api/admin/run-score", {
      method: "POST",
      headers: { "x-admin-token": "secret" }
    }));
    const body = await response.json() as { candidateCount: number };

    expect(response.status).toBe(202);
    expect(body.candidateCount).toBe(1);
  });

  it("accepts consent-based social ingest only with a valid HMAC signature", async () => {
    const repo = new MemoryRepository();
    const app = createApp({ repo, adminToken: "secret", ingestToken: "ingest-secret" });
    const body = JSON.stringify({
      events: [{
        source: "ptt",
        title: "2330 台積電 討論熱度",
        url: "https://community.test/1",
        publishedAt: "2026-05-27T03:00:00.000Z",
        engagement: 6,
        symbols: ["2330"]
      }]
    });
    const signature = await signIngestBody(body, "ingest-secret");

    const denied = await app.fetch(new Request("https://api.test/api/ingest/social", {
      method: "POST",
      body
    }));
    const accepted = await app.fetch(new Request("https://api.test/api/ingest/social", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-signature": signature },
      body
    }));

    expect(denied.status).toBe(401);
    expect(accepted.status).toBe(202);
    expect(await repo.listEventsForSymbol("2330")).toHaveLength(1);
  });

  it("uses universe names when signed social ingest updates candidates", async () => {
    const repo = new MemoryRepository();
    await repo.upsertUniverse([{
      symbol: "2330",
      name: "台積電",
      market: "上市",
      industry: "半導體業",
      securityType: "stock",
      updatedAt: "2026-05-27T05:00:00.000Z"
    }]);
    const app = createApp({ repo, ingestToken: "ingest-secret" });
    const body = JSON.stringify({
      events: [{
        source: "ptt",
        title: "2330 AI 需求討論",
        url: "https://community.test/2",
        publishedAt: "2026-05-27T03:00:00.000Z",
        engagement: 12,
        symbols: ["2330"]
      }]
    });
    const signature = await signIngestBody(body, "ingest-secret");

    const response = await app.fetch(new Request("https://api.test/api/ingest/social", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-signature": signature },
      body
    }));

    expect(response.status).toBe(202);
    await expect(repo.listCandidates()).resolves.toEqual([
      expect.objectContaining({ symbol: "2330", name: "台積電" })
    ]);
  });

  it("records a source run when signed social ingest is accepted", async () => {
    const repo = new MemoryRepository();
    const app = createApp({
      repo,
      ingestToken: "ingest-secret",
      now: () => "2026-05-27T09:30:00.000Z"
    });
    const body = JSON.stringify({
      events: [{
        source: "ptt",
        title: "2330 台積電 討論熱度",
        url: "https://community.test/3",
        publishedAt: "2026-05-27T09:00:00.000Z",
        engagement: 8,
        symbols: ["2330"]
      }]
    });
    const signature = await signIngestBody(body, "ingest-secret");

    const response = await app.fetch(new Request("https://api.test/api/ingest/social", {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-signature": signature },
      body
    }));

    expect(response.status).toBe(202);
    await expect(repo.listSourceRuns()).resolves.toEqual([
      expect.objectContaining({
        source: "ptt",
        status: "ok",
        startedAt: "2026-05-27T09:30:00.000Z",
        itemCount: 1,
        message: "signed social ingest accepted"
      })
    ]);
  });
});

function sourceRun(overrides: Partial<SourceRun>): SourceRun {
  return {
    id: `${overrides.source ?? "rss"}:2026-05-27T05:00:00.000Z`,
    source: "rss",
    status: "ok",
    startedAt: "2026-05-27T05:00:00.000Z",
    finishedAt: "2026-05-27T05:00:01.000Z",
    itemCount: 1,
    ...overrides
  };
}

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    symbol: "2330",
    name: "台積電",
    score: 8.4,
    eventCount: 2,
    sourceCount: 2,
    latestTitle: "台積電先進封裝需求升溫",
    latestAt: "2026-05-27T02:00:00.000Z",
    sources: ["ptt", "rss"],
    tags: ["AI"],
    reason: "新聞與討論同步升溫",
    ...overrides
  };
}
