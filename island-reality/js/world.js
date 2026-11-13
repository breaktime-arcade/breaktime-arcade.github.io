/*!
 * 마지막 생존자 — 3D 월드 (지형·바다·하늘·조명·소품·파티클·후처리)
 * © 쉬는시간 오락실. All rights reserved.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mulberry32 } from './map.js';

const C = (h) => new THREE.Color(h);
const HRANGE = 100;

// ───────── 하루 시간대 키프레임 ─────────
const KEYS = [
  { t: 0.00, top: '#3a4f8f', hor: '#f4a882', sun: '#ffb27e', sunI: 1.0, hs: '#a9b8e6', hg: '#6d5a4a', hI: 0.6, fog: '#e9b79e', night: 0.15 },
  { t: 0.10, top: '#4a8de0', hor: '#c4e4f6', sun: '#fff1d9', sunI: 2.7, hs: '#c4e6ff', hg: '#7d6b50', hI: 0.95, fog: '#bfdff1', night: 0 },
  { t: 0.40, top: '#2c7ce2', hor: '#ade0f8', sun: '#fffaf0', sunI: 3.1, hs: '#c8e8ff', hg: '#7f6e52', hI: 1.0, fog: '#b6dff4', night: 0 },
  { t: 0.62, top: '#3b7dd2', hor: '#f3d8aa', sun: '#ffd79a', sunI: 2.6, hs: '#d8e2f0', hg: '#80684a', hI: 0.9, fog: '#eed9b5', night: 0 },
  { t: 0.73, top: '#3b4a8a', hor: '#ff8c55', sun: '#ff8a48', sunI: 1.6, hs: '#ffb894', hg: '#6a4a3a', hI: 0.65, fog: '#f2a476', night: 0.1 },
  { t: 0.79, top: '#1d2556', hor: '#7c4f80', sun: '#b07ac0', sunI: 0.55, hs: '#7a6aa8', hg: '#2c2433', hI: 0.55, fog: '#4b3d66', night: 0.6 },
  { t: 0.87, top: '#060a1c', hor: '#18234a', sun: '#93abff', sunI: 0.75, hs: '#4a5a9a', hg: '#1c1c26', hI: 0.6, fog: '#111a35', night: 1 },
  { t: 1.00, top: '#0b1230', hor: '#2c3160', sun: '#93abff', sunI: 0.7, hs: '#4a5592', hg: '#1c1a22', hI: 0.58, fog: '#232a52', night: 0.85 },
].map(k => ({ ...k, top: C(k.top), hor: C(k.hor), sun: C(k.sun), hs: C(k.hs), hg: C(k.hg), fog: C(k.fog) }));

function sampleKeys(t) {
  t = ((t % 1) + 1) % 1;
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].t < t) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const f = THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  const o = {};
  for (const k of ['top', 'hor', 'sun', 'hs', 'hg', 'fog']) o[k] = a[k].clone().lerp(b[k], f);
  for (const k of ['sunI', 'hI', 'night']) o[k] = a[k] + (b[k] - a[k]) * f;
  return o;
}

// ───────── 셰이더 ─────────
const NOISE_GLSL = /* glsl */`
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
`;

