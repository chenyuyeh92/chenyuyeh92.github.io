# 交接：樂譜專區與樂譜商店（給在使用者電腦上的 Claude）

日期：2026-11-09
分支：`claude/admiring-cori-17cqzu`（已推上 GitHub，**還沒合併到 main，網站上還看不到**）

## 使用者想要的

在家教網站 chenyuyeh92.github.io 開「樂譜專區」，賣自己改編的鋼琴譜。買家看前 4 行預覽、聽完整音檔，用**綠界信用卡**付款，付款後畫面出現下載按鈕，同時寄 email。使用者希望操作越簡單越好。

## 已經做好的（都在這個分支）

| 東西 | 位置 | 狀態 |
|---|---|---|
| 設計文件 | `docs/superpowers/specs/2026-11-09-sheet-music-shop-design.md` | 使用者已確認 |
| 實作計畫 | `docs/superpowers/plans/2026-11-09-sheet-music-shop.md` | 全部完成 |
| 樂譜專區頁面 | `sheet-music/index.html`、`style.css`、首頁選單和作品區連結、`sitemap.xml` | 完成，含兩首預覽圖和 mp3 |
| 預覽圖工具 | `tools/make-preview.py` | 完成，兩首預覽圖已產生並人工檢查 |
| 樂譜商店（Cloudflare Worker） | `score-shop/` | 程式完成，52 個測試通過，**還沒部署** |
| 一鍵設定程式 | `score-shop/scripts/setup.mjs`（`npm run setup`） | 寫好、部分測試，**還沒在真的 Cloudflare 跑過** |
| 部署說明 | `score-shop/README.md` | 完成 |

商品：`love-like-you`「Love Like You」NT$100、`sabzeruz`「Genshin Dance of Sabzeruz」NT$120（價格以 `score-shop/src/catalog.js` 為準）。
2026-11-10 新增：`fontaine-easy`「Genshin Fontaine Theme（簡單版）」NT$100、`fontaine-medium`「Genshin Fontaine Theme（中等版）」NT$150（PDF 已手動上傳 R2；`scripts/setup.mjs` 只會處理最早的兩首）。
2026-11-11：簡單版、中等版換成新版譜與音檔；新增 `fontaine-duet`「Genshin Fontaine Theme（四手聯彈）」NT$150。三份 PDF 都已上傳 R2 並比對過跟原檔相同。
2026-11-12 新增：`my-dearest`「My Dearest」NT$120（PDF 已上傳 R2 並比對過）。
2026-11-17 新增免費樂譜：〈巧克力薯餅〉PDF 直接放在 `sheet-music/free/`（`.gitignore` 對這個資料夾開例外），不經過商店。
聯絡信箱：使用者指定 `chenyouye493@gmail.com`（已寫在 `score-shop/wrangler.toml` 的 `CONTACT_EMAIL`）。

## 還沒做的（接手後要做的）

1. **部署 score-shop 到使用者的 Cloudflare 帳號**（先用綠界測試環境）：
   - 在 `score-shop/` 執行 `npm install`，再 `npm run setup`（或照 README 第 0～6 步手動做）。
   - 需要：`npx wrangler login`（使用者在瀏覽器按 Allow）、建立 KV `ORDERS` 並把 id 填進 `wrangler.toml`、建立 R2 bucket `score-files`、上傳兩份完整 PDF 成 `love-like-you.pdf` 和 `sabzeruz.pdf`、`wrangler deploy`、設定 secrets（測試環境用綠界公開測試金鑰 `3002607` / `pwFHCqoQZGmho4w6` / `EkRm7iFT261dpevs`，加上 `MAIL_FROM`）。
   - **完整 PDF 在使用者電腦上**，不在 GitHub（`.gitignore` 排除了 `*.pdf`，請不要 commit）。
2. **確認商店網址**：頁面預設連到 `https://score-shop.mozart-shop.workers.dev`（假設跟現有的 mozart-shop 同一個 workers.dev 子網域）。部署後網址不同的話，改 `sheet-music/index.html` 兩個購買按鈕和 `score-shop/scripts/reissue.mjs` 最後一行，commit 並推到同一個分支。
3. **用綠界測試卡試買**：`4311-9522-2222-2222`、背面 `222`、任何未來的有效期限。測試環境下載到的是「TEST FILE」假檔案，這是故意的（見下方安全事項）。
4. **Brevo（寄下載信）**：使用者註冊 brevo.com，驗證寄件 email，產生 API 金鑰，用 `npx wrangler secret put BREVO_API_KEY` 設定。沒設定時不會寄信，但下載按鈕照常可用。
5. **換正式環境**：使用者在綠界廠商後台→系統開發管理→系統介接設定，取得正式的特店編號、HashKey、HashIV（跟莫札特遊戲用同一組），用 `wrangler secret put` 設定；`wrangler.toml` 改 `ECPAY_ENV = "prod"` 再部署；用真卡買一份確認拿到真的 PDF。
6. **最後才公開**：確認正式環境沒問題後，再把分支合併到 main（GitHub Pages 才會顯示樂譜專區）。

