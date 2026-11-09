#!/usr/bin/env node
// 補發下載連結：買家說連結過期、次數用完、或沒收到信時使用
// 用法：npm run reissue -- S2611091230abcdefgh
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DOWNLOAD_DAYS, DOWNLOAD_TIMES } from '../src/orders.js';

export function reissueRecord(order, now = Date.now()) {
  if (order.status !== 'paid' || !order.token) throw new Error('這筆訂單還沒付款，不能補發');
  return {
    key: `dl:${order.token}`,
    value: { no: order.no, expires: now + DOWNLOAD_DAYS * 86400000, remaining: DOWNLOAD_TIMES },
  };
}

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args, '--binding', 'ORDERS', '--remote'], { encoding: 'utf8' });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const no = process.argv[2];
  if (!/^S[0-9A-Za-z]{1,19}$/.test(no || '')) {
    console.error('請輸入訂單編號，例如：npm run reissue -- S2611091230abcdefgh');
    process.exit(1);
  }
  const order = JSON.parse(wrangler(['kv', 'key', 'get', `order:${no}`]));
  const { key, value } = reissueRecord(order);
  wrangler(['kv', 'key', 'put', key, JSON.stringify(value)]);
  console.log(`已補發：${order.email} 的訂單 ${no}，${DOWNLOAD_DAYS} 天內可下載 ${DOWNLOAD_TIMES} 次。`);
  console.log('把這個網址寄給買家（把網址開頭換成你的商店網址）：');
  console.log(`https://score-shop.mozart-shop.workers.dev/order/${no}`);
}
