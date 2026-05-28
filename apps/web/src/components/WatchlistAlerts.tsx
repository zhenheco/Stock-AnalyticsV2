import type { Candidate, WatchlistEntry } from "@stock-analytics/shared";

export interface WatchlistAlert {
  symbol: string;
  name: string;
  score: number;
  latestAt: string;
  latestTitle: string;
  isNewEvent: boolean;
  thresholdHit: boolean;
  alertThreshold?: number;
  note?: string;
  tags: string[];
}

interface WatchlistAlertsProps {
  entries: WatchlistEntry[];
  candidates: Candidate[];
}

export function WatchlistAlerts({ entries, candidates }: WatchlistAlertsProps) {
  const alerts = watchlistAlerts(entries, candidates);

  return (
    <section className="watchlist-alerts">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Watchlist</p>
          <h2>追蹤提醒</h2>
        </div>
        <span>{alerts.length > 0 ? `${alerts.length} 個提醒` : "無提醒"}</span>
      </div>
      {alerts.length === 0 ? <p className="muted">追蹤清單目前沒有新事件或達門檻標的。</p> : null}
      {alerts.length > 0 ? (
        <div className="watchlist-alert-grid">
          {alerts.map((alert) => (
            <article className="watchlist-alert-card" key={alert.symbol}>
              <header>
                <a href={`/stock/${alert.symbol}`}>
                  <strong>{alert.symbol}</strong>
                  <span>{alert.name}</span>
                </a>
                <time>{formatTime(alert.latestAt)}</time>
              </header>
              <div className="alert-badges">
                {alert.thresholdHit && typeof alert.alertThreshold === "number" ? <span>{`分數 ${formatScore(alert.score)} 已達門檻 ${formatScore(alert.alertThreshold)}`}</span> : null}
                {alert.isNewEvent ? <span>有新事件</span> : null}
              </div>
              <p>{alert.latestTitle}</p>
              {alert.note ? <small>{alert.note}</small> : null}
              {alert.tags.length > 0 ? (
                <div className="tag-list">
                  {alert.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function watchlistAlerts(entries: WatchlistEntry[], candidates: Candidate[]): WatchlistAlert[] {
  const candidateBySymbol = new Map(candidates.map((candidate) => [candidate.symbol, candidate]));
  return entries
    .flatMap((entry) => {
      const candidate = candidateBySymbol.get(entry.symbol);
      if (!candidate) {
        return [];
      }
      const thresholdHit = typeof entry.alertThreshold === "number" && candidate.score >= entry.alertThreshold;
      const isNewEvent = entry.lastSeenEventAt ? new Date(candidate.latestAt).getTime() > new Date(entry.lastSeenEventAt).getTime() : false;
      if (!thresholdHit && !isNewEvent) {
        return [];
      }
      return [
        {
          symbol: entry.symbol,
          name: entry.name || candidate.name,
          score: candidate.score,
          latestAt: candidate.latestAt,
          latestTitle: candidate.latestTitle,
          isNewEvent,
          thresholdHit,
          alertThreshold: entry.alertThreshold,
          note: entry.note,
          tags: [...(entry.tags ?? []), ...candidate.tags].filter(unique)
        }
      ];
    })
    .sort((left, right) => Number(right.thresholdHit) - Number(left.thresholdHit) || Number(right.isNewEvent) - Number(left.isNewEvent) || right.score - left.score);
}

function unique(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function formatScore(value: number): string {
  return value.toFixed(1);
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