const WATER_VS = /* glsl */`
uniform float uTime;
varying vec3 vWorld;
varying float vFogDepth;
float wave(vec2 p){ return sin(p.x*0.16 + uTime*1.05)*0.11 + sin(p.y*0.21 - uTime*0.85)*0.09 + sin((p.x+p.y)*0.33 + uTime*1.6)*0.045; }
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  w.y += wave(w.xz);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const WATER_FS = /* glsl */`
uniform float uTime, uFogDensity, uNight, uHRange, uStorm;
uniform vec3 uSunDir, uSunColor, uSkyColor, uDeep, uShallow, uFogColor;
uniform sampler2D uHeight;
varying vec3 vWorld;
varying float vFogDepth;
${NOISE_GLSL}
float wave(vec2 p){ return sin(p.x*0.16 + uTime*1.05)*0.11 + sin(p.y*0.21 - uTime*0.85)*0.09 + sin((p.x+p.y)*0.33 + uTime*1.6)*0.045; }
float surf(vec2 p){ return wave(p) + vnoise(p*0.9 + uTime*0.35)*0.09 + vnoise(p*2.3 - uTime*0.55)*0.045*(1.0+uStorm*2.0); }
void main(){
  vec2 uv = vWorld.xz / (uHRange*2.0) + 0.5;
  float th = texture2D(uHeight, uv).r * 16.0 - 8.0;
  if (abs(vWorld.x) > uHRange || abs(vWorld.z) > uHRange) th = -9.0;
  float depth = max(0.0, vWorld.y - th);
  float e = 0.18;
  float h0 = surf(vWorld.xz), hx = surf(vWorld.xz + vec2(e,0.0)), hz = surf(vWorld.xz + vec2(0.0,e));
  vec3 N = normalize(vec3((h0-hx)*1.6, e, (h0-hz)*1.6));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  vec3 base = mix(uShallow, uDeep, smoothstep(0.0, 5.0, depth));
  float caus = vnoise(vWorld.xz*1.25 + uTime*0.55) * vnoise(vWorld.xz*1.8 - uTime*0.42);
  base += vec3(0.30, 0.42, 0.36) * pow(caus, 1.5) * 1.6 * (1.0 - smoothstep(0.0, 2.6, depth)) * (1.0 - uNight);
  vec3 col = mix(base, uSkyColor, fres * 0.6);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(N, H), 0.0), 220.0) * 3.0;
  col += uSunColor * pow(max(dot(N, H), 0.0), 24.0) * 0.06;
  float edge = 1.0 - smoothstep(0.0, 0.42, depth);
  float band = smoothstep(0.62, 1.0, sin(depth*6.5 - uTime*2.1 + vnoise(vWorld.xz*0.45)*5.0)*0.5+0.5) * (1.0 - smoothstep(0.1, 1.7, depth));
  float foam = clamp(edge*0.95 + band*0.55, 0.0, 1.0) * (0.55 + 0.45*vnoise(vWorld.xz*3.2 + uTime*0.8));
  foam += uStorm * smoothstep(0.82, 0.95, vnoise(vWorld.xz*0.6 + uTime*0.3)) * 0.5;
  col = mix(col, vec3(1.0) * mix(1.0, 0.22, uNight), clamp(foam, 0.0, 1.0));
  float ff = 1.0 - exp(-uFogDensity*uFogDensity*vFogDepth*vFogDepth);
  col = mix(col, uFogColor, ff);
  gl_FragColor = vec4(col, 1.0);
}`;

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 uTop, uHor, uSunDir, uSunColor, uMoonDir;
uniform float uNight, uTime, uStorm;
varying vec3 vDir;
${NOISE_GLSL}
float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHor, uTop, pow(smoothstep(-0.05, 0.75, y), 0.7));
  col = mix(col, uHor*0.55, smoothstep(0.0, -0.3, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 900.0)*28.0 + pow(sd, 14.0)*0.35) * (1.0 - uNight) * (1.0-uStorm*0.8);
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.85,0.9,1.0) * (smoothstep(0.9993, 0.9996, md)*3.0 + pow(md, 60.0)*0.12) * uNight * (1.0-uStorm);
  vec3 sp = floor(d * 260.0);
  float s = hash3(sp);
  float tw = 0.6 + 0.4*sin(uTime*3.0 + s*80.0);
  col += vec3(1.0) * step(0.9975, s) * tw * uNight * smoothstep(0.0, 0.25, y) * 1.6 * (1.0-uStorm);
  // 은하수 느낌
  float mw = vnoise(d.xz*6.0 + 3.0) * smoothstep(0.35, 0.0, abs(d.x*0.6 + d.z*0.8 - 0.1));
  col += vec3(0.35,0.4,0.6) * mw * 0.25 * uNight * (1.0-uStorm);
  col = mix(col, vec3(dot(col, vec3(0.33)))*0.7, uStorm*0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

const FIRE_VS = /* glsl */`
attribute vec3 aEmit; attribute float aSeed; attribute float aGroup;
uniform float uTime; uniform vec4 uOn; uniform float uScale;
varying float vLife; varying float vOn;
void main(){
  float on = aGroup < 0.5 ? uOn.x : (aGroup < 1.5 ? uOn.y : uOn.z);
  float spd = 0.9 + fract(aSeed*7.13)*0.6;
  float life = fract(uTime*spd*0.85 + aSeed);
  float sz = aGroup < 0.5 ? 1.0 : (aGroup < 1.5 ? 0.8 : 0.45);
  vec3 p = aEmit;
  float ang = aSeed*61.0 + uTime*2.0;
  float r = (0.45*(1.0-life) + 0.05) * sz;
  p.x += cos(ang)*r*fract(aSeed*3.7);
  p.z += sin(ang)*r*fract(aSeed*5.3);
  p.y += life * 2.1 * sz;
  p.x += sin(uTime*3.0 + aSeed*10.0)*0.12*life*sz;
  vLife = life; vOn = on;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = on * uScale * sz * (1.0 - life*0.7) * 210.0 / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FIRE_FS = /* glsl */`
varying float vLife; varying float vOn;
void main(){
  vec2 c = gl_PointCoord - 0.5; float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d) * (1.0 - vLife) * vOn;
  vec3 col = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.25, 0.05), smoothstep(0.0, 0.6, vLife));
  gl_FragColor = vec4(col * 3.2 * a, a);
}`;

const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.12 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uFlash: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig, uSat, uFlash; uniform vec3 uTint; varying vec2 vUv;
  void main(){ vec4 c = texture2D(tDiffuse, vUv);
    float l = dot(c.rgb, vec3(0.2126,0.7152,0.0722));
    c.rgb = mix(vec3(l), c.rgb, uSat) * uTint;
    vec2 q = vUv - 0.5; float v = 1.0 - dot(q,q)*uVig*2.4;
    c.rgb *= clamp(v, 0.0, 1.0);
    c.rgb += vec3(0.75,0.8,1.0) * uFlash;
    gl_FragColor = c; }`,
};

// ───────── 월드 ─────────
export class World {
  constructor(renderer, camera, map) {
    this.renderer = renderer; this.camera = camera; this.map = map;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfdff1, 0.0058);
    this.time = 0; this.rng = mulberry32(99);
    this.wind = { value: 0 };
    this.quality = 'high';
    this.storm = 0; this.stormTarget = 0; this.flash = 0;
    this.bursts = [];
    this.buildSky();
    this.buildLights();
    this.buildTerrain();
    this.buildWater();
    this.buildVegetation();
    this.buildCamp();
    this.buildCouncil();
    this.buildChallengeProps();
    this.buildDock();
    this.buildSpring();
    this.buildParticles();
    this.buildClouds();
    this.buildComposer();
  }

  // ── 하늘 ──
  buildSky() {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: C('#2c7ce2') }, uHor: { value: C('#ade0f8') }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(-0.3, 0.75, -0.5).normalize() }, uSunColor: { value: C('#fff') }, uNight: { value: 0 }, uTime: { value: 0 }, uStorm: { value: 0 } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 48, 24), mat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1;
    this.scene.add(this.sky);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xc8e8ff, 0x7f6e52, 1.0);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera; s.left = -72; s.right = 72; s.top = 72; s.bottom = -72; s.near = 1; s.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.radius = 3;
    this.scene.add(sun); this.scene.add(sun.target);
    const m = this.map;
    this.fireLight = new THREE.PointLight(0xff8a3a, 0, 34, 1.6);
    this.fireLight.position.set(m.camp.x, m.camp.y + 1.4, m.camp.z);
    this.scene.add(this.fireLight);
    this.councilLight = new THREE.PointLight(0xff9c4a, 0, 30, 1.5);
    this.councilLight.position.set(m.council.x, m.council.y + 2.2, m.council.z);
    this.scene.add(this.councilLight);
  }

  // ── 지형 ──
  buildTerrain() {
    const m = this.map, rng = mulberry32(5);
    const geo = new THREE.PlaneGeometry(HRANGE * 2, HRANGE * 2, 180, 180);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const step = (HRANGE * 2) / 180;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i), z = pos.getZ(i);
      if (Math.abs(x) < HRANGE - 1 && Math.abs(z) < HRANGE - 1) { x += (rng() - 0.5) * step * 0.6; z += (rng() - 0.5) * step * 0.6; }
      pos.setXYZ(i, x, m.h(x, z), z);
    }
    const g = geo.toNonIndexed();
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const cSand = C('#efd59b'), cWet = C('#cdb07a'), cSandG = C('#c9c27a'), cGrass = C('#72b04a'), cGrass2 = C('#5f9c3e'), cForest = C('#4b8638'), cRock = C('#8f8a80'), cRock2 = C('#6f6b66'), cDirt = C('#b89a6a');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
    const col = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
      const y = (a.y + b.y + c.y) / 3, cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
      n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
      const slope = 1 - Math.abs(n.y);
      const r = rng();
      if (y < -0.25) col.copy(cWet);
      else if (y < 0.5) col.copy(cSand);
      else if (y < 0.85) col.copy(cSand).lerp(cSandG, (y - 0.5) / 0.35);
      else if (y < 4.5) col.copy(r < 0.5 ? cGrass : cGrass2);
      else if (y < 8.5) col.copy(cForest).lerp(cGrass2, r * 0.5);
      else col.copy(r < 0.5 ? cRock : cRock2);
      if (slope > 0.42 && y > 1) col.lerp(r < 0.5 ? cRock : cRock2, 0.85);
      // 캠프·회의장 주변 흙길
      const dc = Math.hypot(cx - m.camp.x, cz - m.camp.z), dv = Math.hypot(cx - m.council.x, cz - m.council.z);
      if (dc < 7) col.lerp(cDirt, (1 - dc / 7) * 0.8);
      if (dv < 6) col.lerp(cDirt, (1 - dv / 6) * 0.75);
      col.offsetHSL(0, 0, (r - 0.5) * 0.05);
      for (let k = 0; k < 3; k++) { colors[(i + k) * 3] = col.r; colors[(i + k) * 3 + 1] = col.g; colors[(i + k) * 3 + 2] = col.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0 });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true; this.terrain.castShadow = true;
    this.scene.add(this.terrain);

    // 높이 텍스처 (바다 셰이더용)
    const W = 256, data = new Uint8Array(W * W * 4);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const x = -HRANGE + (i + 0.5) / W * HRANGE * 2, z = -HRANGE + (j + 0.5) / W * HRANGE * 2;
      const v = Math.round(THREE.MathUtils.clamp((m.h(x, z) + 8) / 16, 0, 1) * 255);
      const k = (i + j * W) * 4; data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
    }
    this.heightTex = new THREE.DataTexture(data, W, W, THREE.RGBAFormat);
    this.heightTex.magFilter = THREE.LinearFilter; this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;
  }

  // ── 바다 ──
  buildWater() {
    const geo = new THREE.PlaneGeometry(1400, 1400, 220, 220);
    geo.rotateX(-Math.PI / 2);
    this.waterU = {
      uTime: { value: 0 }, uFogDensity: { value: 0.0058 }, uNight: { value: 0 }, uHRange: { value: HRANGE }, uStorm: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: C('#fff') }, uSkyColor: { value: C('#9fd3f0') },
      uDeep: { value: C('#0b5f8f') }, uShallow: { value: C('#3fd6c8') }, uFogColor: { value: C('#bfdff1') }, uHeight: { value: this.heightTex },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: this.waterU });
    this.water = new THREE.Mesh(geo, mat);
    this.water.receiveShadow = false;
    this.scene.add(this.water);
  }

  // 바람 흔들림 셰이더 주입
  windify(mat, amp = 0.15, mode = 'grass') {
    const wind = this.wind;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = wind;
      sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec2 ip = vec2(instanceMatrix[3].x, instanceMatrix[3].z);
        #else
          vec2 ip = vec2(0.0);
        #endif
        ${mode === 'grass'
          ? `float w = sin(uWind*2.2 + ip.x*0.35 + ip.y*0.27) * ${amp.toFixed(3)} * max(position.y, 0.0);
             transformed.x += w; transformed.z += w*0.6;`
          : mode === 'leaf'
            ? `float r = length(position.xz);
               transformed.y += sin(uWind*2.6 + ip.x*0.5 + atan(position.z, position.x)*2.0) * ${amp.toFixed(3)} * r;
               transformed.x += sin(uWind*1.7 + ip.y*0.3) * 0.05 * r;`
            : `float f = max(position.x + 0.0, 0.0);
               transformed.z += sin(uWind*6.0 - position.x*2.5) * ${amp.toFixed(3)} * f;`}
      }`);
    };
    mat.customProgramCacheKey = () => 'wind-' + mode + amp;
    return this.nearFade(mat);
  }
  // 카메라 바로 앞 식생을 디더링으로 투명하게 (시야 가림 방지)
  nearFade(mat, dist = 7.5) {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev && prev.call(mat, sh, r);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `
      float bayer4(vec2 p){ vec2 q = mod(floor(p), 4.0); int i = int(q.x + q.y*4.0);
        float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return (m[i]+0.5)/16.0; }
      void main() {
        { float d = length(vViewPosition); float f = smoothstep(${(dist * 0.45).toFixed(2)}, ${dist.toFixed(2)}, d); if (f < bayer4(gl_FragCoord.xy)) discard; }`);
    };
    const key = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
    mat.customProgramCacheKey = () => key + '-fade';
    return mat;
  }

  // ── 식생·바위 ──
  buildVegetation() {
    const m = this.map, rng = mulberry32(17);
    const dummy = new THREE.Object3D();
    // 야자수 줄기
    const segs = [];
    const H = 6.2, N = 9;
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N;
      const r0 = 0.26 - t0 * 0.1, r1 = 0.26 - t1 * 0.1;
      const cg = new THREE.CylinderGeometry(r1 * 1.08, r0, H / N, 7, 1);
      const bend = (t) => t * t * 1.7;
      cg.translate(0, H / N / 2, 0);
      const ang = Math.atan2(bend(t1) - bend(t0), H / N);
      cg.rotateZ(-ang);
      cg.translate(bend(t0), t0 * H, 0);
      segs.push(cg);
    }
    const trunkGeo = mergeGeometries(segs);
    const trunkMat = this.nearFade(new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9, flatShading: true }));
    // 잎
    const leaves = [];
    for (let i = 0; i < 9; i++) {
      const lg = new THREE.PlaneGeometry(3.6, 0.9, 8, 2);
      const lp = lg.attributes.position;
      for (let k = 0; k < lp.count; k++) {
        const x = lp.getX(k) + 1.8, yv = lp.getY(k);
        const w = 1 - Math.pow(x / 3.6, 1.6);
        lp.setXYZ(k, x, -Math.pow(x / 3.6, 2) * 1.6 + Math.abs(yv) * 0.35, yv * w);
      }
      lg.computeVertexNormals();
      lg.rotateY((i / 9) * Math.PI * 2 + rng() * 0.3);
      lg.rotateX((rng() - 0.5) * 0.2);
      leaves.push(lg);
    }
    const leafGeo = mergeGeometries(leaves); leafGeo.translate(1.7, H + 0.05, 0);
    const leafMat = this.windify(new THREE.MeshStandardMaterial({ color: 0x4fa83c, roughness: 0.75, side: THREE.DoubleSide, flatShading: true }), 0.05, 'leaf');
    const cocoGeo = mergeGeometries([0, 1, 2].map(i => { const s = new THREE.IcosahedronGeometry(0.24, 0); s.translate(1.7 + Math.cos(i * 2.1) * 0.3, H - 0.25, Math.sin(i * 2.1) * 0.3); return s; }));
    const cocoMat = this.nearFade(new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8, flatShading: true }));
    const n = m.palms.length;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, n), crowns = new THREE.InstancedMesh(leafGeo, leafMat, n), cocos = new THREE.InstancedMesh(cocoGeo, cocoMat, n);
    const lc = new THREE.Color();
    m.palms.forEach((p, i) => {
      dummy.position.set(p.x, p.y - 0.2, p.z); dummy.rotation.set(0, p.r, 0); dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix); crowns.setMatrixAt(i, dummy.matrix); cocos.setMatrixAt(i, dummy.matrix);
      lc.setHSL(0.27 + rng() * 0.06, 0.55, 0.38 + rng() * 0.1); crowns.setColorAt(i, lc);
    });
    for (const im of [trunks, crowns, cocos]) { im.castShadow = true; im.receiveShadow = true; this.scene.add(im); }

    // 활엽수
    const tTrunk = new THREE.CylinderGeometry(0.22, 0.35, 2.6, 6); tTrunk.translate(0, 1.3, 0);
    const blobs = [];
    [[0, 3.3, 0, 1.7], [0.9, 2.8, 0.3, 1.2], [-0.8, 2.9, -0.2, 1.25], [0.1, 4.2, -0.2, 1.15]].forEach(([x, y, z, r]) => { const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); blobs.push(s); });
    const folGeo = mergeGeometries(blobs);
    const pine = mergeGeometries([0, 1, 2].map(i => { const c = new THREE.ConeGeometry(1.9 - i * 0.45, 2.2, 7); c.translate(0, 2.4 + i * 1.25, 0); return c; }));
    const trunkM = this.nearFade(new THREE.MeshStandardMaterial({ color: 0x6e4f33, roughness: 0.95, flatShading: true }));
    const folM = this.windify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), 0.03, 'leaf');
    const kinds = [m.trees.filter(t => t.kind === 0), m.trees.filter(t => t.kind === 1)];
    kinds.forEach((arr, ki) => {
      const tr = new THREE.InstancedMesh(tTrunk, trunkM, arr.length);
      const fo = new THREE.InstancedMesh(ki ? pine : folGeo, folM, arr.length);
      arr.forEach((t, i) => {
        dummy.position.set(t.x, t.y - 0.15, t.z); dummy.rotation.set(0, t.r, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix();
        tr.setMatrixAt(i, dummy.matrix); fo.setMatrixAt(i, dummy.matrix);
        lc.setHSL(ki ? 0.36 + rng() * 0.04 : 0.24 + rng() * 0.08, ki ? 0.45 : 0.55, ki ? 0.26 + rng() * 0.06 : 0.36 + rng() * 0.1); fo.setColorAt(i, lc);
      });
      for (const im of [tr, fo]) { im.castShadow = true; im.receiveShadow = true; this.scene.add(im); }
    });

    // 덤불 + 열매
    const bushGeo = mergeGeometries([[0, 0.5, 0, 0.8], [0.6, 0.4, 0.2, 0.6], [-0.5, 0.42, -0.1, 0.62]].map(([x, y, z, r]) => { const s = new THREE.IcosahedronGeometry(r, 1); s.translate(x, y, z); return s; }));
    const berryGeo = mergeGeometries([...Array(7)].map((_, i) => { const s = new THREE.SphereGeometry(0.1, 6, 5); const a = i * 0.9; s.translate(Math.cos(a) * 0.75, 0.55 + Math.sin(i * 1.7) * 0.25, Math.sin(a) * 0.65); return s; }));
    const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x3f8a36, roughness: 0.85, flatShading: true }), m.bushes.length);
    const berries = new THREE.InstancedMesh(berryGeo, new THREE.MeshStandardMaterial({ color: 0xe0304a, roughness: 0.4, emissive: 0x400010 }), m.bushes.length);
    m.bushes.forEach((b, i) => { dummy.position.set(b.x, b.y - 0.1, b.z); dummy.rotation.set(0, rng() * 6, 0); dummy.scale.setScalar(b.s); dummy.updateMatrix(); bushes.setMatrixAt(i, dummy.matrix); berries.setMatrixAt(i, dummy.matrix); });
    bushes.castShadow = true; bushes.receiveShadow = true; this.scene.add(bushes, berries);

    // 바위
    const rg = new THREE.DodecahedronGeometry(1, 0);
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setXYZ(i, rp.getX(i) * (0.85 + rng() * 0.3), rp.getY(i) * (0.7 + rng() * 0.2), rp.getZ(i) * (0.85 + rng() * 0.3));
    rg.computeVertexNormals();
    const rocks = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: 0.95, flatShading: true }), m.rocks.length);
    m.rocks.forEach((r, i) => { dummy.position.set(r.x, r.y + r.s * 0.2, r.z); dummy.rotation.set(rng(), r.r, rng() * 0.5); dummy.scale.set(r.s, r.s * 0.75, r.s * 1.1); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix); lc.setHSL(0.08, 0.05 + rng() * 0.05, 0.45 + rng() * 0.15); rocks.setColorAt(i, lc); });
    rocks.castShadow = true; rocks.receiveShadow = true; this.scene.add(rocks);

    // 풀 (인스턴싱 + 바람)
    const blades = mergeGeometries([0, 1, 2, 3].map(i => { const c = new THREE.ConeGeometry(0.07, 0.75 + (i % 2) * 0.25, 3); c.translate(Math.cos(i * 1.6) * 0.14, 0.4, Math.sin(i * 1.6) * 0.14); c.rotateZ((i - 1.5) * 0.15); return c; }));
    const grassMat = this.windify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), 0.22, 'grass');
    const pts = [];
    for (let k = 0; k < 9000 && pts.length < 3200; k++) {
      const x = (rng() - 0.5) * 130, z = (rng() - 0.5) * 130, y = m.h(x, z);
      if (y < 0.95 || y > 8) continue;
      if (Math.hypot(x - m.camp.x, z - m.camp.z) < 7 || Math.hypot(x - m.council.x, z - m.council.z) < 7.5) continue;
      pts.push([x, y, z]);
    }
    const grass = new THREE.InstancedMesh(blades, grassMat, pts.length);
    pts.forEach(([x, y, z], i) => { dummy.position.set(x, y - 0.05, z); dummy.rotation.set(0, rng() * 6, 0); dummy.scale.setScalar(0.7 + rng() * 0.8); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); lc.setHSL(0.24 + rng() * 0.07, 0.55, 0.32 + rng() * 0.14); grass.setColorAt(i, lc); });
    grass.receiveShadow = true; this.scene.add(grass);
    this.grass = grass;
    // 꽃
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x111111 }), 260);
    const fcols = ['#ff7eb3', '#ffd23f', '#ffffff', '#ff9f43', '#b18cff'];
    for (let i = 0; i < 260; i++) { const p = pts[Math.floor(rng() * pts.length)]; dummy.position.set(p[0] + rng() - 0.5, p[1] + 0.6, p[2] + rng() - 0.5); dummy.scale.setScalar(0.8 + rng() * 0.6); dummy.updateMatrix(); fl.setMatrixAt(i, dummy.matrix); fl.setColorAt(i, C(fcols[i % fcols.length])); }
    this.scene.add(fl);
  }

  // ── 캠프 ──
  buildCamp() {
    const m = this.map, cy = m.camp.y;
    const g = this.campGroup = new THREE.Group(); this.scene.add(g);
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x7d7a76, roughness: 1, flatShading: true });
    const woodM = this.woodM = new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 0.9, flatShading: true });
    const darkWoodM = new THREE.MeshStandardMaterial({ color: 0x4e3524, roughness: 0.9, flatShading: true });
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), stoneM); s.position.set(m.camp.x + Math.cos(a) * 1.1, cy + 0.12, m.camp.z + Math.sin(a) * 1.1); s.castShadow = true; g.add(s); }
    for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6), darkWoodM); l.rotation.z = Math.PI / 2 - 0.5; l.rotation.y = i * Math.PI / 2; l.position.set(m.camp.x, cy + 0.35, m.camp.z); g.add(l); }
    // 통나무 의자
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 8), woodM);
      log.rotation.z = Math.PI / 2; log.rotation.y = -a + Math.PI / 2;
      log.position.set(m.camp.x + Math.cos(a) * 5.1, cy + 0.25, m.camp.z + Math.sin(a) * 5.1);
      log.castShadow = true; log.receiveShadow = true; g.add(log);
    }
    // 식량 보관함
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 1.1), woodM);
    crate.position.set(m.stash.x, m.h(m.stash.x, m.stash.z) + 0.45, m.stash.z); crate.castShadow = true; g.add(crate);
    const fishGeo = new THREE.SphereGeometry(0.22, 7, 5); fishGeo.scale(1.8, 0.6, 0.8);
    this.foodItems = new THREE.InstancedMesh(fishGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.2 }), 18);
    const d = new THREE.Object3D(), rng = mulberry32(3);
    for (let i = 0; i < 18; i++) {
      d.position.set(m.stash.x + (i % 4 - 1.5) * 0.36 + (rng() - 0.5) * 0.1, crate.position.y + 0.55 + Math.floor(i / 8) * 0.18, m.stash.z + (Math.floor(i / 4) % 2 - 0.5) * 0.45);
      d.rotation.set(0, rng() * 3, 0); d.updateMatrix(); this.foodItems.setMatrixAt(i, d.matrix);
      this.foodItems.setColorAt(i, C(i % 3 === 0 ? '#7a5030' : i % 3 === 1 ? '#a9c6d8' : '#e8a040'));
    }
    this.foodItems.count = 0; this.foodItems.castShadow = true; g.add(this.foodItems);
    // 장작더미
    this.woodItems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.16, 1.5, 6), woodM, 14);
    for (let i = 0; i < 14; i++) { const row = Math.floor(i / 5), col = i % 5; d.position.set(m.woodPile.x + (col - 2) * 0.34 + row * 0.17, m.h(m.woodPile.x, m.woodPile.z) + 0.16 + row * 0.29, m.woodPile.z); d.rotation.set(Math.PI / 2, 0, 0); d.updateMatrix(); this.woodItems.setMatrixAt(i, d.matrix); }
    this.woodItems.count = 0; this.woodItems.castShadow = true; g.add(this.woodItems);
    // 은신처 (단계별)
    const sx = m.shelter.x, sz = m.shelter.z, sy = m.h(sx, sz);
    const thatchM = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 1, flatShading: true, side: THREE.DoubleSide });
    const leafM = new THREE.MeshStandardMaterial({ color: 0x5b9a3a, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    const st = this.shelterStages = [];
    const mk = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(sx + x, sy + y, sz + z); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; return o; };
    const s1 = new THREE.Group(); [[-3.4, -1.5], [3.4, -1.5], [-3.4, 1.8], [3.4, 1.8]].forEach(([x, z]) => s1.add(mk(new THREE.CylinderGeometry(0.13, 0.15, 3.2, 6), woodM, x, 1.4, z)));
    const s2 = new THREE.Group(); for (let i = 0; i < 11; i++) s2.add(mk(new THREE.BoxGeometry(0.62, 0.12, 3.6), woodM, -3.1 + i * 0.62, 0.45, 0.15)); s2.add(mk(new THREE.BoxGeometry(7.2, 0.18, 0.2), darkWoodM, 0, 0.36, -1.5)); s2.add(mk(new THREE.BoxGeometry(7.2, 0.18, 0.2), darkWoodM, 0, 0.36, 1.8));
    const s3 = new THREE.Group(); s3.add(mk(new THREE.CylinderGeometry(0.1, 0.1, 7.4, 6), darkWoodM, 0, 3.3, 0.15, 0, 0, Math.PI / 2)); [-3.4, 0, 3.4].forEach(x => { s3.add(mk(new THREE.BoxGeometry(0.12, 2.3, 0.12), darkWoodM, x, 2.5, -0.65, 0.78)); s3.add(mk(new THREE.BoxGeometry(0.12, 2.3, 0.12), darkWoodM, x, 2.5, 0.95, -0.78)); });
    const s4 = new THREE.Group(); s4.add(mk(new THREE.BoxGeometry(7.6, 0.16, 2.7, 6, 1, 3), thatchM, 0, 2.55, -0.8, 0.82)); s4.add(mk(new THREE.BoxGeometry(7.6, 0.16, 2.7, 6, 1, 3), thatchM, 0, 2.55, 1.1, -0.82));
    for (let i = 0; i < 8; i++) s4.add(mk(new THREE.PlaneGeometry(1.1, 2.4), leafM, -3.3 + i * 0.95, 2.75, -0.7 + (i % 2) * 1.6, i % 2 ? -0.85 : 0.85, 0, (i % 3 - 1) * 0.1));
    const s5 = new THREE.Group(); s5.add(mk(new THREE.BoxGeometry(0.15, 2.0, 3.1), thatchM, -3.45, 1.45, 0.15)); s5.add(mk(new THREE.BoxGeometry(0.15, 2.0, 3.1), thatchM, 3.45, 1.45, 0.15));
    const flagPole = mk(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), darkWoodM, 3.4, 4.3, 0.15); s5.add(flagPole);
    const flag = mk(new THREE.PlaneGeometry(1.1, 0.6, 8, 1), this.windify(new THREE.MeshStandardMaterial({ color: 0xff4757, side: THREE.DoubleSide, roughness: 0.7 }), 0.18, 'flag'), 3.95, 5.05, 0.15);
    flag.geometry.translate(0, 0, 0); s5.add(flag);
    [[10, s1], [30, s2], [55, s3], [80, s4], [100, s5]].forEach(([th, grp]) => { grp.userData = { th, s: 0 }; grp.visible = false; g.add(grp); st.push(grp); });
  }
  setShelter(v) { for (const grp of this.shelterStages) grp.userData.on = v >= grp.userData.th; }
  setFood(n) { this.foodItems.count = Math.min(18, Math.max(0, Math.round(n))); }
  setWood(n) { this.woodItems.count = Math.min(14, Math.max(0, Math.round(n))); }

  // ── 부족회의장 ──
  buildCouncil() {
    const m = this.map, cx = m.council.x, cz = m.council.z, cy = m.council.y;
    const g = new THREE.Group(); this.scene.add(g);
    const wood = this.woodM, dark = new THREE.MeshStandardMaterial({ color: 0x3f2b1e, roughness: 0.9, flatShading: true });
    this.torches = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = cx + Math.cos(a) * 7.6, z = cz + Math.sin(a) * 7.6, y = m.h(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 6), dark); pole.position.set(x, y + 1.3, z); pole.castShadow = true; g.add(pole);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.12, 0.35, 7), wood); cup.position.set(x, y + 2.7, z); g.add(cup);
      this.torches.push(new THREE.Vector3(x, y + 2.85, z));
    }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x5a5550, roughness: 0.8, flatShading: true }));
    bowl.position.set(cx, cy + 0.4, cz); bowl.castShadow = true; g.add(bowl);
    this.councilFire = new THREE.Vector3(cx, cy + 0.8, cz);
    // 좌석
    const stump = new THREE.CylinderGeometry(0.42, 0.48, 0.5, 8);
    for (const s of m.councilSeats.concat(m.jurySeats)) { const o = new THREE.Mesh(stump, wood); o.position.set(s.x, m.h(s.x, s.z) + 0.25, s.z); o.castShadow = true; o.receiveShadow = true; g.add(o); }
    // 투표함 + 토템
    const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x9c6a3a, roughness: 0.6 }));
    urn.position.set(cx + 2.2, cy + 1.25, cz - 1.6); g.add(urn);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.9), dark); ped.position.set(cx + 2.2, cy + 0.4, cz - 1.6); g.add(ped);
    this.urnPos = new THREE.Vector3(cx + 2.2, cy + 1.7, cz - 1.6);
    const totemM = [0xb4583a, 0x2f8f8a, 0xe0a030].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, flatShading: true }));
    [-1, 1].forEach(side => {
      for (let k = 0; k < 3; k++) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.9), totemM[k]); b.position.set(cx + side * 9.2, m.h(cx + side * 9.2, cz - 2) + 0.5 + k * 1.0, cz - 2); b.castShadow = true; g.add(b);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0x111111 })); eye.position.set(cx + side * 9.2, m.h(cx + side * 9.2, cz - 2) + 0.65 + k * 1.0, cz - 1.54); g.add(eye);
      }
    });
  }

  // ── 미션 소품 ──
  buildChallengeProps() {
    const m = this.map;
    const postM = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.9, flatShading: true });
    const capM = new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.6 });
    for (const p of m.posts) {
      const h = p.top - p.base;
      const o = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, h, 8), postM); o.position.set(p.x, p.base + h / 2, p.z); o.castShadow = true; this.scene.add(o);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 12), capM); cap.position.set(p.x, p.top - 0.06, p.z); cap.castShadow = true; this.scene.add(cap);
    }
    // 출발/결승 아치 + 체크 깃발
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
    const cx = cv.getContext('2d'); for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { cx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; cx.fillRect(i * 8, j * 8, 8, 8); }
    const chk = new THREE.CanvasTexture(cv); chk.colorSpace = THREE.SRGBColorSpace; chk.magFilter = THREE.NearestFilter;
    const arch = (p, q, mat) => {
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz), nx = -dz / d, nz = dx / d;
      const y = m.h(p.x, p.z);
      const g = new THREE.Group();
      [-1, 1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 4, 6), postM); pole.position.set(p.x + nx * s * 5.6, y + 2, p.z + nz * s * 5.6); pole.castShadow = true; g.add(pole); });
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 0.9, 16, 1), mat);
      ban.position.set(p.x, y + 3.6, p.z); ban.rotation.y = Math.atan2(nx, nz) + Math.PI / 2; g.add(ban);
      this.scene.add(g);
    };
    const rc = m.raceCourse;
    arch(rc[0], rc[1], new THREE.MeshStandardMaterial({ color: 0x2ecc71, side: THREE.DoubleSide, roughness: 0.6 }));
    arch(rc.at(-1), rc.at(-2), new THREE.MeshStandardMaterial({ map: chk, side: THREE.DoubleSide, roughness: 0.6 }));
    // 코스 깃발
    const fm = this.windify(new THREE.MeshStandardMaterial({ color: 0xff6b6b, side: THREE.DoubleSide }), 0.12, 'flag');
    rc.forEach((p, i) => { if (i % 2 || i === 0 || i === rc.length - 1) return; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 4), postM); const y = m.h(p.x, p.z); const ox = p.x * 0.04, oz = p.z * 0.04; pole.position.set(p.x - ox * 2.5, y + 0.8, p.z - oz * 2.5); this.scene.add(pole); const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35, 6, 1), fm); f.geometry.translate(0.3, 0, 0); f.position.set(pole.position.x, y + 1.4, pole.position.z); this.scene.add(f); });
  }

  // ── 선착장 + 보트 ──
  buildDock() {
    const m = this.map, d = m.dock;
    const g = new THREE.Group(); this.scene.add(g);
    const plankM = new THREE.MeshStandardMaterial({ color: 0x9a7048, roughness: 0.9, flatShading: true });
    const len = 10, ang = d.ang;
    for (let i = 0; i < 16; i++) {
      const t = i / 16 * len - 1;
      const x = d.x + Math.cos(ang) * t, z = d.z + Math.sin(ang) * t;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 2.2), plankM); p.position.set(x, 0.75, z); p.rotation.y = -ang; p.castShadow = true; p.receiveShadow = true; g.add(p);
      if (i % 4 === 0) [-1, 1].forEach(s => { const po = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), plankM); po.position.set(x - Math.sin(ang) * s * 1.05, -0.6, z + Math.cos(ang) * s * 1.05); g.add(po); });
    }
    // 보트
    const boat = this.boat = new THREE.Group();
    const hull = new THREE.Mesh(this.boatHull(), new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.6, flatShading: true }));
    hull.castShadow = true; boat.add(hull);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.12, 1.62), new THREE.MeshStandardMaterial({ color: 0xd94a3a })); stripe.position.y = 0.42; boat.add(stripe);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 3.6, 6), plankM); mast.position.set(0.3, 2.1, 0); boat.add(mast);
    const sailG = new THREE.BufferGeometry(); sailG.setAttribute('position', new THREE.Float32BufferAttribute([0.35, 0.7, 0, 0.35, 3.7, 0, 2.2, 0.8, 0], 3)); sailG.computeVertexNormals();
    const sail = new THREE.Mesh(sailG, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 })); boat.add(sail);
    this.boatHome = new THREE.Vector3(d.end.x + Math.sin(ang) * 1.9, 0.05, d.end.z - Math.cos(ang) * 1.9);
    boat.position.copy(this.boatHome); boat.rotation.y = -ang;
    this.scene.add(boat);
    this.boatAnim = null;
    this.boatSeat = new THREE.Vector3(-0.8, 0.45, 0);
  }
  boatHull() {
    const shape = new THREE.Shape();
    shape.moveTo(-2.1, -0.75); shape.lineTo(1.4, -0.75); shape.quadraticCurveTo(2.5, 0, 1.4, 0.75); shape.lineTo(-2.1, 0.75); shape.lineTo(-2.1, -0.75);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.1, bevelSegments: 1 });
    g.rotateX(Math.PI / 2); g.translate(0, 0.5, 0);
    return g;
  }
  sailAway(onDone) {
    const d = this.map.dock;
    this.boatAnim = { t: 0, dur: 9, from: this.boatHome.clone(), dir: new THREE.Vector3(Math.cos(d.ang), 0, Math.sin(d.ang)), onDone };
  }

  // ── 샘물 ──
  buildSpring() {
    const s = this.map.spring;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(2.6, 20), new THREE.MeshStandardMaterial({ color: 0x2fa8c8, roughness: 0.08, metalness: 0.1, emissive: 0x0a3040 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(s.x, s.y + 0.14, s.z); this.scene.add(pond);
    const rm = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + (i % 3) * 0.15, 0), rm); r.position.set(s.x + Math.cos(a) * 2.8, s.y + 0.2, s.z + Math.sin(a) * 2.8); r.castShadow = true; this.scene.add(r); }
  }

  // ── 파티클 ──
  buildParticles() {
    const m = this.map;
    // 불꽃 (GPU 애니메이션)
    const emitters = [];
    for (let i = 0; i < 260; i++) emitters.push([m.camp.x, m.camp.y + 0.3, m.camp.z, 0]);
    for (let i = 0; i < 150; i++) emitters.push([this.councilFire.x, this.councilFire.y, this.councilFire.z, 1]);
    this.torches.forEach(t => { for (let i = 0; i < 26; i++) emitters.push([t.x, t.y, t.z, 2]); });
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(emitters.length * 3), em = new Float32Array(emitters.length * 3), seed = new Float32Array(emitters.length), grp = new Float32Array(emitters.length);
    emitters.forEach((e, i) => { em.set(e.slice(0, 3), i * 3); pos.set(e.slice(0, 3), i * 3); seed[i] = Math.random(); grp[i] = e[3]; });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEmit', new THREE.BufferAttribute(em, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aGroup', new THREE.BufferAttribute(grp, 1));
    this.fireU = { uTime: { value: 0 }, uOn: { value: new THREE.Vector4(1, 0, 0, 0) }, uScale: { value: 1 } };
    this.fire = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: FIRE_VS, fragmentShader: FIRE_FS, uniforms: this.fireU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fire.frustumCulled = false; this.scene.add(this.fire);

    // 비
    const RN = 4000, rp = new Float32Array(RN * 6);
    for (let i = 0; i < RN; i++) { const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80; rp.set([x, y, z, x - 0.15, y - 1.1, z], i * 6); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rainU = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uAlpha: { value: 0 } };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      uniforms: this.rainU, transparent: true, depthWrite: false,
      vertexShader: `uniform float uTime; uniform vec3 uCenter; void main(){ vec3 p = position; p.y = mod(p.y - uTime*32.0, 40.0); p.xz += uCenter.xz; p.y += uCenter.y - 8.0; gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `uniform float uAlpha; void main(){ gl_FragColor = vec4(0.75,0.82,0.95, 0.45*uAlpha); }`,
    }));
    this.rain.frustumCulled = false; this.rain.visible = false; this.scene.add(this.rain);

    // 반딧불
    const FN = 140, fp = new Float32Array(FN * 3), fs = new Float32Array(FN);
    const rng = mulberry32(8);
    for (let i = 0; i < FN; i++) { const t = m.trees[Math.floor(rng() * m.trees.length)] || m.camp; fp.set([t.x + (rng() - 0.5) * 8, (t.y || 1) + 0.8 + rng() * 2.5, t.z + (rng() - 0.5) * 8], i * 3); fs[i] = rng() * 100; }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 1));
    this.flyU = { uTime: { value: 0 }, uNight: { value: 0 } };
    this.flies = new THREE.Points(fg, new THREE.ShaderMaterial({
      uniforms: this.flyU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uNight; varying float vA; void main(){ vec3 p = position; p.x += sin(uTime*0.6+aSeed)*1.2; p.y += sin(uTime*0.9+aSeed*2.0)*0.5; p.z += cos(uTime*0.5+aSeed*1.3)*1.2; vA = uNight * (0.5+0.5*sin(uTime*3.0+aSeed*7.0)); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = 90.0*vA/ -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(vec3(1.0,0.95,0.45)*2.5*vA*(1.0-d*2.0), 1.0); }`,
    }));
    this.flies.frustumCulled = false; this.scene.add(this.flies);

    // 범용 버스트(물보라·꽃가루·폭죽)
    this.burstMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false }), 900);
    this.burstMesh.count = 0; this.burstMesh.frustumCulled = false;
    this.burstMesh.setColorAt(0, new THREE.Color());
    this.scene.add(this.burstMesh);
  }
  burst(x, y, z, kind = 'splash', n = 40) {
    const cols = kind === 'confetti' ? ['#ff4757', '#ffd23f', '#2ed573', '#1e90ff', '#ff6bcb', '#ffffff'] : kind === 'splash' ? ['#e8f8ff', '#bfe9ff', '#ffffff'] : kind === 'sparkle' ? ['#fff3a0', '#ffd23f', '#ffffff'] : ['#e9d29a', '#d9be86'];
    for (let i = 0; i < n && this.bursts.length < 900; i++) {
      const a = Math.random() * Math.PI * 2, s = kind === 'confetti' ? 4 + Math.random() * 6 : 2 + Math.random() * 3;
      this.bursts.push({
        p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(Math.cos(a) * s * 0.45, (kind === 'confetti' ? 7 : 4) + Math.random() * 4, Math.sin(a) * s * 0.45),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), life: 0, max: kind === 'confetti' ? 3.5 : 1.0 + Math.random() * 0.4, c: new THREE.Color(cols[i % cols.length]).multiplyScalar(kind === 'sparkle' ? 3 : 1.3), kind,
      });
    }
  }

  buildClouds() {
    this.clouds = [];
    const rng = mulberry32(31);
    const mat = this.cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x666666, transparent: true, opacity: 0.95 });
    for (let i = 0; i < 14; i++) {
      const geo = mergeGeometries([...Array(5)].map((_, k) => { const s = new THREE.IcosahedronGeometry(3 + rng() * 3, 0); s.translate((k - 2) * 3.6 + rng() * 2, rng() * 1.5, rng() * 3); s.scale(1, 0.62, 1); return s; }));
      const c = new THREE.Mesh(geo, mat);
      const a = rng() * Math.PI * 2, r = 70 + rng() * 140;
      c.position.set(Math.cos(a) * r, 48 + rng() * 22, Math.sin(a) * r);
      c.userData = { a, r, s: 0.004 + rng() * 0.006 };
      this.scene.add(c); this.clouds.push(c);
    }
  }

  buildComposer() {
    const r = this.renderer;
    const size = r.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.86);
    this.grade = new ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }
  resize(w, h) { this.composer.setSize(w, h); this.bloom.setSize(w, h); }
  setQuality(q) {
    this.quality = q;
    const hi = q === 'high';
    this.renderer.shadowMap.enabled = hi;
    this.sun.castShadow = hi;
    this.bloom.enabled = hi;
    this.grass.visible = hi;
    this.renderer.setPixelRatio(hi ? Math.min(devicePixelRatio, 1.75) : 1);
    this.scene.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => m.needsUpdate = true); } });
  }

  // ── 매 프레임 ──
  update(dt, clock, st) {
    this.time += dt;
    const t = this.time;
    this.wind.value = t;
    // 폭풍 전환
    this.storm += (this.stormTarget - this.storm) * Math.min(1, dt * 0.8);
    const S = this.storm;
    const k = sampleKeys(clock);
    const night = k.night;
    // 해/달 방향
    const dayF = THREE.MathUtils.clamp(clock / 0.78, 0, 1);
    const az = dayF * Math.PI;
    const el = Math.sin(dayF * Math.PI) * 1.15 + 0.03;
    const sunDir = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), -0.45 * Math.cos(el)).normalize();
    const moonDir = new THREE.Vector3(-0.35, 0.78, -0.52).normalize();
    const isNight = clock > 0.78;
    const lightDir = isNight ? moonDir : sunDir;
    const center = st.focus || new THREE.Vector3();
    this.sun.position.copy(center).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(center);
    this.sun.color.copy(k.sun);
    this.sun.intensity = k.sunI * (1 - S * 0.75) * (isNight ? 0.35 : 1);
    this.hemi.color.copy(k.hs); this.hemi.groundColor.copy(k.hg); this.hemi.intensity = k.hI * (1 - S * 0.3);
    const grey = new THREE.Color('#5d6670');
    const fogC = k.fog.clone().lerp(grey.clone().multiplyScalar(1 - night * 0.7), S * 0.75);
    this.scene.fog.color.copy(fogC);
    this.scene.fog.density = 0.0058 + S * 0.012;
    // 하늘
    const su = this.sky.material.uniforms;
    su.uTop.value.copy(k.top).lerp(grey.clone().multiplyScalar(0.7 - night * 0.5), S * 0.8);
    su.uHor.value.copy(k.hor).lerp(fogC, S * 0.8);
    su.uSunDir.value.copy(sunDir); su.uSunColor.value.copy(k.sun);
    su.uNight.value = night; su.uTime.value = t; su.uStorm.value = S;
    this.sky.position.copy(this.camera.position);
    // 바다
    const w = this.waterU;
    w.uTime.value = t; w.uNight.value = night; w.uStorm.value = S;
    w.uSunDir.value.copy(lightDir); w.uSunColor.value.copy(k.sun).multiplyScalar((isNight ? 0.4 : 1) * (1 - S * 0.8));
    w.uSkyColor.value.copy(su.uHor.value).lerp(su.uTop.value, 0.35);
    w.uFogColor.value.copy(fogC); w.uFogDensity.value = this.scene.fog.density;
    w.uDeep.value.set('#0a5a8c').lerp(new THREE.Color('#031026'), night * 0.85).lerp(new THREE.Color('#2a3a44'), S * 0.6);
    w.uShallow.value.set('#36d3c4').lerp(new THREE.Color('#0d2a40'), night * 0.85).lerp(new THREE.Color('#4a6a70'), S * 0.6);
    // 불
    const fireOn = st.campFire ? 1 : 0.0;
    const flick = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.07;
    this.fireU.uTime.value = t;
    this.fireU.uOn.value.set(fireOn, st.councilFire ? 1 : 0, Math.max(night, st.councilFire ? 1 : 0) > 0.3 ? 1 : 0, 0);
    this.fireLight.intensity = fireOn * (6 + night * 34) * flick;
    this.councilLight.intensity = (st.councilFire ? 1 : 0) * (8 + night * 40) * flick;
    // 반딧불
    this.flyU.uTime.value = t; this.flyU.uNight.value = night * (1 - S);
    // 비
    this.rain.visible = S > 0.05;
    this.rainU.uTime.value = t; this.rainU.uAlpha.value = S; this.rainU.uCenter.value.copy(this.camera.position);
    // 번개
    if (S > 0.6 && Math.random() < dt * 0.25) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 3.5);
    const fl = this.flash > 0.5 ? this.flash : this.flash * 0.3;
    this.grade.uniforms.uFlash.value = fl * 0.35;
    this.hemi.intensity += fl * 2;
    // 색보정
    this.grade.uniforms.uTint.value.set(1 + (1 - night) * 0.02, 1, 1 + night * 0.05);
    this.grade.uniforms.uSat.value = 1.12 - S * 0.35;
    this.bloom.strength = 0.42 + night * 0.45;
    // 구름
    for (const c of this.clouds) { c.userData.a += c.userData.s * dt; c.position.x = Math.cos(c.userData.a) * c.userData.r; c.position.z = Math.sin(c.userData.a) * c.userData.r; }
    this.cloudMat.color.setRGB(1, 1, 1).lerp(new THREE.Color('#566070'), S).multiplyScalar(1 - night * 0.75);
    this.cloudMat.emissive.copy(k.hor).multiplyScalar(0.35 * (1 - night * 0.8));
    // 은신처 단계 연출
    for (const grp of this.shelterStages) {
      const u = grp.userData; const target = u.on ? 1 : 0;
      u.s += (target - u.s) * Math.min(1, dt * 3);
      grp.visible = u.s > 0.01;
      const e = u.s < 1 ? 1 - Math.pow(1 - u.s, 3) : 1;
      grp.scale.set(1, Math.max(0.001, e), 1);
    }
    // 보트
    if (this.boatAnim) {
      const b = this.boatAnim; b.t += dt;
      const f = Math.min(1, b.t / b.dur);
      const ease = f * f * (3 - 2 * f);
      if (f < 0.85) this.boat.position.copy(b.from).addScaledVector(b.dir, ease * 70);
      this.boat.position.y = 0.05 + Math.sin(t * 2) * 0.08;
      this.boat.visible = f < 0.85;
      if (f >= 1) { this.boatAnim = null; this.boat.position.copy(this.boatHome); this.boat.visible = true; b.onDone && b.onDone(); }
    } else { this.boat.position.y = 0.05 + Math.sin(t * 1.6) * 0.07; this.boat.rotation.z = Math.sin(t * 1.3) * 0.03; }
    // 버스트
    const dm = new THREE.Object3D();
    let n = 0;
    this.bursts = this.bursts.filter(p => (p.life += dt) < p.max);
    for (const p of this.bursts) {
      p.v.y -= (p.kind === 'confetti' ? 5 : 14) * dt;
      if (p.kind === 'confetti') { p.v.multiplyScalar(1 - dt * 1.2); p.r.x += dt * 6; p.r.y += dt * 4; }
      p.p.addScaledVector(p.v, dt);
      dm.position.copy(p.p); dm.rotation.copy(p.r); dm.scale.setScalar((1 - p.life / p.max) * (p.kind === 'confetti' ? 1.6 : 1));
      if (p.kind !== 'confetti') dm.lookAt(this.camera.position);
      dm.updateMatrix(); this.burstMesh.setMatrixAt(n, dm.matrix); this.burstMesh.setColorAt(n, p.c); n++;
    }
    this.burstMesh.count = n;
    this.burstMesh.instanceMatrix.needsUpdate = true;
    if (this.burstMesh.instanceColor) this.burstMesh.instanceColor.needsUpdate = true;
    return { night, storm: S };
  }

  render() { this.composer.render(); }
}
