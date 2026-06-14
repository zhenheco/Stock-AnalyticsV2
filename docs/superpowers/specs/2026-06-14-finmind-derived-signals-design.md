# FinMind 衍生訊號（相對化）設計

- **日期**：2026-06-14
- **狀態**：Draft（待 review）
- **範圍**：把已抓取的 FinMind 原始資料轉成決策相關的衍生/相對訊號（營收 YoY/MoM、漲跌幅、量比、流動性），讓這些衍生值驅動 score 並在 UI 顯示 badge。
- **不含**：per-source / per-市值桶 normalization、估值（PER）、外資持股、籌碼連買賣 streak、forward-return 命中率 — 皆留後續 spec。

---

## 1. Problem

雷達抓對了原始資料（FinMind 價格/籌碼/月營收），但**丟掉決策關鍵的相對化轉換**：

- 月營收只顯示絕對金額（`parsers.ts:124-136`）→ 創新高與雪崩長一樣；engagement 取絕對營收額（億），大型股恆勝。
- 價格事件只顯示 `close X volume Y`（`parsers.ts:169-182`），engagement = 原始 `Trading_Volume`（百萬級）。`scoring.ts:31` 的 `engagementScore = log10(1 + sum(engagement))` 因此 ≈ 7.6（log10(1+40e6)），**輾壓**新聞/官方訊號（eventStrength ≈ 1.5-3、sourceConfidence×1.8、freshness ~1.5）。
- 結果：成交量天生大的大型股（2330/2317 級）機械性排在「剛爆量突破的小型股」之上 — 與「discovery 工具」目標相反。

專業投資經理人選股要的是**相對/衍生量**：營收 YoY、量是均量幾倍、漲跌幅、能不能吃得下量（流動性），而非絕對值。

## 2. Goal / Non-Goals

**Goal**

1. 從**已抓取**的 FinMind 序列算出衍生指標（零新增資料來源，純算術）。
2. 讓衍生指標**驅動 score**（取代原始 volume/絕對營收主導），使高成長/爆量的小型股能浮上來 — 但與既有 news/官方訊號**同量級競合，不輾壓**。
3. 在 radar 與個股頁顯示衍生 **badge**（營收 YoY%、量比、漲跌幅、流動性 tier）。
4. 守住 research-only 定位：badge 是研究 context，非買賣訊號。

**Non-Goals**（見 §10）：normalization、估值、外資持股、籌碼 streak、命中率。

## 3. Background：現行資料流（file:line，已對程式碼驗證）

- `sources/live.ts:199-205` 平行抓 5 個 FinMind dataset。價格/籌碼用預設 `startDate = now.slice(0,10)`（**今天一天**，`live.ts:249`）；只有營收用 `revenueStartDate(now)` = `now-75 天`（`live.ts:423-430`）。
- `parsers.ts:116` `normalizeFinMindRows(rows, now)`：單一 `rows.flatMap`，**逐 row → 逐 SourceEvent**，依 row 型別（營收/融資/法人/價格）分支，無分組、無跨 row 計算。
- `ingest.ts:54,86-89` SourceEvent 經 `classifySourceEvents`（FinMind 一律走 deterministic `classifyEvent`，永不走 LLM，`ingest.ts:134,167`）→ `expandSymbols`（`ingest.ts:110-125`）→ `repo.saveEvents` 持久化 → `recomputeCandidates` → `scoreCandidates`。
- `/api/admin/run-score`（`app.ts:179-190`）→ `recomputeCandidates`（`ingest.ts:91-108`）**重讀 stored events** 重算 candidate，途中 `reclassifyStoredEvents`（`ingest.ts:143-159`）以 `{...event}` spread 保欄位。⇒ 衍生指標**必須持久化在 event 上**，否則 re-score 算不出（raw rows 不留）。
- D1 schema：`events`、`candidates` 皆以 `*_json` column 存複雜欄位（`d1.ts:62-80` saveEvents、`d1.ts:23-48` saveCandidates、`d1.ts:323` rowToEvent）。in-memory repo 在 `repository/memory.ts`（存物件，新欄位自動隨之）。migration 在 `apps/worker/migrations/000N_*.sql`，現有到 `0006`，下一個 `0007`。
- 台股一般**股票**漲跌幅 ±10%；ETF/ETN/指數**無** ±10% 限制（`securityType` 已在 `UniverseStock`，`types.ts:61,68`，`parsers.ts:350-364` 推斷）。
- `FinMindRow`（`types.ts:108`）目前只宣告 `close`、`Trading_Volume`、`revenue`、`revenue_month`、`revenue_year` 等；**`Trading_money` 全 codebase 無引用**（本 spec 新增 optional）。

