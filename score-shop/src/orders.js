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

// 下載代碼 = HMAC(secret, 訂單編號)：同一筆訂單不管被處理幾次、同時處理，代碼都一樣
export async function downloadToken(no, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(no))));
}

export async function markPaid(kv, no, secret) {
  const order = await getOrder(kv, no);
  if (!order) return null;
  if (order.status === 'paid' && order.token) return { order, token: order.token, firstTime: false };
  const token = await downloadToken(no, secret);
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

async function readDownload(kv, token, now) {
  const rec = typeof token === 'string' && token ? await kv.get(`dl:${token}`, 'json') : null;
  if (!rec) return { ok: false, reason: 'missing' };
  if (now > rec.expires) return { ok: false, reason: 'expired' };
  if (rec.remaining <= 0) return { ok: false, reason: 'used' };
  return { ok: true, rec };
}

// 只查看，不扣次數
export async function peekDownload(kv, token, now = Date.now()) {
  const r = await readDownload(kv, token, now);
  if (!r.ok) return r;
  return { ok: true, remaining: r.rec.remaining, order: await getOrder(kv, r.rec.no) };
}

export async function consumeDownload(kv, token, now = Date.now()) {
  const r = await readDownload(kv, token, now);
  if (!r.ok) return r;
  const remaining = r.rec.remaining - 1;
  await kv.put(`dl:${token}`, JSON.stringify({ ...r.rec, remaining }));
  return { ok: true, order: await getOrder(kv, r.rec.no), remaining };
}

// 下載信有沒有寄成功，另外存一個 key（避免短時間內重複寫同一筆訂單）
export async function setMailed(kv, no, ok) {
  await kv.put(`mailed:${no}`, ok ? '1' : '0');
}

export async function getMailed(kv, no) {
  const v = await kv.get(`mailed:${no}`);
  return v === null ? null : v === '1';
}
