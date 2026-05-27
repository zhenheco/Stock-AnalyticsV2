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
});