## 4. Design Overview（選 Approach A）

**A（採用）結構化 metrics 欄位 + 獨立計算 module**
新純函式 module `packages/shared/src/finmind-metrics.ts`；`EventRecord.metrics?` 與 `Candidate.metrics?` 結構化欄位；D1 `events`/`candidates` 各加 nullable `metrics_json`。Score 與 badge 都讀結構化值。

被否決：

- **B（純 title 字串 + engagement 重算）**：badge 需 regex 解 title（違反 coding-style「不信字串解析」）、流動性 tier 無法當可排序欄位、未來 normalization 無結構化資料可讀。
- **C（算完只當 score 輸入、不持久化）**：`/api/admin/run-score` 重讀 stored events 重算時算不出（raw rows 不留）→ 功能破。

理由：badge 要結構化；events 必須持久化 metrics；D1 已全用 `*_json` 慣例，加 nullable column 向後相容、零破壞。

## 5. 詳細設計（分層）

### 5.1 資料層（`sources/live.ts`）

- 價格 `TaiwanStockPrice`：`fetchFinMindRowsByDataset` 的 `startDate` 由「今天」改 `now - 45 天`（≈30 交易日），足夠算前一交易日收盤 + 近 20 日均量/均額。新增 helper `priceStartDate(now)`（與 `revenueStartDate` 同形）。
- 營收 `TaiwanStockMonthRevenue`：`revenueStartDate` 由 `now-75` 改 **`now-430 天`**（不是 400：月初邊界時 now-400 可能落在去年同月之後而漏掉該月，留 buffer 涵蓋 >14 個月）。
  - **假設**：FinMind revenue `date` 為期末日；若非如此，去年同月 row 在月初邊界仍可能缺，`revenueYoYPct` 退 undefined（§7 補月初邊界測試）。
- 籌碼（法人/融資）窗**不動**（streak 屬延後 bet）。
- **Budget guard**：每 symbol×dataset 仍 1 次 HTTP（quota 不增，只 payload 變大）；`FINMIND_DYNAMIC_SYMBOL_LIMIT` 仍 cap 20。`finmind-metrics` 計算前在 code 內把序列截到所需窗（價格留近 ~25 筆、營收留近 ~14 筆），即使 FinMind 多回也不爆 Worker 記憶體。估算：20 symbol × ~30 日 ≈ 600 row、營收 ≈ 280 row。

### 5.2 計算層（新 `packages/shared/src/finmind-metrics.ts`）

純函式，input = 同一 symbol、同一 dataset 的多日 rows（＋該 symbol 的 `securityType`），output = `FinMindMetrics`（部分欄位）。全 deterministic、無外部呼叫、好測。常數集中為具名 config（可調）。

精確定義（缺資料一律回 `undefined`，不臆造）：

- `priceChangePct` = `(close_today − close_prev) / close_prev × 100`，2 位小數。`close_prev` = 序列中前一交易日。序列 < 2 筆 → undefined。
- `volumeRatio` = `vol_today / mean(vol，前 ≤20 交易日，不含今天)`，1 位小數。前段 < 5 筆 → undefined（避免噪比）。
- `limitFlag` = **僅當 `securityType === 'stock'`**（ETF/ETN/指數無 ±10% 限制 → 一律 undefined）：`priceChangePct ≥ 9.5` → `"limit_up"`；`≤ −9.5` → `"limit_down"`；否則 undefined（±9.5 留整數跳動 buffer 近似 ±10% 制度；首日上市無漲跌幅暫不特判，由 buffer 容忍）。
- `avgDailyTurnoverTwd` = `mean(Trading_money，近 ≤20 交易日)`；若 `Trading_money` 缺 → fallback `close × Trading_Volume`（VWAP-free 近似）。單位 TWD。
- `liquidityTier`：`avgDailyTurnoverTwd ≥ 1e8`(1 億) → `"充足"`；`≥ 1e7`(1000 萬) → `"偏低"`；否則 `"極低"`（門檻為具名 config 起始值，可調）。
- `revenueYoYPct`：取最新一筆營收 `latest`，配對序列中 `revenue_year === latest.revenue_year − 1 AND revenue_month === latest.revenue_month` 的 row；存在則 `(latest.revenue − prior.revenue) / prior.revenue × 100`，否則 undefined。
- `revenueMoMPct` = `(rev_本月 − rev_前月) / rev_前月 × 100`；前月 = 時序前一筆營收。
- `isRecentHigh` = `latest.revenue ≥ max(序列中前 ≤3 月)`。

