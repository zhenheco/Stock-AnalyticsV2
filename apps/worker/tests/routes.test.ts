import { describe, expect, it } from "vitest";
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
    const app = createApp({ repo, adminToken: "secret" });

    const response = await app.fetch(new Request("https://api.test/api/candidates"));
    const body = await response.json() as { candidates: unknown[]; updatedAt: string };

    expect(response.status).toBe(200);
    expect(body.candidates).toHaveLength(1);
    expect(body.updatedAt).toBe("2026-05-27T02:00:00.000Z");
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
    const app = createApp({ repo, adminToken: "secret" });

    const response = await app.fetch(new Request("https://api.test/api/source-runs"));
    const body = await response.json() as { runs: unknown[] };

    expect(response.status).toBe(200);
    expect(body.runs).toEqual([
      expect.objectContaining({ source: "rss", status: "ok", itemCount: 3 })
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
});
