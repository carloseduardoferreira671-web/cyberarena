/* CyberArena · efeitos visuais: laser animado, faíscas, poeira, respingos, ondas de choque, números de dano. */
import * as THREE from '../lib/three.module.min.js';
const TAU = Math.PI * 2;

export class FX {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.beams = []; this.rings = []; this.flashes = [];
    // partículas (pool único de pontos)
    this.N = 2400; this.p = new Float32Array(this.N * 3); this.v = new Float32Array(this.N * 3); this.c = new Float32Array(this.N * 3); this.life = new Float32Array(this.N); this.max = new Float32Array(this.N); this.size = new Float32Array(this.N); this.grav = new Float32Array(this.N); this.drag = new Float32Array(this.N); this.k = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(this.c, 3)); this.aLife = new Float32Array(this.N); g.setAttribute('aLife', new THREE.BufferAttribute(this.aLife, 1)); this.aSize = new Float32Array(this.N); g.setAttribute('aSize', new THREE.BufferAttribute(this.aSize, 1));
    this.pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 500 } },
      vertexShader: 'attribute vec3 aCol;attribute float aLife;attribute float aSize;uniform float uScale;varying vec3 vC;varying float vL;void main(){vC=aCol;vL=aLife;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=aSize*uScale/max(.1,-mv.z)*(.4+.6*aLife);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying vec3 vC;varying float vL;void main(){if(vL<=0.)discard;vec2 d=gl_PointCoord-.5;float a=exp(-dot(d,d)*12.)*vL;gl_FragColor=vec4(vC*a*1.6,a);}' });
    this.points = new THREE.Points(g, this.pm); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
    // poeira (normal, não aditiva)
    this.dm = this.pm.clone(); this.dm.blending = THREE.NormalBlending; this.dm.fragmentShader = 'varying vec3 vC;varying float vL;void main(){if(vL<=0.)discard;vec2 d=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(d))*vL*.55;gl_FragColor=vec4(vC,a);}';
    this.D = 600; this.dp = new Float32Array(this.D * 3); this.dv = new Float32Array(this.D * 3); this.dc = new Float32Array(this.D * 3); this.dl = new Float32Array(this.D); this.dmx = new Float32Array(this.D); this.ds = new Float32Array(this.D); this.dk = 0; this.dal = new Float32Array(this.D); this.das = new Float32Array(this.D);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(this.dp, 3)); dg.setAttribute('aCol', new THREE.BufferAttribute(this.dc, 3)); dg.setAttribute('aLife', new THREE.BufferAttribute(this.dal, 1)); dg.setAttribute('aSize', new THREE.BufferAttribute(this.das, 1));
    this.dust = new THREE.Points(dg, this.dm); this.dust.frustumCulled = false; this.dust.renderOrder = 4; scene.add(this.dust);
    // geometria do feixe: núcleo + brilho
    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); this.beamGeo.translate(0, .5, 0); this.beamGeo.rotateX(Math.PI / 2);
    this.ringGeo = new THREE.RingGeometry(.85, 1, 64); this.ringGeo.rotateX(-Math.PI / 2);
    this.sphGeo = new THREE.SphereGeometry(1, 20, 14);
    this.dmgLayer = document.getElementById('dmg');
  }
  emit(x, y, z, n, o = {}) {
    const col = o.color || [1, .8, .4], sp = o.speed ?? 6, up = o.up ?? 2, life = o.life ?? .5, size = o.size ?? .18;
    for (let i = 0; i < n; i++) {
      const k = this.k = (this.k + 1) % this.N, a = Math.random() * TAU, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u), m = sp * (.3 + Math.random() * .7);
      let dx = Math.cos(a) * s, dy = u, dz = Math.sin(a) * s; if (o.dir) { dx = dx * (o.spread ?? .5) + o.dir[0]; dy = dy * (o.spread ?? .5) + o.dir[1]; dz = dz * (o.spread ?? .5) + o.dir[2]; }
      this.p[k * 3] = x; this.p[k * 3 + 1] = y; this.p[k * 3 + 2] = z; this.v[k * 3] = dx * m; this.v[k * 3 + 1] = dy * m + up; this.v[k * 3 + 2] = dz * m;
      this.c[k * 3] = col[0]; this.c[k * 3 + 1] = col[1]; this.c[k * 3 + 2] = col[2]; this.life[k] = this.max[k] = life * (.6 + Math.random() * .6); this.size[k] = size * (.6 + Math.random() * .8); this.grav[k] = o.grav ?? 12; this.drag[k] = o.drag ?? 2;
    }
  }
  puff(x, y, z, n, o = {}) {
    const col = o.color || [.62, .55, .45];
    for (let i = 0; i < n; i++) { const k = this.dk = (this.dk + 1) % this.D, a = Math.random() * TAU, m = (o.speed ?? 2.5) * (.4 + Math.random() * .6);
      this.dp[k * 3] = x + Math.cos(a) * (o.r || .2); this.dp[k * 3 + 1] = y + Math.random() * .2; this.dp[k * 3 + 2] = z + Math.sin(a) * (o.r || .2);
      this.dv[k * 3] = Math.cos(a) * m; this.dv[k * 3 + 1] = (o.up ?? .8) * (.5 + Math.random()); this.dv[k * 3 + 2] = Math.sin(a) * m;
      this.dc[k * 3] = col[0]; this.dc[k * 3 + 1] = col[1]; this.dc[k * 3 + 2] = col[2]; this.dl[k] = this.dmx[k] = (o.life ?? .9) * (.7 + Math.random() * .6); this.ds[k] = (o.size ?? .8) * (.6 + Math.random() * .8); }
  }
  /* laser: projétil com núcleo branco, brilho colorido e rastro */
  laser(from, dir, color, speed = 70, range = 28) {
    const c = new THREE.Color(color), core = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(this.beamGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
    const head = new THREE.Mesh(this.sphGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
    for (const m of [core, glow, head]) { m.renderOrder = 6; this.scene.add(m); }
    const b = { pos: from.clone(), start: from.clone(), dir: dir.clone().normalize(), speed, range, t: 0, core, glow, head, color: c, dead: false, hitAt: null };
    this.beams.push(b); this.flash(from, color, .5, .12); this.emit(from.x, from.y, from.z, 10, { color: [c.r * .5 + .5, c.g * .5 + .5, c.b * .5 + .5], speed: 4, up: 0, life: .2, size: .12, dir: [b.dir.x, b.dir.y, b.dir.z], spread: .6, grav: 0 });
    return b;
  }
  flash(p, color, size = 1, life = .15) { const m = new THREE.Mesh(this.sphGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.copy(p); m.scale.setScalar(size * .3); m.renderOrder = 7; this.scene.add(m); this.flashes.push({ m, t: 0, life, size }); }
  ring(x, y, z, color, r1 = 6, life = .5, w = .2) { const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.position.set(x, y + .08, z); m.renderOrder = 6; this.scene.add(m); this.rings.push({ m, t: 0, life, r1 }); }
  impact(p, color, big) {
    if (this.hook && this.hook.impact) this.hook.impact(p, big);
    const c = new THREE.Color(color); this.flash(p, color, big ? 2.2 : 1.2, .16);
    this.emit(p.x, p.y, p.z, big ? 40 : 22, { color: [c.r * .6 + .4, c.g * .6 + .4, c.b * .6 + .4], speed: big ? 10 : 7, up: 1.5, life: .45, size: .14 });
    this.emit(p.x, p.y, p.z, 8, { color: [1, 1, 1], speed: 3, up: .5, life: .2, size: .3, grav: 0 });
  }
  hitSpark(p) { this.emit(p.x, p.y, p.z, 14, { color: [1, .85, .5], speed: 6, up: 1, life: .3, size: .12 }); this.flash(p, 0xffe0a0, .9, .1); }
  shock(x, y, z, color) { if (this.hook && this.hook.shock) this.hook.shock(x, y, z); this.ring(x, y, z, color, 7, .6); this.ring(x, y, z, 0xffffff, 4.5, .35); this.puff(x, y, z, 40, { r: 1.2, speed: 6, up: .6, size: 1.3, life: 1.1 }); this.emit(x, y + .3, z, 60, { color: [.7, .5, 1], speed: 12, up: 4, life: .7, size: .18 }); }
  splash(x, y, z, k = 1) { this.emit(x, y + .05, z, (14 * k) | 0, { color: [.75, .9, 1], speed: 2.5 * k, up: 3.5 * k, life: .6, size: .13, grav: 14, drag: .6 }); this.puff(x, y, z, (5 * k) | 0, { color: [.85, .95, 1], r: .3, speed: 1.2, up: .4, size: .6, life: .5 }); }
  dustStep(x, y, z, k = 1) { if (this.hook && this.hook.dust) this.hook.dust(x, y, z, k); this.puff(x, y + .05, z, (3 * k) | 0, { r: .15, speed: .9 * k, up: .35, size: .45 * k, life: .7 }); }
  number(worldPos, text, color, big) {
    if (!this.dmgLayer) return; const v = worldPos.clone().project(this.camera); if (v.z > 1) return;
    // número de dano: tamanho cresce com o dano, cor e brilho por tipo, golpes grandes viram CRÍTICO com estouro de luz
    const n = (+text || 0) / ((window.CYBER_STATS && window.CYBER_STATS.NORM) || 1), el = document.createElement('div');   // limiares de CRÍTICO/DEVASTADOR na escala base el.className = 'dnum ' + (color || 'other') + (n >= 25 ? ' crit' : '') + (n >= 50 ? ' mega' : '');
    el.innerHTML = '<b>' + text + '</b>' + (n >= 25 ? '<i>' + (n >= 50 ? 'DEVASTADOR!' : 'CRÍTICO!') + '</i>' : '');
    el.style.setProperty('--s', Math.round(17 + Math.min(n, 80) * .55) + 'px'); el.style.setProperty('--dx', ((Math.random() - .5) * 70).toFixed(0) + 'px'); el.style.setProperty('--r', ((Math.random() - .5) * 16).toFixed(1) + 'deg');
    el.style.left = ((v.x * .5 + .5) * innerWidth + (Math.random() - .5) * 36) + 'px'; el.style.top = ((-v.y * .5 + .5) * innerHeight) + 'px'; this.dmgLayer.appendChild(el); setTimeout(() => el.remove(), n >= 25 ? 1300 : 1000);
  }
  update(dt, collide) {
    // projéteis
    for (const b of this.beams) {
      if (!b.dead) {
        const step = b.speed * dt, prev = b.pos.clone(); b.pos.addScaledVector(b.dir, step); b.t += dt;
        const hit = collide ? collide(prev, b.pos, b) : null;
        if (hit) { b.pos.copy(hit.point); b.dead = true; b.fade = 0; this.impact(hit.point, b.color, hit.actor); }
        else if (b.pos.distanceTo(b.start) > b.range) { b.dead = true; b.fade = 0; this.emit(b.pos.x, b.pos.y, b.pos.z, 6, { color: [b.color.r, b.color.g, b.color.b], speed: 2, life: .25, grav: 0 }); }
      } else b.fade += dt;
      const tail = Math.min(b.pos.distanceTo(b.start), b.dead ? Math.max(0, 3.2 - b.fade * 30) : 3.2), back = b.pos.clone().addScaledVector(b.dir, -tail);
      for (const [m, w] of [[b.core, .055], [b.glow, .2]]) { m.position.copy(back); m.lookAt(b.pos); m.scale.set(w * (1 + Math.sin(b.t * 60) * .15), w * (1 + Math.cos(b.t * 50) * .15), Math.max(.01, tail)); }
      b.head.position.copy(b.pos); b.head.scale.setScalar(b.dead ? .001 : .22 + Math.sin(b.t * 40) * .04);
      const a = b.dead ? Math.max(0, 1 - b.fade * 8) : 1; b.core.material.opacity = a; b.glow.material.opacity = .55 * a;
      if (!b.dead && Math.random() < .6) this.emit(b.pos.x, b.pos.y, b.pos.z, 1, { color: [b.color.r, b.color.g, b.color.b], speed: .6, up: 0, life: .25, size: .1, grav: 0 });
    }
    this.beams = this.beams.filter(b => { if (b.dead && b.fade > .2) { for (const m of [b.core, b.glow, b.head]) { m.removeFromParent(); m.material.dispose(); } return false; } return true; });
    for (const f of this.flashes) { f.t += dt; const k = f.t / f.life; f.m.scale.setScalar(f.size * (.3 + k * .9)); f.m.material.opacity = Math.max(0, 1 - k); }
    this.flashes = this.flashes.filter(f => { if (f.t > f.life) { f.m.removeFromParent(); f.m.material.dispose(); return false; } return true; });
    for (const r of this.rings) { r.t += dt; const k = r.t / r.life, e = 1 - (1 - k) ** 3; r.m.scale.setScalar(.3 + e * r.r1); r.m.material.opacity = Math.max(0, 1 - k) * .9; }
    this.rings = this.rings.filter(r => { if (r.t > r.life) { r.m.removeFromParent(); r.m.material.dispose(); return false; } return true; });
    // partículas
    const P = this.p, V = this.v;
    for (let i = 0; i < this.N; i++) { if (this.life[i] <= 0) { this.aLife[i] = 0; continue; } this.life[i] -= dt; const dr = Math.exp(-this.drag[i] * dt); V[i * 3] *= dr; V[i * 3 + 1] = V[i * 3 + 1] * dr - this.grav[i] * dt; V[i * 3 + 2] *= dr; P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt; this.aLife[i] = Math.max(0, this.life[i] / this.max[i]); this.aSize[i] = this.size[i]; }
    const g = this.points.geometry.attributes; g.position.needsUpdate = g.aLife.needsUpdate = g.aSize.needsUpdate = g.aCol.needsUpdate = true;
    for (let i = 0; i < this.D; i++) { if (this.dl[i] <= 0) { this.dal[i] = 0; continue; } this.dl[i] -= dt; const dr = Math.exp(-2.5 * dt); this.dv[i * 3] *= dr; this.dv[i * 3 + 1] *= dr; this.dv[i * 3 + 2] *= dr; this.dp[i * 3] += this.dv[i * 3] * dt; this.dp[i * 3 + 1] += this.dv[i * 3 + 1] * dt; this.dp[i * 3 + 2] += this.dv[i * 3 + 2] * dt; const k = this.dl[i] / this.dmx[i]; this.dal[i] = k; this.das[i] = this.ds[i] * (1.8 - k); }
    const d = this.dust.geometry.attributes; d.position.needsUpdate = d.aLife.needsUpdate = d.aSize.needsUpdate = d.aCol.needsUpdate = true;
  }
  setScale(s) { this.pm.uniforms.uScale.value = s; this.dm.uniforms.uScale.value = s; }
}
