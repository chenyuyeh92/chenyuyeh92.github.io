// 葉宸佑 鋼琴樂譜商店（Cloudflare Worker）
// 流程：/buy → /checkout → 綠界 → /ecpay/notify（伺服器通知）、/ecpay/return（買家回來）→ /order/<no> → /dl/<token>
import { getItem } from './catalog.js';
import { buildCheckoutParams, checkMacValue, checkoutUrl, verifyMac } from './ecpay.js';
import { escapeHtml } from './html.js';
import { maskEmail, sendDownloadMail } from './mail.js';
import {
  consumeDownload, createOrder, DOWNLOAD_TIMES, getMailed, getOrder, markFailed, markPaid, peekDownload, setMailed,
} from './orders.js';
import {
  buyPage, downloadPage, failedPage, messagePage, paidPage, pendingPage, redirectToEcpay,
} from './pages.js';
import { testPdf } from './testpdf.js';

const EMAIL = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

const html = (body, status = 200) => new Response(body, {
  status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
});
const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain' } });

const contactOf = (env) => env.CONTACT_EMAIL || env.MAIL_FROM || '';
const notFound = (env, title = '找不到這個頁面') => html(messagePage({
  title, message: '網址可能打錯了，請回樂譜專區重新選擇。', site: env.SITE_URL,
}), 404);

async function readForm(request) {
  const data = await request.formData();
  return Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
}

const isProd = (env) => env.ECPAY_ENV === 'prod';
const tokenSecret = (env) => `${env.ECPAY_HASH_KEY}:${env.ECPAY_HASH_IV}`;

// 綠界回傳的資料是否可信，可信的話把訂單標成已付款。
// sendMail：只有綠界伺服器通知（/ecpay/notify）會寄信，買家回來的那一步不寄，避免同時寄兩封。
async function applyEcpayResult(env, origin, p, { sendMail }) {
  if (!(await verifyMac(p, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV))) return 'bad-mac';
  if (p.MerchantID !== env.ECPAY_MERCHANT_ID) return 'bad-merchant';
  const order = await getOrder(env.ORDERS, p.MerchantTradeNo);
  if (!order) return 'no-order';
  if (Number(p.TradeAmt) !== order.amount) return 'bad-amount';
  if (p.RtnCode !== '1') {
    await markFailed(env.ORDERS, order.no);
    return 'failed';
  }
  // 綠界後台的「模擬付款」只在測試環境接受（設定打錯字也不接受）
  if (p.SimulatePaid === '1' && env.ECPAY_ENV !== 'stage') return 'simulated';
  const result = await markPaid(env.ORDERS, order.no, tokenSecret(env));
  if (sendMail && (await getMailed(env.ORDERS, order.no)) !== true) {
    const item = getItem(order.item);
    const ok = await sendDownloadMail(env, { order: result.order, item, link: `${origin}/dl/${result.token}` });
    await setMailed(env.ORDERS, order.no, ok);
  }
  return 'paid';
}

