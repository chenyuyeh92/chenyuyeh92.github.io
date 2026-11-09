// 商店的 HTML 頁面（顏色跟家教網站一致）
import { escapeHtml as e } from './html.js';
import { DOWNLOAD_DAYS, DOWNLOAD_TIMES } from './orders.js';

const CSS = `
:root{--bg:#f2f5f1;--surface:#fff;--ink:#18302a;--muted:#55665f;--line:#d6e0da;--accent:#9b2f40;--on-accent:#fff;--warn:#8a4b00;
--sans:"PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#101a17;--surface:#17241f;--ink:#e6eee9;--muted:#a3b3ab;--line:#2a3a34;--accent:#e07b8b;--on-accent:#1a0d10;--warn:#f0b35a;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.75 var(--sans)}
main{max-width:560px;margin:0 auto;padding:32px 16px 48px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px 20px}
h1{font-size:1.4rem;margin:0 0 4px;line-height:1.4}
.sub{color:var(--muted);margin:0 0 16px}
.price{font-size:1.6rem;font-weight:700;margin:8px 0 16px}
label{display:block;font-weight:600;margin:16px 0 6px}
input[type=email]{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.check{display:flex;gap:10px;align-items:flex-start;font-weight:400}
.check input{width:20px;height:20px;margin-top:4px;flex:none}
.hint{color:var(--muted);font-size:.9rem;margin:6px 0 0}
.error{color:var(--accent);font-weight:600;margin:12px 0 0}
.btn{display:inline-block;width:100%;text-align:center;margin-top:20px;padding:14px 20px;border:0;border-radius:10px;background:var(--accent);color:var(--on-accent);font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
.btn:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
ul{padding-left:1.2em;margin:16px 0 0}
li{margin:4px 0}
a{color:var(--accent)}
.back{display:inline-block;margin-top:20px}
`;

export function layout(title, body, { head = '' } = {}) {
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${e(title)}｜葉宸佑 鋼琴樂譜</title>${head}
<style>${CSS}</style></head><body><main>${body}</main></body></html>`;
}

const backLink = (site) => `<a class="back" href="${e(site)}">← 回樂譜專區</a>`;

export function buyPage({ item, site, email = '', error = '' }) {
  return layout(`購買 ${item.title}`, `<div class="card">
<h1>${e(item.title)}</h1>
<p class="sub">${e(item.subtitle)}・PDF 下載</p>
<p class="price">NT$${item.price}</p>
<form method="post" action="/checkout">
<input type="hidden" name="item" value="${e(item.id)}">
<label for="email">你的 email（下載連結會寄到這裡）</label>
<input id="email" name="email" type="email" required autocomplete="email" inputmode="email" value="${e(email)}">
<p class="hint">請再確認一次 email 有沒有打錯。</p>
<label class="check"><input type="checkbox" name="agree" required><span>我同意本商品為數位內容，付款後不適用七日解除權</span></label>
${error ? `<p class="error" role="alert">${e(error)}</p>` : ''}
<button class="btn" type="submit">前往付款（信用卡）</button>
</form>
<ul class="hint">
<li>付款由綠界科技處理，本站不會看到你的卡號。</li>
<li>付款完成後請等畫面自動跳回本站，會出現下載按鈕，同時寄一封信給你。</li>
<li>下載連結 ${DOWNLOAD_DAYS} 天內有效，最多下載 ${DOWNLOAD_TIMES} 次。</li>
<li>檔案有問題請來信，無法解決時退款。</li>
</ul>
</div>${backLink(site)}`);
}

// 自動送到綠界的表單
export function redirectToEcpay(url, params) {
  const inputs = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${e(k)}" value="${e(v)}">`).join('\n');
  return layout('前往付款', `<div class="card">
<p>正在前往綠界付款頁…</p>
<form id="pay" method="post" action="${e(url)}">
${inputs}
<button class="btn" type="submit">如果沒有自動跳轉，請按這裡</button>
</form></div>
<script>document.getElementById('pay').submit()</script>`);
}

export function paidPage({ order, item, mailed, maskedEmail, site }) {
  return layout('付款成功', `<div class="card">
<h1>付款成功，謝謝你！</h1>
<p class="sub">${e(item.title)}・NT$${order.amount}・訂單編號 ${e(order.no)}</p>
<a class="btn" href="/dl/${e(order.token)}?go=1">下載樂譜（PDF）</a>
<ul class="hint">
${mailed === false
    ? `<li><b>email 沒有寄出去</b>，請直接按上面的按鈕下載，並把這一頁加入書籤。需要的話請寫信給我，附上訂單編號。</li>`
    : `<li>下載連結${mailed ? '也寄到了' : '也會寄到'} ${e(maskedEmail)}，沒看到的話請找找垃圾郵件。</li>`}
<li>連結 ${DOWNLOAD_DAYS} 天內有效，最多下載 ${DOWNLOAD_TIMES} 次，下載後請存在自己的電腦或手機裡。</li>
<li>可以把這一頁加入書籤，之後再回來下載。</li>
</ul></div>${backLink(site)}`);
}

export function pendingPage({ order, n, contact, site }) {
  const waiting = n < 20;
  const head = waiting ? `\n<meta http-equiv="refresh" content="3;url=/order/${e(order.no)}?n=${n + 1}">` : '';
  const body = waiting
    ? `<h1>確認付款中…</h1><p>綠界正在通知我們付款結果，這頁會自動重新整理，請稍等。</p>`
    : `<h1>還在確認付款</h1>
<p>付款結果還沒傳過來。如果你已經付款成功，下載連結會寄到你的 email（也請找找垃圾郵件），或稍後重新整理這一頁。</p>
<p>超過 10 分鐘還沒收到，請寫信到 ${e(contact)}，附上訂單編號 ${e(order.no)}。</p>`;
  return layout('確認付款中', `<div class="card">${body}</div>${backLink(site)}`, { head });
}

export function failedPage({ order, item, site }) {
  return layout('付款沒有成功', `<div class="card">
<h1>付款沒有成功</h1>
<p>這筆訂單（${e(order.no)}）沒有扣款。你可以再試一次，或換一張卡。</p>
<a class="btn" href="/buy?item=${e(item.id)}">重新購買 ${e(item.title)}</a>
</div>${backLink(site)}`);
}

export function messagePage({ title, message, site }) {
  return layout(title, `<div class="card"><h1>${e(title)}</h1><p>${message}</p></div>${backLink(site)}`);
}

export function downloadPage({ token, item, order, remaining, site }) {
  return layout('下載樂譜', `<div class="card">
<h1>${e(item.title)}</h1>
<p class="sub">訂單編號 ${e(order?.no)}・還可以下載 ${remaining} 次</p>
<a class="btn" href="/dl/${e(token)}?go=1">下載樂譜（PDF）</a>
<ul class="hint">
<li>如果是在 LINE、Instagram、Facebook 裡打開這一頁，下載常常會失敗：請按右上角選單，選「用瀏覽器開啟」（Safari 或 Chrome）再下載。</li>
<li>下載後請存在自己的電腦或手機裡。</li>
</ul></div>${`<a class="back" href="${e(site)}">← 回樂譜專區</a>`}`);
}
