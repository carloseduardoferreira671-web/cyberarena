/* CyberArena · herói "Cyber" procedural (three.js).
   Hierarquia de juntas + animação procedural com molas críticas (sem estalos), ciclo de passada contínuo,
   camadas de ação com quadros-chave suavizados, cachecol e cabos com física verlet que reagem ao vento. */
import { stepAtlasSoft } from './atlasglb.js';
import { stepRigged } from './riggedglb.js';
import * as THREE from '../lib/three.module.min.js';
import { applyPBRByKey, setBodyState } from './pbr.js';
import { LimbTrail } from './combatfx.js';

export const SKINS = {
  cyber:  { name: 'Cyber',        primary: 0x2a8cff, secondary: 0x1a1f2b, accent: 0x38f2ff, visor: 0x5ff8ff, scarf: 0xff3d6a },
  rubi:   { name: 'Rubi',         primary: 0xd8233f, secondary: 0x22161a, accent: 0xff7a3d, visor: 0xffb03a, scarf: 0xffd54a },
  jade:   { name: 'Jade',         primary: 0x1fbf72, secondary: 0x14211b, accent: 0x9dff4f, visor: 0xc6ff6a, scarf: 0xf4f4f4 },
  ouro:   { name: 'Ouro Real',    primary: 0xe0a92a, secondary: 0x241c12, accent: 0xfff07a, visor: 0xfff4b0, scarf: 0x7b2bff },
  nebula: { name: 'Nébula',       primary: 0x8b3dff, secondary: 0x1b1530, accent: 0xff5cf0, visor: 0xff9bf7, scarf: 0x37e0ff },
  gelo:   { name: 'Gelo',         primary: 0xdbeeff, secondary: 0x2b3a4e, accent: 0x6fd8ff, visor: 0x9ef2ff, scarf: 0x2f6bff },
  sombra: { name: 'Sombra',       primary: 0x2e3138, secondary: 0x0c0d10, accent: 0xff2d55, visor: 0xff3355, scarf: 0x2e3138 },
  solar:  { name: 'Solar',        primary: 0xff7a1a, secondary: 0x2a1a10, accent: 0xffe14a, visor: 0xfff07a, scarf: 0xffffff },
  cosmo:  { name: 'Cósmica',      primary: 0x2a1d66, secondary: 0x0a0822, accent: 0x8ff6ff, visor: 0xfff0ff, scarf: 0xb56bff, cosmic: true },
};
/* ---------- reflexos metálicos: ambiente HDR gerado na hora (estúdio com softboxes), um por renderizador ---------- */
let ENV = null; const ENVS = new WeakMap();
export function useHeroEnv(renderer) {
  if (!renderer) { ENV = null; return null; }
  let t = ENVS.get(renderer);
  if (!t) {
    const sc = new THREE.Scene(), pm = new THREE.PMREMGenerator(renderer);
    const g = new THREE.SphereGeometry(10, 32, 16), col = [], P = g.attributes.position, c = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const y = P.getY(i) / 10; c.setRGB(lerp(.16, .55, ss(y * .5 + .5)), lerp(.14, .66, ss(y * .5 + .5)), lerp(.16, .85, ss(y * .5 + .5))); if (y < -.05) c.setRGB(.12, .11, .1); col.push(c.r, c.g, c.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const box = (x, y, z, w, h, k, cc) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(cc).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); sc.add(m); };
    box(4, 6, 5, 5, 3, 6, 0xfff2e0); box(-6, 3, -4, 2, 6, 4, 0x6fe8ff); box(6, 2, -5, 2, 5, 2.5, 0xff7ab0); box(0, 9, 0, 6, 6, 2.2, 0xffffff);
    t = pm.fromScene(sc, .03).texture; pm.dispose(); ENVS.set(renderer, t);
  }
  ENV = t; return t;
}
export const heroEnv = () => ENV;
/* ---------- skin cósmica: nebulosa viva e estrelas que piscam presas ao corpo (funciona em qualquer material padrão) ---------- */
export const COSMIC_GLSL = `
float cH(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float cN(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(cH(i),cH(i+vec3(1,0,0)),f.x),mix(cH(i+vec3(0,1,0)),cH(i+vec3(1,1,0)),f.x),f.y),mix(mix(cH(i+vec3(0,0,1)),cH(i+vec3(1,0,1)),f.x),mix(cH(i+vec3(0,1,1)),cH(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 cosmic(vec3 p,float t,float k){float n=cN(p*2.2+vec3(0.,t*.15,0.))*.6+cN(p*5.3-vec3(t*.1))*.4;
 vec3 c=mix(vec3(.25,.05,.6),vec3(.05,.55,1.),smoothstep(.35,.75,n));c=mix(c,vec3(1.,.35,.85),smoothstep(.7,.9,cN(p*3.1+7.)));
 vec3 g=floor(p*38.);float s=step(.965,cH(g))*(.45+.55*sin(t*4.+cH(g+3.)*60.));vec3 g2=floor(p*90.);float s2=step(.985,cH(g2))*(.5+.5*sin(t*6.+cH(g2)*30.));
 return c*pow(n,1.6)*k*1.4+vec3(1.,.97,.92)*(s*2.6+s2*1.6)*k;}`;
const COSMIC_T = { value: 0 };
export function cosmicify(mat, scale = 1, k = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = sh => { if (prev) prev(sh); sh.uniforms.uCosT = COSMIC_T;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCosP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCosP=position*' + scale.toFixed(3) + ';');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uCosT;varying vec3 vCosP;' + COSMIC_GLSL)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=cosmic(vCosP,uCosT,' + k.toFixed(2) + ');'); };
  const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => ''; mat.customProgramCacheKey = () => pk() + 'cosmic' + scale + k;
  return mat;
}
export const tickCosmic = t => { COSMIC_T.value = t; };
export const SKIN_IDS = Object.keys(SKINS);
/* dois personagens jogáveis: NEXUS (agente ciborgue procedural) e CYBER (o modelo original, aprimorado) */
export const CHARS = {
  nexus: { name: 'NEXUS', title: 'Agente ciborgue', desc: 'Agente ciborgue 3D com placas anatômicas, visor brilhante, cachecol e cabos com física de vento. Dedos articulados.' },
  cyber: { name: 'CYBER', title: 'O Cyber original', desc: 'Modelo original em 3D, anatomia articulada, materiais cel-shaded, luzes de energia e cabos com física de vento.' },
  atlas: { name: 'ATLAS', title: 'O Eco Violeta', desc: 'Combatente 3D de dreadlocks longos, núcleo violeta, marca dourada e anatomia atlética. Especialista em contra-impacto, ondas de pressão e rupturas sísmicas.' },
};
export const CHAR_IDS = Object.keys(CHARS);

/* CyberArena · camada de materiais PBR (antes: cel-shading). Veja pbr.js. */
export function applyCinematicToon(material, options = {}) {
  // Nome mantido por compatibilidade: agora aplica a camada PBR (micro-detalhe, SSS, AO, suor/sangue/sujeira) em vez de cel-shading.
  return applyPBRByKey(material, options);
}
export function applyCinematicToonScene(root) {
  if (!root || !root.traverse) return 0;
  let count = 0;
  root.traverse(object => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material || material.transparent || material.userData?.caPBR) continue;
      if (material.isMeshStandardMaterial || material.isMeshPhysicalMaterial) { applyPBRByKey(material, { key: 'world' }); count++; }
    }
  });
  return count;
}

const PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const ss = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const HERO_CAM = new THREE.Vector3();   // o jogo copia a posição da câmera aqui (rastros de membros)
const RAGK = { head: [105, 6.5], neck: [120, 8], chest: [95, 8], spine: [110, 9], hips: [130, 10], uaL: [85, 6], uaR: [85, 6], faL: [70, 4.5], faR: [70, 4.5], thL: [130, 10], thR: [130, 10], shnL: [120, 9], shnR: [120, 9] };
const gauss = x => Math.exp(-x * x);
const s5 = t => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

/* ---------- geometrias compartilhadas ---------- */
const GEO = new Map();
const geo = (k, f) => { let g = GEO.get(k); if (!g) { g = f(); GEO.set(k, g); } return g; };
const cap = (r, l, rs = 18) => geo('cap' + r + ',' + l + ',' + rs, () => new THREE.CapsuleGeometry(r, l, 8, rs));
const sph = (r, w = 28, h = 20) => geo('sph' + r + w + h, () => new THREE.SphereGeometry(r, w, h));
const cyl = (a, b, h, s = 24) => geo('cyl' + a + b + h + s, () => new THREE.CylinderGeometry(a, b, h, s, 1));
const tor = (r, t, s = 32) => geo('tor' + r + t, () => new THREE.TorusGeometry(r, t, 8, s));
function lathe(k, pts, seg = 32) { return geo('lathe' + k, () => { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg); g.computeVertexNormals(); return g; }); }
function visorGeo() {
  return geo('visor', () => { const g = new THREE.SphereGeometry(0.283, 40, 16, -PI * 0.36 + PI / 2, PI * 0.72, PI * 0.36, PI * 0.2); return g; });
}

/* ---------- materiais (por instância, para brilho/flash independentes) ---------- */
function makeMats(skin) {
  const S = SKINS[skin] || SKINS.cyber;
  const armor = new THREE.MeshPhysicalMaterial({ color: S.primary, metalness: .78, roughness: .34, clearcoat: .7, clearcoatRoughness: .22 });
  const suit = new THREE.MeshPhysicalMaterial({ color: S.secondary, metalness: .02, roughness: .86, sheen: 1, sheenRoughness: .55, sheenColor: new THREE.Color(S.accent).multiplyScalar(.45) });
  const trim = new THREE.MeshStandardMaterial({ color: 0xa9b4c4, metalness: .95, roughness: .3 });
  const glow = new THREE.MeshStandardMaterial({ color: S.accent, emissive: S.accent, emissiveIntensity: 2.2, roughness: .4 });
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x050a12, emissive: S.visor, emissiveIntensity: .9, metalness: .2, roughness: .08, clearcoat: 1 });
  const scarf = new THREE.MeshStandardMaterial({ color: S.scarf, roughness: .85, side: THREE.DoubleSide });
  const cable = new THREE.MeshStandardMaterial({ color: S.secondary, emissive: S.accent, emissiveIntensity: .5, roughness: .5, side: THREE.DoubleSide });
  if (ENV) for (const m of [armor, suit, trim, visor]) { m.envMap = ENV; m.envMapIntensity = m === suit ? .22 : .55; }
  for (const m of [armor, suit, trim, visor, scarf, cable]) applyCinematicToon(m, { outline: true, ink: .7, key: 'hero' });
  applyCinematicToon(glow, { outline: false, key: 'hero-emission' });
  if (S.cosmic) { cosmicify(armor, 1, .75); cosmicify(suit, 1.3, .6); cosmicify(scarf, 2, .9); armor.metalness = .7; armor.roughness = .18; scarf.emissive = new THREE.Color(S.scarf); scarf.emissiveIntensity = .35; }
  return { armor, suit, trim, glow, visor, scarf, cable, S };
}

/* ---------- molas críticas (forma fechada, estáveis com qualquer dt) ---------- */
function spring(st, target, w, dt) {
  const y = st.x - target, e = Math.exp(-w * dt), t = (st.v + w * y) * dt;
  st.x = target + (y + t) * e; st.v = (st.v - w * t) * e; return st.x;
}

/* ---------- mola com inércia (passa do ponto e volta): dá peso ao corpo ---------- */
function wobble(st, target, k, c, dt) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
  for (let i = 0; i < n; i++) { st.v += (k * (target - st.x) - c * st.v) * h; st.x += st.v * h; }
  return st.x;
}

/* ---------- corrente verlet (cachecol / cabos) ---------- */
class Chain {
  constructor(n, seg, width, mat, taper) {
    this.n = n; this.seg = seg; this.width = width; this.taper = taper;
    this.p = []; this.o = []; for (let i = 0; i < n; i++) { this.p.push(new THREE.Vector3()); this.o.push(new THREE.Vector3()); }
    const g = new THREE.BufferGeometry(); this.pos = new Float32Array(n * 2 * 3); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    const uv = new Float32Array(n * 4); for (let i = 0; i < n; i++) { uv[i * 4] = 0; uv[i * 4 + 1] = i / (n - 1); uv[i * 4 + 2] = 1; uv[i * 4 + 3] = i / (n - 1); } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo = g; this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.init = false;
  }
  reset(a) { for (let i = 0; i < this.n; i++) { this.p[i].set(a.x, a.y - i * this.seg, a.z); this.o[i].copy(this.p[i]); } this.init = true; }
  step(dt, anchor, force, colliders, side) {
    if (!this.init || anchor.distanceToSquared(this.p[0]) > 9) this.reset(anchor);
    const dt2 = Math.min(dt, 1 / 30) ** 2, damp = .965;
    this.p[0].copy(anchor); this.o[0].copy(anchor);
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], o = this.o[i], vx = (p.x - o.x) * damp, vy = (p.y - o.y) * damp, vz = (p.z - o.z) * damp; o.copy(p);
      const k = i / this.n; p.x += vx + force.x * dt2 * (0.6 + k); p.y += vy + force.y * dt2; p.z += vz + force.z * dt2 * (0.6 + k);
    }
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.p[i - 1], b = this.p[i], dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, d = Math.hypot(dx, dy, dz) || 1e-6, f = (d - this.seg) / d;
        if (i === 1) { b.x -= dx * f; b.y -= dy * f; b.z -= dz * f; } else { a.x += dx * f * .5; a.y += dy * f * .5; a.z += dz * f * .5; b.x -= dx * f * .5; b.y -= dy * f * .5; b.z -= dz * f * .5; }
      }
      for (const c of colliders) for (let i = 1; i < this.n; i++) { const p = this.p[i], dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z, d = Math.hypot(dx, dy, dz); if (d < c.r && d > 1e-5) { const f = c.r / d; p.x = c.x + dx * f; p.y = c.y + dy * f; p.z = c.z + dz * f; } }
      for (let i = 1; i < this.n; i++) if (this.p[i].y < this.floor + .03) this.p[i].y = this.floor + .03;
    }
    const P = this.pos;
    for (let i = 0; i < this.n; i++) {
      const w = this.width * (this.taper ? lerp(1, .35, i / (this.n - 1)) : 1) * .5, p = this.p[i];
      P[i * 6] = p.x - side.x * w; P[i * 6 + 1] = p.y - side.y * w; P[i * 6 + 2] = p.z - side.z * w;
      P[i * 6 + 3] = p.x + side.x * w; P[i * 6 + 4] = p.y + side.y * w; P[i * 6 + 5] = p.z + side.z * w;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.computeVertexNormals(); this.geo.computeBoundingSphere();
  }
}

