/*!
 * 작은 마을 성장 일기 — 데이터
 * © 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·재배포·수정 배포를 금지합니다.
 */

const JOSA = { '이': ['이', '가'], '을': ['을', '를'], '은': ['은', '는'], '과': ['과', '와'], '아': ['아', '야'], '으로': ['으로', '로'], '이랑': ['이랑', '랑'] };
export function josa(word, key) {
  const pair = JOSA[key]; if (!pair) return word + key;
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + pair[1];
  const jong = (c - 0xac00) % 28;
  if (key === '으로') return word + (jong === 0 || jong === 8 ? pair[1] : pair[0]);
  return word + (jong ? pair[0] : pair[1]);
}
export function fill(tpl, names) {
  return tpl.replace(/\{([abc])(?::([^}]+))?\}/g, (_, k, j) => { const n = names[k] || ''; return j ? josa(n, j) : n; });
}

export const YEAR_LEN = 26;      // 1년 = 26초 (1배속)
export const MAX_YEAR = 30;
export const SEASONS = ['봄', '여름', '가을', '겨울'];
export const SEASON_ICON = ['🌸', '☀️', '🍁', '❄️'];

export const FOUNDER_SURNAMES = ['김', '이', '박'];
export const SURNAMES = ['최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
export const MALE = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지후', '준우', '건우', '현우', '우진', '선우', '유찬', '은우', '정우', '승현', '태윤', '동현', '재윤', '성민', '영호', '상철', '병수', '만복', '돌쇠', '용팔', '덕배', '철수', '영수', '기철', '대성', '한결', '바다', '하늘', '이안', '로운', '시온', '태오'];
export const FEMALE = ['서연', '서윤', '지우', '하윤', '민서', '하은', '지유', '윤서', '채원', '수아', '지민', '다은', '예린', '소율', '아린', '말순', '복순', '영희', '순자', '옥자', '미숙', '정희', '은정', '나래', '보람', '다솜', '새봄', '가을', '이슬', '꽃님', '봄이', '별이', '단비', '해솔', '루아', '온유', '연우', '설아', '여름', '초롱'];

export const FAMILY_COLORS = ['#e8553e', '#3b82c4', '#3aa05a', '#e2a02a', '#9b5de5', '#e05f9b', '#1fa5a5', '#8a6a48', '#5b6bd6', '#c94f6d', '#6b9b2a', '#d1782a', '#4a7f9a', '#a35bb5', '#2f8f6a', '#b5543f', '#7a7a2a', '#3f5f8f', '#c08a2a', '#5a3f8f'];

export const SHIRTS = ['#e85d4a', '#4a90d9', '#5bb36a', '#f2c14e', '#9b6bd6', '#ef7fb0', '#3cbfb4', '#f08c3a', '#6c7a89', '#d9534f', '#7fc8f8', '#b5e48c', '#ffd6a5', '#cdb4db', '#ffafcc', '#90be6d'];
export const HAIRS = ['#2a1d16', '#3b2a20', '#1d1a18', '#5a3a22', '#7a4b2a', '#a0522d', '#2b2b3a', '#c9873e'];
export const SKINS = ['#f1c9a5', '#eab995', '#e8b48a', '#f4d0b6', '#dba57d', '#c99068'];

export const JOBS = {
  farmer: { label: '농부', icon: '🌾', prop: 'hoe' },
  woodcutter: { label: '나무꾼', icon: '🪓', prop: 'axe' },
  mason: { label: '석공', icon: '⛏️', prop: 'pick', need: 'quarry' },
  builder: { label: '목수', icon: '🔨', prop: 'hammer' },
  fisher: { label: '어부', icon: '🎣', prop: 'rod' },
  smith: { label: '대장장이', icon: '⚒️', prop: 'hammer', need: 'smithy' },
  baker: { label: '제빵사', icon: '🍞', prop: 'basket', need: 'bakery' },
  merchant: { label: '상인', icon: '💰', prop: 'basket', need: 'market' },
  teacher: { label: '선생님', icon: '📚', prop: 'book', need: 'school' },
  doctor: { label: '의사', icon: '🩺', prop: 'book', need: 'clinic' },
  innkeeper: { label: '여관 주인', icon: '🏨', prop: 'basket', need: 'inn' },
  miller: { label: '방앗간지기', icon: '🌀', prop: 'basket', need: 'windmill' },
  librarian: { label: '사서', icon: '📖', prop: 'book', need: 'library' },
  stationmaster: { label: '역장', icon: '🚂', prop: 'book', need: 'station' },
  child: { label: '아이', icon: '🧒' }, student: { label: '학생', icon: '🎒' }, baby: { label: '아기', icon: '👶' }, elder: { label: '어르신', icon: '🍵' },
};

// 건물 정의: work = 공사량, req = 조건, zone = 배치 구역
export const BUILDINGS = {
  hut: { label: '오두막', icon: '🛖', work: 18, cost: { wood: 5 }, zone: 'home' },
  house: { label: '집', icon: '🏠', work: 26, cost: { wood: 8 }, zone: 'home' },
  brick: { label: '벽돌집', icon: '🏡', work: 34, cost: { wood: 6, stone: 6 }, zone: 'home' },
  field: { label: '밭', icon: '🌾', work: 8, cost: { wood: 2 }, zone: 'farm' },
  well: { label: '우물', icon: '🪣', work: 14, cost: { wood: 3, stone: 2 }, zone: 'civic', req: s => s.pop >= 9 },
  storehouse: { label: '창고', icon: '📦', work: 22, cost: { wood: 10 }, zone: 'civic', req: s => s.pop >= 11 },
  quarry: { label: '채석장', icon: '🪨', work: 18, cost: { wood: 8 }, zone: 'quarry', req: s => s.pop >= 10 },
  lumbermill: { label: '제재소', icon: '🪚', work: 24, cost: { wood: 12, stone: 2 }, zone: 'forest', req: s => s.pop >= 13 },
  bridge: { label: '돌다리', icon: '🌉', work: 20, cost: { wood: 6, stone: 8 }, zone: 'bridge', req: s => s.pop >= 15 },
  smithy: { label: '대장간', icon: '⚒️', work: 30, cost: { wood: 10, stone: 10 }, zone: 'civic', req: s => s.pop >= 17 && s.era >= 1 },
  bakery: { label: '빵집', icon: '🥐', work: 28, cost: { wood: 12, stone: 6 }, zone: 'civic', req: s => s.pop >= 19 && s.era >= 1 },
  windmill: { label: '풍차', icon: '🌀', work: 34, cost: { wood: 16, stone: 8 }, zone: 'windmill', req: s => s.fields >= 5 && s.era >= 1 },
  market: { label: '장터', icon: '🏪', work: 26, cost: { wood: 14, stone: 4 }, zone: 'plaza', req: s => s.pop >= 22 && s.era >= 1 },
  school: { label: '학교', icon: '🏫', work: 40, cost: { wood: 18, stone: 10, coin: 10 }, zone: 'civic', req: s => s.pop >= 24 && s.kids >= 4 },
  fountain: { label: '광장 분수', icon: '⛲', work: 26, cost: { stone: 16, coin: 15 }, zone: 'center', req: s => s.pop >= 26 && s.era >= 2 },
  clinic: { label: '의원', icon: '🏥', work: 34, cost: { wood: 12, stone: 12, coin: 20 }, zone: 'civic', req: s => s.pop >= 28 && s.era >= 2 },
  inn: { label: '여관', icon: '🏨', work: 38, cost: { wood: 20, stone: 12, coin: 20 }, zone: 'civic', req: s => s.pop >= 30 && s.era >= 2 },
  townhall: { label: '마을회관', icon: '🏛️', work: 60, cost: { wood: 24, stone: 30, coin: 40 }, zone: 'civic', req: s => s.pop >= 33 && s.era >= 2 },
  library: { label: '도서관', icon: '📚', work: 40, cost: { wood: 16, stone: 20, coin: 30 }, zone: 'civic', req: s => s.pop >= 38 && s.era >= 3 },
  station: { label: '하늘 기차역', icon: '🚂', work: 70, cost: { wood: 30, stone: 30, coin: 60 }, zone: 'station', req: s => s.era >= 3 && s.year >= 21 },
};
export const CIVIC_ORDER = ['quarry', 'well', 'storehouse', 'lumbermill', 'bridge', 'smithy', 'bakery', 'windmill', 'market', 'school', 'fountain', 'clinic', 'inn', 'townhall', 'library', 'station'];
export const JOB_OF = { smithy: 'smith', bakery: 'baker', market: 'merchant', school: 'teacher', clinic: 'doctor', inn: 'innkeeper', windmill: 'miller', library: 'librarian', station: 'stationmaster' };

export const ERAS = [
  { name: '개척기', icon: '🪵', desc: '세 가족이 숲을 일구기 시작했다', home: 'hut' },
  { name: '마을', icon: '🏘️', desc: '어엿한 마을의 모습을 갖추었다', home: 'house', need: s => s.year >= 6 && s.pop >= 14 },
  { name: '읍내', icon: '🏙️', desc: '돌길이 깔리고 가로등이 켜졌다', home: 'brick', need: s => s.year >= 13 && s.pop >= 26 },
  { name: '작은 도시', icon: '🌆', desc: '하늘 너머 세상과 이어질 준비가 되었다', home: 'brick', need: s => s.year >= 20 && s.pop >= 38 },
];

export const LINES = {
  farm: ['올해도 풍년이어라~', '흙냄새 좋다.', '쑥쑥 자라라!', '허리야…'],
  chop: ['영차!', '나무 넘어간다~', '땔감 넉넉히!'],
  mine: ['단단하네.', '깡! 깡!', '좋은 돌이다.'],
  build: ['뚝딱뚝딱!', '기둥 똑바로!', '조금만 더!'],
  fish: ['입질 왔다!', '물이 맑구나.', '오늘 저녁은 매운탕!'],
  shop: ['어서 오세요~', '갓 구운 빵 있어요!', '싸게 드릴게요!'],
  teach: ['자, 따라 읽어요.', '숙제 해왔니?'],
  kid: ['술래잡기 하자!', '나 잡아 봐라~', '꺄르르!', '내가 1등!', '배고파~'],
  elder: ['내가 젊었을 땐 여기 다 숲이었지.', '세월 참 빠르다.', '아이들 웃음소리가 좋구먼.', '허허, 날씨 좋다.'],
  chatFriend: ['{b}, 오늘 날씨 좋다!', '{b}, 저녁 먹고 가!', '요즘 어떻게 지내?', '{b}, 고마웠어!'],
  chatRe: ['좋지!', '하하, 그래!', '덕분에 잘 지내.', '언제든!'],
  love: ['{b}… 오늘 예쁘다.', '{b}, 같이 걸을래?', '(두근두근…)'],
  loveRe: ['…응, 좋아.', '(얼굴이 빨개짐)', '헤헤.'],
  wedding: ['평생 함께해요.', '행복하게 살게요!', '모두 고마워요!'],
  cheer: ['축하해!!', '와아아!', '행복하세요!', '잘 살아라~'],
  baby: ['우리 아기 이름은 {c}!', '{c:아}, 반가워!', '세상에, 이 작은 손 좀 봐…'],
  festival: ['축제다~!', '덩실덩실!', '오늘은 다 같이 놀자!', '불꽃놀이다!'],
  winter: ['으, 추워!', '눈사람 만들자!', '장작 더 넣어야겠다.'],
  spring: ['꽃 피었다!', '봄바람 좋다~'],
  hungry: ['배가 고프네…', '곡식이 모자라…'],
  newcomer: ['안녕하세요! 오늘부터 이웃이에요.', '여기 정말 아름답네요!'],
};
