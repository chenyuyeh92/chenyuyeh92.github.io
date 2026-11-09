# 樂譜專區與樂譜商店 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 家教網站新增樂譜專區（預覽圖＋音檔＋購買按鈕），以及獨立的 Cloudflare Worker `score-shop`，用綠界收款、付款後下載 PDF 並寄信。

**Architecture:** 靜態頁 `sheet-music/` 放在 GitHub Pages，只含已打馬賽克的預覽圖；`tools/make-preview.py` 在本機把 PDF 轉預覽圖；`score-shop/` 是 Cloudflare Worker，KV 存訂單與下載代碼、R2 存完整 PDF、Brevo 寄信。

**Tech Stack:** Python 3 + Pillow + poppler `pdftoppm`；Cloudflare Workers（ES modules）、wrangler 4、vitest（Node 環境，用記憶體假 KV/R2 測試）。

**Spec:** `docs/superpowers/specs/2026-11-09-sheet-music-shop-design.md`

## Global Constraints

- 完整 PDF 永遠不進 git：根目錄 `.gitignore` 含 `*.pdf`。
- 預覽圖馬賽克做在像素上，不用 CSS 模糊；前 4 行清楚，第 5 行起馬賽克；每頁加「試看 Preview」字樣；WebP、寬約 900px。
- 商品：`love-like-you`「Love Like You」NT$100、R2 檔名 `love-like-you.pdf`、4 頁；`sabzeruz`「Genshin Dance of Sabzeruz」NT$120、R2 檔名 `sabzeruz.pdf`、2 頁。兩首中級，改編者 Marco Yeh。
- 價格以 `score-shop/src/catalog.js` 為準，不信任表單傳來的金額。
- 下載代碼：32 bytes 亂數，7 天有效，最多 5 次。
- 訂單編號：`S` 開頭、只有英數、≤ 20 字元。
- 綠界：`ChoosePayment=Credit`、`EncryptType=1`（SHA256）、notify 回 `1|OK`；`ECPAY_ENV=stage` 用 `https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5`，`prod` 用 `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`。
- 機密只放 Cloudflare Secrets：`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`BREVO_API_KEY`、`MAIL_FROM`。
- 文案用繁體中文；聯絡信箱 `wilson0905189796@gmail.com`；七日解除權勾選文字：「我同意本商品為數位內容，付款後不適用七日解除權」。

## Review Focus

- 綠界在 notify 之前就把買家帶回 `/ecpay/return` → 訂單頁顯示「確認付款中…」並自動重新整理，不可顯示失敗。（Task 4 測試）
- 同一筆通知重送多次 → 只產生一組代碼、只寄一封信。（Task 4 測試）
- 曲名含非 ASCII 字元時下載檔名 → `Content-Disposition` 用 `filename*=UTF-8''…`，不讓 Worker 丟例外。（Task 4 測試）
- 預覽工具遇到一頁只有標題、或第 4 行剛好是頁尾最後一行 → 下一頁全部馬賽克，行數跨頁正確累計。（Task 1 測試）
- R2 缺檔 → 錯誤頁且不扣下載次數。（Task 4 測試）

---

### Task 1: 預覽圖工具

**Files:**
- Create: `tools/make-preview.py`, `tools/test_make_preview.py`
- Modify: `.gitignore`（新建，內容 `*.pdf`）

**Interfaces:**
- Produces: CLI `python3 tools/make-preview.py <pdf> <name> [--keep 4] [--out sheet-music/img] [--cut PAGE:FRACTION]` → 寫出 `<out>/<name>-<n>.webp`。函式 `find_systems(img: PIL.Image) -> list[tuple[int,int]]`（每行的 y0,y1，由上而下，不含標題）、`apply_preview(pages: list[Image], keep: int) -> list[Image]`。

- [ ] **Step 1: 寫失敗測試** `test_find_systems_synthetic`：白底圖畫 5 條黑色橫帶（每條模擬一行，高 60px、間隔 40px），`find_systems` 回傳 5 段，y 範圍各自涵蓋黑帶。`test_apply_preview_across_pages`：兩頁各 3 行，`keep=4` → 第 1 頁 3 行與原圖像素相同、第 2 頁第 1 行相同、第 2 頁第 2 行起與原圖不同（已馬賽克）。`test_title_only_page`：第 1 頁只有一條細標題帶（高度 < 行高中位數的一半，視為標題不計行）。
- [ ] **Step 2:** `python3 -m pytest tools/test_make_preview.py -q` → FAIL（模組不存在）。
- [ ] **Step 3: 實作。** 轉檔用 `pdftoppm -r 110 -png`。`find_systems`：灰階 → 每列墨水量 → 找出連續有墨水的區段，把間隔小於 `0.015*高度` 的區段合併（同一行的上下譜表合在一起），再丟掉高度小於中位數一半的區段（標題、頁碼）。馬賽克：該區段縮到 1/12 再用 NEAREST 放大貼回；馬賽克範圍從第 5 行的 y0 起到頁尾（同頁之後的行、之後整頁都包含）。字樣：RGBA 疊圖，灰色 25% 透明、旋轉 -25°，字型用系統 Noto CJK（找不到就用 Pillow 預設字型並只寫 "Preview"）。輸出寬 900px，WebP quality 80。`--cut PAGE:FRACTION` 手動指定馬賽克起點，跳過自動偵測。
- [ ] **Step 4:** 測試 PASS。
- [ ] **Step 5: 用真譜產生。** 對兩份上傳的 PDF 執行，輸出 `sheet-music/img/love-like-you-{1..4}.webp`、`sabzeruz-{1,2}.webp`；逐張打開看：第 1 頁前 4 行清楚、其餘看不出音符。
- [ ] **Step 6: Commit** `tools/`、`.gitignore`、`sheet-music/img/`。

### Task 2: 綠界簽章與商品清單

**Files:**
- Create: `score-shop/package.json`（devDependencies：`vitest`、`wrangler@^4`；script `test: vitest run`）、`score-shop/src/catalog.js`、`score-shop/src/ecpay.js`、`score-shop/test/ecpay.test.js`

**Interfaces:**
- Produces: `CATALOG: Record<string,{id,title,price,file}>`、`getItem(id) -> item|null`；`async checkMacValue(params: object, hashKey, hashIV) -> string`（大寫 hex）；`async verifyMac(params, hashKey, hashIV) -> boolean`（params 含 `CheckMacValue`）；`buildCheckoutParams({order, item, env, origin}) -> object`（含 MerchantID、MerchantTradeNo、MerchantTradeDate `yyyy/MM/dd HH:mm:ss` 台灣時間、PaymentType `aio`、TotalAmount、TradeDesc、ItemName、ReturnURL、OrderResultURL、ChoosePayment、EncryptType，尚無 CheckMacValue）；`checkoutUrl(envName) -> string`。

- [ ] **Step 1: 失敗測試**：(a) `checkMacValue` 對已知輸入 `{MerchantID:'3002607', A:'b c', z:'(x)!*-_.'}`、測試 HashKey `pwFHCqoQZGmho4w6`、HashIV `EkRm7iFT261dpevs` 的結果，等於測試中用 Node `crypto.createHash('sha256')` 依規則獨立算出的值（規則：key 不分大小寫排序 → `HashKey=…&k=v…&HashIV=…` → `encodeURIComponent` → 全小寫 → 把 `%20` 換 `+`，`%2d %5f %2e %21 %2a %28 %29` 還原成 `- _ . ! * ( )` → SHA256 → 大寫）；(b) `verifyMac` 改一個欄位就回 false；(c) `getItem('love-like-you').price === 100`、`getItem('sabzeruz').price === 120`、`getItem('x') === null`；(d) `buildCheckoutParams` 的 `TotalAmount` 等於商品價格。
- [ ] **Step 2:** `cd score-shop && npm install && npm test` → FAIL。
- [ ] **Step 3:** 實作（SHA256 用 `crypto.subtle`，Worker 與 Node 22 都有）。
- [ ] **Step 4:** PASS。
- [ ] **Step 5: Commit**（`score-shop/node_modules` 加入 `.gitignore`）。

### Task 3: 訂單儲存與寄信

**Files:**
- Create: `score-shop/src/orders.js`、`score-shop/src/mail.js`、`score-shop/test/orders.test.js`、`score-shop/test/fakes.js`（記憶體版 KV：`get/put/delete`，`get(k,'json')`；R2：`get(k)` 回 `{body, httpMetadata}` 或 null）

**Interfaces:**
- Produces: `newOrderNo() -> string`；`createOrder(kv, {item, email, amount}) -> order`；`getOrder(kv, no) -> order|null`；`markPaid(kv, no) -> {order, token, firstTime: boolean}`（已 paid 時回原 token、firstTime=false）；`markFailed(kv, no)`；`consumeDownload(kv, token, now) -> {ok:true, order}|{ok:false, reason:'expired'|'used'|'missing'}`；`refundDownload(kv, token)`（R2 缺檔時把次數加回）。order 形狀 `{no,item,email,amount,status:'pending'|'paid'|'failed',createdAt,token?}`；KV 鍵 `order:<no>`、`dl:<token>` = `{no, expires, remaining}`。`sendDownloadMail(env, {order, item, link}) -> Promise<boolean>`（POST `https://api.brevo.com/v3/smtp/email`，header `api-key`，失敗回 false 不丟例外）；`maskEmail(email) -> string`（`wilson@gmail.com` → `w***@gmail.com`）。

