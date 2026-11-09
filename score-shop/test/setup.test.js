import { describe, expect, it } from 'vitest';
import { fillKvId, matchPdfs, parseDeployUrl, parseKvId } from '../scripts/setup.mjs';

describe('setup helpers', () => {
  it('從 wrangler 的輸出找出 KV id（新舊兩種格式）', () => {
    expect(parseKvId('[[kv_namespaces]]\nbinding = "ORDERS"\nid = "0123456789abcdef0123456789abcdef"')).toBe('0123456789abcdef0123456789abcdef');
    expect(parseKvId('{ "kv_namespaces": [ { "binding": "ORDERS", "id": "fedcba9876543210fedcba9876543210" } ] }')).toBe('fedcba9876543210fedcba9876543210');
    expect(parseKvId('error')).toBe(null);
  });

  it('把 KV id 填進 wrangler.toml', () => {
    const toml = 'binding = "ORDERS"\n# 說明\nid = "REPLACE_WITH_KV_ID"\n';
    expect(fillKvId(toml, 'abc')).toBe('binding = "ORDERS"\n# 說明\nid = "abc"\n');
  });

  it('從部署輸出找出商店網址', () => {
    expect(parseDeployUrl('Uploaded score-shop\nDeployed score-shop triggers\n  https://score-shop.mozart-shop.workers.dev\nCurrent Version ID: x'))
      .toBe('https://score-shop.mozart-shop.workers.dev');
    expect(parseDeployUrl('nothing')).toBe(null);
  });

  it('依檔名認出兩份樂譜 PDF', () => {
    const files = ['Love_Like_You（C大調）.pdf', 'Genshin_Dance_of_Sabzeruz.pdf', 'notes.txt'];
    expect(matchPdfs(files)).toEqual({
      'love-like-you': 'Love_Like_You（C大調）.pdf',
      sabzeruz: 'Genshin_Dance_of_Sabzeruz.pdf',
    });
    expect(matchPdfs(['x.pdf'])).toEqual({});
  });
});
