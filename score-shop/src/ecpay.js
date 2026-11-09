// 綠界 AIO 金流：組參數、計算與驗證 CheckMacValue（SHA256）

const URLS = {
  stage: 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5',
  prod: 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5',
};

export function checkoutUrl(envName) {
  return envName === 'prod' ? URLS.prod : URLS.stage;
}

// 模擬 .NET HttpUtility.UrlEncode（綠界規定的編碼方式）
function dotnetUrlEncode(s) {
  let enc = encodeURIComponent(s).replace(/'/g, '%27').replace(/~/g, '%7E').toLowerCase().replace(/%20/g, '+');
  for (const [a, b] of [['%2d', '-'], ['%5f', '_'], ['%2e', '.'], ['%21', '!'], ['%2a', '*'], ['%28', '('], ['%29', ')']]) {
    enc = enc.split(a).join(b);
  }
  return enc;
}

export async function checkMacValue(params, hashKey, hashIV) {
  const keys = Object.keys(params)
    .filter((k) => k !== 'CheckMacValue' && params[k] !== undefined)
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : a.toLowerCase() > b.toLowerCase() ? 1 : 0));
  const raw = `HashKey=${hashKey}&${keys.map((k) => `${k}=${params[k]}`).join('&')}&HashIV=${hashIV}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dotnetUrlEncode(raw)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export async function verifyMac(params, hashKey, hashIV) {
  const given = params?.CheckMacValue;
  if (typeof given !== 'string' || !given) return false;
  const expected = await checkMacValue(params, hashKey, hashIV);
  return given.toUpperCase() === expected;
}

// 台灣時間 yyyy/MM/dd HH:mm:ss
function taipeiTime(ms) {
  const d = new Date(ms + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export function buildCheckoutParams({ order, item, env, origin }) {
  return {
    MerchantID: env.ECPAY_MERCHANT_ID,
    MerchantTradeNo: order.no,
    MerchantTradeDate: taipeiTime(order.createdAt),
    PaymentType: 'aio',
    TotalAmount: item.price,
    TradeDesc: '葉宸佑鋼琴樂譜',
    ItemName: `樂譜 ${item.title}（PDF 下載）`,
    ReturnURL: `${origin}/ecpay/notify`,
    OrderResultURL: `${origin}/ecpay/return`,
    ChoosePayment: 'Credit',
    EncryptType: 1,
  };
}
