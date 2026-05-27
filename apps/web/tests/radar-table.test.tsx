import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { filterAndSortCandidates, RadarTable, type RadarFilters } from "../src/components/RadarTable";
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