- [ ] **Step 1: 失敗測試**：`newOrderNo` 符合 `/^S[0-9A-Za-z]{1,19}$/` 且連續 100 次不重複；`markPaid` 兩次 → 第二次 `firstTime=false`、token 相同；`consumeDownload` 第 6 次 `used`、`now` 超過 7 天 `expired`、亂打 token `missing`；`refundDownload` 後剩餘次數 +1；`sendDownloadMail` 在 fetch 回 500 時回 false；`maskEmail` 範例。
- [ ] **Step 2:** FAIL。 **Step 3:** 實作（token 用 `crypto.getRandomValues` 32 bytes → base64url）。 **Step 4:** PASS。 **Step 5:** Commit。

### Task 4: Worker 路由與頁面

**Files:**
- Create: `score-shop/src/index.js`、`score-shop/src/pages.js`、`score-shop/wrangler.toml`、`score-shop/test/routes.test.js`

**Interfaces:**
- Consumes: Task 2、3 全部。
- Produces: `export default { fetch(request, env, ctx) }`。env：`ORDERS`（KV）、`SCORES`（R2）、`ECPAY_ENV`、`SITE_URL`（`https://chenyuyeh92.github.io/sheet-music/`）＋ secrets。路由依 spec：`GET /buy`、`POST /checkout`、`POST /ecpay/notify`、`POST /ecpay/return`、`GET /order/<no>`、`GET /dl/<token>`、其他 404。

