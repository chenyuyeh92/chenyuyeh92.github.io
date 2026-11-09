// 訂單與下載代碼（Cloudflare KV）
// order:<no> = {no, item, email, amount, status, createdAt, token?}
// dl:<token> = {no, expires, remaining}

export const DOWNLOAD_DAYS = 7;
export const DOWNLOAD_TIMES = 5;
const DAY = 24 * 3600 * 1000;
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ORDER_NO = /^S[0-9A-Za-z]{1,19}$/;

function randomAlnum(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => ALNUM[b % ALNUM.length]).join('');
}

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// S + 台灣時間 yyMMddHHmm + 9 碼亂數 = 20 字元
export function newOrderNo(now = Date.now()) {
  const d = new Date(now + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
  return `S${stamp}${randomAlnum(9)}`;
}

export async function createOrder(kv, { item, email, amount }) {
  const order = { no: newOrderNo(), item, email, amount, status: 'pending', createdAt: Date.now() };
  await kv.put(`order:${order.no}`, JSON.stringify(order));
  return order;
}

export async function getOrder(kv, no) {
  if (typeof no !== 'string' || !ORDER_NO.test(no)) return null;
  return kv.get(`order:${no}`, 'json');
}

export async function markPaid(kv, no) {
  const order = await getOrder(kv, no);
  if (!order) return null;
  if (order.status === 'paid' && order.token) return { order, token: order.token, firstTime: false };
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  await kv.put(`dl:${token}`, JSON.stringify({
    no, expires: Date.now() + DOWNLOAD_DAYS * DAY, remaining: DOWNLOAD_TIMES,
  }));
  const paid = { ...order, status: 'paid', token, paidAt: Date.now() };
  await kv.put(`order:${no}`, JSON.stringify(paid));
  return { order: paid, token, firstTime: true };
}

export async function markFailed(kv, no) {
  const order = await getOrder(kv, no);
  if (!order || order.status === 'paid') return order;
  const failed = { ...order, status: 'failed' };
  await kv.put(`order:${no}`, JSON.stringify(failed));
  return failed;
}

export async function consumeDownload(kv, token, now = Date.now()) {
  const rec = typeof token === 'string' && token ? await kv.get(`dl:${token}`, 'json') : null;
  if (!rec) return { ok: false, reason: 'missing' };
  if (now > rec.expires) return { ok: false, reason: 'expired' };
  if (rec.remaining <= 0) return { ok: false, reason: 'used' };
  await kv.put(`dl:${token}`, JSON.stringify({ ...rec, remaining: rec.remaining - 1 }));
  const order = await getOrder(kv, rec.no);
  return { ok: true, order, remaining: rec.remaining - 1 };
}

export async function refundDownload(kv, token) {
  const rec = await kv.get(`dl:${token}`, 'json');
  if (!rec) return;
  await kv.put(`dl:${token}`, JSON.stringify({ ...rec, remaining: Math.min(DOWNLOAD_TIMES, rec.remaining + 1) }));
}
