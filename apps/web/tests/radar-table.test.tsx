import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RadarTable } from "../src/components/RadarTable";
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
});
