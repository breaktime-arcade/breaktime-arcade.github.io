/*!
 * 작은 마을 성장 일기 — 건물 모델 (절차적 로우폴리)
 * © 쉬는시간 오락실. All rights reserved.
 */
import * as THREE from 'three';
import { mulberry32 } from './map.js';

// 공유 상태: 눈 쌓임, 창문 불빛
export const SHARED = { snow: { value: 0 }, glow: { value: 0 } };
const cache = new Map();
export function snowify(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = SHARED.snow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      #ifdef USE_INSTANCING
        vWN = normalize(mat3(modelMatrix * instanceMatrix) * objectNormal);
        vWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
      #else
        vWN = normalize(mat3(modelMatrix) * objectNormal);
        vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
      #endif`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uSnow; varying vec3 vWN; varying vec3 vWP;
      float sHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float sNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(sHash(i), sHash(i+vec2(1,0)), f.x), mix(sHash(i+vec2(0,1)), sHash(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      { float up = smoothstep(0.35, 0.8, vWN.y);
        float n = sNoise(vWP.xz * 1.7) * 0.5 + sNoise(vWP.xz * 5.0) * 0.5;
        float sn = up * smoothstep(1.0 - uSnow * 1.15, 1.05 - uSnow, n * 0.5 + 0.5 * uSnow);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), clamp(sn, 0.0, 1.0)); }`);
  };
  mat.customProgramCacheKey = () => 'snow';
  return mat;
}
export function M(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (cache.has(key)) return cache.get(key);
  const { snow, ...rest } = o;
  let m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...rest });
  if (snow) m = snowify(m);
  cache.set(key, m); return m;
}
export const WIN = new THREE.MeshStandardMaterial({ color: 0x3a4a5e, roughness: 0.25, metalness: 0.1, emissive: 0xffb347, emissiveIntensity: 0 });
export const LAMP = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffc860, emissiveIntensity: 0.2 });
export function updateShared(night) { WIN.emissiveIntensity = night * 1.9; LAMP.emissiveIntensity = 0.15 + night * 2.2; }

const box = (g, w, h, d, m, x = 0, y = 0, z = 0, ry = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
const cyl = (g, rt, rb, h, m, x = 0, y = 0, z = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };

// 박공지붕 (용마루가 x축 방향)
function gableGeo(w, d, h, over = 0.25) {
  const W = w / 2 + over, D = d / 2 + over;
  const v = [
    -W, 0, -D, W, 0, -D, W, h, 0, -W, 0, -D, W, h, 0, -W, h, 0,
    -W, 0, D, -W, h, 0, W, h, 0, -W, 0, D, W, h, 0, W, 0, D,
    -W + over, 0, -D + over, -W + over, h, 0, -W + over, 0, D - over,
    W - over, 0, -D + over, W - over, 0, D - over, W - over, h, 0,
  ];
  // 모든 삼각형이 바깥을 향하도록 감기 방향 보정
  const c = new THREE.Vector3(0, h * 0.3, 0), A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  for (let i = 0; i < v.length; i += 9) {
    A.fromArray(v, i); B.fromArray(v, i + 3); Cc.fromArray(v, i + 6);
    n.subVectors(B, A).cross(m.subVectors(Cc, A));
    const cen = A.clone().add(B).add(Cc).multiplyScalar(1 / 3).sub(c);
    if (n.dot(cen) < 0) for (let k = 0; k < 3; k++) { const t = v[i + 3 + k]; v[i + 3 + k] = v[i + 6 + k]; v[i + 6 + k] = t; }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g;
}
function roof(g, w, d, h, mat, y, gableMat, over = 0.25, ry = 0) {
  const o = new THREE.Mesh(gableGeo(w, d, h, over), mat); o.position.y = y; o.rotation.y = ry; o.castShadow = true; o.receiveShadow = true; g.add(o);
  // 용마루 장식
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + over * 2 + 0.05, 0.1, 0.16), mat); ridge.position.y = y + h; ridge.rotation.y = ry; g.add(ridge);
  return o;
}
function window2(g, x, y, z, ry, w = 0.5, h = 0.6, frame = '#f4ead8') {
  const fw = new THREE.Group(); fw.position.set(x, y, z); fw.rotation.y = ry; g.add(fw);
  box(fw, w + 0.12, h + 0.12, 0.06, M(frame), 0, 0, 0);
  const gl = box(fw, w, h, 0.08, WIN, 0, 0, 0.01); gl.castShadow = false;
  box(fw, 0.05, h, 0.1, M(frame), 0, 0, 0.02); box(fw, w, 0.05, 0.1, M(frame), 0, 0, 0.02);
  return fw;
}
function door(g, x, y, z, ry, color = '#6b4228', w = 0.6, h = 1.0) {
  const d = new THREE.Group(); d.position.set(x, y, z); d.rotation.y = ry; g.add(d);
  box(d, w + 0.12, h + 0.08, 0.05, M('#4a2e1c'), 0, h / 2, 0); box(d, w, h, 0.08, M(color), 0, h / 2, 0.01);
  const k = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), M('#e8c060', { metalness: 0.6 })); k.position.set(w * 0.3, h * 0.45, 0.07); d.add(k);
  return d;
}
function flowerBox(g, x, y, z, ry, rng) {
  const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.y = ry; g.add(f);
  box(f, 0.7, 0.14, 0.18, M('#7a5232'), 0, 0, 0);
  const cols = ['#ff6b8a', '#ffd23f', '#ff9f43', '#c77dff', '#ffffff'];
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), M(cols[Math.floor(rng() * 5)], { emissive: '#221111' })); s.position.set(-0.26 + i * 0.13, 0.1, 0); f.add(s); }
}
function chimney(g, x, y, z, h = 0.9, mat = M('#8a7a6a')) { box(g, 0.34, h, 0.34, mat, x, y + h / 2, z); box(g, 0.42, 0.1, 0.42, M('#5a4a3a'), x, y + h, z); return new THREE.Vector3(x, y + h + 0.1, z); }

const ROOFS = ['#c8553d', '#3d6fa8', '#4f8a4a', '#8a5a3a', '#b04a6a', '#2f7f86', '#d07a2c'];
const WALLS = ['#f4ead8', '#f7e3c4', '#e9f0f4', '#f6dcd4', '#e7efd9', '#fbe9b7', '#e5dcf2'];
const BRICKS = ['#b5533c', '#c46a46', '#9f5a48', '#a8a29a', '#c9a27e'];

export function makeBuilding(b) {
  const rng = mulberry32(b.variant + 17);
  const g = new THREE.Group();
  const info = { chimneys: [], spin: null, height: 2.5, fountain: null, forge: null, saw: null };
  const roofC = ROOFS[Math.floor(rng() * ROOFS.length)];
  const wallC = WALLS[Math.floor(rng() * WALLS.length)];
  const rM = M(roofC, { snow: true }), wM = M(wallC), wood = M('#7a5232'), dark = M('#4a3220'), stone = M('#a39d92');
  const t = b.type;
  if (t === 'hut') {
    box(g, 2.5, 1.5, 2.1, M('#9a6a3e'), 0, 0.75, 0);
    for (let i = 0; i < 5; i++) box(g, 2.56, 0.07, 2.16, M('#7a5030'), 0, 0.2 + i * 0.3, 0);
    const th = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.5, 4), M('#d4a94f', { snow: true })); th.rotation.y = Math.PI / 4; th.position.y = 2.2; th.scale.set(1, 1, 0.88); th.castShadow = true; g.add(th);
    door(g, 0, 0, 1.06, 0, '#8a5a34', 0.55, 0.95);
    window2(g, 0.85, 0.95, 1.06, 0, 0.36, 0.36, '#c9a46a');
    for (let i = 0; i < 3; i++) cyl(g, 0.12, 0.12, 0.9, wood, -1.55, 0.12 + i * 0.22, -0.5 + i * 0.05).rotation.x = Math.PI / 2;
    info.chimneys.push(new THREE.Vector3(0.4, 2.6, 0)); info.height = 3;
  } else if (t === 'house') {
    const w = 3.2, d = 2.6, h = 2.0;
    box(g, w + 0.15, 0.3, d + 0.15, stone, 0, 0.15, 0);
    box(g, w, h, d, wM, 0, 0.3 + h / 2, 0);
    for (const x of [-w / 2, 0, w / 2]) box(g, 0.12, h, 0.12, dark, x, 0.3 + h / 2, d / 2 + 0.01);
    box(g, w, 0.1, 0.1, dark, 0, 0.3 + h * 0.55, d / 2 + 0.02);
    roof(g, w, d, 1.3, rM, 0.3 + h, null);
    door(g, -0.6, 0.3, d / 2 + 0.02, 0, ['#3d6fa8', '#6b4228', '#4f8a4a', '#b04a3a'][Math.floor(rng() * 4)]);
    window2(g, 0.8, 1.35, d / 2 + 0.02, 0); window2(g, -w / 2 - 0.02, 1.35, 0, -Math.PI / 2); window2(g, w / 2 + 0.02, 1.35, 0, Math.PI / 2);
    flowerBox(g, 0.8, 0.92, d / 2 + 0.1, 0, rng);
    info.chimneys.push(chimney(g, 0.9, 2.6, -0.5)); info.height = 3.8;
    if (rng() < 0.6) { for (let i = 0; i < 6; i++) box(g, 0.07, 0.55, 0.07, M('#f2ead8'), -1.75 + i * 0.34 - 0.2, 0.27, d / 2 + 1.1); box(g, 1.9, 0.06, 0.05, M('#f2ead8'), -1.1, 0.42, d / 2 + 1.1); }
  } else if (t === 'brick') {
    const w = 3.4, d = 2.8, h = 3.4, bc = BRICKS[Math.floor(rng() * BRICKS.length)];
    box(g, w + 0.2, 0.35, d + 0.2, M('#8a8580'), 0, 0.17, 0);
    box(g, w, h, d, M(bc), 0, 0.35 + h / 2, 0);
    box(g, w + 0.1, 0.12, d + 0.1, M('#e9e1d2'), 0, 0.35 + h / 2, 0);
    roof(g, w, d, 1.4, M(['#3a4a5e', '#2f6f74', '#6a3a3a', '#4a5a3a'][Math.floor(rng() * 4)], { snow: true }), 0.35 + h, null, 0.3);
    door(g, 0, 0.35, d / 2 + 0.02, 0, '#2f5f8a', 0.7, 1.15);
    box(g, 1.0, 0.12, 0.4, M('#8a8580'), 0, 0.35, d / 2 + 0.2);
    for (const x of [-1.05, 1.05]) window2(g, x, 1.25, d / 2 + 0.02, 0, 0.5, 0.7, '#fff6e6');
    for (const x of [-1.05, 0, 1.05]) window2(g, x, 2.85, d / 2 + 0.02, 0, 0.46, 0.66, '#fff6e6');
    for (const z of [-0.6, 0.6]) { window2(g, -w / 2 - 0.02, 2.85, z, -Math.PI / 2, 0.42, 0.6, '#fff6e6'); window2(g, w / 2 + 0.02, 2.85, z, Math.PI / 2, 0.42, 0.6, '#fff6e6'); }
    box(g, 1.4, 0.08, 0.5, dark, 0, 2.35, d / 2 + 0.25); for (let i = 0; i < 6; i++) box(g, 0.04, 0.4, 0.04, dark, -0.65 + i * 0.26, 2.55, d / 2 + 0.48);
    flowerBox(g, -1.05, 0.88, d / 2 + 0.1, 0, rng); flowerBox(g, 1.05, 0.88, d / 2 + 0.1, 0, rng);
    info.chimneys.push(chimney(g, -1.1, 4.3, -0.4, 1.0, M(bc))); info.height = 5.4;
  } else if (t === 'well') {
    const ring = cyl(g, 0.9, 0.95, 0.75, stone, 0, 0.37, 0, 12);
    const wat = new THREE.Mesh(new THREE.CircleGeometry(0.72, 14), M('#3a8fb8', { roughness: 0.1, flatShading: false })); wat.rotation.x = -Math.PI / 2; wat.position.y = 0.6; g.add(wat);
    for (const x of [-0.8, 0.8]) box(g, 0.12, 1.6, 0.12, wood, x, 1.1, 0);
    box(g, 1.8, 0.08, 0.08, wood, 0, 1.75, 0);
    roof(g, 1.6, 1.2, 0.6, M('#b05a3a', { snow: true }), 1.85, null, 0.15);
    cyl(g, 0.14, 0.11, 0.2, M('#8a6a48'), 0.15, 1.35, 0);
    info.height = 2.6;
  } else if (t === 'storehouse') {
    const w = 4.2, d = 3.2, h = 2.6;
    box(g, w, h, d, M('#b5432f'), 0, h / 2, 0);
    roof(g, w, d, 1.6, M('#5a4a3a', { snow: true }), h, null, 0.3);
    box(g, 1.6, 1.9, 0.08, M('#f2ead8'), 0, 0.95, d / 2 + 0.02); box(g, 1.4, 1.75, 0.1, M('#8a3a2a'), 0, 0.92, d / 2 + 0.03);
    const x1 = box(g, 1.9, 0.08, 0.12, M('#f2ead8'), 0, 0.92, d / 2 + 0.08); x1.rotation.z = 0.85; const x2 = box(g, 1.9, 0.08, 0.12, M('#f2ead8'), 0, 0.92, d / 2 + 0.08); x2.rotation.z = -0.85;
    for (let i = 0; i < 3; i++) cyl(g, 0.38, 0.38, 0.6, M('#e3c25a', { snow: true }), 1.6 + (i % 2) * 0.3, 0.3 + Math.floor(i / 2) * 0.6, 2.1 - i * 0.2, 10).rotation.z = Math.PI / 2;
    window2(g, 0, 2.2, d / 2 + 0.02, 0, 0.5, 0.4); info.height = 4.4;
  } else if (t === 'quarry') {
    for (let i = 0; i < 7; i++) box(g, 0.8, 0.6, 0.8, M(['#b9b2a6', '#a39d92', '#c7c0b2'][i % 3]), -1.4 + (i % 3) * 0.85, 0.3 + Math.floor(i / 3) * 0.6, -1 + (i % 2) * 0.3);
    box(g, 0.2, 3.6, 0.2, wood, 1.6, 1.8, 0); const arm = box(g, 3.2, 0.16, 0.16, wood, 0.6, 3.5, 0); arm.rotation.z = -0.25;
    const rope = cyl(g, 0.02, 0.02, 1.8, M('#ddd'), -0.6, 2.5, 0); const blk = box(g, 0.6, 0.5, 0.6, stone, -0.6, 1.4, 0);
    box(g, 1.4, 0.4, 0.9, wood, 1.5, 0.45, 1.6); for (const x of [1.0, 2.0]) cyl(g, 0.25, 0.25, 0.1, dark, x, 0.25, 2.08).rotation.x = Math.PI / 2;
    info.height = 3.8;
  } else if (t === 'lumbermill') {
    for (const [x, z] of [[-1.8, -1.2], [1.8, -1.2], [-1.8, 1.2], [1.8, 1.2]]) box(g, 0.18, 2.4, 0.18, wood, x, 1.2, z);
    const r = box(g, 4.2, 0.14, 3.2, M('#7a6a4a', { snow: true }), 0, 2.5, 0); r.rotation.x = 0.18;
    box(g, 2.8, 0.7, 0.9, wood, 0, 0.55, 0);
    const saw = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), M('#c0c8d0', { metalness: 0.7, roughness: 0.3 })); saw.rotation.x = Math.PI / 2; saw.position.set(0, 1.05, 0); g.add(saw); info.saw = saw;
    for (let i = 0; i < 6; i++) cyl(g, 0.22, 0.22, 2.6, M('#8a6038'), 2.8 + (i % 3) * 0.45, 0.22 + Math.floor(i / 3) * 0.4, 0.3, 8).rotation.x = Math.PI / 2;
    info.height = 3;
  } else if (t === 'bridge') {
    const L = 7.6;
    const deck = box(g, 2.2, 0.3, L, M('#b9b0a0', { snow: true }), 0, 0.95, 0);
    for (const s of [-1, 1]) { box(g, 0.2, 0.45, L, M('#a39a8a'), s * 1.0, 1.3, 0); for (let i = 0; i < 5; i++) box(g, 0.26, 0.6, 0.26, M('#8f877a'), s * 1.0, 1.35, -L / 2 + 0.2 + i * (L - 0.4) / 4); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.32, 6, 16, Math.PI), M('#a39a8a')); arch.rotation.y = Math.PI / 2; arch.position.y = -0.9; arch.scale.set(1, 0.85, 1.6); g.add(arch);
    for (const z of [-L / 2 + 0.6, L / 2 - 0.6]) box(g, 2.2, 1.6, 1.0, M('#9a9282'), 0, 0.1, z);
    info.height = 1.6;
  } else if (t === 'smithy') {
    const w = 3.6, d = 3, h = 2.2;
    box(g, w, h, d, M('#8f8a82'), 0, h / 2, 0);
    roof(g, w, d, 1.1, M('#3a3a42', { snow: true }), h, null);
    box(g, 1.8, 1.6, 0.1, M('#2a2622'), 0.5, 0.8, d / 2 + 0.01);
    const forge = box(g, 0.9, 0.5, 0.6, new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5a10, emissiveIntensity: 2.2 }), 0.5, 0.6, d / 2 - 0.25); info.forge = forge;
    cyl(g, 0.22, 0.3, 0.5, M('#2b2b2b', { metalness: 0.6 }), -0.9, 0.25, d / 2 + 0.7); box(g, 0.6, 0.18, 0.25, M('#2b2b2b', { metalness: 0.6 }), -0.9, 0.58, d / 2 + 0.7);
    info.chimneys.push(chimney(g, -1.2, 2.2, -0.6, 1.8, M('#6f6a62'))); info.height = 4.2;
  } else if (t === 'bakery') {
    const w = 3.4, d = 2.8, h = 2.3;
    box(g, w, h, d, M('#f8e6c8'), 0, h / 2, 0);
    roof(g, w, d, 1.3, M('#d07a2c', { snow: true }), h, null);
    for (let i = 0; i < 7; i++) { const a = box(g, 0.49, 0.06, 0.9, M(i % 2 ? '#ffffff' : '#e8553e'), -1.47 + i * 0.49, 1.85, d / 2 + 0.4); a.rotation.x = 0.35; }
    door(g, -0.8, 0, d / 2 + 0.02, 0, '#6b4228'); window2(g, 0.7, 1.1, d / 2 + 0.02, 0, 1.0, 0.7);
    const sign = cyl(g, 0.38, 0.38, 0.08, M('#e2a85a'), 1.4, 2.0, d / 2 + 0.3, 14); sign.rotation.x = Math.PI / 2;
    info.chimneys.push(chimney(g, 1.0, 2.9, -0.5)); info.height = 4;
  } else if (t === 'windmill') {
    cyl(g, 1.0, 1.5, 5.2, M('#f2ebdc'), 0, 2.6, 0, 8);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.4, 8), M('#8a4a3a', { snow: true })); cap.position.y = 5.9; cap.castShadow = true; g.add(cap);
    door(g, 0, 0, 1.45, 0, '#6b4228', 0.6, 1.1); window2(g, 0, 3.2, 1.2, 0, 0.4, 0.5);
    const hub = new THREE.Group(); hub.position.set(0, 5.1, 1.35); g.add(hub);
    cyl(hub, 0.18, 0.18, 0.4, dark).rotation.x = Math.PI / 2;
    for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; hub.add(arm); box(arm, 0.12, 3.6, 0.08, wood, 0, 1.9, 0.1); box(arm, 0.7, 3.0, 0.03, M('#f6f0e2', { side: THREE.DoubleSide }), 0.4, 2.1, 0.12); }
    info.spin = hub; info.height = 8.5;
  } else if (t === 'market') {
    const cols = ['#e8553e', '#3b82c4', '#3aa05a', '#e2a02a'];
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Group(); s.position.set(-4.5 + k * 3, 0, 0); g.add(s);
      box(s, 2.2, 0.9, 1.0, wood, 0, 0.45, 0.3);
      for (const [x, z] of [[-1, -0.2], [1, -0.2], [-1, 0.8], [1, 0.8]]) box(s, 0.08, 2.1, 0.08, dark, x, 1.05, z);
      for (let i = 0; i < 5; i++) box(s, 0.46, 0.06, 1.4, M(i % 2 ? '#ffffff' : cols[k], { snow: true }), -0.92 + i * 0.46, 2.15, 0.3).rotation.x = 0.12;
      const fc = ['#ff6b3a', '#ffd23f', '#7bc950', '#c94f6d', '#e8a040'];
      for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), M(fc[(i + k) % 5])); f.position.set(-0.7 + (i % 3) * 0.5, 0.98, 0.15 + Math.floor(i / 3) * 0.35); g.add(f); f.position.x += -4.5 + k * 3; }
    }
    info.height = 2.4;
  } else if (t === 'school') {
    const w = 6.2, d = 3.2, h = 2.6;
    box(g, w + 0.2, 0.3, d + 0.2, stone, 0, 0.15, 0);
    box(g, w, h, d, M('#fbf5ea'), 0, 0.3 + h / 2, 0);
    roof(g, w, d, 1.4, M('#c8453d', { snow: true }), 0.3 + h, null);
    door(g, 0, 0.3, d / 2 + 0.02, 0, '#3d6fa8', 0.9, 1.3);
    for (const x of [-2.2, -1.2, 1.2, 2.2]) window2(g, x, 1.6, d / 2 + 0.02, 0, 0.6, 0.8);
    const tower = new THREE.Group(); tower.position.set(0, 0.3 + h + 1.1, 0); g.add(tower);
    box(tower, 1.0, 1.0, 1.0, M('#fbf5ea'), 0, 0.6, 0);
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.45, 10, 1, true), M('#e8b83a', { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })); bell.position.set(0, 0.6, 0); tower.add(bell);
    const tr = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.0, 4), M('#c8453d', { snow: true })); tr.rotation.y = Math.PI / 4; tr.position.y = 1.6; tower.add(tr);
    cyl(g, 0.04, 0.04, 3.6, M('#ddd'), 3.8, 1.8, 1.6); const fl = box(g, 0.9, 0.55, 0.03, M('#3b82c4'), 4.25, 3.3, 1.6);
    info.flag = fl; info.height = 6;
  } else if (t === 'fountain') {
    cyl(g, 2.6, 2.8, 0.5, M('#c9c2b4'), 0, 0.25, 0, 20);
    const w1 = new THREE.Mesh(new THREE.CircleGeometry(2.35, 24), M('#5ab4d6', { roughness: 0.08, flatShading: false, emissive: '#0a2a3a' })); w1.rotation.x = -Math.PI / 2; w1.position.y = 0.46; g.add(w1);
    cyl(g, 0.35, 0.5, 1.6, M('#d8d0c0'), 0, 1.0, 0, 10);
    cyl(g, 1.1, 0.8, 0.3, M('#d8d0c0'), 0, 1.75, 0, 16);
    const w2 = new THREE.Mesh(new THREE.CircleGeometry(0.95, 18), w1.material); w2.rotation.x = -Math.PI / 2; w2.position.y = 1.91; g.add(w2);
    cyl(g, 0.16, 0.22, 0.8, M('#d8d0c0'), 0, 2.3, 0, 8);
    info.fountain = new THREE.Vector3(0, 2.75, 0); info.height = 3;
  } else if (t === 'clinic') {
    const w = 3.8, d = 3, h = 2.5;
    box(g, w, h, d, M('#ffffff'), 0, h / 2, 0);
    roof(g, w, d, 1.2, M('#2f8f86', { snow: true }), h, null);
    door(g, 0, 0, d / 2 + 0.02, 0, '#3aa05a', 0.8, 1.2);
    for (const x of [-1.2, 1.2]) window2(g, x, 1.4, d / 2 + 0.02, 0, 0.6, 0.6);
    box(g, 0.7, 0.2, 0.08, M('#e03a3a', { emissive: '#600' }), 0, 2.15, d / 2 + 0.05); box(g, 0.2, 0.7, 0.08, M('#e03a3a', { emissive: '#600' }), 0, 2.15, d / 2 + 0.05);
    info.height = 4;
  } else if (t === 'inn') {
    const w = 4.2, d = 3.2, h = 3.6;
    box(g, w, h, d, M('#f3e1c0'), 0, h / 2, 0);
    for (const x of [-w / 2, -w / 6, w / 6, w / 2]) box(g, 0.14, h, 0.14, dark, x, h / 2, d / 2 + 0.01);
    box(g, w, 0.14, 0.14, dark, 0, h / 2, d / 2 + 0.02);
    roof(g, w, d, 1.6, M('#7a3a2a', { snow: true }), h, null, 0.3);
    door(g, 0, 0, d / 2 + 0.03, 0, '#7a4a2a', 0.8, 1.2);
    for (const x of [-1.4, 1.4]) window2(g, x, 1.1, d / 2 + 0.03, 0, 0.55, 0.6);
    for (const x of [-1.4, 0, 1.4]) window2(g, x, 2.7, d / 2 + 0.03, 0, 0.5, 0.6);
    box(g, 0.08, 0.08, 0.9, dark, 1.0, 1.9, d / 2 + 0.45); const sg = box(g, 0.8, 0.5, 0.06, M('#e2a85a'), 1.0, 1.55, d / 2 + 0.85);
    for (const x of [-0.6, 0.6]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), LAMP); l.position.set(x, 1.5, d / 2 + 0.2); g.add(l); }
    info.chimneys.push(chimney(g, 1.3, 4.6, -0.6)); info.height = 5.6;
  } else if (t === 'townhall') {
    const w = 6.6, d = 4.4, h = 3.4;
    box(g, w + 0.6, 0.5, d + 0.8, M('#d8d0c0'), 0, 0.25, 0.2);
    box(g, w, h, d, M('#efe6d4'), 0, 0.5 + h / 2, 0);
    for (let i = 0; i < 5; i++) cyl(g, 0.22, 0.25, h, M('#fffaf0'), -2.4 + i * 1.2, 0.5 + h / 2, d / 2 + 0.45, 10);
    box(g, w, 0.35, 1.1, M('#fffaf0'), 0, 0.5 + h + 0.15, d / 2 + 0.3);
    roof(g, w, d + 0.8, 1.3, M('#4a5a7a', { snow: true }), 0.5 + h + 0.3, null, 0.2);
    door(g, 0, 0.5, d / 2 + 0.02, 0, '#7a3a2a', 1.0, 1.6);
    for (const x of [-2.2, 2.2]) { window2(g, x, 1.4, d / 2 + 0.02, 0, 0.6, 0.9); window2(g, x, 3.0, d / 2 + 0.02, 0, 0.6, 0.7); }
    const tw = new THREE.Group(); tw.position.set(0, 0.5 + h + 1.2, -0.4); g.add(tw);
    box(tw, 1.6, 2.6, 1.6, M('#efe6d4'), 0, 1.0, 0);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xffe9a0, emissiveIntensity: 0.4 })); face.position.set(0, 1.5, 0.81); tw.add(face);
    const hh = box(tw, 0.06, 0.32, 0.04, M('#222'), 0, 1.6, 0.84); const mh = box(tw, 0.04, 0.46, 0.04, M('#222'), 0, 1.65, 0.85);
    hh.geometry.translate(0, 0.12, 0); mh.geometry.translate(0, 0.18, 0); hh.position.y = 1.5; mh.position.y = 1.5;
    info.clock = { h: hh, m: mh };
    const sp = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.8, 4), M('#4a5a7a', { snow: true })); sp.rotation.y = Math.PI / 4; sp.position.y = 3.2; tw.add(sp);
    cyl(tw, 0.03, 0.03, 1.2, M('#ddd'), 0, 4.6, 0); info.flag = box(tw, 0.7, 0.42, 0.03, M('#e8553e'), 0.36, 4.95, 0);
    info.height = 9.5;
  } else if (t === 'library') {
    const w = 4.8, d = 3.6, h = 3.0;
    box(g, w + 0.3, 0.4, d + 0.3, M('#c9c2b4'), 0, 0.2, 0);
    box(g, w, h, d, M('#c46a46'), 0, 0.4 + h / 2, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#3f9a92', { snow: true, metalness: 0.3 })); dome.position.y = 0.4 + h; dome.castShadow = true; g.add(dome);
    box(g, w + 0.2, 0.25, d + 0.2, M('#e9e1d2'), 0, 0.4 + h + 0.05, 0);
    door(g, 0, 0.4, d / 2 + 0.02, 0, '#2f4f6f', 0.9, 1.5);
    for (const x of [-1.6, 1.6]) window2(g, x, 1.9, d / 2 + 0.02, 0, 0.6, 1.4, '#e9e1d2');
    info.height = 6;
  } else if (t === 'station') {
    box(g, 9, 0.6, 3.2, M('#b9b0a0', { snow: true }), 0, 0.3, 0);
    const w = 4.2, d = 2.6, h = 2.6;
    box(g, w, h, d, M('#f0dcc0'), 0, 0.6 + h / 2, -0.9);
    roof(g, w, d, 1.2, M('#2f5f8a', { snow: true }), 0.6 + h, null);
    for (const x of [-3.6, -1.8, 1.8, 3.6]) cyl(g, 0.08, 0.08, 2.4, dark, x, 1.8, 1.2);
    const can = box(g, 9, 0.12, 1.8, M('#2f5f8a', { snow: true }), 0, 3.05, 0.7); can.rotation.x = -0.1;
    door(g, 0, 0.6, -0.9 + d / 2 + 0.02, 0, '#7a3a2a', 0.9, 1.3);
    for (const x of [-1.4, 1.4]) window2(g, x, 1.6, -0.9 + d / 2 + 0.02, 0, 0.6, 0.7);
    const clk = new THREE.Mesh(new THREE.CircleGeometry(0.35, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe9a0, emissiveIntensity: 0.4 })); clk.position.set(0, 2.85, -0.9 + d / 2 + 0.05); g.add(clk);
    for (const x of [-4, 4]) { cyl(g, 0.05, 0.06, 2.4, dark, x, 1.8, 1.4); const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), LAMP); l.position.set(x, 3.05, 1.4); g.add(l); }
    info.height = 4.5;
  }
  g.traverse(o => { if (o.isMesh && o.material !== WIN) { o.castShadow = true; o.receiveShadow = true; } });
  info.group = g;
  return info;
}

// 공사 비계
export function makeScaffold(b, h) {
  const g = new THREE.Group();
  const sz = { hut: [2.8, 2.4], house: [3.6, 3], brick: [3.8, 3.2], storehouse: [4.6, 3.6], school: [6.6, 3.6], townhall: [7.2, 5.2], library: [5.2, 4], station: [9.2, 3.4], windmill: [3.2, 3.2], inn: [4.6, 3.6], market: [12, 2.2], fountain: [5.6, 5.6], bridge: [2.6, 7.8] }[b.type] || [4, 3.4];
  const [w, d] = sz; const pole = M('#c9a46a'), plank = M('#a87a48');
  h = Math.max(1.5, h);
  for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) box(g, 0.1, h, 0.1, pole, x, h / 2, z);
  for (let y = 1; y < h; y += 1.4) { box(g, w, 0.08, 0.08, pole, 0, y, -d / 2); box(g, w, 0.08, 0.08, pole, 0, y, d / 2); box(g, 0.08, 0.08, d, pole, -w / 2, y, 0); box(g, 0.08, 0.08, d, pole, w / 2, y, 0); box(g, w, 0.06, 0.45, plank, 0, y + 0.06, d / 2 + 0.2); }
  const br = box(g, Math.hypot(w, h) * 0.9, 0.06, 0.06, pole, 0, h / 2, d / 2 + 0.05); br.rotation.z = Math.atan2(h, w);
  // 자재 더미
  for (let i = 0; i < 4; i++) cyl(g, 0.12, 0.12, 1.4, M('#9a6a3e'), w / 2 + 0.8, 0.12 + i * 0.2, (i % 2) * 0.25, 6).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) box(g, 0.4, 0.3, 0.4, M('#b9b2a6'), -w / 2 - 0.7, 0.15 + i * 0.3, 0.2);
  return g;
}

// 밭 작물 형상 (밀 다발)
export function cropGeometry() {
  const parts = [];
  for (let i = 0; i < 5; i++) { const c = new THREE.ConeGeometry(0.06, 0.9, 3); c.translate(Math.cos(i * 1.3) * 0.12, 0.45, Math.sin(i * 1.3) * 0.12); c.rotateZ((i - 2) * 0.08); parts.push(c); const hd = new THREE.ConeGeometry(0.07, 0.25, 4); hd.translate(Math.cos(i * 1.3) * 0.13, 0.95, Math.sin(i * 1.3) * 0.13); parts.push(hd); }
  return parts;
}
