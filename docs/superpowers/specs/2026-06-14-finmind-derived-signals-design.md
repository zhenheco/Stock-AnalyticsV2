# FinMind 衍生訊號（相對化） — SPEC

> `/go` 唯一輸入。內容已經 brainstorming + 對抗式驗證（1 blocker + 4 major + minors 全修）。
> prd_id = `2026-06-14-finmind-derived-signals`。

---

## Problem Statement

每天早上掃雷達時，候選股只給絕對數字：月營收顯示「5.2 億」、價格事件顯示「close X volume Y」。創新高的月營收和雪崩的月營收長得一模一樣；成交量天生大的大型股（2330/2317 級）永遠排在最上面，而一檔剛爆量突破的小型股卻沉在下面。我看不出相對變化（YoY、量是均量幾倍、漲跌幅），也看不出這檔到底吃不吃得下我的量（流動性）。結果雷達一直推我「本來就在看的大型股」，不是新點子 — 與 discovery 工具的目的相反。

## Solution

雷達在每列候選股與個股研究頁顯示**衍生/相對訊號 badge**：月營收 YoY%/MoM% + 「近 N 月高」旗標、價格漲跌幅、量比（vs 20 日均量）、漲停/跌停旗標、流動性 tier（充足/偏低/極低）。這些相對訊號**驅動排名**（取代原始 volume / 絕對營收主導），讓「+40% YoY 小型股」或「3x 量突破」能浮到量大但安靜的大型股之上；同時與既有 news/官方訊號**同量級競合、不輾壓**。全部以研究 context 呈現，非買賣建議。

## User Stories

1. As a researcher, I want each candidate's monthly revenue shown as YoY%/MoM% with a 「近 N 月高」 flag, so I spot growth instead of size.
2. As a researcher, I want price events shown as %-change plus 量比 (volume vs 20-day avg) with a 漲停/跌停 flag, so abnormal moves surface.
3. As a researcher, I want a liquidity tier badge (充足/偏低/極低) per name, so I know if it is tradeable before researching.
4. As a researcher, I want these derived signals to drive the score, so high-YoY / high-量比 small-caps rank above quiet large-caps.
5. As a researcher, I want the derived signal to compete with (not overwhelm) news/official signals, so ranking stays balanced.
6. As a researcher, I want the score-meter bar to stay discriminating (not all clamped to 100%) after the scoring change.
7. As a researcher, I want the score-breakdown panel to show the new derivedSignal component, so I understand why a name ranks.
8. As a researcher, I want the stock-detail page to show derived-metric chips per event.
9. (edge) As a researcher, when a name lacks enough history (price < 2 days, volume prior segment < 5 days, no prior-year revenue month), I want the badge hidden — not shown as N/A or 0.
10. (edge) As a researcher, for ETF/ETN/index symbols I want NO 漲停/跌停 flag (they have no ±10% limit), so I am not misled.
11. (integrity) As an operator, I want derived metrics to persist so a re-score (`/api/admin/run-score`, which re-reads stored events) keeps the badges.
12. (integrity) As an operator, I want existing D1 rows without metrics to keep loading (backward compatible).
13. (integrity) As an operator, when FinMind anonymous mode lacks Trading_money, I want turnover to fall back to close×volume so liquidity still computes.
14. (perf) As an operator, I want the widened fetch windows to stay within FinMind quota and Worker cron wall-time.

## Modules

| Module | 職責（一句） | 公開介面（窄） | 新建/修改 |
|---|---|---|---|
| `packages/shared/src/finmind-metrics.ts` | 從同 symbol 多日 rows 算衍生指標 | `computeFinMindMetrics(rows, securityType) -> FinMindMetrics` | 新建 |
| `packages/shared/src/types.ts` | 型別 | 加 `FinMindMetrics`、`EventRecord.metrics?`、`Candidate.metrics?`、`ScoreBreakdown.derivedSignal`、`SourceEvent.metrics?`、`FinMindRow.Trading_money?` | 修改 |
| `packages/shared/src/parsers.ts` | `normalizeFinMindRows`：價格/營收 group→摘要 event；籌碼維持逐 row | 既有簽名 + `securityTypes` map 參數 | 修改 |
| `packages/shared/src/scoring.ts` | `derivedSignal` 元件 + FinMind engagement=0 效果 + `Candidate.metrics` 聚合 | `scoreCandidates`（既有） | 修改 |
| `apps/worker/src/sources/live.ts` | 加寬 price(now-45)/revenue(now-430) 窗 + 截窗 | `fetchLiveSources`（既有） | 修改 |
| `apps/worker/src/ingest.ts` | metrics 透傳 + `isStoredEventStillSupported` 改判 + `classifyEvent` 衍生 tag | 既有 | 修改 |
| `apps/worker/src/repository/d1.ts` (+ migration 0007) | `metrics_json` 讀寫 | 既有 | 修改 |
| `apps/worker/src/repository/memory.ts` | metrics 隨物件保存（驗證） | 既有 | 修改 |
| `apps/web/src/components/RadarTable.tsx` | badge + score-meter rebase + breakdown derivedSignal | 既有 | 修改 |
| `apps/web/src/pages/StockDetail.tsx` | event.metrics chips | 既有 | 修改 |

