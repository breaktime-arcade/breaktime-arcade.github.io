/*!
 * 마지막 생존자 — 캐릭터 모델·애니메이션
 * © 쉬는시간 오락실. All rights reserved.
 */
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.72, ...o });
const lerpA = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

export class ActorView {
  constructor(agent, scene) {
    this.agent = agent; this.def = agent.def;
    const L = this.def.look;
    const root = this.root = new THREE.Group();
    root.userData.agentId = agent.id;
    const skin = mat(L.skin), shirt = mat(L.shirt), pants = mat(L.pants), hairM = mat(L.hair, { roughness: 0.6 });
    const shoe = mat('#2a2522'), dark = mat('#1a1a1a', { roughness: 0.3 });

    const body = this.body = new THREE.Group(); root.add(body);
    // 다리
    const mkLeg = (side) => {
      const g = new THREE.Group(); g.position.set(side * 0.15, 0.72, 0);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), pants); leg.position.y = -0.33; g.add(leg);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), shoe); foot.position.set(0, -0.66, 0.05); g.add(foot);
      body.add(g); return g;
    };
    this.legL = mkLeg(-1); this.legR = mkLeg(1);
    // 상체
    const torso = this.torso = new THREE.Group(); torso.position.y = 0.72; body.add(torso);
    const hip = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.24, 12), pants); hip.position.y = 0.05; torso.add(hip);
    const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.32, 4, 12), shirt); chest.position.y = 0.4; chest.scale.set(1, 1, 0.82); torso.add(chest);
    // 팔
    const mkArm = (side) => {
      const g = new THREE.Group(); g.position.set(side * 0.36, 0.66, 0);
      const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.36, 4, 8), shirt); up.position.y = -0.22; g.add(up);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), skin); hand.position.y = -0.48; g.add(hand);
      torso.add(g); return g;
    };
    this.armL = mkArm(-1); this.armR = mkArm(1);
    // 머리
    const head = this.head = new THREE.Group(); head.position.y = 1.02; torso.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), skin); skull.position.y = 0.26; head.add(skull);
    const eyeG = new THREE.SphereGeometry(0.045, 8, 6);
    [-1, 1].forEach(s => { const e = new THREE.Mesh(eyeG, dark); e.position.set(s * 0.12, 0.28, 0.32); e.scale.set(1, 1.3, 0.6); head.add(e); });
    const blush = mat('#ff9a9a', { transparent: true, opacity: 0.55 });
    [-1, 1].forEach(s => { const b = new THREE.Mesh(new THREE.CircleGeometry(0.05, 10), blush); b.position.set(s * 0.2, 0.18, 0.325); b.rotation.y = s * 0.45; head.add(b); });
    const mouth = this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10, Math.PI), dark); mouth.position.set(0, 0.15, 0.345); mouth.rotation.z = Math.PI; head.add(mouth);
    this.buildHair(head, L, hairM);
    this.buildAcc(head, torso, L);
    // 소품
    this.props = {};
    const wood = mat('#7a5434');
    const rod = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 2.4, 5), wood); stick.position.y = 1.0; rod.add(stick);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 2.2, 3), mat('#ffffff', { emissive: 0x666666 })); line.position.set(0, 1.1, 0.0); line.rotation.x = 0; rod.add(line);
    this.rodLine = line;
    rod.position.set(0, -0.48, 0); rod.rotation.x = -0.9;
    this.armR.add(rod); this.props.rod = rod;
    const axe = new THREE.Group(); const hnd = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), wood); hnd.position.y = 0.3; axe.add(hnd);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.3), mat('#b8c0c8', { metalness: 0.6, roughness: 0.3 })); blade.position.set(0, 0.62, 0.13); axe.add(blade);
    axe.position.set(0, -0.48, 0); axe.rotation.x = -1.2; this.armR.add(axe); this.props.axe = axe;
    const ham = new THREE.Group(); const hh = hnd.clone(); ham.add(hh); const hd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.3), mat('#555')); hd.position.y = 0.65; ham.add(hd);
    ham.position.set(0, -0.48, 0); ham.rotation.x = -1.2; this.armR.add(ham); this.props.hammer = ham;
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 10), mat('#8a6a48')); bucket.position.set(0, -0.62, 0.05); this.armR.add(bucket); this.props.bucket = bucket;
    for (const k in this.props) this.props[k].visible = false;
    // 면책 목걸이
    const neck = this.necklace = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 6, 18), mat('#ffd23f', { metalness: 0.7, roughness: 0.25, emissive: 0x8a6000, emissiveIntensity: 0.6 }));
    neck.rotation.x = Math.PI / 2 + 0.25; neck.position.set(0, 0.82, 0.04); torso.add(neck);
    const pend = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), neck.material); pend.position.set(0, 0.68, 0.24); torso.add(pend); this.pendant = pend;
    neck.visible = pend.visible = false;
    // 바닥 링 (응원/선택)
    const ring = (c, r, o) => { const m = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.12, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.05; root.add(m); m.visible = false; return m; };
    this.favRing = ring(0xffd23f, 0.62, 0.95);
    this.selRing = ring(0xffffff, 0.82, 0.8);

    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.agentId = agent.id; } });
    this.favRing.castShadow = this.selRing.castShadow = false;
    root.scale.setScalar(1.12);
    scene.add(root);

    // 라벨(CSS2D)
    const el = document.createElement('div'); el.className = 'actor-label';
    el.innerHTML = `<div class="bubble"></div><div class="emote"></div><div class="tag" style="--c:${L.shirt}">${this.def.name}</div>`;
    this.bubbleEl = el.querySelector('.bubble'); this.emoteEl = el.querySelector('.emote'); this.tagEl = el.querySelector('.tag');
    this.label = new CSS2DObject(el); this.label.position.set(0, 2.8, 0);
    root.add(this.label);
    this.bubbleT = 0; this.emoteT = 0;
    this.phase = Math.random() * 10; this.blinkT = 2 + Math.random() * 3;
    this.lyingBlend = 0; this.pos = new THREE.Vector3(agent.x, 0, agent.z); this.yaw = 0; this.first = true;
    this.onBoat = false;
  }

  buildHair(head, L, hm) {
    const st = L.hairStyle;
    const cap = (r = 0.385, phi = Math.PI * 0.55) => { const g = new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, phi); const m = new THREE.Mesh(g, hm); m.position.y = 0.27; m.rotation.x = -0.25; head.add(m); return m; };
    if (st === 'buzz') { const c = cap(0.372, Math.PI * 0.45); c.rotation.x = -0.15; }
    else if (st === 'short' || st === 'slick') { cap(); if (st === 'slick') { const q = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), hm); q.position.set(0.1, 0.58, 0.18); q.scale.set(1.4, 0.6, 1); head.add(q); } }
    else if (st === 'long') { cap(0.395, Math.PI * 0.6); const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 0.28), hm); b.position.set(0, 0.0, -0.2); head.add(b); }
    else if (st === 'pony') { cap(); const p = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.4, 4, 8), hm); p.position.set(0, 0.25, -0.45); p.rotation.x = 0.5; head.add(p); this.pony = p; }
    else if (st === 'bun') { cap(); const b = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), hm); b.position.set(0, 0.68, -0.12); head.add(b); }
    else if (st === 'braid') { cap(); for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.09 - i * 0.012, 8, 6), hm); s.position.set(0, 0.12 - i * 0.14, -0.38 - i * 0.03); head.add(s); } }
    else if (st === 'curly') { for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), hm); s.position.set(Math.cos(a) * 0.27, 0.52 + Math.sin(i * 1.7) * 0.06, Math.sin(a) * 0.27 - 0.05); head.add(s); } const t = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), hm); t.position.set(0, 0.62, -0.03); head.add(t); }
    else if (st === 'bob') { const c = cap(0.4, Math.PI * 0.62); c.rotation.x = -0.1; const f = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.12), hm); f.position.set(0, 0.47, 0.3); head.add(f); }
  }
  buildAcc(head, torso, L) {
    const a = L.acc, c = L.accColor;
    if (a === 'glasses') { const m = mat(c, { roughness: 0.3 }); [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.014, 5, 14), m); r.position.set(s * 0.12, 0.29, 0.35); head.add(r); }); const br = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.015), m); br.position.set(0, 0.3, 0.36); head.add(br); }
    else if (a === 'band' || a === 'bandana') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.05, 6, 20), mat(c)); b.rotation.x = Math.PI / 2 - 0.15; b.position.y = 0.42; head.add(b); if (a === 'bandana') { const k = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.25, 4), mat(c)); k.position.set(0, 0.38, -0.4); k.rotation.x = 2; head.add(k); } }
    else if (a === 'chef') { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.28, 0.3, 14), mat('#fff')); h.position.y = 0.66; head.add(h); const t = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), mat('#fff')); t.position.y = 0.86; t.scale.y = 0.7; head.add(t); }
    else if (a === 'beard') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), mat(c)); b.position.set(0, 0.24, 0.06); b.scale.set(1, 1, 1.05); head.add(b); }
    else if (a === 'headset') { const m = mat(c, { roughness: 0.4 }); const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 6, 20, Math.PI), m); band.position.y = 0.28; head.add(band); [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12), mat('#7b5cff', { emissive: 0x3a20aa, emissiveIntensity: 0.8 })); e.rotation.z = Math.PI / 2; e.position.set(s * 0.39, 0.27, 0); head.add(e); }); }
  }

  say(text, dur = 2.6) {
    const el = this.bubbleEl;
    el.className = 'bubble show' + (text.startsWith('(속닥)') ? ' whisper' : text.startsWith('(') ? ' thought' : '');
    el.textContent = text.replace(/^\(속닥\)\s*/, '🤫 ').replace(/^\(속마음\)\s*/, '💭 ');
    this.bubbleT = dur;
  }
  emote(e) { this.emoteEl.textContent = e; this.emoteEl.classList.remove('pop'); void this.emoteEl.offsetWidth; this.emoteEl.classList.add('pop'); this.emoteT = 1.6; }

  update(dt, map, opts) {
    const a = this.agent;
    const visible = a.alive || (a.task && (a.task.type === 'jury')) || this.onBoat;
    this.root.visible = visible;
    this.label.visible = visible;
    if (!visible) { this.bubbleEl.className = 'bubble'; return; }
    // 위치
    let tx = a.x, tz = a.z, ty;
    if (this.onBoat && opts.boat) {
      const v = opts.boatSeat.clone(); opts.boat.localToWorld(v);
      tx = v.x; tz = v.z; ty = v.y;
    } else {
      const g = map.h(tx, tz);
      ty = a.y != null ? a.y : Math.max(g, -0.55);
    }
    const snap = this.first || Math.hypot(tx - this.pos.x, tz - this.pos.z) > 6;
    const k = snap ? 1 : 1 - Math.exp(-dt * 14);
    this.pos.x += (tx - this.pos.x) * k; this.pos.z += (tz - this.pos.z) * k; this.pos.y += (ty - this.pos.y) * (snap ? 1 : 1 - Math.exp(-dt * 10));
    this.first = false;
    this.root.position.copy(this.pos);
    const faceT = this.onBoat && opts.boat ? opts.boat.rotation.y + Math.PI / 2 : a.face;
    this.yaw = lerpA(this.yaw, faceT, 1 - Math.exp(-dt * 9));
    this.root.rotation.y = this.yaw;

    // 상태별 포즈
    const anim = this.onBoat ? 'sad' : a.anim;
    const spd = a.speed || 0;
    this.phase += dt * (anim === 'run' ? 11 : anim === 'walk' ? 7.5 : 3);
    const p = this.phase, s = Math.sin(p), c = Math.cos(p);
    const T = { legL: 0, legR: 0, armLx: 0, armRx: 0, armLz: 0.12, armRz: -0.12, torsoX: 0, torsoY: 0, headX: 0, headY: 0, bodyY: 0, lie: 0, legSpread: 0, sit: 0, rootTilt: 0 };
    const t = performance.now() / 1000;
    switch (anim) {
      case 'walk': T.legL = s * 0.55; T.legR = -s * 0.55; T.armLx = -s * 0.45; T.armRx = s * 0.45; T.bodyY = Math.abs(c) * 0.06; break;
      case 'run': T.legL = s * 0.95; T.legR = -s * 0.95; T.armLx = -s * 0.9; T.armRx = s * 0.9; T.torsoX = 0.25; T.bodyY = Math.abs(c) * 0.12; break;
      case 'talk': T.headX = Math.sin(t * 5) * 0.08; T.armRx = -0.4 + Math.sin(t * 4) * 0.35; T.armRz = -0.3; T.headY = Math.sin(t * 1.3) * 0.15; break;
      case 'fish': T.armRx = -1.0; T.armLx = -0.9; T.armLz = 0.35; T.torsoX = 0.05 + Math.sin(t * 1.5) * 0.03; T.headX = 0.15; break;
      case 'chop': { const sw = Math.pow((Math.sin(t * 6) + 1) / 2, 2); T.armRx = -2.6 + sw * 2.4; T.armLx = -2.4 + sw * 2.2; T.torsoX = sw * 0.3; T.legL = 0.15; T.legR = -0.15; break; }
      case 'build': { const sw = Math.abs(Math.sin(t * 9)); T.armRx = -1.5 + sw * 0.9; T.armLx = -0.9; T.torsoX = 0.3; T.sit = 0.25; break; }
      case 'gather': { T.torsoX = 0.75 + Math.sin(t * 3) * 0.1; T.armLx = -1.1 + Math.sin(t * 4) * 0.4; T.armRx = -1.1 - Math.sin(t * 4) * 0.4; T.headX = 0.2; break; }
      case 'search': T.torsoX = 0.45; T.headY = Math.sin(t * 2.2) * 0.7; T.sit = 0.3; T.armLx = -0.6; T.armRx = -0.6; break;
      case 'rest': T.sit = 1; T.legL = -1.45; T.legR = -1.45; T.armLx = 0.5; T.armRx = 0.5; T.armLz = 0.4; T.armRz = -0.4; T.torsoX = -0.25; T.headX = -0.15 + Math.sin(t * 0.8) * 0.05; break;
      case 'sit': T.sit = 0.85; T.legL = -1.45; T.legR = -1.45; T.armLx = -0.5; T.armRx = -0.5; T.headX = Math.sin(t * 0.7 + this.agent.id) * 0.08; T.headY = Math.sin(t * 0.4 + this.agent.id * 2) * 0.25; break;
      case 'sleep': T.lie = 1; T.armLz = 0.2; T.armRz = -0.2; break;
      case 'cheer': T.armLx = -2.8 + Math.sin(t * 10) * 0.3; T.armRx = -2.8 - Math.sin(t * 10) * 0.3; T.armLz = 0.4; T.armRz = -0.4; T.bodyY = Math.abs(Math.sin(t * 6)) * 0.35; T.headX = -0.2; break;
      case 'fallen': T.lie = -1; T.armLx = -2.6; T.armRx = -2.6; break;
      case 'post': { const wb = (a.wobble || 0); const sw = Math.sin(t * (3 + wb * 6)) * (0.06 + wb * 0.35); T.armLz = 1.45 + sw; T.armRz = -1.45 + sw; T.rootTilt = sw * 0.6; T.legL = 0.05; T.legR = -0.05; break; }
      case 'ready': T.sit = 0.3; T.torsoX = 0.35; T.armLx = 0.4; T.armRx = -0.5; T.legL = 0.4; T.legR = -0.3; break;
      case 'sad': T.headX = 0.45; T.sit = 0.9; T.legL = -1.4; T.legR = -1.4; T.armLx = -0.3; T.armRx = -0.3; break;
      default: T.armLx = Math.sin(t * 1.4 + this.agent.id) * 0.05; T.headY = Math.sin(t * 0.5 + this.agent.id * 3) * 0.3; T.bodyY = Math.sin(t * 2) * 0.01;
    }
    const kk = 1 - Math.exp(-dt * (anim === 'walk' || anim === 'run' ? 22 : 10));
    const L = (o, key, v) => { o[key] += (v - o[key]) * kk; };
    L(this.legL.rotation, 'x', T.legL); L(this.legR.rotation, 'x', T.legR);
    L(this.armL.rotation, 'x', T.armLx); L(this.armR.rotation, 'x', T.armRx);
    L(this.armL.rotation, 'z', T.armLz); L(this.armR.rotation, 'z', T.armRz);
    L(this.torso.rotation, 'x', T.torsoX);
    L(this.head.rotation, 'x', T.headX); L(this.head.rotation, 'y', T.headY);
    this.sitB = (this.sitB || 0) + (T.sit - (this.sitB || 0)) * kk;
    this.lieB = (this.lieB || 0) + (T.lie - (this.lieB || 0)) * kk;
    this.tilt = (this.tilt || 0) + (T.rootTilt - (this.tilt || 0)) * kk;
    this.bodyY = (this.bodyY || 0) + (T.bodyY - (this.bodyY || 0)) * kk;
    this.body.position.y = this.bodyY - this.sitB * 0.42 + Math.abs(this.lieB) * 0.25;
    this.body.rotation.x = this.lieB * -1.5;
    this.body.position.z = this.lieB * 0.0;
    this.body.rotation.z = this.tilt;
    // 깜빡임
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12 ? 0.15 : 1;
    if (this.blinkT < 0) this.blinkT = 2 + Math.random() * 4;
    this.head.children.forEach(ch => { if (ch.geometry && ch.geometry.type === 'SphereGeometry' && ch.geometry.parameters.radius === 0.045) ch.scale.y = 1.3 * (anim === 'sleep' ? 0.15 : blink); });
    if (this.pony) this.pony.rotation.x = 0.5 + Math.sin(t * 4) * (spd > 0 ? 0.25 : 0.05);
    // 소품
    for (const key in this.props) this.props[key].visible = a.prop === key;
    if (a.prop === 'rod') this.rodLine.rotation.z = Math.sin(t * 1.2) * 0.05;
    this.necklace.visible = this.pendant.visible = !!a.immune && a.alive;
    this.favRing.visible = opts.fav === a.id && a.alive;
    this.selRing.visible = opts.sel === a.id;
    if (this.selRing.visible) { const sc = 1 + Math.sin(t * 4) * 0.06; this.selRing.scale.set(sc, sc, sc); }
    // 라벨
    this.label.position.y = (this.def.look.acc === 'chef' ? 3.05 : 2.8) - this.sitB * 0.4 - (anim === 'sleep' ? 1.9 : 0);
    this.tagEl.classList.toggle('fav', opts.fav === a.id);
    this.tagEl.classList.toggle('imm', !!a.immune && a.alive);
    this.tagEl.style.opacity = opts.tagAlpha;
    if (this.bubbleT > 0) { this.bubbleT -= dt; if (this.bubbleT <= 0) this.bubbleEl.className = 'bubble'; }
    if (this.emoteT > 0) { this.emoteT -= dt; if (this.emoteT <= 0) this.emoteEl.classList.remove('pop'); }
  }
}

