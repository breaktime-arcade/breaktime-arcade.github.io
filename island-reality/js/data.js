/*!
 * 마지막 생존자 — AI 무인도 리얼리티
 * © 쉬는시간 오락실 (smile-willow.tistory.com). All rights reserved.
 * 무단 복제·재배포·수정 배포를 금지합니다.
 */

// ───────── 한국어 조사 처리 ─────────
const JOSA = {
  '이': ['이', '가'], '을': ['을', '를'], '은': ['은', '는'], '과': ['과', '와'],
  '아': ['아', '야'], '이랑': ['이랑', '랑'], '으로': ['으로', '로'], '이나': ['이나', '나'],
};
export function josa(word, key) {
  const pair = JOSA[key];
  if (!pair) return word + key;
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + pair[1];
  const jong = (c - 0xac00) % 28;
  if (key === '으로') return word + (jong === 0 || jong === 8 ? pair[1] : pair[0]);
  return word + (jong ? pair[0] : pair[1]);
}
// "{a:이} {b}에게" → 이름+조사 치환
export function fill(tpl, names) {
  return tpl.replace(/\{([abc])(?::([^}]+))?\}/g, (_, k, j) => {
    const n = names[k] || '';
    return j ? josa(n, j) : n;
  });
}

// ───────── 출연자 ─────────
// traits: 0~1
export const CHARACTERS = [
  {
    name: '민준', job: '헬스 트레이너', tag: '체력왕', icon: '💪',
    desc: '힘과 체력은 최강. 직설적이라 적도 잘 만든다.',
    look: { skin: '#e8b48a', hair: '#1d1a18', hairStyle: 'buzz', shirt: '#e2493b', pants: '#2c3e57', acc: 'band', accColor: '#ffffff' },
    t: { strength: .95, endurance: .85, social: .55, aggro: .72, diligence: .7, cunning: .28, kindness: .45, loyalty: .7, courage: .9, fishing: .3, observe: .3 },
    catch: ['근육은 배신하지 않아!', '이 정도는 워밍업이지.', '하나 더! 하나 더!'],
  },
  {
    name: '서연', job: '변호사', tag: '냉철한 전략가', icon: '⚖️',
    desc: '판을 읽는 눈이 날카롭다. 동맹도, 배신도 계산적이다.',
    look: { skin: '#f1c9a5', hair: '#2b1d16', hairStyle: 'long', shirt: '#f5f1e8', pants: '#3a3a44', acc: 'glasses', accColor: '#222' },
    t: { strength: .35, endurance: .55, social: .6, aggro: .4, diligence: .55, cunning: .95, kindness: .35, loyalty: .4, courage: .6, fishing: .25, observe: .75 },
    catch: ['증거는 충분해.', '감정은 빼고 생각하자.', '다음 수를 봐야지.'],
  },
  {
    name: '지훈', job: '요리사', tag: '섬의 셰프', icon: '🍳',
    desc: '같은 식량도 두 배로 든든하게 만든다. 모두와 친하다.',
    look: { skin: '#eebd94', hair: '#3b2a20', hairStyle: 'short', shirt: '#ffffff', pants: '#4a4a4a', acc: 'chef', accColor: '#ffffff' },
    t: { strength: .55, endurance: .6, social: .8, aggro: .25, diligence: .8, cunning: .3, kindness: .8, loyalty: .8, courage: .55, fishing: .55, observe: .4 },
    catch: ['배고프면 다 예민해져요. 밥부터!', '간이 딱 맞네.', '오늘 메뉴는 기대해도 좋아요.'],
    cook: true,
  },
  {
    name: '유나', job: '유튜버', tag: '수다쟁이 인플루언서', icon: '📱',
    desc: '말이 많고 감정 표현이 크다. 소문은 다 그녀를 거친다.',
    look: { skin: '#f6d2b5', hair: '#d98a4a', hairStyle: 'pony', shirt: '#ff7eb3', pants: '#5ec8e5', acc: 'none' },
    t: { strength: .4, endurance: .4, social: .95, aggro: .55, diligence: .35, cunning: .55, kindness: .55, loyalty: .5, courage: .5, fishing: .2, observe: .55 },
    catch: ['구독 좋아요 아니고… 생존!', '이거 완전 콘텐츠다!', '대박, 대박, 대박!'],
  },
  {
    name: '도윤', job: '은퇴한 어부', tag: '과묵한 바다 사나이', icon: '🎣',
    desc: '낚시의 달인. 말수는 적지만 한 번 믿으면 끝까지 간다.',
    look: { skin: '#c99068', hair: '#bdbdbd', hairStyle: 'short', shirt: '#3b6e8f', pants: '#5b4a3a', acc: 'beard', accColor: '#d0d0d0' },
    t: { strength: .55, endurance: .75, social: .25, aggro: .3, diligence: .9, cunning: .2, kindness: .7, loyalty: .88, courage: .8, fishing: .97, observe: .5 },
    catch: ['바다는 거짓말 안 해.', '…음.', '물때가 좋구먼.'],
  },
  {
    name: '하은', job: '간호사', tag: '평화주의자', icon: '🩺',
    desc: '다친 사람을 돌보고 싸움을 말린다. 적이 거의 없다.',
    look: { skin: '#f3cdb0', hair: '#4a2c20', hairStyle: 'bun', shirt: '#7fd1c3', pants: '#e8e8e8', acc: 'none' },
    t: { strength: .45, endurance: .65, social: .7, aggro: .1, diligence: .75, cunning: .25, kindness: .95, loyalty: .8, courage: .6, fishing: .35, observe: .5 },
    catch: ['다친 사람 없죠?', '물 꼭 챙겨 마셔요.', '싸우지 마요, 제발.'],
    healer: true,
  },
  {
    name: '재현', job: '스타트업 대표', tag: '야망가', icon: '💼',
    desc: '우승을 위해서라면 무엇이든. 말솜씨로 사람을 움직인다.',
    look: { skin: '#eab995', hair: '#141414', hairStyle: 'slick', shirt: '#24324a', pants: '#c8b48a', acc: 'none' },
    t: { strength: .6, endurance: .55, social: .7, aggro: .65, diligence: .5, cunning: .85, kindness: .25, loyalty: .3, courage: .7, fishing: .3, observe: .6 },
    catch: ['결국 이기는 사람이 다 가져가.', '이건 비즈니스야.', '판은 내가 짠다.'],
  },
  {
    name: '수아', job: '산악인', tag: '생존 전문가', icon: '🧗',
    desc: '불 피우기, 집짓기, 물 찾기까지 척척. 혼자서도 강하다.',
    look: { skin: '#dba57d', hair: '#5a3a22', hairStyle: 'braid', shirt: '#6a8f3c', pants: '#6b5a44', acc: 'bandana', accColor: '#e05a2a' },
    t: { strength: .75, endurance: .95, social: .35, aggro: .4, diligence: .88, cunning: .4, kindness: .6, loyalty: .6, courage: .95, fishing: .5, observe: .6 },
    catch: ['자연을 얕보면 안 돼.', '불씨부터 지켜.', '해 지기 전에 끝내자.'],
    survivor: true,
  },
  {
    name: '민호', job: '개그맨 지망생', tag: '분위기 메이커', icon: '🤡',
    desc: '모두를 웃게 하지만 일은 안 한다. 눈총과 사랑을 동시에.',
    look: { skin: '#f0c19c', hair: '#7a4b2a', hairStyle: 'curly', shirt: '#ffd23f', pants: '#2f6fd6', acc: 'none' },
    t: { strength: .4, endurance: .35, social: .9, aggro: .2, diligence: .15, cunning: .35, kindness: .7, loyalty: .6, courage: .45, fishing: .25, observe: .3 },
    catch: ['웃으면 배가 덜 고파요~', '여기서 개그 한 판!', '나 지금 일하는 중이야… 마음으로.'],
  },
  {
    name: '예린', job: '프로게이머', tag: '조용한 관찰자', icon: '🎮',
    desc: '말은 적지만 모든 걸 보고 있다. 숨겨진 것도 잘 찾는다.',
    look: { skin: '#f4d0b6', hair: '#2a2a3a', hairStyle: 'bob', shirt: '#7b5cff', pants: '#2b2b33', acc: 'headset', accColor: '#2b2b2b' },
    t: { strength: .4, endurance: .7, social: .3, aggro: .3, diligence: .55, cunning: .75, kindness: .5, loyalty: .55, courage: .55, fishing: .3, observe: .95 },
    catch: ['다 보여. 패턴이.', 'GG는 아직이야.', '…흥미롭네.'],
  },
];

