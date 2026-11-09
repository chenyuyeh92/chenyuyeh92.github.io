// 商品清單：價格以這裡為準（網頁上的價格要跟這裡一致）
export const CATALOG = {
  'love-like-you': {
    id: 'love-like-you',
    title: 'Love Like You',
    subtitle: '鋼琴改編（C 大調）',
    price: 100,
    file: 'love-like-you.pdf',
  },
  sabzeruz: {
    id: 'sabzeruz',
    title: 'Genshin Dance of Sabzeruz',
    subtitle: '鋼琴改編',
    price: 120,
    file: 'sabzeruz.pdf',
  },
};

export function getItem(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOG, id) ? CATALOG[id] : null;
}
