import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SnapshotPanel } from "../src/components/SnapshotPanel";
import type { DailySnapshot } from "@stock-analytics/shared";

describe("SnapshotPanel", () => {
  it("renders daily drift reminders for newly surfaced and dropped symbols", () => {
    const snapshots: DailySnapshot[] = [
      {
        id: "snapshot:2026-05-27T00:00:00.000Z",
        createdAt: "2026-05-27T00:00:00.000Z",
        candidateCount: 2,
        topSymbols: ["2330", "2454"],
        sourceStatusCounts: { ok: 4, partial: 1, failed: 0 },
        drift: {
          newSymbols: ["2454"],
          droppedSymbols: ["2317"],
          scoreChanges: [{ symbol: "2330", from: 8.2, to: 9.4, delta: 1.2 }]
        }
      }
    ];

    const html = renderToString(<SnapshotPanel snapshots={snapshots} />);

    expect(html).toContain("今日異動");
    expect(html).toContain("新浮現 2454");
    expect(html).toContain("跌出雷達 2317");
    expect(html).toContain("2330 +1.2");
  });
});
