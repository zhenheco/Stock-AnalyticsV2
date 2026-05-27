import type { DataReadiness, ReadinessStatus } from "@stock-analytics/shared";

interface DataReadinessPanelProps {
  readiness: DataReadiness;
}

export function DataReadinessPanel({ readiness }: DataReadinessPanelProps) {
  return (
    <section className="readiness-panel">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Data Readiness</p>
          <h2>資料接線狀態</h2>
        </div>
        <strong className={`readiness-badge ${readiness.status}`}>{statusLabel(readiness.status)}</strong>
      </div>
      <div className="readiness-counts">
        <span>{`候選 ${readiness.counts.candidates}`}</span>
        <span>{`主檔 ${readiness.counts.universe}`}</span>
        <span>{`追蹤 ${readiness.counts.watchlist}`}</span>
      </div>
      <div className="readiness-checks">
        {readiness.checks.map((check) => (
          <article key={check.id} className={`readiness-check ${check.status}`}>
            <strong>{check.label}</strong>
            <span>{statusLabel(check.status)}</span>
            <p>{check.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function statusLabel(status: ReadinessStatus): string {
  if (status === "ready") {
    return "就緒";
  }
  if (status === "degraded") {
    return "降級";
  }
  return "缺口";
}
