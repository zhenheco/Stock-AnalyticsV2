import { FormEvent, useState } from "react";

interface AdminRefreshPanelProps {
  onRefresh: (adminToken: string) => Promise<{ candidateCount: number }>;
}

type RefreshState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "success"; candidateCount: number }
  | { status: "error"; message: string };

export function AdminRefreshPanel({ onRefresh }: AdminRefreshPanelProps) {
  const [adminToken, setAdminToken] = useState("");
  const [state, setState] = useState<RefreshState>({ status: "idle" });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = adminToken.trim();
    if (!token) {
      setState({ status: "error", message: "請輸入 Admin token" });
      return;
    }

    setState({ status: "running" });
    try {
      const result = await onRefresh(token);
      setState({ status: "success", candidateCount: result.candidateCount });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "同步失敗" });
    }
  }

  return (
    <section className="admin-refresh">
      <div>
        <p className="eyebrow">Admin</p>
        <h2>手動同步</h2>
        <p>立即觸發 Worker ingestion，適合剛更新 token、watchlist 或想確認資料源狀態時使用。</p>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          <span>Admin token</span>
          <input
            autoComplete="off"
            inputMode="text"
            onChange={(event) => setAdminToken(event.currentTarget.value)}
            placeholder="貼上本機 1Password 取出的 token"
            type="password"
            value={adminToken}
          />
        </label>
        <button type="submit" disabled={state.status === "running"}>
          {state.status === "running" ? "同步中" : "同步資料"}
        </button>
      </form>
      {state.status === "success" ? <p className="refresh-result">{`已更新候選股 ${state.candidateCount} 檔`}</p> : null}
      {state.status === "error" ? <p className="refresh-error">{state.message}</p> : null}
    </section>
  );
}
