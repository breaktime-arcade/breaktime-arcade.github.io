// 파도풀 안전요원 - 3D 월드 (파도풀, 환경, 조명, 파티클)
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { POOL, W, floorY, waveH, waveGLSL, rand } from './env.js';

const TOD = {
  morning:   { elev: 22, az: 115, sun: '#fff0d8', sunI: 2.8, hemi: 0.75, exp: 0.55, top: '#3f86c9', hor: '#c4def0', fog: '#c9dcea', fogD: 0.0042, sh: '#58dcdc', dp: '#0b6ea6', turb: 3, ray: 1.3, lamps: 0, night: 0 },
  noon:      { elev: 66, az: 165, sun: '#ffffff', sunI: 3.3, hemi: 0.85, exp: 0.5, top: '#2b74c6', hor: '#acd4f0', fog: '#bdd8ee', fogD: 0.004, sh: '#5ae6e2', dp: '#0a72ad', turb: 2.4, ray: 1.0, lamps: 0, night: 0 },
  afternoon: { elev: 36, az: 232, sun: '#fff1dc', sunI: 3.0, hemi: 0.75, exp: 0.52, top: '#3279c4', hor: '#c7dceb', fog: '#cad9e4', fogD: 0.0045, sh: '#55d8d8', dp: '#0a679e', turb: 3.5, ray: 1.4, lamps: 0, night: 0 },
  evening:   { elev: 5, az: 252, sun: '#ffa463', sunI: 2.3, hemi: 0.5, exp: 0.62, top: '#4b5c90', hor: '#f3a771', fog: '#d39c80', fogD: 0.0055, sh: '#3fb0bd', dp: '#0a4c78', turb: 8, ray: 3, lamps: 0.6, night: 0.25 },
  night:     { elev: -14, az: 250, sun: '#9db8ff', sunI: 0.45, hemi: 0.22, exp: 0.9, top: '#040814', hor: '#16233f', fog: '#0c1322', fogD: 0.007, sh: '#1b93b8', dp: '#05213d', turb: 1, ray: 0.3, lamps: 1, night: 1 },
};

