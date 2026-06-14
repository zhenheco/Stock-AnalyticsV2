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
});
