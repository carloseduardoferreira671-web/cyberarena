/*
 * CyberArena · peso de combate.
 *  - CamShake: tremor de câmera DIRECIONAL (mola amortecida na direção do golpe + ruído suave no mesmo eixo)
 *  - PhysParticles: faíscas, gotas e lascas com gravidade, arrasto, quique, escorrimento em encostas e acúmulo no chão (decalques)
 *  - LimbTrail: rastro borrado de punhos e pés em alta velocidade (motion blur por objeto)
 */
import * as THREE from '../lib/three.module.min.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ------------------------------------------------------------------ tremor direcional */
export class CamShake {
  constructor() {
    this.off = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 1, 0);
    this.roll = 0; this.rollV = 0; this.t = 0; this.out = { x: 0, y: 0, z: 0, roll: 0 }; this._o = new THREE.Vector3();
  }
  /** empurra a câmera na direção (dx,dy,dz) do golpe; `m` ≈ deslocamento em metros */
  kick(dx, dy, dz, m = .1) {
    _v.set(dx, dy, dz); const l = _v.length(); if (l < 1e-4) return; _v.divideScalar(l);
    this.vel.addScaledVector(_v, Math.min(m, .9) * 22); this.dir.lerp(_v, .75); if (this.dir.lengthSq() < 1e-6) this.dir.copy(_v); this.dir.normalize();
    this.rollV += (Math.random() - .5) * Math.min(m, .6) * 2.2;
  }
  update(dt, trauma = 0) {
    dt = Math.min(dt, 1 / 20); const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vel.addScaledVector(this.off, -260 * h).addScaledVector(this.vel, -16 * h); this.off.addScaledVector(this.vel, h);
      this.rollV += (-this.roll * 220 - this.rollV * 14) * h; this.roll += this.rollV * h;
    }
    this.t += dt;
    const tr = trauma * trauma, A = tr * .17, t = this.t;
    const n1 = Math.sin(t * 47.1) * .6 + Math.sin(t * 29.3 + 1.7) * .4, n2 = Math.sin(t * 38.7 + .4) * .6 + Math.sin(t * 61.9 + 2.1) * .4;
    // eixo do ruído = eixo do último golpe (golpe vertical → treme na vertical)
    const d = this.dir, o = _w.crossVectors(d, UP); if (o.lengthSq() < 1e-4) o.set(1, 0, 0); o.normalize();
    const out = this.out;
    out.x = this.off.x + d.x * n1 * A + o.x * n2 * A * .35; out.y = this.off.y + d.y * n1 * A + o.y * n2 * A * .35; out.z = this.off.z + d.z * n1 * A + o.z * n2 * A * .35;
    const lim = 1.4; out.x = Math.max(-lim, Math.min(lim, out.x)); out.y = Math.max(-lim, Math.min(lim, out.y)); out.z = Math.max(-lim, Math.min(lim, out.z));
    out.roll = this.roll + n2 * tr * .018;
    return out;
  }
}

