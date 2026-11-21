/* =========================================================================
   프라이 팩토리: 오토 디펜스 — 3D 월드 (Three.js r160)
   가게·주방·컨베이어·탈피대·튀김기·드라이브스루·마당·도로·조명
   ========================================================================= */
import * as THREE from 'three';

export const L = {
  shop: { x0: -9, x1: 9, z0: -11, z1: -0.5, wallH: 3.0 },
  belt: { x: -3, z0: 8.6, z1: -1.5, y: 0.98, w: 1.2 },
  peeler: { x: -3, z: -3.05 },
  fryer: { x: 0.9, z: -3.35, span: 2.5 },
  ready: { x: 4.25, z: -2.0 },
  window: { x: 9, z: -4.65, w: 3.3, y0: 0.95, y1: 2.5 },
  ledge: { x: 10.2, z: -4.65 },
  carStop: { x: 12.4, z: -4.65 },
  road: { x0: 11.55, x1: 16.8 },
  piles: [
    { key: 'normal', x: -6.4, z: 4.6 },
    { key: 'gold', x: 0.4, z: 7.2 },
    { key: 'crystal', x: 6.4, z: 4.4 },
  ],
  hatch: { x: 7.9, z: 8.6 },
  breaker: { x: -9.38, z: -2.6 },
  turret: { x: 7.35, z: -4.65 },
  clerkHome: { x: 1.6, z: -0.4 },
  spawn: { car: { x: 12.6, z: -34 }, walk: { x: 10.95, z: -26 } },
  beltItemY: 1.12,
};

const C = {
  cream: 0xf7e7c8, cream2: 0xfff4dd, red: 0xd8452c, redDark: 0x9e2c17,
  roof: 0xb83a22, metal: 0xc8d0d8, steel: 0x8e979f, darkSteel: 0x5a626b,
  wood: 0xa9763f, woodDark: 0x7a5228, oil: 0xffb02e,
  grass: 0x76b45c, dirt: 0xbf9a63, asphalt: 0x4b4b52, concrete: 0xcfc8bb,
  potato: 0xc98b4b, gold: 0xffc93c, crystal: 0x7fe9ff,
};

const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({
  color, roughness: 0.78, metalness: 0.04,
}, o));

