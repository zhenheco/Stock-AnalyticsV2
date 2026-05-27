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
            <SourceHealthCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </section>
  );
}

function SourceHealthCard({ run }: { run: SourceRun }) {
  const advice = sourceRunAdvice(run);

  return (
    <article className={`health-card ${run.status}`}>
      <div className="health-card-top">
        <span>{run.source}</span>
        <time>{`最新 ${formatTime(run.startedAt)}`}</time>
      </div>
      <strong>{labelStatus(run.status)}</strong>
      <small>{`${run.itemCount} 筆`}</small>
      {run.message ? <p>{run.message}</p> : null}
      {advice ? <p className="health-advice">{advice}</p> : null}
    </article>
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

export function sourceRunAdvice(run: SourceRun): string | null {
  if (run.source === "finmind" && run.status === "partial" && run.message?.includes("anonymous limited price/chip")) {
    return "FinMind 價格、籌碼與營收已用免 token 降級模式接通；設定 token 可提高額度穩定性。";
  }
  if (run.source === "finmind" && run.status === "partial" && run.message?.includes("FINMIND_TOKEN")) {
    return "FinMind token 尚未設定，價格、籌碼與營收資料暫停；股票主檔仍會更新。";
  }
  if (run.source === "rss" && run.status !== "ok") {
    return "RSS 來源暫時不完整，系統會保留已取得內容並在下一次排程重試。";
  }
  if (run.source === "ptt" && run.status === "failed") {
    return "PTT 可能暫時限流或連線失敗，下一次排程會自動重試。";
  }
  return null;
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
