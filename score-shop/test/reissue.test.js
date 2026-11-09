import { describe, expect, it } from 'vitest';
import { reissueRecord } from '../scripts/reissue.mjs';

describe('reissueRecord', () => {
  it('重新開 7 天、5 次', () => {
    const now = Date.UTC(2026, 10, 9);
    expect(reissueRecord({ no: 'S1', token: 't', status: 'paid' }, now))
      .toEqual({ key: 'dl:t', value: { no: 'S1', expires: now + 7 * 86400000, remaining: 5 } });
  });
  it('沒付款的訂單不能補發', () => {
    expect(() => reissueRecord({ no: 'S1', status: 'pending' }, 0)).toThrow('還沒付款');
  });
});
