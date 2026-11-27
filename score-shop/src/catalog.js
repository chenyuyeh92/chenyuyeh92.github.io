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
  'jinsei-yume-darake': {
    id: 'jinsei-yume-darake',
    title: '人生は夢だらけ',
    subtitle: '椎名林檎・鋼琴改編',
    price: 100,
    file: 'jinsei-yume-darake.pdf',
  },
  'we-are-number-one': {
    id: 'we-are-number-one',
    title: 'We Are Number One',
    subtitle: 'LazyTown・鋼琴改編',
    price: 80,
    file: 'we-are-number-one.pdf',
  },
  'wish-upon-a-star': {
    id: 'wish-upon-a-star',
    title: 'When You Wish Upon a Star（爵士版）',
    subtitle: '木偶奇遇記 Pinocchio・爵士鋼琴改編',
    price: 120,
    file: 'wish-upon-a-star.pdf',
  },
  'wish-easy-staff': {
    id: 'wish-easy-staff',
    title: 'When You Wish Upon a Star（簡易版・五線譜）',
    subtitle: '木偶奇遇記 Pinocchio・鋼琴簡易版',
    price: 80,
    file: 'wish-easy-staff.pdf',
  },
  'wish-easy-jianpu': {
    id: 'wish-easy-jianpu',
    title: 'When You Wish Upon a Star（簡易版・簡譜）',
    subtitle: '木偶奇遇記 Pinocchio・鋼琴簡易版・數字簡譜',
    price: 80,
    file: 'wish-easy-jianpu.pdf',
  },
  'tong-nian': {
    id: 'tong-nian',
    title: '童年（簡易版・簡譜）',
    subtitle: '羅大佑・鋼琴簡易版・數字簡譜',
    price: 80,
    file: 'tong-nian.pdf',
  },
  'white-christmas': {
    id: 'white-christmas',
    title: 'White Christmas',
    subtitle: 'Irving Berlin・聖誕爵士鋼琴改編',
    price: 80,
    file: 'white-christmas.pdf',
  },
};

export function getItem(id) {
  return typeof id === 'string' && Object.hasOwn(CATALOG, id) ? CATALOG[id] : null;
}