需在 `FinMindRow`（`types.ts:108`）補 optional `Trading_money?: number`。

### 5.3 型別 + 持久層

- `types.ts`：
  - 新 `FinMindMetrics`：`{ priceChangePct?, volumeRatio?, limitFlag?, avgDailyTurnoverTwd?, liquidityTier?, revenueYoYPct?, revenueMoMPct?, isRecentHigh? }`（全 optional）。
  - `SourceEvent` 加 `metrics?: FinMindMetrics`（transport，不直接存）。
  - `EventRecord` 加 `metrics?: FinMindMetrics`。
  - `Candidate` 加 `metrics?: FinMindMetrics`。
  - `ScoreBreakdown` 加 `derivedSignal: number`。
  - `FinMindRow` 加 `Trading_money?: number`。
- `parsers.ts` `normalizeFinMindRows`：**只把價格、月營收 row 依 `symbol` 分組**，每組呼叫 `finmind-metrics` 算 metrics，emit **一個摘要 SourceEvent/symbol/dataset**（攜 `metrics`）。
  - **法人/融資（籌碼）row 維持逐 row**（title/engagement 不變，`metrics` = undefined）— §5.3 透傳與 §5.5 badge 對 undefined 須優雅處理。
  - 需傳入 `symbol → securityType` map（由 universe 提供）給 metrics 算 limitFlag 門檻。`ingest.ts` 呼叫端已有 universe（`ingest.ts:38-47,92-94`），補建此 map 傳入。
  - 摘要事件 **engagement = 0**（價格、營收皆是），衍生量級只走 `derivedSignal`（§5.4），避免雙重計分；社群熱度仍由 PTT/RSS engagement 進 `engagementScore`。
  - title 改人話框架：營收 `「2330 台積電 2026/5 月營收 5.2億 YoY +38% MoM +12% 近3月高」`；價格 `「2330 台積電 收 X 漲 +6.2% 量 3.1x 爆量」`（漲停時加「漲停」）。
- `ingest.ts`：
  - `expandSymbols`（`ingest.ts:110-125`）透傳 `event.metrics` 到 `EventRecord`。
  - `reclassifyStoredEvents`（`ingest.ts:143-159`）保留 `{...event}` spread（勿改成逐欄重建，否則 metrics 掉）。
  - **更新 `isStoredEventStillSupported`（`ingest.ts:183`）**：原以 regex `/\sclose N\/A volume 0$/` 丟空價格 row；新 title 不再 match → 改判「價格摘要事件且 `metrics?.priceChangePct === undefined`」才丟。
- `d1.ts`：`saveEvents`（`:62`）/`saveCandidates`（`:23`）寫 `metrics_json`；`rowToEvent`（`:323`）/`rowToCandidate` 解析 `metrics_json`（沿用 `parseJsonObject` pattern，缺則 undefined）。
- migration `0007_finmind_metrics.sql`：
  ```sql
  ALTER TABLE events ADD COLUMN metrics_json TEXT;
  ALTER TABLE candidates ADD COLUMN metrics_json TEXT;
  ```
  nullable、向後相容（舊 row 為 NULL）。
- **持久化 round-trip**（必全鏈齊備，否則 re-score 掉 metrics）：`expandSymbols` 透傳 → `reclassifyStoredEvents` `{...event}` 保留 → `saveEvents` 寫 `metrics_json` → `rowToEvent` 解析 `metrics_json`。§7 補 re-score 後 `candidate.metrics` 仍在的測試。

### 5.4 Scoring（`packages/shared/src/scoring.ts`）

目標：衍生量真正進 score，且消除原始 volume 主導，又**不**做 normalization，**且與既有元件同量級競合（不輾壓）**。