/* ------------------------------------------------------------------ partículas com física */
const K = { BLOOD: 0, SWEAT: 1, SPARK: 2, CHIP: 3 };
function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128); x.fillStyle = '#fff';
  x.beginPath(); x.arc(64, 64, 22 + Math.random() * 6, 0, 7); x.fill();
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.283, d = 20 + Math.random() * 34, r = 2 + Math.random() * 9; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); x.fill();
    x.lineWidth = r * .8; x.beginPath(); x.moveTo(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22); x.lineTo(64 + Math.cos(a) * d, 64 + Math.sin(a) * d); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class PhysParticles {
  /** @param groundAt (x,z,yHint) => altura do chão */
  constructor(scene, groundAt) {
    this.scene = scene; this.groundAt = groundAt; this.N = 640; this.ND = 220; this.frame = 0; this.gore = true;
    const N = this.N;
    this.p = new Float32Array(N * 3); this.v = new Float32Array(N * 3); this.life = new Float32Array(N); this.kind = new Uint8Array(N); this.size = new Float32Array(N);
    this.col = new Float32Array(N * 3); this.bounces = new Uint8Array(N); this.gnd = new Float32Array(N); this.rest = new Float32Array(N); this.stuck = new Uint8Array(N);
    this.solid = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: .25, metalness: .08 }), N);
    this.glow = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N);
    for (const m of [this.solid, this.glow]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, _c.set(1, 1, 1)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); m.count = N; scene.add(m); }
    this.solid.castShadow = false; this.solid.renderOrder = 3; this.glow.renderOrder = 6;
    const dummy = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) { this.solid.setMatrixAt(i, dummy); this.glow.setMatrixAt(i, dummy); }
    this.decal = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: splatTexture(), transparent: true, alphaTest: .04, depthWrite: false, roughness: .12, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), this.ND);
    this.decal.frustumCulled = false; this.decal.renderOrder = 2; this.decal.setColorAt(0, _c.set(1, 1, 1)); this.dn = 0; this.dk = 0;
    for (let i = 0; i < this.ND; i++) this.decal.setMatrixAt(i, dummy);
    scene.add(this.decal);
    this.k = 0;
  }
  clear() { this.life.fill(0); this.dn = 0; this.dk = 0; const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < this.ND; i++) this.decal.setMatrixAt(i, z); this.decal.instanceMatrix.needsUpdate = true; }
  _emit(kind, x, y, z, vx, vy, vz, size, life, r, g, b) {
    const i = this.k = (this.k + 1) % this.N, p = this.p, v = this.v;
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z; v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
    this.kind[i] = kind; this.size[i] = size; this.life[i] = life; this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.bounces[i] = 0; this.stuck[i] = 0; this.rest[i] = 0;
    this.gnd[i] = this.groundAt ? this.groundAt(x, z, y) : y - 1.2;
  }
  _cone(p, dir, n, speed, spread, f) {
    for (let i = 0; i < n; i++) {
      _v.set(dir.x + rnd(-1, 1) * spread, dir.y + rnd(-.3, 1) * spread, dir.z + rnd(-1, 1) * spread).normalize().multiplyScalar(speed * rnd(.35, 1));
      f(_v);
    }
  }
  /** sangue (gotas escuras, deixam mancha no chão) */
  blood(p, dir, n = 10, power = 1) {
    if (!this.gore) return;
    this._cone(p, dir, n, 5.5 * power, .8, v => this._emit(K.BLOOD, p.x, p.y, p.z, v.x, v.y + 1, v.z, rnd(.018, .05) * (.8 + power * .3), rnd(2.5, 5), .22, .005, .01));
  }
  /** gotas de suor voando da cabeça/corpo */
  sweat(p, dir, n = 6, power = 1) { this._cone(p, dir, n, 3.4 * power, 1, v => this._emit(K.SWEAT, p.x, p.y, p.z, v.x, v.y + .8, v.z, rnd(.012, .026), rnd(.6, 1.1), .8, .9, 1)); }
  /** faíscas quentes (quicam e morrem) */
  sparks(p, dir, n = 12, power = 1, c = [3.2, 1.6, .5]) { this._cone(p, dir, n, 8 * power, .9, v => this._emit(K.SPARK, p.x, p.y, p.z, v.x, v.y + 1.2, v.z, rnd(.012, .03), rnd(.45, 1.0), c[0], c[1], c[2])); }
  /** lascas de terra/pedra (ficam no chão por um tempo) */
  chips(p, n = 10, power = 1, c = [.32, .27, .21]) { for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(1.5, 5) * power; this._emit(K.CHIP, p.x + Math.cos(a) * .25, p.y + .1, p.z + Math.sin(a) * .25, Math.cos(a) * s, rnd(2, 5.5) * power, Math.sin(a) * s, rnd(.025, .07), rnd(5, 9), c[0] * rnd(.7, 1.2), c[1] * rnd(.7, 1.2), c[2] * rnd(.7, 1.2)); } }
  _stamp(x, gy, z, nx, ny, nz, size, r, g, b) {
    const i = this.dk = (this.dk + 1) % this.ND; _v.set(nx, ny, nz); _q.setFromUnitVectors(UP, _v); _q2.setFromAxisAngle(UP, rnd(0, 6.283)); _q.multiply(_q2);
    _m.compose(_w.set(x + nx * .012, gy + ny * .012, z + nz * .012), _q, _s.set(size, 1, size)); this.decal.setMatrixAt(i, _m); this.decal.setColorAt(i, _c.setRGB(r, g, b));
    this.decal.instanceMatrix.needsUpdate = true; this.decal.instanceColor.needsUpdate = true;
  }
  update(dt) {
    dt = Math.min(dt, 1 / 30); this.frame++;
    const p = this.p, v = this.v, ga = this.groundAt, N = this.N;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) { this._hide(i); continue; }
      const kd = this.kind[i], i3 = i * 3;
      this.life[i] -= dt; if (kd === K.CHIP && this.stuck[i]) { this.rest[i] += dt; if (this.rest[i] < 5) { this._draw(i); continue; } }
      if (this.stuck[i] && kd !== K.CHIP) { this.life[i] -= dt * 2; }
      const g = kd === K.SPARK ? 14 : kd === K.SWEAT ? 12 : 21, drag = kd === K.SPARK ? 1.1 : kd === K.SWEAT ? 1.6 : .35;
      if (!this.stuck[i] || kd !== K.CHIP) {
        v[i3 + 1] -= g * dt; const dk = Math.max(0, 1 - drag * dt); v[i3] *= dk; v[i3 + 1] *= dk; v[i3 + 2] *= dk;
        p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      }
      // chão: só consulta perto do solo; consulta escalonada para não pesar
      if (ga && (p[i3 + 1] < this.gnd[i] + 2.2 + Math.abs(v[i3 + 1]) * .1 || ((this.frame + i) & 7) === 0)) this.gnd[i] = ga(p[i3], p[i3 + 2], p[i3 + 1]);
      const gy = this.gnd[i], r = this.size[i];
      if (p[i3 + 1] <= gy + r) {
        // normal do terreno por diferenças finitas
        let nx = 0, ny = 1, nz = 0;
        if (ga) { const e = .35; nx = ga(p[i3] - e, p[i3 + 2], gy + 1) - ga(p[i3] + e, p[i3 + 2], gy + 1); nz = ga(p[i3], p[i3 + 2] - e, gy + 1) - ga(p[i3], p[i3 + 2] + e, gy + 1); const l = Math.hypot(nx, 2 * e, nz); nx /= l; ny = 2 * e / l; nz /= l; }
        p[i3 + 1] = gy + r;
        if (kd === K.SPARK) { if (this.bounces[i] > 1) { this.life[i] = 0; continue; } }
        if (ny < .62 && kd !== K.SPARK) {
          // encosta/parede: gruda e escorre pela inclinação
          const vn = v[i3] * nx + v[i3 + 1] * ny + v[i3 + 2] * nz; v[i3] -= nx * vn; v[i3 + 1] -= ny * vn; v[i3 + 2] -= nz * vn;
          v[i3] *= .92; v[i3 + 1] *= .92; v[i3 + 2] *= .92; v[i3 + 1] -= 4 * dt * (1 - ny);
          if (kd === K.BLOOD && ((this.frame + i) % 14) === 0) this._stamp(p[i3], gy, p[i3 + 2], nx, ny, nz, r * 3.2, this.col[i3], this.col[i3 + 1], this.col[i3 + 2]);
        } else {
          const vn = v[i3] * nx + v[i3 + 1] * ny + v[i3 + 2] * nz;
          if (vn < -1.3 && this.bounces[i] < (kd === K.CHIP ? 3 : kd === K.SPARK ? 2 : 1)) {
            const e = kd === K.SPARK ? .55 : kd === K.CHIP ? .38 : .12; v[i3] -= (1 + e) * vn * nx; v[i3 + 1] -= (1 + e) * vn * ny; v[i3 + 2] -= (1 + e) * vn * nz;
            v[i3] *= .72; v[i3 + 2] *= .72; this.bounces[i]++;
          } else {
            v[i3] = v[i3 + 1] = v[i3 + 2] = 0; this.stuck[i] = 1;
            if (kd === K.BLOOD) { this._stamp(p[i3], gy, p[i3 + 2], nx, ny, nz, r * rnd(5, 9) * (1 + Math.min(1, -vn * .08)), this.col[i3], this.col[i3 + 1], this.col[i3 + 2]); this.life[i] = 0; }
            else if (kd === K.SWEAT) this.life[i] = 0;
            else if (kd === K.SPARK) this.life[i] = 0;
          }
        }
      }
      this._draw(i);
    }
    this.solid.instanceMatrix.needsUpdate = true; this.glow.instanceMatrix.needsUpdate = true; this.solid.instanceColor.needsUpdate = true; this.glow.instanceColor.needsUpdate = true;
  }
  _hide(i) { if (this._h && this._h[i]) return; (this._h = this._h || new Uint8Array(this.N))[i] = 1; _m.makeScale(0, 0, 0); this.solid.setMatrixAt(i, _m); this.glow.setMatrixAt(i, _m); }
  _draw(i) {
    if (this._h) this._h[i] = 0;
    const kd = this.kind[i], i3 = i * 3, p = this.p, v = this.v, s = this.size[i];
    if (kd === K.SPARK) {
      const sp = Math.hypot(v[i3], v[i3 + 1], v[i3 + 2]); _w.set(v[i3], v[i3 + 1], v[i3 + 2]); if (sp > .01) _w.divideScalar(sp); else _w.set(0, 1, 0);
      _q.setFromUnitVectors(FWD, _w); const k = Math.min(1, this.life[i] * 2.5);
      _m.compose(_v.set(p[i3], p[i3 + 1], p[i3 + 2]), _q, _s.set(s * .6 * k, s * .6 * k, s * (1 + sp * .22) * k)); this.glow.setMatrixAt(i, _m);
      this.glow.setColorAt(i, _c.setRGB(this.col[i3] * k, this.col[i3 + 1] * k, this.col[i3 + 2] * k)); _m.makeScale(0, 0, 0); this.solid.setMatrixAt(i, _m);
    } else {
      const sp = Math.hypot(v[i3], v[i3 + 1], v[i3 + 2]); const stretch = (kd === K.BLOOD || kd === K.SWEAT) ? 1 + Math.min(2.2, sp * .12) : 1;
      if (stretch > 1.01) { _w.set(v[i3], v[i3 + 1], v[i3 + 2]).divideScalar(sp || 1); _q.setFromUnitVectors(UP, _w); } else _q.identity();
      const fade = kd === K.CHIP ? Math.min(1, Math.max(0, (9 - this.rest[i]) * .5)) : Math.min(1, this.life[i] * 3);
      _m.compose(_v.set(p[i3], p[i3 + 1], p[i3 + 2]), _q, _s.set(s * fade, s * stretch * fade, s * fade)); this.solid.setMatrixAt(i, _m);
      this.solid.setColorAt(i, _c.setRGB(this.col[i3], this.col[i3 + 1], this.col[i3 + 2])); _m.makeScale(0, 0, 0); this.glow.setMatrixAt(i, _m);
    }
  }
  dispose() { for (const m of [this.solid, this.glow, this.decal]) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); } }
}

