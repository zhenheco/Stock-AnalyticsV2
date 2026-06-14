import type { FinMindMetrics, FinMindRow, SecurityType } from "./types";

const MAX_VOLUME_WINDOW = 20;
const MIN_VOLUME_PRIOR = 5;
const LIMIT_THRESHOLD_PCT = 9.5;
const MAX_TURNOVER_WINDOW = 20;
const LIQUIDITY_HIGH_TWD = 1e8;
const LIQUIDITY_MID_TWD = 1e7;
const MAX_RECENT_REVENUE_WINDOW = 3;

export function computeFinMindMetrics(rows: FinMindRow[], securityType: SecurityType): FinMindMetrics {
  const priceRows = sortedPriceRows(rows);
  const priceChangePct = computePriceChangePct(priceRows);
  const volumeRatio = computeVolumeRatio(priceRows);
  const limitFlag = computeLimitFlag(priceChangePct, securityType);
  const avgDailyTurnoverTwd = computeAvgDailyTurnoverTwd(priceRows);
  const liquidityTier = computeLiquidityTier(avgDailyTurnoverTwd);
  const revenueRows = sortedRevenueRows(rows);
  const revenueYoYPct = computeRevenueYoYPct(revenueRows);
  const revenueMoMPct = computeRevenueMoMPct(revenueRows);
  const isRecentHigh = computeIsRecentHigh(revenueRows);

  return {
    ...(priceChangePct === undefined ? {} : { priceChangePct }),
    ...(volumeRatio === undefined ? {} : { volumeRatio }),
    ...(limitFlag === undefined ? {} : { limitFlag }),
    ...(avgDailyTurnoverTwd === undefined ? {} : { avgDailyTurnoverTwd }),
    ...(liquidityTier === undefined ? {} : { liquidityTier }),
    ...(revenueYoYPct === undefined ? {} : { revenueYoYPct }),
    ...(revenueMoMPct === undefined ? {} : { revenueMoMPct }),
    ...(isRecentHigh === undefined ? {} : { isRecentHigh })
  };
}

function sortedPriceRows(rows: FinMindRow[]): FinMindRow[] {
  return rows
    .filter((row) => finiteNumber(row.close))
    .slice()
    .sort((left, right) => (left.date ?? "").localeCompare(right.date ?? ""));
}

function sortedRevenueRows(rows: FinMindRow[]): FinMindRow[] {
  return rows
    .filter((row) => finiteNumber(row.revenue) && finiteNumber(row.revenue_year) && finiteNumber(row.revenue_month))
    .slice()
    .sort((left, right) => revenueKey(left) - revenueKey(right));
}

function revenueKey(row: FinMindRow): number {
  return (row.revenue_year ?? 0) * 100 + (row.revenue_month ?? 0);
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

function computeLimitFlag(
  priceChangePct: number | undefined,
  securityType: SecurityType
): "limit_up" | "limit_down" | undefined {
  if (securityType !== "stock" || priceChangePct === undefined) {
    return undefined;
  }
  if (priceChangePct >= LIMIT_THRESHOLD_PCT) {
    return "limit_up";
  }
  if (priceChangePct <= -LIMIT_THRESHOLD_PCT) {
    return "limit_down";
  }
  return undefined;
}

function computeAvgDailyTurnoverTwd(priceRows: FinMindRow[]): number | undefined {
  const turnovers = priceRows
    .slice(-MAX_TURNOVER_WINDOW)
    .map(rowTurnover)
    .filter(finiteNumber);
  if (turnovers.length === 0) {
    return undefined;
  }
  return mean(turnovers);
}

function rowTurnover(row: FinMindRow): number | undefined {
  if (finiteNumber(row.Trading_money)) {
    return row.Trading_money;
  }
  if (finiteNumber(row.close) && finiteNumber(row.Trading_Volume)) {
    return row.close * row.Trading_Volume;
  }
  return undefined;
}

function computeLiquidityTier(turnover: number | undefined): "充足" | "偏低" | "極低" | undefined {
  if (turnover === undefined) {
    return undefined;
  }
  if (turnover >= LIQUIDITY_HIGH_TWD) {
    return "充足";
  }
  if (turnover >= LIQUIDITY_MID_TWD) {
    return "偏低";
  }
  return "極低";
}

function computeRevenueYoYPct(revenueRows: FinMindRow[]): number | undefined {
  const latest = revenueRows[revenueRows.length - 1];
  if (!latest) {
    return undefined;
  }
  const prior = revenueRows.find(
    (row) => row.revenue_year === (latest.revenue_year ?? 0) - 1 && row.revenue_month === latest.revenue_month
  );
  const latestRevenue = latest.revenue;
  const priorRevenue = prior?.revenue;
  if (!finiteNumber(latestRevenue) || !finiteNumber(priorRevenue) || priorRevenue === 0) {
    return undefined;
  }
  return round2(((latestRevenue - priorRevenue) / priorRevenue) * 100);
}

function computeRevenueMoMPct(revenueRows: FinMindRow[]): number | undefined {
  if (revenueRows.length < 2) {
    return undefined;
  }
  const latest = revenueRows[revenueRows.length - 1];
  const prev = revenueRows[revenueRows.length - 2];
  const latestRevenue = latest?.revenue;
  const prevRevenue = prev?.revenue;
  if (!finiteNumber(latestRevenue) || !finiteNumber(prevRevenue) || prevRevenue === 0) {
    return undefined;
  }
  return round2(((latestRevenue - prevRevenue) / prevRevenue) * 100);
}

function computeIsRecentHigh(revenueRows: FinMindRow[]): boolean | undefined {
  if (revenueRows.length < 2) {
    return undefined;
  }
  const latest = revenueRows[revenueRows.length - 1];
  const latestRevenue = latest?.revenue;
  if (!finiteNumber(latestRevenue)) {
    return undefined;
  }
  const prior = revenueRows
    .slice(0, revenueRows.length - 1)
    .slice(-MAX_RECENT_REVENUE_WINDOW)
    .map((row) => row.revenue)
    .filter(finiteNumber);
  if (prior.length === 0) {
    return undefined;
  }
  return latestRevenue >= Math.max(...prior);
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
