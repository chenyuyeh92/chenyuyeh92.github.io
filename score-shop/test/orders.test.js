import { afterEach, describe, expect, it, vi } from 'vitest';
import { maskEmail, sendDownloadMail } from '../src/mail.js';
import {
  consumeDownload, createOrder, getMailed, getOrder, markFailed, markPaid, newOrderNo, peekDownload, setMailed,
} from '../src/orders.js';
import { FakeKV, fakeFetch } from './fakes.js';

const DAY = 24 * 3600 * 1000;

describe('orders', () => {
  it('訂單編號：S 開頭、英數、20 字元以內、不重複', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
      const no = newOrderNo();
      expect(no).toMatch(/^S[0-9A-Za-z]{1,19}$/);
      seen.add(no);
    }
    expect(seen.size).toBe(100);
  });

  it('建單、查詢、付款兩次只產生一組代碼', async () => {
    const kv = new FakeKV();
    const o = await createOrder(kv, { item: 'sabzeruz', email: 'a@b.co', amount: 120 });
    expect((await getOrder(kv, o.no)).status).toBe('pending');
    const first = await markPaid(kv, o.no, 'secret');
    const again = await markPaid(kv, o.no, 'secret');
    expect(first.firstTime).toBe(true);
    expect(again.firstTime).toBe(false);
    expect(again.token).toBe(first.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await getOrder(kv, o.no)).status).toBe('paid');
    expect(await getOrder(kv, 'nope')).toBe(null);
  });

  it('付款失敗', async () => {
    const kv = new FakeKV();
    const o = await createOrder(kv, { item: 'sabzeruz', email: 'a@b.co', amount: 120 });
    await markFailed(kv, o.no);
    expect((await getOrder(kv, o.no)).status).toBe('failed');
  });

  it('下載代碼由訂單編號算出來，同一筆訂單永遠一樣', async () => {
    const kv1 = new FakeKV();
    const kv2 = new FakeKV();
    const o = await createOrder(kv1, { item: 'sabzeruz', email: 'a@b.co', amount: 120 });
    await kv2.put(`order:${o.no}`, JSON.stringify(o));
    expect((await markPaid(kv1, o.no, 'secret')).token).toBe((await markPaid(kv2, o.no, 'secret')).token);
    const kv3 = new FakeKV();
    await kv3.put(`order:${o.no}`, JSON.stringify(o));
    expect((await markPaid(kv1, o.no, 'secret')).token).not.toBe((await markPaid(kv3, o.no, 'other')).token);
  });

  it('寄信紀錄另外存，不改訂單', async () => {
    const kv = new FakeKV();
    const o = await createOrder(kv, { item: 'sabzeruz', email: 'a@b.co', amount: 120 });
    expect(await getMailed(kv, o.no)).toBe(null);
    await setMailed(kv, o.no, false);
    expect(await getMailed(kv, o.no)).toBe(false);
    await setMailed(kv, o.no, true);
    expect(await getMailed(kv, o.no)).toBe(true);
    expect(kv.writes.filter((k) => k === `order:${o.no}`).length).toBe(1);
  });

  it('下載：最多 5 次、7 天、查看不扣次數', async () => {
    const kv = new FakeKV();
    const o = await createOrder(kv, { item: 'sabzeruz', email: 'a@b.co', amount: 120 });
    const { token } = await markPaid(kv, o.no, 'secret');
    const now = Date.now();
    const peek = await peekDownload(kv, token, now);
    expect(peek).toMatchObject({ ok: true, remaining: 5 });
    expect(peek.order.no).toBe(o.no);
    expect((await peekDownload(kv, token, now)).remaining).toBe(5);
    for (let i = 0; i < 5; i++) expect((await consumeDownload(kv, token, now)).ok).toBe(true);
    expect(await consumeDownload(kv, token, now)).toEqual({ ok: false, reason: 'used' });
    expect((await peekDownload(kv, token, now)).reason).toBe('used');
    expect(await consumeDownload(kv, 'xxx', now)).toEqual({ ok: false, reason: 'missing' });
  });

  it('下載：超過 7 天過期', async () => {
    const kv = new FakeKV();
    const o = await createOrder(kv, { item: 'sabzeruz', email: 'a@b.co', amount: 120 });
    const { token } = await markPaid(kv, o.no, 'secret');
    expect((await consumeDownload(kv, token, Date.now() + 7 * DAY - 60000)).ok).toBe(true);
    expect(await consumeDownload(kv, token, Date.now() + 7 * DAY + 60000)).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('mail', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { BREVO_API_KEY: 'k', MAIL_FROM: 'seller@gmail.com' };
  const args = {
    order: { no: 'S1', email: 'buyer@example.com', amount: 100 },
    item: { title: 'Love Like You' },
    link: 'https://shop/dl/abc',
  };

  it('呼叫 Brevo，信裡有下載連結', async () => {
    const f = fakeFetch(201);
    vi.stubGlobal('fetch', f);
    expect(await sendDownloadMail(env, args)).toBe(true);
    expect(f.calls[0].url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(f.calls[0].init.headers['api-key']).toBe('k');
    expect(f.calls[0].body.to[0].email).toBe('buyer@example.com');
    expect(f.calls[0].body.subject).toContain('Love Like You');
    expect(f.calls[0].body.htmlContent).toContain('https://shop/dl/abc');
  });

  it('Brevo 失敗回 false，不丟例外', async () => {
    vi.stubGlobal('fetch', fakeFetch(500));
    expect(await sendDownloadMail(env, args)).toBe(false);
    vi.stubGlobal('fetch', async () => { throw new Error('network'); });
    expect(await sendDownloadMail(env, args)).toBe(false);
  });

  it('maskEmail', () => {
    expect(maskEmail('wilson@gmail.com')).toBe('w***@gmail.com');
    expect(maskEmail('a@b.co')).toBe('a***@b.co');
  });
});
