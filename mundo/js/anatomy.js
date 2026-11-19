/*
 * CyberArena · anatomia dinâmica do Atlas.
 *  - FaceRig: "blendshapes" do rosto (peças nomeadas: sobrancelhas, pálpebras/olhos, mandíbula, boca) dirigidas por
 *    expressões dor / raiva / cansaço / respiração, com mola de suavização.
 *  - DreadHair: cada dreadlock é uma cadeia de 4 ossos dentro de UMA SkinnedMesh (1 draw call). Cada segmento é uma mola
 *    amortecida que reage à aceleração da cabeça, ao vento relativo da corrida, à gravidade e à "aura" (cabelo flutuando).
 */
import * as THREE from '../lib/three.module.min.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ------------------------------------------------------------------ rosto */
export class FaceRig {
  /** parts: { browL, browR, eyeL, eyeR, jaw, mouth } (Object3D já posicionados no repouso) */
  constructor(parts) {
    this.p = parts; this.rest = {};
    for (const k in parts) { const o = parts[k]; if (!o) continue; this.rest[k] = { pos: o.position.clone(), scl: o.scale.clone(), rot: o.rotation.clone() }; }
    this.s = { pain: 0, rage: 0, tired: 0, breath: 0, blink: 0 }; this.blinkT = 2 + Math.random() * 3; this.blinkP = 0;
  }
  /** e: { pain, rage, tired (0..1), breath (-1..1) } */
  update(dt, e) {
    const s = this.s, k = 1 - Math.exp(-dt * (e.pain > s.pain ? 26 : 9));
    s.pain += (e.pain - s.pain) * k; s.rage += (e.rage - s.rage) * (1 - Math.exp(-dt * 8)); s.tired += (e.tired - s.tired) * (1 - Math.exp(-dt * 3)); s.breath = e.breath || 0;
    this.blinkT -= dt; if (this.blinkT <= 0) { this.blinkP = 1; this.blinkT = 2.2 + Math.random() * 3.5; }
    if (this.blinkP > 0) { this.blinkP -= dt * 7; s.blink = Math.sin(clamp(this.blinkP, 0, 1) * Math.PI); } else s.blink = 0;
    const P = this.p, R = this.rest;
    const squint = clamp(s.pain * .8 + s.rage * .5 + s.tired * .5, 0, .85), lid = clamp(squint + s.blink, 0, 1);
    for (const side of ['L', 'R']) {
      const eye = P['eye' + side], brow = P['brow' + side]; const sg = side === 'L' ? -1 : 1;
      if (eye) { eye.scale.y = R['eye' + side].scl.y * (1 - lid * .7); eye.position.y = R['eye' + side].pos.y - lid * .006; eye.scale.x = R['eye' + side].scl.x * (1 + s.rage * .1); }
      if (brow) {
        const inner = s.rage * .45 - s.pain * .35 + s.tired * .1;           // + = ponta interna desce (raiva)
        brow.rotation.z = R['brow' + side].rot.z + sg * inner;               // L: -inner, R: +inner
        brow.position.y = R['brow' + side].pos.y - s.rage * .03 - s.tired * .012 + s.pain * .008;
        brow.position.z = R['brow' + side].pos.z + s.rage * .012;
        brow.scale.y = R['brow' + side].scl.y * (1 + s.rage * .25);
      }
    }
    const open = clamp(s.pain * .3 + s.tired * .15 + s.rage * .08 + Math.max(0, s.breath) * .06 * (.4 + s.tired), 0, .5);
    if (P.jaw) P.jaw.rotation.x = R.jaw.rot.x + open;
    if (P.mouth) { P.mouth.scale.y = R.mouth.scl.y * (1 + open * 5.5); P.mouth.scale.x = R.mouth.scl.x * (1 + s.pain * .3 + s.rage * .45); P.mouth.position.y = R.mouth.pos.y + s.rage * .006 - open * .02; }
  }
}

/* ------------------------------------------------------------------ dreadlocks físicos */
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SEG = 4;

