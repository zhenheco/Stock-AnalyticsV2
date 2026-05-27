import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataReadinessPanel, summarizeReadiness } from "../src/components/DataReadinessPanel";

describe("DataReadinessPanel", () => {
  it("renders degraded FinMind readiness as an actionable dashboard gap", () => {
    const html = renderToString(<DataReadinessPanel readiness={{
      status: "degraded",
      updatedAt: "2026-05-27T10:00:00.000Z",
      counts: {
        candidates: 100,
        universe: 4114,
        watchlist: 2
      },
      checks: [
        { id: "social-events", label: "社群/時事", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
        { id: "finmind-signals", label: "FinMind 價格/籌碼/營收", status: "missing", message: "FINMIND_TOKEN 尚未設定，價格、籌碼與營收資料未進入事件管線" }
      ]
    }} />);

    expect(html).toContain("資料接線狀態");
    expect(html).toContain("降級");
    expect(html).toContain("FinMind 價格/籌碼/營收");
    expect(html).toContain("FINMIND_TOKEN 尚未設定");
  });

  it("summarizes overall completion and next readiness blockers", () => {
    expect(summarizeReadiness({
      status: "degraded",
      updatedAt: "2026-05-27T10:00:00.000Z",
      counts: {
        candidates: 100,
        universe: 3059,
        watchlist: 0
      },
      checks: [
        { id: "universe", label: "股票主檔", status: "ready", message: "3059 檔股票主檔已可用" },
        { id: "candidates", label: "候選股", status: "ready", message: "100 檔候選股已產出" },
        { id: "social-events", label: "社群/時事", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
        { id: "finmind-signals", label: "FinMind 價格/籌碼/營收", status: "degraded", message: "設定 FINMIND_TOKEN 可提高額度穩定性" }
      ]
    })).toEqual({
      readyCount: 3,
      totalCount: 4,
      completionPercent: 75,
      blockers: ["FinMind 價格/籌碼/營收"],
      nextAction: "補上 FINMIND_TOKEN 後同步 Cloudflare secret"
    });
  });

  it("renders completion percent and next action", () => {
    const html = renderToString(<DataReadinessPanel readiness={{
      status: "degraded",
      updatedAt: "2026-05-27T10:00:00.000Z",
      counts: {
        candidates: 100,
        universe: 3059,
        watchlist: 0
      },
      checks: [
        { id: "universe", label: "股票主檔", status: "ready", message: "3059 檔股票主檔已可用" },
        { id: "candidates", label: "候選股", status: "ready", message: "100 檔候選股已產出" },
        { id: "social-events", label: "社群/時事", status: "ready", message: "PTT 與 RSS 來源最近一次同步正常" },
        { id: "finmind-signals", label: "FinMind 價格/籌碼/營收", status: "degraded", message: "設定 FINMIND_TOKEN 可提高額度穩定性" }
      ]
    }} />);

    expect(html).toContain("完成度");
    expect(html).toContain("75%");
    expect(html).toContain("下一步");
    expect(html).toContain("補上 FINMIND_TOKEN");
  });
});
