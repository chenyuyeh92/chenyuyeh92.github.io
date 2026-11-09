# 樂譜專區與樂譜商店：設計文件

日期：2026-11-09　狀態：待確認

## 目標

在家教網站上新增「樂譜專區」，賣自己改編、原創或教學用的鋼琴譜。買家用信用卡（綠界）付款，付款後畫面出現下載按鈕，同時收到內含下載連結的 email。展示頁讓買家先看前 4 行、聽完整音檔再決定要不要買。

成功的樣子：
- 買家從首頁點進樂譜專區，看預覽、聽音檔、按購買，付款後幾秒內就能下載 PDF。
- 沒有付款的人拿不到完整 PDF，就算看網頁原始碼或預覽圖也拿不到。
- 莫札特遊戲的收款系統（mozart-shop）完全不受影響。

## 已決定的事

| 項目 | 決定 |
|---|---|
| 上架曲目 | Love Like You（鋼琴改編，C 大調，4 頁，中級）NT$100；Genshin Dance of Sabzeruz（2 頁，中級）NT$120 |
| 分類 | 先不分類，譜多了再加 |
| 付款 | 綠界信用卡，用同一個綠界帳號，但另外做新的商店 `score-shop`，跟 mozart-shop 分開 |
| 展示 | 每頁都放預覽圖：前 4 行清楚，其餘馬賽克；加完整音檔 |
| 寄信 | Brevo 免費方案，用 Gmail 當寄件人 |
| 下載限制 | 連結 7 天內有效，最多下載 5 次 |
| 外部平台 | 之後在 ArrangeMe、MyMusicSheet 上架，網站卡片可以加外部連結 |
| 版權 | 兩首都是有版權作品的改編，風險已向使用者說明；使用者決定上架，被檢舉就下架 |

## 架構

```
GitHub Pages（公開）                     Cloudflare（score-shop Worker）
sheet-music/index.html  ── 購買按鈕 ──▶  /buy?item=<id>   填 email、勾同意
  預覽圖（已打馬賽克）                    POST /checkout    建訂單 → 送去綠界
  音檔 mp3                               POST /ecpay/notify 綠界通知付款結果（驗簽）
                                         POST /ecpay/return 付款後買家被帶回來
                                         GET  /order/<no>   顯示下載按鈕
                                         GET  /dl/<token>   從 R2 讀出 PDF 給買家
                                              │
                                     KV（訂單、下載次數）  R2（完整 PDF，私人）
                                              │
                                         Brevo API（寄下載信）
```

三個獨立的部分：

1. **樂譜專區頁面**（`sheet-music/`）：純靜態網頁，只放已打馬賽克的預覽圖和音檔。
2. **預覽圖工具**（`tools/make-preview.py`）：在自己電腦或這個環境裡跑，把 PDF 轉成預覽圖。
3. **樂譜商店**（`score-shop/`）：Cloudflare Worker，負責付款、驗證、下載、寄信。

## 1. 樂譜專區頁面

- 新檔案：`sheet-music/index.html`，沿用 `style.css` 的樣式和首頁的頁首、頁尾。
- 首頁改動：
  - 選單加「樂譜」連結。
  - 「我做的作品」區塊加一張「樂譜專區」卡片，連到 `sheet-music/index.html`。
  - `sitemap.xml` 加入新頁面。
- 每首譜一張卡片，內容：
  - 曲名、改編者（Marco Yeh）、難度、頁數、價格
  - 預覽圖：每頁一張，`loading="lazy"`，有替代文字
  - `<audio controls preload="none">` 播放完整音檔
  - 購買按鈕：`https://<score-shop 網址>/buy?item=<id>`
  - 外部平台連結（選填，之後上架了再加）
- 頁面下方寫清楚：付款方式、拿到樂譜的方式、退款說明（數位內容經同意後不適用七日解除權，檔案有問題就來信）、聯絡 email、沒收到信請看垃圾郵件。
- 版面：兩張卡片直接排在一起，手機上一欄、電腦上可以兩欄。

檔案位置：

```
sheet-music/
  index.html
  img/love-like-you-1.webp … love-like-you-4.webp
  img/sabzeruz-1.webp, sabzeruz-2.webp
  audio/love-like-you.mp3
  audio/sabzeruz.mp3
```

## 2. 預覽圖工具

`tools/make-preview.py <輸入.pdf> <輸出名稱> [--keep 4] [--cuts …]`

1. 用 `pdftoppm` 把每頁轉成約 110 dpi 的圖。
2. **自動找出每一行（譜表系統）**：計算每一列像素的墨水量，找出空白帶，用空白帶把頁面切成一行一行。
3. 按照頁面順序累計行數，前 4 行保持原樣，第 5 行開始做馬賽克（縮小到大約 1/12 再放大，看得出有譜、看不出音符），標題區不動。
4. 每頁加上斜斜的半透明「試看 Preview」字樣。
5. 存成 WebP，寬度約 900px。
6. 自動切行失敗時，可以用 `--cuts` 手動指定第 4 行結束的位置（第幾頁、離頂端幾 %）。

安全規則：
- 馬賽克直接做在圖片的像素上，不用 CSS 模糊。
- `.gitignore` 加入 `*.pdf`，完整譜不會被 commit 進 GitHub。

## 3. 樂譜商店 `score-shop`

位置：`score-shop/`（Cloudflare Worker，JavaScript，用 `wrangler` 部署）。

```
score-shop/
  wrangler.toml       Worker 名稱、KV 和 R2 綁定、非機密設定（ECPAY_ENV=stage|prod）
  src/index.js        路由
  src/catalog.js      商品清單（id、曲名、價格、R2 檔名）——價格以這裡為準
  src/ecpay.js        組綠界參數、計算與驗證 CheckMacValue
  src/orders.js       KV 存取訂單與下載次數
  src/mail.js         呼叫 Brevo 寄信
  src/pages.js        購買頁、訂單頁、錯誤頁的 HTML
  test/*.test.js      自動測試（vitest）
  README.md           部署圖文步驟
```

