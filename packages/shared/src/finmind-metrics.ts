import type { FinMindMetrics, FinMindRow, SecurityType } from "./types";

export function computeFinMindMetrics(rows: FinMindRow[], securityType: SecurityType): FinMindMetrics {
  void securityType;
  const priceRows = sortedPriceRows(rows);
  const priceChangePct = computePriceChangePct(priceRows);

  return {
    ...(priceChangePct === undefined ? {} : { priceChangePct })
  };
}

function sortedPriceRows(rows: FinMindRow[]): FinMindRow[] {
  return rows
    .filter((row) => finiteNumber(row.close))
    .slice()
    .sort((left, right) => (left.date ?? "").localeCompare(right.date ?? ""));
}

function computePriceChangePct(priceRows: FinMindRow[]): number | undefined {
  if (priceRows.length < 2) {
    return undefined;
  }
  const today = priceRows[priceRows.length - 1];
  const prev = priceRows[priceRows.length - 2];
  const close = today?.close;
  const closePrev = prev?.close;
  if (!finiteNumber(close) || !finiteNumber(closePrev) || closePrev === 0) {
    return undefined;
  }
  return round2(((close - closePrev) / closePrev) * 100);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