## Implementation Decisions

- **Schema**：D1 migration `0007_finmind_metrics.sql` — `ALTER TABLE events ADD COLUMN metrics_json TEXT;` + `ALTER TABLE candidates ADD COLUMN metrics_json TEXT;`（nullable、向後相容，舊 row NULL）。`ScoreBreakdown.derivedSignal` 搭既有 `score_breakdown_json`，無需新 column。
- **API contract**：無新 endpoint。`/api/candidates` 的 candidate、`/api/stocks/:symbol/research` 的 event 各多 optional `metrics`。
- **架構決策**：採 Approach A（結構化 metrics 欄位 + 獨立 `finmind-metrics` module）。否決 B（解 title 字串 — 脆弱、違反 no-string-parsing）與 C（算完不持久化 — re-score 重讀 stored events 會算不出）。衍生量級**只**走新 `derivedSignal` 元件；FinMind 價格/營收摘要 event `engagement = 0`（同時避免雙重計分 + 消除原始 volume 輾壓）。`derivedSignal` rescaled 公式使強訊號落 ~3-6（最高 ~9.5），與 eventStrength(~1.5-3)+sourceConfidence×1.8 同量級競合，不輾壓。
- **第三方/整合**：FinMind — 價格窗加寬 now-45 天、營收 now-430 天（HTTP call 數不變，只 payload 變大；計算前 code 內截窗護 Worker 記憶體）。`FinMindRow` 加 optional `Trading_money`（缺則 turnover fallback close×volume）。
- **安全/權限**：無新 authn/authz；衍生 metrics 無使用者輸入；research-only 文案不暗示可交易，`ResearchOnlyNotice` 不動。
- **邊界/效能**：缺資料 → metrics undefined → badge 隱藏（不顯 N/A/0）；`limitFlag` 僅 `securityType === 'stock'`；revenue YoY 月初邊界用 now-430 buffer；FinMind quota 不增（call 數不變）；score-meter 改相對最高分避免飽和。

## Testing Decisions

| Module | 要測? | 測什麼外部行為 | Prior art |
|---|---|---|---|
| `finmind-metrics.ts` | ✅ | YoY/MoM/量比/漲跌幅/limitFlag(ETF→undefined)/流動性 邊界 + 缺資料 undefined | `packages/shared/tests/scoring.test.ts` |
| `parsers.ts` | ✅ | 價格/營收 group→摘要 event、engagement=0、籌碼逐 row、metrics 透傳、title 框架 | `packages/shared/tests/parsers.test.ts` |
| `scoring.ts` | ✅ | 數值回歸 pin score、derivedSignal 不輾壓、高 YoY 小型股 > 純高量大型股 | `packages/shared/tests/scoring.test.ts` |
| `live.ts` | ✅ | price startDate now-45、revenue now-430、截窗 | `apps/worker/tests/live-sources.test.ts` |
| `ingest.ts` | ✅ | metrics-less 價格摘要被 `isStoredEventStillSupported` 過濾、re-score 後 candidate.metrics 仍在 | `apps/worker/tests/ingest.test.ts` |
| `d1.ts` | ✅ | metrics_json round-trip、舊無欄位 row 不報錯 | `apps/worker/tests/d1-repository.test.ts` |
| `RadarTable.tsx` | ✅ | badge 顯示/隱藏、meter 不飽和、breakdown 含 derivedSignal | `apps/web/tests/radar-table.test.tsx` |
| `StockDetail.tsx` | ✅ | event.metrics chips 顯示 | `apps/web/tests/stock-detail.test.tsx` |

## Vertical Slices

### Slice 1 — 衍生指標計算 module（foundation）
- **Type**: AFK
- **Blocked by**: None
- **User stories**: #1, #2, #3, #9, #10, #13
- **Acceptance criteria**:
  - [ ] `computeFinMindMetrics(rows, securityType)` 從多日 rows 算 `priceChangePct`/`volumeRatio`/`limitFlag`/`avgDailyTurnoverTwd`/`liquidityTier`/`revenueYoYPct`/`revenueMoMPct`/`isRecentHigh`
  - [ ] 缺資料各欄回 undefined（價格 < 2 筆、量前段 < 5 筆、無去年同月）
  - [ ] `limitFlag` 僅 `securityType === 'stock'`；ETF/ETN/指數一律 undefined
  - [ ] `Trading_money` 缺時 turnover fallback `close × Trading_Volume`
  - [ ] `types.ts` 的 `FinMindMetrics`、`FinMindRow.Trading_money` 就位；`finmind-metrics.test.ts` 全綠

### Slice 2 — 加寬 FinMind 抓取窗
- **Type**: AFK
- **Blocked by**: None
- **User stories**: #14
- **Acceptance criteria**:
  - [ ] 價格 dataset `startDate = now-45 天`（新 `priceStartDate` helper）
  - [ ] 營收 `revenueStartDate = now-430 天`
  - [ ] `live-sources.test.ts` 驗 startDate + 序列截窗；既有測試仍綠

