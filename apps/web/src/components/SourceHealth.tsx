import type { SourceRun } from "@stock-analytics/shared";

interface SourceHealthProps {
  runs: SourceRun[];
}

export function SourceHealth({ runs }: SourceHealthProps) {
  const latestRuns = latestRunsBySource(runs);

  return (
    <section className="source-health">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Source Health</p>
          <h2>資料健康度</h2>
        </div>
      </div>
      {latestRuns.length === 0 ? (
        <p className="muted">尚未有資料來源執行紀錄。</p>
      ) : (
        <div className="health-grid">
          {latestRuns.map((run) => (
            <article className={`health-card ${run.status}`} key={run.id}>
              <div className="health-card-top">
                <span>{run.source}</span>
                <time>{`最新 ${formatTime(run.startedAt)}`}</time>
              </div>
              <strong>{labelStatus(run.status)}</strong>
              <small>{`${run.itemCount} 筆`}</small>
              {run.message ? <p>{run.message}</p> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function latestRunsBySource(runs: SourceRun[]): SourceRun[] {
  const bySource = new Map<SourceRun["source"], SourceRun>();
  for (const run of runs) {
    const current = bySource.get(run.source);
    if (!current || run.startedAt > current.startedAt) {
      bySource.set(run.source, run);
    }
  }
  return [...bySource.values()].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
}

function labelStatus(status: SourceRun["status"]): string {
  if (status === "ok") {
    return "正常";
  }
  if (status === "partial") {
    return "部分";
  }
  return "失敗";
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