export function buildWorld(THREE_IGNORED, scene) {
  const W = { anim: [], refs: {} };
  const shared = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
    sph: new THREE.SphereGeometry(1, 16, 12),
  };
  const box = (w, h, d, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(shared.box, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  const cyl = (rt, rb, h, mat, x, y, z, parent = scene, seg) => {
    const g = seg ? new THREE.CylinderGeometry(rt, rb, h, seg) : shared.cyl;
    const m = new THREE.Mesh(g, mat);
    if (!seg) m.scale.set(rt, h, rt);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  const sph = (r, mat, x, y, z, parent = scene) => {
    const m = new THREE.Mesh(shared.sph, mat);
    m.scale.setScalar(r); m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  /* ── 텍스처 ─────────────────────────────────────────────── */
  function tex(w, h, draw, rep) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  }

  const floorTex = tex(512, 512, (g, w, h) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#efe3cd' : '#d9c9ad';
      g.fillRect(x * s, y * s, s, s);
      g.strokeStyle = 'rgba(150,130,100,.25)'; g.lineWidth = 2;
      g.strokeRect(x * s, y * s, s, s);
    }
  }, [4, 2.4]);

  const signTex = tex(1024, 300, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#ffd964'); grd.addColorStop(.55, '#ffb32e'); grd.addColorStop(1, '#e8850f');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#8a3c06'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
    g.fillStyle = '#7a2c04';
    g.font = "bold 132px 'Noto Sans KR','Malgun Gothic',sans-serif";
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('프라이 팩토리', w / 2, h * 0.42);
    g.font = "bold 46px 'Jua','Noto Sans KR',sans-serif";
    g.fillStyle = '#5c2200';
    g.fillText('F R Y   F A C T O R Y   ·   A U T O   D E F E N S E', w / 2, h * 0.8);
  });

  const driveTex = tex(512, 200, (g, w, h) => {
    g.fillStyle = '#231a12'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd34d'; g.lineWidth = 10; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#ffd34d'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = "bold 78px 'Jua','Noto Sans KR',sans-serif";
    g.fillText('DRIVE THRU', w / 2, h * 0.42);
    g.font = "bold 40px 'Jua','Noto Sans KR',sans-serif";
    g.fillStyle = '#fff3d0';
    g.fillText('🍟  프라이  ·  감자튀김', w / 2, h * 0.78);
  });

  const menuTex = tex(512, 640, (g, w, h) => {
    g.fillStyle = '#2b1a11'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd34d'; g.textAlign = 'center';
    g.font = "bold 62px 'Jua','Noto Sans KR',sans-serif";
    g.fillText('M E N U', w / 2, 88);
    const rows = [['🍟', '프라이', '$8'], ['🥔', '황금 프라이', '$24'], ['💎', '크리스탈 프라이', '$48'], ['🥤', '탄산수', '$3']];
    g.textAlign = 'left';
    rows.forEach((r, i) => {
      const y = 190 + i * 105;
      g.font = "46px 'Noto Sans KR',sans-serif";
      g.fillStyle = '#fff3d0'; g.fillText(r[0] + '  ' + r[1], 44, y);
      g.fillStyle = '#ffd34d'; g.font = "bold 44px 'Jua',sans-serif";
      g.fillText(r[2], w - 120, y);
      g.strokeStyle = 'rgba(255,220,150,.16)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(40, y + 26); g.lineTo(w - 40, y + 26); g.stroke();
    });
  });

  const stripeMatA = std(0xd8452c, { roughness: 0.6 });
  const stripeMatB = std(0xfff4dd, { roughness: 0.6 });
  const wallMat = std(C.cream, { roughness: 0.9 });
  const wallMat2 = std(C.cream2, { roughness: 0.9 });
  const redMat = std(C.red, { roughness: 0.62 });
  const roofMat = std(C.roof, { roughness: 0.7 });
  const metalMat = std(C.metal, { metalness: 0.65, roughness: 0.3 });
  const steelMat = std(C.steel, { metalness: 0.55, roughness: 0.42 });
  const darkSteel = std(C.darkSteel, { metalness: 0.5, roughness: 0.5 });
  const woodMat = std(C.wood, { roughness: 0.92 });
  const woodDark = std(C.woodDark, { roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xbfe8ff, transparent: true, opacity: 0.32, roughness: 0.08, metalness: 0.2, side: THREE.DoubleSide,
  });

  /* ── 지면 · 도로 · 마당 ─────────────────────────────────── */
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), std(C.grass, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.position.y = -0.02;
  scene.add(ground);

  // 마당(흙) + 주차장 아스팔트
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), std(C.dirt, { roughness: 1 }));
  yard.rotation.x = -Math.PI / 2; yard.position.set(0, 0.01, 6.4); yard.receiveShadow = true;
  scene.add(yard);

  const road = new THREE.Mesh(new THREE.PlaneGeometry(L.road.x1 - L.road.x0, 90), std(C.asphalt, { roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2; road.position.set((L.road.x0 + L.road.x1) / 2, 0.015, -6);
  road.receiveShadow = true; scene.add(road);

  const sidewalk = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 90), std(C.concrete, { roughness: 0.95 }));
  sidewalk.rotation.x = -Math.PI / 2; sidewalk.position.set(10.85, 0.02, -6); sidewalk.receiveShadow = true;
  scene.add(sidewalk);

  const curb = box(0.22, 0.28, 90, std(0xd8d2c4), 11.6, 0.14, -6);
  curb.castShadow = false;
  for (let i = -8; i < 10; i++) {
    box(0.16, 0.02, 2.2, std(0xf2e6b8), 14.2, 0.03, i * 6 + 1.4).castShadow = false;
  }

  // 마당 잔디 경계 · 자갈
  for (let i = 0; i < 26; i++) {
    const x = -11 + Math.random() * 22, z = 1.2 + Math.random() * 10.4;
    if (Math.abs(x - L.belt.x) < 1.6 && z > 7.5) continue;
    const s = 0.12 + Math.random() * 0.22;
    const p = sph(s, std(0xd8c9a4), x, s * 0.6, z);
    p.castShadow = false;
  }

  /* ── 건물 ───────────────────────────────────────────────── */
  const shop = new THREE.Group(); scene.add(shop);
  const S = L.shop;
  const w = S.x1 - S.x0, d = S.z1 - S.z0, cx = (S.x0 + S.x1) / 2, cz = (S.z0 + S.z1) / 2;

  box(w + 0.8, 0.34, d + 0.8, std(0xb9a68a, { roughness: 1 }), cx, 0.17, cz, shop);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.3), new THREE.MeshStandardMaterial({
    map: floorTex, roughness: 0.35, metalness: 0.05,
  }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(cx, 0.35, cz); floor.receiveShadow = true;
  shop.add(floor);

  // 벽 (앞면은 열린 카운터, 동쪽은 드라이브스루 창)
  box(0.4, S.wallH, d, wallMat, S.x0, 0.35 + S.wallH / 2, cz, shop);                 // 서쪽
  box(w, S.wallH, 0.4, wallMat, cx, 0.35 + S.wallH / 2, S.z0, shop);                 // 북쪽
  // 남쪽: 개방형 카운터 (기둥 + 상단 들보만) — 밖에서 주방이 보이도록
  for (const px of [S.x0 + 0.3, -4.35, S.x1 - 0.3]) box(0.42, S.wallH, 0.42, wallMat, px, 0.35 + S.wallH / 2, S.z1, shop);
  box(w, 0.46, 0.42, wallMat, cx, 0.35 + S.wallH - 0.23, S.z1, shop);
  // 동쪽 벽 (창문 개구부)
  const WZ = { z0: L.window.z - L.window.w / 2, z1: L.window.z + L.window.w / 2 };
  box(0.4, S.wallH, (WZ.z0 - S.z0), wallMat, S.x1, 0.35 + S.wallH / 2, (S.z0 + WZ.z0) / 2, shop);
  box(0.4, S.wallH, (S.z1 - WZ.z1), wallMat, S.x1, 0.35 + S.wallH / 2, (WZ.z1 + S.z1) / 2, shop);
  box(0.4, L.window.y0 - 0.35, L.window.w, wallMat, S.x1, 0.35 + (L.window.y0 - 0.35) / 2, L.window.z, shop);
  box(0.4, S.wallH + 0.35 - L.window.y1, L.window.w, wallMat, S.x1, (L.window.y1 + S.wallH + 0.35) / 2, L.window.z, shop);

  // 벽 하단 띠(빨강) + 상단 트림
  const skirtMat = std(C.red, { roughness: 0.7 });
  box(0.14, 0.34, d, skirtMat, S.x0 - 0.24, 0.52, cz, shop);
  box(0.14, 0.34, d, skirtMat, S.x1 + 0.24, 0.52, cz, shop);
  box(w + 0.5, 0.2, 0.18, std(0xfff7e2), cx, S.wallH + 0.24, S.z1 + 0.24, shop);

  // 지붕: 뒤쪽만 덮고 앞쪽은 열어 둔 디오라마 컷어웨이 (주방이 보이도록)
  box(w + 1.5, 0.4, 4.4, roofMat, cx, S.wallH + 0.62, S.z0 + 2.2, shop);
  box(w + 1.9, 0.2, 0.46, std(0xfff1d6), cx, S.wallH + 0.74, S.z1 + 0.9, shop);
  box(w + 1.5, 0.28, 0.3, roofMat, cx, S.wallH + 0.5, S.z1 + 0.62, shop);
  // 앞쪽 좌우 기둥 보 (얇게)
  for (const sx of [-1, 1]) box(0.24, 0.18, d + 1.2, std(0x8a5527), cx + sx * (w / 2 - 0.4), S.wallH + 0.44, cz, shop);
  // 옥상 설비
  for (let i = 0; i < 3; i++) {
    box(1.4, 0.5, 1.1, steelMat, -5.5 + i * 5.2, S.wallH + 1.06, -8.2, shop);
    cyl(0.28, 0.28, 0.16, darkSteel, -5.5 + i * 5.2, S.wallH + 1.38, -8.2, shop, 12);
  }

  // 간판
  // 간판 (지붕 위에 뒤로 눕힌 옥상 간판 — 카메라에서 주방을 가리지 않게)
  const signGrp = new THREE.Group();
  signGrp.position.set(cx, S.wallH + 1.45, S.z1 + 0.45);
  signGrp.rotation.x = -0.95;
  const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.15), new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
  signMesh.position.z = 0.02; signGrp.add(signMesh);
  box(8.0, 2.5, 0.22, std(0x7a3908), 0, 0, -0.2, signGrp);
  const signGlowMat = new THREE.MeshBasicMaterial({ color: 0xffca4a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
  const signGlow = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 2.9), signGlowMat);
  signGlow.position.z = -0.34; signGrp.add(signGlow);
  for (const sx of [-3.4, 3.4]) {
    const leg = box(0.16, 1.4, 0.16, steelMat, sx, -1.05, 0.3, signGrp);
    leg.rotation.x = 0.95;
  }
  shop.add(signGrp);
  W.refs.signGlow = signGlowMat;

  // 차양은 드라이브스루 창 위에만 (앞면은 열어 주방이 보이게)

  /* ── 창구 카운터 · 메뉴판 · 소품 ───────────────────────── */
  // 드라이브스루 창 안쪽 서비스 카운터
  box(0.85, 1.0, 3.4, std(0xe4cfa8), 8.5, 0.85, L.window.z, shop);
  box(0.98, 0.1, 3.55, woodDark, 8.5, 1.4, L.window.z, shop);
  box(0.5, 0.34, 0.42, darkSteel, 8.5, 1.62, L.window.z + 1.2, shop);
  box(0.42, 0.18, 0.04, new THREE.MeshBasicMaterial({ color: 0x8dffb0 }), 8.28, 1.76, L.window.z + 1.2, shop);
  for (let i = 0; i < 4; i++) cyl(0.09, 0.07, 0.26, std(0xfff6e0), 8.5, 1.57, L.window.z - 1.2 + i * 0.3, shop, 10);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), std(0xffd34d, { metalness: 0.8, roughness: 0.25 }));
  bell.position.set(8.5, 1.48, L.window.z + 0.4); shop.add(bell);
  // 앞쪽 낮은 안내 펜스 (시선을 막지 않게)
  for (const px of [-2.6, 1.4]) box(0.1, 0.85, 0.1, steelMat, px, 0.77, -1.25, shop);
  box(4.4, 0.08, 0.08, steelMat, -0.6, 1.16, -1.25, shop);
  // 오른쪽 벽 메뉴판
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.75), new THREE.MeshBasicMaterial({ map: menuTex }));
  menu.position.set(S.x1 - 0.22, 1.85, -8.0); menu.rotation.y = -Math.PI / 2;
  shop.add(menu);

  /* ── 주방 살림 (디오라마 디테일) ─────────────────────── */
  // 개수대 (뒤 왼쪽)
  const sink = new THREE.Group();
  box(3.0, 0.82, 1.1, std(0xd9e0e6, { metalness: 0.55, roughness: 0.4 }), 0, 0.41, 0, sink);
  box(2.6, 0.16, 0.88, std(0x7d868e, { metalness: 0.7, roughness: 0.3 }), 0, 0.9, 0, sink);
  box(2.4, 0.06, 0.7, std(0x9aa4ad, { metalness: 0.6 }), 0, 0.94, 0, sink);
  cyl(0.05, 0.05, 0.7, metalMat, 0, 1.2, -0.34, sink, 8);
  cyl(0.05, 0.05, 0.4, metalMat, 0, 1.5, -0.2, sink, 8);
  box(0.1, 0.05, 0.1, metalMat, 0, 1.5, -0.05, sink);
  sink.position.set(-5.8, 0.35, -9.5); shop.add(sink);

  // 선반 (뒤 중앙 벽)
  const shelf = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    box(5.4, 0.1, 0.72, std(0xc9a26a), 0, i * 0.62, 0, shelf);
    for (let k = 0; k < 5; k++) {
      box(0.7, 0.4, 0.55, std(k % 2 ? 0xd8b56f : 0xb9d8e8), -2.2 + k * 1.1, 0.25 + i * 0.62, 0, shelf).castShadow = false;
    }
  }
  shelf.position.set(0.4, 1.15, -10.55); shop.add(shelf);

  // 조리 테이블 + 도마 · 그릇
  const prep = new THREE.Group();
  box(2.8, 0.86, 1.15, std(0xdcd3c2), 0, 0.43, 0, prep);
  box(3.0, 0.1, 1.3, std(0xe8e0cf), 0, 0.9, 0, prep);
  box(1.0, 0.07, 0.6, std(0xc9986a), -0.6, 0.98, 0.1, prep);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), std(0xf2f2f2));
  bowl.position.set(0.7, 1.02, 0.05); bowl.scale.y = 0.7; prep.add(bowl);
  for (let i = 0; i < 3; i++) {
    const pot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), std(0xc98b4b, { roughness: 0.95 }));
    pot.position.set(0.55 + (i % 2) * 0.32, 1.12, -0.1 + Math.floor(i / 2) * 0.24);
    pot.scale.set(1.2, 0.85, 1); prep.add(pot);
  }
  prep.position.set(-5.4, 0.35, -6.4); shop.add(prep);

  // 쓰레기통 · 감자 부대
  cyl(0.42, 0.36, 1.0, std(0x4a5a4a, { roughness: 0.7 }), 7.6, 0.85, -10.1, shop, 14);
  cyl(0.45, 0.45, 0.08, std(0x2f3a30), 7.6, 1.38, -10.1, shop, 14);
  for (let i = 0; i < 3; i++) {
    const sack = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.3, 5, 10), std(0xd9c08a, { roughness: 0.98 }));
    sack.position.set(8.05 + (i % 2) * 0.45, 0.62, -8.9 + Math.floor(i / 2) * 0.5);
    sack.rotation.z = 0.2 + i * 0.1; sack.castShadow = true; shop.add(sack);
  }

  // 벽시계 · 카운터 종
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 20), std(0xfff8e6));
  face.rotation.x = Math.PI / 2; face.position.set(2.2, 2.45, -10.71); shop.add(face);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 22), std(0x8a5527));
  rim.position.set(2.2, 2.45, -10.66); shop.add(rim);
  box(0.04, 0.26, 0.03, std(0x2a2118), 2.2, 2.55, -10.64, shop);
  box(0.18, 0.04, 0.03, std(0x2a2118), 2.28, 2.45, -10.63, shop);

  // 바닥 매트 (탈피대 · 튀김기 앞)
  for (const [mx, mz, mw] of [[L.peeler.x, L.peeler.z + 1.55, 2.4], [L.fryer.x, L.fryer.z + 1.7, 3.2], [L.ready.x, L.ready.z + 1.0, 2.0]]) {
    box(mw, 0.03, 1.15, std(0x3c4750, { roughness: 0.95 }), mx, 0.37, mz, shop);
  }

  // 창문 테두리 + 셔터
  const winFrame = std(0x6d7580, { metalness: 0.6, roughness: 0.4 });
  box(0.5, 0.16, L.window.w + 0.5, winFrame, S.x1, L.window.y0 - 0.05, L.window.z, shop);
  box(0.5, 0.16, L.window.w + 0.5, winFrame, S.x1, L.window.y1 + 0.05, L.window.z, shop);
  box(0.5, L.window.y1 - L.window.y0 + 0.3, 0.16, winFrame, S.x1, (L.window.y0 + L.window.y1) / 2, WZ.z0, shop);
  box(0.5, L.window.y1 - L.window.y0 + 0.3, 0.16, winFrame, S.x1, (L.window.y0 + L.window.y1) / 2, WZ.z1, shop);
  // 유리 (열린 창이지만 살짝 반투명)
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(L.window.w, L.window.y1 - L.window.y0), glassMat);
  glass.rotation.y = -Math.PI / 2; glass.position.set(S.x1, (L.window.y0 + L.window.y1) / 2, L.window.z);
  shop.add(glass);

  const shutter = new THREE.Group();
  box(0.16, L.window.y1 - L.window.y0 + 0.1, L.window.w + 0.16, std(0x9aa3ad, { metalness: 0.7, roughness: 0.35 }), 0, 0, 0, shutter);
  for (let i = 0; i < 9; i++) box(0.2, 0.05, L.window.w + 0.16, std(0x7d858f, { metalness: 0.7, roughness: 0.4 }), 0, -1.5 + i * 0.38, 0, shutter);
  shutter.position.set(S.x1, L.window.y1 + 2.0, L.window.z);
  shop.add(shutter);
  W.refs.shutter = shutter;
  W.refs.shutterClosedY = (L.window.y0 + L.window.y1) / 2;
  W.refs.shutterOpenY = L.window.y1 + 2.0;

  // 드라이브스루 간판 · 차양 · 서비스 선반
  const driveSign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), new THREE.MeshBasicMaterial({ map: driveTex }));
  driveSign.position.set(S.x1 + 0.3, 2.95, L.window.z); driveSign.rotation.y = Math.PI / 2;
  shop.add(driveSign);
  for (let i = 0; i < 7; i++) {
    const a = box(1.5, 0.1, 0.62, i % 2 ? stripeMatA : stripeMatB, S.x1 + 0.75, 3.62, L.window.z - 1.9 + i * 0.63);
    a.rotation.z = 0.14;
  }
  box(1.9, 0.14, 3.4, woodDark, L.ledge.x - 0.5, 1.0, L.window.z);
  box(0.14, 0.7, 3.3, steelMat, L.ledge.x - 1.35, 0.62, L.window.z);

  // 입구 문 (서쪽 앞)
  box(1.5, 2.3, 0.12, std(0x8a5a33), -7.4, 1.5, S.z1 + 0.16);

  /* ── 주방 설비 ─────────────────────────────────────────── */
  // 컨베이어 벨트
  const beltGrp = new THREE.Group(); scene.add(beltGrp);
  const B = L.belt, beltLen = B.z0 - B.z1, beltMid = (B.z0 + B.z1) / 2;
  box(B.w + 0.34, 0.16, beltLen + 0.4, darkSteel, B.x, B.y - 0.2, beltMid, beltGrp);
  for (const sx of [-1, 1]) box(0.1, 0.24, beltLen + 0.4, steelMat, B.x + sx * (B.w / 2 + 0.16), B.y - 0.02, beltMid, beltGrp);
  for (let i = 0; i < 10; i++) {
    const z = B.z1 + (beltLen / 10) * (i + 0.5);
    for (const sx of [-1, 1]) box(0.12, 0.5, 0.12, darkSteel, B.x + sx * (B.w / 2 + 0.16), B.y - 0.32, z, beltGrp);
  }
  const slats = [];
  const slatMat = std(0x3a3f45, { metalness: 0.3, roughness: 0.72 });
  for (let i = 0; i < 26; i++) {
    const s = box(B.w, 0.07, 0.28, slatMat, B.x, B.y, B.z1 + (beltLen / 26) * i, beltGrp);
    slats.push(s);
  }
  const rollers = [];
  for (const z of [B.z0, B.z1]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, B.w + 0.1, 14), steelMat);
    r.rotation.z = Math.PI / 2; r.position.set(B.x, B.y - 0.16, z); r.castShadow = true;
    beltGrp.add(r); rollers.push(r);
  }
  // 벨트 위 hopper (마당 쪽)
  const hopper = new THREE.Group();
  box(1.9, 0.5, 1.5, steelMat, 0, 0.25, 0, hopper);
  box(1.6, 0.3, 1.2, std(0x2f353b), 0, 0.55, 0, hopper);
  hopper.position.set(B.x, B.y - 0.32, B.z0 + 0.55); beltGrp.add(hopper);
  // 벨트 커버 (구매 전: 공사중 콘과 차단 바)
  const beltTarp = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.62, 10), std(0xff6a1f));
    cone.position.set(B.x + (i % 2 ? 0.75 : -0.75), 0.31, 1.2 + i * 2.6);
    cone.castShadow = true; beltTarp.add(cone);
  }
  const bar = box(0.12, 0.9, 0.12, std(0xfff2d0), B.x - 1.0, 0.45, B.z0 - 0.4, beltTarp);
  const bar2 = box(0.12, 0.9, 0.12, std(0xfff2d0), B.x + 1.0, 0.45, B.z0 - 0.4, beltTarp);
  const barTop = box(2.2, 0.16, 0.12, std(0xff6a1f), B.x, 0.88, B.z0 - 0.4, beltTarp);
  scene.add(beltTarp);
  W.refs.beltGrp = beltGrp; W.refs.beltSlats = slats; W.refs.beltRollers = rollers;
  W.refs.beltTarp = beltTarp; W.refs.hopper = hopper;

  // 탈피대 (수동 테이블 + 자동 드럼)
  const peelerManual = new THREE.Group();
  box(1.5, 0.9, 1.1, woodMat, 0, 0.45, 0, peelerManual);
  box(1.7, 0.12, 1.3, std(0xd8c9a4), 0, 0.95, 0, peelerManual);
  box(0.7, 0.06, 0.5, std(0xf2e2c0), -0.2, 1.03, 0, peelerManual);
  const knife = box(0.05, 0.04, 0.42, metalMat, 0.35, 1.06, 0.1, peelerManual);
  box(0.12, 0.05, 0.16, std(0x2f2a26), 0.35, 1.06, -0.2, peelerManual);
  peelerManual.position.set(L.peeler.x, 0.34, L.peeler.z);
  scene.add(peelerManual);

  const peelerAuto = new THREE.Group();
  box(1.8, 0.7, 1.3, steelMat, 0, 0.35, 0, peelerAuto);
  const drumGrp = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 1.1, 18), std(0xd8dee4, { metalness: 0.5, roughness: 0.4 }));
  drum.rotation.z = Math.PI / 2; drum.castShadow = true; drumGrp.add(drum);
  for (let i = 0; i < 8; i++) {
    const rib = box(1.12, 0.05, 0.06, std(0x9aa4ae, { metalness: 0.6 }), 0, 0, 0, drumGrp);
    rib.position.set(0, Math.cos(i / 8 * Math.PI * 2) * 0.53, Math.sin(i / 8 * Math.PI * 2) * 0.53);
  }
  for (const sx of [-0.72, 0.72]) box(0.16, 0.5, 0.16, darkSteel, sx, -0.05, 0, peelerAuto);
  drumGrp.position.set(0, 0.85, 0); peelerAuto.add(drumGrp);
  box(1.0, 0.14, 0.7, std(0x2f353b), 0, 0.72, 0.55, peelerAuto);   // 물받이
  const peelerLed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0x59ff8a }));
  peelerLed.position.set(0.72, 0.62, 0.5); peelerAuto.add(peelerLed);
  peelerAuto.position.set(L.peeler.x, 0.34, L.peeler.z);
  peelerAuto.visible = false;
  scene.add(peelerAuto);
  W.refs.peelerManual = peelerManual; W.refs.peelerAuto = peelerAuto; W.refs.peelerDrum = drumGrp;

  // 튀김기 (3 바트)
  const fryGrp = new THREE.Group();
  box(2.9, 0.95, 1.5, std(0xb9c2ca, { metalness: 0.75, roughness: 0.28 }), 0, 0.78, 0, fryGrp);
  box(3.0, 0.12, 1.62, steelMat, 0, 1.28, 0, fryGrp);
  const vats = [];
  for (let i = 0; i < 3; i++) {
    const vx = -0.92 + i * 0.92;
    box(0.78, 0.1, 1.16, std(0x6f777f, { metalness: 0.7, roughness: 0.3 }), vx, 1.3, 0, fryGrp);
    const oilMat = new THREE.MeshStandardMaterial({ color: 0xffb02e, emissive: 0xff8c00, emissiveIntensity: 0.35, roughness: 0.25, metalness: 0.1 });
    const oil = box(0.66, 0.06, 1.02, oilMat, vx, 1.34, 0, fryGrp);
    vats.push(oil);
    // 바구니 손잡이
    box(0.1, 0.5, 0.1, darkSteel, vx, 1.55, -0.5, fryGrp);
    box(0.7, 0.1, 0.1, darkSteel, vx, 1.78, -0.5, fryGrp);
  }
  box(3.1, 1.0, 0.2, std(0x8e979f, { metalness: 0.6 }), 0, 2.4, -0.7, fryGrp);
  box(1.2, 0.5, 0.16, std(0x3f454b, { metalness: 0.4 }), 0, 1.62, 0.78, fryGrp);
  // 배기 후드
  box(3.2, 0.5, 1.8, steelMat, 0, 3.1, -0.1, fryGrp);
  cyl(0.28, 0.28, 1.2, steelMat, 0, 3.9, -0.2, fryGrp, 12);
  fryGrp.position.set(L.fryer.x, 0.34, L.fryer.z);
  scene.add(fryGrp);
  W.refs.fryer = fryGrp; W.refs.vats = vats;

  // 튀김 대기 트레이 (서빙 카운터)
  const trayGrp = new THREE.Group();
  box(1.6, 0.85, 1.1, std(0xe4cfa8), 0, 0.42, 0, trayGrp);
  box(1.75, 0.1, 1.25, woodDark, 0, 0.9, 0, trayGrp);
  const trayStack = new THREE.Group();
  trayGrp.add(trayStack);
  trayGrp.position.set(L.ready.x, 0.34, L.ready.z);
  scene.add(trayGrp);
  W.refs.trayStack = trayStack;

  // 프라이 슈터 터렛 (구매 전 숨김)
  const turret = new THREE.Group();
  box(1.0, 0.6, 1.0, darkSteel, 0, 0.3, 0, turret);
  const turretYaw = new THREE.Group(); turretYaw.position.y = 0.66;
  cyl(0.36, 0.4, 0.4, steelMat, 0, 0.2, 0, turretYaw, 12);
  const turretBarrel = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.95, 10), std(0xffd34d, { metalness: 0.5, roughness: 0.4 }));
    b.rotation.x = Math.PI / 2;
    b.position.set(Math.cos(i / 4 * Math.PI * 2) * 0.19, Math.cos(i / 4 * Math.PI * 2) * 0.19, 0.5);
    b.castShadow = true; turretBarrel.add(b);
  }
  turretBarrel.position.y = 0.22; turretYaw.add(turretBarrel);
  const tLed = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5b3b }));
  tLed.position.set(0, 0.45, -0.05); turretYaw.add(tLed);
  turret.add(turretYaw);
  turret.position.set(L.turret.x, 0.34, L.turret.z);
  turret.rotation.y = 0;
  turret.visible = false;
  scene.add(turret);
  W.refs.turret = turret; W.refs.turretYaw = turretYaw; W.refs.turretLed = tLed;

  // 배전함
  const breaker = new THREE.Group();
  box(0.8, 1.15, 0.4, std(0x7f8a93, { metalness: 0.5, roughness: 0.5 }), 0, 0, 0, breaker);
  for (let i = 0; i < 4; i++) box(0.66, 0.09, 0.06, std(i % 2 ? 0xffd34d : 0x2b2b2b), 0, -0.4 + i * 0.28, 0.2, breaker);
  const lever = box(0.12, 0.34, 0.12, std(0xd8452c), 0.22, 0.1, 0.24, breaker);
  breaker.position.set(L.breaker.x, 1.5, L.breaker.z);
  breaker.rotation.y = Math.PI / 2;
  scene.add(breaker);
  W.refs.breaker = breaker; W.refs.breakerLever = lever;

  /* ── 마당: 감자 더미와 지하실 해치 ───────────────────────── */
  const pileDefs = {
    normal: { r: 1.5, mat: std(C.potato, { roughness: 0.95 }), crate: 2.4 },
    gold: { r: 1.05, mat: new THREE.MeshStandardMaterial({ color: C.gold, roughness: 0.35, metalness: 0.45, emissive: 0x6b4500, emissiveIntensity: 0.35 }), crate: 1.9 },
    crystal: { r: 0.95, mat: new THREE.MeshStandardMaterial({ color: C.crystal, roughness: 0.12, metalness: 0.25, emissive: 0x1c7f95, emissiveIntensity: 0.5, transparent: true, opacity: 0.9 }), crate: 1.7 },
  };
  const piles = [];
  L.piles.forEach((pd) => {
    const def = pileDefs[pd.key];
    const g = new THREE.Group();
    box(def.crate, 0.55, def.crate, woodMat, 0, 0.28, 0, g);
    box(def.crate + 0.14, 0.12, def.crate + 0.14, woodDark, 0, 0.6, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(0.12, 0.5, 0.12, woodDark, sx * def.crate * 0.46, 0.28, sz * def.crate * 0.46, g);
    }
    const mound = new THREE.Group();
    const count = pd.key === 'normal' ? 26 : pd.key === 'gold' ? 16 : 12;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.pow(Math.random(), 0.6) * def.r * 0.85;
      const y = 0.72 + Math.random() * def.r * 0.75;
      const p = new THREE.Mesh(shared.sph, def.mat);
      const s = 0.16 + Math.random() * 0.12;
      p.scale.set(s * 1.25, s * 0.85, s);
      p.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr);
      p.rotation.set(Math.random(), Math.random() * 6, Math.random());
      p.castShadow = false; mound.add(p);
    }
    g.add(mound);
    g.position.set(pd.x, 0, pd.z);
    scene.add(g);
    // 개수 스프라이트
    const label = makeTextSprite('x999', { size: 96, color: '#fff3cf', bg: 'rgba(40,22,10,.72)' });
    label.position.set(pd.x, 2.55, pd.z); label.scale.set(1.5, 0.75, 1);
    scene.add(label);
    piles.push({ key: pd.key, group: g, mound, label, x: pd.x, z: pd.z, def });
  });
  W.refs.piles = piles;

  // 지하실 해치
  const hatch = new THREE.Group();
  box(2.2, 0.14, 2.2, std(0x8d949c, { metalness: 0.65, roughness: 0.4 }), 0, 0.07, 0, hatch);
  box(2.0, 0.06, 2.0, std(0x6f767e, { metalness: 0.7, roughness: 0.45 }), 0, 0.16, 0, hatch);
  for (let i = 0; i < 5; i++) box(1.9, 0.05, 0.07, std(0x565d64), 0, 0.2, -0.8 + i * 0.4, hatch);
  const padlock = new THREE.Group();
  box(0.3, 0.26, 0.12, std(0xd9a52b, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0, padlock);
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 8, 12, Math.PI), std(0xd9a52b, { metalness: 0.8, roughness: 0.3 }));
  shackle.position.y = 0.14; padlock.add(shackle);
  padlock.position.set(0, 0.34, 0.9); hatch.add(padlock);
  const hatchGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const hatchGlow = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), hatchGlowMat);
  hatchGlow.rotation.x = -Math.PI / 2; hatchGlow.position.y = 0.05; hatch.add(hatchGlow);
  hatch.position.set(L.hatch.x, 0, L.hatch.z);
  scene.add(hatch);
  W.refs.hatch = hatch; W.refs.hatchGlow = hatchGlowMat; W.refs.hatchLid = hatch.children[0]; W.refs.padlock = padlock;

  /* ── 울타리 · 가로등 · 소품 ─────────────────────────────── */
  const fenceMat = std(0xfff2d8, { roughness: 0.9 });
  const fencePostMat = std(0x8a5a33);
  for (let i = 0; i < 15; i++) {
    const x = -12 + i * 1.72;
    box(0.12, 1.0, 0.12, fencePostMat, x, 0.5, 12.0);
    if (i < 14) { box(1.6, 0.1, 0.06, fenceMat, x + 0.86, 0.86, 12.0); box(1.6, 0.1, 0.06, fenceMat, x + 0.86, 0.55, 12.0); }
  }
  for (const sx of [-12, 12]) {
    for (let i = 0; i < 7; i++) box(0.12, 1.0, 0.12, fencePostMat, sx, 0.5, 1.5 + i * 1.7);
    box(0.06, 0.1, 10.2, fenceMat, sx, 0.86, 6.6);
    box(0.06, 0.1, 10.2, fenceMat, sx, 0.55, 6.6);
  }

  const lampLights = [];
  for (const [lx, lz] of [[-10.6, 1.6], [10.6, 9.4]]) {
    const g = new THREE.Group();
    cyl(0.1, 0.14, 3.0, darkSteel, 0, 1.5, 0, g, 8);
    box(0.5, 0.1, 0.5, darkSteel, 0, 3.0, 0, g);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
    const bulb = sph(0.17, bulbMat, 0, 2.9, 0, g);
    let pl = null;
    if (lampLights.length === 0) {
      pl = new THREE.PointLight(0xffd89a, 0, 13, 2);
      pl.position.set(0, 2.85, 0); g.add(pl);
    }
    g.position.set(lx, 0, lz); scene.add(g);
    lampLights.push({ light: pl, bulbMat, bulb });
  }
  W.refs.lampLights = lampLights;

  // 나무 · 덤불
  for (const [tx, tz, s] of [[-13.5, -3, 1.0], [13.8, 12.5, .85], [-13.2, 13.0, .8], [15.5, -16, .9]]) {
    const g = new THREE.Group();
    cyl(0.22 * s, 0.3 * s, 2.0 * s, woodDark, 0, 1.0 * s, 0, g, 8);
    for (let i = 0; i < 3; i++) {
      const c = sph((1.0 - i * 0.16) * s, std(i % 2 ? 0x4e9c46 : 0x62b354, { roughness: 0.95 }),
        (Math.random() - .5) * 0.7 * s, (1.9 + i * 0.7) * s, (Math.random() - .5) * 0.7 * s, g);
      c.scale.y *= 0.85;
    }
    g.position.set(tx, 0, tz); scene.add(g);
  }

  // 마당 소품: 통, 상자, 팔레트, 수레
  for (const [bx, bz, col] of [[-9.2, 2.2, 0x2f6fb5], [-8.4, 9.4, 0xd8452c], [9.6, 1.6, 0x2f8f4a]]) {
    const g = new THREE.Group();
    cyl(0.36, 0.36, 0.9, std(col, { roughness: 0.6 }), 0, 0.45, 0, g, 14);
    for (const yy of [0.25, 0.65]) cyl(0.38, 0.38, 0.08, darkSteel, 0, yy, 0, g, 14);
    g.position.set(bx, 0, bz); scene.add(g);
  }
  for (let i = 0; i < 3; i++) {
    box(1.0, 0.7, 1.0, woodMat, -10.2, 0.35 + i * 0.02, 6.0 + i * 1.15);
    box(1.0, 0.7, 1.0, woodMat, -9.1, 0.35 + i * 0.02, 6.0 + i * 1.15);
  }
  box(2.2, 0.14, 1.5, woodDark, 10.0, 0.07, 6.8);
  for (let i = 0; i < 4; i++) box(2.1, 0.08, 0.14, woodMat, 10.0, 0.16, 6.3 + i * 0.33);

  // 마당 바닥 마킹(주차선)
  for (let i = 0; i < 3; i++) {
    const lm = box(0.14, 0.02, 5.4, std(0xfff3c4), 11.9 + i * 2.0, 0.04, 8.5);
    lm.castShadow = false;
  }

  /* ── 조명 · 하늘 ───────────────────────────────────────── */
  const hemi = new THREE.HemisphereLight(0xfff3dc, 0x6b5a42, 0.85);
  scene.add(hemi);
  const amb = new THREE.AmbientLight(0xffe6c4, 0.32);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(0xfff1cf, 2.1);
  sun.position.set(16, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(0, 0, 0);

  // 가게 안 따뜻한 조명
  const shopLights = [];
  for (const [lx, lz] of [[-4.5, -6.2], [4.0, -6.2], [0.2, -1.6]]) {
    const pl = new THREE.PointLight(0xffd9a0, 14, 13, 2);
    pl.position.set(lx, 2.75, lz); scene.add(pl); shopLights.push(pl);
    box(0.9, 0.08, 0.5, new THREE.MeshBasicMaterial({ color: 0xfff2cf }), lx, 2.95, lz);
  }
  // 창문 위 외부 램프
  const winLampMat = new THREE.MeshBasicMaterial({ color: 0xffd34d });
  const winLamp = sph(0.14, winLampMat, S.x1 + 0.5, 3.55, L.window.z);
  const winLight = new THREE.PointLight(0xffc35a, 6, 10, 2);
  winLight.position.set(S.x1 + 0.7, 3.4, L.window.z); scene.add(winLight);
  W.refs.winLight = winLight; W.refs.winLampMat = winLampMat;

  // 경보등 (밤 변칙성)
  const alarmMats = [];
  for (const [ax, az] of [[S.x0 + 0.4, S.z1 + 0.3], [S.x1 - 0.4, S.z1 + 0.3], [L.belt.x + 1.2, S.z1 + 0.3]]) {
    const m = new THREE.MeshBasicMaterial({ color: 0xff3a1f, transparent: true, opacity: 0.25 });
    const b = sph(0.13, m, ax, 3.1, az);
    b.castShadow = false;
    alarmMats.push(m);
  }
  W.refs.alarmMats = alarmMats;

  // 밤하늘 별
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 520; i++) {
    const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 45;
    starPos.push(Math.cos(a) * r, 20 + Math.random() * 45, Math.sin(a) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.36, transparent: true, opacity: 0, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  W.refs.stars = starMat;

  // 하늘색
  const dayBg = new THREE.Color(0x9ed3f0), duskBg = new THREE.Color(0x2a1b3a), nightBg = new THREE.Color(0x0b1224);
  const dayFog = new THREE.Color(0xbfe3f5), nightFog = new THREE.Color(0x0d1424);
  scene.background = dayBg.clone();
  scene.fog = new THREE.Fog(dayFog.clone(), 55, 125);

  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  W.setNight = (t, dim = 0) => {
    // t: 0 = 낮, 1 = 깊은 밤
    const dusk = Math.min(1, Math.max(0, (t - 0.35) / 0.4));
    tmpA.copy(dayBg).lerp(duskBg, dusk).lerp(nightBg, Math.max(0, (t - 0.55) / 0.45));
    scene.background.copy(tmpA);
    tmpB.copy(dayFog).lerp(nightFog, t);
    scene.fog.color.copy(tmpB);
    scene.fog.near = 55 - t * 18; scene.fog.far = 125 - t * 40;
    const dark = 1 - dim * 0.93;
    sun.intensity = 2.1 * (1 - t * 0.94) * dark;
    sun.color.copy(new THREE.Color(0xfff1cf).lerp(new THREE.Color(0x7a8fd6), t));
    hemi.intensity = 0.85 * (1 - t * 0.72) * (1 - dim * 0.8);
    amb.intensity = 0.32 * (1 - t * 0.4) * (1 - dim * 0.75);
    shopLights.forEach((l) => { l.intensity = 14 * (0.55 + t * 0.75) * (1 - dim * 0.96); });
    lampLights.forEach((o) => { if (o.light) o.light.intensity = 9 * t; o.bulbMat.color.setHex(t > 0.2 ? 0xffd89a : 0x8a8378); });
    winLight.intensity = 6 * (0.4 + t * 0.9) * (1 - dim * 0.9);
    W.refs.signGlow.opacity = 0.16 + t * 0.34;
    W.refs.stars.opacity = Math.max(0, (t - 0.4) / 0.6);
    W.nightT = t;
  };
  W.setNight(0);
  W.refs.shopLights = shopLights; W.refs.sun = sun; W.refs.hemi = hemi;

  W.alert = (on) => {
    alarmMats.forEach((m) => { m.opacity = on ? 0.95 : 0.22; });

  };
  W.alert(false);

  W.box = box; W.cyl = cyl; W.sph = sph; W.std = std; W.shared = shared; W.tex = tex;
  return W;
}

/* ── 텍스트 스프라이트 (개수 표시) ───────────────────────── */
export function makeTextSprite(text, opt = {}) {
  const size = opt.size || 96;
  const pad = 22;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d');
  const font = `bold ${size}px 'Jua','Noto Sans KR','Malgun Gothic',sans-serif`;
  g.font = font;
  const tw = Math.ceil(g.measureText(text).width) + pad * 2;
  const th = size + pad * 2;
  cv.width = tw; cv.height = th;
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (opt.bg) {
    g.fillStyle = opt.bg;
    roundRect(g, 2, 2, tw - 4, th - 4, th * 0.32); g.fill();
  }
  g.fillStyle = opt.color || '#fff';
  g.fillText(text, tw / 2, th / 2 + size * 0.06);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(mat);
  sp.userData.aspect = tw / th;
  sp.scale.set((tw / th) * (opt.h || 0.75), (opt.h || 0.75), 1);
  sp.userData.setText = (t2) => {
    const c2 = document.createElement('canvas');
    const gg = c2.getContext('2d');
    gg.font = font;
    const w2 = Math.ceil(gg.measureText(t2).width) + pad * 2;
    c2.width = w2; c2.height = th;
    gg.font = font; gg.textAlign = 'center'; gg.textBaseline = 'middle';
    if (opt.bg) { gg.fillStyle = opt.bg; roundRect(gg, 2, 2, w2 - 4, th - 4, th * 0.32); gg.fill(); }
    gg.fillStyle = opt.color || '#fff';
    gg.fillText(t2, w2 / 2, th / 2 + size * 0.06);
    const nt = new THREE.CanvasTexture(c2);
    nt.colorSpace = THREE.SRGBColorSpace;
    sp.material.map.dispose(); sp.material.map = nt; sp.material.needsUpdate = true;
    sp.scale.set((w2 / th) * (opt.h || 0.75), (opt.h || 0.75), 1);
  };
  return sp;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ── 캐릭터 팩토리 ───────────────────────────────────────── */
const SKIN = 0xffd9b0;
const CAP_COLORS = [0x2f6fb5, 0xd8452c, 0x2f8f4a, 0x8a4fb5];

export function makeClerk(opt = {}) {
  const color = opt.color !== undefined ? opt.color : CAP_COLORS[0];
  const g = new THREE.Group();
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8 }, o || {}));
  const uni = mat(color, { roughness: 0.75 });
  const skin = mat(SKIN, { roughness: 0.7 });
  const cream = mat(0xfff6e2, { roughness: 0.85 });
  const shoe = mat(0x3a2a1e);

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.36, 5, 10), uni);
  body.position.y = 0.83; body.castShadow = true; g.add(body);
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.44, 0.1), cream);
  apron.position.set(0, 0.78, 0.22); g.add(apron);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.235, 16, 14), skin);
  head.position.y = 1.31; head.castShadow = true; g.add(head);
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.245, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), uni);
  hat.position.y = 1.36; hat.castShadow = true; g.add(hat);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.03, 12), mat(0xffffff));
  brim.position.set(0, 1.34, 0.2); brim.rotation.x = 0.25; g.add(brim);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0x241a12));
    eye.position.set(sx * 0.085, 1.33, 0.21); g.add(eye);
  }

  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.27, 1.03, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 8), uni);
    arm.position.y = -0.19; arm.castShadow = true; pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), skin);
    hand.position.y = -0.4; pivot.add(hand);
    pivot.rotation.z = sx * 0.08;
    g.add(pivot); arms.push(pivot);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * 0.11, 0.5, 0);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.3, 4, 8), mat(0x3f4b5c));
    leg.position.y = -0.1; pivot.add(leg);
    const sh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.26), shoe);
    sh.position.set(0, -0.28, 0.04); pivot.add(sh);
    g.add(pivot); legs.push(pivot);
  }
  g.userData.arms = arms; g.userData.legs = legs; g.userData.body = body;
  g.userData.head = head;
  g.scale.setScalar(opt.scale || 1);
  return g;
}

