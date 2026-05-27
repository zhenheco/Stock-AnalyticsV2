import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { latestRunsBySource, SourceHealth } from "../src/components/SourceHealth";
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

  it("keeps only the latest run for each source", () => {
    const runs: SourceRun[] = [
      sourceRun({ id: "rss:old", source: "rss", status: "failed", startedAt: "2026-05-27T04:00:00.000Z", message: "old failure" }),
      sourceRun({ id: "rss:new", source: "rss", status: "ok", startedAt: "2026-05-27T05:00:00.000Z", itemCount: 50 }),
      sourceRun({ id: "ptt:new", source: "ptt", status: "partial", startedAt: "2026-05-27T05:10:00.000Z", message: "slow" })
    ];

    expect(latestRunsBySource(runs).map((run) => run.id)).toEqual(["ptt:new", "rss:new"]);
  });

  it("renders latest source health without older failure noise", () => {
    const html = renderToString(<SourceHealth runs={[
      sourceRun({ id: "rss:old", source: "rss", status: "failed", startedAt: "2026-05-27T04:00:00.000Z", message: "old failure" }),
      sourceRun({ id: "rss:new", source: "rss", status: "ok", startedAt: "2026-05-27T05:00:00.000Z", itemCount: 50 })
    ]} />);

    expect(html).toContain("最新 05/27");
    expect(html).toContain("50 筆");
    expect(html).not.toContain("old failure");
  });
});

function sourceRun(overrides: Partial<SourceRun>): SourceRun {
  return {
    id: "rss:2026-05-27T05:00:00.000Z",
    source: "rss",
    status: "ok",
    startedAt: "2026-05-27T05:00:00.000Z",
    finishedAt: "2026-05-27T05:00:01.000Z",
    itemCount: 3,
    ...overrides
  };
}
