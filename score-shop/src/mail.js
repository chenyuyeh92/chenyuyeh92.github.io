// 用 Brevo 寄下載信。寄信失敗不影響訂單（畫面上的下載按鈕照常可用）
import { escapeHtml } from './html.js';
import { DOWNLOAD_DAYS, DOWNLOAD_TIMES } from './orders.js';

export function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  return `${user.slice(0, 1)}***@${domain ?? ''}`;
}

// env.CONTACT_EMAIL：賣家聯絡信箱（wrangler.toml 的 [vars] 設定）
export async function sendDownloadMail(env, { order, item, link }) {
  const contact = env.CONTACT_EMAIL || env.MAIL_FROM;
  const html = `<div style="font-family:sans-serif;line-height:1.7;color:#222">
<p>謝謝你購買樂譜！</p>
<p><b>${escapeHtml(item.title)}</b>　NT$${order.amount}<br>訂單編號：${escapeHtml(order.no)}</p>
<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#8a5a2b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">下載樂譜（PDF）</a></p>
<p style="color:#666;font-size:14px">下載連結 ${DOWNLOAD_DAYS} 天內有效，最多可下載 ${DOWNLOAD_TIMES} 次，下載後請存在自己的電腦或手機裡。<br>
有任何問題請直接回信，或寫信到 ${escapeHtml(contact)}（葉宸佑）。</p></div>`;
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: '葉宸佑 鋼琴樂譜', email: env.MAIL_FROM },
        replyTo: { email: contact },
        to: [{ email: order.email }],
        subject: `你購買的樂譜：${item.title}`,
        htmlContent: html,
      }),
    });
    if (!res.ok) console.error('brevo failed', res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error('brevo error', err);
    return false;
  }
}
