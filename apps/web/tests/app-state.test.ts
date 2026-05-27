import { describe, expect, it } from "vitest";
import { mergeWatchlistEntry } from "../src/App";

describe("App state helpers", () => {
  it("merges watchlist entries without duplicates and keeps symbols sorted", () => {
    expect(mergeWatchlistEntry([
      { symbol: "2330", name: "台積電", addedAt: "2026-05-26T00:00:00.000Z" },
      { symbol: "1101", name: "台泥", addedAt: "2026-05-26T00:00:00.000Z" }
    ], {
      symbol: "2330",
      name: "台積電",
      addedAt: "2026-05-27T00:00:00.000Z"
    })).toEqual([
      { symbol: "1101", name: "台泥", addedAt: "2026-05-26T00:00:00.000Z" },
      { symbol: "2330", name: "台積電", addedAt: "2026-05-27T00:00:00.000Z" }
    ]);
  });
});
