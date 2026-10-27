// =============================================================
//  효과: 스키드 마크, 타이어 연기, 충돌 불꽃, 소품(라바콘·드럼통) 모델
// =============================================================
import * as THREE from 'three';

// ---------- 스키드 마크 (링 버퍼) ----------
export class SkidMarks {
  constructor(scene, max = 1600) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 4 * 3);
    const idx = [];
    for (let k = 0; k < max; k++) { const a = k * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
      color: 0x1c1c22, transparent: true, opacity: 0.38, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide,
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.last = new Map(); // 바퀴별 마지막 위치
  }
  // key: 바퀴 식별자, (x,z) 현재 위치, (lx,lz) 좌측 방향, active: 자국 남기는 중?
  track(key, x, z, lx, lz, active) {
    const prev = this.last.get(key);
    if (!active) { this.last.delete(key); return; }
    if (prev) {
      const d = Math.hypot(x - prev.x, z - prev.z);
      if (d < 0.35) return;
      if (d < 4) {
        const w = 0.2, y = 0.05;
        const o = this.i * 12;
        this.pos.set([
          prev.x + prev.lx * w, y, prev.z + prev.lz * w,
          prev.x - prev.lx * w, y, prev.z - prev.lz * w,
          x - lx * w, y, z - lz * w,
          x + lx * w, y, z + lz * w,
        ], o);
        this.i = (this.i + 1) % this.max;
        this.geo.attributes.position.needsUpdate = true;
      }
    }
    this.last.set(key, { x, z, lx, lz });
  }
  clear() { this.pos.fill(0); this.geo.attributes.position.needsUpdate = true; this.last.clear(); }
}

// ---------- 둥근 입자 텍스처 ----------
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- 연기 / 흙먼지 / 불꽃 ----------
export class Particles {
  constructor(scene, max = 160) {
    this.items = [];
    const tex = puffTexture();
    for (let i = 0; i < max; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
      const s = new THREE.Sprite(mat);
      s.visible = false;
      scene.add(s);
      this.items.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 1, a0: 1 });
    }
    this.next = 0;
  }
  spawn(x, y, z, { vx = 0, vy = 1, vz = 0, size = 0.8, grow = 2, life = 0.8, color = 0xffffff, alpha = 0.6 } = {}) {
    const p = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
    p.s.position.set(x, y, z);
    p.s.scale.setScalar(size);
    p.s.material.color.setHex(color);
    p.s.material.opacity = alpha;
    p.s.visible = true;
    Object.assign(p, { life, max: life, vx, vy, vz, grow, a0: alpha });
  }
  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.vx *= 0.96; p.vz *= 0.96;
      const sc = p.s.scale.x + p.grow * dt; p.s.scale.setScalar(sc);
      p.s.material.opacity = p.a0 * (p.life / p.max);
    }
  }
}

export class Sparks {
  constructor(scene, max = 80) {
    this.items = [];
    const geo = new THREE.BoxGeometry(0.08, 0.08, 0.45);
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffd23f }));
      m.visible = false; scene.add(m);
      this.items.push({ m, life: 0, v: new THREE.Vector3() });
    }
    this.next = 0;
  }
  burst(x, z, nx, nz, power) {
    const n = Math.min(14, 3 + Math.floor(power * 2));
    for (let k = 0; k < n; k++) {
      const p = this.items[this.next]; this.next = (this.next + 1) % this.items.length;
      p.m.position.set(x, 0.6, z);
      const a = (Math.random() - 0.5) * 2.2;
      const sp = 4 + Math.random() * 6;
      const tx = -nz, tz = nx;
      p.v.set((nx * Math.cos(a) + tx * Math.sin(a)) * sp, 2 + Math.random() * 4, (nz * Math.cos(a) + tz * Math.sin(a)) * sp);
      p.life = 0.25 + Math.random() * 0.3;
      p.m.material.color.setHex(Math.random() < 0.5 ? 0xffd23f : 0xff8a3d);
      p.m.visible = true;
    }
  }
  update(dt) {
    for (const p of this.items) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      p.v.y -= 18 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.05) { p.m.position.y = 0.05; p.v.y *= -0.4; }
      p.m.lookAt(p.m.position.x + p.v.x, p.m.position.y + p.v.y, p.m.position.z + p.v.z);
    }
  }
}

