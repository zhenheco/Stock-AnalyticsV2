import type { Candidate, FinMindMetrics, SourceKind } from "@stock-analytics/shared";

interface RadarTableProps {
  candidates: Candidate[];
  filters?: RadarFilters;
  onFiltersChange?: (filters: RadarFilters) => void;
  onAddToWatchlist?: (candidate: Candidate) => void;
  watchlistSymbols?: ReadonlySet<string>;
}

export interface RadarFilters {
  minScore: number;
  source: SourceKind | "all";
  tag: string | "all";
  sort: "score" | "latest";
  watchlistOnly: boolean;
}

const DEFAULT_FILTERS: RadarFilters = {
  minScore: 0,
  source: "all",
  tag: "all",
  sort: "score",
  watchlistOnly: false
};

export function RadarTable({ candidates, filters = DEFAULT_FILTERS, onAddToWatchlist, onFiltersChange, watchlistSymbols = new Set() }: RadarTableProps) {
  if (candidates.length === 0) {
    return (
      <section className="empty-state" aria-live="polite">
        <p className="empty-kicker">RADAR IDLE</p>
        <h2>尚無事件候選股</h2>
        <p>等待下一次 ingestion 完成後，這裡會顯示被社群、時事與量價訊號共同推上來的台股。</p>
      </section>
    );
  }

  const visibleCandidates = filterAndSortCandidates(candidates, filters, watchlistSymbols);
  const maxCandidateScore = Math.max(0, ...visibleCandidates.map((candidate) => candidate.score));
  const sources = unique(candidates.flatMap((candidate) => candidate.sources));
  const tags = unique(candidates.flatMap((candidate) => candidate.tags)).sort((left, right) => left.localeCompare(right, "zh-Hant"));

  function updateFilters(next: Partial<RadarFilters>) {
    onFiltersChange?.({ ...filters, ...next });
  }

  return (
    <>
      <div className="radar-controls" aria-label="candidate filters">
        <label>
          <span>最低分數</span>
          <input
            min="0"
            max="10"
            step="0.5"
            type="number"
            value={filters.minScore}
            onChange={(event) => updateFilters({ minScore: Number(event.currentTarget.value) || 0 })}
          />
        </label>
        <label>
          <span>來源</span>
          <select value={filters.source} onChange={(event) => updateFilters({ source: event.currentTarget.value as RadarFilters["source"] })}>
            <option value="all">全部</option>
            {sources.map((source) => <option key={source} value={source}>{source}</option>)}
          </select>
        </label>
        <label>
          <span>事件標籤</span>
          <select value={filters.tag} onChange={(event) => updateFilters({ tag: event.currentTarget.value })}>
            <option value="all">全部</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        </label>
        <label>
          <span>排序</span>
          <select value={filters.sort} onChange={(event) => updateFilters({ sort: event.currentTarget.value as RadarFilters["sort"] })}>
            <option value="score">分數</option>
            <option value="latest">最新事件</option>
          </select>
        </label>
        <label className="checkbox-control">
          <input
            checked={filters.watchlistOnly}
            disabled={watchlistSymbols.size === 0}
            type="checkbox"
            onChange={(event) => updateFilters({ watchlistOnly: event.currentTarget.checked })}
          />
          <span>只看追蹤</span>
        </label>
        <strong>{`顯示 ${visibleCandidates.length} / ${candidates.length}`}</strong>
      </div>
      {visibleCandidates.length === 0 ? (
        <section className="empty-state compact-empty" aria-live="polite">
          <p className="empty-kicker">NO MATCH</p>
          <h2>沒有符合條件的候選股</h2>
        </section>
      ) : (
        <div className="radar-shell">
          <table className="radar-table">
            <thead>
              <tr>
                <th>股票</th>
                <th>分數</th>
                <th>事件</th>
                <th>來源</th>
                <th>標籤</th>
                <th>更新</th>
                <th aria-label="open detail" />
              </tr>
            </thead>
            <tbody>
              {visibleCandidates.map((candidate) => (
                <tr key={candidate.symbol}>
                  <td>
                    <div className="ticker-stack">
                      <strong>
                        {candidate.symbol}
                        {watchlistSymbols.has(candidate.symbol) ? <em>已追蹤</em> : null}
                      </strong>
                      <span>{candidate.name}</span>
                    </div>
                  </td>
                  <td>
                    <div className="score-meter" aria-label={`score ${candidate.score}`}>
                      <span style={{ width: `${scoreMeterWidth(candidate.score, maxCandidateScore)}%` }} />
                      <strong>{candidate.score.toFixed(1)}</strong>
                    </div>
                    {candidate.confidenceScore !== undefined ? <small className="confidence-chip">{`信心 ${candidate.confidenceScore}`}</small> : null}
                    {formatMetricBadges(candidate.metrics).length > 0 ? (
                      <div className="metric-badges" aria-label={`${candidate.symbol} 衍生訊號`}>
                        {formatMetricBadges(candidate.metrics).map((badge) => (
                          <span key={badge.key} className={`metric-badge metric-${badge.key}`}>{badge.label}</span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="event-cell">
                      <strong>{candidate.latestTitle}</strong>
                      <span>{candidate.reason}</span>
                      <div className="evidence-mini">
                        <span>{`${candidate.sourceCount} 來源`}</span>
                        <span>{`${candidate.eventCount} 事件`}</span>
                      </div>
                      {candidate.scoreBreakdown ? (
                        <div className="score-breakdown" aria-label={`${candidate.symbol} score breakdown`}>
                          <span>{`事件強度 ${candidate.scoreBreakdown.eventStrength.toFixed(1)}`}</span>
                          <span>{`來源可信 ${candidate.scoreBreakdown.sourceConfidence.toFixed(1)}`}</span>
                          <span>{`新鮮度 ${candidate.scoreBreakdown.freshness.toFixed(1)}`}</span>
                          <span>{`多源共振 ${candidate.scoreBreakdown.crossSourceBoost.toFixed(1)}`}</span>
                          <span>{`衍生訊號 ${candidate.scoreBreakdown.derivedSignal.toFixed(1)}`}</span>
                          {candidate.scoreBreakdown.watchlistBoost > 0 ? <span>{`追蹤加權 ${candidate.scoreBreakdown.watchlistBoost.toFixed(1)}`}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="source-mix" aria-label={`${candidate.symbol} source mix`}>
                      <div className="source-bar" aria-hidden="true">
                        {sourceMixSegments(candidate).map((segment) => (
                          <span
                            key={segment.source}
                            className={`source-segment source-${segment.source}`}
                            style={{ width: `${segment.percent}%` }}
                          />
                        ))}
                      </div>
                      <div className="source-pills">
                        {sourceMixSegments(candidate).map((segment) => (
                          <span key={segment.source}>{`${segment.label} ${segment.count}`}</span>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="tag-list">
                      {candidate.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  </td>
                  <td>{formatTime(candidate.latestAt)}</td>
                  <td>
                    <div className="candidate-actions">
                      <a className="detail-link" href={`/stock/${candidate.symbol}`}>研究</a>
                      {onAddToWatchlist && !watchlistSymbols.has(candidate.symbol) ? (
                        <button type="button" onClick={() => onAddToWatchlist(candidate)}>加入追蹤</button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export interface SourceMixSegment {
  source: SourceKind;
  label: string;
  count: number;
  percent: number;
}

export interface MetricBadge {
  key: string;
  label: string;
}

export function formatMetricBadges(metrics: FinMindMetrics | undefined): MetricBadge[] {
  if (!metrics) {
    return [];
  }
  const badges: MetricBadge[] = [];
  if (metrics.revenueYoYPct !== undefined) {
    badges.push({ key: "revenueYoY", label: `YoY ${formatSignedPct(metrics.revenueYoYPct)}` });
  }
  if (metrics.volumeRatio !== undefined) {
    badges.push({ key: "volumeRatio", label: `量比 ${metrics.volumeRatio.toFixed(1)}x` });
  }
  if (metrics.priceChangePct !== undefined) {
    badges.push({ key: "priceChange", label: `漲跌 ${formatSignedPct(metrics.priceChangePct)}` });
  }
  if (metrics.liquidityTier !== undefined) {
    badges.push({ key: "liquidity", label: `流動性 ${metrics.liquidityTier}` });
  }
  return badges;
}

export function scoreMeterWidth(score: number, maxCandidateScore: number): number {
  if (maxCandidateScore <= 0) {
    return 0;
  }
  return Math.round((score / maxCandidateScore) * 100);
}

const SOURCE_LABELS: Record<SourceKind, string> = {
  ptt: "PTT",
  rss: "RSS",
  finmind: "FinMind",
  twse: "TWSE",
  mops: "MOPS"
};

export function sourceMixSegments(candidate: Candidate): SourceMixSegment[] {
  const counts = candidate.sourceEventCounts ?? fallbackSourceEventCounts(candidate);
  const total = Math.max(1, sum(candidate.sources.map((source) => counts[source] ?? 0)));
  return candidate.sources
    .map((source) => ({
      source,
      label: SOURCE_LABELS[source],
      count: counts[source] ?? 0,
      percent: Math.round(((counts[source] ?? 0) / total) * 100)
    }))
    .filter((segment) => segment.count > 0);
}

export function filterAndSortCandidates(candidates: Candidate[], filters: RadarFilters, watchlistSymbols: ReadonlySet<string> = new Set()): Candidate[] {
  return candidates
    .filter((candidate) => candidate.score >= filters.minScore)
    .filter((candidate) => filters.source === "all" || candidate.sources.includes(filters.source))
    .filter((candidate) => filters.tag === "all" || candidate.tags.includes(filters.tag))
    .filter((candidate) => !filters.watchlistOnly || watchlistSymbols.has(candidate.symbol))
    .sort((left, right) => {
      if (filters.sort === "latest") {
        return right.latestAt.localeCompare(left.latestAt);
      }
      return right.score - left.score || right.latestAt.localeCompare(left.latestAt);
    });
}

function fallbackSourceEventCounts(candidate: Candidate): Partial<Record<SourceKind, number>> {
  const firstSource = candidate.sources[0];
  if (candidate.sources.length === 1 && firstSource) {
    return { [firstSource]: candidate.eventCount };
  }
  return Object.fromEntries(candidate.sources.map((source) => [source, 1])) as Partial<Record<SourceKind, number>>;
}

function sum(items: number[]): number {
  return items.reduce((total, value) => total + value, 0);
}

function formatSignedPct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
