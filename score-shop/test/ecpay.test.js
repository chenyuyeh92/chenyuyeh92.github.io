import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getItem } from '../src/catalog.js';
import { buildCheckoutParams, checkMacValue, checkoutUrl, verifyMac } from '../src/ecpay.js';

// 綠界公開的測試商店金鑰
const KEY = 'pwFHCqoQZGmho4w6';
const IV = 'EkRm7iFT261dpevs';

// 依綠界文件規則，用 Node 的 crypto 另外算一次，當作對照
function reference(params) {
  const keys = Object.keys(params).filter((k) => k !== 'CheckMacValue')
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  const raw = `HashKey=${KEY}&${keys.map((k) => `${k}=${params[k]}`).join('&')}&HashIV=${IV}`;
  // .NET 的 UrlEncode 會把 ' 和 ~ 編碼，encodeURIComponent 不會，所以要補
  let enc = encodeURIComponent(raw).replace(/'/g, '%27').replace(/~/g, '%7E').toLowerCase().replace(/%20/g, '+');
  for (const [a, b] of [['%2d', '-'], ['%5f', '_'], ['%2e', '.'], ['%21', '!'], ['%2a', '*'], ['%28', '('], ['%29', ')']]) {
    enc = enc.split(a).join(b);
  }
  return createHash('sha256').update(enc).digest('hex').toUpperCase();
}

describe('checkMacValue', () => {
  it('跟依文件規則獨立算出的值一樣', async () => {
    const p = { MerchantID: '3002607', A: 'b c', z: "(x)!*-_.'~", ItemName: '樂譜 Love Like You' };
    expect(await checkMacValue(p, KEY, IV)).toBe(reference(p));
  });

  it('verifyMac：正確的通過，改任何一個欄位就不通過', async () => {
    const p = { MerchantID: '3002607', MerchantTradeNo: 'S123', RtnCode: '1', TradeAmt: '100' };
    p.CheckMacValue = await checkMacValue(p, KEY, IV);
    expect(await verifyMac(p, KEY, IV)).toBe(true);
    expect(await verifyMac({ ...p, TradeAmt: '1' }, KEY, IV)).toBe(false);
    expect(await verifyMac({ ...p, CheckMacValue: undefined }, KEY, IV)).toBe(false);
    expect(await verifyMac({ ...p, CheckMacValue: p.CheckMacValue.toLowerCase() }, KEY, IV)).toBe(true);
  });
});

describe('catalog', () => {
  it('價格和檔名', () => {
    expect(getItem('love-like-you')).toMatchObject({ title: 'Love Like You', price: 100, file: 'love-like-you.pdf' });
    expect(getItem('sabzeruz')).toMatchObject({ title: 'Genshin Dance of Sabzeruz', price: 120, file: 'sabzeruz.pdf' });
    expect(getItem('x')).toBe(null);
    expect(getItem('toString')).toBe(null);
    expect(getItem(undefined)).toBe(null);
  });
});

describe('buildCheckoutParams', () => {
  it('金額來自商品清單，欄位齊全', () => {
    const item = getItem('love-like-you');
    const order = { no: 'S2611091230abcd', createdAt: Date.UTC(2026, 10, 9, 4, 30, 5) };
    const p = buildCheckoutParams({ order, item, env: { ECPAY_MERCHANT_ID: '3002607' }, origin: 'https://shop.example' });
    expect(p).toMatchObject({
      MerchantID: '3002607',
      MerchantTradeNo: 'S2611091230abcd',
      MerchantTradeDate: '2026/11/09 12:30:05',   // 台灣時間 UTC+8
      PaymentType: 'aio',
      TotalAmount: 100,
      ChoosePayment: 'Credit',
      EncryptType: 1,
      ReturnURL: 'https://shop.example/ecpay/notify',
      OrderResultURL: 'https://shop.example/ecpay/return',
    });
    expect(p.ItemName).toContain('Love Like You');
    expect(p.CheckMacValue).toBeUndefined();
  });

  it('checkoutUrl', () => {
    expect(checkoutUrl('stage')).toBe('https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5');
    expect(checkoutUrl('prod')).toBe('https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5');
  });
});