function tileTex(base, grout, n = 8, varAmt = 10, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / n;
  const b = new THREE.Color(base);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = (Math.random() - 0.5) * varAmt / 255;
    g.fillStyle = `rgb(${((b.r + v) * 255) | 0},${((b.g + v) * 255) | 0},${((b.b + v) * 255) | 0})`;
    g.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = grout; g.lineWidth = Math.max(2, size / 220);
  for (let i = 0; i <= n; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, size); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(size, i * s); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const CAUSTIC = `
#define TAU 6.28318530718
float caustic(vec2 uv, float time){
  vec2 p = mod(uv*TAU, TAU)-250.0; vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 4; n++) {
    float t = time * (1.0 - (3.5 / float(n+1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0/length(vec2(p.x / (sin(i.x+t)/inten),p.y / (cos(i.y+t)/inten)));
  }
  c /= 4.0; c = 1.17-pow(c, 1.4); return pow(abs(c), 8.0);
}`;

export class World {
  constructor(renderer, scene, quality) {
    this.r = renderer; this.scene = scene; this.q = quality;
    this.U = { uTime: { value: 0 }, uCaus: { value: 1 } };
    this.loungers = []; this.chairs = []; this.lamps = []; this.lampLights = [];
    this.aid = { x: -27, z: 13 };
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this._lights(); this._sky(); this._pool(); this._water(); this._deck(); this._building();
    this._rope(); this._props(); this._background(); this._particles(); this._rain(); this._stars();
    this.setTimeOfDay('morning');
  }

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x8a7a60, 0.8); this.scene.add(this.hemi);
    const s = this.sun = new THREE.DirectionalLight(0xffffff, 3);
    s.castShadow = true;
    const sz = this.q.high ? 2048 : 1024;
    s.shadow.mapSize.set(sz, sz);
    const c = s.shadow.camera; c.left = -42; c.right = 42; c.top = 42; c.bottom = -42; c.near = 1; c.far = 200;
    s.shadow.bias = -0.0004; s.shadow.normalBias = 0.03;
    s.target.position.set(0, 0, -14);
    this.scene.add(s, s.target);
  }

  _sky() {
    this.sky = new Sky(); this.sky.scale.setScalar(4500); this.scene.add(this.sky);
    this.envScene = new THREE.Scene(); this.envSky = new Sky(); this.envSky.scale.setScalar(1000); this.envScene.add(this.envSky);
    this.sunDir = new THREE.Vector3();
  }

  setTimeOfDay(name) {
    const p = TOD[name]; this.tod = name; this.todP = p;
    const phi = THREE.MathUtils.degToRad(90 - p.elev), th = THREE.MathUtils.degToRad(p.az);
    this.sunDir.setFromSphericalCoords(1, phi, th);
    for (const sk of [this.sky, this.envSky]) {
      const u = sk.material.uniforms;
      u.turbidity.value = p.turb; u.rayleigh.value = p.ray; u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
      u.sunPosition.value.copy(this.sunDir);
    }
    // 밤에는 달빛 방향
    const ld = p.night >= 1 ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), th) : this.sunDir;
    this.sun.position.copy(ld).multiplyScalar(90).add(new THREE.Vector3(0, 0, -14));
    this.sun.color.set(p.sun); this.sun.intensity = p.sunI;
    this.hemi.intensity = p.hemi;
    this.hemi.color.set(p.night >= 1 ? '#5a6f9a' : '#cfe6ff');
    this.r.toneMappingExposure = p.exp;
    this.scene.fog = new THREE.FogExp2(p.fog, p.fogD);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.night >= 1 ? 0.25 : 1;
    const wu = this.waterMat.uniforms;
    wu.uSkyTop.value.set(p.top); wu.uSkyHor.value.set(p.hor); wu.uShallow.value.set(p.sh); wu.uDeep.value.set(p.dp);
    wu.uSunDir.value.copy(ld); wu.uSunCol.value.set(p.sun).multiplyScalar(p.night >= 1 ? 0.6 : 1.4);
    wu.uFogCol.value.set(p.fog); wu.uFogD.value = p.fogD; wu.uNight.value = p.night;
    this.U.uCaus.value = p.night >= 1 ? 0.15 : p.night > 0 ? 0.5 : 1.0;
    for (const m of this.lamps) m.material.emissiveIntensity = p.lamps * 6;
    for (const l of this.lampLights) l.intensity = p.lamps * 60;
    if (this.stars) this.stars.visible = p.night >= 1;
  }

  _causticMat(opts) {
    const m = new THREE.MeshStandardMaterial(opts);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.U.uTime; sh.uniforms.uCaus = this.U.uCaus;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP=(modelMatrix*vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;uniform float uTime;uniform float uCaus;\n' + CAUSTIC)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float uw = smoothstep(0.05,-0.2,vWP.y);
          diffuseColor.rgb *= mix(vec3(1.05,0.93,0.78), vec3(1.0), uw);
          diffuseColor.rgb *= mix(vec3(1.0), vec3(0.62,0.86,0.98), uw*clamp(-vWP.y*0.6+0.4,0.0,1.0));
          totalEmissiveRadiance += diffuseColor.rgb * caustic(vWP.xz*0.17, uTime*0.55) * 0.55 * uCaus * uw;`);
    };
    return m;
  }

  _pool() {
    const tex = tileTex('#bfe8f2', '#8fc4d4', 8, 14); tex.repeat.set(10, 12);
    const mat = this.poolMat = this._causticMat({ map: tex, roughness: 0.35, metalness: 0 });
    // 바닥 (z방향 경사)
    const g = new THREE.PlaneGeometry(40, 48, 1, 96); g.rotateX(-Math.PI / 2); g.translate(0, 0, -16);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, floorY(pos.getZ(i)));
    g.computeVertexNormals();
    const floor = new THREE.Mesh(g, mat); floor.receiveShadow = true; this.scene.add(floor);
    // 깊이 표시 줄무늬 (안전선 아래)
    const lane = new THREE.Mesh(new THREE.PlaneGeometry(40, 0.35), new THREE.MeshStandardMaterial({ color: '#16507a', roughness: 0.5 }));
    lane.rotation.x = -Math.PI / 2; lane.position.set(0, floorY(POOL.rope) + 0.01, POOL.rope); lane.receiveShadow = true; this.scene.add(lane);
    // 측벽
    const wall = (side) => {
      const N = 96, v = [], idx = [], uv = [];
      for (let i = 0; i <= N; i++) {
        const z = 8 - (48 * i) / N; const y0 = floorY(z);
        v.push(side * 20, y0, z, side * 20, POOL.deck, z);
        uv.push(i / N * 12, 0, i / N * 12, (POOL.deck - y0) / 4);
      }
      for (let i = 0; i < N; i++) { const a = i * 2; side > 0 ? idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3) : idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; this.scene.add(m);
    };
    wall(1); wall(-1);
    // 가장자리 마감석
    const cop = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 48), cop); b.position.set(s * 20.2, POOL.deck + 0.03, -16); b.receiveShadow = true; b.castShadow = true; this.scene.add(b);
    }
  }

  _water() {
    const segX = this.q.high ? 160 : 90, segZ = this.q.high ? 200 : 110;
    const g = new THREE.PlaneGeometry(40, 48, segX, segZ); g.rotateX(-Math.PI / 2); g.translate(0, 0, -16);
    const mat = this.waterMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: W.uTimeU || { value: 0 }, uStrength: { value: 1 }, uRain: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() },
        uSkyTop: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() },
        uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.004 }, uNight: { value: 0 },
      },
      vertexShader: `
        uniform float uTime; uniform float uStrength;
        varying vec3 vW; varying vec3 vN; varying float vH;
        float floorY(float z){ return clamp(0.35-(8.0-z)*0.06,-2.4,0.35); }
        void main(){
          vec3 p = (modelMatrix*vec4(position,1.0)).xyz;
          float d = -floorY(p.z);
          float f = smoothstep(0.0,1.4,d)*uStrength;
          float h=0.0, gx=0.0, gz=0.0;
          ${waveGLSL()}
          h*=f; gx*=f; gz*=f;
          p.y += h; vH = h; vW = p;
          vN = normalize(vec3(-gx,1.0,-gz));
          gl_Position = projectionMatrix*viewMatrix*vec4(p,1.0);
        }`,
      fragmentShader: `
        uniform float uTime; uniform float uRain; uniform float uNight;
        uniform vec3 uSunDir, uSunCol, uSkyTop, uSkyHor, uShallow, uDeep, uFogCol; uniform float uFogD;
        varying vec3 vW; varying vec3 vN; varying float vH;
        float floorY(float z){ return clamp(0.35-(8.0-z)*0.06,-2.4,0.35); }
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y); }
        void main(){
          vec3 V = normalize(cameraPosition - vW);
          vec2 q = vW.xz;
          vec3 n = vN;
          n.x += (noise(q*2.3+vec2(uTime*0.9,uTime*0.4))-0.5)*0.22 + sin(q.x*5.1+uTime*2.3)*cos(q.y*4.3-uTime*1.7)*0.04;
          n.z += (noise(q*2.1-vec2(uTime*0.5,uTime*1.1))-0.5)*0.22 + cos(q.x*4.7-uTime*1.9)*sin(q.y*5.3+uTime*2.1)*0.04;
          // 빗방울 물결
          float rr = noise(q*9.0+uTime*6.0); n.xz += (rr-0.5)*0.5*uRain;
          vec3 N = normalize(n);
          float depth = vW.y - floorY(vW.z);
          float ndv = max(dot(N,V),0.0);
          float fres = 0.02 + 0.98*pow(1.0-ndv,5.0);
          vec3 R = reflect(-V,N);
          vec3 sky = mix(uSkyHor, uSkyTop, pow(clamp(R.y,0.0,1.0),0.6));
          vec3 body = mix(uShallow, uDeep, smoothstep(0.0,2.6,depth));
          body *= 0.85 + 0.15*max(dot(N,uSunDir),0.0);
          float spec = pow(max(dot(R,uSunDir),0.0), 300.0)*6.0 + pow(max(dot(R,uSunDir),0.0), 40.0)*0.25;
          vec3 col = mix(body, sky, clamp(fres*0.9,0.0,1.0)) + uSunCol*spec*(1.0-uNight*0.5);
          // 거품: 해변 가장자리 + 파도 마루
          float fn = noise(q*3.0 + vec2(0.0,uTime*0.8))*0.6 + noise(q*7.0 - uTime*0.5)*0.4;
          float edge = (1.0 - smoothstep(0.0,0.09,depth)) * smoothstep(0.25,0.65,fn+0.25);
          float crest = smoothstep(0.13,0.32,vH) * smoothstep(0.45,0.8,fn);
          float foam = clamp(edge*0.9 + crest*0.85, 0.0, 1.0);
          col = mix(col, vec3(0.92,0.96,0.97)*(1.0-uNight*0.6), foam);
          float alpha = mix(0.5, 0.95, smoothstep(0.0,1.6,depth));
          alpha = clamp(max(alpha, fres*1.1) + foam*0.6 + spec*0.2, 0.0, 1.0);
          float fd = length(cameraPosition - vW);
          col = mix(col, uFogCol, 1.0 - exp(-uFogD*uFogD*fd*fd));
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    mat.uniforms.uTime = this.U.uTime;
    const m = this.water = new THREE.Mesh(g, mat); m.renderOrder = 5; m.frustumCulled = false; this.scene.add(m);
  }

  _deck() {
    const mk = (w, d, x, z) => {
      const t = tileTex('#e9dfca', '#c9bca2', 6, 16); t.repeat.set(w / 3, d / 3);
      const top = new THREE.MeshStandardMaterial({ map: t, roughness: 0.82 });
      const side = new THREE.MeshStandardMaterial({ color: '#d8ceb8', roughness: 0.9 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), [side, side, top, side, side, side]);
      b.position.set(x, POOL.deck - 1.5, z); b.receiveShadow = true; this.scene.add(b);
    };
    mk(18, 72, -29.0, -14); mk(18, 72, 29.0, -14); mk(40, 14, 0, 15);
    // 바깥 잔디
    const shape = new THREE.Shape(); shape.moveTo(-600, -600); shape.lineTo(600, -600); shape.lineTo(600, 600); shape.lineTo(-600, 600); shape.lineTo(-600, -600);
    const hole = new THREE.Path(); hole.moveTo(-37.9, -21.9); hole.lineTo(37.9, -21.9); hole.lineTo(37.9, 49.9); hole.lineTo(-37.9, 49.9); hole.lineTo(-37.9, -21.9);
    shape.holes.push(hole);
    const gg = new THREE.ShapeGeometry(shape); gg.rotateX(-Math.PI / 2); // shape y → -z
    const grass = new THREE.Mesh(gg, new THREE.MeshStandardMaterial({ color: '#5f8f3e', roughness: 1 }));
    grass.position.y = 0.2; grass.receiveShadow = true; this.scene.add(grass);
  }

  _building() {
    const c = document.createElement('canvas'); c.width = 2048; c.height = 640;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, '#f7f9fb'); gr.addColorStop(1, '#e3e9ee');
    g.fillStyle = gr; g.fillRect(0, 0, 2048, 640);
    g.fillStyle = '#1569b0'; g.fillRect(0, 520, 2048, 30); g.fillStyle = '#29a3d9'; g.fillRect(0, 560, 2048, 16);
    for (let i = 0; i < 2048; i += 160) { g.fillStyle = 'rgba(30,90,140,0.07)'; g.fillRect(i, 0, 4, 520); }
    g.font = '900 210px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#0d4f8c'; g.fillText('파 도 풀', 1024, 210);
    g.font = '800 64px "Pretendard","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    g.fillStyle = '#d4262a'; g.fillText('안전선 밖 출입 금지 · 물에서는 구명조끼 착용', 1024, 410);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const wallM = new THREE.MeshStandardMaterial({ color: '#e8edf1', roughness: 0.8 });
    const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 });
    const roofM = new THREE.MeshStandardMaterial({ color: '#2a7cc0', roughness: 0.6 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(44, 6.2, 10), [wallM, wallM, roofM, wallM, front, wallM]);
    b.position.set(0, POOL.deck + 3.1 + 0.6, -45.01); b.castShadow = true; b.receiveShadow = true; this.scene.add(b);
    // 파도 기계 벽면 (물에 잠긴 부분)
    const wf = new THREE.Mesh(new THREE.PlaneGeometry(40, 3.6), this.poolMat);
    wf.position.set(0, -0.6, -39.99); wf.receiveShadow = true; this.scene.add(wf);
    // 하부 띠 (건물과 물 사이)
    const band = new THREE.Mesh(new THREE.BoxGeometry(44, 0.6, 1), new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.6 }));
    band.position.set(0, POOL.deck + 0.3, -40.5); this.scene.add(band);
    // 그릴(파도 발생구)
    const gc = document.createElement('canvas'); gc.width = 256; gc.height = 128; const gg = gc.getContext('2d');
    gg.fillStyle = '#0a1a24'; gg.fillRect(0, 0, 256, 128);
    gg.fillStyle = '#9fb4bf'; for (let i = 0; i < 256; i += 18) gg.fillRect(i, 0, 6, 128);
    gg.fillRect(0, 0, 256, 8); gg.fillRect(0, 120, 256, 8);
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    const gm = new THREE.MeshStandardMaterial({ map: gt, roughness: 0.5, metalness: 0.4 });
    for (let i = 0; i < 5; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.8), gm); p.position.set(-16 + i * 8, -0.35, -39.97); this.scene.add(p);
    }
  }

  _rope() {
    const N = 81; this.ropeN = N;
    const m = this.buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 12, 8).scale(1.35, 0.8, 0.8), new THREE.MeshStandardMaterial({ roughness: 0.35 }), N);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) m.setColorAt(i, c.set(i % 4 < 2 ? '#e8262b' : '#f5f5f5'));
    m.castShadow = true; this.scene.add(m);
    this.ropeGeo = new THREE.BufferGeometry(); this.ropeGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    this.scene.add(new THREE.Line(this.ropeGeo, new THREE.LineBasicMaterial({ color: '#333' })));
    this._d = new THREE.Object3D();
  }

  _props() {
    const S = this.scene;
    // 야자수
    const trunkM = new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.95 });
    const leafM = new THREE.MeshStandardMaterial({ color: '#3f8a35', roughness: 0.8, side: THREE.DoubleSide });
    const palm = (x, z, h = 7, lean = 0.6) => {
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(Math.sin(t * 1.4) * lean * 2, t * h, 0)); }
      const curve = new THREE.CatmullRomCurve3(pts);
      const tg = new THREE.TubeGeometry(curve, 16, 0.22, 8, false);
      const top = pts[8];
      const leaves = [];
      for (let k = 0; k < 9; k++) {
        const lg = new THREE.PlaneGeometry(3.6, 0.9, 10, 1);
        const p = lg.attributes.position;
        for (let i = 0; i < p.count; i++) { const x0 = p.getX(i) + 1.8; const yb = -0.09 * x0 * x0; const w = 1 - x0 / 3.8; p.setXYZ(i, x0, yb, p.getY(i) * w); }
        lg.rotateX(rand(-0.2, 0.2)); lg.rotateY((k / 9) * Math.PI * 2 + rand(-0.2, 0.2)); lg.translate(top.x, top.y, top.z);
        leaves.push(lg);
      }
      const lm = new THREE.Mesh(mergeGeometries(leaves), leafM); lm.castShadow = true;
      const tm = new THREE.Mesh(tg, trunkM); tm.castShadow = true;
      const grp = new THREE.Group(); grp.add(tm, lm); grp.position.set(x, POOL.deck, z); grp.rotation.y = rand(0, Math.PI * 2); S.add(grp);
    };
    [[-32, -36], [-33, -16], [-32, 4], [32, -38], [33, -18], [32, 3], [-17, 19], [17, 19], [-36, 15], [36, 14]].forEach(([x, z]) => palm(x, z, rand(6, 8.5), rand(0.3, 0.8)));

    // 파라솔 + 선베드
    const poleM = new THREE.MeshStandardMaterial({ color: '#ddd', roughness: 0.5, metalness: 0.3 });
    const frameM = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.5 });
    const cushions = ['#2f6fb5', '#e6e6e6', '#2b9a8f', '#f0b429'];
    const umbCols = [['#e94b3c', '#ffffff'], ['#1f7fc4', '#ffffff'], ['#f2a516', '#ffffff'], ['#2a9d8f', '#f4f1de']];
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) {
      const z = -33 + i * 6.4, x = s * 25.5;
      const cols = umbCols[(i + (s > 0 ? 2 : 0)) % 4];
      const cg = new THREE.ConeGeometry(1.9, 0.55, 12, 1, true).toNonIndexed();
      const col = []; const pc = cg.attributes.position.count; const cc = new THREE.Color();
      for (let v = 0; v < pc; v++) { const tri = (v / 3) | 0; cc.set(cols[Math.floor(tri / 2) % 2]); col.push(cc.r, cc.g, cc.b); }
      cg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); cg.computeVertexNormals();
      const um = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
      um.position.set(x + s * 1.2, POOL.deck + 2.6, z); um.castShadow = true; S.add(um);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6), poleM); pole.position.set(x + s * 1.2, POOL.deck + 1.3, z); S.add(pole);
      for (const dz of [-0.9, 0.9]) {
        const lz = z + dz;
        const base = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 0.7), frameM); base.position.set(x, POOL.deck + 0.38, lz); base.castShadow = true; base.receiveShadow = true; S.add(base);
        const cu = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.07, 0.62), new THREE.MeshStandardMaterial({ color: cushions[(i + (dz > 0 ? 1 : 0)) % 4], roughness: 0.9 }));
        cu.position.set(x + s * 0.2, POOL.deck + 0.45, lz); cu.receiveShadow = true; S.add(cu);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.07, 0.62), cu.material); back.position.set(x - s * 0.82, POOL.deck + 0.62, lz); back.rotation.z = s * 0.6; S.add(back);
        for (const lx of [-0.85, 0.85]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.38, 0.6), frameM); l.position.set(x + lx, POOL.deck + 0.19, lz); S.add(l); }
        this.loungers.push({ x: x + s * 0.1, z: lz, y: POOL.deck + 0.5, head: s > 0 ? Math.PI / 2 : -Math.PI / 2, side: s, used: false });
      }
    }

    // 안전요원 의자
    const chairM = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.5 });
    const redM = new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.6 });
    for (const s of [-1, 1]) {
      const x = s * 21.8, z = -12;
      const grp = new THREE.Group();
      for (const [lx, lz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.1), chairM); l.position.set(lx * (1 - 0.3), 1.2, lz * (1 - 0.3)); l.rotation.set(lz * 0.12, 0, -lx * 0.12); grp.add(l);
      }
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.8), chairM); seat.position.y = 2.4; grp.add(seat);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.08), redM); bk.position.set(0, 2.85, -0.38); grp.add(bk);
      for (let k = 0; k < 4; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.15), chairM); st.position.set(0, 0.5 + k * 0.5, 0.55); grp.add(st); }
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6), poleM); pole.position.set(0.3, 3.2, -0.3); grp.add(pole);
      const ub = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.4, 10, 1, true), new THREE.MeshStandardMaterial({ color: '#d42a2a', roughness: 0.6, side: THREE.DoubleSide })); ub.position.set(0.3, 4.0, -0.3); grp.add(ub);
      grp.traverse((o) => { o.castShadow = true; });
      grp.position.set(x, POOL.deck, z); grp.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; S.add(grp);
      this.chairs.push({ x, z, seatY: POOL.deck + 2.48, head: grp.rotation.y, side: s });
    }

    // 의무실
    const hut = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: 0.7 }));
    hut.position.set(-30, POOL.deck + 1.5, 13); hut.castShadow = true; hut.receiveShadow = true; S.add(hut);
    const hc = document.createElement('canvas'); hc.width = 256; hc.height = 128; const hg = hc.getContext('2d');
    hg.fillStyle = '#fff'; hg.fillRect(0, 0, 256, 128); hg.fillStyle = '#d42a2a'; hg.fillRect(20, 49, 70, 30); hg.fillRect(40, 29, 30, 70);
    hg.font = '800 44px "Pretendard","Malgun Gothic",sans-serif'; hg.fillStyle = '#222'; hg.textBaseline = 'middle'; hg.fillText('의무실', 104, 66);
    const ht = new THREE.CanvasTexture(hc); ht.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshStandardMaterial({ map: ht, roughness: 0.6 }));
    sign.position.set(-27.49, POOL.deck + 2.2, 13); sign.rotation.y = Math.PI / 2; S.add(sign);

    // 조명 기둥
    const bulbM = () => new THREE.MeshStandardMaterial({ color: '#fff6dd', emissive: '#ffd890', emissiveIntensity: 0 });
    let li = 0;
    for (const s of [-1, 1]) for (const z of [-34, -19, -4, 9]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 6), poleM); p.position.set(s * 21.4, POOL.deck + 3, z); p.castShadow = true; S.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), poleM); arm.position.set(s * 20.9, POOL.deck + 5.9, z); S.add(arm);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), bulbM()); b.position.set(s * 20.35, POOL.deck + 5.75, z); S.add(b); this.lamps.push(b);
      if ((li++ % 2) === 0) { const L = new THREE.PointLight('#ffd9a0', 0, 30, 1.6); L.position.copy(b.position); S.add(L); this.lampLights.push(L); }
    }

    // 워터 슬라이드 (배경)
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 14, 12), new THREE.MeshStandardMaterial({ color: '#e0e6ea', roughness: 0.6 }));
    tower.position.set(40, 7, -42); tower.castShadow = true; S.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2, 12), redM); roof.position.set(40, 15, -42); S.add(roof);
    const mkSlide = (col, r0, turns, ph) => {
      const pts = []; for (let i = 0; i <= 60; i++) { const t = i / 60; const a = ph + t * turns * Math.PI * 2; const r = r0 + t * 2; pts.push(new THREE.Vector3(40 + Math.cos(a) * r, 13.5 - t * 12.5, -42 + Math.sin(a) * r)); }
      const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 140, 0.55, 10, false), new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92 }));
      m.castShadow = true; S.add(m);
    };
    mkSlide('#f6c21c', 3.4, 1.6, 0); mkSlide('#1e88e5', 4.6, 1.2, 2.2);
  }

  _background() {
    const S = this.scene;
    // 나무 숲 (인스턴스)
    const N = 90; const tg = new THREE.IcosahedronGeometry(2.6, 1); const trg = new THREE.CylinderGeometry(0.25, 0.35, 3);
    const leaf = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ color: '#3e7a34', roughness: 0.95, flatShading: true }), N);
    const trunk = new THREE.InstancedMesh(trg, new THREE.MeshStandardMaterial({ color: '#6b5038', roughness: 1 }), N);
    const d = new THREE.Object3D(); const c = new THREE.Color(); let k = 0;
    while (k < N) {
      const x = rand(-110, 110), z = rand(-120, 70);
      if (Math.abs(x) < 40 && z > -52 && z < 26) continue;
      if (Math.abs(x - 40) < 6 && Math.abs(z + 42) < 6) continue;
      const s = rand(0.8, 1.7);
      d.position.set(x, 1.5 * s, z); d.scale.setScalar(s); d.rotation.set(0, rand(0, 6), 0); d.updateMatrix(); trunk.setMatrixAt(k, d.matrix);
      d.position.y = 3.6 * s; d.scale.set(s, s * rand(1.0, 1.4), s); d.updateMatrix(); leaf.setMatrixAt(k, d.matrix);
      leaf.setColorAt(k, c.setHSL(0.27 + rand(-0.03, 0.03), 0.45, 0.28 + rand(-0.05, 0.06)));
      k++;
    }
    leaf.castShadow = true; S.add(leaf, trunk);
    // 먼 산
    const mm = new THREE.MeshStandardMaterial({ color: '#5f7d6a', roughness: 1, flatShading: true });
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.95 + (i / 13) * Math.PI * 0.9 - Math.PI * 0.03;
      const r = rand(380, 520);
      const m = new THREE.Mesh(new THREE.ConeGeometry(rand(90, 170), rand(60, 130), 7), mm);
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r - 40); S.add(m);
    }
    // 울타리 벽
    const fm = new THREE.MeshStandardMaterial({ color: '#d9d2c2', roughness: 0.9 });
    for (const [w, x, z, ry] of [[72, -38.2, -14, Math.PI / 2], [72, 38.2, -14, Math.PI / 2], [76.4, 0, 22.2, 0]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, 0.4), fm); f.position.set(x, POOL.deck + 0.6, z); f.rotation.y = ry; f.receiveShadow = true; S.add(f);
    }
  }

  _particles() {
    const N = this.pN = 900;
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3); this.pVel = new Float32Array(N * 3); this.pLife = new Float32Array(N); this.pMax = new Float32Array(N); this.pSize = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.pLife, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `attribute float aLife; attribute float aSize; varying float vL; uniform float uScale;
        void main(){ vL=aLife; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*mv; gl_PointSize = aLife>0.0 ? aSize*uScale/-mv.z : 0.0; }`,
      fragmentShader: `varying float vL; void main(){ vec2 c=gl_PointCoord-0.5; float d=length(c); if(d>0.5) discard;
        float a = smoothstep(0.5,0.15,d)*clamp(vL*2.0,0.0,1.0)*0.85; gl_FragColor=vec4(vec3(0.93,0.97,1.0),a); }`,
    });
    this.parts = new THREE.Points(g, m); this.parts.frustumCulled = false; this.parts.renderOrder = 8; this.scene.add(this.parts);
    this.pIdx = 0;
  }

  splash(x, y, z, n = 14, power = 1) {
    for (let k = 0; k < n; k++) {
      const i = this.pIdx = (this.pIdx + 1) % this.pN;
      this.pPos[i * 3] = x + rand(-0.2, 0.2); this.pPos[i * 3 + 1] = y; this.pPos[i * 3 + 2] = z + rand(-0.2, 0.2);
      const a = rand(0, Math.PI * 2), sp = rand(0.4, 1.6) * power;
      this.pVel[i * 3] = Math.cos(a) * sp; this.pVel[i * 3 + 1] = rand(1.5, 3.6) * power; this.pVel[i * 3 + 2] = Math.sin(a) * sp;
      this.pMax[i] = this.pLife[i] = rand(0.6, 1.1); this.pSize[i] = rand(0.08, 0.2) * (0.7 + power * 0.4);
    }
  }

  _rain() {
    const N = 1600; const v = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      const x = rand(-34, 34), y = rand(0, 26), z = rand(-46, 18);
      v.set([x, y, z, x + 0.05, y + 0.6, z + 0.08], i * 6);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    this.rainLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#c4d8ea', transparent: true, opacity: 0 }));
    this.rainLines.frustumCulled = false; this.rainLines.visible = false; this.scene.add(this.rainLines);
    this.rainAmt = 0; this.rainTarget = 0;
  }

  _stars() {
    const N = 1400, v = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const p = new THREE.Vector3().setFromSphericalCoords(3000, Math.acos(rand(0.08, 1)), rand(0, Math.PI * 2)); v.set([p.x, p.y, p.z], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, fog: false }));
    this.stars.visible = false; this.scene.add(this.stars);
  }

  setRain(on) { this.rainTarget = on ? 1 : 0; }

  update(dt, t) {
    this.U.uTime.value = t;
    this.waterMat.uniforms.uStrength.value = W.strength;
    // 부표 줄
    const N = this.ropeN, pos = this.ropeGeo.attributes.position, d = this._d;
    for (let i = 0; i < N; i++) {
      const x = -19.8 + (39.6 * i) / (N - 1); const y = waveH(x, POOL.rope, t) + 0.05;
      d.position.set(x, y, POOL.rope); d.rotation.set(0, 0, Math.sin(t * 2 + i) * 0.1); d.updateMatrix(); this.buoys.setMatrixAt(i, d.matrix);
      pos.setXYZ(i, x, y, POOL.rope);
    }
    this.buoys.instanceMatrix.needsUpdate = true; pos.needsUpdate = true;
    // 파티클
    const P = this.pPos, V = this.pVel, L = this.pLife;
    for (let i = 0; i < this.pN; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt; V[i * 3 + 1] -= 9.8 * dt;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < waveH(P[i * 3], P[i * 3 + 2], t) - 0.1) L[i] = 0;
    }
    this.parts.geometry.attributes.position.needsUpdate = true; this.parts.geometry.attributes.aLife.needsUpdate = true; this.parts.geometry.attributes.aSize.needsUpdate = true;
    this.parts.material.uniforms.uScale.value = this.r.domElement.height * 0.6;
    // 비
    this.rainAmt += (this.rainTarget - this.rainAmt) * Math.min(1, dt * 0.8);
    this.rainLines.visible = this.rainAmt > 0.01;
    if (this.rainLines.visible) {
      this.rainLines.material.opacity = 0.45 * this.rainAmt;
      const a = this.rainLines.geometry.attributes.position; const arr = a.array;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= 22 * dt; arr[i + 4] -= 22 * dt; arr[i] -= 1.5 * dt; arr[i + 3] -= 1.5 * dt;
        if (arr[i + 1] < 0) { arr[i + 1] += 26; arr[i + 4] += 26; }
        if (arr[i] < -34) { arr[i] += 68; arr[i + 3] += 68; }
      }
      a.needsUpdate = true;
    }
    this.waterMat.uniforms.uRain.value = this.rainAmt;
  }
}