export function makeRobot() {
  const g = new THREE.Group();
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.45, metalness: 0.55 }, o || {}));
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.5), mat(0xdfe6ec));
  body.position.y = 0.72; body.castShadow = true; g.add(body);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.06), mat(0x33404d));
  panel.position.set(0, 0.75, 0.26); g.add(panel);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.03), new THREE.MeshBasicMaterial({ color: 0x59ffd0 }));
  led.position.set(0, 0.82, 0.29); g.add(led);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.4), mat(0xeef3f7));
  head.position.y = 1.14; head.castShadow = true; g.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x59c8ff }));
    eye.position.set(sx * 0.1, 1.16, 0.21); g.add(eye);
  }
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 6), mat(0x9aa4ae));
  ant.position.y = 1.4; g.add(ant);
  const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff5b3b }));
  antBall.position.y = 1.53; g.add(antBall);
  const wheelGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12);
  const wheelMat = mat(0x30363c, { roughness: 0.9, metalness: 0.1 });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const wh = new THREE.Mesh(wheelGeo, wheelMat);
    wh.rotation.z = Math.PI / 2; wh.position.set(sx * 0.28, 0.16, sz * 0.2);
    g.add(wh);
  }
  const armPivot = new THREE.Group();
  armPivot.position.set(0.3, 0.88, 0.12);
  const uArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), mat(0xcfd8e0));
  uArm.position.y = -0.16; armPivot.add(uArm);
  const claw = new THREE.Group(); claw.position.y = -0.36;
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.08), mat(0x8e979f));
    f.position.set(sx * 0.07, -0.05, 0); f.rotation.z = sx * 0.3; claw.add(f);
  }
  armPivot.add(claw); g.add(armPivot);
  g.userData.armPivot = armPivot; g.userData.claw = claw; g.userData.led = led;
  return g;
}