### Slice 3 — ingest 串接：摘要 event + metrics 透傳 + tag + filter
- **Type**: AFK
- **Blocked by**: Slice 1
- **User stories**: #1, #2, #9, #11
- **Acceptance criteria**:
  - [ ] `normalizeFinMindRows` 把價格/營收依 symbol group → 一個摘要 `SourceEvent`（帶 `metrics`、`engagement=0`）；法人/融資維持逐 row（`metrics` undefined）
  - [ ] title 改人話框架（營收 YoY/MoM/近 N 月高；價格 漲跌幅/量比/漲停）
  - [ ] `securityTypes` map 由 universe 傳入供 `limitFlag`
  - [ ] `classifyEvent` regex 產出 漲停/跌停/爆量/營收創高/高成長 tag（FinMind 走 deterministic，無需動 `classifier.ts` SUPPORTED_EVENT_TAGS）
  - [ ] `isStoredEventStillSupported` 改判「價格摘要且 `metrics?.priceChangePct === undefined`」才丟（取代舊 `close N/A volume 0` regex）
  - [ ] `SourceEvent`/`EventRecord.metrics` + `expandSymbols`/`reclassifyStoredEvents` 透傳；`parsers`/`ingest` 測綠

### Slice 4 — 持久化 metrics
- **Type**: AFK
- **Blocked by**: Slice 3
- **User stories**: #11, #12
- **Acceptance criteria**:
  - [ ] migration `0007_finmind_metrics.sql` 加 `events`/`candidates`.`metrics_json`（nullable）
  - [ ] `saveEvents`/`rowToEvent` + `saveCandidates`/`rowToCandidate` 讀寫 `metrics_json`
  - [ ] `memory.ts` repo metrics 保存
  - [ ] re-score 後 `candidate.metrics` 仍在；舊無 `metrics_json` row 不報錯；`d1-repository.test.ts` 綠

### Slice 5 — scoring：derivedSignal
- **Type**: AFK
- **Blocked by**: Slice 4
- **User stories**: #4, #5
- **Acceptance criteria**:
  - [ ] FinMind 摘要 event `engagement=0`，`engagementScore` 不再被原始 volume 主導
  - [ ] `derivedSignal` 元件加進 `ScoreBreakdown` + `rawScore`，公式 `round1(min(3,|priceΔ%|/4)+min(2,max(0,量比-1))+(limit?1:0)+min(3,|YoY%|/15)+(recentHigh?0.5:0))`
  - [ ] `Candidate.metrics` 聚合該 symbol 最強衍生值
  - [ ] 數值回歸測試 pin fixture score；behavior 測「高 YoY 小型股 > 純高量大型股」；derivedSignal 不輾壓（強訊號 ~3-6）

### Slice 6 — UI badge + meter + chips
- **Type**: AFK
- **Blocked by**: Slice 5
- **User stories**: #1, #2, #3, #6, #7, #8
- **Acceptance criteria**:
  - [ ] `RadarTable` 顯示 營收 YoY%/量比/漲跌幅/流動性 tier badge；undefined 隱藏
  - [ ] score-meter 改相對最高分（`score / maxCandidateScore × 100`）不飽和
  - [ ] breakdown 面板渲染 `derivedSignal`
  - [ ] `StockDetail` 由 `event.metrics` 顯示 chips
  - [ ] `radar-table`/`stock-detail` 測綠

## Out of Scope

- per-source / per-市值桶 normalization（percentile/z-score）
- 估值（TaiwanStockPER）、外資持股比/距上限、籌碼連買賣 streak
- 跨來源同稿去重、forward-return 命中率、scoring 權重 config 抽取 + 回歸鎖
- realtime/intraday tick、回測引擎/P&L、ML 排序、任何買賣建議或可交易性宣稱

## Further Notes

- **Deploy**：Cloudflare Worker（`npx wrangler deploy`）+ Pages。⚠️ migration 0007 必須先 `pnpm migrate:remote` 再 deploy worker，否則 prod D1 寫 `metrics_json` 會炸。cron `0 * * * *`。deploy 後跑 `pnpm check:production:smoke` 驗加寬窗後 FinMind run 仍 ok、cron 不超時。
- **已知風險**：ranking 一次性大洗牌（snapshot drift 預期，非 regression）；FinMind revenue `date` 語意未確認（期末 vs 發布日）→ now-430 buffer，缺則 YoY 退 undefined；`limitFlag` ±9.5 近似；anonymous 模式無 Trading_money → fallback close×volume。
- **可調**：衍生公式常數、流動性門檻（1e8/1e7）、營收窗天數（now-430）為起始預設，實作後依實際 radar 結果微調（非阻斷）。
- **對抗式驗證已修**：engagement=0 統一、derivedSignal rescale 不輾壓、score-meter rebase、籌碼逐 row、dead-event filter 改判、ETF limitFlag gate、revenue 月初邊界、persistence round-trip 全鏈、StockDetail 讀 event.metrics、`live-sources.test.ts` 正名。