// UI 초상화 (2D 캔버스)
export function portrait(def, size = 96) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d'); const L = def.look; const s = size / 96;
  g.scale(s, s);
  const grd = g.createLinearGradient(0, 0, 0, 96); grd.addColorStop(0, L.shirt); grd.addColorStop(1, shade(L.shirt, -0.35));
  g.fillStyle = grd; g.beginPath(); g.arc(48, 48, 48, 0, Math.PI * 2); g.fill();
  g.save(); g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.clip();
  g.fillStyle = shade(L.shirt, 0.15); g.beginPath(); g.ellipse(48, 104, 34, 26, 0, 0, Math.PI * 2); g.fill();
  // 머리카락 뒤
  g.fillStyle = L.hair;
  if (L.hairStyle === 'long') g.fillRect(22, 40, 52, 46);
  if (L.hairStyle === 'braid') { g.beginPath(); g.arc(70, 70, 7, 0, 7); g.fill(); }
  g.fillStyle = L.skin; g.beginPath(); g.arc(48, 50, 25, 0, Math.PI * 2); g.fill();
  // 앞머리
  g.fillStyle = L.hair;
  g.beginPath();
  if (L.hairStyle === 'buzz') g.arc(48, 46, 25.5, Math.PI * 1.08, Math.PI * 1.92);
  else if (L.hairStyle === 'curly') { for (let i = 0; i < 9; i++) { const a = Math.PI * (1.02 + i * 0.12); g.moveTo(48 + Math.cos(a) * 24, 46 + Math.sin(a) * 24); g.arc(48 + Math.cos(a) * 24, 46 + Math.sin(a) * 24, 8, 0, 7); } }
  else g.arc(48, 47, 27, Math.PI * 1.0, Math.PI * 2.0);
  g.fill();
  if (L.hairStyle === 'bun') { g.beginPath(); g.arc(48, 20, 9, 0, 7); g.fill(); }
  if (L.hairStyle === 'pony') { g.beginPath(); g.ellipse(74, 50, 6, 13, -0.3, 0, 7); g.fill(); }
  if (L.hairStyle === 'bob') g.fillRect(22, 44, 8, 18), g.fillRect(66, 44, 8, 18);
  if (L.acc === 'chef') { g.fillStyle = '#fff'; g.fillRect(30, 12, 36, 14); g.beginPath(); g.arc(48, 12, 16, 0, 7); g.fill(); }
  if (L.acc === 'band' || L.acc === 'bandana') { g.fillStyle = L.accColor; g.fillRect(23, 33, 50, 6); }
  if (L.acc === 'headset') { g.strokeStyle = '#2b2b2b'; g.lineWidth = 4; g.beginPath(); g.arc(48, 48, 28, Math.PI, 0); g.stroke(); g.fillStyle = '#7b5cff'; g.fillRect(17, 46, 8, 12); g.fillRect(71, 46, 8, 12); }
  if (L.acc === 'beard') { g.fillStyle = L.accColor; g.beginPath(); g.arc(48, 60, 16, 0.1, Math.PI - 0.1); g.fill(); }
  // 얼굴
  g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(39, 52, 2.6, 3.4, 0, 0, 7); g.ellipse(57, 52, 2.6, 3.4, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,120,120,0.45)'; g.beginPath(); g.arc(33, 60, 4, 0, 7); g.arc(63, 60, 4, 0, 7); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 1.8; g.beginPath(); g.arc(48, 59, 5, 0.2, Math.PI - 0.2); g.stroke();
  if (L.acc === 'glasses') { g.strokeStyle = '#222'; g.lineWidth = 2; g.beginPath(); g.arc(39, 52, 6, 0, 7); g.moveTo(63, 52); g.arc(57, 52, 6, 0, 7); g.moveTo(45, 52); g.lineTo(51, 52); g.stroke(); }
  g.restore();
  return cv.toDataURL();
}
function shade(hex, amt) {
  const c = new THREE.Color(hex); const hsl = {}; c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return '#' + c.getHexString();
}