/* ---------- quadros-chave das ações ---------- */
// Convenções: o personagem olha para +Z; o lado direito dele é -X. rot.x negativo = membro para frente.
// Braço direito para fora = rot.z negativo; braço esquerdo para fora = rot.z positivo.
// Pose neutra compartilhada: braços relaxados ao lado do corpo, sem guarda de combate permanente.
const GUARD = { uaR: [0, 0, -.08], faR: [0, 0, 0], uaL: [0, 0, .08], faL: [0, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] };
const A = {
  punch0: { dur: .42, impact: .15, lunge: .3, keys: [
    { t: 0, ...GUARD },
    { t: .07, uaL: [-.4, 0, .35], faL: [-2.1, 0, 0], chest: [.08, .22, 0], spine: [0, .1, 0] },
    { t: .15, uaL: [-1.62, -.2, -.1], faL: [-.05, 0, 0], hdL: [0, -.3, 0], chest: [.12, -.42, 0], spine: [.06, -.2, 0], uaR: [-.4, 0, -.3], faR: [-2, 0, 0], head: [0, .2, 0] },
    { t: .26, uaL: [-1.3, -.1, .05], faL: [-.5, 0, 0], chest: [.1, -.25, 0] },
    { t: .42, ...GUARD }] },
  punch1: { dur: .42, impact: .15, lunge: .35, keys: [
    { t: 0, ...GUARD },
    { t: .07, uaR: [-.35, 0, -.4], faR: [-2.15, 0, 0], chest: [.08, -.3, 0], spine: [0, -.12, 0] },
    { t: .15, uaR: [-1.62, .2, .1], faR: [-.05, 0, 0], hdR: [0, .3, 0], chest: [.15, .5, 0], spine: [.08, .25, 0], uaL: [-.5, 0, .3], faL: [-2, 0, 0], head: [0, -.25, 0] },
    { t: .27, uaR: [-1.3, .1, 0], faR: [-.5, 0, 0], chest: [.1, .3, 0] },
    { t: .42, ...GUARD }] },
  punch2: { dur: .62, impact: .3, lunge: .6, spin: TAU, keys: [
    { t: 0, ...GUARD, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] },
    { t: .12, uaR: [-.2, 0, -1.2], faR: [-.6, 0, 0], chest: [.25, .5, 0], spine: [.15, .2, 0], thL: [-.5, 0, 0], shnL: [.9, 0, 0], thR: [-.2, 0, 0], shnR: [.6, 0, 0], hips: [0, 0, 0] },
    { t: .3, uaR: [-1.55, 0, -1.35], faR: [-.15, 0, 0], hdR: [0, .4, 0], chest: [-.1, -.5, 0], spine: [-.05, -.25, 0], thL: [-.1, 0, 0], shnL: [.2, 0, 0], thR: [.15, 0, 0], shnR: [.3, 0, 0], uaL: [-.2, 0, .9], faL: [-.9, 0, 0] },
    { t: .44, uaR: [-1.2, 0, -.9], faR: [-.4, 0, 0], chest: [.05, -.3, 0] },
    { t: .62, ...GUARD, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] }] },
  /* Cotovelada: recolhe o antebraço, projeta o cotovelo com rotação do tronco e freia no contato. */
  elbow: { dur: .58, impact: .25, lunge: .22, keys: [
    { t: 0, ...GUARD, chest: [0, 0, 0], spine: [0, 0, 0] },
    { t: .09, uaR: [-.48, 0, -1.12], faR: [-2.18, 0, 0], hdR: [.08, 0, 0], chest: [.08, -.38, 0], spine: [.04, -.18, 0], head: [0, .12, 0], uaL: [-.55, 0, .28], faL: [-1.8, 0, 0] },
    { t: .25, uaR: [-1.32, -.12, -.92], faR: [-2.42, 0, 0], hdR: [.12, 0, 0], chest: [.18, .72, 0], spine: [.08, .34, 0], head: [-.08, -.28, 0], uaL: [-.72, 0, .34], faL: [-1.65, 0, 0] },
    { t: .36, uaR: [-1.02, -.08, -.72], faR: [-2.05, 0, 0], chest: [.1, .38, 0], spine: [.04, .18, 0], head: [0, -.12, 0] },
    { t: .58, ...GUARD, chest: [0, 0, 0], spine: [0, 0, 0] }
  ] },
  kick: { dur: .68, impact: .28, lunge: .5, keys: [
    { t: 0, ...GUARD, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] },
    { t: .12, uaR: [-.2, 0, -.45], uaL: [-.25, 0, .45], chest: [.25, 0, 0], spine: [.12, 0, 0], thR: [-1.7, 0, -.18], shnR: [1.9, 0, 0], ftR: [-.3, 0, 0], thL: [-.25, 0, .1], shnL: [.4, 0, 0] },
    { t: .28, uaR: [-.35, 0, -.65], uaL: [-.35, 0, .65], chest: [.35, 0, 0], spine: [.18, 0, 0], thR: [-1.95, 0, -.12], shnR: [.18, 0, 0], ftR: [.15, 0, 0], thL: [-.55, 0, .12], shnL: [.85, 0, 0] },
    { t: .42, uaR: [-.8, 0, -.5], uaL: [-.8, 0, .5], chest: [-.28, 0, 0], spine: [-.12, 0, 0], thR: [-.8, 0, -.08], shnR: [.5, 0, 0], ftR: [0, 0, 0], thL: [-.15, 0, .1], shnL: [.25, 0, 0] },
    { t: .68, ...GUARD, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] }] },
  laser: { dur: .52, impact: .15, keys: [
    { t: 0, uaR: [-.6, 0, -.2], faR: [-1.4, 0, 0], hdR: [0, 0, 0], uaL: [-.4, 0, .2], faL: [-1.2, 0, 0], chest: [0, 0, 0] },
    { t: .1, uaR: [-1.5, .12, .12], faR: [-.12, 0, 0], hdR: [.12, 0, 0], uaL: [-1.05, -.55, -.35], faL: [-1.05, 0, 0], chest: [.02, .28, 0], spine: [0, .12, 0], head: [0, -.22, 0] },
    { t: .15, uaR: [-1.57, .14, .14], faR: [0, 0, 0], hdR: [0, 0, 0], uaL: [-1.05, -.55, -.35], faL: [-1.05, 0, 0], chest: [.02, .3, 0], spine: [0, .12, 0], head: [0, -.24, 0] },
    { t: .22, uaR: [-1.85, .1, .1], faR: [-.35, 0, 0], chest: [-.12, .26, 0], spine: [-.06, .1, 0], head: [-.05, -.2, 0] },
    { t: .36, uaR: [-1.5, .1, .1], faR: [-.15, 0, 0], chest: [0, .22, 0] },
    { t: .52, uaR: [-.55, 0, -.2], faR: [-1.3, 0, 0], uaL: [-.35, 0, .2], faL: [-1.1, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0] }] },
  super: { dur: 1.1, impact: .56, rootY: [[0, 0], [.18, -.35], [.38, .9], [.56, -.55], [.8, -.45], [1.1, 0]], keys: [
    { t: 0, uaR: [-.3, 0, -.2], uaL: [-.3, 0, .2], faR: [-.5, 0, 0], faL: [-.5, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], head: [0, 0, 0] },
    { t: .18, uaR: [.4, 0, -.5], uaL: [.4, 0, .5], faR: [-.6, 0, 0], faL: [-.6, 0, 0], chest: [.45, 0, 0], spine: [.25, 0, 0], thL: [-1.1, 0, .1], thR: [-1.1, 0, -.1], shnL: [1.8, 0, 0], shnR: [1.8, 0, 0], ftL: [-.6, 0, 0], ftR: [-.6, 0, 0], head: [-.3, 0, 0] },
    { t: .38, uaR: [-2.9, 0, -.25], uaL: [-2.9, 0, .25], faR: [-.4, 0, 0], faL: [-.4, 0, 0], chest: [-.35, 0, 0], spine: [-.15, 0, 0], thL: [-.9, 0, .05], thR: [-.4, 0, -.05], shnL: [1.4, 0, 0], shnR: [.9, 0, 0], ftL: [.3, 0, 0], ftR: [.3, 0, 0], head: [.2, 0, 0] },
    { t: .56, uaR: [-1.2, 0, .15], uaL: [-1.2, 0, -.15], faR: [-.1, 0, 0], faL: [-.1, 0, 0], chest: [.75, 0, 0], spine: [.35, 0, 0], thL: [-1.5, 0, .25], thR: [.2, 0, -.2], shnL: [1.6, 0, 0], shnR: [1.4, 0, 0], ftL: [-.1, 0, 0], ftR: [.6, 0, 0], head: [-.5, 0, 0] },
    { t: .82, uaR: [-1.1, 0, .1], uaL: [-1.1, 0, -.1], faR: [-.2, 0, 0], faL: [-.2, 0, 0], chest: [.6, 0, 0], spine: [.3, 0, 0], thL: [-1.4, 0, .25], thR: [.2, 0, -.2], shnL: [1.5, 0, 0], shnR: [1.3, 0, 0], ftL: [-.1, 0, 0], ftR: [.5, 0, 0], head: [-.4, 0, 0] },
    { t: 1.1, uaR: [-.2, 0, -.15], uaL: [-.2, 0, .15], faR: [-.4, 0, 0], faL: [-.4, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], head: [0, 0, 0] }] },
  /* NEXUS · SINGULARIDADE: ergue a mão com o mini buraco negro, recua o corpo e arremessa */
  singularity: { dur: 1.0, impact: .58, keys: [
    { t: 0, ...GUARD, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], spine: [0, 0, 0], hdR: [0, 0, 0] },
    { t: .16, uaR: [-2.6, 0, -.45], faR: [-.7, 0, 0], hdR: [.4, 0, 0], uaL: [-.9, 0, .45], faL: [-1.2, 0, 0], chest: [-.12, .35, 0], spine: [-.05, .15, 0], head: [-.12, -.1, 0] },
    { t: .45, uaR: [-3.0, .2, -.15], faR: [-1.35, 0, 0], hdR: [.6, 0, 0], uaL: [-1.2, 0, .2], faL: [-.4, 0, 0], chest: [-.28, .6, 0], spine: [-.12, .3, 0], head: [-.05, -.3, 0], thL: [-.45, 0, 0], shnL: [.55, 0, 0], thR: [.18, 0, 0], shnR: [.2, 0, 0] },
    { t: .58, uaR: [-1.45, -.2, .15], faR: [-.08, 0, 0], hdR: [-.3, 0, 0], uaL: [-.35, 0, .75], faL: [-.6, 0, 0], chest: [.32, -.5, 0], spine: [.16, -.28, 0], head: [0, .25, 0], thL: [-.75, 0, 0], shnL: [.6, 0, 0], thR: [.32, 0, 0], shnR: [.35, 0, 0] },
    { t: .76, uaR: [-.95, -.3, .3], faR: [-.3, 0, 0], chest: [.36, -.55, 0], spine: [.18, -.3, 0] },
    { t: 1.0, ...GUARD, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], spine: [0, 0, 0], hdR: [0, 0, 0] }] },
  /* NEXUS · ABISMO ESTELAR (abertura): mão esquerda no olho, mão direita aberta apontando o alvo */
  abyssCast: { dur: 1.1, impact: .85, keys: [
    { t: 0, ...GUARD, spine: [0, 0, 0], hdR: [0, 0, 0], hdL: [0, 0, 0] },
    { t: .3, uaL: [-1.95, -.3, .55], faL: [-2.05, 0, 0], hdL: [.3, 0, 0], uaR: [-1.5, 0, -.12], faR: [-.12, 0, 0], hdR: [-.7, 0, 0], chest: [.05, .28, 0], spine: [0, .1, 0], head: [-.12, -.18, 0] },
    { t: .85, uaL: [-2.0, -.3, .6], faL: [-2.1, 0, 0], hdL: [.3, 0, 0], uaR: [-1.7, .1, .05], faR: [0, 0, 0], hdR: [-.9, 0, 0], chest: [.16, .38, 0], spine: [.06, .14, 0], head: [-.05, -.22, 0] },
    { t: 1.1, uaL: [-1.9, -.3, .55], faL: [-2.0, 0, 0], hdL: [.3, 0, 0], uaR: [-1.6, .1, 0], faR: [0, 0, 0], hdR: [-.8, 0, 0], chest: [.1, .3, 0], spine: [.04, .1, 0], head: [-.08, -.2, 0] }] },
  /* NEXUS · dentro da dimensão: flutua e comanda planetas e meteoros com os braços */
  channel: { dur: 4.6, rootY: [[0, 0], [.5, .6], [4.2, .7], [4.6, 0]], keys: [
    { t: 0, uaR: [-.4, 0, -1.3], faR: [-.3, 0, 0], uaL: [-.4, 0, 1.3], faL: [-.3, 0, 0], chest: [-.15, 0, 0], spine: [-.05, 0, 0], head: [-.15, 0, 0], thL: [-.35, 0, .1], shnL: [.7, 0, 0], thR: [-.1, 0, -.1], shnR: [.35, 0, 0], ftL: [.45, 0, 0], ftR: [.45, 0, 0] },
    { t: 1.0, uaR: [-2.8, 0, -.4], faR: [-.2, 0, 0], chest: [-.25, .2, 0], head: [-.3, .1, 0] },
    { t: 1.6, uaR: [-1.4, 0, -.2], faR: [0, 0, 0], chest: [.2, -.25, 0], head: [0, .1, 0] },
    { t: 2.4, uaL: [-2.8, 0, .4], faL: [-.2, 0, 0], uaR: [-.4, 0, -1.2], faR: [-.3, 0, 0], chest: [-.25, -.2, 0], head: [-.3, -.1, 0] },
    { t: 3.0, uaL: [-1.4, 0, .2], faL: [0, 0, 0], chest: [.2, .25, 0], head: [0, -.1, 0] },
    { t: 3.8, uaR: [-3.0, 0, -.3], uaL: [-3.0, 0, .3], faR: [-.2, 0, 0], faL: [-.2, 0, 0], chest: [-.38, 0, 0], spine: [-.15, 0, 0], head: [-.35, 0, 0] },
    { t: 4.3, uaR: [-1.5, 0, 0], uaL: [-1.5, 0, 0], faR: [0, 0, 0], faL: [0, 0, 0], chest: [.45, 0, 0], spine: [.2, 0, 0], head: [.1, 0, 0] },
    { t: 4.6, ...GUARD, spine: [0, 0, 0], thL: [0, 0, 0], shnL: [0, 0, 0], thR: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] }] },
  /* NEXUS · pose do lobby: segura o mini buraco negro na mão erguida, gira o pulso e ameaça arremessar */
  orbPose: { dur: 5.0, keys: [
    { t: 0, ...GUARD, uaR: [-.2, 0, -.2], faR: [-.3, 0, 0], hdR: [0, 0, 0], spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] },
    { t: .5, uaR: [-.5, 0, -.85], faR: [-1.95, 0, .2], hdR: [-.35, 0, 0], uaL: [-.25, 0, .25], faL: [-.4, 0, 0], chest: [-.05, .18, 0], head: [.1, -.25, 0] },
    { t: 1.6, uaR: [-.55, 0, -.95], faR: [-2.05, 0, .35], hdR: [-.45, .4, 0], chest: [-.06, .22, 0], head: [.12, -.3, 0] },
    { t: 2.6, uaR: [-.45, 0, -.8], faR: [-1.9, 0, .1], hdR: [-.3, -.3, 0], chest: [-.04, .15, 0], head: [.08, -.2, 0] },
    { t: 3.5, uaR: [-2.6, .1, -.35], faR: [-1.1, 0, 0], hdR: [.3, 0, 0], uaL: [-1.0, 0, .45], faL: [-1.3, 0, 0], chest: [-.22, .5, 0], spine: [-.08, .22, 0], head: [-.05, .3, 0], thL: [-.35, 0, 0], shnL: [.45, 0, 0], thR: [.12, 0, 0] },
    { t: 4.3, uaR: [-2.7, .15, -.3], faR: [-1.25, 0, 0], chest: [-.25, .55, 0], spine: [-.1, .25, 0], head: [-.05, .35, 0] },
    { t: 5.0, ...GUARD, uaR: [-.2, 0, -.2], faR: [-.3, 0, 0], hdR: [0, 0, 0], spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] }] },
  /* NEXUS · lobby: segura o mini buraco negro parado na palma (só respira) */
  orbHold: { dur: 3600, keys: [
    { t: 0, ...GUARD, uaR: [-.2, 0, -.2], faR: [-.3, 0, 0], hdR: [0, 0, 0], uaL: [-.15, 0, .18], faL: [-.25, 0, 0] },
    { t: .7, uaR: [-.62, -.25, -.42], faR: [-1.55, .35, 0], hdR: [.25, 0, .15], uaL: [-.12, 0, .2], faL: [-.3, 0, 0], head: [.18, -.32, 0], chest: [0, .12, 0] },
    { t: 3600, uaR: [-.62, -.25, -.42], faR: [-1.55, .35, 0], hdR: [.25, 0, .15], uaL: [-.12, 0, .2], faL: [-.3, 0, 0], head: [.18, -.32, 0], chest: [0, .12, 0] }] },
  /* CYBER · EXTINÇÃO SOLAR: corrida espacial de 3 s, captura por trás, arremesso e FLASH Ω reforçado */
  solar: { dur: 6.2, impact: 4.05, keys: [
    { t: 0, ...GUARD, spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] },
    { t: .18, uaR: [.65, 0, -.35], uaL: [-1.2, 0, .35], faR: [-.5, 0, 0], faL: [-1.1, 0, 0], chest: [.72, 0, 0], spine: [.3, 0, 0], head: [-.48, 0, 0], thL: [-1.2, 0, .12], thR: [.25, 0, -.12], shnL: [1.7, 0, 0], shnR: [1.2, 0, 0], ftL: [-.4, 0, 0], ftR: [.3, 0, 0] },
    { t: .55, uaR: [1.0, 0, -.35], uaL: [-1.0, 0, .35], faR: [-.25, 0, 0], faL: [-.9, 0, 0], chest: [.82, 0, 0], spine: [.38, 0, 0], head: [-.62, 0, 0], thL: [-.45, 0, .1], thR: [-1.25, 0, -.1], shnL: [1.1, 0, 0], shnR: [1.8, 0, 0], ftL: [.2, 0, 0], ftR: [-.4, 0, 0] },
    { t: 1.05, uaR: [.65, 0, -.35], uaL: [-1.2, 0, .35], faR: [-.5, 0, 0], faL: [-1.1, 0, 0], chest: [.72, 0, 0], spine: [.3, 0, 0], head: [-.48, 0, 0], thL: [-1.2, 0, .12], thR: [.25, 0, -.12], shnL: [1.7, 0, 0], shnR: [1.2, 0, 0], ftL: [-.4, 0, 0], ftR: [.3, 0, 0] },
    { t: 1.55, uaR: [1.0, 0, -.35], uaL: [-1.0, 0, .35], faR: [-.25, 0, 0], faL: [-.9, 0, 0], chest: [.82, 0, 0], spine: [.38, 0, 0], head: [-.62, 0, 0], thL: [-.45, 0, .1], thR: [-1.25, 0, -.1], shnL: [1.1, 0, 0], shnR: [1.8, 0, 0], ftL: [.2, 0, 0], ftR: [-.4, 0, 0] },
    { t: 2.15, uaR: [.65, 0, -.35], uaL: [-1.2, 0, .35], faR: [-.5, 0, 0], faL: [-1.1, 0, 0], chest: [.72, 0, 0], spine: [.3, 0, 0], head: [-.48, 0, 0], thL: [-1.2, 0, .12], thR: [.25, 0, -.12], shnL: [1.7, 0, 0], shnR: [1.2, 0, 0], ftL: [-.4, 0, 0], ftR: [.3, 0, 0] },
    { t: 2.65, uaR: [1.0, 0, -.35], uaL: [-1.0, 0, .35], faR: [-.25, 0, 0], faL: [-.9, 0, 0], chest: [.82, 0, 0], spine: [.38, 0, 0], head: [-.62, 0, 0], thL: [-.45, 0, .1], thR: [-1.25, 0, -.1], shnL: [1.1, 0, 0], shnR: [1.8, 0, 0], ftL: [.2, 0, 0], ftR: [-.4, 0, 0] },
    { t: 3.0, uaR: [-1.25, -.12, -.55], faR: [-1.15, 0, 0], hdR: [.25, 0, 0], uaL: [-1.25, .12, .55], faL: [-1.15, 0, 0], hdL: [.25, 0, 0], chest: [-.18, .12, 0], spine: [-.08, .05, 0], head: [-.1, -.12, 0], thL: [-.35, 0, .12], thR: [.12, 0, -.12], shnL: [.65, 0, 0], shnR: [.35, 0, 0] },
    { t: 3.55, uaR: [-1.5, -.18, -.28], faR: [-1.3, 0, 0], hdR: [.35, 0, 0], uaL: [-1.5, .18, .28], faL: [-1.3, 0, 0], hdL: [.35, 0, 0], chest: [-.32, .18, 0], spine: [-.12, .08, 0], head: [-.08, -.18, 0], thL: [-.5, 0, .16], thR: [.22, 0, -.16], shnL: [.85, 0, 0], shnR: [.45, 0, 0] },
    { t: 3.95, uaR: [-1.8, -.08, .12], faR: [-.55, 0, 0], hdR: [-.2, 0, 0], uaL: [-1.8, .08, -.12], faL: [-.55, 0, 0], hdL: [-.2, 0, 0], chest: [.28, -.2, 0], spine: [.12, -.08, 0], head: [.12, .1, 0], thL: [-.8, 0, .1], thR: [.4, 0, -.1], shnL: [1.0, 0, 0], shnR: [.4, 0, 0] },
    { t: 4.25, uaR: [-1.55, -.1, .12], faR: [-.05, 0, 0], hdR: [-.9, 0, 0], uaL: [-1.55, .1, -.12], faL: [-.05, 0, 0], hdL: [-.9, 0, 0], chest: [-.1, 0, 0], spine: [-.04, 0, 0], head: [0, 0, 0], thL: [-.65, 0, .08], thR: [.35, 0, -.08], shnL: [.85, 0, 0], shnR: [.35, 0, 0] },
    { t: 5.0, uaR: [-1.5, -.1, .2], faR: [-.05, 0, 0], hdR: [-.85, 0, 0], uaL: [-1.5, .1, -.2], faL: [-.05, 0, 0], hdL: [-.85, 0, 0], chest: [-.18, 0, 0], spine: [-.08, 0, 0], thL: [-.2, 0, .08], thR: [-.2, 0, -.08], shnL: [.4, 0, 0], shnR: [.4, 0, 0] },
    { t: 6.2, ...GUARD, spine: [0, 0, 0], hdR: [0, 0, 0], hdL: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] }] },
  /* reação do alvo: é puxado por trás, perde o equilíbrio e gira durante o voo */
  solarVictim: { dur: 6.0, rootRx: [[0, 0], [3.0, .08], [3.55, .25], [4.2, 1.0], [4.85, 2.45], [5.55, 2.1], [6.0, 0]], rootRz: [[0, 0], [3.1, 0], [3.7, -.18], [4.35, .22], [4.9, -.35], [5.55, -.2], [6.0, 0]], keys: [
    { t: 0, ...GUARD, chest: [0, 0, 0], head: [0, 0, 0] },
    { t: 3.0, uaR: [-.8, 0, -.8], uaL: [-.8, 0, .8], faR: [-1.0, 0, 0], faL: [-1.0, 0, 0], chest: [.18, 0, 0], head: [-.25, 0, 0] },
    { t: 3.7, uaR: [-1.2, 0, -1.1], uaL: [-1.2, 0, 1.1], faR: [-1.1, 0, 0], faL: [-1.1, 0, 0], chest: [.35, 0, 0], head: [-.4, 0, 0] },
    { t: 4.35, uaR: [1.5, 0, -.9], uaL: [1.2, 0, .9], faR: [-.7, 0, 0], faL: [-.5, 0, 0], chest: [-.25, 0, 0], head: [.45, 0, 0], thL: [-.9, 0, .3], thR: [-.6, 0, -.3], shnL: [1.1, 0, 0], shnR: [.8, 0, 0] },
    { t: 4.9, uaR: [1.8, 0, -1.2], uaL: [1.55, 0, 1.2], faR: [-.8, 0, 0], faL: [-.8, 0, 0], chest: [-.35, 0, 0], head: [.55, 0, 0], thL: [-1.0, 0, .4], thR: [-.7, 0, -.4], shnL: [1.3, 0, 0], shnR: [1.0, 0, 0] },
    { t: 6.0, ...GUARD, chest: [0, 0, 0], head: [0, 0, 0] }] },
  /* CYBER · FLASH ÔMEGA: junta as mãos no quadril carregando, depois empurra as duas palmas para a frente e segura o feixe gigante */
  flash: { dur: 2.0, impact: .72, keys: [
    { t: 0, ...GUARD, spine: [0, 0, 0], hdR: [0, 0, 0], hdL: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] },
    { t: .3, uaR: [.35, .2, -.35], faR: [-1.7, 0, 0], hdR: [.5, 0, 0], uaL: [.1, -.5, .55], faL: [-1.9, 0, 0], hdL: [.5, 0, 0], chest: [.1, .65, 0], spine: [.05, .3, 0], head: [0, -.45, 0], thL: [-.55, 0, .15], shnL: [.8, 0, 0], thR: [.15, 0, -.1], shnR: [.5, 0, 0] },
    { t: .62, uaR: [.45, .25, -.3], faR: [-1.8, 0, 0], hdR: [.6, 0, 0], uaL: [.15, -.55, .5], faL: [-2.0, 0, 0], chest: [.15, .75, 0], spine: [.08, .35, 0], head: [0, -.5, 0] },
    { t: .72, uaR: [-1.55, -.1, .18], faR: [0, 0, 0], hdR: [-.9, 0, 0], uaL: [-1.55, .1, -.18], faL: [0, 0, 0], hdL: [-.9, 0, 0], chest: [-.12, -.08, 0], spine: [-.06, 0, 0], head: [.05, 0, 0], thL: [-.85, 0, .1], shnL: [.9, 0, 0], thR: [.45, 0, -.1], shnR: [.3, 0, 0] },
    { t: 1.7, uaR: [-1.5, -.1, .2], faR: [-.05, 0, 0], hdR: [-.85, 0, 0], uaL: [-1.5, .1, -.2], faL: [-.05, 0, 0], hdL: [-.85, 0, 0], chest: [-.18, 0, 0], spine: [-.08, 0, 0] },
    { t: 2.0, ...GUARD, spine: [0, 0, 0], hdR: [0, 0, 0], hdL: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] }] },
  /* NEXUS · VELOCIDADE ABSOLUTA: agacha como velocista e dispara inclinado, braços para trás */
  blitz: { dur: 2.2, impact: .3, keys: [
    { t: 0, ...GUARD, spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] },
    { t: .22, uaR: [.6, 0, -.3], uaL: [-1.2, 0, .3], faR: [-.4, 0, 0], faL: [-1.3, 0, 0], chest: [.75, 0, 0], spine: [.35, 0, 0], head: [-.6, 0, 0], thL: [-1.4, 0, .1], shnL: [1.9, 0, 0], thR: [-.3, 0, -.1], shnR: [1.6, 0, 0], ftL: [-.4, 0, 0], ftR: [.5, 0, 0] },
    { t: .34, uaR: [1.1, 0, -.35], uaL: [1.1, 0, .35], faR: [-.2, 0, 0], faL: [-.2, 0, 0], chest: [.85, 0, 0], spine: [.4, 0, 0], head: [-.75, 0, 0], thL: [-1.1, 0, .05], shnL: [1.0, 0, 0], thR: [.55, 0, -.05], shnR: [1.2, 0, 0], ftL: [.2, 0, 0], ftR: [.6, 0, 0] },
    { t: 1.9, uaR: [1.15, 0, -.4], uaL: [1.15, 0, .4], chest: [.85, 0, 0], spine: [.4, 0, 0], head: [-.75, 0, 0], thL: [-1.2, 0, .05], shnL: [1.1, 0, 0], thR: [.6, 0, -.05], shnR: [1.3, 0, 0] },
    { t: 2.2, ...GUARD, spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], head: [0, 0, 0] }] },
  /* CYBER · DESCARGA EM CADEIA: gira o tronco e empurra a palma aberta soltando o raio */
  chain: { dur: .75, impact: .28, lunge: .25, keys: [
    { t: 0, ...GUARD, spine: [0, 0, 0], hdR: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] },
    { t: .14, uaR: [-.6, 0, -.9], faR: [-1.5, 0, 0], hdR: [.3, 0, 0], chest: [0, .5, 0], spine: [0, .22, 0], uaL: [-.8, 0, .3], faL: [-1.6, 0, 0], head: [0, -.2, 0] },
    { t: .28, uaR: [-1.62, -.15, .05], faR: [0, 0, 0], hdR: [-.7, 0, 0], chest: [.14, -.42, 0], spine: [.08, -.22, 0], uaL: [-.2, 0, .75], faL: [-.5, 0, 0], head: [0, .22, 0], thL: [-.6, 0, 0], shnL: [.6, 0, 0], thR: [.25, 0, 0], shnR: [.2, 0, 0] },
    { t: .5, uaR: [-1.55, -.15, .05], faR: [-.05, 0, 0], hdR: [-.65, 0, 0], chest: [.12, -.38, 0] },
    { t: .75, ...GUARD, spine: [0, 0, 0], hdR: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] }] },
  /* CYBER · PROTOCOLO ÔMEGA: agacha, decola com asas, abre os braços (mísseis), chama o canhão orbital e desce */
  omega: { dur: 3.3, impact: 2.3, rootY: [[0, 0], [.25, -.35], [.6, 2.4], [2.6, 2.6], [3.0, -.45], [3.3, 0]], keys: [
    { t: 0, ...GUARD, spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] },
    { t: .25, uaR: [.4, 0, -.5], uaL: [.4, 0, .5], faR: [-.6, 0, 0], faL: [-.6, 0, 0], chest: [.45, 0, 0], spine: [.25, 0, 0], thL: [-1.1, 0, .1], thR: [-1.1, 0, -.1], shnL: [1.8, 0, 0], shnR: [1.8, 0, 0], ftL: [-.6, 0, 0], ftR: [-.6, 0, 0], head: [-.3, 0, 0] },
    { t: .6, uaR: [-.3, 0, -1.5], uaL: [-.3, 0, 1.5], faR: [-.2, 0, 0], faL: [-.2, 0, 0], chest: [-.3, 0, 0], spine: [-.1, 0, 0], thL: [-.35, 0, .1], thR: [-.1, 0, -.1], shnL: [.7, 0, 0], shnR: [.35, 0, 0], ftL: [.5, 0, 0], ftR: [.5, 0, 0], head: [-.3, 0, 0] },
    { t: .9, uaR: [-1.25, 0, -1.0], uaL: [-1.25, 0, 1.0], faR: [-.1, 0, 0], faL: [-.1, 0, 0], chest: [-.1, 0, 0], head: [-.1, 0, 0] },
    { t: 1.4, uaR: [-1.3, 0, -.9], uaL: [-1.3, 0, .9], chest: [-.05, 0, 0] },
    { t: 1.8, uaR: [-3.0, 0, -.25], uaL: [-3.0, 0, .25], faR: [-.15, 0, 0], faL: [-.15, 0, 0], chest: [-.38, 0, 0], spine: [-.12, 0, 0], head: [-.45, 0, 0] },
    { t: 2.25, uaR: [-.9, 0, -.12], uaL: [-.9, 0, .12], faR: [0, 0, 0], faL: [0, 0, 0], chest: [.55, 0, 0], spine: [.22, 0, 0], head: [.35, 0, 0] },
    { t: 2.6, uaR: [-.95, 0, -.15], uaL: [-.95, 0, .15], chest: [.5, 0, 0] },
    { t: 3.0, uaR: [-1.0, 0, -.35], uaL: [-.3, 0, 1.0], faR: [-.2, 0, 0], faL: [-.6, 0, 0], chest: [.65, 0, -.1], spine: [.3, 0, 0], thL: [-1.5, 0, .22], thR: [-.45, 0, -.2], shnL: [2.0, 0, 0], shnR: [2.1, 0, 0], ftL: [-.3, 0, 0], ftR: [.4, 0, 0], head: [-.4, 0, 0] },
    { t: 3.3, ...GUARD, spine: [0, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], head: [0, 0, 0] }] },
  hit: { dur: .38, keys: [
    { t: 0, chest: [0, 0, 0], head: [0, 0, 0], spine: [0, 0, 0], uaR: [-.3, 0, -.2], uaL: [-.3, 0, .2] },
    { t: .06, chest: [-.38, .15, .12], head: [-.45, -.2, 0], spine: [-.15, 0, 0], uaR: [-.1, 0, -.6], uaL: [-.1, 0, .6] },
    { t: .38, chest: [0, 0, 0], head: [0, 0, 0], spine: [0, 0, 0], uaR: [-.3, 0, -.2], uaL: [-.3, 0, .2] }] },
  jump: { dur: .2, soft: true, rootY: [[0, 0], [.08, -.22], [.2, 0]], keys: [
    { t: 0, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], uaR: [-.2, 0, -.2], uaL: [-.2, 0, .2], chest: [0, 0, 0] },
    { t: .08, thL: [-.6, 0, 0], thR: [-.6, 0, 0], shnL: [1.1, 0, 0], shnR: [1.1, 0, 0], uaR: [.5, 0, -.2], uaL: [.5, 0, .2], chest: [.35, 0, 0] },
    { t: .2, thL: [.1, 0, 0], thR: [.2, 0, 0], shnL: [.2, 0, 0], shnR: [.3, 0, 0], uaR: [-2.2, 0, -.3], uaL: [-1.6, 0, .4], chest: [-.1, 0, 0] }] },
  land: { dur: .34, soft: true, rootY: [[0, 0], [.07, -.38], [.34, 0]], keys: [
    { t: 0, thL: [-.3, 0, 0], thR: [-.3, 0, 0], shnL: [.5, 0, 0], shnR: [.5, 0, 0], chest: [.1, 0, 0], ftL: [-.2, 0, 0], ftR: [-.2, 0, 0] },
    { t: .07, thL: [-1, 0, .1], thR: [-.9, 0, -.1], shnL: [1.6, 0, 0], shnR: [1.5, 0, 0], ftL: [-.6, 0, 0], ftR: [-.6, 0, 0], chest: [.5, 0, 0], uaR: [-.1, 0, -.5], uaL: [-.1, 0, .5] },
    { t: .34, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], chest: [0, 0, 0], uaR: [-.2, 0, -.2], uaL: [-.2, 0, .2] }] },
  vault: { dur: .6, rootRz: [[0, 0], [.18, -.35], [.36, -.55], [.5, -.15], [.6, 0]], keys: [
    { t: 0, uaL: [-.4, 0, .2], faL: [-.4, 0, 0], uaR: [-.6, 0, -.3], faR: [-.6, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], chest: [0, 0, 0] },
    { t: .14, uaL: [-1.3, 0, .55], faL: [0, 0, 0], hdL: [.9, 0, 0], uaR: [-1.6, 0, -.5], faR: [-.3, 0, 0], thL: [-.9, 0, .2], thR: [-.4, 0, 0], shnL: [1.2, 0, 0], shnR: [.6, 0, 0], chest: [.4, 0, .2] },
    { t: .32, uaL: [-.3, 0, 1.25], faL: [0, 0, 0], hdL: [1.1, 0, 0], uaR: [-1.9, 0, -1.1], faR: [-.2, 0, 0], thL: [-1.5, 0, -.7], thR: [-1.4, 0, -.6], shnL: [.5, 0, 0], shnR: [.6, 0, 0], chest: [.2, 0, .45], head: [0, 0, -.3] },
    { t: .48, uaL: [-.6, 0, .6], faL: [-.4, 0, 0], hdL: [0, 0, 0], uaR: [-1, 0, -.6], faR: [-.5, 0, 0], thL: [-.4, 0, 0], thR: [-.8, 0, 0], shnL: [.7, 0, 0], shnR: [1.2, 0, 0], chest: [.25, 0, .1], head: [0, 0, 0] },
    { t: .6, uaL: [-.3, 0, .2], faL: [-.5, 0, 0], uaR: [-.4, 0, -.2], faR: [-.5, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], chest: [0, 0, 0] }] },
  death: { dur: 1.7, hold: true, rootY: [[0, 0], [.3, -.08], [.62, -.55], [1.02, .12], [1.14, .32], [1.26, .16], [1.7, .2]],
    rootRx: [[0, 0], [.3, .15], [.62, .3], [1.02, 1.5], [1.14, 1.38], [1.26, 1.52], [1.7, 1.5]], rootZ: [[0, 0], [.3, -.2], [.62, -.25], [1.02, -.45], [1.7, -.5]], keys: [
    { t: 0, chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], uaR: [-.2, 0, -.2], uaL: [-.2, 0, .2], faR: [-.3, 0, 0], faL: [-.3, 0, 0], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] },
    { t: .12, chest: [-.5, .2, .15], spine: [-.2, 0, 0], head: [-.6, .3, 0], uaR: [.2, 0, -.9], uaL: [.3, 0, .7], faR: [-.4, 0, 0], faL: [-.6, 0, 0], thL: [.15, 0, 0], thR: [-.25, 0, 0], shnL: [.3, 0, 0], shnR: [.4, 0, 0] },
    { t: .62, chest: [.45, -.1, -.1], spine: [.25, 0, 0], head: [.5, -.2, .2], uaR: [-.2, 0, -.35], uaL: [-.1, 0, .3], faR: [-.3, 0, 0], faL: [-.4, 0, 0], thL: [-1.2, 0, .15], thR: [-1, 0, -.1], shnL: [2.1, 0, 0], shnR: [1.9, 0, 0], ftL: [-.4, 0, 0], ftR: [-.3, 0, 0] },
    { t: 1.02, chest: [-.1, .2, 0], spine: [0, 0, 0], head: [-.2, .5, .1], uaR: [-.4, 0, -1.2], uaL: [.1, 0, 1.0], faR: [-.2, 0, 0], faL: [-.5, 0, 0], thL: [-.5, 0, .2], thR: [-.1, 0, -.15], shnL: [1.0, 0, 0], shnR: [.3, 0, 0], ftL: [.3, 0, 0], ftR: [.4, 0, 0] },
    { t: 1.7, chest: [-.05, .15, 0], spine: [0, 0, 0], head: [-.1, .7, .15], uaR: [-.3, 0, -1.35], uaL: [.15, 0, 1.15], faR: [-.15, 0, 0], faL: [-.35, 0, 0], thL: [-.35, 0, .2], thR: [-.05, 0, -.15], shnL: [.75, 0, 0], shnR: [.15, 0, 0], ftL: [.4, 0, 0], ftR: [.45, 0, 0] }] },
  revive: { dur: 1.0, rootY: [[0, .2], [.35, -.45], [.7, -.25], [1, 0]], rootRx: [[0, 1.5], [.35, .5], [.7, .05], [1, 0]], rootZ: [[0, -.5], [1, 0]], keys: [
    { t: 0, chest: [-.05, .15, 0], head: [-.1, .7, .15], uaR: [-.3, 0, -1.35], uaL: [.15, 0, 1.15], thL: [-.35, 0, .2], thR: [-.05, 0, -.15], shnL: [.75, 0, 0], shnR: [.15, 0, 0] },
    { t: .35, chest: [.7, 0, 0], head: [.3, 0, 0], uaR: [-1.0, 0, -.4], uaL: [-1.0, 0, .4], thL: [-1.6, 0, .1], thR: [-.4, 0, -.1], shnL: [2.0, 0, 0], shnR: [1.6, 0, 0] },
    { t: .7, chest: [.3, 0, 0], head: [0, 0, 0], uaR: [-.4, 0, -.4], uaL: [-.4, 0, .4], thL: [-.7, 0, 0], thR: [-.5, 0, 0], shnL: [1.0, 0, 0], shnR: [.9, 0, 0] },
    { t: 1, chest: [0, 0, 0], head: [0, 0, 0], uaR: [-.2, 0, -.2], uaL: [-.2, 0, .2], thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0] }] },
  /* queda de lugar alto: amortece com os joelhos e apoia a mão no chão */
  landHard: { dur: .8, impact: .1, rootY: [[0, 0], [.08, -.95], [.42, -.85], [.8, 0]], keys: [
    { t: 0, thL: [-.3, 0, 0], thR: [-.3, 0, 0], shnL: [.5, 0, 0], shnR: [.5, 0, 0], chest: [.1, 0, 0], ftL: [-.2, 0, 0], ftR: [-.2, 0, 0], uaR: [-.6, 0, -.6], uaL: [-.6, 0, .6], faR: [-.5, 0, 0], faL: [-.5, 0, 0], head: [0, 0, 0], spine: [0, 0, 0] },
    { t: .08, thL: [-1.7, 0, .25], thR: [-.5, 0, -.2], shnL: [2.0, 0, 0], shnR: [2.2, 0, 0], ftL: [-.3, 0, 0], ftR: [.4, 0, 0], chest: [.75, 0, -.15], spine: [.35, 0, 0], uaR: [-1.0, 0, -.25], faR: [-.1, 0, 0], uaL: [-.3, 0, 1.0], faL: [-.6, 0, 0], head: [-.55, 0, 0] },
    { t: .42, thL: [-1.6, 0, .25], thR: [-.45, 0, -.2], shnL: [1.9, 0, 0], shnR: [2.1, 0, 0], ftL: [-.3, 0, 0], ftR: [.35, 0, 0], chest: [.65, 0, -.1], spine: [.3, 0, 0], uaR: [-1.0, 0, -.25], faR: [-.1, 0, 0], uaL: [-.3, 0, .9], faL: [-.6, 0, 0], head: [-.4, 0, 0] },
    { t: .8, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], uaR: [-.2, 0, -.2], faR: [-.3, 0, 0], uaL: [-.2, 0, .2], faL: [-.3, 0, 0], head: [0, 0, 0] }] },
  /* queda muito alta correndo: cambalhota que conserva o impulso */
  roll: { dur: .8, impact: .1, rollSpin: true, keys: [
    { t: 0, thL: [-.5, 0, 0], thR: [-.5, 0, 0], shnL: [.9, 0, 0], shnR: [.9, 0, 0], chest: [.4, 0, 0], spine: [.2, 0, 0], head: [-.3, 0, 0], uaR: [-1.2, 0, -.3], uaL: [-1.2, 0, .3], faR: [-.6, 0, 0], faL: [-.6, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] },
    { t: .15, thL: [-2.2, 0, .1], thR: [-2.2, 0, -.1], shnL: [2.3, 0, 0], shnR: [2.3, 0, 0], chest: [.9, 0, 0], spine: [.5, 0, 0], head: [.6, 0, 0], uaR: [-1.6, 0, -.2], uaL: [-1.6, 0, .2], faR: [-1.6, 0, 0], faL: [-1.6, 0, 0], ftL: [-.5, 0, 0], ftR: [-.5, 0, 0] },
    { t: .55, thL: [-2.0, 0, .1], thR: [-1.6, 0, -.1], shnL: [2.2, 0, 0], shnR: [2.0, 0, 0], chest: [.8, 0, 0], spine: [.4, 0, 0], head: [.4, 0, 0], uaR: [-1.0, 0, -.4], uaL: [-1.0, 0, .4], faR: [-1.2, 0, 0], faL: [-1.2, 0, 0], ftL: [-.4, 0, 0], ftR: [-.3, 0, 0] },
    { t: .8, thL: [0, 0, 0], thR: [0, 0, 0], shnL: [0, 0, 0], shnR: [0, 0, 0], chest: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], uaR: [-.2, 0, -.2], uaL: [-.2, 0, .2], faR: [-.3, 0, 0], faL: [-.3, 0, 0], ftL: [0, 0, 0], ftR: [0, 0, 0] }] },
  wave: { dur: 1.7, keys: [
    { t: 0, uaR: [-.2, 0, -.2], faR: [-.3, 0, 0], head: [0, 0, 0], chest: [0, 0, 0] },
    { t: .25, uaR: [-.3, 0, -2.5], faR: [-.2, 0, -.9], head: [.05, -.25, -.1], chest: [0, -.1, .08] },
    { t: .5, uaR: [-.3, 0, -2.6], faR: [-.2, 0, -.3] }, { t: .75, uaR: [-.3, 0, -2.5], faR: [-.2, 0, -1.0] },
    { t: 1.0, uaR: [-.3, 0, -2.6], faR: [-.2, 0, -.3] }, { t: 1.25, uaR: [-.3, 0, -2.5], faR: [-.2, 0, -.9], head: [.05, -.25, -.1], chest: [0, -.1, .08] },
    { t: 1.7, uaR: [-.2, 0, -.2], faR: [-.3, 0, 0], head: [0, 0, 0], chest: [0, 0, 0] }] },
 };