## 重要的安全事項（請不要改掉）

- **測試環境只給假 PDF**：綠界測試金鑰是公開的，任何人都能偽造付款，所以 `ECPAY_ENV` 不是 `prod` 時，`/dl` 只回傳 `src/testpdf.js` 產生的 TEST FILE。
- **樂譜專區要等正式環境好了才合併到 main**，不然買家會被帶去綠界測試頁、買到假檔案。
- 金鑰只放 Cloudflare secrets，不要寫進任何檔案或 commit。
- 綠界簽章（CheckMacValue）已用綠界官方範例驗證過，`src/ecpay.js` 不需要改。

## 背景

- 現有的「莫札特遊戲電腦版」也是用綠界 + Cloudflare Worker（`mozart-shop`）賣的，但它的程式碼不在 GitHub。使用者說之前沒這麼複雜，**它可能在這台電腦上**（找含有 `wrangler.toml` 或 `wrangler.jsonc` 的資料夾，或名稱含 `mozart-shop` 的資料夾）。如果找到，可以參考它當初怎麼部署、wrangler 是否已經登入、寄信用什麼服務。**不要修改 mozart-shop。**
- 雲端那邊的 Claude 沒辦法操控使用者電腦，使用者也不想把 Cloudflare 權杖交給雲端，所以改在電腦上接手。
- 版權：兩首都是有版權作品（Steven Universe、原神）的改編。使用者已被告知風險並決定上架，被檢舉就下架（下架方法見 README）。

## 怎麼驗證

```bash
cd score-shop && npm install && npm test
python3 -m pytest -q tools/test_make_preview.py
```

本機試跑商店：在 `score-shop/` 建 `.dev.vars`（內容同上面的測試金鑰，已被 `.gitignore` 排除），執行 `npx wrangler dev`，打開 `http://127.0.0.1:8787/buy?item=love-like-you`。

## 2026-11-17（二）新增〈人生は夢だらけ〉
- id `jinsei-yume-darake`，NT$100，5 頁，作曲椎名林檎、改編 Marco Yeh；試聽音檔 4 分 00 秒
- 預覽 `--cut 1:0.77`（第 1 頁前 4 行清楚，自動偵測只抓到 3 行，不可信）
- R2 已上傳並核對 sha1 一致（384c9c76…），Worker 已部署

## 2026-11-19（四）新增〈We Are Number One〉
- id `we-are-number-one`，NT$80（負責人 2026-11-19 確認），1 頁，試聽 47 秒
- 只有 1 頁，所以只給看前 2 行（`--cut 1:0.398`）；網頁說明的「前 4 行」改成「前幾行」

## 2026-11-20（五）新增〈When You Wish Upon a Star〉
- id `wish-upon-a-star`，NT$120（負責人指定），2 頁，爵士風改編，試聽 1 分 37 秒
- 預覽 `--cut 1:0.803`（0.785 會切到第 4 行低音譜的加線）

## 2026-11-20（五）新增〈When You Wish Upon a Star〉簡易版兩份
- `wish-easy-staff`（五線譜）、`wish-easy-jianpu`（簡譜），各 NT$80（負責人指定），各 2 頁，初級
- 兩張卡片共用音檔 `audio/wish-easy.mp3`（1 分 37 秒）
- 預覽 `--cut 1:0.68`（五線譜）、`--cut 1:0.69`（簡譜）

## 2026-11-21（六）新增〈童年〉簡易版簡譜
- id `tong-nian`，NT$80（負責人指定），1 頁，初級，羅大佑作曲，試聽 1 分 45 秒
- 只有 1 頁，所以只給看前 2 行（`--cut 1:0.425`）

## 2026-11-27（五）新增〈Deck the Halls〉兩份免費樂譜
- `sheet-music/free/deck-the-halls-duet.pdf`（師生合奏：第 1 頁四行總譜、第 2 頁學生分譜）、`deck-the-halls-easy.pdf`（簡易版 1 頁）
- 音檔各一：duet 45 秒、easy 44 秒（兩個檔名都是亂碼，用低頻音量判斷：合奏版低音多約 10 dB）
- 預覽 `--cut 99:0`（免費不打馬賽克），有 Marco Yeh 浮水印；免費曲不進 catalog.js、不用部署 Worker

## 2026-11-27（五）新增〈White Christmas〉聖誕爵士版
- id `white-christmas`，NT$80（負責人指定），2 頁，中級（Slow Ballad 爵士和聲），Irving Berlin 作曲，試聽 2 分 12 秒
- 預覽 `--cut 1:0.772`（第 1 頁共 5 行，露前 4 行）
