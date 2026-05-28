export function FriendTest() {
  return (
    <main>
      <header className="hero-band compact">
        <nav>
          <a href="/">雷達</a>
          <a href="/friend-test">朋友測試</a>
          <a href="/watchlist">追蹤清單</a>
        </nav>
        <div className="hero-grid">
          <div>
            <p className="eyebrow">PUBLIC TEST</p>
            <h1>朋友測試入口</h1>
            <p>不用登入。請用唯讀方式測試事件雷達、股票研究頁和資料說明是否看得懂；不要填管理 Token。</p>
          </div>
          <div className="status-board" aria-label="friend test status">
            <span>測試模式</span>
            <strong>唯讀</strong>
            <span>管理 Token</span>
            <strong>不要填</strong>
            <span>回饋重點</span>
            <strong>清楚度</strong>
          </div>
        </div>
      </header>

      <section className="content-band friend-test-page">
        <section className="friend-test-panel">
          <div className="section-title compact-title">
            <div>
              <p className="eyebrow">Checklist</p>
              <h2>測試任務</h2>
            </div>
          </div>
          <div className="friend-test-grid">
            <article>
              <span>01</span>
              <h3>打開事件雷達</h3>
              <p>看首頁是否能快速理解今天有哪些股票浮上來，以及每檔股票為什麼被選出。</p>
              <a className="detail-link" href="/">開始看雷達</a>
            </article>
            <article>
              <span>02</span>
              <h3>查看一檔股票研究頁</h3>
              <p>從候選表點「研究」，檢查事件列表、來源、時間和 TradingView 外部圖表是否足夠清楚。</p>
              <a className="detail-link" href="/stock/2330">範例：2330</a>
            </article>
            <article>
              <span>03</span>
              <h3>檢查資料可信度</h3>
              <p>看資料健康度、接線狀態、今日異動，回報哪一段最難理解或看起來不像研究工具。</p>
              <a className="detail-link" href="/#source-health">回首頁檢查</a>
            </article>
          </div>
        </section>

        <section className="friend-test-panel">
          <div className="section-title compact-title">
            <div>
              <p className="eyebrow">Feedback</p>
              <h2>請朋友回報這幾點</h2>
            </div>
          </div>
          <ul className="friend-feedback-list">
            <li>第一眼是否知道這是「研究雷達」，不是買賣建議。</li>
            <li>候選股排序和分數是否能讓人理解優先順序。</li>
            <li>股票研究頁是否能解釋「為什麼它浮上來」。</li>
            <li>有沒有看不懂的詞、資料來源，或會誤會成操作建議的地方。</li>
            <li>手機版是否容易掃描和點擊。</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