// ───────── 대사 ─────────
// {a}=말하는 사람, {b}=듣는 사람, {c}=제3자
export const LINES = {
  fish: ['오늘은 큰 놈 잡는다!', '물고기야, 제발 와줘…', '입질 왔다!', '바다야, 한 마리만…'],
  fishGood: ['월척이다!', '오늘 저녁은 생선구이!', '세 마리나 잡았어!'],
  fishBad: ['…허탕이네.', '미끼만 뺏겼어.', '물고기들이 날 싫어해.'],
  fruit: ['이 열매 먹어도 되는 거겠지?', '코코넛 하나 더!', '달다, 달아!'],
  wood: ['영차! 영차!', '땔감은 많을수록 좋아.', '팔이 후들거려…'],
  build: ['지붕만 올리면 돼!', '오늘 밤은 비 안 맞게.', '뚝딱뚝딱!'],
  water: ['물 떠왔어요!', '이 샘물 진짜 시원하다.', '물이 생명이야.'],
  rest: ['잠깐만… 5분만…', '햇볕 좋다~', '아무것도 안 하고 싶다.'],
  hungry: ['배고파서 눈이 핑 돌아…', '삼겹살 먹고 싶다…', '라면 한 그릇만…'],
  tired: ['다리가 안 움직여…', '너무 지쳤어.'],
  // 대화
  chatFriend: ['{b:아}, 너 진짜 일 잘하더라!', '{b:아}, 우리 끝까지 같이 가자.', '너랑 있으면 마음이 편해.', '{b:아}, 이따 같이 낚시 갈래?', '여기 나가면 밥 한번 먹자!'],
  chatFriendRe: ['당연하지!', '나도 그렇게 생각해.', '고마워, 진짜로.', '헤헤, 좋아!', '약속이다?'],
  chatNeutral: ['날씨 진짜 덥다.', '{b:아}, 고향이 어디야?', '오늘 식량 좀 모였어?', '밤에 별 봤어? 엄청 많더라.', '여기서 제일 먹고 싶은 게 뭐야?'],
  chatNeutralRe: ['그러게 말이야.', '음… 글쎄?', '난 치킨!', '맞아, 장난 아니더라.', '아직은 버틸 만해.'],
  argue: ['{b:아}, 너 오늘 뭐 했어?', '왜 내 물고기에 손대?', '말 좀 가려서 해!', '너 때문에 다들 피곤하다고.', '그렇게 살지 마.'],
  argueRe: ['뭐? 너나 잘해!', '어이가 없네.', '내가 뭘 어쨌다고!', '그만 좀 해!', '…말이 심하네.'],
  gossip: ['{c} 말이야… 좀 이상하지 않아?', '{c:이} 몰래 뭘 찾는 거 봤어.', '{c:은} 일을 너무 안 해.', '{c:이} 너 뒷담 하더라.'],
  gossipRe: ['헐, 진짜?', '나도 그 생각 했어.', '에이, 설마.', '…조심해야겠네.'],
  scheme: ['(속닥) 오늘 밤 {c} 보내는 거 어때?', '(속닥) 우리 둘이 손잡자. 표적은 {c}.', '(속닥) {c:이} 제일 위험해.'],
  schemeYes: ['(속닥) 좋아, 콜.', '(속닥) 나도 같은 생각이야.', '(속닥) 우리끼리 비밀이야.'],
  schemeNo: ['(속닥) 음… 생각해 볼게.', '(속닥) 난 {c} 괜찮던데?', '(속닥) 아직은 아니야.'],
  overhear: ['(…지금 내 얘기 하는 거야?)', '(다 들었어.)'],
  idolSearch: ['(이 근처 어딘가에…)', '(수상한 바위인데…)', '(아무도 안 보지?)'],
  idolFound: ['(이게… 면책 조개?! 아무한테도 말하지 말자.)', '(찾았다…! 이건 나만의 비밀.)'],
  steal: ['(하나쯤은 괜찮겠지…)', '(쉿… 배고파서 그래.)'],
  caught: ['{b:아}! 지금 뭐 하는 거야?!', '야! 그거 모두의 식량이잖아!', '다 봤어, {b:아}.'],
  caughtRe: ['아, 아니 그게…', '…미안.', '배가 너무 고파서…'],
  heal: ['{b:아}, 잠깐 앉아봐. 상처 소독하자.', '{b:아}, 물 마시고 쉬어.'],
  healRe: ['고마워요, 하은 씨.', '덕분에 살았다…'],
  cookTalk: ['오늘은 생선 수프!', '다들 많이 먹어요!', '불 조절이 생명이지.'],
  campJoke: ['자, 여기서 개그 한 판!', '무인도 와서 다이어트 성공~', '여러분, 웃어요! 배 덜 고파요!'],
  campLaugh: ['푸하하!', '아 진짜 웃기다!', 'ㅋㅋㅋㅋ', '…그게 웃겨?'],
  campTalk: ['오늘 힘들었다…', '집에 가고 싶다.', '그래도 별은 예쁘다.', '내일은 더 잘하자.', '다들 수고했어.'],
  // 속마음 인터뷰
  confessThreat: ['(속마음) {c:은} 너무 위협적이야.', '(속마음) 지금 {c:을} 못 잡으면 끝이야.'],
  confessLike: ['(속마음) {c:은} 진짜 믿을 수 있어.', '(속마음) {c:이랑}은 끝까지 가고 싶어.'],
  confessHate: ['(속마음) {c}… 진짜 못 참겠다.', '(속마음) {c:은} 꼭 내 손으로 보낸다.'],
  // 미션
  chStart: ['내가 1등이다!', '질 수 없어!', '면책은 내 거야!', '가자!'],
  chWin: ['해냈다!!', '면책 목걸이는 내 거!', '예스! 오늘은 안전하다!'],
  chCheer: ['힘내!', '조금만 더!', '버텨! 버텨!', '와아아!'],
  chFall: ['으아악!', '안 돼애애!', '첨벙!'],
  chStumble: ['아야!', '으앗, 미끄러졌다!'],
  // 부족회의
  councilNerve: ['…긴장된다.', '제발 내 이름만은…', '다들 표정이 왜 그래?'],
  idolPlay: ['잠깐! 이걸 쓰겠습니다.', '면책 조개, 지금 씁니다!'],
  elimCalm: ['다들 고마웠어. 끝까지 힘내!', '즐거웠어요. 정말로.', '후회는 없어. 잘 있어!'],
  elimBitter: ['{c}, 이 배신 잊지 않을게.', '역시… 그랬구나.', '두고 봐, 이게 끝이 아니야.'],
  evac: ['더는… 못 버티겠어…'],
  // 파이널
  finalSpeech: ['저는 매일 최선을 다했습니다.', '여러분 덕분에 여기까지 왔어요.', '전략도 실력입니다.', '전 한 번도 거짓말 안 했어요.', '이 섬에서 제일 많이 일한 건 저예요.'],
  winner: ['내가… 마지막 생존자라고?!', '다들 정말 고마워요!!', '믿기지가 않아!'],
};

export const PHASE_LABEL = {
  dawn: '새벽 기상', morning: '오전 활동', challenge: '생존 미션', afternoon: '오후 활동',
  evening: '저녁 캠프파이어', council: '부족회의', night: '밤', finale: '파이널 부족회의', end: '시즌 종료',
};

export const ACTION_LABEL = {
  fish: '🎣 낚시 중', fruit: '🥥 열매 채집', wood: '🪵 땔감 모으기', build: '🔨 은신처 짓기',
  water: '💧 물 길어오기', rest: '😴 휴식', social: '💬 대화', listen: '💬 대화', scheme: '🤫 밀담',
  idol: '🔍 뭔가 찾는 중', steal: '🫣 수상한 행동', heal: '🩹 치료', gather: '🚶 이동 중',
  camp: '🔥 캠프파이어', council: '🗳️ 부족회의', sleep: '💤 수면', challenge: '🏁 미션 중',
  spectate: '📣 응원 중', jury: '⚖️ 배심원', out: '⛵ 탈락', idle: '…',
};
