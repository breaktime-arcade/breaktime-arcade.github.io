// 지진 설계사 - 단계 정보
// bays: 가로 칸 수, levels: 지을 수 있는 최대 층수, target: 입주층, zone: 입주 구역(칸 범위)
// par3/par2: 별 3개/2개를 받는 최대 사용 비용
// quake: amp(흔들림 크기), freq(주 진동수, 낮을수록 느리고 크게 출렁임), dur(지속 시간)
export const LEVELS = [
  {
    name: '1단계 · 바닷가 2층 집',
    soil: '암반', intensity: '진도 4',
    bays: 2, levels: 3, target: 2, zone: [0, 2],
    budget: 1500, par3: 1000, par2: 1250,
    quake: { amp: 0.045, freq: 2.4, dur: 9, seed: 11 },
    tip: '기둥과 보로 뼈대를 만들고, 칸 안에 가새(대각선)를 넣어 보세요. 삼각형은 잘 찌그러지지 않아요!',
  },
  {
    name: '2단계 · 시장 골목 4층 상가',
    soil: '보통 지반', intensity: '진도 5',
    bays: 3, levels: 5, target: 4, zone: [0, 3],
    budget: 3400, par3: 2700, par2: 3100,
    quake: { amp: 0.07, freq: 2.0, dur: 10, seed: 23 },
    tip: '모든 칸에 가새를 넣을 필요는 없어요. 아래층일수록 더 큰 힘을 받는다는 걸 기억하세요.',
  },
  {
    name: '3단계 · 강변 아파트',
    soil: '연약 지반', intensity: '진도 5',
    bays: 3, levels: 6, target: 5, zone: [0, 3],
    budget: 4000, par3: 3100, par2: 3600,
    quake: { amp: 0.25, freq: 1.0, dur: 11, seed: 37 },
    tip: '무른 땅은 느리고 크게 출렁여요. 건물이 땅과 같은 박자로 흔들리면(공진) 훨씬 위험해져요.',
  },
  {
    name: '4단계 · 좁은 땅 전망 타워',
    soil: '보통 지반', intensity: '진도 6',
    bays: 2, levels: 8, target: 7, zone: [0, 2],
    budget: 5000, par3: 3700, par2: 4300,
    quake: { amp: 0.09, freq: 1.6, dur: 11, seed: 41 },
    tip: '가늘고 높은 건물은 기둥 밑동에 힘이 몰려요. 가새를 X자로 겹쳐 쓰면 양쪽 흔들림을 모두 버텨요.',
  },
  {
    name: '5단계 · 대지진 대비 병원',
    soil: '연약 지반', intensity: '진도 7',
    bays: 4, levels: 6, target: 5, zone: [0, 4],
    budget: 6600, par3: 4600, par2: 5600, allowIso: true,
    quake: { amp: 0.34, freq: 1.25, dur: 12, seed: 53 },
    tip: '새 부품 면진장치! 1층 기둥 밑에 깔면 땅의 흔들림이 건물로 덜 전해져요. 비싸니까 꼭 필요한 곳에만.',
  },
];
