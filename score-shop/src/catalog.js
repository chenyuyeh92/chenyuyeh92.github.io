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
  'fontaine-easy': {
    id: 'fontaine-easy',
    title: 'Genshin Fontaine Theme（簡單版）',
    subtitle: '原神・鋼琴改編・簡單簡短版',
    price: 100,
    file: 'fontaine-easy.pdf',
  },
  'fontaine-medium': {
    id: 'fontaine-medium',
    title: 'Genshin Fontaine Theme（中等版）',
    subtitle: '原神・鋼琴改編・中等版',
    price: 150,
    file: 'fontaine-medium.pdf',
  },
  'fontaine-duet': {
    id: 'fontaine-duet',
    title: 'Genshin Fontaine Theme（四手聯彈）',
    subtitle: '原神・鋼琴四手聯彈',
    price: 150,
    file: 'fontaine-duet.pdf',
  },
  'my-dearest': {
    id: 'my-dearest',
    title: 'My Dearest',
    subtitle: '罪惡王冠 Guilty Crown OP1・鋼琴改編',
    price: 120,
    file: 'my-dearest.pdf',
  },
};

export function getItem(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOG, id) ? CATALOG[id] : null;
}
