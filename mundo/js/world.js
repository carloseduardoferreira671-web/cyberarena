/* CyberArena · Vale da Casona — adaptador do mapa novo.
   O mapa (terreno, vegetação, água, acampamentos, temas clássico/floresta/fogo) vem de ./w2/ (mesmo código do outro jogo,
   sem alterações de conteúdo). Este arquivo só traduz a API do mapa novo para a que o jogo já usava (World, U, WATER_Y),
   convertendo as unidades de "blocos" para metros. O mapa antigo ficou guardado em world_old.js. */
import * as THREE from '../lib/three.module.min.js';
import { buildWorld, loadCore, S } from './w2/world.js';

const C = await loadCore();                       // núcleo do mapa (terreno, rios, estradas), unidades em blocos
const WD = { HX: C.W.HX * S, HZ: C.W.HZ * S };
export const WATER_Y = C.W.WATER_Y * S;

/* "CW" em metros, no formato que o jogo espera */
export const CWm = {
  W: WD, SCALE: S,
  LAYOUT: { temple: { x: C.LAYOUT.temple.x * S, z: C.LAYOUT.temple.z * S } },
  PLAZA: { x: C.PLAZA.x * S, z: C.PLAZA.z * S, r: C.PLAZA.r * S },
  heightAt: (x, z) => C.heightAt(x / S, z / S) * S,
  riverInfo: (x, z) => { const r = C.riverInfo(x / S, z / S); return r ? { ...r, d: r.d * S, hw: r.hw * S } : r; },
  roadInfo: (x, z) => { const r = C.roadInfo(x / S, z / S); return r ? { ...r, d: r.d * S, hw: r.hw * S } : r; },
  slopeAt: (x, z) => C.slopeAt(x / S, z / S),
  forestDensity: (x, z) => C.forestDensity(x / S, z / S),
  mulberry32: C.mulberry32,
};
window.CWm = CWm;

/* uniformes globais usados pelo jogo (vento, empurrões, ondas, direção do sol) */
export const U = {
  uTime: { value: 0 }, uWind: { value: new THREE.Vector3(.8, .6, .6) },
  uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uRip: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)) },
  uSun: { value: new THREE.Vector3(-.45, .72, .35).normalize() },
};