/* EXTINÇÃO SOLAR · coreografia cinematográfica de 30 s.
   Os quadros atuam no esqueleto deformador existente; a pose é interpolada sem cortes. */
A.solar = { dur: 30, impact: 24.1, keys: [
  { t: 0, ...GUARD, spine: [0, 0, 0], chest: [.02, 0, 0], head: [0, 0, 0] },
  { t: .15, uaR: [.8, 0, -.45], uaL: [-1.35, 0, .4], faR: [-.45, 0, 0], faL: [-1.0, 0, 0], chest: [.72, 0, 0], spine: [.3, 0, 0], head: [-.48, 0, 0], thL: [-1.25, 0, .1], thR: [.15, 0, -.1], shnL: [1.65, 0, 0], shnR: [1.1, 0, 0], ftL: [-.35, 0, 0], ftR: [.25, 0, 0] },
  { t: .55, uaR: [1.0, 0, -.35], uaL: [-1.05, 0, .35], faR: [-.2, 0, 0], faL: [-.85, 0, 0], chest: [.82, 0, 0], spine: [.38, 0, 0], head: [-.62, 0, 0], thL: [-.45, 0, .1], thR: [-1.2, 0, -.1], shnL: [1.1, 0, 0], shnR: [1.75, 0, 0], ftL: [.2, 0, 0], ftR: [-.4, 0, 0] },
  { t: 1.05, uaR: [.72, 0, -.38], uaL: [-1.3, 0, .38], faR: [-.5, 0, 0], faL: [-1.0, 0, 0], chest: [.75, 0, 0], spine: [.32, 0, 0], head: [-.5, 0, 0], thL: [-1.25, 0, .1], thR: [.15, 0, -.1], shnL: [1.65, 0, 0], shnR: [1.15, 0, 0] },
  { t: 1.55, uaR: [1.0, 0, -.35], uaL: [-1.0, 0, .35], faR: [-.25, 0, 0], faL: [-.9, 0, 0], chest: [.82, 0, 0], spine: [.38, 0, 0], head: [-.62, 0, 0], thL: [-.45, 0, .1], thR: [-1.25, 0, -.1], shnL: [1.1, 0, 0], shnR: [1.8, 0, 0] },
  { t: 2.5, uaR: [.8, 0, -.38], uaL: [-1.25, 0, .38], faR: [-.45, 0, 0], faL: [-1.0, 0, 0], chest: [.76, 0, 0], spine: [.34, 0, 0], head: [-.52, 0, 0], thL: [-1.35, 0, .08], thR: [.1, 0, -.08], shnL: [1.8, 0, 0], shnR: [1.15, 0, 0] },
  { t: 3.0, uaR: [-1.45, -.25, -.72], faR: [-1.15, 0, 0], hdR: [.35, 0, 0], uaL: [-1.5, .25, .72], faL: [-1.2, 0, 0], hdL: [.35, 0, 0], chest: [-.28, .15, 0], spine: [-.12, .08, 0], head: [-.18, -.2, 0], thL: [-.35, 0, .16], thR: [.2, 0, -.16], shnL: [.75, 0, 0], shnR: [.35, 0, 0] },
  { t: 4.5, uaR: [-1.75, -.15, -.35], faR: [-1.0, 0, 0], hdR: [.45, 0, 0], uaL: [-1.75, .15, .35], faL: [-1.0, 0, 0], hdL: [.45, 0, 0], chest: [-.35, .1, 0], spine: [-.15, .05, 0], head: [-.15, -.12, 0], thL: [-.6, 0, .12], thR: [-.2, 0, -.12], shnL: [.9, 0, 0], shnR: [.65, 0, 0] },
  { t: 6.5, uaR: [-2.1, 0, -.18], faR: [-.25, 0, 0], uaL: [-2.1, 0, .18], faL: [-.25, 0, 0], chest: [-.2, 0, 0], spine: [-.08, 0, 0], head: [-.12, 0, 0], thL: [-.95, 0, .08], thR: [-.95, 0, -.08], shnL: [1.25, 0, 0], shnR: [1.25, 0, 0], ftL: [.2, 0, 0], ftR: [.2, 0, 0] },
  { t: 8.5, uaR: [-1.0, 0, -.6], faR: [-.75, 0, 0], uaL: [-1.0, 0, .6], faL: [-.75, 0, 0], chest: [.08, 0, 0], spine: [.04, 0, 0], head: [-.05, 0, 0], thL: [-.45, 0, .1], thR: [-.45, 0, -.1], shnL: [.85, 0, 0], shnR: [.85, 0, 0] },
  { t: 10.8, uaR: [-.55, 0, -1.0], faR: [-.35, 0, 0], uaL: [-1.4, 0, .35], faL: [-1.15, 0, 0], chest: [-.18, -.28, 0], spine: [-.08, -.12, 0], head: [.08, .2, 0], thL: [-.3, 0, .1], thR: [-.6, 0, -.1], shnL: [.5, 0, 0], shnR: [.9, 0, 0] },
  { t: 12.1, uaR: [-2.3, -.15, -.35], faR: [-.1, 0, 0], hdR: [-.6, 0, 0], uaL: [-2.25, .15, .35], faL: [-.15, 0, 0], hdL: [-.6, 0, 0], chest: [.55, .22, 0], spine: [.25, .1, 0], head: [-.28, -.15, 0], thL: [-.7, 0, .15], thR: [-.85, 0, -.15], shnL: [1.1, 0, 0], shnR: [1.0, 0, 0] },
  { t: 13.2, uaR: [-1.5, -.3, -.4], faR: [-.25, 0, 0], uaL: [-1.5, .3, .4], faL: [-.25, 0, 0], chest: [-.32, .18, 0], spine: [-.15, .08, 0], head: [-.1, -.1, 0], thL: [-1.0, 0, .12], thR: [-.45, 0, -.12], shnL: [1.45, 0, 0], shnR: [.75, 0, 0] },
  { t: 15.3, uaR: [-.9, 0, -.2], faR: [-.7, 0, 0], uaL: [-1.0, 0, .3], faL: [-.7, 0, 0], chest: [.28, 0, 0], spine: [.12, 0, 0], head: [-.08, 0, 0], thL: [-.7, 0, .1], thR: [-1.35, 0, -.1], shnL: [1.0, 0, 0], shnR: [1.2, 0, 0] },
  { t: 16.4, uaR: [-.35, 0, -.45], faR: [-.4, 0, 0], uaL: [-1.3, 0, .55], faL: [-1.1, 0, 0], chest: [-.2, -.18, 0], spine: [-.1, -.08, 0], head: [.05, .12, 0], thL: [-.45, 0, .15], shnL: [.65, 0, 0], thR: [-1.8, 0, -.12], shnR: [.28, 0, 0], ftR: [-.25, 0, 0] },
  { t: 17.2, uaR: [.15, 0, -.75], faR: [-.2, 0, 0], uaL: [-1.15, 0, .65], faL: [-1.0, 0, 0], chest: [.5, -.25, 0], spine: [.25, -.12, 0], head: [-.2, .12, 0], thL: [-.3, 0, .1], shnL: [.6, 0, 0], thR: [-.75, 0, -.12], shnR: [.65, 0, 0], ftR: [.3, 0, 0] },
  { t: 19.2, uaR: [-.35, 0, -.55], faR: [-.45, 0, 0], uaL: [-.35, 0, .55], faL: [-.45, 0, 0], chest: [.05, 0, 0], spine: [0, 0, 0], head: [-.05, 0, 0], thL: [-.35, 0, .1], thR: [-.35, 0, -.1], shnL: [.65, 0, 0], shnR: [.65, 0, 0] },
  { t: 22.8, uaR: [-1.85, .08, -.12], faR: [-.08, 0, 0], hdR: [-.25, 0, 0], uaL: [-1.85, -.08, .12], faL: [-.08, 0, 0], hdL: [-.25, 0, 0], chest: [.14, 0, 0], spine: [.08, 0, 0], head: [-.08, 0, 0], thL: [-.3, 0, .08], thR: [-.3, 0, -.08], shnL: [.55, 0, 0], shnR: [.55, 0, 0] },
  { t: 24.8, uaR: [-1.95, .08, -.1], faR: [0, 0, 0], uaL: [-1.95, -.08, .1], faL: [0, 0, 0], chest: [.18, 0, 0], spine: [.08, 0, 0], head: [-.1, 0, 0] },
  { t: 26.2, uaR: [-.4, 0, -.2], faR: [-1.55, 0, 0], uaL: [-.35, 0, .2], faL: [-1.55, 0, 0], chest: [.12, 0, 0], spine: [.05, 0, 0], head: [.05, .15, 0] },
  { t: 27.2, uaR: [-.2, 0, -.75], faR: [-1.8, 0, 0], hdR: [.7, 0, 0], uaL: [-.65, 0, .32], faL: [-1.55, 0, 0], hdL: [.55, 0, 0], chest: [-.12, .12, 0], spine: [-.06, .06, 0], head: [.18, -.42, .08], thL: [-.12, 0, .04], thR: [-.12, 0, -.04], shnL: [.12, 0, 0], shnR: [.12, 0, 0] },
  { t: 28.7, uaR: [-.18, 0, -.82], faR: [-1.85, 0, 0], hdR: [.82, 0, 0], uaL: [-.58, 0, .28], faL: [-1.55, 0, 0], hdL: [.62, 0, 0], chest: [-.14, .16, 0], spine: [-.08, .08, 0], head: [.2, -.48, .1], thL: [-.08, 0, .04], thR: [-.08, 0, -.04] },
  { t: 29.7, uaR: [-.15, 0, -.82], faR: [-1.85, 0, 0], hdR: [.82, 0, 0], uaL: [-.58, 0, .28], faL: [-1.55, 0, 0], hdL: [.62, 0, 0], chest: [-.14, .16, 0], spine: [-.08, .08, 0], head: [.2, -.48, .1] },
  { t: 30, ...GUARD, spine: [0, 0, 0], head: [0, 0, 0] }
]};
A.solarVictim = { dur: 30, rootRx: [[0, 0], [3, 0], [4.5, .25], [7, .05], [11, .35], [12.2, 1.2], [14.2, 2.5], [16.5, 1.3], [18.5, .2], [22.8, .8], [24.8, 1.4], [26, 1.8], [30, 0]], rootRz: [[0, 0], [3, .04], [4.5, -.2], [7, .1], [11, -.25], [12.2, .7], [14, -1.4], [16.5, .7], [18.5, -.8], [22.8, 1.1], [24.8, -.6], [26, .2], [30, 0]], keys: [
  { t: 0, ...GUARD, chest: [0, 0, 0], head: [0, 0, 0] },
  { t: 3.0, uaR: [-1.15, 0, -.85], faR: [-1.0, 0, 0], uaL: [-1.15, 0, .85], faL: [-1.0, 0, 0], chest: [.24, 0, 0], head: [-.3, 0, 0] },
  { t: 5.0, uaR: [-1.35, 0, -1.0], faR: [-1.3, 0, 0], uaL: [-1.35, 0, 1.0], faL: [-1.3, 0, 0], chest: [.35, 0, 0], head: [-.4, 0, 0], thL: [-.45, 0, .1], thR: [-.45, 0, -.1], shnL: [.8, 0, 0], shnR: [.8, 0, 0] },
  { t: 8.0, uaR: [-1.55, 0, -.9], faR: [-.9, 0, 0], uaL: [-1.45, 0, .9], faL: [-.9, 0, 0], chest: [.12, 0, 0], head: [-.22, 0, 0], thL: [-.65, 0, .15], thR: [-.45, 0, -.15], shnL: [1.0, 0, 0], shnR: [.8, 0, 0] },
  { t: 10.8, uaR: [-1.75, 0, -1.1], faR: [-.6, 0, 0], uaL: [-1.65, 0, 1.1], faL: [-.6, 0, 0], chest: [.25, 0, 0], head: [-.3, 0, 0], thL: [-.7, 0, .1], thR: [-.8, 0, -.1], shnL: [.9, 0, 0], shnR: [1.0, 0, 0] },
  { t: 12.2, uaR: [1.2, 0, -.8], faR: [-.8, 0, 0], uaL: [1.35, 0, .8], faL: [-.75, 0, 0], chest: [-.4, 0, 0], head: [.5, 0, 0], thL: [-1.0, 0, .2], thR: [-.8, 0, -.2], shnL: [1.1, 0, 0], shnR: [.9, 0, 0] },
  { t: 14.4, uaR: [1.75, 0, -1.0], faR: [-.55, 0, 0], uaL: [1.55, 0, 1.0], faL: [-.55, 0, 0], chest: [-.35, 0, 0], head: [.4, .2, 0], thL: [-1.25, 0, .25], thR: [-.8, 0, -.25], shnL: [1.1, 0, 0], shnR: [.8, 0, 0] },
  { t: 16.8, uaR: [1.5, 0, -.9], faR: [-.75, 0, 0], uaL: [1.45, 0, .9], faL: [-.75, 0, 0], chest: [.55, 0, 0], head: [-.45, 0, 0], thL: [-.9, 0, .2], thR: [-1.0, 0, -.2], shnL: [1.0, 0, 0], shnR: [1.0, 0, 0] },
  { t: 18.5, uaR: [1.8, 0, -.7], faR: [-.6, 0, 0], uaL: [1.65, 0, .7], faL: [-.6, 0, 0], chest: [-.2, 0, 0], head: [.25, 0, 0], thL: [-.55, 0, .1], thR: [-.7, 0, -.1], shnL: [.8, 0, 0], shnR: [.9, 0, 0] },
  { t: 22.8, uaR: [1.3, 0, -.9], faR: [-.9, 0, 0], uaL: [1.3, 0, .9], faL: [-.9, 0, 0], chest: [.35, 0, 0], head: [-.5, 0, 0], thL: [-.8, 0, .2], thR: [-.8, 0, -.2], shnL: [1.0, 0, 0], shnR: [1.0, 0, 0] },
  { t: 24.8, uaR: [1.65, 0, -1.0], faR: [-.4, 0, 0], uaL: [1.65, 0, 1.0], faL: [-.4, 0, 0], chest: [.4, 0, 0], head: [-.6, 0, 0] },
  { t: 26.0, ...GUARD, chest: [0, 0, 0], head: [0, 0, 0] },
  { t: 30, ...GUARD, chest: [0, 0, 0], head: [0, 0, 0] }
]};
const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'uaL', 'faL', 'hdL', 'shR', 'uaR', 'faR', 'hdR', 'thL', 'shnL', 'ftL', 'thR', 'shnR', 'ftR'];
// pré-processa: cada quadro passa a conter todas as juntas usadas na ação
for (const k in A) {
  const a = A[k], used = new Set(); a.keys.forEach(q => Object.keys(q).forEach(j => j !== 't' && used.add(j))); a.joints = [...used];
  for (const j of a.joints) { let first = a.keys.find(q => q[j]); let prev = first[j]; for (const q of a.keys) { if (q[j]) prev = q[j]; else q[j] = prev; } }
}
function track(tr, t) { if (!tr) return 0; if (t <= tr[0][0]) return tr[0][1]; for (let i = 1; i < tr.length; i++) if (t <= tr[i][0]) { const a = tr[i - 1], b = tr[i]; return lerp(a[1], b[1], s5((t - a[0]) / (b[0] - a[0]))); } return tr[tr.length - 1][1]; }
function sampleAction(a, t, out) {
  const K = a.keys; let i = 1; while (i < K.length - 1 && K[i].t < t) i++;
  const k0 = K[i - 1], k1 = K[i], u = s5((t - k0.t) / Math.max(1e-4, k1.t - k0.t));
  for (const j of a.joints) { const p = k0[j], q = k1[j], o = out[j]; o[0] = lerp(p[0], q[0], u); o[1] = lerp(p[1], q[1], u); o[2] = lerp(p[2], q[2], u); }
}

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Hero {
  constructor(skinId = 'cyber') {
    this.skin = SKINS[skinId] ? skinId : 'cyber'; this.charId = 'nexus'; this.height = 3.0; this.M = makeMats(this.skin);
    this.object = new THREE.Group(); this.object.name = 'hero';
    this.body = new THREE.Group(); this.object.add(this.body);
    this.J = {}; this.build();
    // Resposta localizada ao impacto: estados elásticos separados por região do corpo.
    this.impactBody = { front: { x: 0, v: 0 }, back: { x: 0, v: 0 }, left: { x: 0, v: 0 }, right: { x: 0, v: 0 }, head: { x: 0, v: 0 } };
    // ragdoll parcial (molas por junta), expressões, suor/sangue/sujeira, freada
    this.rag = {}; for (const j of Object.keys(RAGK)) this.rag[j] = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 }, z: { x: 0, v: 0 } };
    this.limp = 0; this.bodyFx = { wet: 0, blood: 0, dirt: 0, sw: -1, sb: -1, sd: -1 }; this.expr = { pain: 0, rage: 0, tired: 0 }; this.vital = 1; this.exert = 0;
    this.brakeT = 0; this.brakeV = 0; this.brakeEvt = 0; this.prevRun = 0; this.trails = null; this.chainSway = { x: { x: 0, v: 0 }, z: { x: 0, v: 0 } };
    this.impactMarkAlpha = 0; this.impactMarkSide = 0; this.impactMarkBack = false;
    this.buildImpactMarks();
    this.st = {}; for (const j of JOINTS) this.st[j] = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }];
    this.root = { y: { x: 0, v: 0 }, rx: { x: 0, v: 0 }, rz: { x: 0, v: 0 }, z: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, hipY: { x: 0, v: 0 } };
    this.phase = 0; this.spd = 0; this.air = 0; this.water = 0; this.t = 0; this.actions = []; this.dead = false; this.dancing = false; this.danceT = 0;
    this.combo = 0; this.comboUntil = 0; this.glow = 0; this.flash = 0; this.idleVar = 0; this.idleT = 4; this.lean = { x: 0, v: 0 }; this.turn = { x: 0, v: 0 }; this.lastYaw = null;
    this.tmp = {}; for (const j of JOINTS) this.tmp[j] = [0, 0, 0]; this.act = {}; for (const j of JOINTS) this.act[j] = [0, 0, 0];
    this.aim = 0;
    // física do corpo: inércia do tronco, quique do quadril, pés no chão (IK), escalada
    this.inr = { x: { x: 0, v: 0 }, z: { x: 0, v: 0 }, head: { x: 0, v: 0 }, arm: { x: 0, v: 0 } }; this.bnc = { x: 0, v: 0 }; this.soft = { chest: { x: 0, v: 0 }, abdomen: { x: 0, v: 0 }, shoulder: { x: 0, v: 0 } };
    this.prevP = null; this.prevV = new THREE.Vector3(); this.ikL = { x: 0, v: 0 }; this.ikR = { x: 0, v: 0 }; this.ikDrop = { x: 0, v: 0 };
    this.climbW = 0; this.climbPh = 0; this.climbUntil = 0; this.scr = 0; this.slopeS = 0;
    this.measureLegs();
    if ((SKINS[this.skin] || {}).cosmic) this.addAura();
  }
  buildImpactMarks() {
    if (!this.J.chest) return;
    // Marcas gráficas de impacto (escoriações estilizadas), sem feridas abertas.
    const mat = new THREE.MeshStandardMaterial({ color: 0x302b35, roughness: .95, metalness: 0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const edge = new THREE.MeshStandardMaterial({ color: 0x8d8294, roughness: .9, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.impactMark = new THREE.Group();
    const patch = new THREE.Mesh(new THREE.CircleGeometry(.105, 24), mat); patch.scale.set(1.15, .72, 1); patch.position.z = .292; this.impactMark.add(patch);
    const rim = new THREE.Mesh(new THREE.RingGeometry(.105, .135, 24), edge); rim.position.z = .294; this.impactMark.add(rim);
    this.impactMark.materials = [mat, edge]; this.J.chest.add(this.impactMark);
  }
  receiveImpact(attackerYaw = this.object.rotation.y, strength = 1) {
    const rel = attackerYaw - this.object.rotation.y;
    const front = Math.cos(rel), side = Math.sin(rel), k = clamp(strength, .25, 1.6);
    if (front > .38) { this.impactBody.front.v += 6.4 * k; this.impactBody.head.v += .75 * k; this.impactMarkBack = false; }
    else if (front < -.38) { this.impactBody.back.v += 6 * k; this.impactBody.head.v += .6 * k; this.impactMarkBack = true; }
    else if (side > 0) this.impactBody.left.v += 6 * k;
    else this.impactBody.right.v += 6 * k;
    this.impactMarkSide = clamp(side, -1, 1);
    this.impactMarkAlpha = Math.max(this.impactMarkAlpha, clamp(.24 + k * .28, .24, .72));
    this.soft.chest.v += .85 * k; this.soft.abdomen.v += .58 * k; this.soft.shoulder.v += side * .42 * k;
    if (this.impactMark) {
      this.impactMark.position.set(this.impactMarkSide * .15, .24, this.impactMarkBack ? -.294 : .294);
      this.impactMark.rotation.y = this.impactMarkBack ? Math.PI : 0;
    }
  }
  /* Reação baseada em física. A força (direção mundial `dx,dz`, intensidade, altura normalizada `hn` 0=pés…1=cabeça)
     vira impulso nas juntas perto do ponto atingido; cada junta é uma mola subamortecida, então cabeça, tronco e braços
     "chicoteiam", passam do ponto e voltam. Golpes fortes soltam o corpo (limp) para a animação ceder à física. */
  reactForce(dx, dz, force = 1, hn = .68, kind = 'punch') {
    if (this.atlasSoft) this.atlasSoft.kick(dx, dz, clamp(force, .2, 2.2));
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const yaw = this.object.rotation.y, fX = Math.sin(yaw), fZ = Math.cos(yaw);
    const lf = dx * fX + dz * fZ, ls = dx * fZ - dz * fX, F = clamp(force, .2, 2.2);
    const wH = gauss((hn - .9) / .13), wC = gauss((hn - .7) / .15), wG = gauss((hn - .54) / .12), wP = gauss((hn - .45) / .1), wL = gauss((hn - .2) / .22);
    const R = this.rag, I = (j, a, v) => { if (R[j]) R[j][a].v += v * F; };
    I('head', 'x', lf * 5.2 * (wH + .35 * wC)); I('head', 'y', ls * 4.6 * wH); I('head', 'z', -ls * 2.8 * (wH + .3 * wC)); I('neck', 'x', lf * 2.4 * wH);
    I('chest', 'x', lf * 2.2 * wC - lf * 1.2 * wG); I('chest', 'z', -ls * 2 * (wC + wH * .4)); I('chest', 'y', ls * 1.4 * wC);
    I('spine', 'x', -lf * 2.8 * wG + lf * 1.1 * wC); I('spine', 'z', -ls * 1.6 * wG);
    I('hips', 'x', lf * 1.4 * (wP + wG * .5)); I('hips', 'z', ls * 1.2 * (wP + wL * .4));
    for (const sd of ['L', 'R']) {
      const a = (wC + wH * .6 + wG * .4);
      I('ua' + sd, 'x', lf * 3.2 * a); I('ua' + sd, 'z', (sd === 'L' ? 1 : -1) * 1.2 * a * F); I('fa' + sd, 'x', -lf * 2.6 * a);
      const k = (wL + wP * .5 + wG * .25) * 2.4 + F * .3; I('th' + sd, 'x', -k * .45); I('shn' + sd, 'x', k * .8);
    }
    this.limp = Math.max(this.limp, clamp((F - .7) * .9, 0, .9));
    this.expr.pain = Math.max(this.expr.pain, clamp(.35 + F * .5, 0, 1));
    this.bodyFx.wet = clamp(this.bodyFx.wet + .05 * F, 0, 1); this.bodyFx.blood = clamp(this.bodyFx.blood + .045 * F * (kind === 'blade' ? 1.6 : 1), 0, .85);
    this.bodyFx.dirt = clamp(this.bodyFx.dirt + .012 * F, 0, 1);
  }
  /* suor/sangue/sujeira nos shaders, expressões faciais, cabelo físico, balanço de correntes e rastros de membros */
  updateBodyFx(dt, speed, s, ac) {
    const B = this.bodyFx, E = this.expr, attacking = !this.dead && this.isBusy();
    this.exert = lerp(this.exert, clamp(speed / 8, 0, 1) * .8 + (attacking ? .7 : 0), 1 - Math.exp(-dt * 1.5));
    B.wet = clamp(B.wet + dt * (this.exert * .014) - dt * .003, 0, 1); B.blood = Math.max(0, B.blood - dt * .003); B.dirt = clamp(B.dirt - dt * .0007, 0, 1);
    if (Math.abs(B.wet - B.sw) > .004 || Math.abs(B.blood - B.sb) > .004 || Math.abs(B.dirt - B.sd) > .004) { setBodyState(this.object, B.wet, B.blood, B.dirt); B.sw = B.wet; B.sb = B.blood; B.sd = B.dirt; }
    E.pain = Math.max(0, E.pain - dt * 1.3);
    E.rage = lerp(E.rage, attacking ? .7 : (this.exert > .5 ? .25 : 0), 1 - Math.exp(-dt * 4));
    E.tired = lerp(E.tired, clamp((1 - this.vital) * .9 + B.wet * .35, 0, 1), 1 - Math.exp(-dt * 1.2));
    if (this.face) this.face.update(dt, { pain: this.dead ? 0 : E.pain, rage: this.dead ? 0 : E.rage, tired: this.dead ? .6 : E.tired, breath: Math.sin(this.t * (3 + this.exert * 6)) });
    const wnd = s.wind || { x: 0, z: 0, strength: 0 };
    if (this.dread && this.cloth !== false) { this.dread.aura = .22 + this.glow * .5 + this.exert * .12; this.dread.update(dt, _v.set((wnd.x || 0) * (wnd.strength || 0) * 7, 0, (wnd.z || 0) * (wnd.strength || 0) * 7)); }
    if (this.atlasChains) { const cs = this.chainSway; cs.x.v += clamp(-ac.z * .004, -.3, .3); cs.z.v += clamp(ac.x * .004, -.3, .3); this.atlasChains.rotation.x = clamp(wobble(cs.x, 0, 60, 4, dt), -.6, .6); this.atlasChains.rotation.z = clamp(wobble(cs.z, 0, 60, 4, dt), -.6, .6); }
    if (this.cloth === false || !this.object.visible) return;
    if (!this.trails) {
      const c = new THREE.Color(this.M.S.accent); const rgb = this.charId === 'atlas' ? [.7, .35, 1] : [c.r * 1.1 + .2, c.g * 1.1 + .2, c.b * 1.1 + .2];
      this.trails = { hdL: new LimbTrail(9, rgb), hdR: new LimbTrail(9, rgb), ftL: new LimbTrail(8, rgb), ftR: new LimbTrail(8, rgb) }; for (const k in this.trails) this.chainMeshes.add(this.trails[k].mesh);
    }
    for (const k in this.trails) { const j = this.J[k]; if (j) this.trails[k].push(j.getWorldPosition(_v2), dt, HERO_CAM, k[0] === 'h' ? .085 : .11, k[0] === 'h' ? 1 : .7); }
  }
  measureLegs() {
    const J = this.J; if (!J.thL || !J.shnL || !J.ftL) return; this.object.updateMatrixWorld(true);
    const a = J.thL.getWorldPosition(new THREE.Vector3()), b = J.shnL.getWorldPosition(new THREE.Vector3()), c = J.ftL.getWorldPosition(new THREE.Vector3());
    this.leg = { a: a.distanceTo(b), b: b.distanceTo(c), hx: Math.abs(a.x), hy: a.y };
  }
  /* aura da skin cósmica: poeira estelar que orbita o corpo e brilha */
  addAura() {
    const N = 90, pos = new Float32Array(N * 3), ph = new Float32Array(N), r = (i => () => (i = (i * 16807) % 2147483647) / 2147483647)(7);
    for (let i = 0; i < N; i++) { ph[i] = r() * 1000; pos[i * 3] = 0; pos[i * 3 + 1] = r() * 3; pos[i * 3 + 2] = 0; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('ph', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: COSMIC_T, uK: { value: 1 } },
      vertexShader: 'attribute float ph;uniform float uT;uniform float uK;varying float vA;varying vec3 vC;void main(){float t=uT*(.35+fract(ph*.37)*.5)+ph;float h=fract(ph*.0137+uT*.06*(.5+fract(ph*.71)));float rr=.55+.5*fract(ph*.19)+sin(t*1.3)*.08;vec3 p=vec3(cos(t)*rr,h*3.1,sin(t)*rr);vA=sin(h*3.14159)*(.55+.45*sin(t*5.))*uK;vC=mix(vec3(.55,.9,1.),vec3(1.,.5,1.),fract(ph*.53));vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp((5.+7.*fract(ph*.91))*(22./max(-mv.z,1.)),1.,22.);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vA;varying vec3 vC;void main(){vec2 q=gl_PointCoord-.5;float d=length(q);float a=smoothstep(.5,0.,d);a*=a;float x=max(0.,1.-abs(q.x)*12.)*max(0.,1.-abs(q.y)*2.)+max(0.,1.-abs(q.y)*12.)*max(0.,1.-abs(q.x)*2.);float k=clamp((a+x*.6)*vA*.55,0.,1.);gl_FragColor=vec4(vC*1.3,k);}' });
    this.aura = new THREE.Points(g, m); this.aura.frustumCulled = false; this.aura.renderOrder = 9; this.object.add(this.aura);
  }
  build() {
    const M = this.M, J = this.J, mk = (g, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(rx, ry, rz); o.castShadow = true; o.receiveShadow = true; return o; };
    const joint = (name, parent, x, y, z) => { const o = new THREE.Bone(); o.name = name; o.position.set(x, y, z); parent.add(o); J[name] = o; return o; };
    const hips = joint('hips', this.body, 0, 1.5, 0);
    hips.add(mk(sph(.3), M.suit, 0, -.02, 0, 1.05, .62, .82));
    hips.add(mk(tor(.28, .045), M.trim, 0, .06, 0, 1.05, .85, 1, PI / 2));
    hips.add(mk(cyl(.07, .07, .04, 20), M.glow, 0, .06, .245, 1, 1, 1, PI / 2));
    hips.add(mk(sph(.16), M.armor, .2, -.06, .05, .7, 1, .9)); hips.add(mk(sph(.16), M.armor, -.2, -.06, .05, .7, 1, .9));
    const spine = joint('spine', hips, 0, .16, 0);
    spine.add(mk(cap(.21, .14), M.suit, 0, .12, 0, 1.1, 1, .85));
    for (let i = 0; i < 3; i++) spine.add(mk(cap(.055, .12, 12), M.armor, 0, .03 + i * .1, .17, 1.6, .55, .5, 0, 0, PI / 2));
    const chest = joint('chest', spine, 0, .28, 0);
    chest.add(mk(lathe('torso', [[0, -.05], [.27, -.02], [.36, .14], [.42, .34], [.38, .48], [.2, .56], [0, .57]], 40), M.armor, 0, -.04, 0, 1, 1, .7));
    chest.add(mk(sph(.25), M.armor, 0, .26, .09, 1.35, .9, .7));
    // Peitorais e placas abdominais em volumes sobrepostos: dão leitura anatômica 3D sem perder o design ciborgue.
    for (const s of [-1, 1]) chest.add(mk(sph(.145, 24, 18), M.armor, s * .155, .235, .205, 1.08, .72, .48));
    chest.add(mk(sph(.105, 20, 14), M.suit, 0, .015, .185, 1.08, .55, .42));
    chest.add(mk(cyl(.085, .085, .05, 28), M.trim, 0, .27, .255, 1, 1, 1, PI / 2));
    chest.add(mk(cyl(.06, .06, .06, 28), M.glow, 0, .27, .262, 1, 1, 1, PI / 2));
    for (const s of [-1, 1]) { chest.add(mk(cap(.016, .3, 8), M.glow, s * .17, .2, .22, 1, 1, 1, .3, 0, s * .5)); }
    chest.add(mk(cap(.15, .22), M.suit, 0, .26, -.25, 1.35, 1, .7));
    for (const s of [-1, 1]) chest.add(mk(cap(.025, .26, 8), M.glow, s * .12, .26, -.36, 1, 1, 1));
    chest.add(mk(tor(.16, .045), M.suit, 0, .52, 0, 1, 1, 1, PI / 2));
    this.scarfRing = mk(tor(.17, .07), M.scarf, 0, .5, 0, 1.1, 1.1, 1, PI / 2 - .1); chest.add(this.scarfRing);
    const neck = joint('neck', chest, 0, .5, 0); neck.add(mk(cyl(.085, .1, .16), M.suit, 0, .06, 0));
    const head = joint('head', neck, 0, .1, 0); this.headMesh = head;
    head.add(mk(sph(.27, 40, 28), M.armor, 0, .2, 0, 1, 1.08, 1.06));
    head.add(mk(visorGeo(), M.visor, 0, .2, 0, 1, 1.08, 1.06));
    for (const s of [-1, 1]) { head.add(mk(cyl(.08, .09, .08, 24), M.trim, s * .26, .19, 0, 1, 1, 1, 0, 0, PI / 2)); head.add(mk(cyl(.05, .05, .09, 24), M.glow, s * .27, .19, 0, 1, 1, 1, 0, 0, PI / 2)); }
    head.add(mk(cap(.03, .26, 10), M.armor, 0, .44, -.07, 1, 1, 2.2, -.9));
    this.anchorScarf = new THREE.Object3D(); this.anchorScarf.position.set(0, .48, -.2); chest.add(this.anchorScarf);
    this.anchorScarf2 = new THREE.Object3D(); this.anchorScarf2.position.set(.1, .46, -.19); chest.add(this.anchorScarf2);
    this.anchorCables = [-.1, 0, .1].map((x, i) => { const o = new THREE.Object3D(); o.position.set(x, .3 - Math.abs(x) * .3, -.26); head.add(o); return o; });
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;
      const sh = joint('sh' + side, chest, s * .4, .38, 0);
      sh.add(mk(sph(.19), M.armor, s * .04, .04, 0, 1.15, .85, 1.05));
      // Deltoide arredondado e transição do peitoral para o braço.
      sh.add(mk(sph(.13, 20, 14), M.suit, s * .045, -.015, .075, 1.05, .9, .62));
      sh.add(mk(tor(.15, .025), M.glow, s * .05, -.04, 0, 1, 1, 1, PI / 2, 0, s * .25));
      const ua = joint('ua' + side, sh, s * .05, -.06, 0);
      ua.add(mk(cap(.1, .32), M.suit, 0, -.26, 0));
      // Bíceps/tríceps em baixo relevo, orientados pelo osso do braço.
      ua.add(mk(sph(.078, 18, 14), M.armor, 0, -.255, .064, .94, 1.42, .62));
      ua.add(mk(sph(.068, 18, 14), M.suit, 0, -.27, -.052, .9, 1.35, .62));
      ua.add(mk(tor(.105, .022), M.trim, 0, -.42, 0, 1, 1, 1, PI / 2));
      ua.add(mk(cap(.085, .16), M.armor, s * .05, -.22, 0, 1, 1, 1.2));
      const fa = joint('fa' + side, ua, 0, -.53, 0);
      fa.add(mk(sph(.1), M.trim, 0, 0, 0, .95, .95, .95));
      fa.add(mk(cyl(.12, .1, .38, 28), M.armor, 0, -.23, 0));
      fa.add(mk(sph(.078, 18, 14), M.suit, 0, -.235, .065, .92, 1.35, .62));
      fa.add(mk(tor(.115, .02), M.glow, 0, -.1, 0, 1, 1, 1, PI / 2));
      fa.add(mk(cap(.02, .22, 8), M.glow, 0, -.25, .115));
      const hd = joint('hd' + side, fa, 0, -.44, 0);
      hd.add(mk(sph(.1), M.armor, 0, -.07, 0, 1, 1.25, .95));
      hd.add(mk(sph(.075, 18, 14), M.armor, 0, -.1, .045, 1.15, .8, .55));
      for (let k = -1; k <= 1; k++) hd.add(mk(sph(.02, 12, 10), M.glow, k * .042, -.13, .085));
      // dedos articulados (2 falanges cada) + polegar
      for (let f = 0; f < 5; f++) {
        const thumb = f === 4, fx = thumb ? s * .085 : (f - 1.5) * .04, fy = thumb ? -.06 : -.155, fz = thumb ? .045 : .02;
        const la = thumb ? .055 : [.062, .07, .066, .052][f], lb = thumb ? .05 : [.05, .056, .052, .042][f], rr = thumb ? .024 : .019;
        const a = joint('fg' + side + f + 'a', hd, fx, fy, fz); if (thumb) a.rotation.z = s * .55;
        a.add(mk(cap(rr, la - rr, 8), M.armor, 0, -la / 2, 0)); a.add(mk(sph(rr * 1.08, 10, 8), M.trim, 0, 0, 0));
        const b = joint('fg' + side + f + 'b', a, 0, -la, 0);
        b.add(mk(cap(rr * .92, lb - rr, 8), M.armor, 0, -lb / 2, 0));
        const lc = thumb ? .035 : [.038, .043, .04, .032][f], c = joint('fg' + side + f + 'c', b, 0, -lb, 0);
        c.add(mk(cap(rr * .78, Math.max(.012, lc - rr * .72), 8), M.armor, 0, -lc / 2, 0));
        (this.fingers || (this.fingers = [])).push({ a, b, c, side, f, thumb, st: { x: .02, v: 0 }, st2: { x: .02, v: 0 } });
      }
      if (side === 'R') { this.emitter = new THREE.Object3D(); this.emitter.position.set(0, -.2, .07); hd.add(this.emitter); }
      else { this.emitterL = new THREE.Object3D(); this.emitterL.position.set(0, -.2, .07); hd.add(this.emitterL); }
      const th = joint('th' + side, hips, s * .19, -.06, 0);
      th.add(mk(cap(.145, .44), M.suit, 0, -.34, 0));
      th.add(mk(sph(.15), M.armor, 0, -.3, .06, .9, 1.6, .6));
      // Quadríceps e posterior de coxa dão volume contínuo durante corrida, salto e agachamento.
      th.add(mk(sph(.105, 20, 14), M.suit, 0, -.31, .075, .94, 1.58, .62));
      th.add(mk(sph(.085, 18, 12), M.armor, 0, -.32, -.065, .92, 1.4, .62));
      th.add(mk(tor(.14, .022), M.glow, 0, -.58, 0, 1, 1, 1, PI / 2));
      const shn = joint('shn' + side, th, 0, -.72, 0);
      shn.add(mk(sph(.125), M.armor, 0, 0, .05, 1, 1, .9));
      shn.add(mk(cap(.11, .44), M.suit, 0, -.32, 0));
      // Gastrocnêmio/panturrilha em volume anatômico estilizado.
      shn.add(mk(sph(.085, 18, 14), M.armor, 0, -.29, .055, .95, 1.35, .72));
      shn.add(mk(cyl(.12, .1, .42, 28), M.armor, 0, -.34, .03, 1, 1, .85));
      shn.add(mk(cap(.018, .26, 8), M.glow, 0, -.32, .13));
      const ft = joint('ft' + side, shn, 0, -.68, 0);
      ft.add(mk(cap(.1, .2), M.armor, 0, -.035, .06, 1.15, .75, 1, PI / 2));
      ft.add(mk(cap(.095, .2), M.suit, 0, -.085, .06, 1.2, .3, 1.05, PI / 2));
      ft.add(mk(cyl(.115, .12, .14, 24), M.armor, 0, .03, 0));
    }
    // cachecol (2 pontas) e cabos do capacete
    this.chains = [new Chain(7, .16, .18, M.scarf, false), new Chain(6, .15, .14, M.scarf, false)];
    for (let i = 0; i < 3; i++) this.chains.push(new Chain(6, .1, .06, M.cable, true));
    this.chainMeshes = new THREE.Group(); this.chainMeshes.name = 'hero-cloth';
    for (const c of this.chains) this.chainMeshes.add(c.mesh);
    // luz do punho para o laser
    this.knuckleGlow = new THREE.Mesh(sph(.09, 16, 12), new THREE.MeshBasicMaterial({ color: this.M.S.accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.emitter.add(this.knuckleGlow);
    this.bake();
  }
  /* junta todas as peças em uma malha com esqueleto por material (poucas chamadas de desenho) */
  bake() {
    this.object.updateMatrixWorld(true);
    const bones = [...JOINTS.map(j => this.J[j]), ...(this.fingers || []).flatMap(f => [f.a, f.b, f.c])], byMat = new Map(), inv = new THREE.Matrix4().copy(this.object.matrixWorld).invert(), m = new THREE.Matrix4();
    bones.forEach((b, bi) => { for (const c of [...b.children]) { if (!c.isMesh) continue; let l = byMat.get(c.material); if (!l) byMat.set(c.material, l = []);
      const g = c.geometry.clone(); for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n); m.multiplyMatrices(inv, c.matrixWorld); g.applyMatrix4(m);
      const ni = g.attributes.position.count, si = new Uint16Array(ni * 4), sw = new Float32Array(ni * 4); for (let i = 0; i < ni; i++) { si[i * 4] = bi; sw[i * 4] = 1; } g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
      l.push(g); b.remove(c); } });
    const skel = new THREE.Skeleton(bones); this.skinned = [];
    for (const [mat, geos] of byMat) {
      let nv = 0, ni = 0; for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4), I = new Uint32Array(ni); let vo = 0, io = 0;
      for (const g of geos) { const n = g.attributes.position.count; P.set(g.attributes.position.array, vo * 3); N.set(g.attributes.normal.array, vo * 3); SI.set(g.attributes.skinIndex.array, vo * 4); SW.set(g.attributes.skinWeight.array, vo * 4);
        if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) I[io + i] = a[i] + vo; io += a.length; } else { for (let i = 0; i < n; i++) I[io + i] = vo + i; io += n; } vo += n; g.dispose(); }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(P, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); bg.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4)); bg.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4)); bg.setIndex(new THREE.BufferAttribute(nv > 65535 ? I : new Uint16Array(I), 1));
      const sm = new THREE.SkinnedMesh(bg, mat); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false; this.object.add(sm); sm.bind(skel, new THREE.Matrix4()); this.skinned.push(sm);
    }
    this.tris = this.skinned.reduce((s, m) => s + m.geometry.index.count / 3, 0);
    this.buildSoftBodyShell(skel, bones);
  }
  /* Camada contínua de tecido sob as placas: malha suave, pesos mistos entre juntas e deformação por vértice. */
  buildSoftBodyShell(skeleton, bones) {
    const names = ['hips','spine','chest','neck','head'];
    const ids = names.map(n => bones.indexOf(this.J[n]));
    if (ids.some(i => i < 0)) return;
    const rings = [
      [1.02,.22,.18],[1.10,.25,.20],[1.22,.27,.205],[1.34,.29,.215],
      [1.46,.31,.225],[1.58,.33,.235],[1.70,.36,.245],[1.82,.39,.255],
      [1.94,.40,.26],[2.06,.38,.245],[2.17,.34,.22],[2.27,.28,.19],
      [2.36,.19,.15],[2.44,.125,.12],[2.52,.105,.105],[2.60,.09,.09]
    ];
    const radial = 28, positions=[], uvs=[], skinIndex=[], skinWeight=[], indices=[];
    const centers = [1.50,1.66,1.94,2.44,2.54];
    for(let r=0;r<rings.length;r++){
      const [y,rx,rz]=rings[r];
      for(let j=0;j<radial;j++){
        const a=j/radial*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a);
        positions.push(ca*rx,y,sa*rz); uvs.push(j/radial,r/(rings.length-1));
        const raw=centers.map((cy,k)=>Math.exp(-Math.pow((y-cy)/.24,2)));
        const sum=raw.reduce((a,b)=>a+b,0)||1; const order=raw.map((w,k)=>({w:w/sum,k})).sort((a,b)=>b.w-a.w).slice(0,4);
        const si=[0,0,0,0], sw=[0,0,0,0];
        order.forEach((o,k)=>{si[k]=ids[o.k];sw[k]=o.w;});
        const total=sw.reduce((a,b)=>a+b,0)||1; for(let k=0;k<4;k++)sw[k]/=total;
        skinIndex.push(...si); skinWeight.push(...sw);
      }
    }
    for(let r=0;r<rings.length-1;r++) for(let j=0;j<radial;j++){
      const a=r*radial+j,b=r*radial+(j+1)%radial,c=(r+1)*radial+(j+1)%radial,d=(r+1)*radial+j;
      indices.push(a,d,b,b,d,c);
    }
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(skinIndex,4));
    g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(skinWeight,4));
    g.setIndex(indices); g.computeVertexNormals();
    const mat=this.M.suit.clone(); mat.color.set(0x62545a); mat.metalness=0; mat.roughness=.94;
    applyCinematicToon(mat,{outline:false,key:'soft-tissue'});
    const mesh=new THREE.SkinnedMesh(g,mat); mesh.name='soft-tissue-shell'; mesh.castShadow=true; mesh.receiveShadow=true; mesh.frustumCulled=false;
    this.object.add(mesh); mesh.bind(skeleton,new THREE.Matrix4());
    this.softShell=mesh; this.softShellBase=new Float32Array(g.attributes.position.array); this.softShellNormalBase=new Float32Array(g.attributes.normal.array);
    this.softShellContact=null; this.skinned.push(mesh); this.tris+=g.index.count/3;
  }
  setSoftContact(worldPoint, pressure=.08) {
    if((!this.softShell && !this.sm) || !worldPoint) return;
    this.object.updateMatrixWorld(true);
    const local=this.object.worldToLocal(worldPoint.clone());
    if(this.sm && this.rig){ local.sub(this.rig.position).divideScalar(this.rig.scale.x || 1); }
    this.softShellContact={point:local,pressure:clamp(pressure,.01,.34),life:.16};
  }
  clearSoftContact(){ this.softShellContact=null; }
  updateSoftBodyShell(front,back,left,right,breath=0) {
    const classic=!!this.sm && !this.softShell;
    if(!this.softShell && !this.sm) return;
    let g,base;
    if(classic){
      // A malha original do CYBER é contínua; clonamos somente o LOD atualmente ativo para deformar sem alterar o asset compartilhado.
      if(this.softMeshGeometry!==this.sm.geometry){ if(this.softMeshGeometry) this.softMeshGeometry.dispose(); this.sm.geometry=this.sm.geometry.clone(); this.softMeshGeometry=this.sm.geometry; this.softMeshBase=new Float32Array(this.sm.geometry.attributes.position.array); }
      g=this.sm.geometry; base=this.softMeshBase;
    } else { g=this.softShell.geometry; base=this.softShellBase; }
    const attr=g.attributes.position;
    const f=clamp(front*(classic?1.7:1.45),0,.34), b=clamp(back*(classic?1.6:1.35),0,.30), l=clamp(left*(classic?1.6:1.35),0,.30), r=clamp(right*(classic?1.6:1.35),0,.30);
    const pressure=this.softShellContact; if(pressure){pressure.life-=1/60;if(pressure.life<=0)this.softShellContact=null;}
    const cy=classic?.49:1.88, yScale=classic?.18:.27, xScale=classic?.19:.24, zScale=classic?.14:.22;
    for(let i=0;i<attr.count;i++){
      const q=i*3,x=base[q],y=base[q+1],z=base[q+2];
      const chestBand=Math.exp(-Math.pow((y-cy)/(classic?.28:.43),2));
      const frontFall=Math.exp(-((x/xScale)**2+((y-cy)/yScale)**2))*Math.max(0,z/zScale);
      const backFall=Math.exp(-((x/(classic?.2:.25))**2+((y-cy)/(classic?.2:.29))**2))*Math.max(0,-z/(classic?.12:.20));
      const sideCenter=classic?.22:.29, sideWidth=classic?.17:.22;
      const sideFallL=Math.exp(-(((x+sideCenter)/sideWidth)**2+((y-cy)/(.34*(classic?.7:1)))**2));
      const sideFallR=Math.exp(-(((x-sideCenter)/sideWidth)**2+((y-cy)/(.34*(classic?.7:1)))**2));
      let dx=(r*sideFallR-l*sideFallL)*.72, dz=(-f*frontFall+b*backFall)*.78;
      let dy=-Math.abs(breath)*(classic?.012:.018)*chestBand;
      if(pressure){
        const dxp=x-pressure.point.x,dyp=y-pressure.point.y,dzp=z-pressure.point.z;
        const fall=Math.exp(-((dxp/(classic?.12:.19))**2+(dyp/(classic?.14:.2))**2+(dzp/(classic?.11:.16))**2))*clamp(pressure.life/.16,0,1);
        const nx=pressure.point.x, nz=pressure.point.z;
        const len=Math.hypot(nx,nz)||1; dx-=nx/len*pressure.pressure*(classic?.65:1)*fall; dz-=nz/len*pressure.pressure*(classic?.65:1)*fall;
      }
      attr.array[q]=x+dx; attr.array[q+1]=y+dy; attr.array[q+2]=z+dz;
    }
    attr.needsUpdate=true;
    // O CYBER tem dezenas de milhares de vértices: atualiza normais em cadência reduzida para preservar desempenho móvel.
    this.softNormalTick=(this.softNormalTick||0)+1;
    if(!classic || this.softNormalTick%3===0) g.computeVertexNormals();
  }
  attach(scene) { scene.add(this.object); scene.add(this.chainMeshes); }
  detach() { this.object.removeFromParent(); this.chainMeshes.removeFromParent(); }

  play(name, arg) {
    if (this.dead && name !== 'revive') return { duration: 0, impact: 0 };
    if (name === 'dance') { this.dancing = true; this.danceT = 0; return { duration: 2.4, impact: 0 }; }
    if (name === 'climb') { this.climbUntil = this.t + (arg || 1.1); this.climbDur = arg || 1.1; this.dancing = false; return { duration: arg || 1.1, impact: 0 }; }
    // impulsos físicos: a pancada empurra o tronco, o pouso comprime as pernas
    if (name === 'land' || name === 'landHard' || name === 'roll') { const imp = name === 'land' ? clamp((arg || 8) / 14, .2, 1.3) : 1.6; this.bnc.v -= imp * 2.6; this.inr.x.v += imp * 5; this.inr.head.v += imp * 6; this.inr.arm.v += imp * 7; this.soft.chest.v += imp * .55; this.soft.abdomen.v += imp * .42; this.soft.shoulder.v += imp * .28; }
    if (name === 'hit') { const rel = (arg || 0) - this.object.rotation.y, f = Math.cos(rel), sd = Math.sin(rel); this.inr.x.v -= f * 9; this.inr.z.v += sd * 9; this.inr.head.v -= f * 12; this.inr.arm.v += 6; this.bnc.v -= 1.2; this.soft.chest.v += 1.05; this.soft.abdomen.v += .82; this.soft.shoulder.v += sd * .55; }
    if (name === 'jump') { this.bnc.v += 1.5; this.inr.arm.v -= 5; this.soft.abdomen.v -= .22; }
    if (name !== 'land' && name !== 'jump') this.dancing = false;
    let key = name;
    if (name === 'punch') { this.combo = this.t < this.comboUntil ? (this.combo + 1) % 3 : 0; key = 'punch' + this.combo; }
    const a = A[key]; if (!a) return { duration: 0, impact: 0 };
    if (name === 'death') { this.dead = true; this.actions.length = 0; }
    if (name === 'revive') { this.dead = false; this.actions.length = 0; }
    // ações de ataque substituem ações iguais em andamento; reações curtas sobrepõem
    if (!a.soft) this.actions = this.actions.filter(x => x.a.soft && name !== 'death');
    const scale = name === 'land' ? clamp((arg || 8) / 14, .35, 1.2) : 1;
    const rec = { a, key, name, t: 0, w: 0, scale, arg };
    this.actions.push(rec);
    if (name === 'punch') this.comboUntil = this.t + a.dur + .45;
    if (name === 'laser') this.glow = 1;
    return { duration: a.dur, impact: a.impact || 0, combo: name === 'punch' ? this.combo : 0 };
  }
  setHipY(v) { this.J.hips.position.y = v; }
  /* Alvos de contato reais: resolve os dois segmentos do braço em espaço mundial,
     para a mão encostar no corpo do outro ator em vez de atravessá-lo. */
  setContactGrip(left, right) { this.contactGrip = left || right ? { left: left ? left.clone() : null, right: right ? right.clone() : null } : null; }
  setContactElbow(point) { this.contactElbow = point ? point.clone() : null; }
  applyContactGrip() {
    const grip = this.contactGrip, elbowTarget = this.contactElbow; if ((!grip && !elbowTarget) || !this.J.uaL || !this.J.uaR) return;
    if (elbowTarget) {
      this.object.updateMatrixWorld(true); const sh=this.J.shR, ua=this.J.uaR, fa=this.J.faR, shoulder=sh.getWorldPosition(new THREE.Vector3()), q=new THREE.Quaternion(), dir=elbowTarget.clone().sub(shoulder).normalize();
      ua.parent.getWorldQuaternion(q); dir.applyQuaternion(q.invert()); ua.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir); this.object.updateMatrixWorld(true);
      fa.rotation.set(-1.85,0,0); this.object.updateMatrixWorld(true);
    }
    if (!grip) return;
    this.object.updateMatrixWorld(true);
    const axis = new THREE.Vector3(0, -1, 0), shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), target = new THREE.Vector3(), local = new THREE.Vector3();
    for (const side of ['L','R']) {
      const sh = this.J['sh'+side], ua = this.J['ua'+side], fa = this.J['fa'+side], hand = grip[side === 'L' ? 'left' : 'right'];
      if (!hand) continue;
      sh.getWorldPosition(shoulder); target.copy(hand);
      // Cotovelo ligeiramente para fora e para baixo: evita braço reto atravessando o tronco.
      const sign = side === 'L' ? 1 : -1;
      elbow.copy(shoulder).lerp(target, .53).add(new THREE.Vector3(sign * .16, -.08, .08));
      const parentQ = new THREE.Quaternion();
      ua.parent.getWorldQuaternion(parentQ); local.copy(elbow).sub(shoulder).applyQuaternion(parentQ.invert()).normalize();
      ua.quaternion.setFromUnitVectors(axis, local);
      this.object.updateMatrixWorld(true); ua.getWorldPosition(shoulder); fa.getWorldPosition(elbow);
      fa.parent.getWorldQuaternion(parentQ); local.copy(target).sub(elbow).applyQuaternion(parentQ.invert()).normalize();
      fa.quaternion.setFromUnitVectors(axis, local);
    }
    this.object.updateMatrixWorld(true);
  }
  /* dedos: alvo de fechamento conforme a ação + mola com inércia do antebraço (balançam ao golpear/correr) */
  updateFingers(dt) {
    if (!this.fingers) return;
    const act = n => this.actions.some(r => r.name === n && r.t < r.a.dur - .05);
    const solar = this.actions.find(r => r.name === 'solar');
    const solarGrip = solar && solar.t >= 3.0 && solar.t < 12.2, solarTaunt = solar && solar.t >= 27.0 && solar.t < 30, solarFlash = solar && solar.t >= 22.7 && solar.t < 26.0;
    const fist = solarGrip || solarTaunt || act('punch') || act('elbow') || act('super') || act('vault') ? 1 : act('laser') ? .72 : act('singularity') || act('orbPose') ? .42 : act('orbHold') ? .28 : 0;
    const open = solarFlash || act('wave') || act('chain') || act('flash') || act('abyssCast') || act('channel') || act('omega') ? 1 : this.dancing ? .5 : 0;
    const dead = this.dead ? 1 : 0, run = clamp((this.spd - 2) / 5, 0, 1);
    for (const F of this.fingers) {
      const fa = this.J['fa' + F.side].rotation.x, prev = F.prev ?? fa; F.prev = fa;
      const angV = clamp((fa - prev) / Math.max(dt, 1e-3), -30, 30);
      // Os dedos apontam para -Y; a flexão negativa curva as falanges para a palma (+Z).
      let base = F.thumb ? -.12 : -.08 - F.f * .018 - run * .12;
      const closed = F.thumb ? -1.12 : -1.5 - (F.f === 1 || F.f === 2 ? .1 : 0);
      base = lerp(base, closed, fist);
      base = lerp(base, F.thumb ? -.04 : .015 + F.f * .006, open);
      base = lerp(base, -.42, dead * .7);
      F.st.v -= angV * .018 * (1 - fist * .7); F.st2.v -= angV * .026 * (1 - fist * .7);
      const w = fist > .5 ? 95 : 24, x = spring(F.st, base, w, dt), y = spring(F.st2, base * (F.thumb ? .8 : .95), w * .95, dt);
      F.a.rotation.x = clamp(x, -1.75, .12); F.b.rotation.x = clamp(y, -1.7, .12);
      if (F.c) F.c.rotation.x = clamp(y * .8, -1.3, .08);
      if (!F.thumb) F.a.rotation.z = lerp((F.f - 1.5) * .035, (F.f - 1.5) * .012, fist);
    }
    // punho de verdade: a mão inteira comprime em bloco (a carne se junta) e os dedos não ficam esticados sob a malha
    const fk = spring(this.fistSt || (this.fistSt = { x: 0, v: 0 }), fist, fist > .5 ? 85 : 28, dt);
    for (const s of ['L', 'R']) { const hd = this.J['hd' + s]; if (hd) hd.scale.set(1 + .12 * fk, 1 - .15 * fk, 1 + .18 * fk); }
  }
  isBusy() { return this.dead || this.actions.some(x => !x.a.soft && x.name !== 'hit' && x.t < x.a.dur - .08); }
  setGlow(k) { this.glow = Math.max(this.glow, k); }
  hitFlash() { this.flash = 1; }
  setLOD(l) { if (l === this.lod) return; this.lod = l; for (const m of this.skinned || []) m.castShadow = l < 3; }
  setVisible(b) { this.object.visible = b; this.chainMeshes.visible = b; }
  getEmitter(out) { this.object.updateMatrixWorld(true); return this.emitter.getWorldPosition(out || new THREE.Vector3()); }
  getHand(side, out) { this.object.updateMatrixWorld(true); return (side === 'l' ? this.emitterL : this.emitter).getWorldPosition(out || new THREE.Vector3()); }

  update(dt, s = {}) {
    dt = Math.min(dt, .1); this.t += dt;
    const speed = s.speed || 0, grounded = s.grounded !== false, vy = s.vy || 0, water = s.inWater || 0, wind = s.wind || { x: .6, z: .3, strength: .4 };
    if (speed > .5 || !grounded) this.dancing = false;
    // freada: ao largar a corrida o tronco vai para trás e a passada continua 1–2 passos antes de parar
    this.prevRun = speed > this.prevRun ? speed : lerp(this.prevRun, speed, 1 - Math.exp(-5 * dt));
    if (!this.dead && grounded && this.prevRun > 5 && speed < 1.2 && this.brakeT <= 0) {
      this.brakeT = .34; this.brakeV = Math.min(6.5, this.prevRun * .75); this.brakeEvt = this.prevRun; const k = clamp(this.prevRun / 8, .4, 1.2);
      this.rag.chest.x.v -= 2.4 * k; this.rag.spine.x.v -= 1.2 * k; this.rag.hips.x.v += 1.6 * k; this.rag.head.x.v += 2 * k; this.bnc.v += 1.1 * k; this.prevRun = 0;
    }
    let spEff = speed; if (this.brakeT > 0) { this.brakeT -= dt; spEff = Math.max(speed, this.brakeV * clamp(this.brakeT / .34, 0, 1)); }
    this.spd = lerp(this.spd, spEff, 1 - Math.exp(-10 * dt));
    this.air = lerp(this.air, grounded ? 0 : 1, 1 - Math.exp(-(grounded ? 18 : 9) * dt));
    this.water = lerp(this.water, water, 1 - Math.exp(-5 * dt));
    this.aim = lerp(this.aim, s.aiming ? 1 : 0, 1 - Math.exp(-12 * dt));
    const yaw = this.object.rotation.y; if (this.lastYaw == null) this.lastYaw = yaw;
    let dy = yaw - this.lastYaw; while (dy > PI) dy -= TAU; while (dy < -PI) dy += TAU; this.lastYaw = yaw;
    const turnRate = clamp(dy / Math.max(dt, 1e-3), -8, 8); spring(this.turn, turnRate * Math.min(1, this.spd / 4), 8, dt);
    const accel = (speed - (this.prevSpeed || 0)) / Math.max(dt, 1e-3); this.prevSpeed = speed; spring(this.lean, clamp(accel * .02, -.25, .25), 6, dt);

    // ---------- locomoção ----------
    const P = this.tmp, set = (j, x, y, z) => { const o = P[j]; o[0] = x; o[1] = y; o[2] = z; };
    const v = this.spd, run = ss((v - 3.2) / 3.5), walk = ss(v / 1.4) * (1 - run), idle = 1 - ss(v / 1.0);
    const wd = this.water, stride = lerp(lerp(.75, 1.15, run), .55, wd);
    let back = 1; if (s.localVel && s.localVel.z < -.3 && Math.abs(s.localVel.z) > Math.abs(s.localVel.x)) back = -1;
    this.phase += back * dt * (v / (2 * stride)) * TAU * .5 + (v < .2 ? 0 : 0);
    const ph = this.phase, sn = Math.sin(ph), cs = Math.cos(ph);
    const legA = lerp(.42, .78, run) * ss(v / 1.2) * lerp(1, .8, wd), kneeA = lerp(.7, 1.55, run) + wd * .6;
    const swingL = Math.max(0, cs), swingR = Math.max(0, -cs);
    const br = Math.sin(this.t * 1.7) * .03; // respiração
    // variantes do parado
    this.idleT -= dt; if (this.idleT < 0) { this.idleVar = (this.idleVar + 1 + ((Math.random() * 2) | 0)) % 3; this.idleT = 5 + Math.random() * 4; }
    const ivT = clamp((5 - this.idleT) / 1.5, 0, 1) * clamp(this.idleT / 1.2, 0, 1) * idle;
    const look = this.idleVar === 1 ? Math.sin(this.t * .9) * .6 * ivT : 0, stretch = this.idleVar === 2 ? ivT : 0;
    const bob = (v > .3 ? (.5 - .5 * Math.cos(2 * ph)) * lerp(.05, .11, run) : 0) * (1 - this.air);
    const lean = run * .22 + walk * .06 + this.lean.x + wd * .12;
    set('hips', 0, sn * .14 * (run + walk) * back, -sn * .05 * (walk + run) + this.turn.x * -.05);
    set('spine', lean * .5 + br * .5, -sn * .1 * (walk + run), this.turn.x * -.06);
    set('chest', lean * .5 + br - stretch * .25, -sn * .16 * (walk + run) + look * .3, sn * .03 * run + this.turn.x * -.05);
    set('neck', -lean * .4, look * .4, 0);
    set('head', -lean * .45 - br + stretch * -.3, look * .6 + sn * .08 * (walk + run), -this.turn.x * .04);
    const thL = -legA * sn, thR = legA * sn;
    set('thL', thL - run * .05 - wd * .25 * swingL, 0, .03 + wd * .05);
    set('thR', thR - run * .05 - wd * .25 * swingR, 0, -.03 - wd * .05);
    const kneeIdle = .06 + .03 * Math.sin(this.t * 1.7);
    set('shnL', kneeIdle + (kneeA * swingL * swingL + .15 * (walk + run)) * ss(v / 1.0), 0, 0);
    set('shnR', kneeIdle + (kneeA * swingR * swingR + .15 * (walk + run)) * ss(v / 1.0), 0, 0);
    set('ftL', -(P.thL[0] + P.shnL[0]) * .9 + swingL * .3 * run, 0, 0);
    set('ftR', -(P.thR[0] + P.shnR[0]) * .9 + swingR * .3 * run, 0, 0);
    const armA = lerp(.35, .95, run) * ss(v / 1.2), elbow = lerp(.25, 1.55, run) + walk * .2;
    const relaxL = .12 + .04 * Math.sin(this.t * 1.7 + 1), relaxR = .12 + .04 * Math.sin(this.t * 1.7);
    set('shL', 0, 0, stretch * .2); set('shR', 0, 0, -stretch * .2);
    set('uaL', armA * sn * .9 - stretch * 2.2, 0, relaxL + run * .12 + wd * .5 - stretch * .2);
    set('uaR', -armA * sn * .9 - stretch * 2.2, 0, -relaxR - run * .12 - wd * .5 + stretch * .2);
    set('faL', -(.2 + elbow + Math.max(0, sn) * .35 * run) + stretch * .6, 0, 0);
    set('faR', -(.2 + elbow + Math.max(0, -sn) * .35 * run) + stretch * .6, 0, 0);
    set('hdL', -.05, 0, 0); set('hdR', -.05, 0, 0);
    // no ar: subir encolhe, cair estende
    if (this.air > .01) {
      const up = ss(vy / 6), down = ss(-vy / 8), a = this.air, mixJ = (j, x, y, z) => { const o = P[j]; o[0] = lerp(o[0], x, a); o[1] = lerp(o[1], y, a); o[2] = lerp(o[2], z, a); };
      mixJ('thL', lerp(-.4, -1.0, up) + down * .25, 0, .08); mixJ('thR', lerp(-.1, -.5, up) + down * .1, 0, -.08);
      mixJ('shnL', lerp(.6, 1.5, up) - down * .3, 0, 0); mixJ('shnR', lerp(.3, 1.2, up) - down * .1, 0, 0);
      mixJ('ftL', -.2 + down * .3, 0, 0); mixJ('ftR', -.1 + down * .3, 0, 0);
      mixJ('uaL', lerp(-1.2, -.6, down), 0, lerp(.5, 1.0, down)); mixJ('uaR', lerp(-1.6, -.6, down), 0, -lerp(.4, 1.0, down));
      mixJ('faL', -.6, 0, 0); mixJ('faR', -.5, 0, 0); mixJ('chest', .1 - down * .15, 0, 0); mixJ('head', -.05 + down * .1, 0, 0);
    }
    // dança (emote em loop)
    if (this.dancing) {
      this.danceT += dt; const d = this.danceT * TAU / 1.2, d2 = Math.sin(d), d3 = Math.sin(d * 2);
      set('hips', 0, d2 * .3, d2 * .12); set('spine', .05, -d2 * .2, -d2 * .1); set('chest', .05 + d3 * .05, -d2 * .2, -d2 * .08); set('head', d3 * .15, d2 * .3, d2 * .1);
      set('uaL', -1.2 + d3 * .6, 0, .9 + d2 * .4); set('faL', -1.4 - d3 * .3, 0, 0); set('uaR', -1.2 - d3 * .6, 0, -.9 + d2 * .4); set('faR', -1.4 + d3 * .3, 0, 0);
      set('thL', -.25 - Math.max(0, d2) * .5, 0, .1); set('shnL', .45 + Math.max(0, d2) * .8, 0, 0); set('thR', -.25 - Math.max(0, -d2) * .5, 0, -.1); set('shnR', .45 + Math.max(0, -d2) * .8, 0, 0);
      set('ftL', -.2, 0, 0); set('ftR', -.2, 0, 0);
    }
    // mira: braço direito à frente
    if (this.aim > .01) { const a = this.aim, o = P.uaR, f = P.faR; o[0] = lerp(o[0], -1.45, a); o[1] = lerp(o[1], .12, a); o[2] = lerp(o[2], .1, a); f[0] = lerp(f[0], -.15, a); P.chest[1] = lerp(P.chest[1], .25, a); }

    // ---------- camadas de ação ----------
    let rootY = 0, rootRx = 0, rootRz = 0, rootZ = 0, rootRy = 0;
    for (let i = 0; i < this.actions.length; i++) {
      const r = this.actions[i], a = r.a; r.t += dt;
      const fin = a.hold ? 1 : ss((a.dur - r.t) / .1), win = r.name === 'death' || r.name === 'revive' ? 1 : ss(r.t / .05); r.w = Math.min(win, fin) * (r.name === 'land' ? r.scale : 1);
      const tt = Math.min(r.t, a.dur); sampleAction(a, tt, this.act);
      for (const j of a.joints) { const o = P[j], q = this.act[j]; o[0] = lerp(o[0], q[0], r.w); o[1] = lerp(o[1], q[1], r.w); o[2] = lerp(o[2], q[2], r.w); }
      if (a.rootY) rootY += track(a.rootY, tt) * (r.name === 'land' ? r.scale : 1) * (a.hold || r.name === 'revive' ? 1 : r.w);
      if (a.rootRx) rootRx += track(a.rootRx, tt); if (a.rootRz) rootRz += track(a.rootRz, tt) * r.w; if (a.rootZ) rootZ += track(a.rootZ, tt);
      if (a.lunge) rootZ += a.lunge * Math.sin(PI * clamp(tt / (a.impact * 1.8), 0, 1)) * r.w;
      if (a.spin) rootRy += a.spin * s5(clamp((tt - .05) / (a.impact * 1.5), 0, 1)) - (tt > a.dur - .02 ? 0 : 0);
      if (r.name === 'hit' && r.arg != null) rootRz += Math.sin(PI * clamp(tt / .38, 0, 1)) * .08;
    }
    this.actions = this.actions.filter(r => r.a.hold || r.t < r.a.dur);
    if (this.actions.some(r => r.name === 'orbHold')) { const bb = Math.sin(this.t * 1.7); P.uaR[0] += bb * .025; P.faR[0] -= bb * .02; P.uaL[2] += bb * .015; }
    if (this.dead) { const last = this.actions.find(r => r.name === 'death'); if (last && last.t > last.a.dur) last.t = last.a.dur; }
    if (rootRy >= TAU - 1e-3) rootRy = 0;

    // ---------- física do corpo ----------
    const op = this.object.position, yawN = this.object.rotation.y, fX = Math.sin(yawN), fZ = Math.cos(yawN);
    if (!this.prevP) this.prevP = op.clone();
    const wv = _v3.subVectors(op, this.prevP).divideScalar(Math.max(dt, 1e-3)); if (wv.lengthSq() > 900) wv.set(0, 0, 0); this.prevP.copy(op);
    const ac = _v4.subVectors(wv, this.prevV).divideScalar(Math.max(dt, 1e-3)); this.prevV.copy(wv);
    if (this.atlasRig) stepRigged(this, dt, ac); else if (this.atlasSoft) { stepAtlasSoft(this, dt, ac); }
    const aF = clamp(ac.x * fX + ac.z * fZ, -60, 60), aS = clamp(ac.x * fZ - ac.z * fX, -60, 60), aY = grounded ? clamp(ac.y, -80, 80) : 0;
    // inércia: o tronco atrasa nas arrancadas/freadas e tomba para fora nas curvas; a cabeça e os braços balançam depois
    this.inr.x.v += -aF * .012 * dt * 60 * (this.dead ? 0 : 1); this.inr.z.v += (aS * .01 + this.turn.x * -.02) * dt * 60;
    const ix = wobble(this.inr.x, 0, 90, 9, dt), iz = wobble(this.inr.z, 0, 80, 9, dt);
    this.inr.head.v += (-aF * .02 - aY * .006) * dt * 60; const ih = wobble(this.inr.head, 0, 120, 10, dt);
    this.inr.arm.v += (Math.abs(aF) * .01 + Math.abs(aS) * .012 + Math.abs(aY) * .006) * dt * 60; const ia = wobble(this.inr.arm, 0, 70, 7, dt);
    this.bnc.v += -aY * .004 * dt * 60; const bn = wobble(this.bnc, 0, 160, 13, dt);
    const ikOn = !this.dead && !this.dancing, clampI = x => clamp(x, -.6, .6);
    // Camada de tecido secundário: atraso elástico do tronco, abdômen e cintura escapular.
    // É uma aproximação procedural estável para mobile, não um solver FEM de carne.
    const windSoft = s.wind || { x: 0, z: 0, strength: 0 };
    const windF = ((windSoft.x || 0) * fX + (windSoft.z || 0) * fZ) * (windSoft.strength || 0);
    const windS = ((windSoft.x || 0) * fZ - (windSoft.z || 0) * fX) * (windSoft.strength || 0);
    this.soft.chest.v += (aF * -.0009 + aY * -.00045 + windF * -.012) * dt * 60;
    this.soft.abdomen.v += (bn * -.018 + aF * -.00035 + windF * -.008) * dt * 60;
    this.soft.shoulder.v += (aS * .0008 + windS * .018) * dt * 60;
    const softChest = spring(this.soft.chest, 0, 18, dt), softAbd = spring(this.soft.abdomen, 0, 14, dt), softShoulder = spring(this.soft.shoulder, 0, 16, dt);
    // O impacto deforma a região atingida e transmite a força às juntas vizinhas.
    const hitFront = spring(this.impactBody.front, 0, 20, dt), hitBack = spring(this.impactBody.back, 0, 19, dt);
    const hitLeft = spring(this.impactBody.left, 0, 21, dt), hitRight = spring(this.impactBody.right, 0, 21, dt);
    const hitHead = spring(this.impactBody.head, 0, 23, dt);
    const hitSide = hitRight - hitLeft, hitTorso = hitFront - hitBack;
    // A malha contínua recebe uma depressão localizada real, além da reação das juntas.
    this.updateSoftBodyShell(hitFront, hitBack, hitLeft, hitRight, softChest + softAbd);
    P.chest[0] += clamp(hitTorso * .085, -.22, .22);
    P.spine[0] += clamp(hitTorso * .045, -.12, .12);
    P.chest[2] += clamp(hitSide * .055, -.14, .14);
    P.spine[2] += clamp(hitSide * .035, -.1, .1);
    P.head[0] -= clamp(hitHead * .07, -.12, .12);
    P.head[2] -= clamp(hitSide * .035, -.08, .08);
    P.uaL[2] += clamp(hitLeft * .08, -.12, .12); P.uaR[2] -= clamp(hitRight * .08, -.12, .12);
    P.faL[0] -= clamp(hitLeft * .035, -.08, .08); P.faR[0] -= clamp(hitRight * .035, -.08, .08);
    // ragdoll parcial: molas subamortecidas por junta alimentadas por reactForce()
    for (const j in this.rag) { const r = this.rag[j], kc = RAGK[j], p = P[j]; if (!p) continue;
      p[0] += clamp(wobble(r.x, 0, kc[0], kc[1], dt), -.7, .7); p[1] += clamp(wobble(r.y, 0, kc[0], kc[1], dt), -.6, .6); p[2] += clamp(wobble(r.z, 0, kc[0], kc[1], dt), -.6, .6); }
    if (ikOn) {
      P.spine[0] += clampI(ix) * .5; P.chest[0] += clampI(ix) * .7; P.head[0] += clampI(ih) * .5 - clampI(ix) * .4;
      P.chest[2] += clampI(iz) * .6 + clamp(windS * .012, -.12, .12); P.spine[2] += clampI(iz) * .3 + clamp(softAbd, -.08, .08) + clamp(windS * .006, -.08, .08); P.head[2] -= clampI(iz) * .3 + clamp(windS * .004, -.05, .05); P.chest[0] += clamp(windF * .008, -.08, .08);
      P.uaL[2] += clamp(softShoulder, -.06, .06); P.uaR[2] -= clamp(softShoulder, -.06, .06);
      const aw = clamp(ia, -.5, .8); P.uaL[2] += aw * .5; P.uaR[2] -= aw * .5; P.faL[0] -= Math.max(0, aw) * .4; P.faR[0] -= Math.max(0, aw) * .4;
      const cmp = clamp(-bn, -.15, .45); for (const sd of ['L', 'R']) { P['th' + sd][0] -= cmp * .9; P['shn' + sd][0] += cmp * 1.8; P['ft' + sd][0] -= cmp * .9; } P.chest[0] += cmp * .4;
    }
    // ladeira: inclina o corpo para a subida; muito íngreme = escala com mãos e pés
    this.slopeS = lerp(this.slopeS, clamp(s.slope || 0, -1.5, 2), 1 - Math.exp(-8 * dt));
    this.scr = lerp(this.scr, clamp(s.scramble || 0, 0, 1), 1 - Math.exp(-6 * dt));
    if (ikOn && grounded) { const sl = clamp(this.slopeS, -.8, 1.2); P.spine[0] += sl * .18; P.chest[0] += sl * .2; P.head[0] -= sl * .15; }
    const climbing = this.t < this.climbUntil; this.climbW = lerp(this.climbW, climbing ? 1 : 0, 1 - Math.exp(-(climbing ? 14 : 8) * dt));
    const cw = Math.max(this.climbW, this.scr * .85);
    if (cw > .01 && !this.dead) {
      this.climbPh += dt * (climbing ? TAU * 1.6 : TAU * clamp(v / 2.2, .3, 1.4)); const c1 = Math.sin(this.climbPh), c2 = Math.cos(this.climbPh), up = climbing ? clamp((this.climbUntil - this.t) / (this.climbDur || 1), 0, 1) : 1;
      const mixJ = (j, x, y, z) => { const o = P[j]; o[0] = lerp(o[0], x, cw); o[1] = lerp(o[1], y, cw); o[2] = lerp(o[2], z, cw); };
      const reach = climbing ? lerp(-1.1, -2.9, up) : -1.5; // braços sobem, agarram e puxam; pernas empurram alternando
      mixJ('uaL', reach + c1 * .55, 0, .25); mixJ('faL', -.35 - Math.max(0, -c1) * 1.1, 0, 0); mixJ('uaR', reach - c1 * .55, 0, -.25); mixJ('faR', -.35 - Math.max(0, c1) * 1.1, 0, 0);
      mixJ('hdL', .5, 0, 0); mixJ('hdR', .5, 0, 0);
      mixJ('thL', -1.0 - c1 * .55, 0, .12); mixJ('shnL', 1.2 + Math.max(0, c1) * .8, 0, 0); mixJ('thR', -1.0 + c1 * .55, 0, -.12); mixJ('shnR', 1.2 + Math.max(0, -c1) * .8, 0, 0);
      mixJ('ftL', .3, 0, 0); mixJ('ftR', .3, 0, 0); mixJ('chest', climbing ? .25 + (1 - up) * .5 : .55, c2 * .15, c1 * .06); mixJ('spine', climbing ? .2 : .4, c2 * .1, 0); mixJ('head', -.45, c2 * .1, 0); mixJ('hips', 0, c1 * .12, 0);
      this.climbHand = c1;
    }
    // pés no chão (IK de 2 ossos): cada pé procura o chão embaixo dele, o quadril desce e o outro joelho dobra
    let ikDrop = 0;
    if (s.ground && this.leg && ikOn && cw < .6) {
      const L = this.leg, wIK = (1 - this.air) * (1 - run * .55) * (1 - cw), base = op.y, sX = fZ, sZ = -fX;
      const footG = (side, th) => { const sx = side * L.hx * 1.05, fwd = -Math.sin(th) * (L.a + L.b) * .9; return s.ground(op.x + sX * sx + fX * fwd, op.z + sZ * sx + fZ * fwd) - base; };
      const gL = clamp(footG(1, this.st.thL[0].x), -1.2, 1.2), gR = clamp(footG(-1, this.st.thR[0].x), -1.2, 1.2);
      const yL = spring(this.ikL, gL, 18, dt), yR = spring(this.ikR, gR, 18, dt);
      ikDrop = spring(this.ikDrop, Math.max(0, -Math.min(yL, yR, 0)) * wIK, 16, dt);
      const bend = (c, side) => { const l0 = L.a + L.b - .02, l = clamp(l0 - c, l0 * .45, l0), cosK = clamp((L.a * L.a + L.b * L.b - l * l) / (2 * L.a * L.b), -1, 1), k = (PI - Math.acos(cosK)) * wIK; P['th' + side][0] -= k * L.b / (L.a + L.b); P['shn' + side][0] += k; P['ft' + side][0] -= k * L.a / (L.a + L.b); };
      bend(Math.max(0, yL + ikDrop), 'L'); bend(Math.max(0, yR + ikDrop), 'R');
    }

    // ---------- aplica com molas ----------
    this.limp = Math.max(0, this.limp - dt * 2.1); if (this.dead) this.limp = Math.max(this.limp, .55);
    const w = (this.dead ? 22 : 30) * (1 - this.limp * .5);
    for (const j of JOINTS) {
      const o = this.J[j].rotation, st = this.st[j], p = P[j], ww = j === 'head' || j === 'neck' ? w * .7 : j.startsWith('fa') || j.startsWith('hd') ? w * .85 : w;
      o.x = spring(st[0], p[0], ww, dt); o.y = spring(st[1], p[1], ww, dt); o.z = spring(st[2], p[2], ww, dt);
    }
    // Deformação secundária pequena nos ossos já ponderados da malha: compressão/expansão
    // acompanha impactos, aceleração e vento sem acrescentar ossos sem pesos de skinning.
    const chestPulse = clamp(softChest * .11, -.075, .075), abdPulse = clamp(softAbd * .085, -.06, .06);
    const dentFront = clamp(hitFront * .95, -.3, .34), dentBack = clamp(hitBack * .9, -.28, .32), dentSide = clamp(hitSide * .9, -.28, .28);
    if (this.J.chest) this.J.chest.scale.set(1 + chestPulse + Math.abs(dentFront + dentBack) * .2, 1 - chestPulse * .42 + Math.abs(dentFront + dentBack) * .1, 1 + chestPulse * .7 - dentFront - dentBack - Math.abs(dentSide) * .35);
    if (this.J.spine) this.J.spine.scale.set(1 - abdPulse * .35 + Math.abs(dentSide) * .15, 1 + abdPulse + Math.abs(dentFront + dentBack) * .12, 1 - abdPulse * .25 - Math.abs(dentSide) * .25);
    if (this.J.hips) this.J.hips.scale.set(1 + abdPulse * .25, 1 - abdPulse * .18, 1 + abdPulse * .25);
    this.impactMarkAlpha = Math.max(0, this.impactMarkAlpha - dt * .22);
    if (this.impactMark && this.impactMark.materials) { this.impactMark.materials[0].opacity = this.impactMarkAlpha * .42; this.impactMark.materials[1].opacity = this.impactMarkAlpha * .62; }
    // Flexão muscular secundária: discretamente acompanha a pose e a passada.
    // Nos personagens skinned (CYBER) os pesos novos deformam a malha; no rig procedural
    // as formas anatômicas são filhas das mesmas juntas e acompanham o movimento.
    for (const side of ['L', 'R']) {
      const ua = this.J['ua' + side], fa = this.J['fa' + side], th = this.J['th' + side], shn = this.J['shn' + side], sh = this.J['sh' + side];
      const armFlex = clamp(.006 + run * .018 + Math.abs(ua?.rotation.x || 0) * .014 + Math.max(0, -(fa?.rotation.x || 0)) * .012, .006, .052);
      const foreFlex = clamp(.004 + run * .012 + Math.abs(fa?.rotation.x || 0) * .012, .004, .038);
      const legFlex = clamp(.006 + run * .022 + Math.abs(th?.rotation.x || 0) * .009, .006, .048);
      const calfFlex = clamp(.004 + run * .016 + Math.abs(shn?.rotation.x || 0) * .01, .004, .04);
      if (sh) { const sideHit = side === 'L' ? hitLeft : hitRight; sh.scale.set(1 + armFlex * .28 - Math.max(0, sideHit) * .025, 1 + Math.max(0, sideHit) * .035, 1 + armFlex * .55 - Math.max(0, sideHit) * .02); }
      if (ua) ua.scale.set(1 + armFlex, 1, 1 + armFlex * .72);
      if (fa) fa.scale.set(1 + foreFlex * .7, 1, 1 + foreFlex);
      if (th) th.scale.set(1 + legFlex * .72, 1, 1 + legFlex);
      if (shn) shn.scale.set(1 + calfFlex * .7, 1, 1 + calfFlex);
      const A = this.anatomyBones;
      if (A) {
        const pec = A['pec_' + side], bi = A['bicep_' + side], quad = A['quad_' + side], calf = A['calf_' + side];
        if (pec) pec.scale.set(1 + Math.abs(softChest) * .012, 1 + Math.abs(softChest) * .006, 1 + Math.abs(softChest) * .018);
        if (bi) bi.scale.set(1 + armFlex * 1.45, 1 + armFlex * .22, 1 + armFlex * 1.55);
        if (quad) quad.scale.set(1 + legFlex * 1.25, 1 + legFlex * .12, 1 + legFlex * 1.35);
        if (calf) calf.scale.set(1 + calfFlex * 1.2, 1 + calfFlex * .1, 1 + calfFlex * 1.2);
      }
    }
    const hipBase = 1.5 - bob - wd * .1 - run * .04 + Math.sin(this.t * 1.7) * .008 * idle + (ikOn ? clamp(bn, -.45, .2) * .9 - ikDrop - this.climbW * .25 : 0);
    this.setHipY(spring(this.root.hipY, hipBase, 26, dt));
    this.updateFingers(dt);
    this.body.position.y = spring(this.root.y, rootY, 30, dt);
    this.body.position.z = spring(this.root.z, rootZ, 30, dt);
    this.body.rotation.x = -spring(this.root.rx, rootRx, 26, dt);
    this.body.rotation.z = spring(this.root.rz, rootRz, 22, dt);
    this.body.rotation.y = rootRy;   // giro do golpe final não usa mola (evita giro reverso)
    this.object.updateMatrixWorld(true); this.applyContactGrip();
    const rl = this.actions.find(r => r.name === 'roll');
    if (rl) { const k = clamp(rl.t / rl.a.dur, 0, 1), al = -TAU * s5(clamp((k - .05) / .8, 0, 1)), c = .85; this.body.rotation.x = al; this.body.position.y += c - c * Math.cos(al); this.body.position.z -= c * Math.sin(al); }
    // brilho cósmico
    if (this.aura) { tickCosmic(this.t); this.aura.material.uniforms.uK.value = Math.min(1.8, 1 + this.spd / 10 + this.glow * .6); }
    if (this.dead || this.actions.some(r => r.name === 'revive')) this.body.position.y += 0;

    // ATLAS: balanço secundário dos dreadlocks e pulsação do núcleo peitoral.
    if (this.atlasHair) { const runK=clamp(this.spd/8,0,1), hitK=this.soft.chest.x; this.atlasHair.rotation.x=.08+Math.sin(this.t*5.2)*(.035+runK*.09)-hitK*.12; this.atlasHair.rotation.z=Math.sin(this.t*3.1)*(.025+runK*.055); }
    if (this.atlasCore) { const pulse=1+.08*Math.sin(this.t*4.4)+this.glow*.12; this.atlasCore.scale.setScalar(pulse); }
    if (this.atlasCoat) { const runK=clamp(this.spd/8,0,1); this.atlasCoat.rotation.x=Math.sin(this.t*4.8)*(.025+runK*.12); this.atlasCoat.rotation.z=Math.sin(this.t*2.9)*(.02+runK*.07); }
    // ---------- brilhos ----------
    this.glow = Math.max(0, this.glow - dt * 2.2); this.flash = Math.max(0, this.flash - dt * 5);
    const laser = this.actions.find(r => r.name === 'laser'), charge = laser ? (laser.t < .15 ? laser.t / .15 : Math.max(0, 1 - (laser.t - .15) / .2)) : 0;
    this.knuckleGlow.material.opacity = charge * .9; this.knuckleGlow.scale.setScalar(.6 + charge * 1.4);
    this.M.glow.emissiveIntensity = 2.2 + this.glow * 3 + this.flash * 2;
    this.M.armor.emissive.setRGB(this.flash * .9, this.flash * .2, this.flash * .2);
    const deadK = this.actions.find(r => r.name === 'death'); this.M.visor.emissiveIntensity = deadK ? Math.max(0, 0.9 * (1 - deadK.t / 1.2)) : 0.9 * (.85 + .15 * Math.sin(this.t * 3));

    this.updateBodyFx(dt, speed, s, ac);
    // ---------- tecido e cabos ----------
    if (this.cloth === false) { this.chainMeshes.visible = false; return; } this.chainMeshes.visible = this.object.visible;
    this.object.updateMatrixWorld(true);
    const chestW = this.J.chest.getWorldPosition(_v), hipsW = this.J.hips.getWorldPosition(_v2);
    const cols = [{ x: chestW.x, y: chestW.y + .25, z: chestW.z, r: .44 }, { x: hipsW.x, y: hipsW.y, z: hipsW.z, r: .36 },
      { x: hipsW.x, y: hipsW.y - .6, z: hipsW.z, r: .26 }];
    const fy = Math.sin(this.object.rotation.y), fz = Math.cos(this.object.rotation.y);
    const side = new THREE.Vector3(fz, 0, -fy);
    const gust = .6 + .4 * Math.sin(this.t * 1.3) * Math.sin(this.t * 2.7 + 1), ws = (wind.strength ?? .4) * 9 * gust;
    const force = new THREE.Vector3((wind.x || 0) * ws + Math.sin(this.t * 7.1) * .8, -9.8, (wind.z || 0) * ws + Math.cos(this.t * 6.3) * .8);
    // inércia do corpo: tecido e cabos ficam para trás nas arrancadas e chicoteiam nos golpes rápidos
    force.x -= clamp(ac.x, -50, 50) * .55; force.z -= clamp(ac.z, -50, 50) * .55; force.y -= clamp(ac.y, -40, 40) * .25;
    const floor = this.object.position.y;
    const anchors = [this.anchorScarf, this.anchorScarf2, ...this.anchorCables];
    for (let i = 0; i < this.chains.length; i++) {
      const c = this.chains[i]; c.floor = floor; const a = anchors[i].getWorldPosition(new THREE.Vector3());
      const f = i < 2 ? force : new THREE.Vector3(force.x * .6, -9.8, force.z * .6);
      c.step(dt, a, f, i < 2 ? cols : [{ x: cols[0].x, y: cols[0].y + .55, z: cols[0].z, r: .3 }, cols[0]], side);
    }
  }
  dispose() { this.detach(); for (const c of this.chains) c.geo.dispose(); for (const m of this.skinned || []) m.geometry.dispose(); if (this.impactMark) { for (const c of this.impactMark.children) { c.geometry.dispose(); if (c.material && c.material.dispose) c.material.dispose(); } } for (const k in this.M) if (this.M[k].dispose) this.M[k].dispose(); this.knuckleGlow.material.dispose(); }
}
Hero.Chain = Chain;
export function createHero(skinId = 'cyber') { return new Hero(skinId); }

