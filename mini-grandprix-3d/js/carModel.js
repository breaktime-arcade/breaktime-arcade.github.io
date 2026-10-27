// =============================================================
//  아기자기한 미니카 3D 모델 + 차체 기울기(롤/피치) 연출
// =============================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const toon = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

export class CarModel {
  constructor(scene, color = 0xff4f6d, accent = 0xffffff) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);

    const bodyMat = toon(color);
    const darkMat = toon(0x2b2d42);
    const glassMat = toon(0x9fe3ff, { emissive: 0x204060, emissiveIntensity: 0.25 });

    // 차체
    const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.75, 3.7, 4, 0.32), bodyMat);
    chassis.position.y = 0.78;
    chassis.castShadow = true;
    this.body.add(chassis);

    // 앞뒤 범퍼
    for (const z of [1.83, -1.83]) {
      const bumper = new THREE.Mesh(new RoundedBoxGeometry(1.75, 0.28, 0.25, 2, 0.1), darkMat);
      bumper.position.set(0, 0.55, z);
      this.body.add(bumper);
    }

    // 유리 캐빈 + 지붕
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.55, 0.7, 1.85, 4, 0.28), glassMat);
    cabin.position.set(0, 1.42, -0.3);
    cabin.castShadow = true;
    this.body.add(cabin);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(1.62, 0.18, 1.6, 3, 0.08), bodyMat);
    roof.position.set(0, 1.82, -0.35);
    roof.castShadow = true;
    this.body.add(roof);

    // 운전자 헬멧
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.33, 14, 10), toon(0xffd23f));
    helmet.position.set(0, 1.45, -0.25);
    this.body.add(helmet);

    // 보닛 줄무늬
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.02, 1.3), toon(accent));
    stripe.position.set(0, 1.16, 1.1);
    this.body.add(stripe);
    const stripe2 = stripe.clone(); stripe2.position.z = -1.45; stripe2.scale.z = 0.5;
    this.body.add(stripe2);

    // 전조등 / 후미등
    const headMat = toon(0xfff6c2, { emissive: 0xfff2a0, emissiveIntensity: 0.6 });
    const tailMat = toon(0xff3355, { emissive: 0xff2244, emissiveIntensity: 0.3 });
    this.tailMat = tailMat;
    for (const x of [0.58, -0.58]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), headMat);
      h.position.set(x, 0.88, 1.82); h.scale.z = 0.5;
      this.body.add(h);
      const t = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.16, 0.08, 2, 0.04), tailMat);
      t.position.set(x, 0.92, -1.86);
      this.body.add(t);
    }

    // 작은 스포일러
    const spoiler = new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.08, 0.38, 2, 0.03), toon(accent));
    spoiler.position.set(0, 1.42, -1.7);
    this.body.add(spoiler);
    for (const x of [0.55, -0.55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.12), darkMat);
      leg.position.set(x, 1.27, -1.7);
      this.body.add(leg);
    }

    // 바퀴
    this.wheels = [];
    this.frontPivots = [];
    const tireGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.42, 18);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.44, 10);
    hubGeo.rotateZ(Math.PI / 2);
    const hubMat = toon(0xf1f1f1);
    for (const [x, z, front] of [[0.92, 1.22, 1], [-0.92, 1.22, 1], [0.92, -1.22, 0], [-0.92, -1.22, 0]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.46, z);
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, darkMat); tire.castShadow = true;
      const hub = new THREE.Mesh(hubGeo, hubMat);
      // 바퀴 회전이 보이도록 바퀴살 표시
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.08, 0.5), toon(color));
      wheel.add(tire, hub, spoke);
      pivot.add(wheel);
      this.root.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontPivots.push(pivot);
    }

    // 동그란 그림자 (부드러운 느낌)
    const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.scale.set(1.25, 2.2, 1); sh.position.y = 0.03;
    this.root.add(sh);

    // 부스터 불꽃 (배기구 두 개)
    this.flames = new THREE.Group();
    const flameOuter = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 });
    const flameInner = new THREE.MeshBasicMaterial({ color: 0xfff3a0 });
    for (const x of [0.45, -0.45]) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 10), darkMat);
      pipe.rotation.x = Math.PI / 2; pipe.position.set(x, 0.5, -1.95);
      this.body.add(pipe);
      const o = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 10), flameOuter);
      o.rotation.x = -Math.PI / 2; o.position.set(x, 0.5, -2.6);
      const i = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 8), flameInner);
      i.rotation.x = -Math.PI / 2; i.position.set(x, 0.5, -2.35);
      this.flames.add(o, i);
    }
    this.flames.visible = false;
    this.body.add(this.flames);

    this.roll = 0; this.pitch = 0; this.rollV = 0; this.pitchV = 0;
    this.squash = 0;
    scene.add(this.root);
  }

  update(car, dt) {
    this.root.position.set(car.x, 0, car.z);
    this.root.rotation.y = car.angle;
    for (const w of this.wheels) w.rotation.x = car.wheelSpin;
    for (const p of this.frontPivots) p.rotation.y = car.steer;

    // 스프링으로 차체 롤/피치 (가감속·코너링에 따라 출렁)
    const tRoll = Math.max(-0.14, Math.min(0.14, car.accLat * 0.011));
    const tPitch = Math.max(-0.09, Math.min(0.09, -car.accLong * 0.0045));
    const k = 120, c = 12;
    this.rollV += ((tRoll - this.roll) * k - this.rollV * c) * dt;
    this.pitchV += ((tPitch - this.pitch) * k - this.pitchV * c) * dt;
    this.roll += this.rollV * dt; this.pitch += this.pitchV * dt;
    this.body.rotation.set(this.pitch, 0, this.roll);

    // 충돌 시 찌그러졌다 돌아오기
    this.squash *= Math.exp(-dt * 7);
    const s = this.squash;
    this.body.scale.set(1 + s * 0.25, 1 - s * 0.3, 1 - s * 0.15);

    // 부스터 불꽃 깜빡임
    this.flames.visible = !!car.boosting;
    if (car.boosting) {
      const f = 0.8 + Math.random() * 0.5;
      this.flames.scale.set(1, 1, f);
      this.flames.position.z = -(f - 1) * 0.5;
    }

    // 브레이크 등
    const braking = car.input.brake > 0 && car.vLong > 0.5;
    this.tailMat.emissiveIntensity = braking ? 1.4 : 0.3;
  }

  bump(strength) {
    this.squash = Math.min(1, this.squash + strength);
    this.rollV += (Math.random() - 0.5) * strength * 6;
    this.pitchV -= strength * 3;
  }
}
