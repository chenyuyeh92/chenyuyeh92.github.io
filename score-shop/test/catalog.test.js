import { describe, it, expect } from 'vitest';
import { getItem } from '../src/catalog.js';

describe('catalog', () => {
  it('價格跟網頁一致', () => {
    expect(getItem('love-like-you').price).toBe(100);
    expect(getItem('sabzeruz').price).toBe(120);
    expect(getItem('fontaine-easy').price).toBe(100);
    expect(getItem('fontaine-medium').price).toBe(150);
    expect(getItem('fontaine-duet').price).toBe(150);
    expect(getItem('my-dearest').price).toBe(120);
  });
  it('不存在的商品回傳 null', () => {
    expect(getItem('nope')).toBeNull();
    expect(getItem('toString')).toBeNull();
  });
});
