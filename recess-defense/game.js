/* 쉬는시간 수비대 (Recess Defense) v1.0 - 쉬는시간 오락실 */
(() => {
  'use strict';
  if (!window.THREE) {
    document.getElementById('loadErr').textContent = '3D 엔진을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.';
    return;
  }
  const T = THREE;

  // =====================================================================
  // 데이터
  // =====================================================================
  const GW = 16, GH = 10;
  const LEVELS = {
    easy:   { hp: 0.8,  money: 180, name: '쉬움' },
    normal: { hp: 1.12, money: 160, name: '보통' },
    hard:   { hp: 1.62, money: 140, name: '어려움' }
  };
  // 장난감: 1단계 → 2단계 → 3단계(갈래 A/B 중 하나)
  const TOWERS = {
    sling:  { name: '새총', icon: '🪃', cost: 50, range: 3.0, rate: 0.55, dmg: 7, air: true, color: 0xc98a4b,
              desc: '빠르게 콩알을 쏴요. 하늘의 괴물도 맞혀요.',
              A: { name: '연발 새총', icon: '⚡', desc: '공격 속도가 두 배! 약한 괴물 떼에 강해요.' },
              B: { name: '저격 새총', icon: '🎯', desc: '아주 멀리, 아주 세게. 갑옷과 투명 괴물도 꿰뚫어요.' } },
    water:  { name: '물총', icon: '🔫', cost: 60, range: 2.6, rate: 0.8, dmg: 4, slow: 0.45, slowT: 1.6, air: true, color: 0x3f8de0,
              desc: '물에 젖은 괴물은 느려지고, 투명한 유령도 드러나요.',
              A: { name: '얼음 물총', icon: '🧊', desc: '가끔 괴물을 꽁꽁 얼려 멈춰 세워요.' },
              B: { name: '끈적 물총', icon: '🍯', desc: '맞은 곳 주변 괴물까지 오래 끈적하게 느려져요.' } },
    top:    { name: '팽이', icon: '🌀', cost: 80, range: 1.8, rate: 1.0, dmg: 16, air: false, color: 0xe2584c,
              desc: '빙글빙글 돌며 주변 괴물을 한꺼번에 때려요. (하늘은 못 때려요)',
              A: { name: '회오리 팽이', icon: '🌪️', desc: '맞은 괴물을 뒤로 밀어내요.' },
              B: { name: '불꽃 팽이', icon: '🔥', desc: '맞은 괴물에 불을 붙여 계속 아프게 해요.' } },
    ddakji: { name: '딱지 폭탄', icon: '💥', cost: 100, range: 3.6, rate: 1.6, dmg: 40, splash: 1.2, air: false, color: 0xf2b72e,
              desc: '느리지만 펑! 떨어진 자리 주변까지 피해를 줘요. (하늘은 못 맞혀요)',
              A: { name: '연쇄 딱지', icon: '🎆', desc: '터진 뒤 작은 딱지 셋이 연달아 터져요.' },
              B: { name: '왕딱지', icon: '👑', desc: '훨씬 넓고 세게 터져요.' } },
    flute:  { name: '리코더', icon: '🎵', cost: 70, range: 2.2, buff: 0.3, air: false, color: 0xf3f0e6,
              desc: '공격은 못 하지만, 노래로 주변 장난감을 빠르게 해요.',
              A: { name: '행진곡', icon: '🥁', desc: '주변 장난감 공격 속도가 크게 빨라져요.' },
              B: { name: '자장가', icon: '🌙', desc: '장난감 강화에 더해, 주변 괴물을 졸려서 느리게 해요.' } }
  };
  const TOWER_ORDER = ['sling', 'water', 'top', 'ddakji', 'flute'];
  const ENEMIES = {
    snake:  { name: '고무줄 뱀', icon: '🐍', hp: 38, speed: 1.25, reward: 5, armor: 0, atk: 5, leak: 1, desc: '꼬물꼬물 기어 와요. 평범한 괴물이에요.' },
    plane:  { name: '종이비행기', icon: '✈️', hp: 18, speed: 2.1, reward: 4, armor: 0, atk: 0, leak: 1, noBlock: true, desc: '아주 빨라요! 낮게 날아서 영웅이 막을 수 없어요.' },
    eraser: { name: '지우개 똥', icon: '🧽', hp: 70, speed: 1.0, reward: 6, armor: 0, atk: 7, leak: 2, split: ['mini', 2], desc: '쓰러지면 작은 지우개 두 개로 나뉘어요!' },
    mini:   { name: '작은 지우개', icon: '🩷', hp: 20, speed: 1.5, reward: 2, armor: 0, atk: 3, leak: 1, hidden: true, desc: '지우개 똥이 나뉘어 생긴 꼬마예요.' },
    knight: { name: '크레파스 기사', icon: '🖍️', hp: 160, speed: 0.75, reward: 12, armor: 3, atk: 12, leak: 3, desc: '갑옷이 있어 약한 공격은 덜 아파해요. 딱지 폭탄이 좋아요!' },
    ghost:  { name: '분필가루 유령', icon: '👻', hp: 55, speed: 1.4, reward: 7, armor: 0, atk: 6, leak: 2, stealth: true, desc: '반투명해서 가까이 와야 보여요. 물총에 맞으면 정체가 드러나요!' },
    tack:   { name: '압정 고슴도치', icon: '🦔', hp: 90, speed: 1.1, reward: 9, armor: 1, atk: 10, leak: 2, sabotage: true, desc: '지나가며 장난감을 콕 찔러 잠깐 고장 내요!' },
    balloon:{ name: '풍선 괴물', icon: '🎈', hp: 55, speed: 0.9, reward: 8, armor: 0, atk: 0, leak: 1, air: true, desc: '둥실둥실 하늘로 날아와요! 새총·물총·서연·하은만 맞힐 수 있어요.' },
    milk:   { name: '우유갑 탱크', icon: '🥛', hp: 420, speed: 0.55, reward: 25, armor: 5, atk: 18, leak: 4, desc: '아주아주 단단해요. 갑옷도 두꺼워요!' },
    bat:    { name: '낙서 박쥐', icon: '🦇', hp: 24, speed: 2.0, reward: 3, armor: 0, atk: 0, leak: 1, air: true, desc: '떼로 날아와요! 하늘을 맞히는 장난감이 필요해요.' },
    eraserKing: { name: '거대 지우개', icon: '👑', hp: 1400, speed: 0.5, reward: 80, armor: 2, atk: 30, leak: 10, boss: true, desc: '체력이 줄 때마다 지우개 똥을 쏟아내요.' },
    extinguisher: { name: '소화기 괴물', icon: '🧯', hp: 2200, speed: 0.5, reward: 100, armor: 4, atk: 30, leak: 10, boss: true, desc: '거품을 뿜어 주변 장난감을 잠깐 멈춰요.' },
    slime:  { name: '플라스크 슬라임', icon: '🟢', hp: 2000, speed: 0.55, reward: 60, armor: 0, atk: 25, leak: 10, boss: true, split: ['slimeM', 2], desc: '쓰러지면 둘로, 또 둘로 나뉘어요!' },
    slimeM: { name: '중간 슬라임', icon: '🟩', hp: 500, speed: 0.75, reward: 15, armor: 0, atk: 12, leak: 4, split: ['slimeS', 2], hidden: true, desc: '' },
    slimeS: { name: '꼬마 슬라임', icon: '🫧', hp: 120, speed: 1.0, reward: 5, armor: 0, atk: 5, leak: 2, hidden: true, desc: '' },
    soccer: { name: '축구공 대장', icon: '⚽', hp: 3000, speed: 0.6, reward: 120, armor: 3, atk: 35, leak: 10, boss: true, dash: true, desc: '가끔 데굴데굴 빠르게 돌진해요!' },
    tray:   { name: '급식판 왕', icon: '🍱', hp: 4200, speed: 0.45, reward: 150, armor: 5, atk: 40, leak: 10, boss: true, desc: '부하를 불러내고, 급식판 방패로 피해를 막아요!' }
  };
  const CODEX_ENEMIES = ['snake', 'plane', 'eraser', 'knight', 'ghost', 'tack', 'balloon', 'milk', 'bat', 'eraserKing', 'extinguisher', 'slime', 'soccer', 'tray'];
  const MAPS = [
    { id: 'class', name: '1교시 · 교실', short: '교실', theme: 'class', boss: 'eraserKing', pool: ['snake', 'plane', 'eraser', 'knight'],
      paths: [[[-2, 1], [2, 1], [2, 7], [6, 7], [6, 2], [10, 2], [10, 8], [14, 8], [14, 4], [16.6, 4]]],
      blocks: [[4, 4], [8, 5], [12, 5], [8, 8], [4, 9], [12, 0]], desc: '책상 사이 S자 길' },
    { id: 'hall', name: '2교시 · 복도', short: '복도', theme: 'hall', boss: 'extinguisher', pool: ['snake', 'plane', 'eraser', 'knight', 'ghost', 'tack'],
      paths: [[[-2, 1], [13, 1], [13, 4], [2, 4], [2, 8], [16.6, 8]]],
      blocks: [[6, 2], [10, 6], [5, 6], [14, 6], [8, 9]], desc: '길고 꺾인 복도, 유령과 고슴도치 등장' },
    { id: 'lab', name: '3교시 · 과학실', short: '과학실', theme: 'lab', boss: 'slime', pool: ['snake', 'plane', 'eraser', 'knight', 'ghost', 'tack', 'balloon', 'milk'],
      paths: [[[-2, 5], [3, 5], [3, 1], [12, 1], [12, 5], [16.6, 5]], [[-2, 5], [3, 5], [3, 8], [12, 8], [12, 5], [16.6, 5]]],
      blocks: [[7, 3], [7, 6], [1, 2], [1, 8], [14, 2], [14, 8]], desc: '길이 두 갈래로 나뉘어요' },
    { id: 'yard', name: '4교시 · 운동장', short: '운동장', theme: 'yard', boss: 'soccer', pool: ['snake', 'plane', 'eraser', 'knight', 'ghost', 'tack', 'balloon', 'milk', 'bat'],
      paths: [[[-2, 8], [3, 8], [3, 1], [7, 1], [7, 8], [11, 8], [11, 1], [14, 1], [14, 5], [16.6, 5]]],
      blocks: [[5, 4], [9, 4], [13, 7], [1, 4]], desc: '넓고 구불구불, 빠른 괴물이 많아요' },
    { id: 'cafe', name: '5교시 · 급식실', short: '급식실', theme: 'cafe', boss: 'tray', pool: ['snake', 'plane', 'eraser', 'knight', 'ghost', 'tack', 'balloon', 'milk', 'bat'],
      paths: [[[-2, 1], [6, 1], [6, 4], [10, 4], [10, 6], [16.6, 6]], [[-2, 8], [3, 8], [3, 4], [6, 4], [10, 4], [10, 6], [16.6, 6]], [[13, -1.6], [13, 2], [9, 2], [9, 4], [10, 4], [10, 6], [16.6, 6]]],
      blocks: [[2, 3], [7, 2], [14, 3], [6, 8], [12, 8]], desc: '세 군데 입구에서 몰려와요' }
  ];
  const HEROES = {
    minjun:  { name: '반장 민준', icon: '🧢', role: '근접 · 길막기', hp: 260, atk: 13, rate: 0.75, range: 0.95, speed: 2.3, block: 3, def: 0.3, air: false, shirt: 0x3f8de0,
               desc: '리코더를 휘둘러 싸우는 튼튼한 반장. 괴물 셋까지 길을 막고 버텨요.', skill: { name: '줄 서!', icon: '📢', cd: 14, desc: '주변 괴물을 꼼짝 못 하게 묶어요' } },
    seoyeon: { name: '피구왕 서연', icon: '🎀', role: '원거리 · 연사', hp: 120, atk: 9, rate: 0.4, range: 3.3, speed: 2.8, block: 1, def: 0, air: true, shirt: 0xff6f91,
               desc: '피구공을 빠르게 던지는 원거리 영웅. 하늘도 맞혀요!', skill: { name: '강슛', icon: '⚽', cd: 11, desc: '일직선으로 꿰뚫는 강력한 슛' } },
    doyun:   { name: '과학부 도윤', icon: '🧪', role: '범위 · 독', hp: 140, atk: 14, rate: 1.3, range: 2.6, speed: 2.2, block: 1, def: 0, air: false, splash: 0.9, shirt: 0xf3f3f3,
               desc: '플라스크를 던져 펑! 맞은 자리에 독 거품이 남아 계속 아파요.', skill: { name: '부글부글 폭발', icon: '💥', cd: 16, desc: '넓은 범위를 크게 폭발시켜요' } },
    haeun:   { name: '미술부 하은', icon: '🎨', role: '지원 · 강화', hp: 130, atk: 5, rate: 0.9, range: 2.8, speed: 2.4, block: 1, def: 0, air: true, shirt: 0xb07ae0,
               desc: '물감으로 괴물을 느리게 하고, 곁에 있는 장난감 공격력을 25% 올려요.', skill: { name: '무지개 물감', icon: '🌈', cd: 18, desc: '넓게 느리게 하고 장난감을 크게 강화해요' } }
  };
  const HERO_XP = [0, 25, 70, 140, 240];
  const TEACHER = {
    quiet: { name: '조용히 해!', icon: '📏', cd: 50, desc: '모든 괴물이 3초 동안 얼어붙어요' },
    chalk: { name: '분필 던지기', icon: '🖍️', cd: 25, desc: '누른 곳에 분필이 쾅! 큰 피해' },
    snack: { name: '간식 시간', icon: '🍪', cd: 60, desc: '동전을 바로 받아요' }
  };
  const ACH = [
    ['firstTower', '🧸', '첫 장난감', '장난감을 처음 세웠어요'],
    ['firstWin', '🎒', '첫 승리', '맵을 처음 깼어요'],
    ['perfect', '💯', '완벽 수비', '목숨을 하나도 잃지 않고 깼어요'],
    ['boss', '👑', '보스 사냥꾼', '보스를 쓰러뜨렸어요'],
    ['branch', '🌿', '갈래 장인', '장난감을 3단계 갈래로 키웠어요'],
    ['rich', '🏰', '장난감 부자', '장난감을 한 번에 15개 세웠어요'],
    ['heroMax', '⭐', '영웅 성장', '영웅이 레벨 5가 됐어요'],
    ['skill10', '✨', '필살기 달인', '영웅 필살기를 10번 썼어요'],
    ['teacher', '👩‍🏫', '선생님 출동', '한 판에서 선생님 스킬 셋을 모두 썼어요'],
    ['early10', '⏩', '빨리빨리', '웨이브를 일찍 10번 불렀어요'],
    ['allMaps', '🏫', '하루 수업 끝', '맵 5개를 모두 깼어요'],
    ['hard', '🔥', '어려움 정복', '어려움으로 맵을 깼어요'],
    ['stars15', '🌟', '별 수집가', '별을 15개 모았어요'],
    ['endless10', '♾️', '끝없는 쉬는 시간', '무한 모드 10웨이브를 버텼어요'],
    ['endless25', '🏆', '전설의 수비대', '무한 모드 25웨이브를 버텼어요']
  ];

  const STICKERS = [
    { cost: 1, label: t => t === 'flute' ? '노래 효과 +5%p' : '공격력 +8%' },
    { cost: 2, label: () => '사거리 +8%' },
    { cost: 3, label: () => '가격 -10%' }
  ];
  const HERO_RANK = [0, 200, 500, 1000, 2000];
  const HERO_COLORS = { minjun: [0x3f8de0, 0x2fae6a, 0xf2b72e], seoyeon: [0xff6f91, 0xffb03a, 0x7a52d6], doyun: [0xf3f3f3, 0x5fd3c8, 0x4a4a5a], haeun: [0xb07ae0, 0xff8a5a, 0x5fb4ff] };
  const COLOR_RANK = [1, 3, 5];
  const RULES = {
    sling: { name: '새총만', icon: '🪃', desc: '새총만 세울 수 있어요' },
    nohero: { name: '영웅 없이', icon: '🙅', desc: '영웅 없이 장난감과 선생님만으로!' },
    fast: { name: '빠른 괴물', icon: '💨', desc: '괴물이 30% 빨라요' },
    poor: { name: '용돈 부족', icon: '🪙', desc: '처음 동전이 40% 적어요' }
  };
  const CARDS = [
    { id: 'dmg', icon: '💪', name: '힘내라 장난감', desc: '모든 장난감 공격력 +12%', apply: m => { m.dmg += 0.12; } },
    { id: 'rate', icon: '⚡', name: '빨리빨리', desc: '모든 장난감 공격 속도 +10%', apply: m => { m.rate += 0.1; } },
    { id: 'coin', icon: '💰', name: '용돈 받기', desc: '동전 +120', apply: () => { money += 120; } },
    { id: 'life', icon: '❤️', name: '보건실', desc: '목숨 +3', apply: () => { lives += 3; } },
    { id: 'hero', icon: '🦸', name: '영웅 간식', desc: '영웅 공격력 +25%', apply: m => { m.hero += 0.25; } },
    { id: 'cheap', icon: '🏷️', name: '문방구 세일', desc: '장난감 가격 -10%', apply: m => { m.costMul *= 0.9; } },
    { id: 'cd', icon: '⏱️', name: '선생님 커피', desc: '선생님 스킬 대기 -20%', apply: m => { m.cdMul *= 0.8; } },
    { id: 'slow', icon: '🐌', name: '미끄러운 바닥', desc: '괴물 속도 -6%', apply: m => { m.slow += 0.06; } }
  ];
  const MOVE_COST = 15;

  // =====================================================================
  // 저장
  // =====================================================================
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  };
  const loadJ = (k, d) => { try { return JSON.parse(store.get(k, '')) || d; } catch (e) { return d; } };
  const opt = Object.assign({ level: 'normal', quality: 'auto', sound: 'on', music: 'on', hero: 'minjun', heroAuto: 'on', sfxVol: 80, musVol: 60, speed: 1, heroColor: {} }, loadJ('recess.opt', {}));
  const prog = Object.assign({ stars: {}, cleared: {}, seen: {}, ach: {}, stats: { skills: 0, early: 0 }, endless: {}, stk: {}, bonus: 0, hxp: {}, daily: {}, tutDone: false }, loadJ('recess.prog', {}));
  ['stk', 'hxp', 'daily'].forEach(k => { if (!prog[k] || typeof prog[k] !== 'object') prog[k] = {}; });
  const saveOpt = () => store.set('recess.opt', JSON.stringify(opt));
  const saveProg = () => store.set('recess.prog', JSON.stringify(prog));

  const $ = id => document.getElementById(id);
  const canvas = $('gl');

  // =====================================================================
  // 3D 기본
  // =====================================================================
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  scene.background = new T.Color(0xbfe3f2);
  scene.fog = new T.Fog(0xbfe3f2, 30, 70);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 200);
  const hemi = new T.HemisphereLight(0xfff6e6, 0x9a8a76, 0.65); scene.add(hemi);
  const sun = new T.DirectionalLight(0xfff1d6, 0.7);
  sun.position.set(-8, 16, 10);
  sun.shadow.camera.left = -14; sun.shadow.camera.right = 14; sun.shadow.camera.top = 12; sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0008;
  scene.add(sun);

  // 화면 효과: 빛 번짐 + 색감 + 가장자리 어둡게 (고화질 전용)
  const post = (() => {
    let ok = true, rtMain = null, rtA = null, rtB = null;
    const qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1), qScene = new T.Scene(), quad = new T.Mesh(new T.PlaneGeometry(2, 2));
    quad.frustumCulled = false; qScene.add(quad);
    const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
    const mk = (u, fs) => new T.ShaderMaterial({ uniforms: u, vertexShader: vs, fragmentShader: fs, depthTest: false, depthWrite: false });
    const bright = mk({ tDiffuse: { value: null }, th: { value: 0.955 } },
      'uniform sampler2D tDiffuse; uniform float th; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114)); gl_FragColor = vec4(c * smoothstep(th, 1.0, l), 1.0); }');
    const blur = mk({ tDiffuse: { value: null }, dir: { value: new T.Vector2() } },
      'uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227; c += (texture2D(tDiffuse, vUv + dir * 1.384).rgb + texture2D(tDiffuse, vUv - dir * 1.384).rgb) * 0.316; c += (texture2D(tDiffuse, vUv + dir * 3.23).rgb + texture2D(tDiffuse, vUv - dir * 3.23).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }');
    const comp = mk({ tDiffuse: { value: null }, tBloom: { value: null }, strength: { value: 0.28 }, tint: { value: new T.Vector3(1, 1, 1) } },
      'uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float strength; uniform vec3 tint; varying vec2 vUv;' +
      'void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb + texture2D(tBloom, vUv).rgb * strength;' +
      ' float g = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(g), c, 1.1); c *= tint;' +
      ' vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * 0.5; gl_FragColor = vec4(c, 1.0); }');
    const size = new T.Vector2();
    function ensure() {
      renderer.getDrawingBufferSize(size);
      const W = Math.max(2, size.x), H = Math.max(2, size.y);
      if (rtMain && rtMain.width === W && rtMain.height === H) return;
      [rtMain, rtA, rtB].forEach(r => r && r.dispose());
      rtMain = renderer.capabilities.isWebGL2 && T.WebGLMultisampleRenderTarget ? new T.WebGLMultisampleRenderTarget(W, H) : new T.WebGLRenderTarget(W, H);
      const o = { depthBuffer: false, minFilter: T.LinearFilter, magFilter: T.LinearFilter };
      rtA = new T.WebGLRenderTarget(Math.ceil(W / 4), Math.ceil(H / 4), o); rtB = new T.WebGLRenderTarget(Math.ceil(W / 4), Math.ceil(H / 4), o);
    }
    function pass(m, target) { quad.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
    return {
      get ok() { return ok; },
      tint(t) { comp.uniforms.tint.value.set(t[0], t[1], t[2]); },
      render() {
        try {
          ensure();
          renderer.setRenderTarget(rtMain); renderer.render(scene, camera);
          bright.uniforms.tDiffuse.value = rtMain.texture; pass(bright, rtA);
          for (let i = 0; i < 2; i++) {
            blur.uniforms.tDiffuse.value = rtA.texture; blur.uniforms.dir.value.set(1 / rtA.width, 0); pass(blur, rtB);
            blur.uniforms.tDiffuse.value = rtB.texture; blur.uniforms.dir.value.set(0, 1 / rtA.height); pass(blur, rtA);
          }
          comp.uniforms.tDiffuse.value = rtMain.texture; comp.uniforms.tBloom.value = rtA.texture; pass(comp, null);
        } catch (err) { ok = false; renderer.setRenderTarget(null); renderer.render(scene, camera); }
      }
    };
  })();

  const toW = (gx, gy) => new T.Vector3(gx - GW / 2 + 0.5, 0, gy - GH / 2 + 0.5);
  // 툰 셰이딩: 명암을 3단계로 끊어 만화처럼
  const toonGrad = (() => {
    const t = new T.DataTexture(new Uint8Array([105, 105, 105, 255, 170, 170, 170, 255, 228, 228, 228, 255]), 3, 1, T.RGBAFormat);
    t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  })();
  const mats = {};
  function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!mats[key]) {
      const o = Object.assign({}, opts), metal = o.metalness;
      delete o.roughness; delete o.metalness;
      const m = new T.MeshToonMaterial(Object.assign({ color, gradientMap: toonGrad }, o));
      if (metal) m.emissive = new T.Color(color).multiplyScalar(0.18);
      mats[key] = m;
    }
    return mats[key];
  }
  const glowMats = {};
  const matB = c => glowMats[c] || (glowMats[c] = new T.MeshBasicMaterial({ color: c }));
  // 외곽선: 뒷면을 법선 방향으로 살짝 부풀려 검게 칠함 (고화질에서만 보임)
  const outlineMat = new T.ShaderMaterial({
    uniforms: { thick: { value: 0.032 }, color: { value: new T.Color(0x2a1a10) } },
    vertexShader: 'uniform float thick; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vec3 n = normalize(normalMatrix * normal); mv.xyz += n * thick; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }',
    side: T.BackSide
  });
  const NO_OUTLINE = { PlaneGeometry: 1, RingGeometry: 1, CircleGeometry: 1 };
  function addOutline(root) {
    const list = [];
    root.traverse(o => {
      if (!o.isMesh || o.userData.isOutline || !o.material || o.material.transparent || o.material.isMeshBasicMaterial || o.material.side === T.DoubleSide || NO_OUTLINE[o.geometry.type]) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) >= 0.075) list.push(o);
    });
    list.forEach(o => { const ol = new T.Mesh(o.geometry, outlineMat); ol.userData.isOutline = true; ol.raycast = () => {}; o.add(ol); });
    return root;
  }
  // 둥근 모서리 상자
  function rbox(w, h, d, r = 0.05, sg = 3) {
    const g = new T.BoxGeometry(w, h, d, sg * 2, sg * 2, sg * 2);
    r = Math.min(r, w / 2, h / 2, d / 2) * 0.999;
    const p = g.attributes.position, n = g.attributes.normal, hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r, v = new T.Vector3(), c = new T.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      v.sub(c).normalize(); n.setXYZ(i, v.x, v.y, v.z);
      v.multiplyScalar(r).add(c); p.setXYZ(i, v.x, v.y, v.z);
    }
    return g;
  }
  // 같은 모양은 한 번만 만들어 함께 씀 (메모리 절약)
  const gcache = {};
  function GEO(type, ...a) {
    const k = type + ':' + a.join(',');
    if (!gcache[k]) { gcache[k] = type === 'rbox' ? rbox(...a) : new T[type](...a); gcache[k].userData.keep = true; }
    return gcache[k];
  }
  function mesh(geo, m, cast = true, recv = false) { const o = new T.Mesh(geo, m); o.castShadow = cast; o.receiveShadow = recv; return o; }
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
  }

  const G = {
    eyeW: new T.SphereGeometry(0.07, 10, 8), eyeB: new T.SphereGeometry(0.035, 8, 6),
    pebble: new T.SphereGeometry(0.07, 8, 6), drop: new T.SphereGeometry(0.06, 8, 6),
    ring: new T.RingGeometry(0.96, 1, 48), spark: new T.SphereGeometry(0.05, 6, 4),
    ball: new T.SphereGeometry(0.1, 12, 10), flask: new T.SphereGeometry(0.09, 10, 8),
    disc: new T.CircleGeometry(1, 40), card: new T.BoxGeometry(0.24, 0.05, 0.24), star: new T.OctahedronGeometry(0.07)
  };
  G.ring.rotateX(-Math.PI / 2); G.disc.rotateX(-Math.PI / 2);
  G.xbar = new T.BoxGeometry(0.12, 0.028, 0.02);
  Object.values(G).forEach(g => { g.userData.keep = true; });
  // 여러 조각을 한 덩어리로 합쳐 그리기 횟수를 줄임
  const bakeCache = {};
  function mergeGeos(list) {
    let total = 0;
    const parts = list.map(([g, m]) => { const ng = g.index ? g.toNonIndexed() : g; total += ng.attributes.position.count; return [ng, m]; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), v = new T.Vector3(), nm = new T.Matrix3();
    let off = 0;
    parts.forEach(([g, m]) => {
      nm.getNormalMatrix(m);
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(m); pos[(off + i) * 3] = v.x; pos[(off + i) * 3 + 1] = v.y; pos[(off + i) * 3 + 2] = v.z;
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor[(off + i) * 3] = v.x; nor[(off + i) * 3 + 1] = v.y; nor[(off + i) * 3 + 2] = v.z;
      }
      off += p.count;
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3)); out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.computeBoundingSphere(); out.userData.keep = true;
    return out;
  }
  function bake(parent, key) {
    if (!parent) return;
    const groups = new Map();
    parent.children.slice().forEach(o => {
      if (!o.isMesh || o.userData.dyn || o.children.length) return;
      if (!groups.has(o.material)) groups.set(o.material, []);
      groups.get(o.material).push(o);
    });
    let gi = 0;
    groups.forEach((list, m) => {
      gi++;
      if (list.length < 2) return;
      const k = key + ':' + gi + ':' + list.length;
      if (!bakeCache[k]) bakeCache[k] = mergeGeos(list.map(o => { o.updateMatrix(); return [o.geometry, o.matrix.clone()]; }));
      const cast = list.some(o => o.castShadow);
      list.forEach(o => parent.remove(o));
      const bm = new T.Mesh(bakeCache[k], m); bm.castShadow = cast; parent.add(bm);
    });
  }
  const eyeMat = new T.MeshBasicMaterial({ vertexColors: true });
  function eyes(group, y, z, s = 1, gap = 0.1) {
    const ud = group.userData; ud.eyes = ud.eyes || [];
    const k = 'eyes:' + s + ':' + gap;
    if (!bakeCache[k]) {
      const mw = (x, zz) => new T.Matrix4().compose(new T.Vector3(x, 0, zz), new T.Quaternion(), new T.Vector3(s, s, s));
      const gw = mergeGeos([[G.eyeW, mw(-gap * s, 0)], [G.eyeW, mw(gap * s, 0)]]), gb = mergeGeos([[G.eyeB, mw(-gap * s, 0.05 * s)], [G.eyeB, mw(gap * s, 0.05 * s)]]);
      const both = mergeGeos([[gw, new T.Matrix4()], [gb, new T.Matrix4()]]);
      const nW = gw.attributes.position.count, col = new Float32Array(both.attributes.position.count * 3);
      for (let i = 0; i < col.length / 3; i++) { const c = i < nW ? 1 : 0.13; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = c; }
      both.setAttribute('color', new T.BufferAttribute(col, 3));
      bakeCache[k] = both; bakeCache[k + 'b'] = gb;
    }
    const w = new T.Mesh(bakeCache[k], eyeMat); w.position.set(0, y, z); w.userData.dyn = true; group.add(w);
    ud.eyes.push({ w, s, gap, y, z, gb: bakeCache[k + 'b'] });
  }
  // 표정: 깜빡임 / 아플 때 찡그림
  function faceAnim(ud, t, hurt) {
    if (!ud.eyes) return;
    const blink = ((t + (ud.blinkOff || 0)) % 3.4) < 0.12;
    ud.eyes.forEach(e => {
      e.w.scale.set(hurt ? 1.08 : 1, blink ? 0.12 : hurt ? 0.4 : 1, 1);
    });
  }

  // =====================================================================
  // 맵
  // =====================================================================
  let mapIdx = 0, MAP = MAPS[0], paths = [], pathTiles = new Set(), blockTiles = new Set(), mapGroup = null, baseBox = null, tileMesh = null;
  function buildPaths() {
    paths = MAP.paths.map(pg => {
      const pts = pg.map(([x, y]) => toW(x, y));
      const len = [0]; let acc = 0;
      for (let i = 1; i < pts.length; i++) { acc += pts[i].distanceTo(pts[i - 1]); len.push(acc); }
      return { pts, len, total: acc };
    });
    pathTiles = new Set(); blockTiles = new Set();
    MAP.paths.forEach(pg => {
      for (let i = 1; i < pg.length; i++) {
        const [x0, y0] = pg[i - 1], [x1, y1] = pg[i];
        const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2);
        for (let k = 0; k <= n; k++) {
          const gx = Math.round(x0 + (x1 - x0) * k / n), gy = Math.round(y0 + (y1 - y0) * k / n);
          if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) pathTiles.add(gx + ',' + gy);
        }
      }
    });
    MAP.blocks.forEach(([x, y]) => blockTiles.add(x + ',' + y));
  }
  function pathAt(pi, d) {
    const P = paths[pi] || paths[0];
    d = Math.max(0, Math.min(P.total, d));
    let i = 1; while (i < P.len.length - 1 && P.len[i] < d) i++;
    const a = P.pts[i - 1], b = P.pts[i], seg = P.len[i] - P.len[i - 1];
    const t = seg > 0 ? (d - P.len[i - 1]) / seg : 0;
    return { pos: new T.Vector3().lerpVectors(a, b, t), dir: new T.Vector3().subVectors(b, a).normalize() };
  }
  const endPos = () => paths[0].pts[paths[0].pts.length - 1];
  const THEMES = {
    class: { floor: ['#d9a86a', '#cf9c5e', '#ddb072'], plank: true, path: 0x6fbf73, wall: 0xf3e6c8, sky: ['#9fd3f2', '#fdecc8'],
             light: { sun: 0xfff0d8, int: 0.76, pos: [-13, 12, 6], hemi: 0xfff3e0, ground: 0x9a8a76, hInt: 0.62 }, beams: 0xfff0c8, dust: 0xfff0c0, tint: [1.03, 1.0, 0.95], name: '아침 햇살' },
    hall:  { floor: ['#c9d3cf', '#b8c4bf', '#d8e0dc'], checker: true, gloss: 0.55, path: 0xf2b866, wall: 0xe8eef0, sky: ['#b2daf4', '#eef5f8'],
             light: { sun: 0xfff3dc, int: 0.74, pos: [-11, 14, 8], hemi: 0xf6fbff, ground: 0x8f9a96, hInt: 0.62 }, beams: 0xfff6e0, dust: 0xffffff, tint: [1, 1, 1] },
    lab:   { floor: ['#d3dde4', '#bfccd6', '#dde5ea'], checker: true, gloss: 0.75, path: 0x7fd6c8, wall: 0xdff0f0, sky: ['#9fd9e6', '#eafcff'],
             light: { sun: 0xf2faff, int: 0.6, pos: [-8, 15, 8], hemi: 0xe6f2ff, ground: 0x7a8f98, hInt: 0.48 }, beams: 0xe6f8ff, bubbles: true, tint: [0.97, 1.01, 1.04] },
    yard:  { floor: ['#e2c08a', '#d8b57c', '#ead0a0'], sand: true, path: 0xd9ccaa, wall: null, sky: ['#58b4f2', '#d8f0ff'],
             light: { sun: 0xfff2c8, int: 0.72, pos: [7, 14, 10], hemi: 0xfff6dc, ground: 0x8aa070, hInt: 0.5 }, seeds: true, tint: [1.02, 1.01, 0.98] },
    cafe:  { floor: ['#f4d9a8', '#e89a5e', '#f4d9a8'], checker: true, gloss: 0.7, path: 0x8fc7ff, wall: 0xf6e8d2, sky: ['#ff8a64', '#ffd59c'],
             light: { sun: 0xffa868, int: 0.86, pos: [-15, 7, 3], hemi: 0xffd6b4, ground: 0x8a6a5a, hInt: 0.6 }, steam: true, tint: [1.07, 0.99, 0.9] }
  };

  function floorTexture(th) {
    const t = canvasTex(512, 512, (g, w, h) => {
      if (th.plank) {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = th.floor[i % 2 ? 1 : 2]; g.fillRect(0, i * 64, w, 64);
          g.strokeStyle = 'rgba(110,70,30,.35)'; g.lineWidth = 2; g.strokeRect(0, i * 64, w, 64);
          for (let k = 0; k < 3; k++) { const x = (i * 97 + k * 173) % w; g.beginPath(); g.moveTo(x, i * 64); g.lineTo(x, i * 64 + 64); g.stroke(); }
        }
      } else if (th.checker) {
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = th.floor[(x + y) % 2 ? 1 : 0]; g.fillRect(x * 64, y * 64, 64, 64); }
        g.strokeStyle = 'rgba(0,0,0,.06)'; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
      } else {
        g.fillStyle = th.floor[0]; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 1600; i++) { g.fillStyle = th.floor[1 + (i % 2)]; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2); }
      }
    });
    t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(th.plank ? 4 : th.checker ? 8 : 6, th.plank ? 4 : th.checker ? 8 : 6);
    return t;
  }
  function buildMap(k) {
    mapIdx = k; MAP = MAPS[k];
    if (mapGroup) {
      scene.remove(mapGroup);
      mapGroup.traverse(o => {
        if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
        if (o.material && o.material.map && o.material.map !== dotTex && o.material.map !== beamTex) o.material.map.dispose();
      });
    }
    mapGroup = new T.Group(); scene.add(mapGroup);
    ambient = []; fxSpots = []; swayList = []; doors = [];
    ambient.push((dt) => doors.forEach(d => { if (d.t > 0) { d.t = Math.max(0, d.t - dt); const k = d.t / 2.4; d.hinge.rotation.y = -Math.min(1, (1 - k) * 6) * 1.7 * Math.min(1, k * 4) + Math.sin(d.t * 30) * 0.03 * k; } }));
    buildPaths();
    const th = THEMES[MAP.theme];
    applyLight(th);
    const add = o => { mapGroup.add(o); return o; };
    const floor = add(mesh(new T.PlaneGeometry(80, 80), new T.MeshStandardMaterial({ map: floorTexture(th), roughness: th.gloss || 0.85 }), false, true));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.01;
    // 길
    const pm = mat(th.path, { roughness: 0.9 }), dm = mat(0xffffff, { roughness: 0.6 });
    paths.forEach(P => {
      for (let i = 1; i < P.pts.length; i++) {
        const a = P.pts[i - 1], b = P.pts[i], len = a.distanceTo(b) + 0.92;
        const m = add(mesh(new T.BoxGeometry(0.92, 0.04, len), pm, false, true));
        m.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2); m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        const n = Math.floor(a.distanceTo(b) / 0.5);
        for (let q = 0; q < n; q++) {
          const p = new T.Vector3().lerpVectors(a, b, (q + 0.5) / n);
          const d = add(mesh(new T.BoxGeometry(0.16, 0.05, 0.05), dm, false, false));
          d.position.set(p.x, 0.045, p.z); d.rotation.y = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
        }
      }
      // 입구 문
      const s = P.pts[0], s2 = P.pts[1], dir = new T.Vector3().subVectors(s2, s).normalize();
      const door = add(new T.Group());
      const fr = mesh(new T.BoxGeometry(1.5, 2.4, 0.18), mat(0x9b6b3d)); fr.position.y = 1.2; door.add(fr);
      const hole = mesh(new T.BoxGeometry(1.1, 2.0, 0.2), mat(0x3a2a1a)); hole.position.set(0, 1.0, 0.02); door.add(hole);
      const hinge = new T.Group(); hinge.position.set(-0.55, 0, 0.13); door.add(hinge);
      const leaf = mesh(new T.BoxGeometry(1.08, 1.98, 0.06), mat(0xc98a4b)); leaf.position.set(0.54, 1.0, 0); hinge.add(leaf);
      const knob = mesh(new T.SphereGeometry(0.06, 8, 6), mat(0xffd84d, { metalness: 0.5 })); knob.position.set(0.95, 1.0, 0.06); hinge.add(knob);
      door.position.copy(s).addScaledVector(dir, -0.4); door.rotation.y = Math.atan2(dir.x, dir.z);
      addOutline(door); doors.push({ hinge, t: 0 });
    });
    // 건설 칸
    const tileGeo = new T.PlaneGeometry(0.86, 0.86); tileGeo.rotateX(-Math.PI / 2);
    const tiles = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (!pathTiles.has(x + ',' + y) && !blockTiles.has(x + ',' + y)) tiles.push([x, y]);
    tileMesh = new T.InstancedMesh(tileGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13, depthWrite: false }), tiles.length);
    const m4 = new T.Matrix4();
    tiles.forEach(([x, y], i) => { const p = toW(x, y); m4.makeTranslation(p.x, 0.012, p.z); tileMesh.setMatrixAt(i, m4); });
    add(tileMesh);
    // 테마 장식
    decorate(MAP.theme, add, th);
    atmosphere(th, add);
    // 장애물
    MAP.blocks.forEach(([x, y], i) => { const p = toW(x, y); add(blockDecor(MAP.theme, i, p.x, p.z)); });
    // 교탁과 간식 상자
    const end = endPos();
    const tdesk = add(new T.Group());
    const top = mesh(new T.BoxGeometry(1.8, 0.16, 1.4), mat(0xb07a46)); top.position.y = 0.9; tdesk.add(top);
    const body = mesh(new T.BoxGeometry(1.6, 0.85, 1.2), mat(0x9b6b3d)); body.position.y = 0.43; tdesk.add(body);
    baseBox = new T.Group();
    const box = mesh(new T.BoxGeometry(0.9, 0.5, 0.7), mat(0xff7aa0)); box.position.y = 0.25; baseBox.add(box);
    const lid = mesh(new T.BoxGeometry(0.96, 0.08, 0.76), mat(0xffd84d)); lid.position.y = 0.52; baseBox.add(lid);
    const rib = mesh(new T.BoxGeometry(0.12, 0.52, 0.72), mat(0xffffff)); rib.position.y = 0.26; baseBox.add(rib);
    [[0x7cc8ff, -0.2], [0x8de08a, 0.05], [0xc59bff, 0.25]].forEach(([c, dx], i) => {
      const candy = mesh(new T.SphereGeometry(0.12, 12, 10), mat(c, { roughness: 0.3 })); candy.position.set(dx, 0.66 + (i % 2) * 0.05, 0.05 * i); baseBox.add(candy);
    });
    baseBox.position.y = 0.98; tdesk.add(baseBox);
    tdesk.position.set(end.x + 0.6, 0, end.z); addOutline(tdesk);
  }
  function decorate(theme, add, th) {
    const wall = (w, h, x, z, ry) => { const m = add(mesh(new T.BoxGeometry(w, h, 0.4), mat(th.wall), false, true)); m.position.set(x, h / 2, z); m.rotation.y = ry || 0; return m; };
    const boardTex = (title, sub, bg) => canvasTex(1024, 384, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 60, 3);
      g.fillStyle = '#f6f6ee'; g.font = '84px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(title, w / 2, h * 0.42); g.font = '48px Jua, sans-serif'; g.fillStyle = '#ffe680'; g.fillText(sub, w / 2, h * 0.75);
    });
    const board = (title, sub, bg) => {
      const b = add(mesh(new T.PlaneGeometry(10, 3.6), new T.MeshStandardMaterial({ map: boardTex(title, sub, bg), roughness: 0.9 }), false, false));
      b.position.set(0, 3.2, -GH / 2 - 1.99);
      const f = add(mesh(new T.BoxGeometry(10.4, 4, 0.12), mat(0xa0723f), false, false)); f.position.set(0, 3.2, -GH / 2 - 2.05);
    };
    const windows = () => {
      wall(24, 6, -GW / 2 - 3.2, 0, Math.PI / 2);
      for (let i = -1; i <= 1; i++) {
        const win = add(mesh(new T.PlaneGeometry(4, 2.6), new T.MeshBasicMaterial({ color: 0xd6f1ff }), false, false));
        win.position.set(-GW / 2 - 2.99, 3.3, i * 6); win.rotation.y = Math.PI / 2;
        const lit = add(mesh(new T.PlaneGeometry(3.2, 2.4), new T.MeshBasicMaterial({ color: 0xfff2c4, transparent: true, opacity: 0.2, depthWrite: false }), false, false));
        lit.rotation.x = -Math.PI / 2; lit.position.set(-GW / 2 + 0.7, 0.015, i * 6);
      }
    };
    if (theme === 'class') {
      wall(24, 6, 0, -GH / 2 - 2.2); windows();
      board('쉬는 시간! 간식 상자를 지켜라', '★ 장난감 수비대 출동 ★', '#2f5a3f');
      [[-11.5, -3], [-11.5, 1.5], [11.8, 1.3], [-5, 7.3], [0, 7.3], [5, 7.3], [-9, 7.4]].forEach(([x, z]) => add(makeDesk(x, z)));
    } else if (theme === 'hall') {
      wall(30, 6, 0, -GH / 2 - 2.2); windows();
      for (let i = 0; i < 14; i++) {
        const c = [0x5fa8e8, 0x6fcf6a, 0xff8a5a, 0xffc24d][i % 4];
        const lk = add(mesh(new T.BoxGeometry(1.1, 2.4, 0.6), mat(c))); lk.position.set(-10 + i * 1.5, 1.2, -GH / 2 - 1.7);
        const ln = add(mesh(new T.BoxGeometry(0.6, 0.06, 0.02), mat(0x333333), false)); ln.position.set(-10 + i * 1.5, 1.9, -GH / 2 - 1.39);
      }
      const sign = add(mesh(new T.PlaneGeometry(4, 1), new T.MeshStandardMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#2f6fd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '72px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('복도에서 뛰지 마세요', w / 2, h / 2); }) }), false, false));
      sign.position.set(0, 4.2, -GH / 2 - 1.98);
    } else if (theme === 'lab') {
      wall(24, 6, 0, -GH / 2 - 2.2); windows();
      board('과학실 · 실험 중!', '⚗️ 플라스크에 손대지 마세요', '#244a5a');
      [[-11.5, -2], [-11.5, 3], [11.8, -3], [11.8, 2.5], [-3, 7.4], [4, 7.4]].forEach(([x, z]) => {
        const g = add(new T.Group());
        const tb = mesh(new T.BoxGeometry(2, 0.12, 1.1), mat(0x2d2d33)); tb.position.y = 0.85; g.add(tb);
        const bd = mesh(new T.BoxGeometry(1.9, 0.8, 1.0), mat(0xe8e8e8)); bd.position.y = 0.42; g.add(bd);
        [[-0.5, 0x7cff8a], [0, 0xff7aa0], [0.5, 0x7cc8ff]].forEach(([dx, c]) => { const f = mesh(new T.SphereGeometry(0.14, 10, 8), mat(c, { roughness: 0.2, transparent: true, opacity: 0.85 })); f.position.set(dx, 1.05, 0); g.add(f); fxSpots.push({ x: x + dx, y: 1.12, z, c }); });
        g.position.set(x, 0, z);
      });
    } else if (theme === 'yard') {
      // 잔디 가장자리, 축구 골대, 나무
      const grass = add(mesh(new T.RingGeometry(16, 40, 48), mat(0x7cc86a), false, true)); grass.rotation.x = -Math.PI / 2; grass.position.y = 0;
      const lineM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
      const circle = add(new T.Mesh(new T.RingGeometry(2.4, 2.55, 48), lineM)); circle.rotation.x = -Math.PI / 2; circle.position.set(0, 0.015, 0);
      const goal = add(new T.Group());
      const post = (x, y, z, w, h, d) => { const p = mesh(new T.BoxGeometry(w, h, d), mat(0xffffff)); p.position.set(x, y, z); goal.add(p); };
      post(-2, 1, 0, 0.12, 2, 0.12); post(2, 1, 0, 0.12, 2, 0.12); post(0, 2, 0, 4.1, 0.12, 0.12);
      goal.position.set(0, 0, -GH / 2 - 2);
      [[-12, -6], [-12, 4], [12, -6], [12.5, 5], [-6, -8], [7, -8]].forEach(([x, z]) => {
        const g = add(new T.Group());
        const tr = mesh(new T.CylinderGeometry(0.2, 0.28, 1.6, 8), mat(0x8a5a35)); tr.position.y = 0.8; g.add(tr);
        const lf = mesh(new T.SphereGeometry(1.1, 12, 10), mat(0x5aa858)); lf.position.y = 2.1; g.add(lf);
        const lf2 = mesh(new T.SphereGeometry(0.7, 10, 8), mat(0x6cbf62)); lf2.position.set(0.5, 2.6, 0.3); g.add(lf2);
        g.position.set(x, 0, z); swayList.push({ m: g, ph: x * 0.7 + z }); addOutline(g);
      });
    } else if (theme === 'cafe') {
      wall(26, 6, 0, -GH / 2 - 2.2);
      const counter = add(mesh(new T.BoxGeometry(14, 1.1, 1.2), mat(0xd0d6dc))); counter.position.set(0, 0.55, -GH / 2 - 1.2);
      for (let i = 0; i < 5; i++) { const pot = add(mesh(new T.CylinderGeometry(0.45, 0.45, 0.5, 16), mat(0x9aa4ae, { metalness: 0.5, roughness: 0.3 }))); pot.position.set(-5 + i * 2.5, 1.35, -GH / 2 - 1.2); fxSpots.push({ x: -5 + i * 2.5, y: 1.6, z: -GH / 2 - 1.2 }); }
      const sign = add(mesh(new T.PlaneGeometry(5, 1.2), new T.MeshStandardMaterial({ map: canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#e8743a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '72px Jua, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('오늘의 메뉴: 카레', w / 2, h / 2); }) }), false, false));
      sign.position.set(0, 3.8, -GH / 2 - 1.98);
      [[-11.5, -2], [-11.5, 3], [11.8, -3.5], [-4, 7.5], [3, 7.5]].forEach(([x, z]) => {
        const g = add(new T.Group());
        const tb = mesh(new T.BoxGeometry(2.4, 0.1, 1.0), mat(0xf2f2f2)); tb.position.y = 0.75; g.add(tb);
        [[-0.7, 0], [0.7, 0]].forEach(([dx]) => { const tr = mesh(new T.BoxGeometry(0.6, 0.04, 0.42), mat(0xb8c4cc, { metalness: 0.4 })); tr.position.set(dx, 0.82, 0); g.add(tr); });
        const leg = mesh(new T.BoxGeometry(0.1, 0.75, 0.8), mat(0x7a7f8a)); leg.position.y = 0.37; g.add(leg);
        g.position.set(x, 0, z);
      });
    }
  }
  // ---------- 분위기 연출 ----------
  let ambient = [], fxSpots = [], swayList = [], doors = [];
  const dotTex = canvasTex(32, 32, g => { const r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); });
  const beamTex = canvasTex(64, 256, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(255,255,255,.95)'); v.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
    const e = g.createLinearGradient(0, 0, w, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.3, 'rgba(0,0,0,0)'); e.addColorStop(0.7, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = e; g.fillRect(0, 0, w, h);
  });
  let skyTex = null;
  function applyLight(th) {
    const L = th.light;
    sun.color.setHex(L.sun); sun.intensity = L.int; sun.position.set(L.pos[0], L.pos[1], L.pos[2]);
    hemi.color.setHex(L.hemi); hemi.groundColor.setHex(L.ground); hemi.intensity = L.hInt;
    if (skyTex) skyTex.dispose();
    skyTex = canvasTex(4, 256, (g, w, h) => { const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, th.sky[0]); v.addColorStop(1, th.sky[1]); g.fillStyle = v; g.fillRect(0, 0, w, h); });
    scene.background = skyTex; scene.fog.color.set(th.sky[1]);
    post.tint(th.tint);
  }
  const qMul = () => { const q = qualityLevel(); return q === 'low' ? 0.35 : q === 'mid' ? 0.7 : 1; };
  function particles(add, n, b, color, size, rise) {
    n = Math.max(4, Math.round(n * qMul()));
    const pos = new Float32Array(n * 3), seed = [];
    for (let i = 0; i < n; i++) {
      const x = b[0] + Math.random() * (b[1] - b[0]), y = b[2] + Math.random() * (b[3] - b[2]), z = b[4] + Math.random() * (b[5] - b[4]);
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; seed.push([x, z, Math.random() * 6]);
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pm = new T.PointsMaterial({ color, size, map: dotTex, transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending });
    add(new T.Points(geo, pm));
    ambient.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        const sd = seed[i];
        let y = pos[i * 3 + 1] + dt * (rise ? 0.3 + Math.sin(sd[2]) * 0.1 : 0.06 * Math.sin(t * 0.6 + sd[2]));
        if (y > b[3]) y = b[2]; if (y < b[2]) y = b[3];
        pos[i * 3] = sd[0] + Math.sin(t * 0.3 + sd[2]) * 0.45; pos[i * 3 + 1] = y; pos[i * 3 + 2] = sd[1] + Math.cos(t * 0.23 + sd[2]) * 0.35;
      }
      geo.attributes.position.needsUpdate = true;
      pm.opacity = 0.65 + Math.sin(t * 1.3) * 0.2;
    });
  }
  function atmosphere(th, add) {
    // 창문 햇살 기둥
    if (th.beams && qualityLevel() !== 'low') {
      const bm = new T.MeshBasicMaterial({ map: beamTex, color: th.beams, transparent: true, opacity: 0.22, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false });
      for (let i = -1; i <= 1; i++) {
        const grp = new T.Group(); grp.position.set(-GW / 2 - 1.3, 1.7, i * 6); grp.rotation.z = 0.8;
        const a = new T.Mesh(new T.PlaneGeometry(3.0, 5.2), bm); a.rotation.y = Math.PI / 2; grp.add(a);
        const c = new T.Mesh(new T.PlaneGeometry(1.6, 5.2), bm); grp.add(c);
        add(grp);
      }
      ambient.push((dt, t) => { bm.opacity = 0.2 + Math.sin(t * 0.7) * 0.05; });
      particles(add, 70, [-GW / 2 - 3, -GW / 2 + 2, 0.3, 3.6, -GH / 2 - 2, GH / 2 + 2], th.dust || th.beams, 0.08, false);
    }
    // 과학실 거품
    if (th.bubbles) {
      const list = [];
      fxSpots.forEach(sp => { for (let k = 0; k < (qualityLevel() === 'low' ? 1 : 3); k++) { const m = new T.Mesh(G.drop, mat(sp.c, { transparent: true, opacity: 0.85 })); m.scale.setScalar(0.6 + Math.random() * 0.5); add(m); list.push({ m, sp, ph: Math.random() }); } });
      ambient.push((dt, t) => list.forEach(b => {
        const k = (t * 0.45 + b.ph) % 1;
        b.m.position.set(b.sp.x + Math.sin(t * 4 + b.ph * 9) * 0.04, b.sp.y + k * 0.8, b.sp.z + Math.cos(t * 3 + b.ph * 7) * 0.04);
        b.m.visible = k < 0.92;
      }));
    }
    // 급식실 김
    if (th.steam) {
      const list = [];
      fxSpots.forEach(sp => { for (let k = 0; k < 3; k++) { const mm = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false }); const m = new T.Mesh(G.ball, mm); add(m); list.push({ m, mm, sp, ph: k / 3 }); } });
      ambient.push((dt, t) => list.forEach(b => {
        const k = (t * 0.32 + b.ph) % 1;
        b.m.position.set(b.sp.x + Math.sin(t + b.ph * 6) * 0.15 * k, b.sp.y + k * 1.5, b.sp.z);
        b.m.scale.setScalar(1.2 + k * 3.2); b.mm.opacity = 0.42 * (1 - k) * Math.min(1, k * 6);
      }));
      particles(add, 30, [-9, 9, 0.3, 3, -6, 6], 0xffe2b0, 0.07, false);
    }
    // 운동장 나무 흔들림 + 민들레 씨
    if (th.seeds) {
      ambient.push((dt, t) => swayList.forEach(s => { s.m.rotation.z = Math.sin(t * 1.1 + s.ph) * 0.04; s.m.rotation.x = Math.cos(t * 0.9 + s.ph) * 0.03; }));
      particles(add, 45, [-10, 10, 0.4, 4.5, -7, 7], 0xffffff, 0.09, true);
    }
  }

  function makeDesk(x, z) {
    const g = new T.Group();
    const top = mesh(GEO('rbox', 1.6, 0.1, 1.0, 0.04), mat(0xd6a463)); top.position.y = 0.75; g.add(top);
    [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]].forEach(([dx, dz]) => { const leg = mesh(GEO('CylinderGeometry', 0.04, 0.04, 0.75, 6), mat(0x7a7f8a)); leg.position.set(dx, 0.37, dz); g.add(leg); });
    const chair = mesh(GEO('BoxGeometry', 0.6, 0.08, 0.55), mat(0x5fa8e8)); chair.position.set(0, 0.45, 0.85); g.add(chair);
    const back = mesh(GEO('BoxGeometry', 0.6, 0.45, 0.06), mat(0x5fa8e8)); back.position.set(0, 0.7, 1.1); g.add(back);
    g.position.set(x, 0, z); return addOutline(g);
  }
  function blockDecor(theme, i, x, z) {
    const g = new T.Group();
    const kind = { class: ['bag', 'plant', 'books'], hall: ['bucket', 'plant', 'books'], lab: ['flask', 'books', 'bucket'], yard: ['cone', 'ball', 'cone'], cafe: ['milkcrate', 'bucket', 'plant'] }[theme][i % 3];
    if (kind === 'bag') {
      const b = mesh(GEO('rbox', 0.62, 0.7, 0.4, 0.12), mat(0xff8a5a)); b.position.y = 0.35; g.add(b);
      const p = mesh(GEO('BoxGeometry', 0.46, 0.3, 0.1), mat(0xffc24d)); p.position.set(0, 0.25, 0.24); g.add(p);
    } else if (kind === 'plant') {
      const pot = mesh(GEO('CylinderGeometry', 0.28, 0.2, 0.4, 12), mat(0xc7643a)); pot.position.y = 0.2; g.add(pot);
      [[0, 0.65, 0], [0.15, 0.55, 0.1], [-0.15, 0.58, -0.05]].forEach(([dx, dy, dz]) => { const l = mesh(GEO('SphereGeometry', 0.22, 10, 8), mat(0x5fbf5a)); l.position.set(dx, dy, dz); g.add(l); });
    } else if (kind === 'books') {
      [0xe2584c, 0x3f8de0, 0xf2b72e, 0x6fcf6a].forEach((c, k) => { const b = mesh(GEO('BoxGeometry', 0.6 - k * 0.04, 0.12, 0.44), mat(c)); b.position.y = 0.06 + k * 0.12; b.rotation.y = (k % 2 ? 0.2 : -0.15); g.add(b); });
    } else if (kind === 'bucket') {
      const b = mesh(GEO('CylinderGeometry', 0.3, 0.24, 0.5, 14), mat(0x5fa8e8)); b.position.y = 0.25; g.add(b);
      const mop = mesh(GEO('CylinderGeometry', 0.03, 0.03, 1.3, 6), mat(0xb07a46)); mop.position.set(0.1, 0.65, 0); mop.rotation.z = 0.2; g.add(mop);
    } else if (kind === 'flask') {
      const f = mesh(GEO('SphereGeometry', 0.3, 14, 10), mat(0x7cff8a, { roughness: 0.15, transparent: true, opacity: 0.8 })); f.position.y = 0.3; g.add(f);
      const n = mesh(GEO('CylinderGeometry', 0.08, 0.08, 0.3, 10), mat(0xdddddd)); n.position.y = 0.68; g.add(n);
    } else if (kind === 'cone') {
      const c = mesh(GEO('ConeGeometry', 0.28, 0.7, 12), mat(0xff7a2e)); c.position.y = 0.35; g.add(c);
      const s = mesh(GEO('CylinderGeometry', 0.17, 0.2, 0.08, 12), mat(0xffffff)); s.position.y = 0.4; g.add(s);
    } else if (kind === 'ball') {
      const b = mesh(GEO('SphereGeometry', 0.3, 14, 12), mat(0xffffff)); b.position.y = 0.3; g.add(b);
      const p = mesh(GEO('SphereGeometry', 0.31, 6, 4), mat(0x222222, { wireframe: true })); p.position.y = 0.3; g.add(p);
    } else if (kind === 'milkcrate') {
      const c = mesh(GEO('BoxGeometry', 0.7, 0.45, 0.6), mat(0x3f8de0)); c.position.y = 0.22; g.add(c);
      for (let k = 0; k < 4; k++) { const m = mesh(GEO('BoxGeometry', 0.14, 0.24, 0.14), mat(0xffffff)); m.position.set(-0.2 + (k % 2) * 0.4, 0.55, -0.12 + Math.floor(k / 2) * 0.24); g.add(m); }
    }
    g.position.set(x, 0, z); g.rotation.y = i * 0.7; return addOutline(g);
  }

  // =====================================================================
  // 괴물 모양
  // =====================================================================
  const planeGeo = (() => {
    const g = new T.BufferGeometry();
    const v = new Float32Array([0, 0, 0.45, -0.32, 0, -0.3, 0, 0.06, -0.2, 0, 0, 0.45, 0, 0.06, -0.2, 0.32, 0, -0.3, 0, 0, 0.45, 0, -0.1, -0.25, 0, 0.06, -0.2]);
    g.setAttribute('position', new T.BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
  })();
  function makeEnemyMesh(type) {
    const g = new T.Group(), spec = ENEMIES[type];
    let barY = 0.6;
    if (type === 'plane') {
      const p = mesh(planeGeo, mat(0xeae6da, { side: T.DoubleSide })); p.position.y = 0.45; g.add(p);
      eyes(g, 0.5, 0.25, 0.6, 0.08); barY = 0.8;
    } else if (type === 'snake') {
      g.userData.segs = [];
      [0xff6b6b, 0xffd84d, 0x6fcf6a, 0x5fa8e8, 0xc59bff].forEach((c, i) => { const t = mesh(GEO('TorusGeometry', 0.13, 0.05, 6, 14), mat(c, { roughness: 0.5 })); t.rotation.x = Math.PI / 2; t.position.set(0, 0.07, -i * 0.15); t.userData.dyn = true; g.add(t); g.userData.segs.push(t); });
      const head = mesh(GEO('SphereGeometry', 0.13, 12, 10), mat(0xff6b6b)); head.position.set(0, 0.12, 0.13); g.add(head);
      eyes(g, 0.2, 0.22, 0.8, 0.07);
    } else if (type === 'eraser' || type === 'mini') {
      const s = type === 'mini' ? 0.55 : 1;
      const b = mesh(GEO('rbox', 0.5 * s, 0.32 * s, 0.38 * s, 0.07 * s), mat(0xff9fbf)); b.position.y = 0.16 * s; g.add(b);
      const sl = mesh(GEO('rbox', 0.52 * s, 0.34 * s, 0.2 * s, 0.05 * s), mat(0x5fa8e8)); sl.position.set(0, 0.16 * s, -0.08 * s); g.add(sl);
      eyes(g, 0.24 * s, 0.2 * s, 0.9 * s, 0.1);
    } else if (type === 'knight') {
      const c = mesh(GEO('CylinderGeometry', 0.17, 0.17, 0.62, 12), mat(0x7a52d6, { roughness: 0.6 })); c.position.y = 0.31; g.add(c);
      const lab = mesh(GEO('CylinderGeometry', 0.175, 0.175, 0.3, 12), mat(0xffffff)); lab.position.y = 0.3; g.add(lab);
      const tip = mesh(GEO('ConeGeometry', 0.17, 0.26, 12), mat(0x7a52d6)); tip.position.y = 0.75; g.add(tip);
      const sh = mesh(GEO('BoxGeometry', 0.3, 0.34, 0.05), mat(0xb0b8c8, { metalness: 0.4, roughness: 0.4 })); sh.position.set(0.2, 0.32, 0.16); sh.rotation.y = -0.5; g.add(sh);
      eyes(g, 0.48, 0.17, 0.85, 0.08); barY = 1.05;
    } else if (type === 'ghost') {
      const gm = new T.MeshToonMaterial({ color: 0xffffff, gradientMap: toonGrad, transparent: true, opacity: 0.45 });
      const b = mesh(GEO('SphereGeometry', 0.26, 14, 12), gm); b.position.y = 0.45; b.scale.set(1, 1.15, 1); g.add(b);
      const tail = mesh(GEO('ConeGeometry', 0.26, 0.4, 14, 1, true), gm); tail.position.y = 0.18; tail.rotation.x = Math.PI; g.add(tail);
      eyes(g, 0.5, 0.22, 0.8, 0.09); g.userData.ghostMat = gm; barY = 0.9;
    } else if (type === 'tack') {
      const b = mesh(GEO('SphereGeometry', 0.24, 14, 10), mat(0x8a5a35)); b.position.y = 0.22; b.scale.set(1, 0.8, 1.15); g.add(b);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2, sp = mesh(GEO('ConeGeometry', 0.035, 0.22, 6), mat(0xc0c8d0, { metalness: 0.6, roughness: 0.3 }));
        sp.position.set(Math.cos(a) * 0.16, 0.32 + (i % 2) * 0.05, Math.sin(a) * 0.18 - 0.05); sp.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); g.add(sp);
      }
      eyes(g, 0.28, 0.25, 0.8, 0.08);
    } else if (type === 'balloon') {
      const b = mesh(GEO('SphereGeometry', 0.3, 16, 14), mat(0xff5a7a, { roughness: 0.25 })); b.position.y = 1.4; b.scale.set(1, 1.15, 1); g.add(b);
      const knot = mesh(GEO('ConeGeometry', 0.06, 0.08, 8), mat(0xff5a7a)); knot.position.y = 1.03; knot.rotation.x = Math.PI; g.add(knot);
      const str = mesh(GEO('CylinderGeometry', 0.008, 0.008, 0.6, 4), mat(0x555555), false); str.position.y = 0.72; g.add(str);
      eyes(g, 1.45, 0.27, 0.9, 0.1); barY = 1.95;
    } else if (type === 'milk') {
      const b = mesh(GEO('rbox', 0.55, 0.65, 0.55, 0.06), mat(0xfdfdf6)); b.position.y = 0.33; g.add(b);
      const band = mesh(GEO('BoxGeometry', 0.56, 0.22, 0.56), mat(0x3f8de0)); band.position.y = 0.32; g.add(band);
      const roof = mesh(GEO('ConeGeometry', 0.4, 0.3, 4), mat(0x3f8de0)); roof.position.y = 0.8; roof.rotation.y = Math.PI / 4; g.add(roof);
      [-1, 1].forEach(k => [-1, 1].forEach(q => { const w = mesh(GEO('CylinderGeometry', 0.1, 0.1, 0.08, 10), mat(0x333333)); w.rotation.z = Math.PI / 2; w.position.set(k * 0.3, 0.08, q * 0.18); g.add(w); }));
      eyes(g, 0.45, 0.28, 0.9, 0.1); barY = 1.15;
    } else if (type === 'bat') {
      const b = mesh(GEO('SphereGeometry', 0.13, 10, 8), mat(0x3a3a4a)); b.position.y = 1.0; g.add(b);
      g.userData.wings = [];
      [-1, 1].forEach(k => { const w = mesh(GEO('BoxGeometry', 0.3, 0.02, 0.16), mat(0x5a4a7a)); w.position.set(k * 0.2, 1.0, 0); w.userData.dyn = true; g.add(w); g.userData.wings.push(w); });
      eyes(g, 1.04, 0.11, 0.6, 0.08); barY = 1.3;
    } else if (type === 'eraserKing') {
      const b = mesh(GEO('rbox', 1.1, 0.7, 0.8, 0.14), mat(0xff9fbf)); b.position.y = 0.35; g.add(b);
      const sl = mesh(GEO('rbox', 1.13, 0.73, 0.4, 0.1), mat(0x3f6fd0)); sl.position.set(0, 0.35, -0.15); g.add(sl);
      eyes(g, 0.5, 0.41, 1.8, 0.12); barY = 1.6;
    } else if (type === 'extinguisher') {
      const b = mesh(GEO('CylinderGeometry', 0.4, 0.4, 1.2, 16), mat(0xe2312b, { roughness: 0.4 })); b.position.y = 0.6; g.add(b);
      const top = mesh(GEO('CylinderGeometry', 0.16, 0.25, 0.25, 12), mat(0x333333)); top.position.y = 1.3; g.add(top);
      const hose = mesh(GEO('TorusGeometry', 0.3, 0.05, 6, 16, Math.PI), mat(0x222222)); hose.position.set(0.3, 1.1, 0.1); hose.rotation.z = -Math.PI / 2; g.add(hose);
      const lab = mesh(GEO('CylinderGeometry', 0.405, 0.405, 0.3, 16), mat(0xffffff)); lab.position.y = 0.6; g.add(lab);
      eyes(g, 0.95, 0.38, 1.6, 0.12); barY = 1.9;
    } else if (type === 'slime' || type === 'slimeM' || type === 'slimeS') {
      const s = type === 'slime' ? 1.6 : type === 'slimeM' ? 0.9 : 0.5;
      const b = mesh(GEO('SphereGeometry', 0.4 * s, 16, 12), mat(0x5fe06b, { roughness: 0.2, transparent: true, opacity: 0.85 })); b.position.y = 0.3 * s; b.scale.set(1, 0.75, 1); g.add(b);
      eyes(g, 0.38 * s, 0.33 * s, s, 0.12);
      barY = 0.9 * s + 0.3;
    } else if (type === 'soccer') {
      const b = mesh(GEO('SphereGeometry', 0.7, 20, 16), mat(0xffffff, { roughness: 0.5 })); b.position.y = 0.7; g.add(b);
      const p = mesh(GEO('IcosahedronGeometry', 0.71, 1), mat(0x222222, { wireframe: true })); p.position.y = 0.7; g.add(p);
      g.userData.roll = [b, p]; b.userData.dyn = p.userData.dyn = true;
      const band = mesh(GEO('TorusGeometry', 0.5, 0.06, 6, 20), mat(0xff3b3b)); band.rotation.x = Math.PI / 2; band.position.y = 1.25; g.add(band);
      eyes(g, 0.85, 0.66, 1.6, 0.13); barY = 1.8;
    } else if (type === 'tray') {
      const b = mesh(GEO('rbox', 1.3, 0.12, 1.0, 0.05), mat(0xb8c4cc, { metalness: 0.5 })); b.position.y = 0.9; b.rotation.x = -1.2; g.add(b);
      [[0xffd84d, -0.35], [0xe2584c, 0.0], [0x6fcf6a, 0.35]].forEach(([c, dx]) => { const f = mesh(GEO('SphereGeometry', 0.14, 10, 8), mat(c)); f.position.set(dx, 1.0, 0.25); g.add(f); });
      const body = mesh(GEO('CylinderGeometry', 0.35, 0.45, 0.7, 14), mat(0xf2e2c4)); body.position.y = 0.35; g.add(body);
      const crown = mesh(GEO('CylinderGeometry', 0.3, 0.3, 0.2, 5, 1, true), mat(0xffd700, { metalness: 0.6, roughness: 0.3, side: T.DoubleSide })); crown.position.y = 1.55; g.add(crown);
      eyes(g, 0.45, 0.38, 1.5, 0.12);
      const shield = new T.Mesh(GEO('SphereGeometry', 1.0, 16, 12), new T.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25, depthWrite: false }));
      shield.position.y = 0.7; shield.visible = false; g.add(shield); g.userData.shield = shield;
      barY = 1.95;
    }
    if (spec.boss && type !== 'tray') {
      const crown = mesh(GEO('CylinderGeometry', 0.28, 0.28, 0.18, 5, 1, true), mat(0xffd700, { metalness: 0.6, roughness: 0.3, side: T.DoubleSide }));
      crown.position.y = barY - 0.25; g.add(crown);
    }
    bake(g, 'e:' + type); addOutline(g); g.userData.blinkOff = Math.random() * 3;
    const bw = spec.boss ? 1.2 : 0.5;
    const bg = new T.Sprite(new T.SpriteMaterial({ color: 0x222222, depthTest: false }));
    const fg = new T.Sprite(new T.SpriteMaterial({ color: 0x5ee06b, depthTest: false }));
    bg.scale.set(bw, spec.boss ? 0.1 : 0.06, 1); fg.scale.set(bw - 0.02, spec.boss ? 0.075 : 0.045, 1);
    bg.renderOrder = 10; fg.renderOrder = 11; bg.position.y = fg.position.y = barY;
    bg.visible = fg.visible = !!spec.boss;
    g.add(bg); g.add(fg); g.userData.bar = fg; g.userData.barBg = bg; g.userData.barW = bw - 0.02;
    return g;
  }

  // =====================================================================
  // 장난감 모양
  // =====================================================================
  function makeTowerMesh(type, lv, br) {
    const g = new T.Group(), spec = TOWERS[type];
    const base = mesh(GEO('CylinderGeometry', 0.4, 0.44, 0.18, 24), mat(spec.color)); base.position.y = 0.09; g.add(base);
    if (lv >= 2) {
      const plate = mesh(GEO('CylinderGeometry', 0.5, 0.53, 0.05, 24), mat(lv >= 3 ? (br === 'A' ? 0x3fae5c : 0xd94a8a) : 0xe0a422, { metalness: 0.4 }), false, true);
      plate.position.y = 0.025; g.add(plate);
    }
    const rimC = lv >= 3 ? (br === 'A' ? 0x5ee06b : 0xff6fa8) : lv === 2 ? 0xffd84d : 0xffffff;
    const rim = mesh(GEO('TorusGeometry', 0.4, lv >= 2 ? 0.05 : 0.035, 6, 20), mat(rimC, lv >= 2 ? { metalness: 0.4, roughness: 0.35 } : {})); rim.rotation.x = Math.PI / 2; rim.position.y = 0.18; g.add(rim);
    for (let i = 0; i < lv; i++) { const s = mesh(G.star, mat(0xffd84d, { metalness: 0.5, roughness: 0.3 })); s.position.set(-0.12 + i * 0.12, 0.1, 0.43); g.add(s); }
    const head = new T.Group(); head.position.y = 0.18; g.add(head); g.userData.head = head;
    const sc = 1 + (lv - 1) * 0.1; head.scale.setScalar(sc);
    if (type === 'sling') {
      const wm = mat(br === 'B' ? 0x5a3a22 : 0x9b6b3d);
      const st = mesh(GEO('CylinderGeometry', 0.05, 0.06, 0.4, 8), wm); st.position.y = 0.2; head.add(st);
      [-1, 1].forEach(k => { const a = mesh(GEO('CylinderGeometry', 0.04, 0.05, 0.32, 8), wm); a.position.set(k * 0.1, 0.5, 0); a.rotation.z = -k * 0.45; head.add(a); });
      const band = mesh(GEO('BoxGeometry', 0.3, 0.03, 0.03), mat(0xff5a5a)); band.position.set(0, 0.6, -0.04); head.add(band);
      if (br === 'A') [-1, 1].forEach(k => { const b2 = mesh(GEO('BoxGeometry', 0.22, 0.03, 0.03), mat(0xffd84d)); b2.position.set(0, 0.52 + k * 0.04, -0.04); head.add(b2); });
      if (br === 'B') { const scope = mesh(GEO('CylinderGeometry', 0.04, 0.04, 0.3, 8), mat(0x333333)); scope.rotation.x = Math.PI / 2; scope.position.set(0.12, 0.62, 0.05); head.add(scope); }
    } else if (type === 'water') {
      const bodyC = br === 'A' ? 0x9fe0ff : br === 'B' ? 0xffc24d : 0xff8a3d;
      const body = mesh(GEO('BoxGeometry', 0.26, 0.2, 0.44), mat(bodyC, { roughness: 0.35 })); body.position.y = 0.34; head.add(body);
      const tank = mesh(GEO('SphereGeometry', 0.15, 12, 10), mat(br === 'B' ? 0xffb030 : 0x6fd0ff, { roughness: 0.1, transparent: true, opacity: 0.85 })); tank.position.set(0, 0.52, -0.08); head.add(tank);
      const noz = mesh(GEO('CylinderGeometry', 0.04, 0.05, 0.24, 8), mat(0x3f8de0)); noz.rotation.x = Math.PI / 2; noz.position.set(0, 0.36, 0.3); head.add(noz);
    } else if (type === 'top') {
      const spin = new T.Group(); spin.position.y = 0.1; head.add(spin); g.userData.spin = spin;
      const cone = mesh(GEO('ConeGeometry', 0.3, 0.32, 16), mat(br === 'B' ? 0xff6a00 : br === 'A' ? 0x5fb4ff : 0xe2584c)); cone.rotation.x = Math.PI; cone.position.y = 0.2; spin.add(cone);
      const disc = mesh(GEO('CylinderGeometry', 0.33, 0.33, 0.08, 16), mat(0xffd84d)); disc.position.y = 0.38; spin.add(disc);
      const knob = mesh(GEO('CylinderGeometry', 0.05, 0.05, 0.2, 8), mat(0x9b6b3d)); knob.position.y = 0.5; spin.add(knob);
    } else if (type === 'ddakji') {
      const arm = new T.Group(); arm.position.set(0, 0.14, -0.15); head.add(arm); g.userData.arm = arm;
      const post = mesh(GEO('BoxGeometry', 0.1, 0.28, 0.1), mat(0x9b6b3d)); post.position.set(0, 0.14, -0.15); head.add(post);
      const bar = mesh(GEO('BoxGeometry', 0.08, 0.06, 0.6), mat(0xb07a46)); bar.position.set(0, 0.16, 0.25); arm.add(bar);
      const big = br === 'B' ? 1.5 : 1;
      [0xe2584c, 0x3f8de0, 0xf2b72e].forEach((c, i) => { const d = mesh(GEO('BoxGeometry', 0.26 * big, 0.04, 0.26 * big), mat(c)); d.position.set(0, 0.21 + i * 0.045, 0.48); d.rotation.y = i * 0.3; arm.add(d); });
    } else if (type === 'flute') {
      const fc = br === 'B' ? 0xb8b0ff : br === 'A' ? 0xffe08a : 0xfaf6ea;
      const body = mesh(GEO('CylinderGeometry', 0.07, 0.07, 0.7, 12), mat(fc, { roughness: 0.4 })); body.position.y = 0.45; head.add(body);
      const bell = mesh(GEO('ConeGeometry', 0.12, 0.16, 12), mat(fc, { roughness: 0.4 })); bell.rotation.x = Math.PI; bell.position.y = 0.12; head.add(bell);
      const mouth = mesh(GEO('CylinderGeometry', 0.06, 0.07, 0.12, 12), mat(0x8a5a35)); mouth.position.y = 0.84; head.add(mouth);
      if (br === 'A') { const drum = mesh(GEO('CylinderGeometry', 0.18, 0.18, 0.16, 14), mat(0xe2584c)); drum.position.set(0.2, 0.15, 0); head.add(drum); }
      if (br === 'B') { const moon = mesh(GEO('TorusGeometry', 0.12, 0.04, 6, 14, Math.PI * 1.3), mat(0xffe680)); moon.position.set(0, 1.05, 0); head.add(moon); }
    }
    const bk = 't:' + type + ':' + lv + ':' + br;
    bake(g, bk); bake(head, bk + 'h'); bake(g.userData.spin, bk + 's'); bake(g.userData.arm, bk + 'a');
    addOutline(g);
    if (lv >= 3) {
      // 3단계: 주위를 도는 반짝이
      const orbit = new T.Group(); orbit.position.y = 0.95; g.add(orbit); g.userData.orbit = orbit;
      const c = br === 'A' ? 0x9dffa8 : 0xffa8d8;
      for (let i = 0; i < 3; i++) { const st = new T.Mesh(G.star, matB(c)); const a = i / 3 * Math.PI * 2; st.position.set(Math.cos(a) * 0.42, Math.sin(a * 2) * 0.06, Math.sin(a) * 0.42); st.scale.setScalar(0.9); orbit.add(st); }
    }
    return g;
  }

  // =====================================================================
  // 영웅 모양
  // =====================================================================
  function makeHeroMesh(id, shirt) {
    const H = HEROES[id], g = new T.Group(), body = new T.Group();
    g.add(body); g.userData.body = body;
    const skin = mat(0xffd9b8), hairM = mat(id === 'haeun' ? 0x5a3a22 : 0x2d2219);
    [-1, 1].forEach(k => { const leg = mesh(GEO('CylinderGeometry', 0.07, 0.07, 0.3, 8), mat(0x3d4f7a)); leg.position.set(k * 0.09, 0.15, 0); body.add(leg); g.userData['leg' + k] = leg; });
    const torso = mesh(GEO('CylinderGeometry', 0.17, 0.2, 0.36, 12), mat(shirt || H.shirt)); torso.position.y = 0.48; body.add(torso);
    const head = mesh(GEO('SphereGeometry', 0.22, 16, 12), skin); head.position.y = 0.86; body.add(head);
    const hair = mesh(GEO('SphereGeometry', 0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM); hair.position.y = 0.87; body.add(hair);
    eyes(body, 0.86, 0.19, 1.0, 0.08);
    const armL = mesh(GEO('CylinderGeometry', 0.05, 0.05, 0.3, 8), skin); armL.position.set(-0.22, 0.5, 0); armL.rotation.z = 0.3; body.add(armL);
    const hand = new T.Group(); hand.position.set(0.24, 0.5, 0.05); body.add(hand); g.userData.hand = hand;
    const armR = mesh(GEO('CylinderGeometry', 0.05, 0.05, 0.3, 8), skin); armR.rotation.z = -0.3; hand.add(armR);
    if (id === 'minjun') {
      const cap = mesh(GEO('SphereGeometry', 0.235, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(0x2f6fd0)); cap.position.y = 0.89; body.add(cap);
      const brim = mesh(GEO('BoxGeometry', 0.26, 0.03, 0.18), mat(0x2f6fd0)); brim.position.set(0, 0.93, 0.2); body.add(brim);
      const band = mesh(GEO('CylinderGeometry', 0.205, 0.205, 0.08, 12), mat(0xff4d4d)); band.position.y = 0.55; body.add(band);
      const rec = mesh(GEO('CylinderGeometry', 0.035, 0.035, 0.5, 8), mat(0xfaf6ea)); rec.position.set(0.02, 0.1, 0.12); rec.rotation.x = 1.1; hand.add(rec);
    } else if (id === 'seoyeon') {
      const tail = mesh(GEO('SphereGeometry', 0.1, 10, 8), hairM); tail.position.set(0, 0.95, -0.24); body.add(tail);
      const rib = mesh(GEO('TorusGeometry', 0.07, 0.03, 6, 12), mat(0xff4d8a)); rib.position.set(0, 1.0, -0.2); body.add(rib);
      const ball = mesh(GEO('SphereGeometry', 0.11, 12, 10), mat(0xe2414b, { roughness: 0.5 })); ball.position.set(0.04, -0.12, 0.08); hand.add(ball);
    } else if (id === 'doyun') {
      [-1, 1].forEach(k => { const gg = mesh(GEO('TorusGeometry', 0.06, 0.02, 6, 12), mat(0x33cc99)); gg.position.set(k * 0.08, 0.9, 0.2); body.add(gg); });
      const strap = mesh(GEO('TorusGeometry', 0.225, 0.015, 6, 24), mat(0x33cc99)); strap.rotation.x = Math.PI / 2; strap.position.y = 0.9; body.add(strap);
      const fl = mesh(GEO('SphereGeometry', 0.09, 10, 8), mat(0x7cff8a, { roughness: 0.2, transparent: true, opacity: 0.85 })); fl.position.set(0.04, -0.14, 0.08); hand.add(fl);
    } else if (id === 'haeun') {
      const beret = mesh(GEO('SphereGeometry', 0.2, 14, 10), mat(0x8a3ad0)); beret.scale.set(1.15, 0.4, 1.15); beret.position.set(0.04, 1.05, 0); body.add(beret);
      const brush = mesh(GEO('CylinderGeometry', 0.02, 0.02, 0.45, 6), mat(0xb07a46)); brush.position.set(0.02, 0.0, 0.12); brush.rotation.x = 1.0; hand.add(brush);
      const tip = mesh(GEO('ConeGeometry', 0.04, 0.1, 8), mat(0xff5aa8)); tip.position.set(0.02, 0.12, 0.31); tip.rotation.x = 1.0; hand.add(tip);
    }
    addOutline(g);
    // 레벨 5 망토
    const cape = new T.Group(); cape.position.set(0, 0.66, -0.16); body.add(cape); g.userData.cape = cape; cape.visible = false;
    const cl = mesh(GEO('PlaneGeometry', 0.4, 0.5, 1, 3), mat(0xe2312b, { side: T.DoubleSide })); cl.position.y = -0.25; cape.add(cl);
    const badge = mesh(G.star, matB(0xffd84d), false); badge.scale.setScalar(1.3); badge.position.set(0, 0.52, 0.2); cape.userData.badge = badge; body.add(badge); badge.visible = false;
    const ring = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0x5ee06b, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.scale.setScalar(0.42); ring.position.y = 0.03; ring.visible = false; g.add(ring); g.userData.ring = ring;
    const bg = new T.Sprite(new T.SpriteMaterial({ color: 0x222222, depthTest: false }));
    const fg = new T.Sprite(new T.SpriteMaterial({ color: 0x4fc3ff, depthTest: false }));
    bg.scale.set(0.62, 0.075, 1); fg.scale.set(0.6, 0.055, 1); bg.position.y = fg.position.y = 1.32; bg.renderOrder = 10; fg.renderOrder = 11;
    g.add(bg); g.add(fg); g.userData.bar = fg;
    g.scale.setScalar(0.95);
    return g;
  }

  // =====================================================================
  // 게임 상태
  // =====================================================================
  let state = 'menu';
  let money = 0, lives = 20, waveNo = 0, speed = 1, paused = false, endless = false, totalWaves = 10;
  let enemies = [], towers = [], shots = [], fx = [], spawns = [], zones = [], paintBuffs = [];
  let selTile = null, selTower = null, pickType = null, chalkMode = false;
  let roundCleared = {}, spawnCounter = 0, bossAlive = 0, teacherUsed = {};
  function freshMods() { return { dmg: 0, rate: 0, hero: 0, costMul: 1, cdMul: 1, slow: 0, picked: [] }; }
  let runMods = freshMods(), rule = null, daily = false, moveMode = null, lastRes = null;
  const teacherMax = k => TEACHER[k].cd * runMods.cdMul;
  function towerCost(type) {
    let c = TOWERS[type].cost;
    if ((prog.stk[type] || [])[2]) c *= 0.9;
    return Math.round(c * runMods.costMul);
  }
  const teacherCd = { quiet: 0, chalk: 0, snack: 0 };
  const towerAt = {};
  let leakLog = {};
  const world = new T.Group(); scene.add(world);
  const hoverTile = mesh(new T.PlaneGeometry(0.92, 0.92), new T.MeshBasicMaterial({ color: 0x5ee06b, transparent: true, opacity: 0.45, depthWrite: false }), false, false);
  hoverTile.rotation.x = -Math.PI / 2; hoverTile.position.y = 0.03; hoverTile.visible = false; scene.add(hoverTile);
  const rangeRing = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
  rangeRing.position.y = 0.04; rangeRing.visible = false; scene.add(rangeRing);
  const rangeDisc = new T.Mesh(G.disc, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false }));
  rangeDisc.position.y = 0.035; rangeDisc.visible = false; scene.add(rangeDisc);
  const preview = new T.Group(); scene.add(preview);
  const LV = () => LEVELS[opt.level];

  // ----- 장난감 능력치 -----
  function towerStats(type, lv, br) {
    const b = TOWERS[type], s = Object.assign({}, b), st = prog.stk[type] || [];
    if (type === 'flute') {
      s.range = b.range + (lv - 1) * 0.3;
      s.buff = lv === 1 ? 0.3 : lv === 2 ? 0.4 : br === 'A' ? 0.6 : 0.35;
      if (lv >= 3 && br === 'B') s.lull = 0.35;
      if (st[0]) s.buff += 0.05;
      if (st[1]) s.range *= 1.08;
      return s;
    }
    const dm = lv === 1 ? 1 : lv === 2 ? 1.5 : 2.1;
    s.dmg = b.dmg * dm; s.range = b.range + (lv - 1) * 0.3;
    if (lv >= 3) {
      if (type === 'sling') { if (br === 'A') { s.rate = 0.22; s.dmg *= 1.05; } else { s.range += 2.2; s.dmg *= 3; s.rate = 1.1; s.pierce = true; s.seeAll = true; } }
      if (type === 'water') { if (br === 'A') { s.freeze = 0.35; s.slow = 0.55; s.dmg *= 1.6; } else { s.area = 1.1; s.slow = 0.5; s.slowT = 2.6; } }
      if (type === 'top') { if (br === 'A') s.knock = 0.7; else s.burn = 13; }
      if (type === 'ddakji') { if (br === 'A') s.chain = 4; else { s.splash = 1.8; s.dmg *= 1.6; s.rate = b.rate * 1.25; } }
    }
    if (st[0]) s.dmg *= 1.08;
    if (st[1]) s.range *= 1.08;
    s.dmg *= 1 + runMods.dmg; s.rate /= 1 + runMods.rate;
    return s;
  }
  const upCost = (t) => Math.round(towerCost(t.type) * (t.lv === 1 ? 0.7 : 1.3));

  // =====================================================================
  // 시작·리셋
  // =====================================================================
  function clearWorld() {
    [...enemies, ...towers, ...shots, ...fx].forEach(o => world.remove(o.m));
    zones.forEach(z => world.remove(z.m));
    enemies = []; towers = []; shots = []; fx = []; spawns = []; zones = []; paintBuffs = [];
    Object.keys(towerAt).forEach(k => delete towerAt[k]);
    if (hero) { world.remove(hero.m); hero = null; }
  }
  function resetGame() {
    clearWorld();
    runMods = freshMods(); moveMode = null; hitStop = 0; slowT = 0;
    leakLog = {}; money = Math.round((LV().money + mapIdx * 25) * (rule === 'poor' ? 0.6 : 1)); lives = 20; waveNo = 0; speed = opt.speed || 1; paused = false; roundCleared = {}; bossAlive = 0; teacherUsed = {};
    Object.keys(teacherCd).forEach(k => { teacherCd[k] = 0; });
    hero = rule === 'nohero' ? null : makeHero(opt.hero); heroSel = false;
    ['heroBtn', 'autoBtn', 'skillBtn'].forEach(id => $(id).classList.toggle('hidden', !hero));
    if (hero) { $('heroIcon').textContent = hero.spec.icon; $('skillIcon').textContent = hero.spec.skill.icon; }
    $('heroBtn').classList.remove('on');
    setAuto(isAuto(), true);
    chalkMode = false;
    closeSheets(); updateHud();
    $('btnSpeed').textContent = speed + '×';
    $('waveBtn').classList.add('glow');
  }

  // =====================================================================
  // 웨이브
  // =====================================================================
  function makeWave(w) {
    const pool = MAP.pool, has = t => pool.includes(t), list = [];
    const c = Math.min(w, 30), add = (type, n, gap, delay) => list.push([type, Math.max(1, Math.round(n)), gap, delay]);
    add('snake', 5 + c * 1.3, Math.max(0.35, 0.75 - c * 0.01), 0);
    if (w >= 2) add('plane', 3 + c, 0.45, 3);
    if (w >= 3 && has('ghost')) add('ghost', 2 + c / 2, 1.0, 5);
    if (w >= 4 && has('balloon')) add('balloon', 1 + c / 3, 1.8, 6);
    if (w >= 4) add('eraser', 2 + c / 1.5, 1.2, 2);
    if (w >= 5 && has('bat')) add('bat', 2 + c * 0.8, 0.35, 7);
    if (w >= 5 && has('tack')) add('tack', 1 + c / 3, 2.0, 8);
    if (w >= 6) add('knight', 1 + (c - 4) * 0.9, 1.8, 4);
    if (w >= 7 && has('milk')) add('milk', 1 + (c - 5) / 2, 3.5, 9);
    if (!endless && w === 10) add(MAP.boss, 1, 1, 12);
    if (endless && w % 5 === 0) {
      const bosses = MAPS.slice(0, mapIdx + 1).map(m => m.boss);
      add(bosses[(w / 5 - 1) % bosses.length], w >= 20 ? 2 : 1, 8, 10);
    }
    return list;
  }
  function callWave() {
    if (state !== 'play' || (!endless && waveNo >= totalWaves)) return;
    ensureAudio();
    if (waveActive()) {
      const bonus = 10 + waveNo * 2; money += bonus; popAt(baseWorld(), `+${bonus} 빨리 부르기`, false);
      prog.stats.early = (prog.stats.early || 0) + 1; if (prog.stats.early >= 10) unlockAch('early10'); saveProg();
    }
    waveNo++;
    makeWave(waveNo).forEach(([type, n, gap, delay]) => spawns.push({ type, n, gap, t: -delay, wave: waveNo }));
    sfx.bell();
    showBanner(`${waveNo}번째 괴물들이 와요!`);
    $('waveBtn').classList.remove('glow');
    updateHud();
  }
  const waveActive = () => spawns.length > 0 || enemies.length > 0;
  const hpScale = (w, type) => {
    const s = ENEMIES[type];
    const hardFirst = opt.level === 'hard' && mapIdx === 0 ? 1.4 : 1;
    if (s.boss) return LV().hp * hardFirst * (1 + mapIdx * 0.1) * (endless ? 1 + Math.max(0, w - 10) * 0.12 : 1);
    return (1 + 0.17 * (w - 1)) * LV().hp * hardFirst * (1 + mapIdx * 0.07);
  };
  function spawnEnemy(type, wave, opts = {}) {
    const spec = ENEMIES[type];
    const hp = Math.round(spec.hp * hpScale(wave, type) * (opts.hpMul || 1));
    const m = makeEnemyMesh(type);
    const pi = opts.pi != null ? opts.pi : (spawnCounter++ % paths.length);
    const e = { type, spec, hp, maxHp: hp, d: opts.d || 0, pi, speed: spec.speed * (rule === 'fast' ? 1.3 : 1) * (1 - runMods.slow), slowT: 0, slowK: 1, m, wobble: Math.random() * 6, wave, dead: false, flash: 0,
                stunT: 0, burnT: 0, burn: 0, reveal: 0, sabCd: 0, bossT: 0, shieldT: 0, splitDone: 0, air: !!spec.air };
    if (spec.straight) {
      const P = paths[pi]; e.line = { a: P.pts[0].clone(), b: endPos().clone() }; e.lineLen = e.line.a.distanceTo(e.line.b);
    }
    m.position.copy(opts.pos || pathAt(pi, e.d).pos);
    world.add(m); enemies.push(e);
    if (spec.boss) {
      bossAlive++;
      if (!opts.quiet) {
        focusCam(m.position, 2.6); sfx.bossIntro(); music.setBoss(true);
        slowT = 1.8; if (doors[pi]) doors[pi].t = 2.4;
        const bc = $('bossCard'); bc.innerHTML = `<small>BOSS</small><span>${spec.icon}</span><b>${spec.name}</b><i>${spec.desc}</i>`;
        bc.classList.remove('show'); void bc.offsetWidth; bc.classList.add('show');
      }
    }
    if (!spec.hidden && !prog.seen[type]) { prog.seen[type] = true; saveProg(); showIntro(`${spec.icon} ${spec.name}: ${spec.desc}`); }
    return e;
  }
  const baseWorld = () => { const e = endPos(); return new T.Vector3(e.x + 0.6, 1.4, e.z); };

  // =====================================================================
  // 장난감
  // =====================================================================
  function placeTower(type, gx, gy, free, lv = 1, br = null) {
    const spec = TOWERS[type], k = gx + ',' + gy, cost = towerCost(type);
    if (!free && rule === 'sling' && type !== 'sling') return null;
    if ((!free && money < cost) || towerAt[k] || pathTiles.has(k) || blockTiles.has(k) || gx < 0 || gy < 0 || gx >= GW || gy >= GH) return null;
    if (!free) money -= cost;
    const p = toW(gx, gy);
    const t = { type, gx, gy, lv, br, pos: p, cd: 0.3, grow: 0, spent: cost, buff: 0, dmgBuff: 0, kills: 0, stunT: 0, hits: 0 };
    t.s = towerStats(type, lv, br);
    t.m = makeTowerMesh(type, lv, br); t.m.position.copy(p); t.m.scale.setScalar(0.01); world.add(t.m);
    towers.push(t); towerAt[k] = t;
    if (!free) { sfx.build(); puff(p, 0xffffff, 10); unlockAch('firstTower'); if (towers.length >= 15) unlockAch('rich'); }
    updateHud();
    return t;
  }
  function upgradeTower(t, br) {
    if (t.lv >= 3 || (t.lv === 2 && br !== 'A' && br !== 'B')) return;
    const cost = upCost(t);
    if (money < cost) return;
    money -= cost; t.spent += cost; t.lv++;
    if (t.lv === 3) { t.br = br; unlockAch('branch'); }
    t.s = towerStats(t.type, t.lv, t.br);
    const rot = t.m.userData.head.rotation.y;
    world.remove(t.m); t.m = makeTowerMesh(t.type, t.lv, t.br); t.m.position.copy(t.pos); t.m.userData.head.rotation.y = rot; world.add(t.m);
    t.grow = 0.5;
    puff(t.pos, 0xffd84d, 16); sfx.upgrade();
    popAt(t.pos.clone().setY(1), t.lv === 3 ? `${TOWERS[t.type][t.br].name}!` : '2단계!', false);
    updateHud(); openInfo(t);
  }
  function sellTower(t) {
    const refund = Math.floor(t.spent * 0.7);
    money += refund;
    world.remove(t.m); towers = towers.filter(x => x !== t); delete towerAt[t.gx + ',' + t.gy];
    popAt(t.pos, `+${refund}`, false); puff(t.pos, 0xd9b48a, 10);
    sfx.sell(); closeSheets(); updateHud();
  }
  function computeBuffs() {
    towers.forEach(t => {
      t.buff = 0; t.dmgBuff = 0;
      if (hero && !hero.dead && hero.id === 'haeun' && t.pos.distanceTo(hero.pos) <= 2.5) t.dmgBuff = 0.25;
      paintBuffs.forEach(b => { if (t.pos.distanceTo(b.pos) <= b.r) t.dmgBuff = Math.max(t.dmgBuff, b.amt); });
    });
    towers.forEach(f => {
      if (f.type !== 'flute' || f.stunT > 0) return;
      towers.forEach(t => { if (t !== f && t.type !== 'flute' && t.pos.distanceTo(f.pos) <= f.s.range + 0.01) t.buff = Math.max(t.buff, f.s.buff); });
    });
  }
  // 이 공격자가 이 괴물을 맞힐 수 있나
  function canHit(src, e, dist2, range) {
    if (e.dead) return false;
    if (e.air && !src.air) return false;
    if (e.spec.stealth && !(e.reveal > 0) && !src.seeAll && dist2 > (range * 0.55) ** 2) return false;
    return true;
  }
  function findTarget(t, range) {
    let best = null;
    for (const e of enemies) {
      const dx = e.m.position.x - t.pos.x, dz = e.m.position.z - t.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > range * range || !canHit(t.s, e, d2, range)) continue;
      if (!best || e.d > best.d) best = e;
    }
    return best;
  }
  const whiteMat = new T.MeshBasicMaterial({ color: 0xffffff });
  function flashOn(e) {
    if (e.whiteOn) return;
    e.whiteOn = true;
    e.m.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.material !== eyeMat && !o.material.transparent && !o.userData.om) { o.userData.om = o.material; o.material = whiteMat; } });
  }
  function flashOff(e) {
    if (!e.whiteOn) return;
    e.whiteOn = false;
    e.m.traverse(o => { if (o.userData.om) { o.material = o.userData.om; o.userData.om = null; } });
  }
  let hitStop = 0, slowT = 0;
  const bigHit = (t) => { hitStop = Math.max(hitStop, t); };
  function hurt(e, dmg, src, opts = {}) {
    if (e.dead) return;
    if (src && src.dmgBuff) dmg *= 1 + src.dmgBuff;
    if (e.shieldT > 0) dmg *= 0.4;
    const real = Math.max(1, dmg - (opts.pierce ? 0 : e.spec.armor));
    e.hp -= real;
    if (!opts.dot) {
      e.flash = 0.12; flashOn(e); e.whiteT = 0.07;
      if (real >= 25) popDmg(e.m.position, real);
    }
    if (e.spec.boss && !e.enraged && e.hp > 0 && e.hp < e.maxHp * 0.5) {
      e.enraged = true; e.speed *= 1.25; e.enrageFx = true;
      popAt(e.m.position.clone().setY(2), '💢 화났다!', true); sfx.boss(); shake = Math.max(shake, 0.35);
    }
    if (e.type === 'eraserKing') {
      const f = e.hp / e.maxHp;
      while (e.splitDone < 2 && f < (e.splitDone === 0 ? 0.66 : 0.33)) {
        e.splitDone++;
        for (let i = 0; i < 4; i++) spawnEnemy('eraser', e.wave, { pi: e.pi, d: Math.max(0, e.d - 0.3 - i * 0.3), pos: e.m.position.clone() });
        popAt(e.m.position.clone().setY(1.5), '지우개 똥 쏟아짐!', true);
      }
    }
    if (e.hp <= 0) kill(e, src);
  }
  const CHUNK_C = { knight: 0x7a52d6, plane: 0xeae6da, snake: 0xffd84d, ghost: 0xffffff, tack: 0x8a5a35, milk: 0x3f8de0, bat: 0x5a4a7a, eraser: 0xff9fbf, mini: 0xff9fbf, eraserKing: 0xff9fbf, extinguisher: 0xe2312b, slime: 0x5fe06b, slimeM: 0x5fe06b, slimeS: 0x5fe06b, soccer: 0xffffff, tray: 0xb8c4cc };
  function chunks(p, color, n) {
    n = Math.round(n * qMul());
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(G.card, mat(color)); m.scale.setScalar(0.35 + Math.random() * 0.4); m.position.copy(p).setY(0.3); world.add(m);
      const a = Math.random() * Math.PI * 2, sp = 1.2 + Math.random() * 1.8;
      fx.push({ kind: 'chunk', m, v: new T.Vector3(Math.cos(a) * sp, 2.5 + Math.random() * 2, Math.sin(a) * sp), r: new T.Vector3(Math.random() * 12, Math.random() * 12, 0), t: 0, dur: 0.9 + Math.random() * 0.3 });
    }
  }
  function startDie(e) {
    flashOff(e);
    chunks(e.m.position, CHUNK_C[e.type] || 0xff9fbf, e.spec.boss ? 12 : 4);
    if (e.spec.boss) bigHit(0.16);
    e.dieFx = true;
    const ud = e.m.userData; ud.bar.visible = ud.barBg.visible = false;
    if (ud.shield) ud.shield.visible = false;
    if (ud.eyes) ud.eyes.forEach(ey => {
      ey.w.geometry = G.eyeW; ey.w.material = matB(0xffffff); ey.w.visible = false;
      [-1, 1].forEach(side => { const wh = new T.Mesh(G.eyeW, matB(0xffffff)); wh.scale.setScalar(ey.s); wh.position.set(side * ey.gap * ey.s, ey.y, ey.z); ey.w.parent.add(wh); });
      [-1, 1].forEach(side => [-1, 1].forEach(k => { const x = new T.Mesh(G.xbar, matB(0x2a1a10)); x.scale.setScalar(ey.s); x.position.set(side * ey.gap * ey.s, ey.y, ey.z + 0.065 * ey.s); x.rotation.z = k * Math.PI / 4; ey.w.parent.add(x); }));
    });
    fx.push({ kind: 'die', m: e.m, t: 0, dur: e.spec.boss ? 1.0 : 0.5, vy: e.spec.boss ? 2.2 : 3.4, spin: (Math.random() - 0.5) * 9 });
  }
  function kill(e, src) {
    e.dead = true;
    money += e.spec.reward;
    if (src) src.kills = (src.kills || 0) + 1;
    if (hero && !hero.dead) {
      if (src === hero) heroGainXp(e.spec.reward * 1.5);
      else if (e.m.position.distanceTo(hero.pos) <= 3.5) heroGainXp(e.spec.reward * 0.5);
    }
    popAt(e.m.position, `+${e.spec.reward}`, false);
    puff(e.m.position, { knight: 0x7a52d6, plane: 0xffffff, snake: 0xffd84d, ghost: 0xffffff, tack: 0x8a5a35, balloon: 0xff5a7a, milk: 0x3f8de0, bat: 0x5a4a7a }[e.type] || 0xff9fbf, e.spec.boss ? 30 : 9);
    if (e.type === 'balloon') sfx.popBalloon(); else sfx.pop(e.type);
    if (e.type !== 'balloon') startDie(e);
    if (e.spec.split) {
      const [st, n] = e.spec.split;
      for (let i = 0; i < n; i++) spawnEnemy(st, e.wave, { pi: e.pi, d: Math.max(0, e.d - 0.3 * i), pos: e.m.position.clone().add(new T.Vector3((i - 0.5) * 0.4, 0, 0)) });
    }
    if (e.spec.boss) {
      bossAlive = Math.max(0, bossAlive - 1);
      unlockAch('boss'); shake = Math.max(shake, 0.5); showBanner(`${e.spec.icon} ${e.spec.name} 쓰러뜨림!`); sfx.clear();
      if (!bossAlive) music.setBoss(false);
    }
    updateHud();
  }

  // =====================================================================
  // 영웅
  // =====================================================================
  let hero = null, heroSel = false, brainT = 0;
  const heroHome = () => { const e = endPos(); const p = new T.Vector3(e.x - 1.2, 0, e.z + (e.z > 3 ? -1.2 : 1.2)); return p; };
  function heroRank(id) { const x = prog.hxp[id] || 0; let r = 1; HERO_RANK.forEach((v, i) => { if (x >= v) r = i + 1; }); return r; }
  const heroStartLv = id => { const r = heroRank(id); return r >= 4 ? 3 : r >= 2 ? 2 : 1; };
  function heroColorIdx(id) { const ci = (opt.heroColor || {})[id] || 0; return heroRank(id) >= COLOR_RANK[ci] ? ci : 0; }
  function makeHero(id) {
    const spec = HEROES[id], m = makeHeroMesh(id, HERO_COLORS[id][heroColorIdx(id)]), home = heroHome();
    m.position.copy(home); world.add(m);
    const lv = heroStartLv(id), hp = Math.round(spec.hp * (1 + 0.15 * (lv - 1)));
    return { id, spec, air: spec.air, lv, xp: HERO_XP[lv - 1], earned: 0, hp, maxHp: hp, pos: home.clone(), goal: null, guard: null, cd: 0, skillCd: 4, dead: false, respawn: 0,
             m, blocks: new Set(), lastHit: 99, walk: 0, kills: 0, swing: 0, yaw: Math.PI, retreat: false };
  }
  const heroMul = () => 1 + 0.15 * (hero.lv - 1);
  function heroGainXp(n) {
    if (!hero || hero.dead) return;
    hero.earned += n;
    if (hero.lv >= 5) return;
    hero.xp += n;
    while (hero.lv < 5 && hero.xp >= HERO_XP[hero.lv]) {
      hero.lv++;
      const old = hero.maxHp; hero.maxHp = Math.round(hero.spec.hp * heroMul()); hero.hp += hero.maxHp - old;
      popAt(hero.pos.clone().setY(1.5), `레벨 업! Lv${hero.lv}${hero.lv === 3 ? ' · 필살기 강화' : ''}`, false);
      puff(hero.pos, 0xffe066, 16); sfx.levelUp();
      if (hero.lv >= 5) unlockAch('heroMax');
    }
  }
  function heroHurt(dmg) {
    if (!hero || hero.dead) return;
    hero.hp -= dmg * (1 - hero.spec.def); hero.lastHit = 0;
    if (hero.hp <= 0) {
      hero.hp = 0; hero.dead = true; hero.respawn = 10; hero.blocks.clear(); hero.goal = null;
      hero.m.visible = false; puff(hero.pos, 0xffffff, 16); sfx.heroDown();
      popAt(hero.pos.clone().setY(1.2), `${hero.spec.name} 쓰러짐! 10초 뒤 부활`, true);
      setHeroSel(false);
    }
  }
  function setHeroSel(on) {
    heroSel = !!on && hero && !hero.dead;
    if (hero) hero.m.userData.ring.visible = heroSel;
    $('heroBtn').classList.toggle('on', heroSel);
    if (heroSel) { closeSheets(true); showIntro(`${hero.spec.icon} 이동할 곳을 눌러요 (영웅 버튼을 다시 누르면 해제)`); }
  }
  function moveHero(x, z, byBrain) {
    if (!hero || hero.dead) return;
    x = Math.max(-GW / 2 + 0.3, Math.min(GW / 2 + 1.2, x)); z = Math.max(-GH / 2 + 0.3, Math.min(GH / 2 - 0.3, z));
    hero.goal = new T.Vector3(x, 0, z);
    hero.blocks.forEach(e => { e.blocked = null; }); hero.blocks.clear();
    if (byBrain) return;
    hero.guard = hero.goal.clone();
    if (isAuto()) setAuto(false);
    const mk = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0x5ee06b, transparent: true, opacity: 0.8, depthWrite: false }));
    mk.position.set(x, 0.05, z); world.add(mk); fx.push({ kind: 'pulse', m: mk, t: 0, dur: 0.5, r: 0.5 });
    sfx.click();
  }
  function heroTarget(range) {
    let best = null, bd = 1e9;
    for (const e of enemies) {
      const dx = e.m.position.x - hero.pos.x, dz = e.m.position.z - hero.pos.z, d2 = dx * dx + dz * dz;
      if (d2 > range * range || !canHit(hero, e, d2, range)) continue;
      const score = (hero.blocks.has(e) ? -100 : 0) + d2 - e.d * 0.05;
      if (score < bd) { bd = score; best = e; }
    }
    return best;
  }
  const countNear = (p, r) => { let n = 0; for (const e of enemies) if (!e.dead && e.m.position.distanceTo(p) <= r) n++; return n; };
  function heroBrain(dt) {
    const h = hero, S = h.spec;
    brainT -= dt;
    if (h.skillCd <= 0) {
      let use = false;
      if (h.id === 'minjun') use = countNear(h.pos, 2.2) >= 3 || enemies.some(e => !e.dead && e.spec.boss && e.m.position.distanceTo(h.pos) < 2);
      else if (h.id === 'seoyeon') { const t = heroTarget(6); use = !!t && (countNear(h.pos, 6) >= 3 || t.hp > 60); }
      else if (h.id === 'doyun') { const t = heroTarget(5); use = !!t && (countNear(t.m.position, 2) >= 3 || t.spec.boss); }
      else if (h.id === 'haeun') use = countNear(h.pos, 3) >= 3 || enemies.some(e => !e.dead && (e.type === 'knight' || e.spec.boss || e.type === 'milk') && e.m.position.distanceTo(h.pos) <= 3);
      if (use) heroSkill(true);
    }
    if (brainT > 0) return;
    brainT = 0.5;
    if (h.hp < h.maxHp * 0.3) h.retreat = true;
    if (h.retreat && h.hp > h.maxHp * 0.8) h.retreat = false;
    let dest;
    if (h.retreat) dest = heroHome();
    else {
      let lead = null;
      for (const e of enemies) if (!e.dead && !(h.id === 'minjun' && e.air) && (!lead || progressOf(e) > progressOf(lead))) lead = e;
      if (!lead) dest = h.guard ? h.guard.clone() : heroHome();
      else if (lead.line) dest = lead.m.position.clone().setY(0);
      else if (h.id === 'minjun') dest = pathAt(lead.pi, Math.min(paths[lead.pi].total - 0.6, lead.d + 1.4)).pos.clone();
      else {
        const ahead = pathAt(lead.pi, Math.min(paths[lead.pi].total - 0.6, lead.d + 0.6));
        const side = new T.Vector3(-ahead.dir.z, 0, ahead.dir.x), off = Math.min(S.range * 0.6, 1.6);
        const a = ahead.pos.clone().addScaledVector(side, off), b = ahead.pos.clone().addScaledVector(side, -off);
        let pick = a.distanceTo(h.pos) < b.distanceTo(h.pos) ? a : b;
        if (h.id === 'haeun' && towers.length) {
          let best = null, bd = 1e9;
          towers.forEach(t => { const d = t.pos.distanceTo(ahead.pos); if (d < bd && d < 4) { bd = d; best = t; } });
          if (best) pick = new T.Vector3().lerpVectors(best.pos, ahead.pos, 0.55);
        }
        dest = pick;
      }
    }
    dest.x = Math.max(-GW / 2 + 0.3, Math.min(GW / 2 + 1.2, dest.x)); dest.z = Math.max(-GH / 2 + 0.3, Math.min(GH / 2 - 0.3, dest.z));
    const engaged = h.blocks.size > 0 || !!heroTarget(S.range);
    const far = dest.distanceTo(h.pos);
    if (h.retreat || (!engaged && far > 0.4) || far > (h.id === 'minjun' ? 2.5 : S.range + 0.8)) {
      if (!h.goal || h.goal.distanceTo(dest) > 0.5) moveHero(dest.x, dest.z, true);
    }
  }
  const progressOf = e => e.line ? (e.d / e.lineLen) : (e.d / paths[e.pi].total);
  function setAuto(on, quiet) {
    opt.heroAuto = on ? 'on' : 'off'; saveOpt();
    $('autoBtn').classList.toggle('on', on);
    $('autoBtn').innerHTML = on ? '🤖<small>자동</small>' : '🕹️<small>수동</small>';
    if (hero) { hero.retreat = false; }
    if (!quiet) { showIntro(on ? '🤖 자동 모드: 영웅이 알아서 이동하고 공격해요' : '🕹️ 수동 모드: 영웅을 눌러 직접 움직여요'); sfx.click(); }
  }
  const isAuto = () => opt.heroAuto === 'on';
  function updateHero(dt) {
    if (!hero) return;
    const h = hero, S = h.spec;
    if (h.dead) {
      h.respawn -= dt;
      if (h.respawn <= 0) {
        h.dead = false; h.hp = h.maxHp; h.pos.copy(heroHome()); h.m.position.copy(h.pos); h.m.visible = true;
        puff(h.pos, 0x5ee06b, 14); sfx.levelUp(); popAt(h.pos.clone().setY(1.3), '부활!', false);
      }
      return;
    }
    h.cd -= dt; h.skillCd = Math.max(0, h.skillCd - dt); h.lastHit += dt;
    if (isAuto()) heroBrain(dt);
    let moving = false;
    if (h.goal) {
      const v = new T.Vector3().subVectors(h.goal, h.pos); v.y = 0;
      const d = v.length();
      if (d < 0.05) h.goal = null;
      else { moving = true; v.normalize(); h.pos.addScaledVector(v, Math.min(d, S.speed * dt)); h.yaw = Math.atan2(v.x, v.z); }
    }
    if (!moving && h.lastHit > 2.5 && h.hp < h.maxHp) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.05 * dt);
    if (!moving) {
      for (const e of enemies) {
        if (e.dead || e.air || e.spec.noBlock || e.blocked || e.line) continue;
        if (h.blocks.size >= S.block) break;
        const dx = e.m.position.x - h.pos.x, dz = e.m.position.z - h.pos.z;
        if (dx * dx + dz * dz < 0.42) { e.blocked = h; h.blocks.add(e); }
      }
    }
    h.blocks.forEach(e => {
      if (e.dead) { h.blocks.delete(e); return; }
      if (e.stunT > 0) return;
      heroHurt(e.spec.atk * (1 + 0.08 * (Math.min(e.wave, 20) - 1)) * dt);
    });
    // 근처 유령은 드러남
    enemies.forEach(e => { if (e.spec.stealth && e.m.position.distanceTo(h.pos) < 2) e.reveal = Math.max(e.reveal, 0.3); });
    if (h.dead) return;
    const tg = heroTarget(S.range);
    if (tg && !moving) {
      h.yaw = Math.atan2(tg.m.position.x - h.pos.x, tg.m.position.z - h.pos.z);
      if (h.cd <= 0) { h.cd = S.rate; heroAttack(tg); }
    }
    h.walk += dt * (moving ? 12 : 0);
    h.m.position.set(h.pos.x, moving ? Math.abs(Math.sin(h.walk)) * 0.06 : 0, h.pos.z);
    let dy = h.yaw - h.m.rotation.y; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    h.m.rotation.y += dy * Math.min(1, dt * 14);
    h.m.userData['leg-1'].rotation.x = Math.sin(h.walk) * 0.6; h.m.userData['leg1'].rotation.x = -Math.sin(h.walk) * 0.6;
    h.swing = Math.max(0, h.swing - dt * 5);
    h.m.userData.hand.rotation.x = -h.swing * 1.6;
    const cape = h.m.userData.cape; cape.visible = cape.userData.badge.visible = h.lv >= 5;
    if (cape.visible) cape.rotation.x = 0.15 + (moving ? 0.5 : 0.05) + Math.sin(simT * 4 + h.walk * 0.3) * 0.07;
    faceAnim(h.m.userData.body.userData, simT, h.lastHit < 0.2);
    const f = h.hp / h.maxHp; h.m.userData.bar.scale.x = 0.6 * f;
    h.m.userData.bar.material.color.setHex(f > 0.5 ? 0x4fc3ff : f > 0.25 ? 0xffc24d : 0xff5a5a);
  }
  function heroAttack(e) {
    const h = hero, S = h.spec, dmg = S.atk * heroMul() * (1 + runMods.hero);
    h.swing = 1;
    const from = h.pos.clone().setY(0.7);
    if (h.id === 'minjun') { hurt(e, dmg, h); puff(e.m.position.clone().setY(0.4), 0xffffff, 4); sfx.whack(); }
    else if (h.id === 'seoyeon') {
      const m = new T.Mesh(G.ball, mat(0xe2414b, { roughness: 0.5 })); m.position.copy(from); world.add(m);
      shots.push({ m, target: e, speed: 13, dmg, src: h, life: 1.5, last: e.m.position.clone() }); sfx.throwBall();
    } else if (h.id === 'doyun') {
      const m = new T.Mesh(G.flask, mat(0x7cff8a, { roughness: 0.2 })); m.position.copy(from); world.add(m);
      shots.push({ kind: 'arc', m, from, to: e.m.position.clone().setY(0.05), t: 0, dur: 0.55, h: 1.2, dmg, splash: S.splash, src: h, life: 2, poison: { dps: 5 * heroMul(), dur: 2.5, r: 0.8 } });
      sfx.launch();
    } else if (h.id === 'haeun') {
      const m = new T.Mesh(G.pebble, mat([0xff5aa8, 0x5ab4ff, 0xffd24d, 0x6fdc6f][Math.floor(Math.random() * 4)])); m.scale.setScalar(1.4); m.position.copy(from); world.add(m);
      shots.push({ m, target: e, speed: 11, dmg, slow: 0.3, slowT: 1.5, src: h, life: 1.5, last: e.m.position.clone(), paint: true }); sfx.water();
    }
  }
  function heroSkill(byBrain) {
    if (!hero || hero.dead || hero.skillCd > 0 || state !== 'play' || paused) return;
    const h = hero, S = h.spec, strong = h.lv >= 3;
    h.skillCd = S.skill.cd; h.swing = 1; bigHit(0.08);
    prog.stats.skills = (prog.stats.skills || 0) + 1; if (prog.stats.skills >= 10) unlockAch('skill10');
    if (h.id === 'minjun') {
      const r = strong ? 3.0 : 2.2;
      enemies.slice().forEach(e => { if (!e.dead && e.m.position.distanceTo(h.pos) <= r) { e.stunT = (strong ? 3 : 2) * (e.spec.boss ? 0.5 : 1); hurt(e, 20 * heroMul(), h); } });
      ringFx(h.pos, r, 0xffd84d, 0.6); sfx.shout(); showBanner('📢 줄 서!');
    } else if (h.id === 'seoyeon') {
      const tg = heroTarget(7);
      const dir = tg ? new T.Vector3().subVectors(tg.m.position, h.pos).setY(0).normalize() : new T.Vector3(Math.sin(h.yaw), 0, Math.cos(h.yaw));
      h.yaw = Math.atan2(dir.x, dir.z);
      const m = new T.Mesh(G.ball, mat(0xffd84d, { roughness: 0.4 })); m.scale.setScalar(2); m.position.copy(h.pos).setY(0.5); world.add(m);
      shots.push({ kind: 'pierce', m, dir, speed: 14, dist: 0, max: 9, dmg: (strong ? 90 : 60) * heroMul(), hit: new Set(), src: h, life: 2 });
      sfx.shoot(); showBanner('⚽ 강슛!');
    } else if (h.id === 'doyun') {
      const tg = heroTarget(5), at = tg ? tg.m.position.clone().setY(0) : h.pos.clone(), r = 2.0;
      enemies.slice().forEach(e => { if (!e.dead && !e.air && e.m.position.distanceTo(at) <= r) hurt(e, (strong ? 105 : 70) * heroMul(), h); });
      ringFx(at, r, 0x7cff8a, 0.5); puff(at, 0x7cff8a, 24); addZone(at, 1.4, 8 * heroMul(), 4);
      shake = Math.max(shake, 0.3); sfx.boom(); showBanner('💥 부글부글 폭발!');
    } else if (h.id === 'haeun') {
      const r = 3.0;
      enemies.forEach(e => { if (!e.dead && e.m.position.distanceTo(h.pos) <= r) { e.slowK = Math.min(e.slowK, 0.5); e.slowT = 4; } });
      paintBuffs.push({ pos: h.pos.clone(), r, amt: strong ? 0.8 : 0.5, t: 6 });
      [0xff5a5a, 0xffa64d, 0xffe14d, 0x5fd36b, 0x4fa3ff, 0xa77bff].forEach((c, i) => ringFx(h.pos, r * (0.5 + i * 0.1), c, 0.6 + i * 0.08));
      sfx.rainbow(); showBanner('🌈 무지개 물감!');
    }
    saveProg();
  }

  // =====================================================================
  // 선생님 스킬
  // =====================================================================
  function teacherSkill(id) {
    if (state !== 'play' || paused || teacherCd[id] > 0) return;
    ensureAudio();
    if (id === 'chalk') { chalkMode = !chalkMode; $('tChalk').classList.toggle('aim', chalkMode); if (chalkMode) { closeSheets(); setHeroSel(false); showIntro('🖍️ 분필을 던질 곳을 눌러요'); } sfx.click(); return; }
    teacherCd[id] = teacherMax(id); teacherUsed[id] = true; checkTeacherAch();
    if (id === 'quiet') {
      enemies.forEach(e => { e.stunT = e.spec.boss ? 1.5 : 3; });
      showBanner('📏 조용히 해!'); sfx.shout(); shake = Math.max(shake, 0.2);
      enemies.forEach(e => puff(e.m.position.clone().setY(0.6), 0x9fd8ff, 2));
    } else if (id === 'snack') {
      const n = 40 + waveNo * 6; money += n; popAt(baseWorld(), `🍪 +${n}`, false); showBanner(`🍪 간식 시간! +${n}🪙`); sfx.coins(); updateHud();
    }
  }
  function throwChalk(p) {
    chalkMode = false; $('tChalk').classList.remove('aim');
    teacherCd.chalk = teacherMax('chalk'); teacherUsed.chalk = true; checkTeacherAch();
    const m = mesh(GEO('CylinderGeometry', 0.08, 0.08, 0.5, 8), mat(0xffffff));
    const from = p.clone().add(new T.Vector3(0, 9, -3));
    m.position.copy(from); world.add(m);
    shots.push({ kind: 'arc', m, from, to: p.clone().setY(0.05), t: 0, dur: 0.45, h: 0.5, dmg: 150 * (1 + 0.15 * waveNo), splash: 1.6, src: null, life: 2, chalk: true, air: true });
    sfx.launch();
  }
  function checkTeacherAch() { if (teacherUsed.quiet && teacherUsed.chalk && teacherUsed.snack) unlockAch('teacher'); }

  // =====================================================================
  // 업데이트
  // =====================================================================
  let simT = 0;
  function update(dt) {
    simT += dt;
    Object.keys(teacherCd).forEach(k => { teacherCd[k] = Math.max(0, teacherCd[k] - dt); });
    for (const s of spawns) {
      s.t += dt;
      while (s.n > 0 && s.t >= 0) { spawnEnemy(s.type, s.wave); s.n--; s.t -= s.gap; }
    }
    spawns = spawns.filter(s => s.n > 0);
    // 괴물
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowK = 1; }
      if (e.stunT > 0) e.stunT -= dt;
      if (e.reveal > 0) e.reveal -= dt;
      if (e.burnT > 0) { e.burnT -= dt; hurt(e, e.burn * dt, null, { pierce: true, dot: true }); if (e.dead) continue; if (Math.random() < dt * 6) puff(e.m.position.clone().setY(0.3), 0xff8a2a, 1); }
      if (e.whiteT > 0) { e.whiteT -= dt; if (e.whiteT <= 0) flashOff(e); }
      if (e.enrageFx && !e.whiteOn) {
        e.enrageFx = false;
        e.m.traverse(o => { if (o.isMesh && !o.userData.isOutline && o.material !== eyeMat && o.material.isMeshToonMaterial && !o.material.transparent) { o.material = o.material.clone(); o.material.emissive = new T.Color(0x7a1010); } });
      }
      if (e.blocked && (e.blocked.dead || !e.blocked.blocks.has(e))) e.blocked = null;
      let sp = e.speed * e.slowK;
      // 보스 특수 행동
      if (e.spec.boss) {
        e.bossT += dt;
        if (e.type === 'soccer') { if (e.bossT % 6 < 1.0) { sp *= 3.2; if (Math.random() < dt * 8) puff(e.m.position, 0xffffff, 2); } }
        if (e.type === 'extinguisher' && e.bossT > 6) {
          e.bossT = 0;
          towers.forEach(t => { if (t.pos.distanceTo(e.m.position) <= 2.4) { t.stunT = 3; puff(t.pos.clone().setY(0.6), 0xffffff, 6); } });
          ringFx(e.m.position, 2.4, 0xffffff, 0.6); popAt(e.m.position.clone().setY(1.8), '거품 발사!', true); sfx.foam();
        }
        if (e.type === 'tray') {
          if (e.shieldT > 0) e.shieldT -= dt;
          if (e.bossT > 8) {
            e.bossT = 0; e.shieldT = 2.5;
            const pool = MAP.pool.filter(t => !ENEMIES[t].air);
            for (let i = 0; i < 3; i++) spawnEnemy(pool[Math.floor(Math.random() * pool.length)], e.wave, { pi: e.pi, d: Math.max(0, e.d - 0.4 - i * 0.4), pos: e.m.position.clone() });
            popAt(e.m.position.clone().setY(2), '부하 소환! 방패!', true); sfx.boss();
          }
          e.m.userData.shield.visible = e.shieldT > 0;
        }
      }
      // 압정 고슴도치: 장난감 고장
      if (e.spec.sabotage) {
        e.sabCd -= dt;
        if (e.sabCd <= 0) {
          const t = towers.find(t => t.stunT <= 0 && t.pos.distanceTo(e.m.position) < 1.15);
          if (t) { t.stunT = 2.5; e.sabCd = 3; popAt(t.pos.clone().setY(1), '콕! 고장', true); sfx.tack(); }
        }
      }
      if (!(e.stunT > 0) && !e.blocked) e.d += sp * dt;
      // 위치
      let pos, dir;
      if (e.line) {
        if (e.d >= e.lineLen) { leak(e); continue; }
        pos = new T.Vector3().lerpVectors(e.line.a, e.line.b, e.d / e.lineLen); dir = new T.Vector3().subVectors(e.line.b, e.line.a).normalize();
      } else {
        if (e.d >= paths[e.pi].total) { leak(e); continue; }
        const r = pathAt(e.pi, e.d); pos = r.pos; dir = r.dir;
      }
      e.wobble += dt * 8;
      e.m.position.set(pos.x, 0, pos.z);
      e.m.rotation.y = Math.atan2(dir.x, dir.z);
      if (e.type === 'plane') { e.m.position.y = Math.sin(e.wobble * 0.6) * 0.08; e.m.rotation.z = Math.sin(e.wobble * 0.5) * 0.25; }
      else if (e.type === 'snake') e.m.userData.segs.forEach((sg, i) => { sg.position.x = Math.sin(e.wobble - i * 0.9) * 0.06; });
      else if (e.type === 'bat') { e.m.position.y = Math.sin(e.wobble * 0.7) * 0.15; e.m.userData.wings.forEach((w, i) => { w.rotation.z = Math.sin(e.wobble * 2.2) * 0.8 * (i ? -1 : 1); }); }
      else if (e.type === 'balloon') e.m.position.y = Math.sin(e.wobble * 0.3) * 0.12;
      else if (e.type === 'ghost') { e.m.position.y = 0.05 + Math.sin(e.wobble * 0.4) * 0.08; e.m.userData.ghostMat.opacity = e.reveal > 0 ? 0.85 : 0.3; }
      else if (e.type === 'soccer') e.m.userData.roll.forEach(r => { r.rotation.x += sp * dt * 1.4; });
      else e.m.position.y = Math.abs(Math.sin(e.wobble)) * (e.spec.boss ? 0.08 : 0.05);
      const bar = e.m.userData.bar, bg = e.m.userData.barBg;
      const show = e.spec.boss || e.hp < e.maxHp;
      bar.visible = bg.visible = show;
      if (show) { const f = Math.max(0, e.hp / e.maxHp); bar.scale.x = e.m.userData.barW * f; bar.material.color.setHex(f > 0.5 ? 0x5ee06b : f > 0.25 ? 0xffc24d : 0xff5a5a); }
      if (e.flash > 0) { e.flash -= dt; e.m.scale.setScalar(1 + e.flash * (e.spec.boss ? 0.4 : 1.2)); } else e.m.scale.setScalar(1);
      faceAnim(e.m.userData, simT, e.flash > 0 || e.stunT > 0 || e.enraged);
    }
    enemies.filter(e => e.dead && !e.dieFx).forEach(e => world.remove(e.m));
    enemies = enemies.filter(e => !e.dead);

    updateHero(dt);
    updateZones(dt);
    computeBuffs();
    // 장난감
    for (const t of towers) {
      if (t.m.userData.orbit) t.m.userData.orbit.rotation.y += dt * 2.2;
      if (t.grow < 1) { t.grow = Math.min(1, t.grow + dt * 4); const s = t.grow < 0.7 ? t.grow / 0.7 * 1.15 : 1.15 - (t.grow - 0.7) / 0.3 * 0.15; t.m.scale.setScalar(Math.max(0.01, s)); }
      if (t.stunT > 0) { t.stunT -= dt; t.m.rotation.z = Math.sin(t.stunT * 20) * 0.08; if (t.stunT <= 0) t.m.rotation.z = 0; continue; }
      if (t.m.userData.spin) t.m.userData.spin.rotation.y += dt * (t.cd > t.s.rate * 0.5 ? 18 : 6);
      if (t.fireT > 0) {
        t.fireT = Math.max(0, t.fireT - dt);
        const k = Math.sin((1 - t.fireT / 0.25) * Math.PI), ud = t.m.userData;
        if (t.type === 'sling') ud.head.rotation.x = -0.4 * k;
        else if (t.type === 'water') ud.head.rotation.x = -0.18 * k;
        else if (t.type === 'top' && ud.spin) ud.spin.position.y = 0.1 + k * 0.32;
        else if (t.type === 'ddakji' && ud.arm) ud.arm.rotation.x = -1.3 * k;
      }
      if (t.type === 'flute') {
        t.cd -= dt;
        if (t.s.lull) enemies.forEach(e => { if (!e.dead && e.m.position.distanceTo(t.pos) <= t.s.range) { e.slowK = Math.min(e.slowK, 1 - t.s.lull); e.slowT = Math.max(e.slowT, 0.3); } });
        if (t.cd <= 0) { t.cd = 1.2; t.fireT = 0.25; note(t.pos, t.s.range, t.br); }
        if (t.fireT > 0) { t.fireT -= dt; t.m.userData.head.rotation.z = Math.sin((1 - t.fireT / 0.25) * Math.PI * 2) * 0.18; }
        continue;
      }
      t.cd -= dt * (1 + t.buff);
      const target = findTarget(t, t.s.range);
      if (target && t.type !== 'top') {
        const ang = Math.atan2(target.m.position.x - t.pos.x, target.m.position.z - t.pos.z), h = t.m.userData.head;
        let diff = ang - h.rotation.y; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
        h.rotation.y += diff * Math.min(1, dt * 12);
      }
      if (t.cd > 0 || !target) continue;
      t.cd = t.s.rate;
      fire(t, target);
    }
    // 탄
    for (const s of shots) {
      s.life -= dt;
      if (s.kind === 'pierce') {
        const step = s.speed * dt;
        s.m.position.addScaledVector(s.dir, step); s.dist += step; s.m.rotation.x += dt * 20;
        for (const en of enemies) {
          if (en.dead || s.hit.has(en)) continue;
          if (en.m.position.distanceTo(new T.Vector3(s.m.position.x, en.m.position.y, s.m.position.z)) < 0.6) { s.hit.add(en); hurt(en, s.dmg, s.src); puff(en.m.position, 0xffd84d, 5); }
        }
        if (s.dist >= s.max) s.done = true;
      } else if (s.kind === 'arc') {
        s.t += dt / s.dur;
        const k = Math.min(1, s.t);
        s.m.position.lerpVectors(s.from, s.to, k); s.m.position.y = s.from.y + (s.to.y - s.from.y) * k + Math.sin(Math.PI * k) * s.h;
        s.m.rotation.x += dt * 10; s.m.rotation.z += dt * 7;
        if (k >= 1) { boom(s); s.done = true; }
      } else {
        const tg = s.target;
        const tp = tg && !tg.dead ? tg.m.position.clone().setY(tg.air ? tg.m.position.y + (tg.type === 'balloon' ? 1.4 : 1.0) : 0.3) : s.last;
        s.last = tp;
        const v = new T.Vector3().subVectors(tp, s.m.position), step = s.speed * dt;
        if (v.length() <= step + 0.05) {
          if (tg && !tg.dead) onHit(s, tg, tp);
          s.done = true;
        } else s.m.position.addScaledVector(v.normalize(), step);
      }
      if (s.life <= 0) s.done = true;
    }
    shots.filter(s => s.done).forEach(s => world.remove(s.m));
    shots = shots.filter(s => !s.done);
    // 효과
    for (const f of fx) {
      f.t += dt;
      if (f.kind === 'pulse') { const k = f.t / f.dur; f.m.scale.setScalar(0.2 + k * f.r); f.m.material.opacity = 0.6 * (1 - k); }
      else if (f.kind === 'die') {
        f.vy -= 14 * dt; f.m.position.y = Math.max(0, f.m.position.y + f.vy * dt);
        f.m.rotation.y += f.spin * dt; f.m.rotation.x += f.spin * 0.25 * dt;
        const k = f.t / f.dur; f.m.scale.setScalar(Math.max(0.01, 1 - k * k));
      }
      else if (f.kind === 'chunk') {
        f.v.y -= 12 * dt; f.m.position.addScaledVector(f.v, dt);
        if (f.m.position.y < 0.04) { f.m.position.y = 0.04; f.v.y *= -0.35; f.v.x *= 0.6; f.v.z *= 0.6; f.r.multiplyScalar(0.6); }
        f.m.rotation.x += f.r.x * dt; f.m.rotation.y += f.r.y * dt;
        if (f.t > f.dur - 0.25) f.m.scale.multiplyScalar(0.85);
      }
      else if (f.kind === 'note') { f.m.position.y += dt * 0.8; f.m.position.x += Math.sin(f.t * 6) * dt * 0.3; f.m.material.opacity = 1 - f.t / f.dur; }
      else { f.v.y -= 6 * dt; f.m.position.addScaledVector(f.v, dt); f.m.scale.setScalar(Math.max(0.01, 1 - f.t / f.dur)); }
    }
    fx.filter(f => f.t >= f.dur).forEach(f => world.remove(f.m));
    fx = fx.filter(f => f.t < f.dur);
    // 웨이브 끝
    if (state === 'play' && waveNo > 0 && !waveActive() && !roundCleared[waveNo]) {
      roundCleared[waveNo] = true;
      if (!endless && waveNo >= totalWaves) { finish(true); return; }
      const bonus = 20 + Math.min(waveNo, 30) * 3;
      money += bonus;
      showBanner(`${waveNo}웨이브 막았다! +${bonus}🪙`);
      sfx.chime();
      $('waveBtn').classList.add('glow');
      if (endless) { const best = prog.endless[MAP.id] || 0; if (waveNo > best) { prog.endless[MAP.id] = waveNo; saveProg(); } if (waveNo >= 10) unlockAch('endless10'); if (waveNo >= 25) unlockAch('endless25'); }
      saveGame();
      updateHud();
      if (endless && waveNo % 2 === 0) setTimeout(() => { if (state === 'play') showCards(); }, 900);
    }
  }
  function onHit(s, tg, tp) {
    hurt(tg, s.dmg, s.src, { pierce: s.pierce });
    if (s.reveal) tg.reveal = 3;
    if (s.slow) {
      const apply = e => { e.slowK = Math.min(e.slowK, 1 - s.slow); e.slowT = Math.max(e.slowT, s.slowT); };
      if (s.area) enemies.forEach(e => { if (!e.dead && e.m.position.distanceTo(tg.m.position) <= s.area) { apply(e); e.reveal = Math.max(e.reveal, 2); } });
      else apply(tg);
      if (s.freeze && Math.random() < s.freeze && !tg.spec.boss) { tg.stunT = 1.0; puff(tp, 0xcff4ff, 6); }
      splash(tp, s.paint ? s.m.material.color.getHex() : s.area ? 0xffb030 : 0x6fd0ff, 4);
    }
  }
  function fire(t, e) {
    const s = t.s, from = t.pos.clone().setY(0.75);
    t.fireT = 0.25;
    if (t.type === 'sling') {
      const m = new T.Mesh(G.pebble, mat(s.pierce ? 0x333333 : 0x8a6a4a)); if (s.pierce) m.scale.setScalar(1.6); m.position.copy(from); world.add(m);
      shots.push({ m, target: e, speed: s.pierce ? 22 : 14, dmg: s.dmg, pierce: s.pierce, src: t, life: 1.5, last: e.m.position.clone() });
      sfx.sling();
    } else if (t.type === 'water') {
      for (let i = 0; i < 3; i++) {
        const m = new T.Mesh(G.drop, mat(s.area ? 0xffb030 : 0x6fd0ff, { roughness: 0.1, transparent: true, opacity: 0.85 }));
        m.position.copy(from).add(new T.Vector3((Math.random() - 0.5) * 0.1, 0, (Math.random() - 0.5) * 0.1)); world.add(m);
        shots.push(i === 0 ? { m, target: e, speed: 9, dmg: s.dmg, slow: s.slow, slowT: s.slowT, area: s.area, freeze: s.freeze, reveal: true, src: t, life: 1.2, last: e.m.position.clone() }
                           : { m, target: e, speed: 9 - i, dmg: 0, src: t, life: 1.2, last: e.m.position.clone(), deco: true });
      }
      sfx.water();
    } else if (t.type === 'top') {
      ringFx(t.pos, s.range, s.burn ? 0xff6a00 : s.knock ? 0x5fb4ff : 0xff8a6a, 0.35);
      for (const en of enemies.slice()) {
        if (en.dead || en.air) continue;
        const dx = en.m.position.x - t.pos.x, dz = en.m.position.z - t.pos.z;
        if (dx * dx + dz * dz > s.range * s.range) continue;
        hurt(en, s.dmg, t);
        if (s.burn) { en.burn = s.burn; en.burnT = 3; }
        if (s.knock && !en.spec.boss && !en.line) en.d = Math.max(0, en.d - s.knock);
      }
      sfx.top();
    } else if (t.type === 'ddakji') {
      const lead = e.line ? e.m.position.clone() : pathAt(e.pi, e.d + e.speed * e.slowK * 0.7).pos;
      const m = mesh(G.card, mat([0xe2584c, 0x3f8de0, 0xf2b72e][Math.floor(Math.random() * 3)])); if (s.splash > 1.5) m.scale.setScalar(1.6);
      m.position.copy(from); world.add(m);
      shots.push({ kind: 'arc', m, from, to: lead.clone().setY(0.05), t: 0, dur: 0.7, h: 1.6, dmg: s.dmg, splash: s.splash, chain: s.chain, src: t, life: 2 });
      sfx.launch();
    }
  }
  function boom(s) {
    for (const en of enemies.slice()) {
      if (en.dead || (en.air && !s.air)) continue;
      const dx = en.m.position.x - s.to.x, dz = en.m.position.z - s.to.z, d2 = dx * dx + dz * dz;
      if (d2 <= s.splash * s.splash) { hurt(en, d2 < 0.16 ? s.dmg : s.dmg * 0.7, s.src, { pierce: s.chalk }); if (s.chalk) en.reveal = 3; }
    }
    ringFx(s.to, s.splash, s.chalk ? 0xffffff : s.poison ? 0x7cff8a : 0xffc24d, 0.3);
    puff(s.to, s.chalk ? 0xffffff : s.poison ? 0x7cff8a : 0xffd84d, s.chalk ? 22 : 10);
    if (s.poison) addZone(s.to, s.poison.r, s.poison.dps, s.poison.dur);
    if (s.chain) {
      for (let i = 0; i < s.chain; i++) {
        const a = (i / s.chain) * Math.PI * 2 + Math.random(), p = s.to.clone().add(new T.Vector3(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0));
        const m = mesh(G.card, mat(0xff8a3d)); m.scale.setScalar(0.6); m.position.copy(s.to).setY(0.3); world.add(m);
        shots.push({ kind: 'arc', m, from: s.to.clone().setY(0.3), to: p, t: 0, dur: 0.35 + i * 0.08, h: 0.8, dmg: s.dmg * 0.55, splash: 0.85, src: s.src, life: 2 });
      }
    }
    shake = Math.max(shake, s.chalk ? 0.35 : s.poison ? 0.05 : 0.12);
    if (s.chalk) bigHit(0.09); else if (s.splash >= 1.5) bigHit(0.04);
    sfx.boom(s.splash >= 1.5 || s.chalk);
  }
  function leak(e) {
    e.dead = true; leakLog[e.type] = (leakLog[e.type] || 0) + 1;
    if (e.spec.boss) { bossAlive = Math.max(0, bossAlive - 1); if (!bossAlive) music.setBoss(false); }
    lives = Math.max(0, lives - e.spec.leak);
    popAt(baseWorld(), `-${e.spec.leak}❤️`, true);
    $('cLives').classList.remove('flash'); void $('cLives').offsetWidth; $('cLives').classList.add('flash');
    sfx.leak(); shake = Math.max(shake, e.spec.boss ? 0.5 : 0.2);
    updateHud();
    if (lives <= 0) finish(false);
  }
  function addZone(p, r, dps, dur) {
    const m = new T.Mesh(G.disc, new T.MeshBasicMaterial({ color: 0x5fd36b, transparent: true, opacity: 0.4, depthWrite: false }));
    m.scale.setScalar(r); m.position.copy(p).setY(0.03); world.add(m);
    zones.push({ pos: p.clone(), r, dps, t: dur, dur, m, tick: 0 });
  }
  function updateZones(dt) {
    zones.forEach(z => {
      z.t -= dt; z.tick += dt; z.m.material.opacity = 0.4 * Math.max(0, z.t / z.dur);
      if (z.tick >= 0.25) { z.tick = 0; enemies.slice().forEach(e => { if (!e.dead && !e.air && e.m.position.distanceTo(z.pos) <= z.r) hurt(e, z.dps * 0.25, hero, { dot: true }); }); }
    });
    zones.filter(z => z.t <= 0).forEach(z => world.remove(z.m));
    zones = zones.filter(z => z.t > 0);
    paintBuffs.forEach(b => { b.t -= dt; }); paintBuffs = paintBuffs.filter(b => b.t > 0);
  }

  // =====================================================================
  // 효과
  // =====================================================================
  function puff(p, color, n) {
    if (qualityLevel() === 'low') n = Math.ceil(n / 2);
    if (fx.length > 260) n = Math.min(n, 2);
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(G.spark, matB(color)); m.position.copy(p).setY(Math.max(0.2, p.y + 0.2)); world.add(m);
      const a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 2;
      fx.push({ kind: 'spark', m, v: new T.Vector3(Math.cos(a) * sp, 2 + Math.random() * 2, Math.sin(a) * sp), t: 0, dur: 0.5 + Math.random() * 0.3 });
    }
  }
  const splash = (p, c, n) => puff(p, c, n);
  function ringFx(p, r, color, dur) {
    const m = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
    m.position.copy(p).setY(0.07); world.add(m); fx.push({ kind: 'pulse', m, t: 0, dur, r });
  }
  const noteTex = canvasTex(64, 64, g => { g.font = '48px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ff6fa8'; g.fillText('♪', 32, 34); });
  function note(p, range, br) {
    const m = new T.Sprite(new T.SpriteMaterial({ map: noteTex, transparent: true, depthWrite: false, color: br === 'B' ? 0xb8b0ff : 0xffffff }));
    m.scale.set(0.35, 0.35, 1); m.position.copy(p).setY(1.1); world.add(m);
    fx.push({ kind: 'note', m, t: 0, dur: 1.2 });
    ringFx(p, range, br === 'B' ? 0xb8b0ff : 0xff9fc8, 0.8);
  }

  // =====================================================================
  // 카메라
  // =====================================================================
  const cam = { tx: 0, tz: 0, dist: 18, yaw: 0, pitch: 0.95, minD: 6, maxD: 30 };
  let shake = 0, camFocus = null;
  function fitCamera() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    cam.yaw = aspect < 0.9 ? -Math.PI / 2 : 0;
    const w = aspect < 0.9 ? 11 : 17, h = aspect < 0.9 ? 17 : 11;
    const tanH = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    cam.dist = Math.min(cam.maxD, Math.max(cam.minD, Math.max((h * 0.62) / tanH, (w * 0.55) / (tanH * aspect))));
    cam.tx = 0.4; cam.tz = 0.4; cam.pitch = 0.95;
  }
  function focusCam(p, dur) { camFocus = { x: p.x, z: p.z, t: dur, dur, ox: cam.tx, oz: cam.tz }; }
  function applyCamera(dt) {
    let tx = cam.tx, tz = cam.tz;
    if (camFocus) {
      camFocus.t -= dt;
      const k = camFocus.t > camFocus.dur - 0.5 ? (camFocus.dur - camFocus.t) / 0.5 : camFocus.t < 0.5 ? Math.max(0, camFocus.t / 0.5) : 1;
      tx = cam.tx + (camFocus.x - cam.tx) * k; tz = cam.tz + (camFocus.z - cam.tz) * k;
      if (camFocus.t <= 0) camFocus = null;
    }
    const cx = tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cz = tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cy = Math.sin(cam.pitch) * cam.dist;
    let sx = 0, sy = 0;
    if (shake > 0) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
    camera.position.set(cx + sx, cy + sy, cz);
    camera.lookAt(tx + sx * 0.5, 0, tz);
  }

  // =====================================================================
  // 입력
  // =====================================================================
  const ray = new T.Raycaster(), ndc = new T.Vector2(), ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  function groundPoint(x, y) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new T.Vector3();
    return ray.ray.intersectPlane(ground, p) ? p : null;
  }
  function tileOf(p) {
    if (!p) return null;
    const gx = Math.floor(p.x + GW / 2), gy = Math.floor(p.z + GH / 2);
    return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? null : { gx, gy };
  }
  const ptrs = new Map();
  let gesture = null;
  canvas.addEventListener('pointerdown', e => {
    ensureAudio();
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button });
    if (ptrs.size === 1) gesture = { moved: false, mode: e.button === 2 ? 'rotate' : 'pan' };
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      gesture = { moved: true, mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), dist0: cam.dist, ang0: Math.atan2(b.y - a.y, b.x - a.x), yaw0: cam.yaw };
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) { if (e.pointerType === 'mouse' && state === 'play') showHover(e.clientX, e.clientY); return; }
    const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!gesture) return;
    if (gesture.mode === 'pinch' && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
      cam.dist = Math.min(cam.maxD, Math.max(cam.minD, gesture.dist0 * gesture.d0 / Math.max(10, d)));
      cam.yaw = gesture.yaw0 - (ang - gesture.ang0);
      return;
    }
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 8) gesture.moved = true;
    if (!gesture.moved) return;
    if (gesture.mode === 'rotate') { cam.yaw -= dx * 0.008; cam.pitch = Math.min(1.35, Math.max(0.55, cam.pitch + dy * 0.005)); return; }
    const k = cam.dist * 0.0022, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    cam.tx -= (dx * cy + dy * sy) * k; cam.tz -= (-dx * sy + dy * cy) * k;
    cam.tx = Math.max(-GW / 2 - 1, Math.min(GW / 2 + 2, cam.tx)); cam.tz = Math.max(-GH / 2 - 1, Math.min(GH / 2 + 1, cam.tz));
  });
  const endPtr = e => {
    const p = ptrs.get(e.pointerId);
    ptrs.delete(e.pointerId);
    if (gesture && !gesture.moved && p && ptrs.size === 0 && p.btn !== 2) tap(e.clientX, e.clientY);
    if (ptrs.size === 0) gesture = null;
    else if (ptrs.size === 1) { const [q] = [...ptrs.values()]; q.sx = q.x; q.sy = q.y; gesture = { moved: true, mode: 'pan' }; }
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (!ptrs.size) gesture = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.min(cam.maxD, Math.max(cam.minD, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  function showHover(x, y) {
    const t = tileOf(groundPoint(x, y));
    if (!t || selTile || selTower || heroSel || chalkMode) { if (!selTile) hoverTile.visible = false; return; }
    const k = t.gx + ',' + t.gy, ok = !pathTiles.has(k) && !blockTiles.has(k);
    hoverTile.visible = ok || !!towerAt[k];
    hoverTile.material.color.setHex(towerAt[k] ? 0xffd84d : 0x5ee06b);
    const p = toW(t.gx, t.gy); hoverTile.position.set(p.x, 0.03, p.z);
  }
  function tap(x, y) {
    if (state !== 'play') return;
    const gp = groundPoint(x, y);
    if (chalkMode && gp) { throwChalk(gp); return; }
    if (moveMode) {
      const t = tileOf(gp), mt = moveMode; moveMode = null; rangeRing.visible = rangeDisc.visible = false;
      if (t) { const k = t.gx + ',' + t.gy; if (!towerAt[k] && !pathTiles.has(k) && !blockTiles.has(k) && money >= MOVE_COST) { moveTower(mt, t.gx, t.gy); return; } }
      showIntro('옮기기를 취소했어요'); return;
    }
    if (hero && !hero.dead && gp && gp.distanceTo(new T.Vector3(hero.pos.x, 0, hero.pos.z)) < 0.6 && !heroSel) { setHeroSel(true); sfx.click(); return; }
    if (heroSel && gp) { moveHero(gp.x, gp.z); return; }
    const t = tileOf(gp);
    if (!t) { closeSheets(); return; }
    const k = t.gx + ',' + t.gy;
    if (towerAt[k]) { openInfo(towerAt[k]); return; }
    if (pathTiles.has(k) || blockTiles.has(k)) { closeSheets(); return; }
    openBuild(t);
  }

  // =====================================================================
  // 판넬
  // =====================================================================
  function closeSheets(keepHero) {
    if (!keepHero && heroSel) setHeroSel(false);
    $('build').classList.remove('show'); $('info').classList.remove('show');
    selTile = null; selTower = null; pickType = null;
    hoverTile.visible = false; rangeRing.visible = false; rangeDisc.visible = false;
    rangePool.forEach(m => { m.visible = false; });
    preview.clear();
  }
  const rangePool = [];
  function showAllRanges(except) {
    rangePool.forEach(m => { m.visible = false; });
    towers.forEach((t, i) => {
      if (t === except) return;
      if (!rangePool[i]) { const m = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false })); scene.add(m); rangePool[i] = m; }
      const m = rangePool[i]; m.visible = true; m.position.set(t.pos.x, 0.045, t.pos.z); m.scale.setScalar(t.s.range);
      m.material.color.setHex(t.type === 'flute' ? 0xff9fc8 : 0xffffff);
    });
  }
  function showRange(p, r, color) {
    rangeRing.position.set(p.x, 0.04, p.z); rangeRing.scale.setScalar(r); rangeRing.visible = true;
    rangeDisc.position.set(p.x, 0.035, p.z); rangeDisc.scale.setScalar(r); rangeDisc.visible = true;
    rangeRing.material.color.setHex(color); rangeDisc.material.color.setHex(color);
  }
  function openBuild(t) {
    closeSheets(); chalkMode = false; $('tChalk').classList.remove('aim');
    selTile = t;
    const p = toW(t.gx, t.gy);
    hoverTile.visible = true; hoverTile.material.color.setHex(0x5ee06b); hoverTile.position.set(p.x, 0.03, p.z);
    renderTowerList();
    $('buildDesc').textContent = '장난감을 고르면 설명과 사거리가 나와요';
    $('buildOk').disabled = true; $('buildOk').textContent = '세우기';
    $('build').classList.add('show'); sfx.click();
  }
  function renderTowerList() {
    const box = $('towerList'); box.innerHTML = '';
    TOWER_ORDER.forEach(type => {
      const s = TOWERS[type], b = document.createElement('button'), c = towerCost(type), lock = rule === 'sling' && type !== 'sling';
      b.innerHTML = `<span class="ic">${lock ? '🔒' : s.icon}</span><span class="nm">${s.name}</span><span class="co">🪙${c}</span>`;
      if (money < c || lock) b.classList.add('no');
      if (pickType === type) b.classList.add('on');
      b.addEventListener('click', () => pick(type));
      box.appendChild(b);
    });
  }
  function pick(type) {
    pickType = type; sfx.click();
    const s = TOWERS[type], p = toW(selTile.gx, selTile.gy);
    $('buildDesc').textContent = `${s.icon} ${s.name}: ${s.desc}`;
    const c = towerCost(type), lock = rule === 'sling' && type !== 'sling', ok = money >= c && !lock;
    $('buildOk').disabled = !ok;
    $('buildOk').textContent = lock ? '오늘의 도전: 새총만!' : ok ? `세우기 (🪙${c})` : `동전이 부족해요 (🪙${c})`;
    const ps = towerStats(type, 1, null);
    showRange(p, ps.range, type === 'flute' ? 0xff9fc8 : 0xffffff); showAllRanges();
    preview.clear();
    const m = makeTowerMesh(type, 1, null); m.position.copy(p);
    m.traverse(o => { if (o.userData.isOutline) { o.visible = false; return; } if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; } });
    preview.add(m);
    renderTowerList();
  }
  $('buildOk').addEventListener('click', () => { if (selTile && pickType && placeTower(pickType, selTile.gx, selTile.gy)) closeSheets(); });
  $('buildClose').addEventListener('click', () => closeSheets());
  function statLine(type, s) {
    if (type === 'flute') return `사거리 <b>${s.range.toFixed(1)}</b> · 주변 공격 속도 <b>+${Math.round(s.buff * 100)}%</b>${s.lull ? ` · 괴물 <b>${s.lull * 100}%</b> 느리게` : ''}`;
    return `공격력 <b>${Math.round(s.dmg)}</b> · 사거리 <b>${s.range.toFixed(1)}</b> · 간격 <b>${s.rate}초</b>`;
  }
  function openInfo(t) {
    closeSheets();
    selTower = t;
    const base = TOWERS[t.type], s = t.s;
    const title = t.lv >= 3 ? `${base[t.br].icon} ${base[t.br].name}` : `${base.icon} ${base.name} · ${t.lv}단계`;
    $('infoTitle').textContent = title;
    let body = (t.lv >= 3 ? base[t.br].desc : base.desc) + '<br>' + statLine(t.type, s);
    if (t.type !== 'flute') body += `${t.buff ? ` <span style="color:#d94a8a">🎵+${Math.round(t.buff * 100)}%</span>` : ''}${t.dmgBuff ? ` <span style="color:#8a3ad0">🎨+${Math.round(t.dmgBuff * 100)}%</span>` : ''}<br>쓰러뜨린 괴물 <b>${t.kills}</b>마리`;
    $('infoBody').innerHTML = body;
    const up = $('upRow'); up.innerHTML = '';
    if (t.lv === 1) {
      const c = upCost(t), ns = towerStats(t.type, 2, null);
      up.appendChild(upBtn(`⬆️ 2단계로 (🪙${c})`, statLine(t.type, ns), money >= c, () => upgradeTower(t)));
    } else if (t.lv === 2) {
      const c = upCost(t);
      ['A', 'B'].forEach(br => up.appendChild(upBtn(`${base[br].icon} ${base[br].name} (🪙${c})`, base[br].desc, money >= c, () => upgradeTower(t, br))));
    } else {
      const d = document.createElement('div'); d.className = 'maxed'; d.textContent = '⭐ 최고 단계예요'; up.appendChild(d);
    }
    $('btnSell').textContent = `팔기 (+🪙${Math.floor(t.spent * 0.7)})`;
    showRange(t.pos, s.range, t.type === 'flute' ? 0xff9fc8 : 0xffffff); showAllRanges(t);
    $('btnMove').textContent = `↔ 옮기기 (🪙${MOVE_COST})`; $('btnMove').disabled = money < MOVE_COST;
    $('info').classList.add('show'); sfx.click();
  }
  function upBtn(label, desc, ok, fn) {
    const b = document.createElement('button'); b.className = 'upb'; b.disabled = !ok;
    b.innerHTML = `<b>${label}</b><small>${desc}</small>`; b.addEventListener('click', fn); return b;
  }
  $('btnSell').addEventListener('click', () => { if (selTower) sellTower(selTower); });
  $('btnMove').addEventListener('click', () => {
    if (!selTower || money < MOVE_COST) return;
    moveMode = selTower; closeSheets(); showIntro('↔ 옮길 빈 칸을 눌러요 (다른 곳을 누르면 취소)'); sfx.click();
    const p = moveMode.pos; showRange(p, moveMode.s.range, 0xffd84d);
  });
  function moveTower(t, gx, gy) {
    delete towerAt[t.gx + ',' + t.gy];
    t.gx = gx; t.gy = gy; t.pos = toW(gx, gy); towerAt[gx + ',' + gy] = t;
    puff(t.m.position, 0xd9b48a, 6);
    t.m.position.copy(t.pos); t.grow = 0.3; t.cd = Math.max(t.cd, 0.8);
    money -= MOVE_COST; puff(t.pos, 0xffffff, 8); sfx.build(); updateHud();
  }
  $('infoClose').addEventListener('click', () => closeSheets());

  // =====================================================================
  // HUD·알림
  // =====================================================================
  function updateHud() {
    $('lives').textContent = lives; $('money').textContent = money;
    $('wave').textContent = endless ? `${waveNo} ♾️` : `${waveNo}/${totalWaves}`;
    const wb = $('waveBtn');
    if (!endless && waveNo >= totalWaves) { wb.disabled = true; wb.innerHTML = '마지막 웨이브!'; wb.classList.remove('glow'); }
    else {
      wb.disabled = false;
      if (waveActive()) wb.innerHTML = `⏩ 다음 <small>(+${10 + waveNo * 2}🪙)</small>`;
      else wb.innerHTML = waveNo === 0 ? '▶ 웨이브 시작' : `▶ ${waveNo + 1}웨이브`;
    }
    updatePreview();
    if ($('build').classList.contains('show')) { renderTowerList(); if (pickType) $('buildOk').disabled = money < towerCost(pickType) || (rule === 'sling' && pickType !== 'sling'); }
    if ($('info').classList.contains('show') && selTower) $('upRow').querySelectorAll('.upb').forEach(b => { const c = upCost(selTower); b.disabled = money < c; });
  }
  function updateLiveUI() {
    const boss = enemies.find(e => e.spec.boss && !e.dead);
    const bb = $('bossBar');
    if (boss) {
      bb.classList.add('show');
      $('bossName').textContent = `${boss.spec.icon} ${boss.spec.name}${boss.enraged ? ' 💢' : ''}`;
      $('bossFill').style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';
      bb.classList.toggle('angry', !!boss.enraged);
    } else bb.classList.remove('show');
    [['quiet', 'tQuiet'], ['chalk', 'tChalk'], ['snack', 'tSnack']].forEach(([k, id]) => {
      const el = $(id), cd = teacherCd[k];
      el.querySelector('i').style.height = (cd / teacherMax(k) * 100) + '%';
      el.querySelector('b').textContent = cd > 0 ? Math.ceil(cd) : '';
      el.classList.toggle('ready', cd <= 0);
    });
    if (!hero) return;
    const f = hero.dead ? 0 : hero.hp / hero.maxHp;
    $('heroHp').style.width = (f * 100) + '%';
    $('heroLv').textContent = 'Lv' + hero.lv;
    $('heroDead').textContent = hero.dead ? Math.ceil(hero.respawn) : '';
    $('heroBtn').classList.toggle('dead', hero.dead);
    $('skillCd').style.height = (hero.skillCd / hero.spec.skill.cd * 100) + '%';
    $('skillTxt').textContent = hero.skillCd > 0 ? Math.ceil(hero.skillCd) : '';
    $('skillBtn').classList.toggle('ready', hero.skillCd <= 0 && !hero.dead);
  }
  function updatePreview() {
    const el = $('nextWave');
    if (state !== 'play' || (!endless && waveNo >= totalWaves)) { el.classList.remove('show'); return; }
    const list = makeWave(waveNo + 1), agg = {};
    list.forEach(([type, n]) => { agg[type] = (agg[type] || 0) + n; });
    el.innerHTML = '<small>다음</small>' + Object.entries(agg).map(([t, n]) => `<span class="${ENEMIES[t].boss ? 'boss' : ''}${ENEMIES[t].air ? ' air' : ''}">${ENEMIES[t].icon}${n > 1 ? '<i>×' + n + '</i>' : ''}</span>`).join('');
    el.classList.add('show');
  }
  let introTimer = 0;
  function showIntro(text) { const el = $('intro'); el.textContent = text; el.classList.add('show'); clearTimeout(introTimer); introTimer = setTimeout(() => el.classList.remove('show'), 3800); }
  function showBanner(text) { const el = $('banner'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); }
  const popsEl = $('pops');
  function popDmg(p, n) {
    if (popsEl.childElementCount > 24) return;
    const v = p.clone(); v.y += 0.9; v.x += (Math.random() - 0.5) * 0.4; v.project(camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'pop dmg' + (n >= 80 ? ' big' : ''); el.textContent = Math.round(n);
    el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
    popsEl.appendChild(el); setTimeout(() => el.remove(), 700);
  }
  function popAt(p, text, red) {
    if (popsEl.childElementCount > 30) return;
    const v = p.clone(); v.y = Math.max(v.y, 0.6); v.project(camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'pop' + (red ? ' red' : ''); el.textContent = text;
    el.style.left = ((v.x + 1) / 2 * window.innerWidth) + 'px'; el.style.top = ((1 - v.y) / 2 * window.innerHeight) + 'px';
    popsEl.appendChild(el); setTimeout(() => el.remove(), 1000);
  }

  // =====================================================================
  // 튜토리얼
  // =====================================================================
  let tut = null;
  const tutMark = new T.Mesh(G.ring, new T.MeshBasicMaterial({ color: 0xffd84d, transparent: true, opacity: 0.9, depthWrite: false }));
  tutMark.visible = false; scene.add(tutMark);
  const elPoint = id => { const el = $(id); if (!el || el.offsetParent === null) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top - 4 }; };
  const worldPoint = p => { const v = p.clone().setY(0.9).project(camera); return v.z > 1 ? null : { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight - 10 }; };
  const TUT = [
    { text: '① 반짝이는 칸을 눌러 <b>장난감</b>을 세워요', target: () => worldPoint(toW(tut.tile[0], tut.tile[1])), done: () => towers.length >= 1, mark: true },
    { text: '② <b>웨이브 시작</b>을 눌러 괴물을 불러요', target: () => elPoint('waveBtn'), done: () => waveNo >= 1 },
    { text: '③ 동전이 모이면 장난감을 더 세우거나, 장난감을 눌러 <b>강화</b>해요', target: () => towers[0] ? worldPoint(towers[0].pos) : null, done: () => towers.length >= 3 || towers.some(t => t.lv >= 2), max: 30 },
    { text: '④ 위급할 땐 <b>선생님 스킬</b>! 📏는 모든 괴물을 잠깐 멈춰요', target: () => elPoint('tQuiet'), done: () => !!teacherUsed.quiet, max: 8 },
    { text: '⑤ 영웅은 🤖<b>자동</b>으로 싸워요. 영웅 버튼을 누르고 땅을 누르면 직접 움직여요', target: () => elPoint('heroBtn'), done: () => false, max: 8 }
  ];
  function startTut() {
    let best = null;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW / 2; x++) {
      const k = x + ',' + y; if (pathTiles.has(k) || blockTiles.has(k)) continue;
      let c = 0; pathTiles.forEach(pk => { const [px, py] = pk.split(',').map(Number); if ((px - x) ** 2 + (py - y) ** 2 <= 6.25) c++; });
      if (!best || c > best[0]) best = [c, x, y];
    }
    tut = { i: 0, t: 0, tile: [best[1], best[2]] };
    $('tut').classList.add('show'); showTutStep();
  }
  function showTutStep() { $('tutText').innerHTML = TUT[tut.i].text; tut.t = 0; sfx.click(); }
  function stopTut() { tut = null; $('tut').classList.remove('show'); $('finger').classList.remove('show'); tutMark.visible = false; }
  function updateTut(dt) {
    if (!tut || state !== 'play') return;
    const st = TUT[tut.i];
    tut.t += dt;
    if (st.done() || (st.max && tut.t > st.max)) {
      tut.i++;
      if (tut.i >= TUT.length) { prog.tutDone = true; saveProg(); stopTut(); showIntro('준비 끝! 10웨이브를 버텨 봐요 💪'); return; }
      showTutStep(); return;
    }
    const p = st.target(), f = $('finger');
    if (p) { f.style.left = p.x + 'px'; f.style.top = p.y + 'px'; f.classList.add('show'); } else f.classList.remove('show');
    tutMark.visible = !!st.mark;
    if (st.mark) { const w = toW(tut.tile[0], tut.tile[1]); tutMark.position.set(w.x, 0.06, w.z); tutMark.scale.setScalar(0.45 + Math.sin(simT * 6 + tut.t * 6) * 0.05); }
  }
  $('tutSkip').addEventListener('click', () => { prog.tutDone = true; saveProg(); stopTut(); sfx.click(); });

  // =====================================================================
  // 스티커북
  // =====================================================================
  function showStickers() {
    hideOverlays();
    $('stkStars').textContent = starsAvail();
    const box = $('stkList'); box.innerHTML = '';
    TOWER_ORDER.forEach(type => {
      const s = TOWERS[type], own = prog.stk[type] || [], row = document.createElement('div'); row.className = 'stkRow';
      row.innerHTML = `<span class="ic">${s.icon}</span><b>${s.name}</b>`;
      STICKERS.forEach((sk, i) => {
        const b = document.createElement('button'); b.className = 'stk' + (own[i] ? ' own' : '');
        b.innerHTML = own[i] ? `✓<small>${sk.label(type)}</small>` : `⭐${sk.cost}<small>${sk.label(type)}</small>`;
        b.disabled = !own[i] && (starsAvail() < sk.cost || (i > 0 && !own[i - 1]));
        if (!own[i]) b.addEventListener('click', () => { prog.stk[type] = prog.stk[type] || [0, 0, 0]; prog.stk[type][i] = 1; saveProg(); sfx.upgrade(); showStickers(); });
        row.appendChild(b);
      });
      box.appendChild(row);
    });
    $('stickers').classList.add('show');
  }

  // =====================================================================
  // 진행·기록
  // =====================================================================
  let achQueue = [], achShowing = false;
  function unlockAch(id) {
    if (prog.ach[id]) return;
    prog.ach[id] = true; saveProg();
    const a = ACH.find(x => x[0] === id); if (!a) return;
    achQueue.push(a); if (!achShowing) nextAch();
  }
  function nextAch() {
    const a = achQueue.shift(); if (!a) { achShowing = false; return; }
    achShowing = true;
    const el = $('ach'); el.innerHTML = `<span>${a[1]}</span><div><small>업적 달성!</small><b>${a[2]}</b></div>`;
    el.classList.add('show'); sfx.levelUp();
    setTimeout(() => { el.classList.remove('show'); setTimeout(nextAch, 400); }, 2600);
  }
  const totalStars = () => Object.values(prog.stars).reduce((a, m) => a + Object.values(m).reduce((x, y) => x + y, 0), 0);
  const spentStars = () => Object.values(prog.stk).reduce((a, arr) => a + arr.reduce((x, y, i) => x + (y ? STICKERS[i].cost : 0), 0), 0);
  const starsAvail = () => totalStars() + (prog.bonus || 0) - spentStars();
  const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  function dailyInfo() {
    const d = new Date(), n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    const open = MAPS.map((m, i) => i).filter(i => i === 0 || prog.cleared[MAPS[i - 1].id]);
    const keys = Object.keys(RULES);
    return { mapI: open[n % open.length], rule: keys[(n * 7 + 3) % keys.length], done: !!prog.daily[todayKey()] };
  }
  function finish(win) {
    state = 'over'; closeSheets(); music.setBoss(false);
    store.del('recess.save');
    if (tut) { prog.tutDone = true; saveProg(); }
    stopTut();
    let stars = 0, extra = '';
    if (hero) {
      const before = heroRank(hero.id);
      const gain = Math.max(1, Math.round(hero.earned * 0.1));
      prog.hxp[hero.id] = (prog.hxp[hero.id] || 0) + gain;
      const after = heroRank(hero.id);
      extra += `<br>${hero.spec.icon} 영웅 경험 +${gain}${after > before ? ` · <b>랭크 ${after} 달성!</b>` : ''}`;
      saveProg();
    }
    if (win) stars = lives >= 18 ? 3 : lives >= 10 ? 2 : 1;
    if (win && daily) {
      if (!prog.daily[todayKey()]) { prog.daily[todayKey()] = true; prog.bonus = (prog.bonus || 0) + 2; extra += '<br>📅 오늘의 도전 성공! <b>보너스 별 +2</b>'; }
      else extra += '<br>📅 오늘의 도전은 이미 깼어요';
      saveProg();
    }
    lastRes = { win, stars, endless, daily, wave: endless ? waveNo - 1 : waveNo, lives, level: LV().name, hero: hero ? `${hero.spec.icon} ${hero.spec.name} Lv${hero.lv}` : '', rule: rule ? RULES[rule].icon + RULES[rule].name : '', cards: runMods.picked.join('') };
    if (win && !daily) {
      const m = prog.stars[MAP.id] || (prog.stars[MAP.id] = {});
      m[opt.level] = Math.max(m[opt.level] || 0, stars);
      prog.cleared[MAP.id] = true; saveProg();
      unlockAch('firstWin'); if (lives >= 20) unlockAch('perfect'); if (opt.level === 'hard') unlockAch('hard');
      if (MAPS.every(mm => prog.cleared[mm.id])) unlockAch('allMaps');
      if (totalStars() >= 15) unlockAch('stars15');
    }
    const next = win && !daily && mapIdx < MAPS.length - 1;
    $('resEmoji').textContent = endless ? '♾️' : win ? (stars === 3 ? '🏆' : '🎉') : '😢';
    $('resTitle').textContent = endless ? `${waveNo - 1}웨이브 버텼어요!` : win ? `${MAP.short}${((MAP.short.charCodeAt(MAP.short.length - 1) - 0xac00) % 28) ? '을' : '를'} 지켰어요!` : '간식을 다 빼앗겼어요…';
    $('resStars').innerHTML = win ? [0, 1, 2].map(i => `<span class="st${i < stars ? ' on' : ''}" style="animation-delay:${1.0 + i * 0.4}s">★</span>`).join('') : '';
    if (win) {
      for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 1700 + i * 400);
      const cf = $('confetti'); cf.innerHTML = '';
      for (let i = 0; i < 46; i++) {
        const d = document.createElement('i');
        d.style.left = Math.random() * 100 + '%'; d.style.background = ['#ff5a7a', '#ffd84d', '#5fd36b', '#4fa3ff', '#b07ae0'][i % 5];
        d.style.animationDelay = (0.7 + Math.random() * 1.2) + 's'; d.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
        d.style.transform = `rotate(${Math.random() * 360}deg)`; cf.appendChild(d);
      }
      setTimeout(() => sfx.cheer(), 700);
    } else {
      $('confetti').innerHTML = '';
      if (!endless && baseBox) {
        let tt = 0; const bx = baseBox;
        ambient.push(dt => { if (tt > 1.2) return; tt += dt; bx.rotation.z = Math.min(1, tt / 0.5) * 1.35; bx.position.x = Math.min(1, tt / 0.5) * 0.45; });
        puff(baseWorld(), 0xff7aa0, 14); puff(baseWorld(), 0x7cc8ff, 10);
      }
    }
    $('resMsg').innerHTML = endless
      ? `무한 모드 · ${MAP.short}<br>최고 기록 <b>${prog.endless[MAP.id] || 0}웨이브</b>`
      : win ? `남은 목숨 <b>${lives}</b> · 난이도 ${LV().name}<br>${stars < 3 ? '목숨 18개 이상 남기면 ★3개!' : '완벽한 수비였어요!'}${next ? `<br>🔓 <b>${MAPS[mapIdx + 1].name}</b> 열림!` : mapIdx === MAPS.length - 1 ? '<br>🎊 모든 수업 끝! <b>무한 모드</b>가 열렸어요' : ''}`
      : `${waveNo}웨이브에서 무너졌어요.<br>장난감을 강화하고, 영웅과 선생님 스킬도 써 보세요!`;
    $('resMsg').innerHTML += extra;
    $('btnNext').classList.toggle('hidden', !next);
    win ? sfx.win() : (endless ? sfx.win() : sfx.lose());
    $('bossBar').classList.remove('show'); $('nextWave').classList.remove('show');
    setTimeout(() => $('result').classList.add('show'), 700);
  }
  // ----- 무한 모드 카드 고르기 -----
  function showCards() {
    paused = true;
    const pool = CARDS.filter(c => !(c.id === 'hero' && !hero)), pick = [];
    while (pick.length < 3) { const c = pool[Math.floor(Math.random() * pool.length)]; if (!pick.includes(c)) pick.push(c); }
    const box = $('cardList'); box.innerHTML = '';
    pick.forEach((c, i) => {
      const b = document.createElement('button'); b.className = 'card'; b.style.animationDelay = (i * 0.12) + 's';
      b.innerHTML = `<span>${c.icon}</span><b>${c.name}</b><small>${c.desc}</small>`;
      b.addEventListener('click', () => {
        c.apply(runMods); runMods.picked.push(c.icon);
        towers.forEach(t => { t.s = towerStats(t.type, t.lv, t.br); });
        $('cards').classList.remove('show'); paused = false; sfx.upgrade(); updateHud(); saveGame();
        showIntro(`${c.icon} ${c.name}! (${runMods.picked.join('')})`);
      });
      box.appendChild(b);
    });
    $('cards').classList.add('show'); sfx.star(1);
  }
  // ----- 기록 카드 이미지 -----
  function recordCard() {
    const r = lastRes || {}, c = document.createElement('canvas'); c.width = 800; c.height = 450;
    const g = c.getContext('2d'), th = THEMES[MAP.theme];
    const gr = g.createLinearGradient(0, 0, 0, 450); gr.addColorStop(0, th.sky[0]); gr.addColorStop(1, th.sky[1]); g.fillStyle = gr; g.fillRect(0, 0, 800, 450);
    const rr = (x, y, w, h, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
    g.fillStyle = '#2a1a10'; rr(46, 52, 716, 370, 26); g.fill();
    g.fillStyle = '#fffdf6'; rr(40, 40, 716, 370, 26); g.fill(); g.lineWidth = 5; g.strokeStyle = '#2a1a10'; g.stroke();
    g.strokeStyle = '#dce9f7'; g.lineWidth = 2; for (let y = 96; y < 400; y += 34) { g.beginPath(); g.moveTo(60, y); g.lineTo(736, y); g.stroke(); }
    for (let x = 70; x < 730; x += 30) { g.beginPath(); g.arc(x, 56, 5, 0, Math.PI * 2); g.fillStyle = '#2a1a10'; g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '54px Jua, sans-serif'; g.lineWidth = 8; g.strokeStyle = '#2a1a10'; g.strokeText('쉬는시간 수비대', 400, 118); g.fillStyle = '#3fae5c'; g.fillText('쉬는시간 수비대', 400, 118);
    g.fillStyle = '#2a1a10'; g.font = '30px Jua, sans-serif';
    g.fillText(`${MAP.name}${r.endless ? ' · ♾️ 무한 모드' : r.daily ? ' · 📅 오늘의 도전' : ''}`, 400, 178);
    g.font = '58px Jua, sans-serif'; g.fillStyle = r.win || r.endless ? '#e0a422' : '#e2584c';
    g.fillText(r.endless ? `${r.wave}웨이브 버팀!` : r.win ? `승리! ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}` : `${r.wave}웨이브에서 아쉽게…`, 400, 250);
    g.fillStyle = '#4a2e1e'; g.font = '26px Jua, sans-serif';
    g.fillText(`남은 목숨 ${r.lives} · 난이도 ${r.level}${r.hero ? ` · ${r.hero}` : ''}${r.rule ? ` · ${r.rule}` : ''}`, 400, 312);
    if (r.cards) g.fillText(`고른 카드 ${r.cards}`, 400, 350);
    g.fillStyle = '#8a6a4a'; g.font = '20px Jua, sans-serif'; g.fillText(`${new Date().toLocaleDateString('ko-KR')} · 쉬는시간 오락실 smile-willow.tistory.com`, 400, 388);
    return c;
  }
  $('btnShot').addEventListener('click', () => {
    try {
      const a = document.createElement('a'); a.download = 'recess-record.png'; a.href = recordCard().toDataURL('image/png');
      document.body.appendChild(a); a.click(); a.remove(); sfx.coins();
    } catch (e) { showIntro('이미지를 저장하지 못했어요'); }
  });
  // ----- 자동 저장 -----
  function saveGame() {
    const data = { map: mapIdx, level: opt.level, hero: hero ? hero.id : opt.hero, endless, waveNo, money, lives, rule, daily, mods: runMods,
                   towers: towers.map(t => [t.type, t.gx, t.gy, t.lv, t.br, t.spent]), hlv: hero ? hero.lv : 1, hxp: hero ? hero.xp : 0, hearn: hero ? hero.earned : 0 };
    store.set('recess.save', JSON.stringify(data));
  }
  function loadSave() { return loadJ('recess.save', null); }
  function continueGame() {
    const d = loadSave(); if (!d) return;
    opt.level = d.level; opt.hero = d.hero; saveOpt();
    rule = d.rule || null; daily = !!d.daily;
    startMap(d.map, d.endless, true);
    runMods = Object.assign(freshMods(), d.mods || {});
    money = d.money; lives = d.lives; waveNo = d.waveNo;
    for (let i = 1; i <= waveNo; i++) roundCleared[i] = true;
    d.towers.forEach(([type, gx, gy, lv, br, spent]) => { const t = placeTower(type, gx, gy, true, lv, br); if (t) { t.spent = spent; t.grow = 1; t.m.scale.setScalar(1); } });
    if (hero) { hero.lv = d.hlv; hero.xp = d.hxp; hero.earned = d.hearn || 0; hero.maxHp = Math.round(hero.spec.hp * heroMul()); hero.hp = hero.maxHp; }
    updateHud();
    showIntro(`💾 ${waveNo}웨이브까지 저장된 판을 이어서 해요`);
  }

  // =====================================================================
  // 소리·음악
  // =====================================================================
  let ac = null, sndBudget = 0, sfxBus = null, noiseBuf = null;
  const volOf = k => Math.max(0, Math.min(100, +opt[k])) / 100;
  function ensureAudio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
      if (ac) {
        sfxBus = ac.createGain(); sfxBus.connect(ac.destination); applyVolume();
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    music.ensure();
  }
  function applyVolume() {
    if (sfxBus) sfxBus.gain.value = opt.sound === 'on' ? volOf('sfxVol') * 1.1 : 0;
    music.setVol(opt.music === 'on' ? volOf('musVol') : 0);
  }
  // 노이즈: 바스락·쿵·휙 같은 질감
  function noise(d, vol, f0, f1, type = 'lowpass', delay = 0, q = 1) {
    if (!ac || !noiseBuf || opt.sound !== 'on') return;
    const t = ac.currentTime + delay, src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.playbackRate.value = 0.7 + Math.random() * 0.6;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(fl).connect(g).connect(sfxBus); src.start(t, Math.random() * 0.5); src.stop(t + d + 0.05);
  }
  function tone(f, d, type = 'sine', vol = 0.12, slide = 0, delay = 0, dest) {
    if (!ac) return;
    if (!dest && opt.sound !== 'on') return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(dest || sfxBus || ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  const limited = fn => { if (sndBudget > 10) return; sndBudget++; fn(); };
  const sfx = {
    click: () => tone(800, 0.04, 'sine', 0.06),
    build: () => { tone(523, 0.08, 'triangle', 0.14); tone(784, 0.12, 'triangle', 0.14, 0, 0.07); },
    upgrade: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, 'triangle', 0.13, 0, i * 0.05)); },
    sell: () => tone(660, 0.12, 'triangle', 0.12, 440),
    sling: () => limited(() => { tone(900, 0.05, 'square', 0.025, 500); noise(0.06, 0.05, 3000, 1200, 'bandpass', 0, 2); }),
    water: () => limited(() => { tone(1400, 0.08, 'sine', 0.03, 600); noise(0.12, 0.05, 2500, 5000, 'highpass'); }),
    top: () => limited(() => { tone(300, 0.15, 'sawtooth', 0.03, 600); noise(0.18, 0.06, 600, 2400, 'bandpass', 0, 3); }),
    launch: () => limited(() => { tone(260, 0.12, 'triangle', 0.06, 520); noise(0.16, 0.06, 500, 2500, 'bandpass', 0, 2); }),
    boom: big => limited(() => { tone(120, 0.25, 'sawtooth', 0.1, 50); tone(70, big ? 0.4 : 0.25, 'sine', 0.22, 35); noise(big ? 0.5 : 0.3, big ? 0.35 : 0.22, 1400, 180, 'lowpass'); }),
    pop: type => limited(() => { tone(type === 'knight' || type === 'milk' ? 300 : 700 + Math.random() * 300, 0.07, 'triangle', 0.06, type === 'knight' ? 150 : 1200); noise(0.08, 0.07, 1800, 600, 'bandpass', 0, 1.5); }),
    popBalloon: () => limited(() => { tone(1800, 0.05, 'square', 0.05, 300); noise(0.12, 0.2, 4000, 800, 'highpass'); }),
    tack: () => limited(() => tone(1600, 0.06, 'square', 0.05, 2400)),
    foam: () => { tone(400, 0.5, 'sawtooth', 0.04, 150); },
    leak: () => tone(220, 0.25, 'square', 0.08, 140),
    bell: () => [784, 659, 523].forEach((f, i) => tone(f, 0.5, 'sine', 0.14, 0, i * 0.32)),
    // 학교 종 (웨스트민스터 차임 앞 소절)
    chime: () => [659, 523, 587, 392].forEach((f, i) => { tone(f, 0.9, 'sine', 0.12, 0, i * 0.42); tone(f * 2.76, 0.4, 'sine', 0.025, 0, i * 0.42); }),
    bossIntro: () => { noise(0.35, 0.35, 900, 120, 'lowpass'); tone(65, 0.5, 'sine', 0.25, 40); [110, 104, 98].forEach((f, i) => tone(f, 0.45, 'sawtooth', 0.09, 0, 0.35 + i * 0.3)); },
    star: i => { tone([1047, 1319, 1568][i], 0.3, 'triangle', 0.15); tone([1047, 1319, 1568][i] * 1.5, 0.3, 'sine', 0.05); noise(0.2, 0.05, 6000, 0, 'highpass'); },
    cheer: () => { for (let i = 0; i < 6; i++) noise(0.9, 0.06, 900 + i * 260, 1800 + i * 200, 'bandpass', i * 0.07, 4); [523, 659, 784].forEach(f => tone(f, 0.8, 'triangle', 0.06, 0, 0.1)); },
    clear: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, 0, i * 0.08)),
    boss: () => { tone(110, 0.6, 'sawtooth', 0.12, 80); tone(147, 0.6, 'sawtooth', 0.08, 110, 0.15); },
    coins: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.08, 'square', 0.05, 0, i * 0.06)),
    levelUp: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.12, 0, i * 0.06)),
    heroDown: () => tone(440, 0.3, 'triangle', 0.14, 220),
    whack: () => limited(() => { tone(500, 0.06, 'square', 0.04, 260); noise(0.07, 0.1, 1200, 400, 'bandpass', 0, 1); }),
    throwBall: () => limited(() => tone(600, 0.06, 'sine', 0.06, 900)),
    shout: () => { tone(330, 0.35, 'sawtooth', 0.08, 300); tone(495, 0.35, 'square', 0.04, 450); noise(0.3, 0.06, 900, 600, 'bandpass', 0, 2); },
    shoot: () => { tone(200, 0.2, 'sawtooth', 0.1, 900); noise(0.25, 0.12, 400, 3000, 'bandpass', 0, 1.5); },
    rainbow: () => [523, 659, 784, 988, 1175, 1319].forEach((f, i) => tone(f, 0.16, 'sine', 0.1, 0, i * 0.05)),
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.22, 'triangle', 0.15, 0, i * 0.13)),
    lose: () => { [523, 440, 349, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.13, 0, i * 0.15)); noise(0.6, 0.12, 2000, 300, 'lowpass', 0.3); }
  };
  // 오리지널 배경 음악 (코드로 연주) — 맵마다 1곡 + 보스 곡
  const music = (() => {
    let gain = null, timer = 0, step = 0, nextT = 0, boss = false, track = 0, vol = 0.5;
    const N = n => 440 * Math.pow(2, (n - 69) / 12);
    const TRACKS = [
      { mel: [72, 0, 76, 0, 79, 0, 76, 74, 72, 0, 74, 76, 74, 0, 0, 0, 72, 0, 76, 0, 79, 0, 81, 79, 77, 0, 76, 74, 72, 0, 0, 0],
        bass: [48, 0, 55, 0, 48, 0, 55, 0, 53, 0, 60, 0, 55, 0, 50, 0, 48, 0, 55, 0, 53, 0, 57, 0, 55, 0, 50, 0, 48, 0, 43, 0], bpm: 132, inst: 'square', v: 0.035 },
      { mel: [67, 0, 71, 0, 74, 0, 71, 0, 72, 0, 76, 0, 74, 0, 0, 0, 71, 0, 74, 0, 79, 0, 78, 76, 74, 0, 72, 71, 69, 0, 67, 0],
        bass: [43, 0, 50, 0, 43, 0, 50, 0, 48, 0, 55, 0, 50, 0, 45, 0, 43, 0, 50, 0, 47, 0, 52, 0, 50, 0, 45, 0, 43, 0, 38, 0], bpm: 120, inst: 'triangle', v: 0.06 },
      { mel: [69, 0, 72, 74, 76, 0, 74, 72, 74, 0, 0, 0, 72, 0, 69, 0, 67, 0, 69, 72, 74, 0, 72, 69, 72, 0, 0, 0, 69, 0, 0, 0],
        bass: [45, 0, 45, 0, 52, 0, 45, 0, 50, 0, 50, 0, 48, 0, 45, 0, 43, 0, 43, 0, 50, 0, 43, 0, 45, 0, 45, 0, 52, 0, 45, 0], bpm: 112, inst: 'sine', v: 0.07, echo: true },
      { mel: [74, 0, 74, 76, 78, 0, 74, 0, 81, 0, 78, 0, 76, 0, 74, 0, 71, 0, 73, 74, 76, 0, 73, 0, 74, 0, 0, 0, 78, 76, 74, 0],
        bass: [50, 0, 57, 0, 50, 0, 57, 0, 55, 0, 59, 0, 57, 0, 54, 0, 47, 0, 54, 0, 45, 0, 52, 0, 50, 0, 57, 0, 50, 0, 45, 0], bpm: 150, inst: 'square', v: 0.03 },
      { mel: [77, 0, 76, 0, 74, 0, 72, 0, 74, 0, 76, 0, 77, 0, 0, 0, 72, 0, 74, 0, 76, 0, 79, 77, 76, 0, 74, 0, 72, 0, 0, 0],
        bass: [41, 0, 48, 0, 45, 0, 48, 0, 46, 0, 53, 0, 48, 0, 41, 0, 46, 0, 50, 0, 48, 0, 52, 0, 48, 0, 43, 0, 41, 0, 48, 0], bpm: 104, inst: 'triangle', v: 0.065 }
    ];
    const BOSS = {
      mel: [69, 72, 76, 72, 69, 72, 76, 77, 76, 72, 69, 0, 68, 71, 74, 71, 69, 72, 76, 72, 69, 72, 76, 81, 79, 76, 72, 0, 71, 74, 68, 0],
      bass: [45, 0, 45, 0, 45, 0, 45, 0, 41, 0, 41, 0, 40, 0, 40, 0, 45, 0, 45, 0, 45, 0, 45, 0, 43, 0, 43, 0, 40, 0, 40, 0], bpm: 158, inst: 'square', v: 0.035
    };
    function ensure() {
      if (!ac || gain) return;
      gain = ac.createGain(); gain.gain.value = vol; gain.connect(ac.destination);
      nextT = ac.currentTime + 0.1;
      timer = setInterval(tick, 60);
    }
    function tick() {
      if (!ac || !gain) return;
      if (state !== 'play' || paused || vol <= 0) { nextT = ac.currentTime + 0.1; return; }
      const S = boss ? BOSS : TRACKS[track] || TRACKS[0], dur = 60 / S.bpm / 2;
      while (nextT < ac.currentTime + 0.25) {
        const i = step % 32, m = S.mel[i], b = S.bass[i], dt = Math.max(0, nextT - ac.currentTime);
        if (m) { tone(N(m), dur * 0.9, S.inst, S.v, 0, dt, gain); if (S.echo) tone(N(m), dur * 0.9, S.inst, S.v * 0.35, 0, dt + dur * 1.5, gain); }
        if (b) tone(N(b), dur * 1.6, 'triangle', 0.09, 0, dt, gain);
        if (i % 4 === 0) tone(boss ? 90 : 70, 0.06, 'sine', 0.12, 40, dt, gain);
        if (i % 4 === 2) tone(4000, 0.02, 'square', 0.012, 0, dt, gain);
        step++; nextT += dur;
      }
    }
    return {
      ensure,
      setBoss(on) { if (boss !== on) { boss = on; step = 0; } },
      setTrack(k) { if (track !== k) { track = k; step = 0; } },
      setVol(v) { vol = v; if (gain) gain.gain.value = v; },
      setOn(on) { applyVolume(); }
    };
  })();

  // =====================================================================
  // 화질
  // =====================================================================
  let autoLevel = 'mid', fpsAcc = 0, fpsN = 0, fpsCheck = 0, appliedQ = null;
  const qualityLevel = () => opt.quality === 'auto' ? autoLevel : opt.quality;
  function applyQuality() {
    const q = qualityLevel();
    if (q === appliedQ) return;
    appliedQ = q;
    outlineMat.visible = q === 'high';
    const dpr = window.devicePixelRatio || 1;
    renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 0.85) : q === 'mid' ? Math.min(dpr, 1.5) : Math.min(dpr, 2.2));
    const sh = q !== 'low';
    renderer.shadowMap.enabled = sh; sun.castShadow = sh;
    sun.shadow.mapSize.set(q === 'high' ? 2048 : 1024, q === 'high' ? 2048 : 1024);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
    resize();
  }
  function autoTune(dtReal) {
    if (opt.quality !== 'auto' || state !== 'play') return;
    fpsAcc += dtReal; fpsN++; fpsCheck += dtReal;
    if (fpsCheck < 3) return;
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsCheck = 0;
    if (fps < 38 && autoLevel !== 'low') { autoLevel = autoLevel === 'high' ? 'mid' : 'low'; applyQuality(); }
  }
  const defaultAuto = () => (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || Math.min(window.innerWidth, window.innerHeight) < 600) ? 'mid' : 'high';

  // =====================================================================
  // 루프
  // =====================================================================
  function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  let lastT = performance.now(), uiT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dtReal = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    sndBudget = Math.max(0, sndBudget - dtReal * 30);
    if (hitStop > 0) hitStop -= dtReal;
    else if (state === 'play' && !paused) { const ts = slowT > 0 ? 0.3 : 1; for (let i = 0; i < speed; i++) update(Math.min(0.05, dtReal) * ts); }
    if (slowT > 0) slowT -= dtReal;
    if (shake > 0) shake = Math.max(0, shake - dtReal);
    if (baseBox) baseBox.rotation.y = Math.sin(now / 900) * 0.08;
    autoTune(dtReal);
    uiT += dtReal; if (state === 'play' && uiT > 0.1) { uiT = 0; updateLiveUI(); }
    if (tut) updateTut(dtReal);
    preview.children.forEach(m => { m.position.y = 0.05 + Math.sin(now / 200) * 0.03; });
    const tSec = now / 1000;
    for (const f of ambient) f(dtReal, tSec);
    applyCamera(dtReal);
    if (qualityLevel() === 'high' && post.ok) post.render(); else renderer.render(scene, camera);
  }

  // =====================================================================
  // 메뉴
  // =====================================================================
  function syncSegs() {
    document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === opt[seg.dataset.key])));
    const H = HEROES[opt.hero] || HEROES.minjun, rk = heroRank(opt.hero), xp = prog.hxp[opt.hero] || 0;
    $('heroDesc').innerHTML = `${H.icon} <b>${H.name}</b>: ${H.desc}<br>필살기 ${H.skill.icon} <b>${H.skill.name}</b>: ${H.skill.desc}` +
      `<br>랭크 <b style="color:#d99a00">${'★'.repeat(rk)}${'☆'.repeat(5 - rk)}</b>${rk < 5 ? ` · 다음 랭크까지 경험 ${HERO_RANK[rk] - xp}` : ' · 최고 랭크!'} · 시작 Lv${heroStartLv(opt.hero)}`;
    const hc = $('heroColors'); hc.innerHTML = '<span>옷 색</span>';
    HERO_COLORS[opt.hero].forEach((c, i) => {
      const b = document.createElement('button'), ok = rk >= COLOR_RANK[i];
      b.style.background = '#' + c.toString(16).padStart(6, '0'); b.className = (heroColorIdx(opt.hero) === i ? 'on' : '') + (ok ? '' : ' lock');
      b.title = ok ? '' : `랭크 ${COLOR_RANK[i]}에 열려요`; if (!ok) b.textContent = '🔒';
      b.addEventListener('click', () => { if (!ok) { showIntro(`랭크 ${COLOR_RANK[i]}이 되면 열려요`); return; } opt.heroColor = Object.assign({}, opt.heroColor, { [opt.hero]: i }); saveOpt(); sfx.click(); syncSegs(); });
      hc.appendChild(b);
    });
    $('btnContinue').classList.toggle('hidden', !loadSave());
    const di = dailyInfo();
    $('btnDaily').innerHTML = `📅 오늘의 도전 <small>${MAPS[di.mapI].short} · ${RULES[di.rule].icon} ${RULES[di.rule].name}${di.done ? ' · 완료 ✓' : ' · 보너스 별 +2'}</small>`;
    $('btnStickers').innerHTML = `📒 스티커북 <small>쓸 수 있는 별 ⭐${starsAvail()}</small>`;
    $('volSfx').value = opt.sfxVol; $('volMus').value = opt.musVol;
    $('vSfxT').textContent = opt.sound === 'on' ? opt.sfxVol : '끔'; $('vMusT').textContent = opt.music === 'on' ? opt.musVol : '끔';
  }
  document.querySelectorAll('.seg').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    opt[seg.dataset.key] = b.dataset.v; saveOpt(); ensureAudio(); sfx.click(); syncSegs();
    if (seg.dataset.key === 'quality') { if (opt.quality === 'auto') autoLevel = defaultAuto(); appliedQ = null; applyQuality(); }
    if (seg.dataset.key === 'music' || seg.dataset.key === 'sound') applyVolume();
  }));
  const hideOverlays = () => ['menu', 'maps', 'codex', 'result', 'pause', 'stickers', 'cards'].forEach(id => $(id).classList.remove('show'));
  function startMap(k, isEndless, fromSave, dailyRule) {
    ensureAudio();
    hideOverlays(); stopTut();
    if (!fromSave) { store.del('recess.save'); rule = dailyRule || null; daily = !!dailyRule; }
    endless = !!isEndless; totalWaves = 10;
    buildMap(k); music.setTrack(k);
    resetGame(); fitCamera();
    appliedQ = null; applyQuality();
    state = 'play';
    if (!fromSave) showIntro(`${MAP.name} · ${rule ? `📅 오늘의 도전: ${RULES[rule].icon} ${RULES[rule].desc}` : MAP.desc}${endless ? ' · ♾️ 무한 모드' : ''}`);
    if (!fromSave && k === 0 && !endless && !rule && !prog.tutDone && !prog.cleared.class) startTut();
  }
  function showMaps() {
    hideOverlays();
    const box = $('mapList'); box.innerHTML = '';
    MAPS.forEach((m, i) => {
      const open = i === 0 || prog.cleared[MAPS[i - 1].id];
      const st = prog.stars[m.id] || {};
      const b = document.createElement('button'); b.className = 'mapc' + (open ? '' : ' lock');
      const starTxt = ['easy', 'normal', 'hard'].map(lv => `${LEVELS[lv].name[0]}${'★'.repeat(st[lv] || 0)}${'☆'.repeat(3 - (st[lv] || 0))}`).join(' ');
      b.innerHTML = `<b>${open ? '' : '🔒 '}${m.name}</b><small>${m.desc} · 보스 ${ENEMIES[m.boss].icon}</small><span>${starTxt}</span>`;
      if (open) b.addEventListener('click', () => startMap(i, false));
      box.appendChild(b);
    });
    const allDone = MAPS.every(m => prog.cleared[m.id]);
    const eb = $('endlessBox'); eb.innerHTML = '';
    if (allDone) {
      MAPS.forEach((m, i) => {
        const b = document.createElement('button'); b.className = 'endb';
        b.innerHTML = `♾️ ${m.short}<small>최고 ${prog.endless[m.id] || 0}웨이브</small>`;
        b.addEventListener('click', () => startMap(i, true));
        eb.appendChild(b);
      });
    } else eb.innerHTML = '<p class="sub" style="font-size:13px;color:#8a6a4a">🔒 5교시까지 모두 깨면 무한 모드가 열려요</p>';
    $('maps').classList.add('show');
  }
  function showCodex(tab) {
    hideOverlays();
    document.querySelectorAll('#codexTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    const box = $('codexBody'); box.innerHTML = '';
    if (tab === 'enemy') {
      CODEX_ENEMIES.forEach(id => {
        const s = ENEMIES[id], seen = prog.seen[id];
        const d = document.createElement('div'); d.className = 'cx' + (seen ? '' : ' lock');
        d.innerHTML = seen ? `<span>${s.icon}</span><div><b>${s.name}${s.boss ? ' · 보스' : ''}</b><small>${s.desc}<br>체력 ${s.hp} · 속도 ${s.speed}${s.armor ? ` · 갑옷 ${s.armor}` : ''}${s.air ? ' · 하늘' : ''}</small></div>` : `<span>❔</span><div><b>???</b><small>아직 만나지 못했어요</small></div>`;
        box.appendChild(d);
      });
    } else if (tab === 'tower') {
      TOWER_ORDER.forEach(id => {
        const s = TOWERS[id];
        const d = document.createElement('div'); d.className = 'cx';
        d.innerHTML = `<span>${s.icon}</span><div><b>${s.name} · 🪙${s.cost}</b><small>${s.desc}<br>${s.A.icon} <b>${s.A.name}</b>: ${s.A.desc}<br>${s.B.icon} <b>${s.B.name}</b>: ${s.B.desc}</small></div>`;
        box.appendChild(d);
      });
      Object.values(HEROES).forEach(h => {
        const d = document.createElement('div'); d.className = 'cx';
        d.innerHTML = `<span>${h.icon}</span><div><b>${h.name} · 영웅</b><small>${h.desc}<br>필살기 ${h.skill.icon} <b>${h.skill.name}</b>: ${h.skill.desc}</small></div>`;
        box.appendChild(d);
      });
    } else {
      const n = ACH.filter(a => prog.ach[a[0]]).length;
      const head = document.createElement('p'); head.className = 'sub'; head.innerHTML = `업적 <b>${n}</b> / ${ACH.length} · 모은 별 <b>${totalStars()}</b>개`; box.appendChild(head);
      ACH.forEach(([id, ic, nm, ds]) => {
        const d = document.createElement('div'); d.className = 'cx' + (prog.ach[id] ? '' : ' lock');
        d.innerHTML = `<span>${prog.ach[id] ? ic : '🔒'}</span><div><b>${nm}</b><small>${ds}</small></div>`;
        box.appendChild(d);
      });
    }
    $('codex').classList.add('show');
  }
  document.querySelectorAll('#codexTabs button').forEach(b => b.addEventListener('click', () => { sfx.click(); showCodex(b.dataset.tab); }));

  const toMenu = () => {
    state = 'menu'; hideOverlays(); clearWorld(); closeSheets(); music.setBoss(false); stopTut();
    $('bossBar').classList.remove('show'); $('nextWave').classList.remove('show');
    buildMap(0); fitCamera(); syncSegs(); $('menu').classList.add('show');
  };
  $('btnStart').addEventListener('click', () => { ensureAudio(); sfx.click(); showMaps(); });
  $('btnDaily').addEventListener('click', () => { ensureAudio(); const di = dailyInfo(); startMap(di.mapI, false, false, di.rule); });
  $('btnStickers').addEventListener('click', () => { ensureAudio(); sfx.click(); showStickers(); });
  $('stkBack').addEventListener('click', () => toMenu());
  [['volSfx', 'sfxVol', 'sound'], ['volMus', 'musVol', 'music']].forEach(([id, k, onk]) => $(id).addEventListener('input', e => {
    opt[k] = +e.target.value; opt[onk] = opt[k] > 0 ? 'on' : 'off'; saveOpt(); ensureAudio(); applyVolume(); syncSegs();
  }));
  $('volSfx').addEventListener('change', () => sfx.coins());
  $('btnContinue').addEventListener('click', () => { ensureAudio(); continueGame(); });
  $('btnCodex').addEventListener('click', () => { ensureAudio(); sfx.click(); showCodex('enemy'); });
  $('mapsBack').addEventListener('click', toMenu);
  $('codexBack').addEventListener('click', toMenu);
  $('btnAgain').addEventListener('click', () => startMap(mapIdx, endless, false, daily ? rule : null));
  $('btnNext').addEventListener('click', () => startMap(mapIdx + 1, false));
  $('btnRestart').addEventListener('click', () => startMap(mapIdx, endless, false, daily ? rule : null));
  $('btnHome').addEventListener('click', () => { if (state === 'play' && waveNo > 0) saveGame(); toMenu(); });
  $('btnHome2').addEventListener('click', toMenu);
  $('waveBtn').addEventListener('click', () => { callWave(); updateHud(); });
  $('heroBtn').addEventListener('click', () => { if (state !== 'play' || !hero || hero.dead) return; setHeroSel(!heroSel); sfx.click(); });
  $('skillBtn').addEventListener('click', () => heroSkill());
  $('autoBtn').addEventListener('click', () => { setAuto(!isAuto()); if (heroSel) setHeroSel(false); });
  $('tQuiet').addEventListener('click', () => teacherSkill('quiet'));
  $('tChalk').addEventListener('click', () => teacherSkill('chalk'));
  $('tSnack').addEventListener('click', () => teacherSkill('snack'));
  $('btnSpeed').addEventListener('click', () => { speed = speed % 3 + 1; opt.speed = speed; saveOpt(); $('btnSpeed').textContent = speed + '×'; sfx.click(); });
  const pause = () => { if (state !== 'play') return; paused = true; syncSegs(); $('pause').classList.add('show'); };
  $('btnPause').addEventListener('click', pause);
  $('btnMenu').addEventListener('click', pause);
  $('btnResume').addEventListener('click', () => { paused = $('cards').classList.contains('show'); $('pause').classList.remove('show'); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (moveMode) { moveMode = null; rangeRing.visible = rangeDisc.visible = false; return; } if (chalkMode) { chalkMode = false; $('tChalk').classList.remove('aim'); return; } if ($('cards').classList.contains('show')) return; if (paused) { paused = false; $('pause').classList.remove('show'); } else pause(); }
    if (state !== 'play') return;
    const k = e.key.toLowerCase();
    if (e.key === ' ') { e.preventDefault(); callWave(); updateHud(); }
    if (k === 'q') heroSkill();
    if (k === 'h' && hero && !hero.dead) setHeroSel(!heroSel);
    if (k === 't') setAuto(!isAuto());
    if (k === '1') teacherSkill('quiet');
    if (k === '2') teacherSkill('chalk');
    if (k === '3') teacherSkill('snack');
  });
  window.addEventListener('resize', resize);

  // =====================================================================
  // 시작
  // =====================================================================
  buildMap(0);
  autoLevel = defaultAuto();
  syncSegs();
  resize(); applyQuality();
  fitCamera();
  $('loading').style.display = 'none';
  requestAnimationFrame(loop);
})();