/* ------------------------------------------------------------------ rastro de membro (motion blur por objeto) */
export class LimbTrail {
  constructor(n = 9, rgb = [.75, .55, 1]) {
    this.n = n; this.pts = Array.from({ length: n }, () => new THREE.Vector3()); this.rgb = rgb; this.ready = false; this.k = 0;
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 6); this.cl = new Float32Array(n * 8);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.cl, 4));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.geo = g; this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 7;
  }
  setColor(rgb) { this.rgb = rgb; }
  /** p: posição mundial atual do membro; cam: posição da câmera */
  push(p, dt, cam, width = .1, gain = 1) {
    if (!this.ready) { for (const q of this.pts) q.copy(p); this.ready = true; }
    const speed = this.pts[0].distanceTo(p) / Math.max(dt, 1e-3);
    for (let i = this.n - 1; i > 0; i--) this.pts[i].copy(this.pts[i - 1]); this.pts[0].copy(p);
    const t = Math.min(1, Math.max(0, (speed - 8) / 9)); this.k += (t - this.k) * Math.min(1, dt * 18);
    if (this.k < .03) { this.mesh.visible = false; return; }
    this.mesh.visible = true; const n = this.n, P = this.pos, C = this.cl, a0 = this.k * gain;
    for (let i = 0; i < n; i++) {
      const a = this.pts[i], b = this.pts[Math.min(n - 1, i + 1)], c = this.pts[Math.max(0, i - 1)];
      _v.subVectors(c, b); if (_v.lengthSq() < 1e-8) _v.set(0, 1, 0); _w.subVectors(a, cam); const side = _s.crossVectors(_v, _w); if (side.lengthSq() < 1e-10) side.set(1, 0, 0); side.normalize();
      const f = 1 - i / (n - 1), w = width * (.35 + .65 * f);
      P[i * 6] = a.x - side.x * w; P[i * 6 + 1] = a.y - side.y * w; P[i * 6 + 2] = a.z - side.z * w; P[i * 6 + 3] = a.x + side.x * w; P[i * 6 + 4] = a.y + side.y * w; P[i * 6 + 5] = a.z + side.z * w;
      const al = a0 * f * f * .55; for (let j = 0; j < 2; j++) { const o = i * 8 + j * 4; C[o] = this.rgb[0]; C[o + 1] = this.rgb[1]; C[o + 2] = this.rgb[2]; C[o + 3] = al; }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.color.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}
