/*!
 * 작은 마을 성장 일기 — 3D 디오라마 월드
 * 떠 있는 섬 · 강과 폭포 · 사계절 · 낮밤 · 구름바다 · 틸트시프트
 * © 쉬는시간 오락실. All rights reserved.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry32, polyDist } from './map.js';
import { SHARED, snowify, M, WIN, LAMP, updateShared, makeBuilding, makeScaffold, cropGeometry } from './buildings.js';

const C = (h) => new THREE.Color(h);
const EXT = 40;   // 지면 텍스처 범위 (-40~40)
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const DAYKEYS = [
  { t: 0.00, top: '#5a6fb0', hor: '#f7b38f', sun: '#ffbf8a', sunI: 1.3, hs: '#b8c4ef', hg: '#7a6a5a', hI: 0.75, fog: '#e9c2aa', night: 0.12 },
  { t: 0.10, top: '#5fa2ea', hor: '#cfe8f7', sun: '#fff2dc', sunI: 2.7, hs: '#cde8ff', hg: '#7d6b50', hI: 1.0, fog: '#cfe6f4', night: 0 },
  { t: 0.40, top: '#3f8ee8', hor: '#b9e2f8', sun: '#fffaf2', sunI: 3.0, hs: '#d0eaff', hg: '#80705a', hI: 1.05, fog: '#c3e2f5', night: 0 },
  { t: 0.60, top: '#4d8fdc', hor: '#f6dcae', sun: '#ffd89c', sunI: 2.7, hs: '#e2e6f0', hg: '#80684a', hI: 0.95, fog: '#f0dcb8', night: 0 },
  { t: 0.71, top: '#4a4f96', hor: '#ff9a62', sun: '#ff8c4a', sunI: 1.7, hs: '#ffbe9a', hg: '#6a4a3a', hI: 0.75, fog: '#f4a77c', night: 0.1 },
  { t: 0.78, top: '#232a62', hor: '#8c5a8e', sun: '#b585c6', sunI: 0.9, hs: '#8a8cc0', hg: '#2c2a33', hI: 0.85, fog: '#4f4472', night: 0.6 },
  { t: 0.86, top: '#0a1030', hor: '#22305e', sun: '#a8bcff', sunI: 1.4, hs: '#7a88c0', hg: '#2a2a34', hI: 0.95, fog: '#1a2448', night: 1 },
  { t: 1.00, top: '#111a40', hor: '#3a3c70', sun: '#a8bcff', sunI: 1.3, hs: '#6070b8', hg: '#2a2832', hI: 0.9, fog: '#2a2f5c', night: 0.8 },
].map(k => ({ ...k, top: C(k.top), hor: C(k.hor), sun: C(k.sun), hs: C(k.hs), hg: C(k.hg), fog: C(k.fog) }));
function sampleDay(t) {
  t = ((t % 1) + 1) % 1; let i = 0; while (i < DAYKEYS.length - 2 && DAYKEYS[i + 1].t < t) i++;
  const a = DAYKEYS[i], b = DAYKEYS[i + 1], f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1), o = {};
  for (const k of ['top', 'hor', 'sun', 'hs', 'hg', 'fog']) o[k] = a[k].clone().lerp(b[k], f);
  for (const k of ['sunI', 'hI', 'night']) o[k] = a[k] + (b[k] - a[k]) * f;
  return o;
}
// 계절 키 (봄, 여름, 가을, 겨울)
const SEASON = [
  { grass: [1.08, 1.12, 0.86], light: [1, 1, 1], leaf: ['#8fd16a', '#a3dc78', '#7cc85a'], cherry: '#f7b3cf', crop: '#7cc850', cropH: 0.45, flower: 1, sat: 1.12 },
  { grass: [0.86, 1.0, 0.76], light: [1.03, 1, 0.95], leaf: ['#4f9a3a', '#5aa742', '#3f8a32'], cherry: '#5aa742', crop: '#6ab040', cropH: 0.95, flower: 0.85, sat: 1.15 },
  { grass: [1.28, 1.02, 0.58], light: [1.1, 0.98, 0.84], leaf: ['#e8902a', '#d9482b', '#e8c23a'], cherry: '#d9603a', crop: '#e3b23c', cropH: 1.05, flower: 0.25, sat: 1.18 },
  { grass: [0.88, 0.9, 0.88], light: [0.9, 0.96, 1.1], leaf: ['#a8977e', '#9a8a74', '#b0a088'], cherry: '#a8977e', crop: '#8a6a48', cropH: 0.02, flower: 0, sat: 0.92 },
].map(s => ({ ...s, grass: new THREE.Vector3(...s.grass), light: new THREE.Vector3(...s.light), leaf: s.leaf.map(C), cherry: C(s.cherry), crop: C(s.crop) }));

const NOISE = /* glsl */`
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; } return s; }`;

