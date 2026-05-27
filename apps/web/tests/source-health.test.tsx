import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceHealth } from "../src/components/SourceHealth";
import type { SourceRun } from "@stock-analytics/shared";

describe("SourceHealth", () => {
  it("renders source status and item counts", () => {
    const runs: SourceRun[] = [
      {
        id: "rss:2026-05-27T05:00:00.000Z",
        source: "rss",
        status: "ok",
        startedAt: "2026-05-27T05:00:00.000Z",
        finishedAt: "2026-05-27T05:00:01.000Z",
        itemCount: 3
      },
      {
        id: "ptt:2026-05-27T05:00:00.000Z",
        source: "ptt",
        status: "failed",
        startedAt: "2026-05-27T05:00:00.000Z",
        finishedAt: "2026-05-27T05:00:01.000Z",
        itemCount: 0,
        message: "timeout"
      }
    ];

    const html = renderToString(<SourceHealth runs={runs} />);

    expect(html).toContain("資料健康度");
    expect(html).toContain("rss");
    expect(html).toContain("3 筆");
    expect(html).toContain("timeout");
  });
});
