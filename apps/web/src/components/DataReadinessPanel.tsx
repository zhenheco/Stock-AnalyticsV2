import type { DataReadiness, ReadinessStatus } from "@stock-analytics/shared";

interface DataReadinessPanelProps {
  readiness: DataReadiness;
}

export function DataReadinessPanel({ readiness }: DataReadinessPanelProps) {
  const summary = summarizeReadiness(readiness);

  return (
    <section className="readiness-panel">
      <div className="section-title compact-title">
        <div>
          <p className="eyebrow">Data Readiness</p>
          <h2>資料接線狀態</h2>
        </div>
        <strong className={`readiness-badge ${readiness.status}`}>{statusLabel(readiness.status)}</strong>
      </div>
      <div className="readiness-summary">
        <article>
          <span>完成度</span>
          <strong>{`${summary.completionPercent}%`}</strong>
          <p>{`${summary.readyCount} / ${summary.totalCount} 項就緒`}</p>
        </article>
        <article>
          <span>目前缺口</span>
          <strong>{summary.blockers.length > 0 ? summary.blockers.join("、") : "無"}</strong>
          <p>{summary.blockers.length > 0 ? "系統仍可用降級模式產出候選股" : "資料管線已全部就緒"}</p>
        </article>
        <article>
          <span>下一步</span>
          <strong>{summary.nextAction}</strong>
          <p>{readiness.updatedAt ? `更新 ${formatTime(readiness.updatedAt)}` : "等待首次資料同步"}</p>
        </article>
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

export interface ReadinessSummary {
  readyCount: number;
  totalCount: number;
  completionPercent: number;
  blockers: string[];
  nextAction: string;
}

export function summarizeReadiness(readiness: DataReadiness): ReadinessSummary {
  const totalCount = readiness.checks.length;
  const readyCount = readiness.checks.filter((check) => check.status === "ready").length;
  const blockers = readiness.checks
    .filter((check) => check.status !== "ready")
    .map((check) => check.label);

  return {
    readyCount,
    totalCount,
    completionPercent: totalCount === 0 ? 0 : Math.round((readyCount / totalCount) * 100),
    blockers,
    nextAction: nextReadinessAction(readiness)
  };
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

function nextReadinessAction(readiness: DataReadiness): string {
  const finmind = readiness.checks.find((check) => check.id === "finmind-signals" && check.status !== "ready");
  if (finmind) {
    return "補上 FINMIND_TOKEN 後同步 Cloudflare secret";
  }
  const social = readiness.checks.find((check) => check.id === "social-events" && check.status !== "ready");
  if (social) {
    return "檢查 PTT/RSS 排程與來源連線";
  }
  const missing = readiness.checks.find((check) => check.status !== "ready");
  return missing ? `處理 ${missing.label}` : "維持排程同步";
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