export class World {
  constructor(renderer, camera, map) {
    this.renderer = renderer; this.camera = camera; this.map = map;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xc3e2f5, 0.0024);
    this.time = 0; this.rng = mulberry32(11);
    this.wind = { value: 0 };
    this.models = new Map(); this.bursts = []; this.fwBursts = [];
    this.quality = 'high'; this.weatherMode = 'clear'; this.weatherA = 0; this.rainA = 0;
    this.buildSky(); this.buildCloudSea(); this.buildLights();
    this.buildIsland(); this.buildGroundCanvas(); this.buildRiver(); this.buildWaterfall();
    this.buildTrees(); this.buildRocksAndGrass(); this.buildFloaters(); this.buildBirds();
    this.buildFields(); this.buildLamps(); this.buildCemetery(); this.buildBalloons(); this.buildRail();
    this.buildParticles(); this.buildComposer();
  }

  // ───── 하늘·구름바다 ─────
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: C('#3f8ee8') }, uHor: { value: C('#b9e2f8') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: C('#fff') }, uNight: { value: 0 }, uTime: { value: 0 }, uMoonDir: { value: new THREE.Vector3(-0.4, 0.7, -0.6).normalize() } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `uniform vec3 uTop, uHor, uSunDir, uSunColor, uMoonDir; uniform float uNight, uTime; varying vec3 vDir; ${NOISE}
        float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
        void main(){ vec3 d = normalize(vDir); float y = d.y;
          vec3 col = mix(uHor, uTop, pow(smoothstep(-0.1, 0.8, y), 0.65));
          col = mix(col, uHor * 0.92, smoothstep(0.0, -0.5, y));
          float sd = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(sd, 1200.0) * 30.0 + pow(sd, 10.0) * 0.32) * (1.0 - uNight);
          float md = max(dot(d, uMoonDir), 0.0);
          col += vec3(0.9, 0.93, 1.0) * (smoothstep(0.9994, 0.9997, md) * 3.0 + pow(md, 50.0) * 0.15) * uNight;
          float s = h3(floor(d * 300.0));
          col += vec3(1.0) * step(0.9972, s) * (0.6 + 0.4 * sin(uTime * 3.0 + s * 90.0)) * uNight * smoothstep(-0.05, 0.3, y) * 1.8;
          float mw = fbm(d.xz * 4.0 + 7.0) * smoothstep(0.32, 0.0, abs(d.x * 0.7 + d.z * 0.7 - 0.05));
          col += vec3(0.4, 0.42, 0.65) * mw * 0.35 * uNight;
          gl_FragColor = vec4(col, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat); this.sky.frustumCulled = false; this.scene.add(this.sky);
  }
  buildCloudSea() {
    this.seaU = { uTime: { value: 0 }, uCloud: { value: C('#ffffff') }, uShade: { value: C('#b8c8e8') }, uHor: { value: C('#b9e2f8') }, uNight: { value: 0 } };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1), new THREE.ShaderMaterial({
      uniforms: this.seaU, fog: false,
      vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime, uNight; uniform vec3 uCloud, uShade, uHor; varying vec3 vW; ${NOISE}
        void main(){ vec2 p = vW.xz * 0.012; float n = fbm(p + vec2(uTime*0.01, uTime*0.006));
          float n2 = fbm(p * 2.7 - vec2(uTime*0.015, 0.0));
          float c = smoothstep(0.32, 0.7, n * 0.75 + n2 * 0.35);
          vec3 col = mix(uShade, uCloud, c);
          col += uCloud * pow(c, 3.0) * 0.25 * (1.0 - uNight);
          float d = length(vW.xz);
          col = mix(col, uHor, smoothstep(180.0, 900.0, d));
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    sea.rotation.x = -Math.PI / 2; sea.position.y = -34; this.scene.add(sea);
    // 떠다니는 뭉게구름
    const rng = mulberry32(31);
    this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x777777 });
    this.clouds = [];
    for (let i = 0; i < 22; i++) {
      const geo = mergeGeometries([...Array(5 + Math.floor(rng() * 3))].map((_, k) => { const s = new THREE.IcosahedronGeometry(2.4 + rng() * 2.6, 1); s.translate((k - 2.5) * 3 + rng() * 2, rng() * 1.6, rng() * 3); s.scale(1, 0.6, 1); return s; }));
      const c = new THREE.Mesh(geo, this.cloudMat);
      const a = rng() * 6.28, r = 55 + rng() * 120, below = i < 12;
      c.position.set(Math.cos(a) * r, below ? -12 - rng() * 14 : 28 + rng() * 20, Math.sin(a) * r);
      c.userData = { a, r, s: (0.006 + rng() * 0.01) * (rng() < 0.5 ? 1 : -1), y: c.position.y };
      this.scene.add(c); this.clouds.push(c);
    }
  }
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xd0eaff, 0x80705a, 1); this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera; s.left = -44; s.right = 44; s.top = 44; s.bottom = -44; s.near = 10; s.far = 260;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04; sun.shadow.radius = 2.5;
    this.scene.add(sun, sun.target);
  }

  // ───── 섬 ─────
  buildIsland() {
    const m = this.map, rng = mulberry32(3);
    const geo = new THREE.PlaneGeometry(EXT * 2, EXT * 2, 190, 190); geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), z = pos.getZ(i);
      const ang = Math.atan2(z, x), er = m.edgeR(ang) - 0.05, d = Math.hypot(x, z);
      if (d > er) { x = Math.cos(ang) * er; z = Math.sin(ang) * er; }
      else { x += (rng() - 0.5) * 0.12; z += (rng() - 0.5) * 0.12; }
      pos.setXYZ(i, x, m.h(x, z), z);
      uv.setXY(i, (x + EXT) / (EXT * 2), 1 - (z + EXT) / (EXT * 2));
    }
    const g = geo.toNonIndexed(); g.computeVertexNormals();
    this.terrainU = { uGrass: { value: new THREE.Vector3(1, 1, 1) } };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true });
    const self = this;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSnow = SHARED.snow; sh.uniforms.uGrass = self.terrainU.uGrass;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN; varying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWN = normalize(mat3(modelMatrix) * objectNormal); vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uSnow; uniform vec3 uGrass; varying vec3 vWN; varying vec3 vWP; ${NOISE}`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 c = diffuseColor.rgb; float green = smoothstep(0.02, 0.12, c.g - max(c.r, c.b));
          diffuseColor.rgb = mix(c, c * uGrass, green);
          float up = smoothstep(0.55, 0.9, vWN.y);
          float n = vnoise(vWP.xz * 0.9) * 0.6 + vnoise(vWP.xz * 3.1) * 0.4;
          float sn = up * smoothstep(0.95 - uSnow, 1.02 - uSnow * 0.9, n * 0.45 + uSnow * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.97, 1.0), clamp(sn, 0.0, 1.0)); }`);
    };
    mat.customProgramCacheKey = () => 'terrain';
    this.terrainMat = mat;
    this.terrain = new THREE.Mesh(g, mat); this.terrain.receiveShadow = true; this.terrain.castShadow = true;
    this.scene.add(this.terrain);

    // 절벽 (층층이 쌓인 지층)
    const N = 260;
    const layers = [
      { dy: 0.08, r: 0.15, c: '#5f9a3e' }, { dy: -0.55, r: 0.35, c: '#4f8a36' }, { dy: -1.2, r: 0.2, c: '#8a6440' },
      { dy: -3.2, r: -0.9, c: '#7a5636' }, { dy: -6.2, r: -3.0, c: '#9a7a5a' }, { dy: -9.5, r: -6.5, c: '#8a8278' },
      { dy: -13.5, r: -11.5, c: '#6f6a64' }, { dy: -18, r: -17.5, c: '#5d5852' }, { dy: -23, r: -24.5, c: '#4d4844' }, { dy: -27, r: -30, c: '#3f3b38' },
    ];
    const rings = layers.map((L, li) => {
      const pts = [];
      for (let i = 0; i < N; i++) {
        const a = i / N * Math.PI * 2;
        const er = m.edgeR(a);
        const jr = li > 1 ? (rng() - 0.5) * 1.6 * Math.min(1, li / 4) : 0;
        const r = Math.max(0.4, er + L.r + jr);
        const top = m.h(Math.cos(a) * (er - 0.05), Math.sin(a) * (er - 0.05));
        const y = li < 3 ? top + L.dy : L.dy + (rng() - 0.5) * 0.8;
        pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
      }
      return pts;
    });
    const verts = [], cols = [], col = new THREE.Color();
    for (let li = 0; li < rings.length - 1; li++) {
      const A = rings[li], B = rings[li + 1];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        const quad = [[A[i], B[i], A[j]], [A[j], B[i], B[j]]];
        for (const tri of quad) {
          col.set(layers[li].c).lerp(C(layers[li + 1].c), rng() * 0.4).offsetHSL(0, 0, (rng() - 0.5) * 0.06);
          for (const v of tri) { verts.push(v.x, v.y, v.z); cols.push(col.r, col.g, col.b); }
        }
      }
    }
    // 바닥 뾰족 끝
    const tip = new THREE.Vector3(2, -36, -1), Lr = rings.at(-1);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N; for (const v of [Lr[i], tip, Lr[j]]) { verts.push(v.x, v.y, v.z); cols.push(0.22, 0.2, 0.19); } }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); cg.computeVertexNormals();
    const cliff = new THREE.Mesh(cg, snowify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide })));
    cliff.castShadow = true; cliff.receiveShadow = true; this.scene.add(cliff);
    // 뿌리·덩굴
    const roots = [];
    for (let i = 0; i < 46; i++) {
      const a = rng() * 6.28, base = rings[3][Math.floor(a / 6.28 * N) % N];
      const pts = [base.clone()]; let p = base.clone();
      const len = 2 + rng() * 6;
      for (let k = 1; k < 5; k++) { p = p.clone().add(new THREE.Vector3((rng() - 0.5) * 0.9, -len / 4, (rng() - 0.5) * 0.9)); pts.push(p); }
      roots.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.06 + rng() * 0.08, 4, false));
    }
    const rootMesh = new THREE.Mesh(mergeGeometries(roots), new THREE.MeshStandardMaterial({ color: 0x5a3e26, roughness: 1 }));
    this.scene.add(rootMesh);
    const vines = [];
    for (let i = 0; i < 70; i++) {
      const a = rng() * 6.28, base = rings[1][Math.floor(a / 6.28 * N) % N];
      const len = 0.8 + rng() * 2.8;
      for (let k = 0; k < len / 0.35; k++) { const l = new THREE.IcosahedronGeometry(0.16 + rng() * 0.08, 0); l.translate(base.x * 1.004 + (rng() - 0.5) * 0.2, base.y - 0.2 - k * 0.35, base.z * 1.004 + (rng() - 0.5) * 0.2); vines.push(l); }
    }
    this.vineMat = snowify(new THREE.MeshStandardMaterial({ color: 0x4f9a3a, flatShading: true, roughness: 0.8 }));
    this.scene.add(new THREE.Mesh(mergeGeometries(vines), this.vineMat));
    this.rings = rings;
  }

  // ───── 지면 텍스처 (길·밭·광장) ─────
  buildGroundCanvas() {
    const S = 1024;
    this.gcv = document.createElement('canvas'); this.gcv.width = this.gcv.height = S;
    this.base = document.createElement('canvas'); this.base.width = this.base.height = S;
    const g = this.base.getContext('2d'), rng = mulberry32(5), m = this.map;
    const W = (x) => (x + EXT) / (EXT * 2) * S;
    // 기본 풀밭 (얼룩 무늬)
    g.fillStyle = '#6fae48'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { const x = rng() * S, y = rng() * S, r = 4 + rng() * 26; g.fillStyle = ['#78b852', '#66a443', '#7fbd58', '#5f9c3f', '#86c15e'][Math.floor(rng() * 5)]; g.globalAlpha = 0.35; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // 언덕 바위, 강변 모래
    for (let i = 0; i < 900; i++) { const x = (rng() - 0.5) * 80, z = (rng() - 0.5) * 80; const hh = m.h(x, z); if (hh > 4.5) { g.fillStyle = rng() < 0.5 ? '#9a9488' : '#8a8478'; g.globalAlpha = Math.min(1, (hh - 4.5) / 2) * 0.7; g.beginPath(); g.arc(W(x), W(z), 6 + rng() * 10, 0, 7); g.fill(); } }
    g.globalAlpha = 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    const line = (pts, w, col, alpha = 1) => { g.globalAlpha = alpha; g.strokeStyle = col; g.lineWidth = w / (EXT * 2) * S; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(W(p.x), W(p.z)) : g.moveTo(W(p.x), W(p.z))); g.stroke(); g.globalAlpha = 1; };
    line(m.river, 6.4, '#c9b48a', 0.85); line(m.river, 5.2, '#b9a47a', 0.9);
    const src = m.river[0]; g.fillStyle = '#b9a47a'; g.beginPath(); g.arc(W(src.x), W(src.z), 3.6 / 80 * S, 0, 7); g.fill();
    // 채석장 흙
    g.fillStyle = '#a8957a'; g.globalAlpha = 0.85; g.beginPath(); g.arc(W(m.quarry.x), W(m.quarry.z), 6.5 / 80 * S, 0, 7); g.fill(); g.globalAlpha = 1;
    this.line = line; this.W = W;
    this.gtex = new THREE.CanvasTexture(this.gcv); this.gtex.colorSpace = THREE.SRGBColorSpace; this.gtex.anisotropy = 8;
    this.terrainMat.map = this.gtex; this.terrainMat.needsUpdate = true;
    this.paintGround({ buildings: [], era: 0, reach: [8, 8, 8, 8] });
  }
  paintGround(st) {
    const S = 1024, g = this.gcv.getContext('2d'), m = this.map, W = this.W;
    g.drawImage(this.base, 0, 0);
    const cobble = st.era >= 2;
    const roadCol = cobble ? '#b8b0a2' : '#c9a77a', edge = cobble ? '#8f877a' : '#a8875a';
    g.lineCap = 'round'; g.lineJoin = 'round';
    const stroke = (pts, w, col, a = 1, dash = null) => { g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = w / 80 * S; g.setLineDash(dash || []); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(W(p.x), W(p.z)) : g.moveTo(W(p.x), W(p.z))); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; };
    // 큰길 (마을이 커진 만큼만)
    m.roads.forEach((r, i) => {
      const reach = st.reach[i] || 0; if (reach < 1) return;
      const pts = []; let acc = 0;
      for (let k = 0; k < r.length; k++) {
        if (k) { const L = Math.hypot(r[k].x - r[k - 1].x, r[k].z - r[k - 1].z); if (acc + L > reach) { const f = (reach - acc) / L; pts.push({ x: r[k - 1].x + (r[k].x - r[k - 1].x) * f, z: r[k - 1].z + (r[k].z - r[k - 1].z) * f }); break; } acc += L; }
        pts.push(r[k]);
      }
      stroke(pts, 3.0, edge, 0.9); stroke(pts, 2.4, roadCol);
      if (cobble) stroke(pts, 2.2, '#a39b8e', 0.6, [2, 5]);
    });
    // 집 앞 샛길
    for (const b of st.buildings) {
      if (!b.plot || !b.plot.road || ['field', 'bridge'].includes(b.type)) continue;
      stroke([b.door, b.plot.road], 1.3, edge, 0.85); stroke([b.door, b.plot.road], 0.95, roadCol);
    }
    // 광장
    const pr = (st.era >= 1 ? 8.2 : 6) / 80 * S;
    g.fillStyle = edge; g.beginPath(); g.arc(W(0), W(0), pr + 4, 0, 7); g.fill();
    g.fillStyle = roadCol; g.beginPath(); g.arc(W(0), W(0), pr, 0, 7); g.fill();
    if (cobble) { g.strokeStyle = '#a39b8e'; g.lineWidth = 2; for (let r = 14; r < pr; r += 14) { g.beginPath(); g.arc(W(0), W(0), r, 0, 7); g.stroke(); } }
    // 밭 (밭고랑)
    for (const b of st.buildings) {
      if (b.type !== 'field') continue;
      const w = (b.w || 4.8) / 80 * S, l = (b.l || 3.8) / 80 * S, x = W(b.x) - w / 2, y = W(b.z) - l / 2;
      g.fillStyle = '#7a5836'; g.fillRect(x - 2, y - 2, w + 4, l + 4);
      g.fillStyle = '#8a6440'; g.fillRect(x, y, w, l);
      g.strokeStyle = '#6a4a2c'; g.lineWidth = 2; for (let k = 4; k < l; k += 7) { g.beginPath(); g.moveTo(x, y + k); g.lineTo(x + w, y + k); g.stroke(); }
    }
    // 건물 터
    for (const b of st.buildings) {
      if (['field', 'bridge', 'fountain', 'market'].includes(b.type)) continue;
      const r = (b.type === 'station' ? 6 : b.type === 'townhall' ? 4.6 : 2.6) / 80 * S;
      g.fillStyle = b.built ? 'rgba(120,96,64,.45)' : '#a8875a'; g.beginPath(); g.ellipse(W(b.x), W(b.z), r, r * 0.9, 0, 0, 7); g.fill();
    }
    // 묘지
    if (st.graves) { g.fillStyle = 'rgba(90,120,60,.6)'; g.beginPath(); g.arc(W(m.cemetery.x), W(m.cemetery.z), 6.5 / 80 * S, 0, 7); g.fill(); }
    this.gtex.needsUpdate = true;
  }

  // ───── 강·폭포 ─────
  buildRiver() {
    const m = this.map;
    const curve = new THREE.CatmullRomCurve3(m.river.map(p => new THREE.Vector3(p.x, p.y, p.z)), false, 'centripetal');
    const N = 260, pts = curve.getSpacedPoints(N);
    const pos = [], uv = [], idx = [];
    let acc = 0;
    for (let i = 0; i <= N; i++) {
      const p = pts[i], q = pts[Math.min(N, i + 1)], o = pts[Math.max(0, i - 1)];
      const tx = q.x - o.x, tz = q.z - o.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      if (i) acc += p.distanceTo(pts[i - 1]);
      const w = 1.35 + Math.min(1, i / N * 2) * 0.35;
      const y = p.y + 0.06;
      pos.push(p.x + nx * w, y, p.z + nz * w, p.x - nx * w, y, p.z - nz * w);
      uv.push(0, acc, 1, acc);
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    this.waterU = { uTime: { value: 0 }, uSky: { value: C('#b9e2f8') }, uSun: { value: C('#fff') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 0 }, uFreeze: { value: 0 }, uFog: { value: C('#c3e2f5') }, uFogD: { value: 0.0042 } };
    const wm = this.waterMat = new THREE.ShaderMaterial({
      uniforms: this.waterU, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; varying float vFd; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vFd = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime, uNight, uFreeze, uFogD; uniform vec3 uSky, uSun, uSunDir, uFog; varying vec2 vUv; varying vec3 vW; varying float vFd; ${NOISE}
        void main(){ float flow = uTime * (1.4 - uFreeze * 1.3);
          float n = fbm(vec2(vUv.x * 2.5, vUv.y * 0.55 - flow));
          float n2 = vnoise(vec2(vUv.x * 7.0, vUv.y * 1.6 - flow * 1.6));
          float edge = abs(vUv.x - 0.5) * 2.0;
          vec3 deep = mix(vec3(0.05, 0.38, 0.55), vec3(0.02, 0.06, 0.16), uNight * 0.85);
          vec3 shallow = mix(vec3(0.22, 0.78, 0.78), vec3(0.06, 0.16, 0.3), uNight * 0.85);
          vec3 col = mix(deep, shallow, edge * 0.8 + n * 0.3);
          vec3 N = normalize(vec3((n - 0.5) * 0.7, 1.0, (n2 - 0.5) * 0.7));
          vec3 V = normalize(cameraPosition - vW);
          col = mix(col, uSky, pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.6);
          col += uSun * pow(max(dot(N, normalize(uSunDir + V)), 0.0), 120.0) * 2.0;
          float foam = smoothstep(0.78, 1.0, edge) * (0.5 + 0.5 * n2) + smoothstep(0.82, 0.95, n2) * 0.3;
          col = mix(col, vec3(1.0) * mix(1.0, 0.3, uNight), clamp(foam, 0.0, 1.0) * (1.0 - uFreeze));
          vec3 ice = mix(vec3(0.82, 0.92, 0.98), vec3(0.6, 0.72, 0.85), vnoise(vW.xz * 2.0)) * mix(1.0, 0.35, uNight);
          float crack = smoothstep(0.48, 0.5, abs(vnoise(vW.xz * 1.3) - 0.5)) * 0.15;
          col = mix(col, ice - crack, uFreeze * 0.85);
          col = mix(col, uFog, 1.0 - exp(-uFogD * uFogD * vFd * vFd));
          gl_FragColor = vec4(col, 1.0); }`,
    });
    const river = new THREE.Mesh(g, wm); river.receiveShadow = false; this.scene.add(river);
    const src = m.river[0];
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.5, 24), wm); pond.rotation.x = -Math.PI / 2; pond.position.set(src.x, src.y + 0.07, src.z);
    const pg = pond.geometry, puv = pg.attributes.uv; for (let i = 0; i < puv.count; i++) puv.setXY(i, 0.5 + (puv.getX(i) - 0.5) * 0.4, puv.getY(i) * 3);
    this.scene.add(pond);
    this.riverCurve = curve;
  }
  buildWaterfall() {
    const wf = this.map.waterfall, d = new THREE.Vector3(Math.cos(wf.ang), 0, Math.sin(wf.ang));
    const start = new THREE.Vector3(wf.x, wf.y + 0.06, wf.z);
    const pts = [start, start.clone().addScaledVector(d, 1.0).setY(wf.y - 0.25), start.clone().addScaledVector(d, 2.0).setY(wf.y - 1.6), start.clone().addScaledVector(d, 2.7).setY(wf.y - 5), start.clone().addScaledVector(d, 3.1).setY(wf.y - 12), start.clone().addScaledVector(d, 3.3).setY(wf.y - 22), start.clone().addScaledVector(d, 3.4).setY(wf.y - 32)];
    const curve = new THREE.CatmullRomCurve3(pts), N = 60, sp = curve.getSpacedPoints(N);
    const nx = -d.z, nz = d.x, pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const p = sp[i], w = 1.6 - i / N * 0.6; pos.push(p.x + nx * w, p.y, p.z + nz * w, p.x - nx * w, p.y, p.z - nz * w); uv.push(0, i / N, 1, i / N); if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: this.waterU.uTime, uNight: this.waterU.uNight, uFreeze: this.waterU.uFreeze }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime, uNight, uFreeze; varying vec2 vUv; ${NOISE}
        void main(){ float s = vnoise(vec2(vUv.x * 14.0, vUv.y * 5.0 - uTime * (3.2 - uFreeze * 2.8)));
          float s2 = vnoise(vec2(vUv.x * 30.0, vUv.y * 9.0 - uTime * 4.5));
          vec3 col = mix(vec3(0.55, 0.85, 0.95), vec3(1.0), smoothstep(0.35, 0.8, s * 0.7 + s2 * 0.4));
          col *= mix(1.0, 0.35, uNight);
          float a = (0.62 + 0.38 * s) * (1.0 - smoothstep(0.55, 1.0, vUv.y)) * smoothstep(0.0, 0.2, 1.0 - abs(vUv.x - 0.5) * 2.0 + 0.1);
          gl_FragColor = vec4(col * 1.15, a); }`,
    });
    this.scene.add(new THREE.Mesh(g, mat));
    this.waterfallTop = start.clone().addScaledVector(d, 1.2);
    // 무지개
    const rb = new THREE.Mesh(new THREE.TorusGeometry(9, 1.1, 8, 48, Math.PI), new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uA; varying vec3 vP; vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0); }
        void main(){ float r = (length(vP.xy) - 7.9) / 2.2; if (r < 0.0 || r > 1.0) discard; float a = sin(r * 3.14159) * uA * smoothstep(0.0, 3.0, vP.y);
          gl_FragColor = vec4(hsv(r * 0.8) * a, a); }`,
    }));
    rb.position.copy(start).addScaledVector(d, 4).setY(wf.y - 10); rb.rotation.y = -wf.ang; rb.scale.set(1, 1.1, 1);
    this.rainbow = rb; this.scene.add(rb);
  }

  // 바람 + 카메라 근접 디더링
  windify(mat, amp, mode) {
    const wind = this.wind, prev = mat.onBeforeCompile, key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
    amp = Number(amp).toFixed(3);
    mat.onBeforeCompile = (sh, r) => {
      prev && prev(sh, r);
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec2 ip = vec2(0.0);
          #ifdef USE_INSTANCING
            ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
          #endif
          ${mode === 'grass' ? `float w = sin(uWind * 2.0 + ip.x * 0.4 + ip.y * 0.3) * ${amp} * max(position.y, 0.0); transformed.x += w; transformed.z += w * 0.6;`
          : `float yy = max(position.y - 1.6, 0.0); transformed.x += sin(uWind * 1.6 + ip.x * 0.5) * ${amp} * yy; transformed.z += cos(uWind * 1.3 + ip.y * 0.4) * ${amp} * yy * 0.7;`}
        }`);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0); int i = int(q.x + q.y*4.0);
        float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i]+0.5)/16.0; }
        void main() { { float d = length(vViewPosition); if (smoothstep(3.0, 8.0, d) < bayer4(gl_FragCoord.xy)) discard; }`);
    };
    mat.customProgramCacheKey = () => key + 'wind' + mode + amp;
    return mat;
  }

  // ───── 나무 ─────
  buildTrees() {
    const m = this.map, rng = mulberry32(17), d = new THREE.Object3D();
    const trunkG = new THREE.CylinderGeometry(0.16, 0.26, 2.0, 6); trunkG.translate(0, 1.0, 0);
    const blob = mergeGeometries([[0, 2.5, 0, 1.25], [0.7, 2.1, 0.3, 0.9], [-0.65, 2.2, -0.2, 0.95], [0.1, 3.2, -0.1, 0.85]].map(([x, y, z, r]) => { const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); return s; }));
    const pine = mergeGeometries([0, 1, 2].map(i => { const c = new THREE.ConeGeometry(1.45 - i * 0.36, 1.7, 7); c.translate(0, 1.8 + i * 0.95, 0); return c; }));
    const trunkM = new THREE.MeshStandardMaterial({ color: 0x7a5636, roughness: 1, flatShading: true });
    const leafM = this.windify(snowify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true })), 0.06, 'leaf');
    const pineM = this.windify(snowify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true })), 0.03, 'leaf');
    const trunkMW = this.windify(trunkM, 0.0, 'leaf');
    const kinds = [0, 1, 2].map(k => m.trees.map((t, i) => ({ ...t, i })).filter(t => t.kind === k));
    this.treeSets = kinds.map((arr, k) => {
      const tr = new THREE.InstancedMesh(trunkG, trunkMW, arr.length), fo = new THREE.InstancedMesh(k === 1 ? pine : blob, k === 1 ? pineM : leafM, arr.length);
      arr.forEach((t, j) => { t.hue = rng(); t.cur = 1; d.position.set(t.x, t.y - 0.1, t.z); d.rotation.set(0, t.r, 0); d.scale.setScalar(t.s); d.updateMatrix(); tr.setMatrixAt(j, d.matrix); fo.setMatrixAt(j, d.matrix); fo.setColorAt(j, C('#4f9a3a')); });
      for (const im of [tr, fo]) { im.castShadow = true; im.receiveShadow = true; this.scene.add(im); }
      return { arr, tr, fo, kind: k };
    });
  }
  updateTrees(alive, dt, season) {
    const d = new THREE.Object3D(), col = new THREE.Color();
    const S = SEASON[season.i], N = SEASON[(season.i + 1) % 4], w = season.w;
    for (const set of this.treeSets) {
      let dirtyM = false;
      set.arr.forEach((t, j) => {
        const target = alive[t.i] ? 1 : 0;
        if (Math.abs(t.cur - target) > 0.001) {
          t.cur += (target - t.cur) * Math.min(1, dt * 2.5); if (Math.abs(t.cur - target) < 0.01) t.cur = target;
          d.position.set(t.x, t.y - 0.1, t.z); d.rotation.set(t.cur < 1 ? (1 - t.cur) * 1.2 : 0, t.r, 0); d.scale.setScalar(t.s * Math.max(0.0001, t.cur)); d.updateMatrix();
          set.tr.setMatrixAt(j, d.matrix); set.fo.setMatrixAt(j, d.matrix); dirtyM = true;
        }
        if (set.kind === 1) col.set('#2f6a3a').offsetHSL(0, 0, (t.hue - 0.5) * 0.08);
        else if (set.kind === 2) col.copy(S.cherry).lerp(N.cherry, w);
        else { const k = Math.floor(t.hue * 3); col.copy(S.leaf[k]).lerp(N.leaf[k], w); }
        set.fo.setColorAt(j, col);
      });
      if (dirtyM) { set.tr.instanceMatrix.needsUpdate = true; set.fo.instanceMatrix.needsUpdate = true; }
      set.fo.instanceColor.needsUpdate = true;
    }
  }

  buildRocksAndGrass() {
    const m = this.map, rng = mulberry32(23), d = new THREE.Object3D();
    const rg = new THREE.DodecahedronGeometry(1, 0); const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * (0.85 + rng() * 0.3), rp.getY(i) * (0.7 + rng() * 0.2), rp.getZ(i) * (0.85 + rng() * 0.3));
    rg.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(rg, snowify(new THREE.MeshStandardMaterial({ color: 0xa09a90, roughness: 1, flatShading: true })), m.rocks.length);
    m.rocks.forEach((r, i) => { d.position.set(r.x, r.y + r.s * 0.15, r.z); d.rotation.set(rng(), rng() * 6, rng() * 0.4); d.scale.set(r.s, r.s * 0.8, r.s * 1.1); d.updateMatrix(); rocks.setMatrixAt(i, d.matrix); });
    rocks.castShadow = true; rocks.receiveShadow = true; this.scene.add(rocks);
    // 풀 (바람)
    const blades = mergeGeometries([0, 1, 2, 3].map(i => { const c = new THREE.ConeGeometry(0.06, 0.55 + (i % 2) * 0.2, 3); c.translate(Math.cos(i * 1.6) * 0.12, 0.3, Math.sin(i * 1.6) * 0.12); c.rotateZ((i - 1.5) * 0.15); return c; }));
    this.grassMat = this.windify(snowify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })), 0.2, 'grass');
    const pts = [];
    for (let k = 0; k < 12000 && pts.length < 3400; k++) {
      const x = (rng() - 0.5) * 66, z = (rng() - 0.5) * 66;
      if (!m.inside(x, z, 0.8) || Math.hypot(x, z) < 9.5 || m.roadDist(x, z) < 1.6 || polyDist(x, z, m.river).d < 2.4 || m.farmZone(x, z) && Math.abs(z - 2) > 2 || m.h(x, z) > 5) continue;
      pts.push([x, m.h(x, z), z]);
    }
    this.grassPts = pts;
    const grass = this.grass = new THREE.InstancedMesh(blades, this.grassMat, pts.length);
    const lc = new THREE.Color();
    pts.forEach(([x, y, z], i) => { d.position.set(x, y - 0.04, z); d.rotation.set(0, rng() * 6, 0); d.scale.setScalar(0.7 + rng() * 0.8); d.updateMatrix(); grass.setMatrixAt(i, d.matrix); lc.setHSL(0.25 + rng() * 0.06, 0.55, 0.34 + rng() * 0.12); grass.setColorAt(i, lc); });
    grass.receiveShadow = true; this.scene.add(grass);
    // 꽃
    const FN = 520;
    const fl = this.flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x181010 }), FN);
    const fc = ['#ff7eb3', '#ffd23f', '#ffffff', '#ff9f43', '#b18cff', '#ff5a5a'];
    this.flowerData = [];
    for (let i = 0; i < FN; i++) { const p = pts[Math.floor(rng() * pts.length)]; const f = { x: p[0] + (rng() - 0.5), y: p[1] + 0.45, z: p[2] + (rng() - 0.5), s: 0.8 + rng() * 0.6 }; this.flowerData.push(f); fl.setColorAt(i, C(fc[i % fc.length])); }
    this.scene.add(fl); this.flowerScale = -1;
  }
  setFlowerScale(s) {
    if (Math.abs(s - this.flowerScale) < 0.01) return; this.flowerScale = s;
    const d = new THREE.Object3D();
    this.flowerData.forEach((f, i) => { const hidden = f.hidden ? 0 : 1; d.position.set(f.x, f.y, f.z); d.scale.setScalar(Math.max(0.0001, f.s * s * hidden)); d.updateMatrix(); this.flowers.setMatrixAt(i, d.matrix); });
    this.flowers.instanceMatrix.needsUpdate = true;
  }
  clearGround(x, z, r) {
    const d = new THREE.Object3D(), mtx = new THREE.Matrix4(); let ch = false;
    this.grassPts.forEach((p, i) => { if (Math.hypot(p[0] - x, p[2] - z) < r) { this.grass.getMatrixAt(i, mtx); mtx.makeScale(0, 0, 0); this.grass.setMatrixAt(i, mtx); ch = true; } });
    if (ch) this.grass.instanceMatrix.needsUpdate = true;
    this.flowerData.forEach(f => { if (Math.hypot(f.x - x, f.z - z) < r) f.hidden = true; });
    this.flowerScale = -1;
  }

  buildFloaters() {
    const rng = mulberry32(41); this.floaters = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group(), r = 1.6 + rng() * 2.4;
      const rock = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.2, 7), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, flatShading: true, roughness: 1 })); rock.rotation.x = Math.PI; rock.position.y = -r * 1.1; g.add(rock);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r, 0.4, 7), snowify(new THREE.MeshStandardMaterial({ color: 0x6fae48, flatShading: true }))); g.add(top);
      if (rng() < 0.7) { const tr = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.8, 6), snowify(new THREE.MeshStandardMaterial({ color: 0x3f7a3a, flatShading: true }))); tr.position.set(0, 1.2, 0); g.add(tr); }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      const a = rng() * 6.28, d = 46 + rng() * 24; g.position.set(Math.cos(a) * d, -6 + rng() * 16, Math.sin(a) * d);
      g.userData = { a, d, y: g.position.y, s: 0.01 + rng() * 0.02, p: rng() * 6 };
      this.scene.add(g); this.floaters.push(g);
    }
  }
  buildBirds() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.2, -0.7, 0, -0.1, 0, 0, -0.15, 0, 0, 0.2, 0, 0, -0.15, 0.7, 0, -0.1], 3));
    g.computeVertexNormals();
    this.birdU = { uTime: { value: 0 } };
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = this.birdU.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float fl = sin(uTime * 10.0 + instanceMatrix[3].x * 0.7); transformed.y += abs(position.x) * fl * 0.8;'); };
    this.birds = new THREE.InstancedMesh(g, mat, 18); this.birds.frustumCulled = false; this.scene.add(this.birds);
    this.birdData = [...Array(18)].map((_, i) => ({ flock: i % 3, off: new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 4) }));
  }

  // ───── 밭 작물 ─────
  buildFields() {
    const parts = cropGeometry();
    this.cropGeo = mergeGeometries(parts);
    this.cropMat = this.windify(snowify(new THREE.MeshStandardMaterial({ color: 0x7cc850, roughness: 0.8, flatShading: true })), 0.12, 'grass');
    this.crops = new THREE.InstancedMesh(this.cropGeo, this.cropMat, 16 * 30); this.crops.count = 0; this.crops.castShadow = true; this.scene.add(this.crops);
    this.fencePost = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), M('#8a6a48'), 16 * 16); this.fencePost.count = 0; this.scene.add(this.fencePost);
    this.fenceRail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.06, 0.05), M('#9a7a58', { snow: true }), 16 * 16); this.fenceRail.count = 0; this.scene.add(this.fenceRail);
    this.fieldList = []; this.cropH = -1;
  }
  addField(b) {
    this.fieldList.push(b);
    const d = new THREE.Object3D(), m = this.map;
    const w = b.w || 4.8, l = b.l || 3.8;
    const k0 = this.fencePost.count;
    const corners = [[-w / 2 - 0.2, -l / 2 - 0.2], [w / 2 + 0.2, -l / 2 - 0.2], [w / 2 + 0.2, l / 2 + 0.2], [-w / 2 - 0.2, l / 2 + 0.2]];
    let pc = this.fencePost.count, rc = this.fenceRail.count;
    for (let s = 0; s < 4; s++) {
      const [ax, az] = corners[s], [bx, bz] = corners[(s + 1) % 4];
      const n = s % 2 ? 2 : 3;
      for (let i = 0; i < n; i++) { const x = b.x + ax + (bx - ax) * i / n, z = b.z + az + (bz - az) * i / n; if (s === 0 && i === 1) continue; d.position.set(x, m.h(x, z) + 0.3, z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix(); this.fencePost.setMatrixAt(pc++, d.matrix); }
      if (s === 0) continue;
      const mx = b.x + (ax + bx) / 2, mz = b.z + (az + bz) / 2, len = Math.hypot(bx - ax, bz - az);
      d.position.set(mx, m.h(mx, mz) + 0.42, mz); d.rotation.set(0, -Math.atan2(bz - az, bx - ax), 0); d.scale.set(len, 1, 1); d.updateMatrix(); this.fenceRail.setMatrixAt(rc++, d.matrix);
    }
    this.fencePost.count = pc; this.fenceRail.count = rc; this.fencePost.instanceMatrix.needsUpdate = true; this.fenceRail.instanceMatrix.needsUpdate = true;
    this.cropH = -1;
  }
  setCrops(h, color) {
    this.cropMat.color.copy(color);
    if (Math.abs(h - this.cropH) < 0.01) return; this.cropH = h;
    const d = new THREE.Object3D(), m = this.map, rng = mulberry32(9); let n = 0;
    for (const b of this.fieldList) {
      if (!b.built) continue;
      const w = (b.w || 4.8) - 0.6, l = (b.l || 3.8) - 0.6;
      for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) {
        const x = b.x - w / 2 + (i + 0.5) * w / 6, z = b.z - l / 2 + (j + 0.5) * l / 5;
        d.position.set(x, m.h(x, z) - 0.02, z); d.rotation.set(0, rng() * 6, 0); d.scale.set(1, Math.max(0.001, h * (0.85 + rng() * 0.3)), 1); d.updateMatrix(); this.crops.setMatrixAt(n++, d.matrix);
      }
    }
    this.crops.count = n; this.crops.instanceMatrix.needsUpdate = true;
  }

  // ───── 가로등 ─────
  buildLamps() {
    const m = this.map, pts = [];
    m.roads.forEach((r, ri) => { let acc = 0; for (let k = 1; k < r.length; k++) { const a = r[k - 1], b = r[k], L = Math.hypot(b.x - a.x, b.z - a.z); for (let s = 0; s < L; s += 5) { const f = s / L, x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, nx = -(b.z - a.z) / L, nz = (b.x - a.x) / L; if (acc + s > 7) pts.push({ x: x + nx * 1.6, z: z + nz * 1.6, ri, s: acc + s }); } acc += L; } });
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; pts.push({ x: Math.cos(a) * 8.6, z: Math.sin(a) * 8.6, ri: -1, s: 0 }); }
    this.lampPts = pts;
    this.lampPost = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 2.2, 6).translate(0, 1.1, 0), M('#2f3440', { metalness: 0.5 }), pts.length);
    this.lampBulb = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), LAMP, pts.length);
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    this.lampPool = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.5, 4.5).rotateX(-Math.PI / 2), this.glowMat, pts.length);
    for (const im of [this.lampPost, this.lampBulb, this.lampPool]) { im.count = 0; this.scene.add(im); }
    this.lampPost.castShadow = true;
    // 축제 등불 줄
    const lan = []; const cols = ['#ff4757', '#ffd23f', '#2ed573', '#1e90ff', '#ff6bcb', '#ff9f43'];
    this.lanternMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    for (let s = 0; s < 6; s++) {
      const a0 = s / 6 * Math.PI * 2, a1 = a0 + Math.PI * 0.8;
      for (let k = 1; k < 12; k++) { const f = k / 12; const x = Math.cos(a0) * 7.5 * (1 - f) + Math.cos(a1) * 7.5 * f, z = Math.sin(a0) * 7.5 * (1 - f) + Math.sin(a1) * 7.5 * f; const y = 4.2 - Math.sin(f * Math.PI) * 1.4; const sg = new THREE.SphereGeometry(0.2, 8, 6); sg.scale(1, 1.25, 1); sg.translate(x, y, z); const c = C(cols[(k + s) % cols.length]).multiplyScalar(1.7); const ca = new Float32Array(sg.attributes.position.count * 3); for (let i = 0; i < ca.length; i += 3) { ca[i] = c.r; ca[i + 1] = c.g; ca[i + 2] = c.b; } sg.setAttribute('color', new THREE.BufferAttribute(ca, 3)); lan.push(sg.toNonIndexed ? sg.toNonIndexed() : sg); }
    }
    lan.forEach(g => { g.deleteAttribute('uv'); });
    this.lanterns = new THREE.Mesh(mergeGeometries(lan), this.lanternMat);
    const poles = mergeGeometries([...Array(6)].map((_, s) => { const a = s / 6 * Math.PI * 2; return new THREE.CylinderGeometry(0.07, 0.07, 4.4, 5).translate(Math.cos(a) * 7.5, 2.2 + 0.6, Math.sin(a) * 7.5); }));
    this.lanternPoles = new THREE.Mesh(poles, M('#7a5232'));
    this.lanterns.visible = this.lanternPoles.visible = false;
    this.scene.add(this.lanterns, this.lanternPoles);
  }
  setLamps(era, reach) {
    const n = era >= 2 ? this.lampPts.filter(p => p.ri < 0 || p.s < (reach[p.ri] || 0)) : [];
    if (n.length === this.lampPost.count) return;
    const d = new THREE.Object3D(), m = this.map;
    n.forEach((p, i) => { const y = m.h(p.x, p.z); d.position.set(p.x, y, p.z); d.scale.setScalar(1); d.updateMatrix(); this.lampPost.setMatrixAt(i, d.matrix); d.position.y = y + 2.25; d.updateMatrix(); this.lampBulb.setMatrixAt(i, d.matrix); d.position.y = y + 0.06; d.updateMatrix(); this.lampPool.setMatrixAt(i, d.matrix); });
    for (const im of [this.lampPost, this.lampBulb, this.lampPool]) { im.count = n.length; im.instanceMatrix.needsUpdate = true; }
  }

  // ───── 묘지 ─────
  buildCemetery() {
    const g = new THREE.BoxGeometry(0.6, 0.8, 0.18); g.translate(0, 0.4, 0);
    const top = new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10, 1, false, 0, Math.PI); top.rotateX(Math.PI / 2); top.rotateZ(Math.PI / 2); top.translate(0, 0.8, 0);
    this.graves = new THREE.InstancedMesh(mergeGeometries([g.toNonIndexed(), top.toNonIndexed()].map(x => { x.deleteAttribute('uv'); return x; })), snowify(new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.9, flatShading: true })), 40);
    this.graves.count = 0; this.graves.castShadow = true; this.scene.add(this.graves);
    const c = this.map.cemetery;
    const tree = new THREE.Group(); tree.position.set(c.x + 5.5, this.map.h(c.x + 5.5, c.z - 4), c.z - 4);
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.8, 7), new THREE.MeshStandardMaterial({ color: 0x5a3e26, flatShading: true })); tk.position.y = 1.4; tree.add(tk);
    this.memorialLeaf = snowify(new THREE.MeshStandardMaterial({ color: 0xf7b3cf, flatShading: true, roughness: 0.8 }));
    [[0, 3.4, 0, 1.8], [1, 3, 0.4, 1.2], [-1, 3.1, -0.3, 1.3]].forEach(([x, y, z, r]) => { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), this.memorialLeaf); s.position.set(x, y, z); s.castShadow = true; tree.add(s); });
    tree.visible = false; this.memorialTree = tree; this.scene.add(tree);
  }
  setGraves(n) {
    if (n === this.graves.count) return;
    const d = new THREE.Object3D(), m = this.map, rng = mulberry32(2);
    for (let i = 0; i < Math.min(n, 40); i++) { const p = m.graves[i]; d.position.set(p.x, m.h(p.x, p.z) - 0.05, p.z); d.rotation.set(0, (rng() - 0.5) * 0.2, 0); d.updateMatrix(); this.graves.setMatrixAt(i, d.matrix); }
    this.graves.count = Math.min(n, 40); this.graves.instanceMatrix.needsUpdate = true; this.memorialTree.visible = n > 0;
  }

  // ───── 열기구 ─────
  buildBalloons() {
    const mk = (colors) => {
      const g = new THREE.Group();
      const env = new THREE.SphereGeometry(2.2, 16, 12); env.scale(1, 1.2, 1);
      const pos = env.attributes.position, ca = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); const k = Math.floor((a + Math.PI) / (Math.PI * 2) * 8) % colors.length; const c = C(colors[k]); ca.set([c.r, c.g, c.b], i * 3); }
      env.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      const e = new THREE.Mesh(env, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); e.position.y = 4.2; g.add(e);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 1.1), M('#a87a48')); bk.position.y = 0.35; g.add(bk);
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 3), M('#ddd')); r.position.set(x * 1.4, 1.8, z * 1.4); r.rotation.set(z * 0.35, 0, -x * 0.35); g.add(r); }
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6), new THREE.MeshBasicMaterial({ color: 0xffaa33, toneMapped: false })); fl.position.y = 1.5; g.add(fl);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.visible = false; this.scene.add(g); return g;
    };
    this.balloon = mk(['#e8553e', '#ffffff', '#ffd23f', '#ffffff']);
    this.caravan = mk(['#3b82c4', '#ffd23f', '#3aa05a', '#ffd23f']);
    this.balloonAnim = null; this.caravanAnim = null;
  }
  arriveBalloon() {
    const L = this.map.landing, a = Math.atan2(L.z, L.x);
    const from = new THREE.Vector3(L.x + Math.cos(a) * 50, 32, L.z + Math.sin(a) * 50);
    this.balloonAnim = { t: 0, from, to: new THREE.Vector3(L.x, this.map.h(L.x, L.z) + 0.05, L.z), away: new THREE.Vector3(L.x - Math.cos(a) * 70, 40, L.z - Math.sin(a) * 70) };
    this.balloon.visible = true;
  }
  flyCaravan() { const a = Math.random() * 6.28; this.caravanAnim = { t: 0, from: new THREE.Vector3(Math.cos(a) * 90, 18, Math.sin(a) * 90), to: new THREE.Vector3(-Math.cos(a) * 90, 22, -Math.sin(a) * 90) }; this.caravan.visible = true; }

  // ───── 하늘 기차 ─────
  buildRail() {
    const st = this.map.station, a = st.ang, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    this.railDir = dir; this.railStart = new THREE.Vector3(st.x, 0, st.z);
    const g = new THREE.Group(); const y0 = this.map.h(st.x, st.z) + 0.65;
    this.railY = (s) => y0 + Math.max(0, s - 8) * -0.02 + Math.sin(Math.max(0, s - 8) * 0.05) * 3;
    const parts = [], sup = [];
    for (let s = -4; s < 120; s += 1.0) {
      const p = this.railStart.clone().addScaledVector(dir, s); const y = this.railY(s);
      const sl = new THREE.BoxGeometry(0.25, 0.12, 2.0); sl.rotateY(-a); sl.translate(p.x, y - 0.15, p.z); parts.push(sl);
      if (s > 6 && Math.round(s) % 8 === 0) { const h = 18; const c = new THREE.CylinderGeometry(0.25, 0.4, h, 6); c.translate(p.x, y - h / 2 - 0.3, p.z); sup.push(c); }
    }
    for (const sd of [-0.6, 0.6]) { const pts = []; for (let s = -4; s < 120; s += 2) { const p = this.railStart.clone().addScaledVector(dir, s).addScaledVector(side, sd); pts.push(new THREE.Vector3(p.x, this.railY(s) - 0.02, p.z)); } parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.06, 4).toNonIndexed()); }
    parts.forEach(p => { for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal') p.deleteAttribute(k); });
    const pp = parts.map(p => p.index ? p.toNonIndexed() : p);
    g.add(new THREE.Mesh(mergeGeometries(pp), M('#6a5a4a', { snow: true })));
    if (sup.length) g.add(new THREE.Mesh(mergeGeometries(sup), M('#8a8278')));
    g.visible = false; this.rail = g; this.scene.add(g);
    // 기차
    const tr = new THREE.Group();
    const mkCar = (x, col, loco) => {
      const c = new THREE.Group(); c.position.x = x;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 1.5), M(col)); body.position.y = 0.95; c.add(body);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.15, 1.7), M('#2a2a30', { snow: true })); roof.position.y = 1.72; c.add(roof);
      for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 1.52), WIN); w.position.set(-0.9 + i * 0.9, 1.1, 0); c.add(w); }
      for (const wx of [-0.9, 0.9]) for (const wz of [-0.7, 0.7]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), M('#222')); wh.rotation.x = Math.PI / 2; wh.position.set(wx, 0.28, wz); c.add(wh); }
      if (loco) { const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.0, 12), M('#2a2a30', { metalness: 0.4 })); boiler.rotation.z = Math.PI / 2; boiler.position.set(1.9, 0.9, 0); c.add(boiler); const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.8, 8), M('#2a2a30')); ch.position.set(2.5, 1.7, 0); c.add(ch); const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), LAMP); lamp.position.set(2.95, 1.0, 0); c.add(lamp); }
      tr.add(c);
    };
    mkCar(0, '#c8453d', true); mkCar(-3.3, '#2f6f86'); mkCar(-6.6, '#e2a02a');
    tr.traverse(o => { if (o.isMesh) o.castShadow = true; });
    tr.visible = false; this.train = tr; this.scene.add(tr); this.trainT = 0;
  }

  // ───── 파티클 ─────
  buildParticles() {
    // 굴뚝 연기
    const SN = 64 * 12;
    const sg = new THREE.BufferGeometry(); const em = new Float32Array(SN * 3), sd = new Float32Array(SN), on = new Float32Array(SN);
    for (let i = 0; i < SN; i++) sd[i] = Math.random();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 3), 3)); sg.setAttribute('aEmit', new THREE.BufferAttribute(em, 3)); sg.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1)); sg.setAttribute('aOn', new THREE.BufferAttribute(on, 1));
    this.smokeU = { uTime: { value: 0 }, uAmt: { value: 1 }, uCol: { value: C('#e8e8ee') }, uWind: { value: new THREE.Vector2(0.6, 0.3) } };
    this.smoke = new THREE.Points(sg, new THREE.ShaderMaterial({
      uniforms: this.smokeU, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aEmit; attribute float aSeed, aOn; uniform float uTime, uAmt; uniform vec2 uWind; varying float vA;
        void main(){ float life = fract(uTime * 0.22 + aSeed); vec3 p = aEmit; p.y += life * 4.5; p.xz += uWind * life * life * 3.0 + vec2(sin(aSeed*40.0+uTime), cos(aSeed*30.0+uTime)) * life * 0.4;
          vA = aOn * uAmt * sin(life * 3.14159) * 0.55; vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = (0.6 + life * 2.2) * 320.0 / -mv.z * step(0.01, aOn); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uCol, vA * smoothstep(0.5, 0.1, d)); }`,
    }));
    this.smoke.frustumCulled = false; this.scene.add(this.smoke); this.smokeN = SN;

    // 불 (화재·분수 겸용 GPU 파티클)
    const FN = 260, fg = new THREE.BufferGeometry(); const fs = new Float32Array(FN); for (let i = 0; i < FN; i++) fs[i] = Math.random();
    fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FN * 3), 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 1));
    this.fireU = { uTime: { value: 0 }, uPos: { value: new THREE.Vector3() }, uOn: { value: 0 } };
    this.fire = new THREE.Points(fg, new THREE.ShaderMaterial({
      uniforms: this.fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uOn; uniform vec3 uPos; varying float vL;
        void main(){ float life = fract(uTime * 1.1 + aSeed); vec3 p = uPos + vec3(sin(aSeed*91.0)*1.6*(1.0-life), life * 4.5, cos(aSeed*53.0)*1.4*(1.0-life)); vL = life;
          vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = uOn * (1.0 - life * 0.6) * 520.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vL; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = smoothstep(0.5, 0.0, d) * (1.0 - vL);
        gl_FragColor = vec4(mix(vec3(1.0,0.85,0.4), vec3(1.0,0.25,0.05), vL) * 3.0 * a, a); }`,
    }));
    this.fire.frustumCulled = false; this.scene.add(this.fire);

    // 분수 물줄기
    const WN = 300, wg = new THREE.BufferGeometry(); const ws = new Float32Array(WN); for (let i = 0; i < WN; i++) ws[i] = Math.random();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(WN * 3), 3)); wg.setAttribute('aSeed', new THREE.BufferAttribute(ws, 1));
    this.fountU = { uTime: { value: 0 }, uPos: { value: new THREE.Vector3(0, -100, 0) }, uOn: { value: 0 } };
    this.fount = new THREE.Points(wg, new THREE.ShaderMaterial({
      uniforms: this.fountU, transparent: true, depthWrite: false,
      vertexShader: `attribute float aSeed; uniform float uTime, uOn; uniform vec3 uPos; varying float vA;
        void main(){ float life = fract(uTime * 0.9 + aSeed); float a = aSeed * 6.2831 * 7.0; vec3 v = vec3(cos(a) * 1.1, 3.0, sin(a) * 1.1);
          vec3 p = uPos + v * life + vec3(0.0, -4.9 * life * life, 0.0); vA = uOn * (1.0 - life) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = uOn * 70.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(0.85, 0.95, 1.0, vA * smoothstep(0.5, 0.1, d)); }`,
    }));
    this.fount.frustumCulled = false; this.scene.add(this.fount);

    // 날씨 (눈·꽃잎·낙엽)
    const N = 3000, g = new THREE.BufferGeometry(), seed = new Float32Array(N * 3);
    for (let i = 0; i < N * 3; i++) seed[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    this.wU = { uTime: { value: 0 }, uMode: { value: 0 }, uA: { value: 0 }, uNight: { value: 0 } };
    this.weatherPts = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.wU, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 aSeed; uniform float uTime, uMode, uA; varying float vA; varying vec3 vC; varying float vR;
        void main(){ float spd = uMode < 1.5 ? 2.2 : 1.4; float H = 34.0;
          float y = mod(aSeed.y * H - uTime * spd * (0.7 + aSeed.z * 0.6), H) - 4.0;
          vec3 p = vec3((aSeed.x - 0.5) * 76.0, y, (aSeed.z - 0.5) * 76.0);
          p.x += sin(uTime * 0.9 + aSeed.x * 40.0) * (uMode < 1.5 ? 0.6 : 1.6); p.z += cos(uTime * 0.7 + aSeed.y * 30.0) * (uMode < 1.5 ? 0.5 : 1.2);
          vA = uA * smoothstep(-4.0, 0.0, y) * (1.0 - smoothstep(26.0, 30.0, y));
          vC = uMode < 1.5 ? vec3(1.0) : uMode < 2.5 ? mix(vec3(1.0,0.72,0.84), vec3(1.0,0.9,0.95), aSeed.x) : mix(vec3(0.95,0.5,0.15), vec3(0.95,0.8,0.25), aSeed.x);
          vR = uTime * (1.0 + aSeed.z * 3.0) + aSeed.x * 10.0;
          vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = (uMode < 1.5 ? 0.22 : 0.3) * 480.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uMode, uNight; varying float vA; varying vec3 vC; varying float vR;
        void main(){ vec2 q = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); q = mat2(c, -s, s, c) * q;
          float d = uMode < 1.5 ? length(q) : length(q * vec2(1.0, 2.2));
          if (d > 0.5) discard; float a = vA * smoothstep(0.5, 0.2, d);
          gl_FragColor = vec4(vC * mix(1.0, 0.45, uNight), a); }`,
    }));
    this.weatherPts.frustumCulled = false; this.scene.add(this.weatherPts);
    // 비
    const RN = 3500, rp = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 80, y = Math.random() * 36, z = (Math.random() - 0.5) * 80; rp.set([x, y, z, x - 0.12, y - 0.9, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainU = { uTime: { value: 0 }, uA: { value: 0 } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; void main(){ vec3 p = position; p.y = mod(p.y - uTime * 26.0, 36.0) - 4.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }`,
      fragmentShader: `uniform float uA; void main(){ gl_FragColor = vec4(0.75, 0.84, 0.95, 0.22 * uA); }` }));
    this.rain.frustumCulled = false; this.scene.add(this.rain);
    // 반딧불
    const FFN = 160, ffg = new THREE.BufferGeometry(), fp = new Float32Array(FFN * 3), fsd = new Float32Array(FFN), rng = mulberry32(8);
    for (let i = 0; i < FFN; i++) { const t = this.map.trees[Math.floor(rng() * this.map.trees.length)]; fp.set([t.x + (rng() - 0.5) * 6, t.y + 0.6 + rng() * 2.2, t.z + (rng() - 0.5) * 6], i * 3); fsd[i] = rng() * 100; }
    ffg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); ffg.setAttribute('aSeed', new THREE.BufferAttribute(fsd, 1));
    this.flyU = { uTime: { value: 0 }, uA: { value: 0 } };
    this.flies = new THREE.Points(ffg, new THREE.ShaderMaterial({ uniforms: this.flyU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uA; varying float vA; void main(){ vec3 p = position + vec3(sin(uTime*0.6+aSeed)*1.2, sin(uTime*0.9+aSeed*2.0)*0.5, cos(uTime*0.5+aSeed*1.3)*1.2); vA = uA * (0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 7.0)); vec4 mv = modelViewMatrix * vec4(p,1.0); gl_PointSize = 80.0 * vA / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.45) * 1.3 * vA * (1.0 - d * 2.0), 1.0); }` }));
    this.flies.frustumCulled = false; this.scene.add(this.flies);
    // 버스트 (꽃잎·먼지·반짝이) / 불꽃놀이
    const mkBurst = (add) => { const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: !add, transparent: add, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !add }), 1200); im.count = 0; im.frustumCulled = false; im.setColorAt(0, new THREE.Color()); this.scene.add(im); return im; };
    this.burstMesh = mkBurst(false); this.fwMesh = mkBurst(true);
  }
  burst(x, y, z, kind = 'dust', n = 30) {
    const pal = { petals: ['#ffb3cf', '#ff8fb8', '#ffffff', '#ffd1e1'], dust: ['#d9c39a', '#c9b08a', '#e9d8b0'], sparkle: ['#fff3a0', '#ffd23f', '#ffffff'], leaves: ['#7cc850', '#5aa742'], chips: ['#c9a46a', '#a87a48'] }[kind] || ['#fff'];
    for (let i = 0; i < n && this.bursts.length < 1200; i++) {
      const a = Math.random() * 6.28, s = kind === 'petals' ? 2 + Math.random() * 3 : 1 + Math.random() * 2.5;
      this.bursts.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(Math.cos(a) * s, (kind === 'petals' ? 4 : 3) + Math.random() * 3, Math.sin(a) * s), r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), life: 0, max: kind === 'petals' ? 3.2 : 1.2 + Math.random() * 0.6, c: C(pal[i % pal.length]).multiplyScalar(kind === 'sparkle' ? 2.5 : 1), kind, g: kind === 'petals' ? 1.6 : kind === 'sparkle' ? 2 : 8 });
    }
  }
  firework(x, y, z) {
    const cols = ['#ff4757', '#ffd23f', '#2ed573', '#1e90ff', '#ff6bcb', '#ff9f43', '#b18cff'];
    const c = C(cols[Math.floor(Math.random() * cols.length)]).multiplyScalar(1.5), c2 = C(cols[Math.floor(Math.random() * cols.length)]).multiplyScalar(1.5);
    const n = 60;
    for (let i = 0; i < n && this.fwBursts.length < 1200; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * 6.28, r = Math.sqrt(1 - u * u), s = 7 + Math.random() * 2;
      this.fwBursts.push({ p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(r * Math.cos(th) * s, u * s, r * Math.sin(th) * s), life: 0, max: 1.5 + Math.random() * 0.5, c: i % 2 ? c : c2 });
    }
  }

  buildComposer() {
    const r = this.renderer, size = r.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.55, 0.88); this.composer.addPass(this.bloom);
    const tilt = (dir) => new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uDir: { value: dir }, uRes: { value: new THREE.Vector2(size.x, size.y) }, uFocus: { value: 0.5 }, uRange: { value: 0.16 }, uBlur: { value: 2.4 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uDir, uRes; uniform float uFocus, uRange, uBlur; varying vec2 vUv;
        void main(){ float k = smoothstep(uRange, uRange + 0.32, abs(vUv.y - uFocus)) * uBlur;
          vec4 s = texture2D(tDiffuse, vUv) * 0.2270270270;
          vec2 o1 = uDir * k * 1.3846153846 / uRes, o2 = uDir * k * 3.2307692308 / uRes;
          s += (texture2D(tDiffuse, vUv + o1) + texture2D(tDiffuse, vUv - o1)) * 0.3162162162;
          s += (texture2D(tDiffuse, vUv + o2) + texture2D(tDiffuse, vUv - o2)) * 0.0702702703;
          gl_FragColor = s; }`,
    });
    this.tiltH = tilt(new THREE.Vector2(1, 0)); this.tiltV = tilt(new THREE.Vector2(0, 1));
    this.composer.addPass(this.tiltH); this.composer.addPass(this.tiltV);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uSat: { value: 1.12 }, uVig: { value: 0.32 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uVig; uniform vec3 uTint; varying vec2 vUv;
        void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722)); c.rgb = mix(vec3(l), c.rgb, uSat) * uTint;
          vec2 q = vUv - 0.5; c.rgb *= clamp(1.0 - dot(q, q) * uVig * 2.4, 0.0, 1.0); gl_FragColor = c; }`,
    });
    this.composer.addPass(this.grade); this.composer.addPass(new OutputPass());
  }
  resize(w, h) { this.composer.setSize(w, h); this.bloom.setSize(w, h); const pr = this.renderer.getPixelRatio(); for (const p of [this.tiltH, this.tiltV]) p.uniforms.uRes.value.set(w * pr, h * pr); }
  setQuality(q) {
    this.quality = q; const hi = q === 'high';
    this.renderer.shadowMap.enabled = hi; this.sun.castShadow = hi; this.bloom.enabled = hi; this.grass.visible = hi;
    this.renderer.setPixelRatio(hi ? Math.min(devicePixelRatio, 1.75) : 1);
    this.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); });
  }
  setTilt(focusY, strength) { for (const p of [this.tiltH, this.tiltV]) { p.uniforms.uFocus.value += (focusY - p.uniforms.uFocus.value) * 0.1; p.uniforms.uBlur.value += (strength - p.uniforms.uBlur.value) * 0.05; } }

  // ───── 건물 관리 ─────
  addBuilding(b) {
    if (b.type === 'field') { this.addField(b); this.clearGround(b.x, b.z, 3.2); return; }
    this.clearGround(b.x, b.z, b.type === 'station' ? 6 : b.type === 'townhall' ? 4.5 : 3.0);
    const old = this.models.get(b.id); if (old) this.scene.remove(old.root);
    const info = makeBuilding(b);
    const root = new THREE.Group();
    const y = b.type === 'bridge' ? b.plot.y ?? this.map.bridge.y : this.map.h(b.x, b.z) - 0.05;
    root.position.set(b.x, b.type === 'bridge' ? this.map.bridge.y : y, b.z);
    root.rotation.y = b.type === 'bridge' ? -this.map.bridge.ang + Math.PI / 2 - Math.PI / 2 : b.rot;
    if (b.type === 'bridge') root.rotation.y = -this.map.bridge.ang;
    root.add(info.group);
    const scaffold = makeScaffold(b, info.height * 0.9); root.add(scaffold);
    this.scene.add(root);
    const rec = { root, info, scaffold, b, shown: b.built ? 1 : Math.max(0.02, b.progress), done: b.built };
    this.models.set(b.id, rec);
    if (b.built) { scaffold.visible = false; info.group.scale.y = 1; } else info.group.scale.y = 0.02;
    this.chimneysDirty = true;
    if (b.type === 'station') this.rail.visible = true;
  }
  finishBuilding(b) {
    if (b.type === 'field') { this.cropH = -1; return; }
    const rec = this.models.get(b.id); if (!rec) return;
    rec.done = true; rec.scaffold.visible = false;
    const p = rec.root.position;
    this.burst(p.x, p.y + 1, p.z, 'dust', 40); this.burst(p.x, p.y + rec.info.height, p.z, 'sparkle', 30);
    this.chimneysDirty = true;
  }
  restartBuilding(b) { const rec = this.models.get(b.id); if (b.type === 'field') return; if (!rec || b.renovate) { this.addBuilding(b); return; } rec.done = false; rec.scaffold.visible = true; }
  rebuildChimneys() {
    const em = this.smoke.geometry.attributes.aEmit, on = this.smoke.geometry.attributes.aOn;
    const list = [];
    for (const rec of this.models.values()) if (rec.done) for (const c of rec.info.chimneys) { const v = c.clone(); rec.info.group.localToWorld(v); list.push(v); }
    for (let i = 0; i < this.smokeN; i++) { const c = list[Math.floor(i / 12)]; if (c) { em.setXYZ(i, c.x, c.y, c.z); on.setX(i, 1); } else on.setX(i, 0); }
    em.needsUpdate = true; on.needsUpdate = true; this.chimneysDirty = false;
  }

  // ───── 매 프레임 ─────
  update(dt, env) {
    this.time += dt; const t = this.time;
    this.wind.value = t;
    const k = sampleDay(env.dayPhase);
    const S = SEASON[env.season.i], NS = SEASON[(env.season.i + 1) % 4], sw = env.season.w;
    const night = k.night;
    // 날씨
    const wantSnow = env.snow, wmode = env.weather;
    const cloudy = wmode === 'rain' || wmode === 'blizzard' ? 1 : 0;
    this.cloudy = (this.cloudy || 0) + (cloudy - (this.cloudy || 0)) * Math.min(1, dt * 0.8);
    const lt = S.light.clone().lerp(NS.light, sw);
    // 해 방향
    const dayF = THREE.MathUtils.clamp(env.dayPhase / 0.79, 0, 1);
    const az = dayF * Math.PI, el = Math.sin(dayF * Math.PI) * 1.0 + 0.08;
    const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -0.5 * Math.cos(el) - 0.3).normalize();
    const moon = new THREE.Vector3(-0.4, 0.75, -0.55).normalize();
    const isN = env.dayPhase > 0.79;
    const ld = isN ? moon : sunDir;
    this.sun.position.copy(ld).multiplyScalar(120); this.sun.target.position.set(0, 0, 0);
    this.sun.color.copy(k.sun).multiply(new THREE.Color(lt.x, lt.y, lt.z));
    this.sun.intensity = k.sunI * (isN ? 0.55 : 1) * (1 - this.cloudy * 0.45);
    this.hemi.color.copy(k.hs); this.hemi.groundColor.copy(k.hg); this.hemi.intensity = k.hI * (1 - this.cloudy * 0.15);
    const grey = C('#8f98a6').multiplyScalar(1 - night * 0.75);
    const fog = k.fog.clone().lerp(grey, this.cloudy * 0.6);
    if (env.season.i === 3) fog.lerp(C('#e6eef6').multiplyScalar(1 - night * 0.8), 0.25 * (1 - sw));
    this.scene.fog.color.copy(fog); this.scene.fog.density = 0.0024 + this.cloudy * 0.003;
    const su = this.sky.material.uniforms;
    su.uTop.value.copy(k.top).lerp(grey, this.cloudy * 0.7); su.uHor.value.copy(k.hor).lerp(fog, this.cloudy * 0.6);
    su.uSunDir.value.copy(sunDir); su.uSunColor.value.copy(k.sun); su.uNight.value = night * (1 - this.cloudy * 0.8); su.uTime.value = t;
    this.sky.position.copy(this.camera.position);
    // 구름바다
    this.seaU.uTime.value = t; this.seaU.uNight.value = night;
    this.seaU.uCloud.value.set('#ffffff').lerp(k.hor, 0.35).multiplyScalar(1 - night * 0.7);
    this.seaU.uShade.value.copy(k.top).lerp(C('#c8d4f0'), 0.5).multiplyScalar(1 - night * 0.6);
    this.seaU.uHor.value.copy(su.uHor.value);
    this.cloudMat.color.setRGB(1, 1, 1).lerp(grey, this.cloudy).multiplyScalar(1 - night * 0.7);
    this.cloudMat.emissive.copy(k.hor).multiplyScalar(0.4 * (1 - night * 0.7));
    for (const c of this.clouds) { c.userData.a += c.userData.s * dt; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; }
    for (const f of this.floaters) { const u = f.userData; u.a += u.s * dt; f.position.set(Math.cos(u.a) * u.d, u.y + Math.sin(t * 0.5 + u.p) * 0.8, Math.sin(u.a) * u.d); f.rotation.y += dt * 0.05; }
    // 계절
    const g3 = S.grass.clone().lerp(NS.grass, sw);
    this.terrainU.uGrass.value.copy(g3);
    this.grassMat.color.setRGB(g3.x * 0.95, g3.y * 0.95, g3.z * 0.95);
    this.vineMat.color.set('#4f9a3a').multiply(new THREE.Color(g3.x, g3.y, g3.z));
    SHARED.snow.value += (wantSnow - SHARED.snow.value) * Math.min(1, dt * 0.9);
    this.waterU.uFreeze.value += ((env.season.i === 3 && sw < 0.6 ? 0.75 : 0) - this.waterU.uFreeze.value) * Math.min(1, dt * 0.5);
    this.setFlowerScale(S.flower + (NS.flower - S.flower) * sw);
    const cropH = env.cropH;
    this.setCrops(cropH, S.crop.clone().lerp(NS.crop, sw));
    this.memorialLeaf.color.copy(S.cherry).lerp(NS.cherry, sw);
    this.treeT = (this.treeT || 0) + dt;
    if (this.treeT > 0.15) { this.updateTrees(env.trees, this.treeT, env.season); this.treeT = 0; }
    // 물
    const w = this.waterU; w.uTime.value = t; w.uNight.value = night; w.uSky.value.copy(su.uHor.value).lerp(su.uTop.value, 0.4);
    w.uSun.value.copy(k.sun).multiplyScalar(isN ? 0.3 : 1); w.uSunDir.value.copy(ld); w.uFog.value.copy(fog); w.uFogD.value = this.scene.fog.density;
    this.rainbow.material.uniforms.uA.value += (((env.season.i < 2 && !isN && env.dayPhase > 0.12 && env.dayPhase < 0.62) ? 0.32 : 0) * (1 - this.cloudy) - this.rainbow.material.uniforms.uA.value) * Math.min(1, dt);
    // 창문·가로등
    updateShared(night);
    this.glowMat.opacity = night * 0.55;
    
    this.lanterns.visible = this.lanternPoles.visible = env.festival;
    // 연기
    if (this.chimneysDirty) this.rebuildChimneys();
    this.smokeU.uTime.value = t; this.smokeU.uAmt.value = (env.season.i === 3 ? 1 : 0.35 + night * 0.6) * (1 - this.cloudy * 0.3);
    this.smokeU.uCol.value.set('#eeeef2').multiplyScalar(1 - night * 0.65);
    // 날씨 파티클
    let mode = 0, wa = 0;
    if (SHARED.snow.value > 0.05 && env.season.i === 3 || wmode === 'snow' || wmode === 'blizzard') { mode = 1; wa = wmode === 'blizzard' ? 1 : 0.65; }
    else if (env.season.i === 0 && !isN) { mode = 2; wa = 0.55; }
    else if (env.season.i === 2) { mode = 3; wa = 0.45; }
    if (mode !== this.wU.uMode.value) { this.weatherA = Math.max(0, this.weatherA - dt * 1.5); if (this.weatherA <= 0.01) this.wU.uMode.value = mode; }
    else this.weatherA += (wa - this.weatherA) * Math.min(1, dt);
    this.wU.uA.value = this.weatherA; this.wU.uTime.value = t; this.wU.uNight.value = night;
    this.rainA += ((wmode === 'rain' ? 1 : 0) - this.rainA) * Math.min(1, dt * 0.8);
    this.rainU.uA.value = this.rainA; this.rainU.uTime.value = t; this.rain.visible = this.rainA > 0.02;
    this.flyU.uTime.value = t; this.flyU.uA.value = night * (env.season.i === 1 || env.season.i === 0 ? 1 : 0.1);
    // 새
    this.birdU.uTime.value = t;
    const dd = new THREE.Object3D();
    this.birdData.forEach((b, i) => { const a = t * 0.1 + b.flock * 2.1; const R = 44 + b.flock * 9; const c = new THREE.Vector3(Math.cos(a) * R, 24 + b.flock * 5 + Math.sin(t * 0.3 + b.flock) * 2, Math.sin(a) * R).add(b.off); dd.position.copy(c); dd.lookAt(c.x - Math.sin(a), c.y, c.z + Math.cos(a)); dd.scale.setScalar(0.55 * (isN ? 0 : 1)); dd.updateMatrix(); this.birds.setMatrixAt(i, dd.matrix); });
    this.birds.instanceMatrix.needsUpdate = true;
    // 건물 진행·애니메이션
    let fountain = null, fire = null;
    for (const rec of this.models.values()) {
      const b = rec.b;
      const target = b.built ? 1 : Math.max(0.03, b.progress);
      rec.shown += (target - rec.shown) * Math.min(1, dt * 3);
      const e = rec.shown;
      rec.info.group.scale.set(1, Math.max(0.02, e), 1);
      if (rec.info.spin) rec.info.spin.rotation.z += dt * (b.built ? 1.2 : 0);
      if (rec.info.saw) rec.info.saw.rotation.y += dt * 8;
      if (rec.info.flag) rec.info.flag.rotation.y = Math.sin(t * 3 + b.id) * 0.3;
      if (rec.info.clock) { rec.info.clock.m.rotation.z = -t * 0.8; rec.info.clock.h.rotation.z = -t * 0.8 / 12; }
      if (rec.info.forge) rec.info.forge.material.emissiveIntensity = 1.6 + Math.sin(t * 9) * 0.4 + Math.sin(t * 23) * 0.2;
      if (rec.info.fountain && b.built) { fountain = rec.info.fountain.clone(); rec.info.group.localToWorld(fountain); }
      if (b.burning > 0) fire = rec.root.position;
    }
    this.fountU.uTime.value = t; this.fountU.uOn.value = fountain ? (env.season.i === 3 ? 0.2 : 1) : 0; if (fountain) this.fountU.uPos.value.copy(fountain);
    this.fireU.uTime.value = t; this.fireU.uOn.value += ((fire ? 1 : 0) - this.fireU.uOn.value) * Math.min(1, dt * 2); if (fire) this.fireU.uPos.value.copy(fire);
    // 열기구
    if (this.balloonAnim) {
      const A = this.balloonAnim; A.t += dt;
      if (A.t < 4) { const f = A.t / 4, e = 1 - Math.pow(1 - f, 3); this.balloon.position.lerpVectors(A.from, A.to, e); }
      else if (A.t < 6) this.balloon.position.copy(A.to);
      else if (A.t < 13) { const f = (A.t - 6) / 7; this.balloon.position.lerpVectors(A.to, A.away, f * f); }
      else { this.balloon.visible = false; this.balloonAnim = null; }
      this.balloon.rotation.y += dt * 0.2;
    }
    if (this.caravanAnim) { const A = this.caravanAnim; A.t += dt; const f = A.t / 16; this.caravan.position.lerpVectors(A.from, A.to, f); this.caravan.position.y += Math.sin(A.t) * 0.5; if (f >= 1) { this.caravan.visible = false; this.caravanAnim = null; } }
    // 기차
    if (env.trainOn) {
      this.train.visible = true; this.trainT += dt;
      const cyc = this.trainT % 22; let s;
      if (cyc < 7) s = 110 * Math.pow(1 - cyc / 7, 2); else if (cyc < 12) s = 0; else s = 110 * Math.pow((cyc - 12) / 10, 2);
      const p = this.railStart.clone().addScaledVector(this.railDir, s + 1);
      this.train.position.set(p.x, this.railY(s + 1) - 0.1, p.z); this.train.rotation.y = -Math.atan2(this.railDir.z, this.railDir.x) + Math.PI;
    }
    // 버스트
    const dm = new THREE.Object3D(); let n = 0;
    this.bursts = this.bursts.filter(p => (p.life += dt) < p.max);
    for (const p of this.bursts) { p.v.y -= p.g * dt; p.v.multiplyScalar(1 - dt * (p.kind === 'petals' ? 1.4 : 0.5)); p.p.addScaledVector(p.v, dt); p.r.x += dt * 4; p.r.y += dt * 3; dm.position.copy(p.p); dm.rotation.copy(p.r); dm.scale.setScalar(1 - p.life / p.max); dm.updateMatrix(); this.burstMesh.setMatrixAt(n, dm.matrix); this.burstMesh.setColorAt(n, p.c); n++; }
    this.burstMesh.count = n; this.burstMesh.instanceMatrix.needsUpdate = true; if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true;
    n = 0; this.fwBursts = this.fwBursts.filter(p => (p.life += dt) < p.max);
    for (const p of this.fwBursts) { p.v.y -= 3 * dt; p.v.multiplyScalar(1 - dt * 1.6); p.p.addScaledVector(p.v, dt); dm.position.copy(p.p); dm.lookAt(this.camera.position); dm.scale.setScalar((1 - p.life / p.max) * 1.1); dm.updateMatrix(); this.fwMesh.setMatrixAt(n, dm.matrix); this.fwMesh.setColorAt(n, p.c); n++; }
    this.fwMesh.count = n; this.fwMesh.instanceMatrix.needsUpdate = true; if (this.fwMesh.instanceColor) this.fwMesh.instanceColor.needsUpdate = true;
    // 색보정
    this.grade.uniforms.uSat.value = S.sat + (NS.sat - S.sat) * sw - this.cloudy * 0.25;
    this.grade.uniforms.uTint.value.set(lt.x * 0.5 + 0.5, lt.y * 0.5 + 0.5, lt.z * 0.5 + 0.5 + night * 0.05);
    this.bloom.strength = 0.36 + night * 0.28;
    return { night };
  }
  render() { this.composer.render(); }
}