- FinMind 價格/營收摘要事件 **engagement = 0**（在 §5.3 設定）：`engagementScore`（`scoring.ts:31`）只反映社群熱度（PTT/RSS），不再被 FinMind 原始 volume 輾壓。
- 新 score 元件 **`derivedSignal`**（加進 `ScoreBreakdown` 與 `rawScore` 加總，`scoring.ts:38-47`），由該 symbol events 聚合的最強 `metrics` 計算。**rescaled 公式**（常數為具名 config，可調；強訊號落 ~3-6、理論最高 ~9.5，與 eventStrength(~1.5-3)+sourceConfidence×1.8(finmind 1.44) 同量級競合而非輾壓）：
  ```
  derivedSignal = round1(
      min(3, |priceChangePct| / 4)
    + min(2, max(0, volumeRatio − 1))
    + (limitFlag ? 1 : 0)
    + min(3, |revenueYoYPct| / 15)
    + (isRecentHigh ? 0.5 : 0)
  )
  ```
  使「+40% YoY 小型股」「+6%/3x 量突破」拿到有意義分數，而非靠原始量。
- `Candidate.metrics`：`toCandidate`（`scoring.ts:26`）聚合該 symbol events 最強衍生值（價格取 |priceChangePct| 最大者、營收取最新 YoY）給 radar badge。
- 衍生 tag（`漲停`/`跌停`/`爆量`/`營收創高`/`高成長`）：由 §5.3 title 經 `classifyEvent`（`ingest.ts:192-208`）regex 偵測，**僅供 UI tag 顯示**；score 的衍生部分走結構化 `derivedSignal`，不依賴 title 字串。FinMind 一律走 deterministic `classifyEvent`（永不 LLM），故新 tag **不需**加進 `classifier.ts` `SUPPORTED_EVENT_TAGS`（LLM normalizer 不經手）；只需擴充 `classifyEvent` regex 產出它們。
- ⚠️ **ranking 會變**（預期，非 regression）：`scoring.test.ts` 中受 FinMind 影響的斷言皆為序數（`:57`、`:130` `toBeGreaterThan`）；唯一精確斷言 `expect(...score).toBe(0)`（`scoring.test.ts:149`）是 RSS-only 公告案例，不受本變更影響。⇒ 必補**數值回歸測試** pin 固定 fixture 的分數（含 derivedSignal）。

### 5.5 UI

- `RadarTable.tsx`：
  - 每列加 badge — 營收 YoY%、量比（`3.1x`）、漲跌幅、流動性 tier。讀 `candidate.metrics`，欄位 undefined 則不顯（不顯「N/A」雜訊）。
  - **score-meter 重定標**：現行 `RadarTable.tsx:125` `width = Math.min(100, candidate.score * 10)%`（假設 score ~0-10）。加 derivedSignal 後 top score 升到 ~15-25，bar 會對幾乎每列鎖 100% 而失去鑑別度 → 改為**相對最高分**：`width = score / maxCandidateScore × 100`（對所選公式重驗飽和）。
  - **score-breakdown 面板**（`RadarTable.tsx:138-145`）目前渲染 eventStrength/sourceConfidence/freshness/crossSourceBoost/watchlistBoost，**未含 derivedSignal**（grep 確認 `derivedSignal` 全 `apps/web/src` 無引用）→ 須補渲染新元件。
- `StockDetail.tsx`：事件證據區顯示衍生指標 chips。**chips 讀每個 `event.metrics`**（來自 `GET /api/stocks/:symbol/research` → `listEventsForSymbol` → `rowToEvent`，`app.ts:103-107`），**非** `candidate.metrics`。
- 守 research-only：badge 為 context，非買賣訊號；`ResearchOnlyNotice` 不動；流動性 tier 文案用「充足/偏低/極低」研究語氣，不暗示可下單量。

## 6. 資料模型摘要

| 欄位 | 位置 | 型別 | 持久化 |
|---|---|---|---|
| `FinMindMetrics` | `types.ts` 新 interface | 8 個 optional | — |
| `SourceEvent.metrics?` | `types.ts:4` | `FinMindMetrics` | 不直接存（透傳給 EventRecord） |
| `EventRecord.metrics?` | `types.ts:13` | `FinMindMetrics` | `events.metrics_json` (0007) |
| `Candidate.metrics?` | `types.ts:35` | `FinMindMetrics` | `candidates.metrics_json` (0007) |
| `ScoreBreakdown.derivedSignal` | `types.ts:27` | `number` | `candidates.score_breakdown_json`（既有 JSON，向後相容） |
| `FinMindRow.Trading_money?` | `types.ts:108` | `number` | — |

