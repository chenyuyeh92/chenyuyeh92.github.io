// 測試用：記憶體版的 Cloudflare KV 和 R2

export class FakeKV {
  constructor() { this.map = new Map(); }
  async get(key, type) {
    const v = this.map.has(key) ? this.map.get(key) : null;
    return v !== null && type === 'json' ? JSON.parse(v) : v;
  }
  async put(key, value) { this.map.set(key, String(value)); }
  async delete(key) { this.map.delete(key); }
}

export class FakeR2 {
  constructor(files = {}) { this.files = files; }
  async get(key) {
    if (!(key in this.files)) return null;
    return { body: new Blob([this.files[key]]).stream(), httpMetadata: { contentType: 'application/pdf' } };
  }
}

// 攔截 fetch（Brevo 寄信），記錄呼叫次數
export function fakeFetch(status = 201) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
    return new Response('{}', { status });
  };
  fn.calls = calls;
  return fn;
}
