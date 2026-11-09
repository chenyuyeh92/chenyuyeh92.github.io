import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';
import { checkMacValue } from '../src/ecpay.js';
import { getOrder } from '../src/orders.js';
import { FakeKV, FakeR2, fakeFetch } from './fakes.js';

const ORIGIN = 'https://score-shop.test';
let env;
let mail;

beforeEach(() => {
  env = {
    ORDERS: new FakeKV(),
    SCORES: new FakeR2({ 'love-like-you.pdf': '%PDF-love', 'sabzeruz.pdf': '%PDF-sab' }),
    ECPAY_ENV: 'stage',
    SITE_URL: 'https://chenyuyeh92.github.io/sheet-music/',
    ECPAY_MERCHANT_ID: '3002607',
    ECPAY_HASH_KEY: 'pwFHCqoQZGmho4w6',
    ECPAY_HASH_IV: 'EkRm7iFT261dpevs',
    BREVO_API_KEY: 'k',
    MAIL_FROM: 'seller@example.com',
    CONTACT_EMAIL: 'seller@example.com',
  };
  mail = fakeFetch(201);
  vi.stubGlobal('fetch', mail);
});
afterEach(() => vi.unstubAllGlobals());

const call = (path, init) => worker.fetch(new Request(ORIGIN + path, init), env, { waitUntil() {} });
const form = (obj) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(obj).toString(),
});

async function checkout(item = 'love-like-you', email = 'buyer@example.com', extra = {}) {
  const res = await call('/checkout', form({ item, email, agree: 'on', ...extra }));
  const html = await res.text();
  const no = html.match(/name="MerchantTradeNo" value="([^"]+)"/)?.[1];
  return { res, html, no };
}

async function ecpayPost(path, no, amount, overrides = {}) {
  const p = {
    MerchantID: '3002607', MerchantTradeNo: no, RtnCode: '1', RtnMsg: '交易成功', TradeAmt: String(amount),
    TradeNo: '2611091230123456', PaymentDate: '2026/11/09 12:31:00', PaymentType: 'Credit_CreditCard',
    SimulatePaid: '0', ...overrides,
  };
  p.CheckMacValue = overrides.CheckMacValue ?? await checkMacValue(p, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV);
  return call(path, form(p));
}

describe('購買頁', () => {
  it('顯示曲名、價格、email、七日解除權勾選', async () => {
    const res = await call('/buy?item=love-like-you');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Love Like You');
    expect(html).toContain('NT$100');
    expect(html).toContain('type="email"');
    expect(html).toContain('我同意本商品為數位內容，付款後不適用七日解除權');
    expect(html).toContain('付款完成後請等畫面自動跳回本站');
  });

  it('不存在的商品', async () => {
    const res = await call('/buy?item=x');
    expect(res.status).toBe(404);
    expect(await res.text()).toContain('找不到這份樂譜');
  });
});

describe('結帳', () => {
  it('沒勾同意：回購買頁、保留 email、不建單', async () => {
    const res = await call('/checkout', form({ item: 'sabzeruz', email: 'buyer@example.com' }));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('請勾選同意');
    expect(html).toContain('value="buyer@example.com"');
    expect(env.ORDERS.map.size).toBe(0);
  });

  it('email 格式錯：回購買頁並提示', async () => {
    const res = await call('/checkout', form({ item: 'sabzeruz', email: 'not-an-email', agree: 'on' }));
    expect(await res.text()).toContain('email 格式不正確');
    expect(env.ORDERS.map.size).toBe(0);
  });

  it('email 裡的 HTML 會被跳脫', async () => {
    const res = await call('/checkout', form({ item: 'sabzeruz', email: '"><script>x</script>' }));
    const html = await res.text();
    expect(html).not.toContain('<script>x</script>');
  });

  it('送綠界：金額以商品清單為準、簽章正確', async () => {
    const { html, no } = await checkout('love-like-you', 'buyer@example.com', { amount: '1', TotalAmount: '1' });
    expect(html).toContain('action="https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5"');
    expect(html).toContain('name="TotalAmount" value="100"');
    const fields = Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')]));
    const { CheckMacValue, ...rest } = fields;
    expect(CheckMacValue).toBe(await checkMacValue(rest, env.ECPAY_HASH_KEY, env.ECPAY_HASH_IV));
    const order = await getOrder(env.ORDERS, no);
    expect(order).toMatchObject({ item: 'love-like-you', email: 'buyer@example.com', amount: 100, status: 'pending' });
  });

  it('正式環境用正式網址', async () => {
    env.ECPAY_ENV = 'prod';
    const { html } = await checkout();
    expect(html).toContain('action="https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"');
  });
});