### 機密設定（只放在 Cloudflare Secrets，不進程式碼）
`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`、`BREVO_API_KEY`、`MAIL_FROM`（寄件 Gmail）。

### 流程

1. **`GET /buy?item=<id>`**：顯示曲名、價格、email 欄位、「我同意本商品為數位內容，付款後不適用七日解除權」勾選框。商品不存在就顯示錯誤頁。
2. **`POST /checkout`**：
   - 檢查商品、email 格式、勾選框。
   - 產生訂單編號 `MerchantTradeNo`：`S` + 時間 + 亂數，20 字元以內、只有英數字。
   - 存進 KV：`order:<no>` = `{item, email, amount, status:"pending", createdAt}`。
   - 回傳一個自動送出的表單，把買家帶到綠界 AIO 付款頁（`ChoosePayment=Credit`、`EncryptType=1`、`ReturnURL=/ecpay/notify`、`OrderResultURL=/ecpay/return`）。
   - 金額一律從 `catalog.js` 取，不相信網頁傳來的價格。
3. **`POST /ecpay/notify`**（綠界伺服器呼叫）：
   - 驗證 `CheckMacValue`（SHA256），不對就回錯誤，不改訂單。
   - 確認 `MerchantID`、金額跟訂單一致，`RtnCode == 1` 才算付款成功。
   - 第一次成功：訂單改為 `paid`，產生下載代碼（32 bytes 亂數），存 `dl:<token>` = `{no, expires: 現在+7天, remaining: 5}`，寄 email。
   - 綠界可能重送同一個通知：已經是 `paid` 就不重複產生代碼、不重複寄信。
   - 回應 `1|OK`。
4. **`POST /ecpay/return`**（買家付款後被帶回來）：同樣驗證簽章，然後轉到 `GET /order/<no>`。
5. **`GET /order/<no>`**：
   - `paid`：顯示「付款成功」和下載按鈕。
   - 還是 `pending`：顯示「確認付款中…」，每 3 秒自動重新整理，最多 1 分鐘，之後提示「請查看 email 或來信」。
   - 訂單編號含亂數，不容易被猜到；頁面不顯示完整 email（只顯示 `w***@gmail.com`）。
6. **`GET /dl/<token>`**：檢查是否過期、剩餘次數 > 0；通過就扣 1 次，從 R2 讀出 PDF，以 `Content-Disposition: attachment; filename="<曲名>.pdf"` 回傳。失敗時顯示「連結已過期或已用完，請來信」。

### 寄信內容
主旨：「你購買的樂譜：<曲名>」。內容：曲名、金額、訂單編號、下載按鈕（7 天內、最多 5 次）、聯絡 email。Brevo 寄信失敗不影響訂單，畫面上的下載按鈕照常可用，錯誤寫進 log。

### 測試與正式環境
- `ECPAY_ENV=stage`：用綠界公開的測試商店代號和測試信用卡，網址是 `payment-stage.ecpay.com.tw`。
- 測試流程全部通過後，才換成正式金鑰和 `ECPAY_ENV=prod`（`payment.ecpay.com.tw`）。

## 錯誤處理一覽

| 狀況 | 處理 |
|---|---|
| 商品 id 不存在 | 錯誤頁，連回樂譜專區 |
| email 格式錯、沒勾同意 | 回購買頁，顯示提示，保留已填資料 |
| 綠界簽章不符 | 拒絕，不改訂單，寫 log |
| 金額或商店代號不符 | 拒絕，不改訂單，寫 log |
| 付款失敗（`RtnCode != 1`） | 訂單標記 `failed`，訂單頁提示可以重新購買 |
| 重複通知 | 不重複產生代碼、不重複寄信 |
| 下載連結過期或用完 | 說明頁，請來信 |
| R2 找不到檔案 | 錯誤頁，請來信，寫 log（不扣下載次數） |
| Brevo 寄信失敗 | 不影響下載，寫 log |

## 測試計畫

- **預覽圖**：用兩份實際 PDF 產生，逐張看過：前 4 行清楚，後面看不出音符，總行數與原譜一致。
- **商店自動測試**（vitest + Cloudflare 的 Worker 測試環境）：
  - `CheckMacValue` 計算結果與綠界官方範例一致
  - 簽章錯誤、金額錯誤的通知會被拒絕
  - 重複通知不會產生兩組代碼、不會寄兩封信
  - 下載第 6 次被拒、超過 7 天被拒、R2 缺檔時不扣次數
  - 價格以 `catalog.js` 為準
- **網頁**：用 Playwright 截手機和電腦尺寸的圖檢查版面；確認頁面上沒有任何完整 PDF 的連結。
- **端到端**：部署到 Cloudflare 後，用綠界測試環境實際付一次款（這一步需要使用者部署後一起做）。

## 使用者要做的事

1. 提供兩首的完整音檔（mp3）。
2. 照 `score-shop/README.md` 的圖文步驟：
   - 在 Cloudflare 建立 R2 空間，上傳兩份 PDF
   - 建立 KV、部署 Worker
   - 申請 Brevo 免費帳號，驗證寄件 Gmail，取得 API 金鑰
   - 把綠界和 Brevo 的金鑰貼進 Cloudflare Secrets
3. 用綠界測試環境試買一次，沒問題再換正式金鑰。

## 不在這次範圍

- 分類、搜尋、購物車（一次買多首）
- 會員帳號、購買紀錄頁
- 折扣碼
- 外部平台（ArrangeMe、MyMusicSheet）的上架作業本身