/* ---------- retrato animado para menus ---------- */
export function createPortrait(canvas, skinId = 'cyber', opts = {}) {
  // no app Android/celular o retrato usa menos resolução e sombra simples (o lobby não pesa no aparelho)
  const LITE = !!opts.lite || location.hostname === 'appassets.androidplatform.net' || matchMedia('(pointer: coarse)').matches;   // opts.lite: colegas do grupo no lobby (30 FPS, menos resolução)
  const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: !LITE, powerPreference: 'low-power' });
  r.setPixelRatio(Math.min(LITE ? 1.25 : 2, window.devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  r.shadowMap.enabled = true; r.shadowMap.type = LITE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, .1, 50);
  cam.position.set(0, 1.9, 6.7); cam.lookAt(0, 1.5, 0);
  scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x302838, 1.0));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.6); key.position.set(3, 6, 4); key.castShadow = true; key.shadow.mapSize.set(LITE ? 512 : 1024, LITE ? 512 : 1024); Object.assign(key.shadow.camera, { left: -3, right: 3, top: 4, bottom: -1, near: 1, far: 15 }); key.shadow.bias = -.0004; scene.add(key);
  const rim = new THREE.DirectionalLight(0x58e6ff, 2.2); rim.position.set(-4, 3, -4); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xff5a9a, 1.0); rim2.position.set(4, 2, -3); scene.add(rim2);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.ShadowMaterial({ opacity: .35 })); ground.rotation.x = -PI / 2; ground.receiveShadow = true; scene.add(ground);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.25, 64), new THREE.MeshBasicMaterial({ color: 0x38f2ff, transparent: true, opacity: .55 })); ring.rotation.x = -PI / 2; ring.position.y = .01; scene.add(ring);
  useHeroEnv(r);
  // piso de verdade: o personagem cai, pisa e anda sobre ele (física igual à do mapa)
  const floorM = new THREE.MeshStandardMaterial({ color: 0x1a2230, metalness: .6, roughness: .35, envMap: heroEnv(), envMapIntensity: .6 });
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.25, .16, 64), floorM); floor.position.y = -.095; floor.receiveShadow = true; scene.add(floor);
  applyCinematicToonScene(scene);
  const make = id => { useHeroEnv(r); const hh = (opts.factory || (k => new Hero(k)))(id); hh.neutral = true; return hh; };
  const B = { y: 0, vy: 0, g: true, yaw: 0, yawV: 0, hopT: 0 };
  let hero = make(skinId); hero.attach(scene); hero.object.position.y = 0;
  const drop = () => { B.y = 0; B.vy = 0; B.g = true; hero.object.position.y = 0; };
  let raf = 0, last = performance.now(), t = 0, nextAct = Infinity, ai = 0, drag = null, yawOff = 0, alive = true, downX = 0, downT = 0;
  // Retratos ficam em pose neutra. Ações só rodam se uma tela as pedir explicitamente.
  const seq = opts.actions || [];
  const resize = () => { const w = canvas.clientWidth || 300, h = canvas.clientHeight || 400; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  resize(); addEventListener('resize', resize);
  canvas.addEventListener('pointerdown', e => { drag = e.clientX; downX = e.clientX; downT = performance.now(); canvas.setPointerCapture?.(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (drag != null) { B.yawV = (e.clientX - drag) * .012 / Math.max(.008, 1 / 60); yawOff += (e.clientX - drag) * .012; drag = e.clientX; } });
  canvas.addEventListener('pointerup', () => { drag = null; });
  const loop = now => {
    if (!alive) return; raf = requestAnimationFrame(loop);
    // escondido (outra tela aberta, app em segundo plano): não desenha nada
    if (document.hidden || !canvas.clientWidth || !canvas.clientHeight) { last = now; return; }
    if (LITE && now - last < 1000 / 30 - 2) return; // retrato do menu a 30 FPS no celular
    const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt;
    if (canvas.clientWidth && (Math.abs(canvas.width - canvas.clientWidth * r.getPixelRatio()) > 2)) resize();
    nextAct -= dt; if (seq.length && nextAct < 0 && B.g && !hero.isBusy()) { const n = seq[ai++ % seq.length];
      if (n === 'hop') { B.vy = 6.5; B.g = false; hero.play('jump'); nextAct = 2.2; }
      else { const p = hero.play(n); nextAct = n === 'dance' ? 3.2 : n === 'punch' ? p.duration - .05 : (p.duration || 1) + 1.6; opts.onAct && opts.onAct(n, p.duration || 0, hero); } }
    // Retrato apoiado no chão: sem queda inicial, pulos ou passos automáticos.
    hero.object.position.y = 0;
    if (drag == null) B.yawV = 0;
    hero.object.rotation.y = yawOff;
    // Sem vento artificial no retrato; a rotação só muda enquanto o usuário arrasta com o dedo.
    hero.update(dt, { speed: 0, grounded: true, vy: 0, ground: () => 0, wind: { x: 0, z: 0, strength: 0 } });
    ring.material.opacity = .4 + .2 * Math.sin(t * 2);
    if (opts.onFrame) try { opts.onFrame(dt, hero, scene, cam); } catch (_) { }
    r.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);
  return {
    hero: () => hero,
    play: n => hero.play(n),
    setSkin(id) { hero.dispose(); hero = make(id); hero.attach(scene); drop(); },
    setFactory(f, id) { const sk = id || hero.skin; hero.dispose(); opts.factory = f; hero = make(sk); hero.attach(scene); drop(); },
    dispose() { alive = false; cancelAnimationFrame(raf); opts.onDispose && opts.onDispose(); removeEventListener('resize', resize); hero.dispose(); r.dispose(); try { r.forceContextLoss(); } catch (_) { } },
  };
}
