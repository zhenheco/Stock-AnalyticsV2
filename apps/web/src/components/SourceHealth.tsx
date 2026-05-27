import type { SourceRun } from "@stock-analytics/shared";

interface SourceHealthProps {
  runs: SourceRun[];
}

export function SourceHealth({ runs }: SourceHealthProps) {
  return (
    <section className="source-health">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Source Health</p>
          <h2>資料健康度</h2>
        </div>
      </div>
      {runs.length === 0 ? (
        <p className="muted">尚未有資料來源執行紀錄。</p>
      ) : (
        <div className="health-grid">
          {runs.map((run) => (
            <article className={`health-card ${run.status}`} key={run.id}>
              <span>{run.source}</span>
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

function labelStatus(status: SourceRun["status"]): string {
  if (status === "ok") {
    return "正常";
  }
  if (status === "partial") {
    return "部分";
  }
  return "失敗";
}