export function makeCar(opt = {}) {
  const g = new THREE.Group();
  const color = opt.color !== undefined ? opt.color : 0x3b6fd4;
  const mat = (c, o) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.4, metalness: 0.35 }, o || {}));
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.52, 3.0), mat(color));
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.5, 1.45), mat(0x2a3742, { roughness: 0.15, metalness: 0.6 }));
  cabin.position.set(0, 0.98, -0.12); cabin.castShadow = true; g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.1, 1.5), mat(color, { metalness: 0.5 }));
  roof.position.set(0, 1.24, -0.12); g.add(roof);
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.18, 12);
  const wheelMat = mat(0x22262b, { roughness: 0.95, metalness: 0.1 });
  for (const [sx, sz] of [[-1, -1.05], [1, -1.05], [-1, 1.05], [1, 1.05]]) {
    const wh = new THREE.Mesh(wheelGeo, wheelMat);
    wh.rotation.z = Math.PI / 2; wh.position.set(sx * 0.8, 0.26, sz); g.add(wh);
  }
  for (const sx of [-1, 1]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    hl.position.set(sx * 0.52, 0.6, 1.5); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xff3b1f }));
    tl.position.set(sx * 0.54, 0.62, -1.52); g.add(tl);
  }
  return g;
}

export function makeWalker(opt = {}) {
  const g = makeClerk({ color: opt.color !== undefined ? opt.color : 0x6a7f9a, scale: 0.96 });
  const hat = g.userData.head.parent;
  // 손님: 앞치마를 벗겨 점원과 구분
  g.children.forEach((c) => { if (c.geometry && c.geometry.type === 'BoxGeometry' && Math.abs(c.position.z - 0.22) < 0.01) c.visible = false; });
  const cap = g.children.find((c) => c.geometry && c.geometry.type === 'SphereGeometry' && c.position.y > 1.33);
  if (cap) cap.visible = false;
  return g;
}