async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const { origin } = url;
  const site = env.SITE_URL;

  if (request.method === 'GET' && pathname === '/') return Response.redirect(site, 302);

  if (request.method === 'GET' && pathname === '/buy') {
    const item = getItem(url.searchParams.get('item'));
    if (!item) return notFound(env, '找不到這份樂譜');
    return html(buyPage({ item, site }));
  }

  if (request.method === 'POST' && pathname === '/checkout') {
    const f = await readForm(request);
    const item = getItem(f.item);
    if (!item) return notFound(env, '找不到這份樂譜');
    const email = (f.email || '').trim();
    if (!EMAIL.test(email) || email.length > 254) {
      return html(buyPage({ item, site, email, error: 'email 格式不正確，請再檢查一次。' }));
    }
    if (f.agree !== 'on') {
      return html(buyPage({ item, site, email, error: '請勾選同意，才能前往付款。' }));
    }
    const order = await createOrder(env.ORDERS, { item: item.id, email, amount: item.price });
    const params = buildCheckoutParams({ order, item, env, origin });
    params.CheckMacValue = await checkMacValue(params, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
    return html(redirectToEcpay(checkoutUrl(env.ECPAY_ENV), params));
  }

  if (request.method === 'POST' && pathname === '/ecpay/notify') {
    const p = await readForm(request);
    const r = await applyEcpayResult(env, origin, p, { sendMail: true });
    if (['paid', 'failed', 'simulated'].includes(r)) return text('1|OK');
    console.error('ecpay notify rejected', r, p.MerchantTradeNo);
    return text('0|ErrorMessage', 400);
  }

  if (request.method === 'POST' && pathname === '/ecpay/return') {
    const p = await readForm(request);
    const r = await applyEcpayResult(env, origin, p, { sendMail: false });
    if (r !== 'paid' && r !== 'failed') console.error('ecpay return', r, p.MerchantTradeNo);
    const order = await getOrder(env.ORDERS, p.MerchantTradeNo);
    if (!order) return notFound(env, '找不到這筆訂單');
    return Response.redirect(`${origin}/order/${order.no}`, 303);
  }

  const orderMatch = pathname.match(/^\/order\/([^/]+)$/);
  if (request.method === 'GET' && orderMatch) {
    const order = await getOrder(env.ORDERS, orderMatch[1]);
    if (!order) return notFound(env, '找不到這筆訂單');
    const item = getItem(order.item);
    if (order.status === 'paid') {
      const mailed = await getMailed(env.ORDERS, order.no);
      return html(paidPage({ order, item, mailed, maskedEmail: maskEmail(order.email), site }));
    }
    if (order.status === 'failed') return html(failedPage({ order, item, site }));
    const n = Math.max(0, Math.min(99, parseInt(url.searchParams.get('n'), 10) || 0));
    return html(pendingPage({ order, n, contact: contactOf(env), site }));
  }

  const dlMatch = pathname.match(/^\/dl\/([^/]+)$/);
  if (request.method === 'GET' && dlMatch) {
    const token = dlMatch[1];
    const contact = escapeHtml(contactOf(env));
    const peek = await peekDownload(env.ORDERS, token);
    const item = peek.ok ? getItem(peek.order?.item) : null;
    if (!peek.ok || !item) {
      const msg = {
        expired: ['下載連結已過期', `下載連結只有 7 天有效。請寫信到 ${contact}，附上訂單編號，我會再開一次下載給你。`, 410],
        used: ['下載次數已用完', `這個連結已經下載 ${DOWNLOAD_TIMES} 次了。如果還需要，請寫信到 ${contact}，附上訂單編號。`, 410],
      }[peek.reason] || ['找不到這個下載連結', `連結可能不完整，請從信裡的按鈕重新點一次。還是不行請寫信到 ${contact}。`, 404];
      return html(messagePage({ title: msg[0], message: msg[1], site }), msg[2]);
    }
    // 沒有 ?go=1：先顯示說明頁，不扣次數（email 防毒掃描會自動點開信裡的連結）
    if (url.searchParams.get('go') !== '1') {
      return html(downloadPage({ token, item, order: peek.order, remaining: peek.remaining, site }));
    }
    // 先確認檔案在，才扣次數
    if (isProd(env) && !(await env.SCORES.head(item.file))) {
      console.error('score file missing', item.file);
      return html(messagePage({
        title: '檔案暫時無法下載',
        message: `這不會扣你的下載次數。請稍後再試，或寫信到 ${contact}，附上訂單編號 ${escapeHtml(peek.order?.no)}。`,
        site,
      }), 500);
    }
    const r = await consumeDownload(env.ORDERS, token);
    if (!r.ok) return Response.redirect(`${origin}/dl/${token}`, 303);
    const headers = {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${item.id}.pdf"; filename*=UTF-8''${encodeURIComponent(item.title)}.pdf`,
      'cache-control': 'private, no-store',
    };
    if (!isProd(env)) return new Response(testPdf(item), { headers });
    const obj = await env.SCORES.get(item.file);
    if (!obj) return html(messagePage({ title: '檔案暫時無法下載', message: `請稍後再試，或寫信到 ${contact}。`, site }), 500);
    return new Response(obj.body, { headers });
  }

  return notFound(env);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      console.error('unhandled', err);
      return html(messagePage({
        title: '發生錯誤', message: '請稍後再試一次。如果已經付款，不用擔心，付款紀錄都在，下載連結會寄到你的 email。', site: env.SITE_URL,
      }), 500);
    }
  },
};
