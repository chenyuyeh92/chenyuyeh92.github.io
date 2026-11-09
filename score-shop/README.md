# 樂譜商店（score-shop）部署步驟

這是家教網站「樂譜專區」的付款和下載系統，跟莫札特遊戲的 mozart-shop 分開。
你只要照著做一次，之後新增樂譜只需要做「新增一首樂譜」那一段。

> 所有金鑰（綠界、Brevo）都只貼進 Cloudflare，**不要**寫進任何檔案、也不要傳給別人。

---

## 0. 準備

1. 安裝 [Node.js](https://nodejs.org/)（選 LTS 版本，一直按「下一步」就好）。
2. 打開「命令提示字元」（Windows 開始選單搜尋 `cmd`），切到這個資料夾：

   ```bash
   cd 你的路徑\chenyuyeh92.github.io\score-shop
   ```

3. 安裝需要的工具（只要做一次）：

   ```bash
   npm install
   ```

4. 登入 Cloudflare（會打開瀏覽器，按「Allow」）：

   ```bash
   npx wrangler login
   ```

## 1. 建立存訂單的地方（KV）

```bash
npx wrangler kv namespace create ORDERS
```

畫面上會出現一段 `id = "一串英文數字"`。打開 `wrangler.toml`，把 `REPLACE_WITH_KV_ID` 換成那串英文數字。

順便在 `wrangler.toml` 的 `CONTACT_EMAIL = ""` 填上你的聯絡 email（買家有問題時會看到）。

## 2. 建立放完整樂譜的地方（R2）並上傳 PDF

第一次用 R2 時，Cloudflare 網頁會要你先到「R2」頁面按一次啟用（免費額度很夠用，可能會要求綁信用卡，但不會扣款）。

```bash
npx wrangler r2 bucket create score-files
npx wrangler r2 object put score-files/love-like-you.pdf --file "Love Like You 的 PDF 路徑" --remote
npx wrangler r2 object put score-files/sabzeruz.pdf --file "原神 Sabzeruz 的 PDF 路徑" --remote
```

檔名（`love-like-you.pdf`、`sabzeruz.pdf`）要跟 `src/catalog.js` 裡的 `file` 一模一樣。
R2 是私人的，外面的人直接連不到，只有付款後的下載連結拿得到。

## 3. 申請 Brevo（寄下載信用）

1. 到 [brevo.com](https://www.brevo.com/) 註冊免費帳號。
2. 右上角你的名字 →「Senders, Domains & Dedicated IPs」→「Senders」→「Add a sender」，填你的 Gmail，到 Gmail 收驗證信完成驗證。
3. 右上角你的名字 →「SMTP & API」→「API Keys」→「Generate a new API key」，複製那串金鑰（只會顯示一次）。

## 4. 把金鑰貼進 Cloudflare

每一行執行後，畫面會請你貼上值，貼完按 Enter：

```bash
npx wrangler secret put ECPAY_MERCHANT_ID
npx wrangler secret put ECPAY_HASH_KEY
npx wrangler secret put ECPAY_HASH_IV
npx wrangler secret put BREVO_API_KEY
npx wrangler secret put MAIL_FROM
```

**先用綠界測試環境的金鑰**（這是綠界公開給大家測試用的）：

| 名稱 | 值 |
|---|---|
| ECPAY_MERCHANT_ID | `3002607` |
| ECPAY_HASH_KEY | `pwFHCqoQZGmho4w6` |
| ECPAY_HASH_IV | `EkRm7iFT261dpevs` |
| BREVO_API_KEY | 第 3 步複製的金鑰 |
| MAIL_FROM | 第 3 步驗證過的 Gmail |

## 5. 部署

```bash
npx wrangler deploy
```

最後會顯示網址，像 `https://score-shop.你的帳號.workers.dev`。
**把這個網址告訴我（或自己改）**：樂譜專區頁面 `sheet-music/index.html` 最上面的 `SHOP` 要換成這個網址。

## 6. 用測試環境試買一次

1. 打開樂譜專區，按「購買」，填你自己的 email，勾同意，前往付款。
2. 在綠界測試付款頁輸入測試信用卡：
   - 卡號 `4311-9522-2222-2222`
   - 有效期限：任何未來的月份年份
   - 背面三碼 `222`
   - 如果有簡訊驗證碼，照綠界畫面上的測試說明填寫
3. 付款後應該會自動回到「付款成功」畫面，按「下載樂譜」能下載 PDF。
4. 檢查 email 有沒有收到下載信（也看看垃圾郵件）。
5. 再試一次故意不勾同意、打錯 email，看提示是否正確。

## 7. 換成正式環境（真的收錢）

1. 到[綠界廠商後台](https://vendor.ecpay.com.tw/)→「系統開發管理」→「系統介接設定」，找到你的特店編號、HashKey、HashIV（跟莫札特遊戲用的是同一組）。
2. 重新設定三個綠界金鑰：

   ```bash
   npx wrangler secret put ECPAY_MERCHANT_ID
   npx wrangler secret put ECPAY_HASH_KEY
   npx wrangler secret put ECPAY_HASH_IV
   ```

3. 打開 `wrangler.toml`，把 `ECPAY_ENV = "stage"` 改成 `ECPAY_ENV = "prod"`，再部署一次：

   ```bash
   npx wrangler deploy
   ```

4. 自己用真的卡買一份最便宜的確認一次（之後可以在綠界後台退刷）。

---

## 新增一首樂譜

1. 產生預覽圖（在 `chenyuyeh92.github.io` 資料夾執行）：

   ```bash
   python3 tools/make-preview.py "新樂譜.pdf" 新曲子的英文代號
   ```

2. 上傳完整 PDF 到 R2：

   ```bash
   npx wrangler r2 object put score-files/新曲子的英文代號.pdf --file "新樂譜.pdf" --remote
   ```

3. 在 `src/catalog.js` 加一筆（id、曲名、價格、檔名），執行 `npx wrangler deploy`。
4. 在 `sheet-music/index.html` 複製一張卡片改內容。

## 下架一首樂譜

1. 從 `src/catalog.js` 刪掉那一筆，執行 `npx wrangler deploy`（之後就買不到了）。
2. 從 `sheet-music/index.html` 刪掉那張卡片。
3. 已經買的人的下載連結：如果也要停用，刪掉 R2 裡的檔案：

   ```bash
   npx wrangler r2 object delete score-files/那首的檔名.pdf --remote
   ```

## 查問題

- 看即時紀錄：`npx wrangler tail`
- Cloudflare 網頁 → Workers & Pages → score-shop →「Logs」也看得到。
- 跑自動測試：`npm test`
