import type { Candidate } from "@stock-analytics/shared";

interface RadarTableProps {
  candidates: Candidate[];
}

export function RadarTable({ candidates }: RadarTableProps) {
  if (candidates.length === 0) {
    return (
      <section className="empty-state" aria-live="polite">
        <p className="empty-kicker">RADAR IDLE</p>
        <h2>尚無事件候選股</h2>
        <p>等待下一次 ingestion 完成後，這裡會顯示被社群、時事與量價訊號共同推上來的台股。</p>
      </section>
    );
  }

  return (
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
          {candidates.map((candidate) => (
            <tr key={candidate.symbol}>
              <td>
                <div className="ticker-stack">
                  <strong>{candidate.symbol}</strong>
                  <span>{candidate.name}</span>
                </div>
              </td>
              <td>
                <div className="score-meter" aria-label={`score ${candidate.score}`}>
                  <span style={{ width: `${Math.min(100, candidate.score * 10)}%` }} />
                  <strong>{candidate.score.toFixed(1)}</strong>
                </div>
              </td>
              <td>
                <div className="event-cell">
                  <strong>{candidate.latestTitle}</strong>
                  <span>{candidate.reason}</span>
                </div>
              </td>
              <td>
                <div className="source-pills">
                  {candidate.sources.map((source) => <span key={source}>{source}</span>)}
                </div>
              </td>
              <td>
                <div className="tag-list">
                  {candidate.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </td>
              <td>{formatTime(candidate.latestAt)}</td>
              <td>
                <a className="detail-link" href={`/stock/${candidate.symbol}`}>研究</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
