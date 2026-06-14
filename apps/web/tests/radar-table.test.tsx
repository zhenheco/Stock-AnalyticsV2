import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { filterAndSortCandidates, formatMetricBadges, RadarTable, sourceMixSegments, type RadarFilters } from "../src/components/RadarTable";
import type { Candidate } from "@stock-analytics/shared";

describe("RadarTable", () => {
  it("renders an empty state when no candidates are available", () => {
    const html = renderToString(<RadarTable candidates={[]} />);

    expect(html).toContain("尚無事件候選股");
  });

  it("renders candidate score, source mix, and evidence link", () => {
    const candidates: Candidate[] = [
      {
        symbol: "2330",
        name: "台積電",
        score: 8.4,
        eventCount: 2,
        sourceCount: 2,
        latestTitle: "台積電先進封裝需求升溫",
        latestAt: "2026-05-27T02:00:00.000Z",
        sources: ["ptt", "rss"],
        tags: ["AI", "供應鏈"],
        reason: "新聞與討論同步升溫"
      }
    ];

    const html = renderToString(<RadarTable candidates={candidates} />);

    expect(html).toContain("2330");
    expect(html).toContain("8.4");
    expect(html).toContain("ptt");
    expect(html).toContain("/stock/2330");
  });

  it("renders source and event counts as a scan-friendly evidence summary", () => {
    const html = renderToString(<RadarTable candidates={[
      candidate({
        symbol: "2330",
        sourceCount: 3,
        eventCount: 12,
        sources: ["ptt", "rss", "finmind"]
      })
    ]} />);

    expect(html).toContain("3 來源");
    expect(html).toContain("12 事件");
  });

  it("renders source contribution counts for each candidate", () => {
    const html = renderToString(<RadarTable candidates={[
      candidate({
        symbol: "2330",
        eventCount: 7,
        sourceCount: 4,
        sources: ["ptt", "rss", "finmind", "twse"],
        sourceEventCounts: { ptt: 2, rss: 1, finmind: 3, twse: 1 }
      })
    ]} />);

    expect(html).toContain("PTT 2");
    expect(html).toContain("RSS 1");
    expect(html).toContain("FinMind 3");
    expect(html).toContain("TWSE 1");
  });

  it("renders explainable score breakdown and confidence for candidates", () => {
    const html = renderToString(<RadarTable candidates={[
      candidate({
        symbol: "2330",
        confidenceScore: 82,
        scoreBreakdown: {
          eventStrength: 3.2,
          sourceConfidence: 2.4,
          freshness: 1.5,
          crossSourceBoost: 1.2,
          watchlistBoost: 0.5
        }
      })
    ]} />);

    expect(html).toContain("信心 82");
    expect(html).toContain("事件強度 3.2");
    expect(html).toContain("來源可信 2.4");
    expect(html).toContain("多源共振 1.2");
  });

  it("builds source mix segments from candidate counts", () => {
    expect(sourceMixSegments(candidate({
      eventCount: 6,
      sources: ["ptt", "rss", "finmind"],
      sourceEventCounts: { ptt: 2, rss: 1, finmind: 3 }
    }))).toEqual([
      { source: "ptt", label: "PTT", count: 2, percent: 33 },
      { source: "rss", label: "RSS", count: 1, percent: 17 },
      { source: "finmind", label: "FinMind", count: 3, percent: 50 }
    ]);
  });

  it("renders event category tags as part of candidate evidence", () => {
    const candidates: Candidate[] = [
      {
        symbol: "2356",
        name: "英業達",
        score: 2.6,
        eventCount: 1,
        sourceCount: 1,
        latestTitle: "【公告】英業達股東會重要決議事項",
        latestAt: "2026-05-27T02:00:00.000Z",
        sources: ["rss"],
        tags: ["公告"],
        reason: "公告事件，可信但催化程度較低"
      }
    ];

    const html = renderToString(<RadarTable candidates={candidates} />);

    expect(html).toContain("公告");
    expect(html).toContain("催化程度較低");
  });

  it("filters candidates by minimum score, source, and tag", () => {
    const filters: RadarFilters = {
      minScore: 6,
      source: "rss",
      tag: "AI",
      sort: "score",
      watchlistOnly: false
    };

    expect(filterAndSortCandidates([
      candidate({ symbol: "2330", score: 8.4, sources: ["ptt", "rss"], tags: ["AI"] }),
      candidate({ symbol: "2356", score: 7.2, sources: ["rss"], tags: ["公告"] }),
      candidate({ symbol: "1402", score: 5.9, sources: ["ptt"], tags: ["AI"] })
    ], filters, new Set(["2356"])).map((item) => item.symbol)).toEqual(["2330"]);
  });

  it("filters candidates to tracked watchlist symbols", () => {
    const filters: RadarFilters = {
      minScore: 0,
      source: "all",
      tag: "all",
      sort: "score",
      watchlistOnly: true
    };

    expect(filterAndSortCandidates([
      candidate({ symbol: "2330", score: 8.4 }),
      candidate({ symbol: "2356", score: 7.2 })
    ], filters, new Set(["2356"])).map((item) => item.symbol)).toEqual(["2356"]);
  });

  it("sorts visible candidates by latest event time when requested", () => {
    const visible = filterAndSortCandidates([
      candidate({ symbol: "2330", score: 9.5, latestAt: "2026-05-27T01:00:00.000Z" }),
      candidate({ symbol: "2328", score: 6.5, latestAt: "2026-05-27T06:00:00.000Z" })
    ], {
      minScore: 0,
      source: "all",
      tag: "all",
      sort: "latest",
      watchlistOnly: false
    });

    expect(visible.map((item) => item.symbol)).toEqual(["2328", "2330"]);
  });

  it("renders the active visible candidate count", () => {
    const html = renderToString(
      <RadarTable
        candidates={[
          candidate({ symbol: "2330", score: 8.4, sources: ["rss"], tags: ["AI"] }),
          candidate({ symbol: "2356", score: 0.6, sources: ["rss"], tags: ["公告"] })
        ]}
        filters={{ minScore: 6, source: "all", tag: "all", sort: "score", watchlistOnly: false }}
        onFiltersChange={() => undefined}
      />
    );

    expect(html).toContain("顯示 1 / 2");
    expect(html).toContain("最低分數");
    expect(html).toContain("事件標籤");
  });

  it("renders watchlist badges and focus control", () => {
    const html = renderToString(
      <RadarTable
        candidates={[candidate({ symbol: "2330", score: 8.4 })]}
        filters={{ minScore: 0, source: "all", tag: "all", sort: "score", watchlistOnly: false }}
        onFiltersChange={() => undefined}
        watchlistSymbols={new Set(["2330"])}
      />
    );

    expect(html).toContain("已追蹤");
    expect(html).toContain("只看追蹤");
  });

  it("renders an add-to-watchlist action for untracked candidates", () => {
    const html = renderToString(
      <RadarTable
        candidates={[candidate({ symbol: "2330", score: 8.4 })]}
        onAddToWatchlist={() => undefined}
        watchlistSymbols={new Set()}
      />
    );

    expect(html).toContain("加入追蹤");
  });

  it("does not render an add-to-watchlist action for tracked candidates", () => {
    const html = renderToString(
      <RadarTable
        candidates={[candidate({ symbol: "2330", score: 8.4 })]}
        onAddToWatchlist={() => undefined}
        watchlistSymbols={new Set(["2330"])}
      />
    );

    expect(html).not.toContain("加入追蹤");
    expect(html).toContain("已追蹤");
  });

  it("formats present FinMind metrics into research badges", () => {
    expect(formatMetricBadges({
      revenueYoYPct: 42.3,
      volumeRatio: 3.14,
      priceChangePct: -6.7,
      liquidityTier: "充足"
    })).toEqual([
      { key: "revenueYoY", label: "YoY +42.3%" },
      { key: "volumeRatio", label: "量比 3.1x" },
      { key: "priceChange", label: "漲跌 -6.7%" },
      { key: "liquidity", label: "流動性 充足" }
    ]);
  });

  it("omits badges for undefined metric fields and returns empty for missing metrics", () => {
    expect(formatMetricBadges({ volumeRatio: 2.5 })).toEqual([
      { key: "volumeRatio", label: "量比 2.5x" }
    ]);
    expect(formatMetricBadges(undefined)).toEqual([]);
    expect(formatMetricBadges({})).toEqual([]);
  });

  it("renders 衍生訊號 badges for candidates that carry FinMind metrics", () => {
    const html = renderToString(<RadarTable candidates={[
      candidate({
        symbol: "2330",
        metrics: { revenueYoYPct: 42.3, volumeRatio: 3.1, priceChangePct: 5.5, liquidityTier: "充足" }
      })
    ]} />);

    expect(html).toContain("YoY +42.3%");
    expect(html).toContain("量比 3.1x");
    expect(html).toContain("漲跌 +5.5%");
    expect(html).toContain("流動性 充足");
  });

  it("hides 衍生訊號 badges when a candidate has no metrics", () => {
    const html = renderToString(<RadarTable candidates={[candidate({ symbol: "2330" })]} />);

    expect(html).not.toContain("量比");
    expect(html).not.toContain("流動性");
  });
});

function candidate(overrides: Partial<Candidate>): Candidate {
  return {
    symbol: "2330",
    name: "台積電",
    score: 8,
    eventCount: 1,
    sourceCount: 1,
    latestTitle: "台積電 2330 AI 新聞",
    latestAt: "2026-05-27T02:00:00.000Z",
    sources: ["rss"],
    tags: ["AI"],
    reason: "rss 事件訊號命中",
    ...overrides
  };
}