describe('綠界付款通知', () => {
  it('簽章錯誤：拒絕，訂單仍 pending', async () => {
    const { no } = await checkout();
    const res = await ecpayPost('/ecpay/notify', no, 100, { CheckMacValue: 'BAD' });
    expect(await res.text()).toBe('0|ErrorMessage');
    expect((await getOrder(env.ORDERS, no)).status).toBe('pending');
    expect(mail.calls.length).toBe(0);
  });

  it('金額不符：拒絕', async () => {
    const { no } = await checkout();
    const res = await ecpayPost('/ecpay/notify', no, 1);
    expect(await res.text()).toBe('0|ErrorMessage');
    expect((await getOrder(env.ORDERS, no)).status).toBe('pending');
  });

  it('商店代號不符：拒絕', async () => {
    const { no } = await checkout();
    const res = await ecpayPost('/ecpay/notify', no, 100, { MerchantID: '9999999' });
    expect(await res.text()).toBe('0|ErrorMessage');
  });

  it('付款成功：1|OK、訂單 paid、寄一封信；重送不重寄', async () => {
    const { no } = await checkout();
    expect(await (await ecpayPost('/ecpay/notify', no, 100)).text()).toBe('1|OK');
    const order = await getOrder(env.ORDERS, no);
    expect(order.status).toBe('paid');
    expect(mail.calls.length).toBe(1);
    expect(mail.calls[0].body.to[0].email).toBe('buyer@example.com');
    expect(mail.calls[0].body.htmlContent).toContain(`${ORIGIN}/dl/${order.token}`);
    expect(await (await ecpayPost('/ecpay/notify', no, 100)).text()).toBe('1|OK');
    expect(mail.calls.length).toBe(1);
    expect((await getOrder(env.ORDERS, no)).token).toBe(order.token);
  });

  it('付款失敗：訂單 failed，訂單頁可以重新購買', async () => {
    const { no } = await checkout();
    expect(await (await ecpayPost('/ecpay/notify', no, 100, { RtnCode: '10100058', RtnMsg: '失敗' })).text()).toBe('1|OK');
    expect((await getOrder(env.ORDERS, no)).status).toBe('failed');
    const html = await (await call(`/order/${no}`)).text();
    expect(html).toContain('付款沒有成功');
    expect(html).toContain('/buy?item=love-like-you');
  });

  it('正式環境不接受綠界後台的模擬付款', async () => {
    env.ECPAY_ENV = 'prod';
    const { no } = await checkout();
    await ecpayPost('/ecpay/notify', no, 100, { SimulatePaid: '1' });
    expect((await getOrder(env.ORDERS, no)).status).toBe('pending');
    expect(mail.calls.length).toBe(0);
  });
});

describe('付款後回到商店', () => {
  it('綠界帶回來（付款成功、簽章正確）：直接完成並轉到訂單頁', async () => {
    const { no } = await checkout();
    const res = await ecpayPost('/ecpay/return', no, 100);
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${ORIGIN}/order/${no}`);
    expect((await getOrder(env.ORDERS, no)).status).toBe('paid');
    await ecpayPost('/ecpay/notify', no, 100);
    expect(mail.calls.length).toBe(1);
  });

  it('簽章錯誤的回傳不會完成訂單，只轉到訂單頁', async () => {
    const { no } = await checkout();
    const res = await ecpayPost('/ecpay/return', no, 100, { CheckMacValue: 'BAD' });
    expect(res.status).toBe(303);
    expect((await getOrder(env.ORDERS, no)).status).toBe('pending');
  });

  it('還沒收到付款通知：顯示確認中並自動重新整理', async () => {
    const { no } = await checkout();
    const html = await (await call(`/order/${no}`)).text();
    expect(html).toContain('確認付款中');
    expect(html).toMatch(/<meta http-equiv="refresh" content="3;url=\/order\/S[0-9A-Za-z]+\?n=1">/);
  });

  it('等超過一分鐘就不再重新整理，提示看 email 或來信', async () => {
    const { no } = await checkout();
    const html = await (await call(`/order/${no}?n=20`)).text();
    expect(html).not.toContain('http-equiv="refresh"');
    expect(html).toContain('seller@example.com');
  });

  it('已付款：下載按鈕、遮罩後的 email', async () => {
    const { no } = await checkout();
    await ecpayPost('/ecpay/notify', no, 100);
    const { token } = await getOrder(env.ORDERS, no);
    const html = await (await call(`/order/${no}`)).text();
    expect(html).toContain('付款成功');
    expect(html).toContain(`href="/dl/${token}"`);
    expect(html).toContain('b***@example.com');
    expect(html).not.toContain('buyer@example.com');
  });

  it('寄信失敗時，付款成功頁不說「已寄出」，改提醒直接下載', async () => {
    vi.stubGlobal('fetch', fakeFetch(500));
    const { no } = await checkout();
    await ecpayPost('/ecpay/notify', no, 100);
    const html = await (await call(`/order/${no}`)).text();
    expect(html).toContain('付款成功');
    expect(html).not.toContain('下載連結也寄到了');
    expect(html).toContain('email 沒有寄出去');
  });

  it('訂單不存在', async () => {
    expect((await call('/order/Sxxxxxxxx')).status).toBe(404);
  });
});

describe('下載', () => {
  async function paidToken(item = 'love-like-you', amount = 100) {
    const { no } = await checkout(item);
    await ecpayPost('/ecpay/notify', no, amount);
    return (await getOrder(env.ORDERS, no)).token;
  }

  it('回傳 PDF，檔名用 UTF-8 編碼', async () => {
    const token = await paidToken('sabzeruz', 120);
    const res = await call(`/dl/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain("filename*=UTF-8''Genshin%20Dance%20of%20Sabzeruz.pdf");
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.text()).toBe('%PDF-sab');
  });

  it('第 6 次下載被拒', async () => {
    const token = await paidToken();
    for (let i = 0; i < 5; i++) expect((await call(`/dl/${token}`)).status).toBe(200);
    const res = await call(`/dl/${token}`);
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('已經下載 5 次');
  });

  it('亂打的代碼', async () => {
    expect((await call('/dl/abc')).status).toBe(404);
  });

  it('R2 找不到檔案：錯誤頁、不扣次數', async () => {
    const token = await paidToken();
    env.SCORES = new FakeR2({});
    expect((await call(`/dl/${token}`)).status).toBe(500);
    env.SCORES = new FakeR2({ 'love-like-you.pdf': '%PDF-love' });
    for (let i = 0; i < 5; i++) expect((await call(`/dl/${token}`)).status).toBe(200);
  });
});

describe('其他', () => {
  it('首頁轉到樂譜專區', async () => {
    const res = await call('/');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(env.SITE_URL);
  });
  it('不存在的路徑', async () => {
    expect((await call('/nope')).status).toBe(404);
  });
});