## 7. 測試策略（TDD：紅 → 綠 → refactor）

關鍵 behavior（先與實作者確認，再寫）：

1. **`finmind-metrics.test.ts`**（新）：
   - 營收 YoY 正/負/無去年同月（undefined）/**月初邊界**（now-430 是否含去年同月）/13 月含跳月、MoM、isRecentHigh 邊界。
   - priceChangePct（序列 1 筆 → undefined）；volumeRatio（前段 < 5 筆 → undefined）；limitFlag ±9.5 邊界、**ETF/ETN/指數一律 undefined**；avgDailyTurnoverTwd（Trading_money 缺 fallback close×volume）；liquidityTier 三段門檻。
2. **`parsers.test.ts`**：價格/營收 group by symbol → 一個摘要 event、engagement=0、metrics 透傳；**法人/融資維持逐 row、metrics=undefined**；title 框架。
3. **`scoring.test.ts`**：
   - 數值回歸：固定 fixture pin 出 score（含 derivedSignal），確認 derivedSignal 不輾壓其他元件。
   - **意圖 behavior**：「+40% YoY 小型股」score > 「同月純高量大型股」。
   - FinMind engagement=0 不再主導 engagementScore。
4. **`apps/worker/tests/live-sources.test.ts`**（擴充既有檔，非新建）：價格 startDate = now-45、營收 = now-430；序列截窗。
5. **ingest 測**：metrics-less 價格摘要事件在 re-score 被 `isStoredEventStillSupported` 過濾；**recompute 後 `candidate.metrics` 仍在**（round-trip）。
6. **web 測**：RadarTable badge 顯示 / metrics undefined 時隱藏；score-meter 不飽和；breakdown 面板含 derivedSignal；StockDetail chips 讀 event.metrics。

## 8. 驗收條件

- `pnpm test && pnpm typecheck && pnpm build` 全綠。
- production smoke（`pnpm check:production:smoke`）：加寬窗後 FinMind run 仍 `ok`/anonymous-ready，cron 不超時（Worker wall-time 內）。
- radar 上至少一檔「高 YoY 小型股」或「爆量股」排名明顯高於純高量大型股（人工驗相對化生效）；score-meter bar 仍有鑑別度（非全部 100%）。
- 既有 D1 資料（無 metrics_json）讀取不報錯（向後相容）。

## 9. Risks & Mitigations

- **加寬窗 → payload/quota**：HTTP 次數不變（quota 不增）；code 內截窗護記憶體；先 smoke 驗 anonymous 模式仍 ok。
- **ranking 變動衝擊既有 snapshot drift**：屬預期；數值回歸測試記錄變更；snapshot drift 會短暫顯示一次大洗牌（一次性）。
- **derivedSignal 量級失衡**：rescaled 公式（§5.4）強訊號 ~3-6、最高 ~9.5；數值回歸測試 + radar 人工驗確認不輾壓也不消失。
- **FinMind revenue `date` 語意未確認**（期末 vs 發布日）：影響 now-430 是否穩定涵蓋去年同月；以 buffer 緩解，缺則 YoY 退 undefined，不破壞。
- **limitFlag ±9.5 近似 + ETF 無限制**：已 gate securityType；少數整數跳動股可能誤判，badge 僅 context。
- **FinMind 欄位缺漏**（anonymous 無 Trading_money）：fallback close×volume；metrics 缺則 undefined，badge 隱藏，不破壞。

## 10. Out of Scope（後續 spec）

per-source / per-市值桶 normalization（percentile/z-score）、估值（TaiwanStockPER）、外資持股比/距上限、籌碼連買賣 streak、跨來源同稿去重、forward-return 命中率、scoring 權重 config 抽取 + 回歸鎖。本 spec 的 `derivedSignal` 與具名常數 config 為後續 normalization 鋪路。

## 11. Open Questions

- 衍生公式常數（§5.4）、流動性門檻（§5.2/§5.3，close×volume 為 VWAP-free 近似）、營收窗天數（now-430）為起始預設，實作後可依實際 radar 結果與 FinMind 真實欄位分布微調 — 非阻斷。