export function makePotato(type) {
  const g = new THREE.Group();
  const s = type === 'crystal' ? 0.3 : 0.345;
  let mat;
  if (type === 'gold') mat = new THREE.MeshStandardMaterial({ color: 0xffc93c, roughness: 0.3, metalness: 0.55, emissive: 0x8a5a00, emissiveIntensity: 0.45 });
  else if (type === 'crystal') mat = new THREE.MeshStandardMaterial({ color: 0x8feaff, roughness: 0.1, metalness: 0.3, emissive: 0x1f8fa8, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 });
  else mat = new THREE.MeshStandardMaterial({ color: 0xc98b4b, roughness: 0.92 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 10), mat);
  core.scale.set(1.25, 0.86, 1);
  core.castShadow = true; g.add(core);
  if (type === 'crystal') {
    const rim = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.55, 0), new THREE.MeshBasicMaterial({ color: 0xd6ffff, transparent: true, opacity: 0.5 }));
    rim.position.y = s * 0.6; g.add(rim);
  }
  for (let i = 0; i < 3; i++) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(s * 0.16, 6, 5), mat);
    const a = Math.random() * 6;
    e.position.set(Math.cos(a) * s * 0.7, s * 0.5 + Math.random() * s * 0.3, Math.sin(a) * s * 0.7);
    g.add(e);
  }
  g.rotation.y = Math.random() * 6;
  return g;
}

export function makeFryBox() {
  const g = new THREE.Group();
  const cartonMat = new THREE.MeshStandardMaterial({ color: 0xee4b26, roughness: 0.75 });
  const carton = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.12, 0.34, 4), cartonMat);
  carton.position.y = 0.17; carton.rotation.y = Math.PI / 4; carton.castShadow = true; g.add(carton);
  const fryMat = new THREE.MeshStandardMaterial({ color: 0xffd35c, roughness: 0.7, emissive: 0x5a3a00, emissiveIntensity: 0.15 });
  for (let i = 0; i < 6; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3 + Math.random() * 0.12, 0.05), fryMat);
    const a = Math.random() * 6, r = Math.random() * 0.1;
    f.position.set(Math.cos(a) * r, 0.4, Math.sin(a) * r);
    f.rotation.z = (Math.random() - 0.5) * 0.5; f.rotation.x = (Math.random() - 0.5) * 0.4;
    g.add(f);
  }
  return g;
}
