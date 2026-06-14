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
});