export class World {
  constructor(renderer, scene, quality, opts = {}) {
    this.r = renderer; this.scene = scene; this.q = quality; this.opts = opts; this.time = 0; this.camFov = 1; this.cullHold = false;
    this.interior = null; this.portal = null; this.fires = []; this.bushes = []; this.minimap = null; this.mapScale = 1; this.theme = 'classic';
  }
  async build(onProgress) {
    const o = this.opts, w = await buildWorld(THREE, this.scene, this.r, { quality: o.quality || 'medium', ultra: !!o.ultra, theme: o.theme || 'classic', onProgress, ext: { sun: o.sun, hemi: o.hemi } });
    this.w = w; this.phys = w.phys; this.theme = w.theme; this.bounds = w.bounds; this.spawnPoints = w.spawnPoints; this.poi = w.poi;
    U.uSun.value = w.sunDir; U.uRip.value = w.ripples;
    this.fires = w.fires.map(f => [f.x, f.y, f.z]);
    this.bushes = (w.veg.bushes || []).map(b => [b.x, b.z, b.s]);
    /* cristal da casona = portal para o Mundo Cristal */
    this.portal = { x: w.TC.x, z: w.TC.z, y: w.topY, r: 4.2 };
    this.temple = w.temple;
    /* minimapa: o jogo espera uma imagem cobrindo exatamente o mundo (-HX..HX, -HZ..HZ) */
    const M = w.minimap, sc = M.canvas.width / (M.maxX - M.minX), cv = document.createElement('canvas'); cv.width = Math.round(WD.HX * 2 * sc); cv.height = Math.round(WD.HZ * 2 * sc);
    const g = cv.getContext('2d'); g.fillStyle = '#2d4a2a'; g.fillRect(0, 0, cv.width, cv.height);
    g.drawImage(M.canvas, (M.minX + WD.HX) * sc, (M.minZ + WD.HZ) * sc, M.canvas.width, M.canvas.height);
    this.scene.traverse(o => { if (o.isMesh && o.geometry.attributes.aMask) for (const m of [].concat(o.material)) m.userData.caPBR = true; });
    this.minimap = cv; this.mapScale = sc;
    return this;
  }
  heightAt(x, z) { return this.w.heightAt(x, z); }
  terrainAt(x, z) { return this.w.heightAt(x, z); }
  groundAt(x, z, y = 1e9, step = .75) { return this.phys.groundAt(x, z, y, null, step); }
  waterDepth(x, z) { return WATER_Y - this.w.heightAt(x, z); }
  /* obstáculos que bloqueiam um corpo com os pés em y */
  blockers(x, z, y, rad, step = .75) { const p = { x, y, z }, r = this.phys.resolve(p, rad, 2.9, step); return r.hit ? [[r.collider, 0]] : []; }
  /* empurra o círculo para fora dos obstáculos; devolve {o, top, nx, nz} do mais relevante */
  collide(p, rad, step) {
    const r = this.phys.resolve(p, rad, 2.9, step ?? .75);
    p.x = Math.max(-WD.HX + 1.5, Math.min(WD.HX - 1.5, p.x)); p.z = Math.max(-WD.HZ + 1.5, Math.min(WD.HZ - 1.5, p.z));
    if (!r.hit) return null; const s = r.collider; return { o: s, top: s.topFn ? s.topFn(p.x, p.z) : s.y1, nx: r.nx, nz: r.nz };
  }
  rayBlocked(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz) || 1e-6, t = this.phys.raycast({ x: ax, y: ay, z: az }, { x: dx / L, y: dy / L, z: dz / L }, L);
    if (!isFinite(t)) return null; const k = t / L; return { t: k, x: ax + dx * k, y: ay + dy * k, z: az + dz * k };
  }
  isFree(x, z, r = 1.2) {
    if (Math.abs(x) > WD.HX - 4 || Math.abs(z) > WD.HZ - 4) return false; const h = this.w.heightAt(x, z); if (h < WATER_Y + .1) return false;
    return !this.phys.resolve({ x, y: h, z }, r, 1.8).hit;
  }
  destroyAlong() { return []; }
  setGrassScale() { }
  randomSpot(rnd, opts = {}) {
    const cx = opts.cx ?? 0, cz = opts.cz ?? 0, R = opts.r ?? 1e9;
    for (let k = 0; k < 120; k++) {
      let x, z; if (opts.r) { const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R * (k > 60 ? 2 : 1); x = cx + Math.cos(a) * d; z = cz + Math.sin(a) * d; } else { x = (rnd() * 2 - 1) * (WD.HX - 10); z = (rnd() * 2 - 1) * (WD.HZ - 10); }
      if (Math.abs(x) > WD.HX - 8 || Math.abs(z) > WD.HZ - 8) continue; const h = this.w.heightAt(x, z);
      if (h < WATER_Y + .4 || h > 9 || CWm.slopeAt(x, z) > .45 || this.w.inPlatform(x, z, 3) || !this.isFree(x, z, 1.1)) continue; return [x, z];
    }
    const s = this.spawnPoints[Math.floor(rnd() * this.spawnPoints.length)]; return [s[0], s[1]];
  }
  update(dt, camPos, focus) {
    this.time += dt; U.uTime.value = this.time; const w = this.w; if (!w) return;
    const p = U.uPush.value; w.setInteractors(p.filter(v => v.y > -900).map(v => ({ x: v.x, y: v.y, z: v.z, r: v.w })));
    if (focus) w.setFocus(focus.x, focus.z, focus.y); else if (camPos) w.setFocus(camPos.x, camPos.z, camPos.y);
    w.update(dt, this.time, camPos ? { position: camPos } : null);
    U.uWind.value.copy(w.U.uWind.value);
  }
}
