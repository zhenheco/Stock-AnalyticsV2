import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { latestRunsBySource, sourceRunAdvice, SourceHealth } from "../src/components/SourceHealth";
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

  it("translates a missing FinMind token into actionable data-gap advice", () => {
    const run = sourceRun({
      source: "finmind",
      status: "partial",
      message: "FINMIND_TOKEN or FINMIND_SYMBOLS not configured for price/chip data"
    });

    expect(sourceRunAdvice(run)).toBe("FinMind token 尚未設定，價格與籌碼資料暫停；股票主檔仍會更新。");

    const html = renderToString(<SourceHealth runs={[run]} />);
    expect(html).toContain("FinMind token 尚未設定");
    expect(html).toContain("價格與籌碼資料暫停");
  });

  it("translates anonymous FinMind signal mode without saying price data is paused", () => {
    const run = sourceRun({
      source: "finmind",
      status: "partial",
      itemCount: 3,
      message: "FINMIND_TOKEN not configured; using anonymous limited price/chip data"
    });

    expect(sourceRunAdvice(run)).toBe("FinMind 價格與籌碼已用免 token 降級模式接通；設定 token 可提高額度穩定性。");

    const html = renderToString(<SourceHealth runs={[run]} />);
    expect(html).toContain("免 token 降級模式接通");
    expect(html).not.toContain("價格與籌碼資料暫停");
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
