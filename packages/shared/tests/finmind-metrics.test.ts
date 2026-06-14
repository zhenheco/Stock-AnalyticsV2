import { describe, expect, it } from "vitest";
import { computeFinMindMetrics } from "../src/finmind-metrics";
import type { FinMindMetrics, FinMindRow } from "../src/types";

function priceRow(date: string, close: number, volume: number, money?: number): FinMindRow {
  return {
    stock_id: "1234",
    date,
    close,
    Trading_Volume: volume,
    ...(money === undefined ? {} : { Trading_money: money })
  };
}

function revenueRow(year: number, month: number, revenue: number): FinMindRow {
  return {
    stock_id: "1234",
    date: `${year}-${String(month).padStart(2, "0")}-10`,
    revenue,
    revenue_year: year,
    revenue_month: month
  };
}

describe("computeFinMindMetrics", () => {
  it("returns an empty metrics object when given no rows", () => {
    const metrics: FinMindMetrics = computeFinMindMetrics([], "stock");

    expect(metrics).toEqual({});
  });

  it("computes priceChangePct from the last two price rows, 2 decimals", () => {
    const metrics = computeFinMindMetrics(
      [priceRow("2026-06-12", 100, 1000), priceRow("2026-06-13", 105, 1200)],
      "stock"
    );

    expect(metrics.priceChangePct).toBe(5);
  });

  it("returns undefined priceChangePct when fewer than 2 price rows", () => {
    const metrics = computeFinMindMetrics([priceRow("2026-06-13", 105, 1200)], "stock");

    expect(metrics.priceChangePct).toBeUndefined();
  });

  it("returns undefined priceChangePct when previous close is zero", () => {
    const metrics = computeFinMindMetrics(
      [priceRow("2026-06-12", 0, 1000), priceRow("2026-06-13", 105, 1200)],
      "stock"
    );

    expect(metrics.priceChangePct).toBeUndefined();
  });

  it("computes volumeRatio as today volume over mean of prior trading days, 1 decimal", () => {
    const rows = [
      priceRow("2026-06-06", 100, 100),
      priceRow("2026-06-07", 100, 100),
      priceRow("2026-06-08", 100, 100),
      priceRow("2026-06-09", 100, 100),
      priceRow("2026-06-10", 100, 100),
      priceRow("2026-06-13", 100, 300)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.volumeRatio).toBe(3);
  });

  it("returns undefined volumeRatio when prior segment has fewer than 5 trading days", () => {
    const rows = [
      priceRow("2026-06-09", 100, 100),
      priceRow("2026-06-10", 100, 100),
      priceRow("2026-06-11", 100, 100),
      priceRow("2026-06-12", 100, 100),
      priceRow("2026-06-13", 100, 300)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.volumeRatio).toBeUndefined();
  });

  it("flags limit_up for a stock with priceChangePct >= 9.5", () => {
    const metrics = computeFinMindMetrics(
      [priceRow("2026-06-12", 100, 1000), priceRow("2026-06-13", 110, 1200)],
      "stock"
    );

    expect(metrics.limitFlag).toBe("limit_up");
  });

  it("flags limit_down for a stock with priceChangePct <= -9.5", () => {
    const metrics = computeFinMindMetrics(
      [priceRow("2026-06-12", 100, 1000), priceRow("2026-06-13", 90, 1200)],
      "stock"
    );

    expect(metrics.limitFlag).toBe("limit_down");
  });

  it("never flags a limit for ETF/ETN/index symbols", () => {
    const rows = [priceRow("2026-06-12", 100, 1000), priceRow("2026-06-13", 110, 1200)];

    expect(computeFinMindMetrics(rows, "etf").limitFlag).toBeUndefined();
    expect(computeFinMindMetrics(rows, "etn").limitFlag).toBeUndefined();
    expect(computeFinMindMetrics(rows, "index").limitFlag).toBeUndefined();
    expect(computeFinMindMetrics(rows, "unknown").limitFlag).toBeUndefined();
  });

  it("returns undefined limitFlag for a stock within normal range", () => {
    const metrics = computeFinMindMetrics(
      [priceRow("2026-06-12", 100, 1000), priceRow("2026-06-13", 105, 1200)],
      "stock"
    );

    expect(metrics.limitFlag).toBeUndefined();
  });

  it("computes avgDailyTurnoverTwd from Trading_money over the latest window", () => {
    const rows = [
      priceRow("2026-06-12", 100, 1000, 2e8),
      priceRow("2026-06-13", 100, 1000, 4e8)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.avgDailyTurnoverTwd).toBe(3e8);
    expect(metrics.liquidityTier).toBe("充足");
  });

  it("falls back to close × Trading_Volume when Trading_money is missing", () => {
    const rows = [
      priceRow("2026-06-12", 50, 100000),
      priceRow("2026-06-13", 50, 100000)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.avgDailyTurnoverTwd).toBe(5e6);
    expect(metrics.liquidityTier).toBe("極低");
  });

  it("classifies the 偏低 liquidity tier at the 1e7 boundary", () => {
    const rows = [
      priceRow("2026-06-12", 100, 1000, 1e7),
      priceRow("2026-06-13", 100, 1000, 1e7)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.avgDailyTurnoverTwd).toBe(1e7);
    expect(metrics.liquidityTier).toBe("偏低");
  });

  it("returns undefined turnover and tier when there are no price rows", () => {
    const metrics = computeFinMindMetrics([revenueRow(2026, 5, 1000)], "stock");

    expect(metrics.avgDailyTurnoverTwd).toBeUndefined();
    expect(metrics.liquidityTier).toBeUndefined();
  });

  it("computes revenueYoYPct against the same month of the prior year", () => {
    const rows = [
      revenueRow(2025, 5, 100),
      revenueRow(2026, 4, 120),
      revenueRow(2026, 5, 140)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.revenueYoYPct).toBe(40);
  });

  it("returns undefined revenueYoYPct when the prior-year month is missing", () => {
    const rows = [revenueRow(2026, 4, 120), revenueRow(2026, 5, 140)];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.revenueYoYPct).toBeUndefined();
  });

  it("computes revenueMoMPct against the immediately preceding revenue month", () => {
    const rows = [revenueRow(2026, 4, 100), revenueRow(2026, 5, 125)];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.revenueMoMPct).toBe(25);
  });

  it("returns undefined revenueMoMPct when there is only one revenue month", () => {
    const metrics = computeFinMindMetrics([revenueRow(2026, 5, 125)], "stock");

    expect(metrics.revenueMoMPct).toBeUndefined();
  });

  it("marks isRecentHigh true when latest revenue is at least the max of prior months", () => {
    const rows = [
      revenueRow(2026, 3, 100),
      revenueRow(2026, 4, 120),
      revenueRow(2026, 5, 150)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.isRecentHigh).toBe(true);
  });

  it("marks isRecentHigh false when a prior month was higher", () => {
    const rows = [
      revenueRow(2026, 3, 200),
      revenueRow(2026, 4, 120),
      revenueRow(2026, 5, 150)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics.isRecentHigh).toBe(false);
  });

  it("returns undefined isRecentHigh when there is no prior revenue month", () => {
    const metrics = computeFinMindMetrics([revenueRow(2026, 5, 150)], "stock");

    expect(metrics.isRecentHigh).toBeUndefined();
  });

  it("combines price and revenue rows for one symbol into a single metrics object", () => {
    const rows: FinMindRow[] = [
      priceRow("2026-06-06", 100, 100, 2e8),
      priceRow("2026-06-07", 100, 100, 2e8),
      priceRow("2026-06-08", 100, 100, 2e8),
      priceRow("2026-06-09", 100, 100, 2e8),
      priceRow("2026-06-10", 100, 100, 2e8),
      priceRow("2026-06-13", 110, 300, 4e8),
      revenueRow(2025, 5, 100),
      revenueRow(2026, 4, 120),
      revenueRow(2026, 5, 140)
    ];

    const metrics = computeFinMindMetrics(rows, "stock");

    expect(metrics).toMatchObject({
      priceChangePct: 10,
      volumeRatio: 3,
      limitFlag: "limit_up",
      liquidityTier: "充足",
      revenueYoYPct: 40,
      revenueMoMPct: expect.closeTo(16.67, 2),
      isRecentHigh: true
    });
    expect(metrics.avgDailyTurnoverTwd).toBeGreaterThan(0);
  });

  it("does not mutate the input rows", () => {
    const rows = [priceRow("2026-06-13", 100, 100), priceRow("2026-06-12", 100, 100)];
    const snapshot = JSON.stringify(rows);

    computeFinMindMetrics(rows, "stock");

    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