// ---------- 소품 모델 ----------
export function makeConeMesh() {
  const g = new THREE.Group();
  const orange = new THREE.MeshLambertMaterial({ color: 0xff7a1a });
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.75), orange);
  base.position.y = 0.04;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.95, 14), orange);
  cone.position.y = 0.55;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.245, 0.16, 14), white);
  band.position.y = 0.5;
  for (const m of [base, cone]) m.castShadow = true;
  g.add(base, cone, band);
  return g;
}

export function makeBoulderMesh() {
  const g = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.25, 1),
    new THREE.MeshLambertMaterial({ color: 0xb8794a, flatShading: true }));
  rock.position.y = 1.15; rock.castShadow = true;
  // 줄무늬 (구르는 게 보이도록)
  const band = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.12, 6, 16), new THREE.MeshLambertMaterial({ color: 0x8c5532 }));
  rock.add(band);
  g.add(rock);
  g.userData.roller = rock;
  return g;
}

export function makeSnowmanMesh() {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const b1 = new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 10), white); b1.position.y = 0.6;
  const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), white); b2.position.y = 1.5;
  const b3 = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), white); b3.position.y = 2.15;
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0xff8a2a }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, 2.15, 0.45);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.4, 12), new THREE.MeshLambertMaterial({ color: 0x2b2d42 }));
  hat.position.y = 2.6;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 6, 14), new THREE.MeshLambertMaterial({ color: 0xff4f6d }));
  scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.85;
  for (const m of [b1, b2, b3]) m.castShadow = true;
  g.add(b1, b2, b3, nose, hat, scarf);
  return g;
}

// 바위: 굴러간 거리만큼 회전
export function syncBoulder(mesh, prop, dt) {
  mesh.position.set(prop.x, 0, prop.z);
  const s = prop.speed;
  if (s > 0.05) {
    const axisX = prop.vz / s, axisZ = -prop.vx / s;
    const r = mesh.userData.roller;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axisX, 0, axisZ), s * dt / 1.2);
    r.quaternion.premultiply(q);
  }
}

export function makeBarrelMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1.2, 16),
    new THREE.MeshLambertMaterial({ color: 0x3d8bff }));
  body.position.y = 0.6; body.castShadow = true;
  const ring = new THREE.MeshLambertMaterial({ color: 0xffffff });
  for (const y of [0.3, 0.9]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.05, 6, 18), ring);
    r.rotation.x = Math.PI / 2; r.position.y = y;
    g.add(r);
  }
  g.add(body);
  return g;
}

// 소품 위치·넘어짐 연출 동기화
export function syncProp(mesh, prop, dt) {
  // 넘어질 때 몸통 반지름만큼 들어 올려 땅에 묻히지 않게
  mesh.position.set(prop.x, Math.sin(Math.min(prop.tip, Math.PI / 2)) * (prop.colliders[0].r * 0.9), prop.z);
  const s = prop.speed;
  // 세게 맞으면 넘어졌다가 다시 일어남 (오뚝이 느낌)
  if (s > 3) { prop.tip = Math.min(1.3, prop.tip + s * dt * 0.9); prop.tipDir = Math.atan2(prop.vx, prop.vz); }
  else prop.tip = Math.max(0, prop.tip - dt * 1.4);
  prop.spinVis += prop.av * dt;
  mesh.rotation.set(0, 0, 0);
  mesh.rotateY(prop.tipDir);
  mesh.rotateX(prop.tip);
  mesh.rotateY(prop.spinVis);
}
