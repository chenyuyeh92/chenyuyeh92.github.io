#!/usr/bin/env node
// 一鍵設定樂譜商店：npm run setup
// 會依序：登入 Cloudflare → 建立 KV → 建立 R2 → 上傳 pdf/ 資料夾裡的兩份樂譜 → 部署 → 設定金鑰（先用綠界測試環境）
// 重複執行沒關係，已經做好的步驟會跳過。
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOML = join(ROOT, 'wrangler.toml');
const PDF_DIR = join(ROOT, 'pdf');
const BUCKET = 'score-files';
// 綠界公開的測試環境金鑰（正式收錢前要換成你自己的，見 README 第 7 步）
const ECPAY_STAGE = { ECPAY_MERCHANT_ID: '3002607', ECPAY_HASH_KEY: 'pwFHCqoQZGmho4w6', ECPAY_HASH_IV: 'EkRm7iFT261dpevs' };
const DEFAULT_MAIL = 'chenyouye493@gmail.com';

export function parseKvId(out) {
  const m = String(out).match(/"?id"?\s*[=:]\s*"([0-9a-f]{32})"/);
  return m ? m[1] : null;
}

export function fillKvId(toml, id) {
  return toml.replace('id = "REPLACE_WITH_KV_ID"', `id = "${id}"`);
}

export function parseDeployUrl(out) {
  const m = String(out).match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i);
  return m ? m[0] : null;
}

export function matchPdfs(files) {
  const found = {};
  for (const f of files) {
    if (!/\.pdf$/i.test(f)) continue;
    const name = f.toLowerCase().replace(/[\s_-]+/g, '');
    if (name.includes('lovelikeyou')) found['love-like-you'] = f;
    else if (name.includes('sabzeruz')) found.sabzeruz = f;
  }
  return found;
}

const isWin = process.platform === 'win32';
const quote = (a) => (isWin && /[\s"&|<>^()]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

function wrangler(args, { capture = true } = {}) {
  const r = spawnSync('npx', ['wrangler', ...args].map(quote), {
    cwd: ROOT, shell: isWin, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  return { ok: r.status === 0, out: `${r.stdout || ''}\n${r.stderr || ''}` };
}

function step(n, text) { console.log(`\n【${n}】${text}`); }
function done(text) { console.log(`  ✔ ${text}`); }
function fail(text, out) {
  console.error(`\n  ✘ ${text}`);
  if (out) console.error(out.trim().split('\n').slice(-15).join('\n'));
  console.error('\n請把上面這段訊息截圖或複製給 Claude。');
  process.exit(1);
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q) => (await rl.question(q)).trim();
  console.log('=== 樂譜商店一鍵設定 ===');

  step(1, '登入 Cloudflare');
  if (/not authenticated|You are not logged in/i.test(wrangler(['whoami']).out)) {
    console.log('  會打開瀏覽器，請在 Cloudflare 頁面按「Allow」，按完回到這個視窗。');
    if (!wrangler(['login'], { capture: false }).ok) fail('登入沒有成功');
  }
  done('已登入');

  step(2, '建立存訂單的地方（KV）');
  let toml = readFileSync(TOML, 'utf8');
  if (toml.includes('REPLACE_WITH_KV_ID')) {
    let r = wrangler(['kv', 'namespace', 'create', 'ORDERS']);
    let id = parseKvId(r.out);
    if (!id) {
      r = wrangler(['kv', 'namespace', 'list']);
      try {
        const ns = JSON.parse(r.out.slice(r.out.indexOf('['), r.out.lastIndexOf(']') + 1))
          .find((n) => /ORDERS/.test(n.title));
        id = ns?.id || null;
      } catch { /* 下面處理 */ }
    }
    if (!id) fail('建立 KV 沒有成功', r.out);
    writeFileSync(TOML, fillKvId(toml, id));
    toml = readFileSync(TOML, 'utf8');
  }
  done('KV 好了');

  step(3, '建立放完整樂譜的地方（R2）');
  for (;;) {
    const r = wrangler(['r2', 'bucket', 'create', BUCKET]);
    if (r.ok || /already exists|already own/i.test(r.out)) break;
    if (/enable R2|R2 is not enabled|purchase|10042/i.test(r.out)) {
      console.log('  你的帳號還沒啟用 R2。請到 https://dash.cloudflare.com 左邊選單點「R2 Object Storage」，照畫面按啟用（免費額度內不會扣款）。');
      await ask('  啟用好了請按 Enter 繼續…');
      continue;
    }
    fail('建立 R2 沒有成功', r.out);
  }
  done('R2 好了');

  step(4, '上傳兩份完整樂譜 PDF');
  mkdirSync(PDF_DIR, { recursive: true });
  for (;;) {
    const pdfs = matchPdfs(readdirSync(PDF_DIR));
    const missing = ['love-like-you', 'sabzeruz'].filter((id) => !pdfs[id]);
    if (missing.length === 0) {
      for (const [id, file] of Object.entries(pdfs)) {
        const r = wrangler(['r2', 'object', 'put', `${BUCKET}/${id}.pdf`, '--file', join(PDF_DIR, file), '--remote']);
        if (!r.ok) fail(`上傳 ${file} 沒有成功`, r.out);
        done(`已上傳 ${file}`);
      }
      break;
    }
    console.log(`  請把兩份樂譜 PDF 放進這個資料夾：\n  ${PDF_DIR}`);
    console.log('  （檔名裡要有「Love Like You」或「Sabzeruz」，不用改名。這個資料夾不會上傳到 GitHub。）');
    await ask('  放好了請按 Enter 繼續…');
  }

  step(5, '部署商店');
  const dep = wrangler(['deploy']);
  if (!dep.ok) fail('部署沒有成功', dep.out);
  const url = parseDeployUrl(dep.out);
  done(`商店網址：${url}`);

  step(6, '設定金鑰（先用綠界測試環境）');
  const mail = (await ask(`  在 Brevo 驗證過的寄件 email（直接按 Enter 用 ${DEFAULT_MAIL}）：`)) || DEFAULT_MAIL;
  const brevo = await ask('  貼上 Brevo API 金鑰（還沒申請的話直接按 Enter，之後再設定）：');
  const secrets = { ...ECPAY_STAGE, MAIL_FROM: mail, ...(brevo ? { BREVO_API_KEY: brevo } : {}) };
  const tmp = join(tmpdir(), `score-shop-secrets-${process.pid}.json`);
  writeFileSync(tmp, JSON.stringify(secrets));
  const sec = wrangler(['secret', 'bulk', tmp]);
  rmSync(tmp, { force: true });
  if (!sec.ok) fail('設定金鑰沒有成功', sec.out);
  done(brevo ? '金鑰都設定好了' : '綠界測試金鑰設定好了（Brevo 之後再設定，在那之前不會寄信，但下載按鈕照常可用）');
  rl.close();

  console.log(`
=== 完成！===
請用瀏覽器打開下面的網址試買（測試環境，不會真的扣款）：
  ${url}/buy?item=love-like-you
測試信用卡：4311-9522-2222-2222，有效期限填任何未來的月份年份，背面三碼 222。
付款後會回到「付款成功」頁，下載到的是寫著 TEST FILE 的假檔案，這是正常的。

把商店網址（${url}）告訴 Claude，接下來的事 Claude 會幫你處理。`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(TOML)) fail('找不到 wrangler.toml，請在 score-shop 資料夾裡執行');
  main().catch((err) => fail(err.message));
}
