import type { FinMindMetrics, FinMindRow, SecurityType } from "./types";

const MAX_VOLUME_WINDOW = 20;
const MIN_VOLUME_PRIOR = 5;

export function computeFinMindMetrics(rows: FinMindRow[], securityType: SecurityType): FinMindMetrics {
  void securityType;
  const priceRows = sortedPriceRows(rows);
  const priceChangePct = computePriceChangePct(priceRows);
  const volumeRatio = computeVolumeRatio(priceRows);

  return {
    ...(priceChangePct === undefined ? {} : { priceChangePct }),
    ...(volumeRatio === undefined ? {} : { volumeRatio })
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

function computeVolumeRatio(priceRows: FinMindRow[]): number | undefined {
  if (priceRows.length < 2) {
    return undefined;
  }
  const today = priceRows[priceRows.length - 1];
  const todayVolume = today?.Trading_Volume;
  if (!finiteNumber(todayVolume)) {
    return undefined;
  }
  const prior = priceRows
    .slice(0, priceRows.length - 1)
    .slice(-MAX_VOLUME_WINDOW)
    .map((row) => row.Trading_Volume)
    .filter(finiteNumber);
  if (prior.length < MIN_VOLUME_PRIOR) {
    return undefined;
  }
  const meanVolume = mean(prior);
  if (meanVolume === 0) {
    return undefined;
  }
  return round1(todayVolume / meanVolume);
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
