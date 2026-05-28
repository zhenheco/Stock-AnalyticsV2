import type { DailySnapshot } from "@stock-analytics/shared";

interface SnapshotPanelProps {
  snapshots: DailySnapshot[];
}

export function SnapshotPanel({ snapshots }: SnapshotPanelProps) {
  const latest = snapshots[0];
  if (!latest) {
    return (
      <section className="snapshot-panel">
        <div className="section-title compact-title">
          <div>
            <p className="eyebrow">Daily Drift</p>
            <h2>今日異動</h2>
          </div>
        </div>
        <p className="muted">尚未建立每日快照。</p>
      </section>
    );
  }

  return (
    <section className="snapshot-panel">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Daily Drift</p>
          <h2>今日異動</h2>
        </div>
        <time>{formatTime(latest.createdAt)}</time>
      </div>
      <div className="snapshot-grid">
        <article>
          <span>雷達候選</span>
          <strong>{latest.candidateCount}</strong>
          <p>{`Top ${latest.topSymbols.slice(0, 5).join("、") || "尚無"}`}</p>
        </article>
        <article>
          <span>新浮現</span>
          <strong>{latest.drift.newSymbols.length}</strong>
          <p>{latest.drift.newSymbols.length > 0 ? `新浮現 ${latest.drift.newSymbols.join("、")}` : "沒有新浮現股票"}</p>
        </article>
        <article>
          <span>跌出雷達</span>
          <strong>{latest.drift.droppedSymbols.length}</strong>
          <p>{latest.drift.droppedSymbols.length > 0 ? `跌出雷達 ${latest.drift.droppedSymbols.join("、")}` : "沒有跌出前段名單"}</p>
        </article>
        <article>
          <span>分數變化</span>
          <strong>{latest.drift.scoreChanges.length}</strong>
          <p>{latest.drift.scoreChanges.length > 0 ? latest.drift.scoreChanges.map(formatScoreChange).join("、") : "沒有明顯變化"}</p>
        </article>
      </div>
    </section>
  );
}

function formatScoreChange(change: DailySnapshot["drift"]["scoreChanges"][number]): string {
  const sign = change.delta >= 0 ? "+" : "";
  return `${change.symbol} ${sign}${change.delta.toFixed(1)}`;
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