- [ ] **Step 1: 失敗測試**（用 fakes、假 fetch 攔 Brevo）：
  - `GET /buy?item=x` → 404 頁含「找不到這份樂譜」。
  - `POST /checkout` 沒勾同意、或 email 格式錯 → 200 回購買頁含提示且保留 email；表單送 `amount=1` 也只會以 100 建單；成功時回傳 HTML 含 `action="https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"` 與正確 `CheckMacValue`。
  - notify 簽章錯 → 回 `0|ErrorMessage`、訂單仍 pending；金額不符 → 同上；正確 → `1|OK`、訂單 paid、Brevo 被呼叫 1 次；同一通知再送 → `1|OK`、Brevo 仍只 1 次；`RtnCode=0` → 訂單 failed，訂單頁含「付款沒有成功」和回購買頁的連結。
  - `/ecpay/return` 在 notify 之前 → 302 到 `/order/<no>`，訂單頁含「確認付款中」與 `<meta http-equiv="refresh" content="3">`。
  - 已付款訂單頁含下載連結 `/dl/<token>` 與遮罩後的 email。
  - `/dl/<token>` 回 `application/pdf`、`Content-Disposition` 含 `filename*=UTF-8''`；R2 缺檔 → 錯誤頁且次數不變。
- [ ] **Step 2:** FAIL。 **Step 3:** 實作；所有使用者輸入放進 HTML 前做跳脫。 **Step 4:** PASS。 **Step 5:** Commit。

### Task 5: 部署說明

**Files:** Create `score-shop/README.md`

- [ ] **Step 1:** 寫給非工程師的步驟（繁中）：安裝 Node、`npx wrangler login`、`npx wrangler kv namespace create ORDERS` 把 id 填進 `wrangler.toml`、`npx wrangler r2 bucket create score-files`、上傳兩份 PDF（`npx wrangler r2 object put score-files/love-like-you.pdf --file …`）、Brevo 註冊與驗證寄件 Gmail、`npx wrangler secret put` 五個機密、`npx wrangler deploy`、用綠界測試卡 `4311-9522-2222-2222` 試買、通過後改 `ECPAY_ENV="prod"` 換正式金鑰再 deploy。
- [ ] **Step 2:** `npx wrangler deploy --dry-run` 確認打包成功。 **Step 3:** Commit。

### Task 6: 樂譜專區頁面與首頁連結

**Files:**
- Create: `sheet-music/index.html`
- Modify: `index.html`（nav 加 `<a href="sheet-music/">樂譜</a>`；`#works` 最前面加一張 `.work` 卡片連到樂譜專區）、`style.css`（`.score-grid`、`.score-card`、`.score-preview`）、`sitemap.xml`

- [ ] **Step 1:** 頁面依 spec 第 1 節：兩張卡片，每張含曲名、改編者、難度、頁數、價格、全部預覽圖、`<audio controls preload="none" src="audio/<id>.mp3">`（檔案還沒到時先放好路徑，並在 commit 訊息註明待補）、購買按鈕連 `https://score-shop.<帳號>.workers.dev/buy?item=<id>`（網址用一個 `data-shop` 常數集中在頁面頂端一處，部署後只改一處）。頁尾說明付款、下載、退款、垃圾郵件、聯絡信箱。
- [ ] **Step 2:** Playwright 截 390px 與 1280px 寬各一張檢查：無水平捲動、卡片手機一欄電腦兩欄；`grep -r "\.pdf" sheet-music/` 無結果。
- [ ] **Step 3:** Commit 並 push。