export class DreadHair {
  /**
   * @param head  osso/Object3D da cabeça (a SkinnedMesh vira filha dele)
   * @param mat   material PBR dos dreads
   * @param curves array de { pts:[Vector3 ×4] } em espaço da cabeça (início, controle, meio, ponta)
   */
  constructor(head, mat, curves, radius = .043) {
    this.head = head; this.locks = []; this.aura = .3; this.windK = .8; this.t = 0; this.ready = false;
    this.pPrev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3(); this.q = new THREE.Quaternion();
    const bones = [], pos = [], idx = [], skI = [], skW = [], T = 22, R = 7;
    curves.forEach((c, li) => {
      const curve = new THREE.CatmullRomCurve3(c.pts);
      const jp = []; for (let s = 0; s <= SEG; s++) jp.push(curve.getPointAt(s / SEG));
      const lock = { bones: [], rest: [], st: [], ph: Math.random() * 6.28, ax: new THREE.Vector3(Math.random() - .5, 0, Math.random() - .5).normalize() };
      let parent = head, prevQ = new THREE.Quaternion();
      for (let s = 0; s < SEG; s++) {
        const d = _v.subVectors(jp[s + 1], jp[s]); const L = d.length(); d.normalize();
        const qs = new THREE.Quaternion().setFromUnitVectors(UP, d); const b = new THREE.Bone(); b.name = `dread${li}_${s}`;
        if (s === 0) b.position.copy(jp[0]); else b.position.set(0, lock.len, 0);
        b.quaternion.copy(prevQ).invert().multiply(qs); parent.add(b); parent = b; prevQ = qs; lock.len = L;
        lock.bones.push(b); lock.rest.push({ q: b.quaternion.clone(), qs: qs.clone() }); lock.st.push({ x: 0, z: 0, vx: 0, vz: 0 }); bones.push(b);
      }
      // malha do dread (afilando para a ponta), pesos suaves entre ossos vizinhos
      const frames = curve.computeFrenetFrames(T, false), base = pos.length / 3, r0 = radius * (1 + (li % 4) * .09);
      for (let i = 0; i <= T + 1; i++) {
        const tt = Math.min(1, i / T), p = curve.getPointAt(tt), N = frames.normals[Math.min(i, T)], B = frames.binormals[Math.min(i, T)];
        const cap = i > T ? 0 : 1, rad = r0 * (1 - .42 * tt * tt) * cap + (i > T ? 0 : 0), u = tt * SEG, s = Math.min(SEG - 1, Math.floor(u)), f = u - s;
        const wn = s < SEG - 1 ? .5 * smooth(.55, 1, f) : 0, wp = s > 0 ? .5 * (1 - smooth(0, .45, f)) : 0, wc = 1 - wn - wp;
        const tang = frames.tangents[Math.min(i, T)];
        for (let j = 0; j < R; j++) {
          const a = j / R * Math.PI * 2, cx = Math.cos(a) * rad, cy = Math.sin(a) * rad;
          const px = p.x + N.x * cx + B.x * cy + (i > T ? tang.x * r0 * .5 : 0), py = p.y + N.y * cx + B.y * cy + (i > T ? tang.y * r0 * .5 : 0), pz = p.z + N.z * cx + B.z * cy + (i > T ? tang.z * r0 * .5 : 0);
          pos.push(px, py, pz);
          const bi = li * SEG + s; skI.push(bi, s < SEG - 1 ? bi + 1 : bi, s > 0 ? bi - 1 : bi, 0); skW.push(wc, wn, wp, 0);
        }
      }
      for (let i = 0; i <= T; i++) for (let j = 0; j < R; j++) { const a = base + i * R + j, b = base + i * R + (j + 1) % R, c2 = base + (i + 1) * R + j, d2 = base + (i + 1) * R + (j + 1) % R; idx.push(a, c2, b, b, c2, d2); }
      this.locks.push(lock);
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skI, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skW, 4)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.SkinnedMesh(g, mat); mesh.name = 'atlas-dreadlocks-skinned'; mesh.castShadow = true; mesh.frustumCulled = false; head.add(mesh);
    head.updateWorldMatrix(true, true); mesh.bind(new THREE.Skeleton(bones)); this.mesh = mesh; this.bones = bones;
  }
  /** externo: força extra em m/s² no mundo (ex.: vento de poder) */
  update(dt, extraWorld = null) {
    dt = Math.min(dt, 1 / 30); if (dt <= 0) return; this.t += dt; const head = this.head;
    head.updateWorldMatrix(true, false); const hp = _v.setFromMatrixPosition(head.matrixWorld); head.getWorldQuaternion(this.q);
    if (!this.ready) { this.pPrev.copy(hp); this.ready = true; }
    const vel = _w.subVectors(hp, this.pPrev).divideScalar(dt); this.acc.subVectors(vel, this.vel).divideScalar(dt); this.acc.clampLength(0, 90); this.vel.copy(vel); this.pPrev.copy(hp);
    const qi = _q.copy(this.q).invert();
    // forças no espaço local da cabeça
    const F = new THREE.Vector3().copy(this.acc).multiplyScalar(-.8).applyQuaternion(qi);
    F.add(_a.set(0, -9.8, 0).applyQuaternion(qi)).add(_a.set(0, 9.8, 0));                      // gravidade relativa ao repouso
    F.add(_a.copy(vel).multiplyScalar(-this.windK).applyQuaternion(qi));                       // vento relativo do movimento
    F.y += 9.8 * this.aura * .9;                                                                 // aura: cabelo flutua
    if (extraWorld) F.add(_a.copy(extraWorld).applyQuaternion(qi));
    F.clampLength(0, 60);
    this.locks.forEach((lk, li) => {
      const flutter = (.5 + this.aura * 1.6) * Math.sin(this.t * 3.1 + lk.ph);
      for (let s = 0; s < SEG; s++) {
        const rs = lk.rest[s], st = lk.st[s];
        // direção do segmento (espaço da cabeça) ≈ eixo Y do repouso acumulado
        const dh = _a.copy(UP).applyQuaternion(rs.qs);
        const Fi = _w.copy(F).addScaledVector(lk.ax, flutter * (s + 1)); const Fp = Fi.addScaledVector(dh, -Fi.dot(dh));
        const ax = _v.crossVectors(dh, Fp); const mag = Math.min(.62, Fp.length() * (.02 + .012 * s));
        if (ax.lengthSq() > 1e-10) ax.normalize().applyQuaternion(_q2.copy(rs.qs).invert()); else ax.set(0, 0, 0);
        const tx = ax.x * mag, tz = ax.z * mag, k = 175 - s * 35, c = 2 * Math.sqrt(k) * (.3 + s * .04);
        st.vx += ((tx - st.x) * k - st.vx * c) * dt; st.vz += ((tz - st.z) * k - st.vz * c) * dt; st.x += st.vx * dt; st.z += st.vz * dt;
        lk.bones[s].quaternion.copy(rs.q).multiply(_q2.setFromEuler(_e.set(st.x, 0, st.z)));
      }
    });
  }
  dispose() { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); }
}
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
