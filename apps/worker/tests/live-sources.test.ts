import { describe, expect, it } from "vitest";
import { fetchLiveSources } from "../src/sources/live";

describe("fetchLiveSources", () => {
  it("fetches configured PTT, RSS, and FinMind sources", async () => {
    const requested: string[] = [];
    const sources = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        FINMIND_TOKEN: "token",
        FINMIND_SYMBOLS: "2330,2317",
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input, init) => {
        const url = String(input);
        requested.push(`${init?.headers instanceof Headers ? init.headers.get("authorization") : ""} ${url}`);
        if (url.includes("finmindtrade")) {
          const symbol = new URL(url).searchParams.get("data_id");
          return jsonResponse({
            data: [
              { stock_id: "2330", stock_name: "台積電", close: 980, Trading_Volume: 1000 },
              { stock_id: "2317", stock_name: "鴻海", close: 180, Trading_Volume: 800 }
            ].filter((row) => row.stock_id === symbol)
          });
        }
        if (url.includes("rss.test")) {
          return textResponse("<rss><channel><item><title>台積電 2330 AI 新聞</title><link>https://news.test/1</link><pubDate>Wed, 27 May 2026 04:00:00 GMT</pubDate></item></channel></rss>");
        }
        return textResponse("<div class=\"r-ent\"><div class=\"nrec\"><span>9</span></div><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">[標的] 2330 台積電 討論</a></div><div class=\"date\"> 5/27</div></div>");
      }
    });

    expect(sources.finmindRows).toHaveLength(2);
    expect(sources.rssXml).toContain("台積電");
    expect(sources.pttHtml).toContain("2330");
    expect(requested.some((entry) => entry.includes("Bearer token"))).toBe(true);
  });

  it("returns partial source data when one source fails", async () => {
    const sources = await fetchLiveSources({
      now: "2026-05-27T05:00:00.000Z",
      env: {
        RSS_FEED_URL: "https://rss.test/feed.xml",
        PTT_STOCK_URL: "https://ptt.test/bbs/Stock/index.html"
      },
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes("rss.test")) {
          throw new Error("rss down");
        }
        return textResponse("<div class=\"r-ent\"><div class=\"title\"><a href=\"/bbs/Stock/M.3.html\">2330 台積電</a></div><div class=\"date\"> 5/27</div></div>");
      }
    });

    expect(sources.rssXml).toBeUndefined();
    expect(sources.pttHtml).toContain("台積電");
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" }
  });
}

function textResponse(body: string): Response {
  return new Response(body, {
    headers: { "content-type": "text/plain" }
  });
}
