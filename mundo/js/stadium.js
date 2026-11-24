/* CyberArena · Estádio (v155) — mapa de futebol totalmente 3D, em duas variações: DOURADO (pôr do sol) e AZUL (noite).
   Fica em x = REALM_X e tem a mesma interface de colisão do World/Realm (terrainAt, groundAt, collide, blockers…),
   então os personagens andam nele como em qualquer outro mapa. Texturas provisórias são desenhadas por código; se existirem
   arquivos em assets/estadio/<nome>/{color,normal,rough,ao}.webp eles substituem as provisórias (ver STAD_TEX). */
import * as THREE from '../lib/three.module.min.js';
import { REALM_X } from './realm.js';
import { U } from './world.js';
import { box, cap } from './ballphys.js';

const PI = Math.PI, TAU = PI * 2;
export const FIELD = { L: 96, W: 60, GW: 4.0, GH: 2.6, GD: 2.4, HL: 48, HW: 30, BX: 36.4, BZ: 55.4, CX: REALM_X, CZ: 0 };
const { HL, HW, GW, GH, GD, BX, BZ } = FIELD;

export const VENUES = {
  gold: {
    name: 'Estádio Dourado', skyTop: [.05, .16, .30], skyMid: [.22, .38, .52], skyHor: [.95, .5, .18], sunDir: [-.62, .34, .7], stars: 0,
    fog: 0xd49560, fogN: 110, fogF: 560, hemiC: 0xffd2a0, hemiG: 0x4a3a28, hemiI: .95, sunC: 0xffc684, sunI: 3.0, exp: 1.08,
    grassA: '#2f8a2a', grassB: '#3ba534', concrete: '#7b7268', trussC: 0x39414b,
    seats: ['#4a4a55', '#6a6a78', '#d8741c', '#f0b030'], shirts: ['#e8b030', '#d9582a', '#f2f2f2', '#25252b', '#c43a3a', '#e6c25a', '#f08a3c', '#8a5a2a'],
    lamp: 0xffe2ac, shaft: [1, .78, .46], shaftI: .2, boards: ['#ff8a1e', '#ffd24a', '#ffffff', '#c43a1a'], crowdK: .95, flag: '#ffb020',
  },
  blue: {
    name: 'Estádio Azul', skyTop: [.004, .012, .035], skyMid: [.015, .06, .13], skyHor: [.05, .18, .32], sunDir: [-.22, .93, .3], stars: 1,
    fog: 0x07203a, fogN: 90, fogF: 420, hemiC: 0x86bcff, hemiG: 0x0a1a2c, hemiI: .6, sunC: 0xcfe6ff, sunI: 2.5, exp: 1.12,
    grassA: '#2a7a30', grassB: '#318c38', concrete: '#3d4b5e', trussC: 0x2a3340,
    seats: ['#16478f', '#1d5cb5', '#0e2f66', '#e9f2ff'], shirts: ['#3a86ff', '#ffffff', '#1d4ed8', '#9ed0ff', '#0b1f4d', '#2a62d8'],
    lamp: 0xd8eeff, shaft: [.55, .8, 1], shaftI: .26, boards: ['#38c8ff', '#ffffff', '#2a7dff', '#7ae0ff'], crowdK: .8, flag: '#38c8ff',
  },
};
export const STAD_TEX = { base: 'assets/estadio/' };   // onde os arquivos reais de textura ficarão

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c, o = {}) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = globalThis.__ANISO || 4; if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } if (o.rx) t.wrapS = THREE.RepeatWrapping; return t; };
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---------- anel arredondado: pontos com contagem fixa (todas as fileiras ficam alinhadas) ---------- */
function ring(hx, hz, r, k = 1) {
  const nz = 48 * k, nx = 30 * k, na = 8 * k, out = [];
  const arc = (cx, cz, a0) => { for (let i = 0; i < na; i++) { const a = a0 + i / na * PI / 2; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r, Math.cos(a), Math.sin(a)]); } };
  for (let i = 0; i < nz; i++) out.push([hx, -(hz - r) + i / nz * 2 * (hz - r), 1, 0]); arc(hx - r, hz - r, 0);
  for (let i = 0; i < nx; i++) out.push([(hx - r) - i / nx * 2 * (hx - r), hz, 0, 1]); arc(-(hx - r), hz - r, PI / 2);
  for (let i = 0; i < nz; i++) out.push([-hx, (hz - r) - i / nz * 2 * (hz - r), -1, 0]); arc(-(hx - r), -(hz - r), PI);
  for (let i = 0; i < nx; i++) out.push([-(hx - r) + i / nx * 2 * (hx - r), -hz, 0, -1]); arc(hx - r, -(hz - r), PI * 1.5);
  return out;
}
const R0 = { hx: BX + 1.6, hz: BZ + 1.6, r: 5 };           // início das arquibancadas
const ringAt = (d, k = 1) => ring(R0.hx + d, R0.hz + d, R0.r + d, k);

/* ---------- texturas provisórias ---------- */
function paintPitch(V) {
  const TW = FIELD.W + 16, TL = FIELD.L + 16, c = cv(1536, 2304), g = c.getContext('2d'), sx = c.width / TW, sz = c.height / TL, r = rng(11);
  const X = x => (x + TW / 2) * sx, Z = z => (z + TL / 2) * sz;
  g.fillStyle = V.grassA; g.fillRect(0, 0, c.width, c.height);
  const bands = 16, bh = FIELD.L / bands;                 // listras de corte (do gol ao gol)
  for (let i = 0; i < bands; i++) { g.fillStyle = i % 2 ? V.grassA : V.grassB; g.fillRect(X(-HW - 8), Z(-HL + i * bh), (FIELD.W + 16) * sx, bh * sz + 1); }
  g.fillStyle = V.grassA; g.globalAlpha = .55; g.fillRect(0, 0, c.width, Z(-HL)); g.fillRect(0, Z(HL), c.width, c.height - Z(HL)); g.fillRect(0, 0, X(-HW), c.height); g.fillRect(X(HW), 0, c.width - X(HW), c.height); g.globalAlpha = 1;
  // ruído de grama (manchas e fiapos)
  for (let i = 0; i < 90000; i++) { const x = r() * c.width, y = r() * c.height, l = 2 + r() * 5; g.strokeStyle = r() < .5 ? 'rgba(0,0,0,.08)' : 'rgba(255,255,200,.06)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 2, y - l); g.stroke(); }
  for (let i = 0; i < 260; i++) { const x = r() * c.width, y = r() * c.height, rad = 10 + r() * 40; const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, r() < .5 ? 'rgba(20,60,10,.10)' : 'rgba(150,170,40,.07)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  // desgaste nas áreas e no centro
  for (const [wx, wz, rad] of [[0, -HL + 9, 5], [0, HL - 9, 5], [0, 0, 4.5], [0, -HL + 2, 4], [0, HL - 2, 4]]) { const gr = g.createRadialGradient(X(wx), Z(wz), 0, X(wx), Z(wz), rad * sx); gr.addColorStop(0, 'rgba(120,100,55,.34)'); gr.addColorStop(1, 'rgba(120,100,55,0)'); g.fillStyle = gr; g.fillRect(X(wx - rad), Z(wz - rad), rad * 2 * sx, rad * 2 * sz); }
  // linhas
  g.strokeStyle = g.fillStyle = 'rgba(245,248,240,.93)'; g.lineWidth = .13 * sx;
  const line = (x0, z0, x1, z1) => { g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); };
  g.strokeRect(X(-HW), Z(-HL), FIELD.W * sx, FIELD.L * sz); line(-HW, 0, HW, 0);
  const circ = (x, z, rad, a0 = 0, a1 = TAU) => { g.beginPath(); g.ellipse(X(x), Z(z), rad * sx, rad * sz, 0, a0, a1); g.stroke(); };
  circ(0, 0, 8.6); g.beginPath(); g.ellipse(X(0), Z(0), .3 * sx, .3 * sz, 0, 0, TAU); g.fill();
  for (const s of [-1, 1]) {
    const zg = s * HL; g.strokeRect(X(-18.5), s > 0 ? Z(HL - 15.5) : Z(-HL), 37 * sx, 15.5 * sz); g.strokeRect(X(-8.5), s > 0 ? Z(HL - 5.2) : Z(-HL), 17 * sx, 5.2 * sz);
    const sp = s * (HL - 10.5); g.beginPath(); g.ellipse(X(0), Z(sp), .3 * sx, .3 * sz, 0, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.rect(0, s > 0 ? 0 : Z(-HL + 15.5), c.width, s > 0 ? Z(HL - 15.5) : c.height); g.clip(); circ(0, sp, 8.6); g.restore();
    for (const sxn of [-1, 1]) { g.beginPath(); g.ellipse(X(sxn * HW), Z(zg), 1.2 * sx, 1.2 * sz, 0, s > 0 ? (sxn > 0 ? PI : PI * 1.5) : (sxn > 0 ? PI * .5 : 0), s > 0 ? (sxn > 0 ? PI * 1.5 : TAU) : (sxn > 0 ? PI : PI * .5)); g.stroke(); }
  }
  return c;
}
function paintSeats(V) {   // 4 cadeiras por bloco (cada bloco = 2,4 m)
  const c = cv(256, 128), g = c.getContext('2d'); g.fillStyle = '#17181c'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 4; i++) { const x = i * 64 + 6; g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x - 2, 10, 56, 6);
    g.fillStyle = '#fff'; g.fillRect(x, 20, 52, 28); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 40, 52, 8); g.fillStyle = '#fff'; g.beginPath(); g.roundRect ? g.roundRect(x + 2, 56, 48, 56, 8) : g.rect(x + 2, 56, 48, 56); g.fill(); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x + 2, 100, 48, 12); }
  return c;
}
function paintCrowd(V) {
  const c = cv(512, 128), g = c.getContext('2d'), r = rng(5), skin = ['#f1c9a0', '#d9a074', '#a86a45', '#6f4328', '#f6d7b8'];
  for (let i = 0; i < 8; i++) {
    const x = i * 64 + 32, shirt = V.shirts[i % V.shirts.length], up = i % 3 === 0;
    g.fillStyle = shirt; g.beginPath(); g.moveTo(x - 20, 128); g.lineTo(x - 17, 54); g.quadraticCurveTo(x, 42, x + 17, 54); g.lineTo(x + 20, 128); g.fill();
    g.strokeStyle = shirt; g.lineWidth = 9; g.lineCap = 'round';
    if (up) { g.beginPath(); g.moveTo(x - 15, 60); g.lineTo(x - 26, 22); g.moveTo(x + 15, 60); g.lineTo(x + 26, 22); g.stroke(); g.strokeStyle = skin[i % 5]; g.lineWidth = 7; g.beginPath(); g.moveTo(x - 26, 24); g.lineTo(x - 27, 14); g.moveTo(x + 26, 24); g.lineTo(x + 27, 14); g.stroke(); }
    else { g.beginPath(); g.moveTo(x - 17, 58); g.lineTo(x - 21, 100); g.moveTo(x + 17, 58); g.lineTo(x + 21, 100); g.stroke(); }
    g.fillStyle = skin[(i + (r() * 5 | 0)) % 5]; g.beginPath(); g.arc(x, 36, 12, 0, TAU); g.fill();
    g.fillStyle = ['#1a1410', '#3a2414', '#c9a24a', '#111'][i % 4]; g.beginPath(); g.arc(x, 31, 12.5, PI, TAU); g.fill();
    if (i % 4 === 1) { g.fillStyle = shirt; g.fillRect(x - 14, 22, 28, 7); }
  }
  return c;
}
function paintBoards(V) {
  const c = cv(2048, 64), g = c.getContext('2d'); const txt = ['CYBER ARENA', 'NEXUS', 'ATLAS', 'FINLOCKES', 'CYBER ARENA', 'MUNDO 3D'], w = c.width / txt.length;
  txt.forEach((t, i) => { const col = V.boards[i % V.boards.length]; const gr = g.createLinearGradient(i * w, 0, (i + 1) * w, 0); gr.addColorStop(0, '#0a0e14'); gr.addColorStop(.5, '#10161f'); gr.addColorStop(1, '#0a0e14'); g.fillStyle = gr; g.fillRect(i * w, 0, w, 64);
    g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 12; g.font = '800 38px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, i * w + w / 2, 34); g.shadowBlur = 0; g.fillRect(i * w + 6, 3, w - 12, 3); g.fillRect(i * w + 6, 58, w - 12, 3); });
  return c;
}
function paintNet() {
  const c = cv(64, 64), g = c.getContext('2d'); g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(64, 0); g.moveTo(0, 0); g.lineTo(0, 64); g.stroke(); g.lineWidth = 1.5; g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.moveTo(0, 32); g.lineTo(64, 32); g.stroke(); return c;
}
function paintGlow() {
  const c = cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.18, 'rgba(255,255,255,.85)'); gr.addColorStop(.5, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
}

/* ---------- geometria em faixa (loft entre anéis) ---------- */
function lofts(rows) {   // rows: [{ a:[ [x,z,nx,nz],… ], b:[…], ya, yb, kind }]  — gera posições/uv/normais/cores
  const P = [], N = [], UV = [], C = [], I = []; let vi = 0;
  for (const s of rows) {
    const n = s.a.length; for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n, a0 = s.a[j], a1 = s.a[j2], b0 = s.b[j], b1 = s.b[j2], u0 = j / n * s.ur, u1 = (j + 1) / n * s.ur;
      P.push(a0[0], s.ya, a0[1], a1[0], s.ya, a1[1], b1[0], s.yb, b1[1], b0[0], s.yb, b0[1]);
      const nx = s.up ? 0 : -a0[2], ny = s.up ? 1 : 0, nz = s.up ? 0 : -a0[3]; for (let k = 0; k < 4; k++) N.push(nx, ny, nz);
      UV.push(u0, 0, u1, 0, u1, 1, u0, 1); const col = s.col ? s.col(j) : [1, 1, 1]; for (let k = 0; k < 4; k++) C.push(col[0], col[1], col[2]);
      I.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4;
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); return g;
}

export class Stadium {
  constructor(scene, q, venue = 'gold', opt = {}) {
    this.scene = scene; this.q = q; this.venue = venue === 'blue' ? 'blue' : 'gold'; this.V = VENUES[this.venue]; this.qname = opt.qname || 'medium';
    this.group = new THREE.Group(); this.group.visible = false; this.built = false; this.islands = []; this.bridges = []; this.portal = { x: REALM_X + 9999, z: 0, y: 0 };
    this.spawn = [REALM_X, -HL + 22]; this.cheer = 0; this.t = 0; this.nets = []; this.pcols = []; this.bcols = []; this.scoreInfo = null;
    this.light = { hemiC: this.V.hemiC, hemiG: this.V.hemiG, hemiI: this.V.hemiI, sunC: this.V.sunC, sunI: this.V.sunI, fogC: this.V.fog, fogN: this.V.fogN, fogF: this.V.fogF, exp: this.V.exp, sunDir: this.V.sunDir, grade: 'arena' };
    this.addSolids();
  }
  /* ---------- interface de colisão (jogadores) ---------- */
  addSolids() {
    const cx = REALM_X, P = this.pcols, B = this.bcols, wall = (x0, z0, x1, z1) => { P.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y1: 60 }); B.push(box(x0, 0, z0, x1, 60, z1, { e: .45, tf: .85 })); };
    wall(cx - BX - 3, -BZ - 3, cx - BX, BZ + 3); wall(cx + BX, -BZ - 3, cx + BX + 3, BZ + 3);           // laterais (invisíveis; as placas ficam na frente)
    wall(cx - BX - 3, -BZ - 3, cx + BX + 3, -BZ); wall(cx - BX - 3, BZ, cx + BX + 3, BZ + 3);          // fundos
    for (const s of [-1, 1]) {
      const zl = s * HL, zb = s * (HL + GD);
      for (const sx of [-1, 1]) {                                                                        // traves
        P.push({ x: cx + sx * GW, z: zl, r: .1, y1: GH }); B.push(cap(cx + sx * GW, 0, zl, cx + sx * GW, GH, zl, .075, { e: .55, tf: .92, post: 1 }));
        const xs = cx + sx * (GW + .14);                                                                  // rede lateral
        P.push({ x0: xs - .1, x1: xs + .1, z0: Math.min(zl, zb), z1: Math.max(zl, zb), y1: GH + .3 }); B.push(box(xs - .1, 0, Math.min(zl, zb), xs + .1, GH + .3, Math.max(zl, zb), { e: .12, tf: .5, soft: .45, net: s }));
      }
      B.push(cap(cx - GW, GH, zl, cx + GW, GH, zl, .075, { e: .55, tf: .92, post: 1 }));                    // travessão
      P.push({ x0: cx - GW - .2, x1: cx + GW + .2, z0: Math.min(zb, zb + s * .2), z1: Math.max(zb, zb + s * .2), y1: GH + .3 });
      B.push(box(cx - GW - .2, 0, Math.min(zb, zb + s * .25), cx + GW + .2, GH + .3, Math.max(zb, zb + s * .25), { e: .1, tf: .45, soft: .35, net: s, back: 1 }));   // fundo da rede
      B.push(box(cx - GW - .2, GH + .02, Math.min(zl, zb), cx + GW + .2, GH + .3, Math.max(zl, zb), { e: .12, tf: .5, soft: .45, net: s }));           // teto da rede
    }
  }
  terrainAt(x, z) { return Math.abs(x - REALM_X) < BX + 4 && Math.abs(z) < BZ + 4 ? 0 : -80; }
  groundAt(x, z) { return this.terrainAt(x, z); }
  waterDepth() { return -10; }
  rayBlocked() { return null; }
  isFree(x, z) { return this.terrainAt(x, z) > -50; }
  contains(x) { return x > REALM_X - 600; }
  blockers(x, z, y, rad) {
    const out = []; for (const o of this.pcols) { if (y >= o.y1) continue; const d = this._dist(o, x, z) - rad; if (d < 0) out.push([o, d + rad]); } return out;
  }
  _dist(o, x, z) { if (o.r !== undefined) return Math.hypot(x - o.x, z - o.z) - o.r; const cx = Math.min(Math.max(x, o.x0), o.x1), cz = Math.min(Math.max(z, o.z0), o.z1); return Math.hypot(x - cx, z - cz); }
  collide(p, rad) {
    let hit = null;
    for (const o of this.pcols) {
      if (p.y >= o.y1) continue;
      if (o.r !== undefined) { const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 1e-6; if (d < o.r + rad) { const k = (o.r + rad - d) / d; p.x += dx * k; p.z += dz * k; hit = { o, top: o.y1, nx: dx / d, nz: dz / d }; } continue; }
      const cx = Math.min(Math.max(p.x, o.x0), o.x1), cz = Math.min(Math.max(p.z, o.z0), o.z1); let dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
      if (d >= rad) continue;
      if (d < 1e-6) { const l = p.x - o.x0, r = o.x1 - p.x, f = p.z - o.z0, b = o.z1 - p.z, m = Math.min(l, r, f, b); if (m === l) { dx = -1; dz = 0; d = 1; p.x = o.x0 - rad; } else if (m === r) { dx = 1; dz = 0; d = 1; p.x = o.x1 + rad; } else if (m === f) { dx = 0; dz = -1; d = 1; p.z = o.z0 - rad; } else { dx = 0; dz = 1; d = 1; p.z = o.z1 + rad; } }
      else { const k = (rad - d) / d; p.x += dx * k; p.z += dz * k; }
      hit = { o, top: o.y1, nx: dx / d, nz: dz / d };
    }
    return hit;
  }

  /* ---------- construção ---------- */
  build() {
    if (this.built) return; this.built = true; const G = this.group, V = this.V, cx = REALM_X, hi = this.qname === 'high', lo = this.qname === 'low' || this.qname === 'ultra';
    this.scene.add(G); this.mats = {}; this.local = new THREE.Group(); this.local.position.set(REALM_X, 0, 0); G.add(this.local);
    // piso externo escuro (sem vazio)
    const out = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: this.venue === 'gold' ? 0x2a2622 : 0x0b1420, roughness: 1 })); out.rotation.x = -PI / 2; out.position.set(cx, -.08, 0); G.add(out);
    this.buildSky(); this.buildPitch(); this.buildStands(hi, lo); this.buildRoof(lo); this.buildBoards(); this.buildGoals(); this.buildFlags(); this.buildScreens();
  }
  buildSky() {
    const V = this.V, f3 = a => `vec3(${a.map(v => v.toFixed(3)).join(',')})`, sd = new THREE.Vector3(...V.sunDir).normalize();
    this.skyU = { uTime: { value: 0 } };
    const sky = this.sky = new THREE.Mesh(new THREE.SphereGeometry(1200, 40, 20), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
      fragmentShader: `uniform float uTime;varying vec3 vD;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
void main(){vec3 d=normalize(vD);float y=max(d.y,0.);
 vec3 c=mix(${f3(V.skyHor)},${f3(V.skyMid)},smoothstep(0.,.28,y));c=mix(c,${f3(V.skyTop)},smoothstep(.2,.9,y));
 vec3 sd=vec3(${sd.x.toFixed(3)},${sd.y.toFixed(3)},${sd.z.toFixed(3)});float sg=max(dot(d,sd),0.);
 ${this.venue === 'gold' ? 'c+=vec3(1.,.5,.18)*pow(sg,7.)*.5+vec3(1.,.75,.4)*pow(sg,90.)*.7+vec3(1.,.95,.8)*step(.9993,sg)*1.6;' : 'c+=vec3(.1,.25,.45)*pow(max(1.-y,0.),6.)*.5;'}
 vec2 cp=d.xz/(d.y+.28)*1.4+vec2(uTime*.004,0.);float cl=smoothstep(.45,.85,fb(vec3(cp*1.7,3.)));cl*=smoothstep(.0,.2,d.y)*(1.-smoothstep(.5,.95,d.y));
 ${this.venue === 'gold' ? 'c=mix(c,vec3(1.,.66,.36)*(.65+.5*sg)+vec3(.15,.1,.12),cl*.7);' : 'c=mix(c,vec3(.05,.12,.22)+vec3(.04,.09,.16)*sg,cl*.55);'}
 ${V.stars ? 'vec3 s3=floor(d*320.);float st=step(.9972,h(s3))*smoothstep(.1,.5,d.y);c+=vec3(.8,.9,1.)*st*(.5+.5*sin(uTime*2.+h(s3+3.)*40.));' : ''}
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` }));
    sky.renderOrder = -10; sky.frustumCulled = false; this.group.add(sky);
  }
  buildPitch() {
    const V = this.V, TW = FIELD.W + 16, TL = FIELD.L + 16, tex = ctex(paintPitch(V)), mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .96, metalness: 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(TW, TL), mat); m.rotation.x = -PI / 2; m.position.set(REALM_X, 0, 0); m.receiveShadow = true; this.group.add(m); this.pitch = m;
    this.tryRealTex(mat, 'grama');
  }
  /* se existirem texturas reais em assets/estadio/<nome>/, usa por cima das provisórias (repetindo em ladrilho no gramado) */
  tryRealTex(mat, name) { /* ligado na entrega das texturas reais (pacote "estadio") */ }
  buildStands(hi, lo) {
    const V = this.V, rows = 20, G = this.local, dRow = i => 1.9 + i * .86, hRow = i => 1.3 + i * .64, riseW = .86;
    const concrete = new THREE.MeshStandardMaterial({ color: V.concrete, roughness: .92, side: THREE.DoubleSide, vertexColors: true });
    const seatTex = ctex(paintSeats(V), { repeat: true }); seatTex.wrapS = seatTex.wrapT = THREE.RepeatWrapping;
    const seatMat = new THREE.MeshStandardMaterial({ map: seatTex, roughness: .7, side: THREE.DoubleSide, vertexColors: true });
    const sc = V.seats.map(h => new THREE.Color(h)); const rr = rng(21); const secCol = []; for (let i = 0; i < 400; i++) secCol.push(sc[(rr() * sc.length) | 0]);
    const tread = [], riser = [], fl = [];
    let prevY = 0, prevD = 0;
    for (let i = 0; i < rows; i++) {
      const d0 = dRow(i), d1 = d0 + riseW, y = hRow(i), a1 = ringAt(d0), a2 = ringAt(d1);
      tread.push({ a: a1, b: a2, ya: y, yb: y, up: true, ur: 150, col: j => { const c = secCol[(j / 6 | 0) % secCol.length], row = (i % 2 ? .92 : 1); return [c.r * row, c.g * row, c.b * row]; } });
      riser.push({ a: a1, b: a1, ya: y - (hRow(i) - (i ? hRow(i - 1) : 0)), yb: y, up: false, ur: 60 });
    }
    // as fileiras de risers são verticais: precisam de b != a só em altura → monta à mão
    const rg = (() => { const P = [], N = [], UV = [], C = [], I = []; let vi = 0;
      for (let i = 0; i < rows; i++) { const a = ringAt(dRow(i)), y1 = hRow(i), y0 = i ? hRow(i - 1) : 0, n = a.length;
        for (let j = 0; j < n; j++) { const p0 = a[j], p1 = a[(j + 1) % n]; P.push(p0[0], y0, p0[1], p1[0], y0, p1[1], p1[0], y1, p1[1], p0[0], y1, p0[1]); for (let k = 0; k < 4; k++) N.push(-p0[2], 0, -p0[3]); UV.push(j / n * 60, 0, (j + 1) / n * 60, 0, (j + 1) / n * 60, 1, j / n * 60, 1); const g = .85 - i * .008; for (let k = 0; k < 4; k++) C.push(g, g, g); I.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4; } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); return g; })();
    const tg = lofts(tread); const treadMesh = new THREE.Mesh(tg, seatMat); treadMesh.receiveShadow = true; G.add(treadMesh);
    const riserMesh = new THREE.Mesh(rg, concrete); G.add(riserMesh);
    // parede de trás + corredor superior
    const dTop = dRow(rows - 1) + riseW, yTop = hRow(rows - 1), wallH = 26;
    const back = ringAt(dTop), bp = [], bn = [], bu = [], bi = []; let vi = 0;
    for (let j = 0; j < back.length; j++) { const p0 = back[j], p1 = back[(j + 1) % back.length]; bp.push(p0[0], yTop, p0[1], p1[0], yTop, p1[1], p1[0], wallH, p1[1], p0[0], wallH, p0[1]); for (let k = 0; k < 4; k++) bn.push(-p0[2], 0, -p0[3]); bu.push(0, 0, 1, 0, 1, 1, 0, 1); bi.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(bu, 2)); bg.setIndex(bi);
    const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(V.concrete).multiplyScalar(.5), roughness: .95, side: THREE.DoubleSide }); G.add(new THREE.Mesh(bg, wallMat));
    this.standTop = { d: dTop, y: yTop, wallH };
    // torcida (cartões com o atlas de pessoas)
    const crowdTex = ctex(paintCrowd(V)); const k = (this.qname === 'ultra' ? .3 : lo ? .55 : this.qname === 'medium' ? .8 : 1) * V.crowdK, mult = 2;
    const pts = [], rc = rng(99);
    for (let i = 0; i < rows; i++) { const a = ringAt(dRow(i) + .45, mult), y = hRow(i); for (let j = 0; j < a.length; j++) { if (rc() > .62 * k) continue; const p = a[j]; pts.push([p[0] + (rc() - .5) * .25, y, p[1] + (rc() - .5) * .25, Math.atan2(-p[2], -p[3]), (rc() * 8) | 0, rc(), .85 + rc() * .3]); } }
    const geo = new THREE.PlaneGeometry(.62, 1.05); geo.translate(0, .52, 0);
    const idx = new Float32Array(pts.length), ph = new Float32Array(pts.length); geo.setAttribute('aIdx', new THREE.InstancedBufferAttribute(idx, 1)); geo.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
    this.crowdU = { uT: { value: 0 }, uCheer: { value: 0 } };
    const cm = new THREE.MeshBasicMaterial({ map: crowdTex, alphaTest: .5, color: new THREE.Color(this.venue === 'gold' ? 0xffffff : 0xc8d8ff).multiplyScalar(.9) });
    cm.onBeforeCompile = sh => {
      sh.uniforms.uT = this.crowdU.uT; sh.uniforms.uCheer = this.crowdU.uCheer;
      sh.vertexShader = 'attribute float aIdx;attribute float aPh;uniform float uT;uniform float uCheer;\n' + sh.vertexShader
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n vMapUv.x = (vMapUv.x + aIdx) / 8.0;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n float ang = uT * (3.0 + aPh * 5.0) + aPh * 40.0; transformed.y += abs(sin(ang)) * (0.015 + 0.16 * uCheer) * (0.4 + aPh) * (position.y + .2) * 1.6; transformed.x += sin(ang * .5) * .03 * uCheer;');
    };
    const im = new THREE.InstancedMesh(geo, cm, pts.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Pp = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    pts.forEach((p, i) => { Q.setFromAxisAngle(Y, p[3]); S.set(1, p[6], 1); Pp.set(p[0], p[1] - .05, p[2]); M.compose(Pp, Q, S); im.setMatrixAt(i, M); idx[i] = p[4]; ph[i] = p[5]; });
    im.frustumCulled = false; G.add(im); this.crowd = im;
  }
  buildRoof(lo) {
    const V = this.V, G = this.local, dR = this.standTop.d - 6, yR = 25.5, pts = ringAt(dR), n = pts.length;
    const tubeM = new THREE.MeshStandardMaterial({ color: V.trussC, roughness: .55, metalness: .7 });
    const bx = new THREE.BoxGeometry(1, 1, 1), imgs = [], A = new THREE.Vector3(), B = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), Q = new THREE.Quaternion(), M = new THREE.Matrix4(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const seg = (a, b, w, out) => { dir.subVectors(b, a); const L = dir.length(); mid.addVectors(a, b).multiplyScalar(.5); Q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize()); S.set(L, w, w); M.compose(mid, Q, S); out.push(M.clone()); };
    const list = [];
    for (let j = 0; j < n; j++) {
      const p0 = pts[j], p1 = pts[(j + 1) % n], ox = -p0[2] * 1.7, oz = -p0[3] * 1.7, ox1 = -p1[2] * 1.7, oz1 = -p1[3] * 1.7;
      const t0 = new THREE.Vector3(p0[0], yR + 2.2, p0[1]), t1 = new THREE.Vector3(p1[0], yR + 2.2, p1[1]), b0 = new THREE.Vector3(p0[0], yR, p0[1]), b1 = new THREE.Vector3(p1[0], yR, p1[1]);
      const i0 = new THREE.Vector3(p0[0] + ox, yR + 1.2, p0[1] + oz), i1 = new THREE.Vector3(p1[0] + ox1, yR + 1.2, p1[1] + oz1);
      seg(t0, t1, .22, list); seg(b0, b1, .22, list); seg(i0, i1, .16, list);
      seg(b0, t1, .1, list); if (j % 2 === 0) seg(t0, b0, .12, list);
    }
    const im = new THREE.InstancedMesh(bx, tubeM, list.length); list.forEach((m, i) => im.setMatrixAt(i, m)); im.frustumCulled = false; G.add(im);
    // refletores: painéis emissivos + brilho (pontos aditivos) + feixes de luz
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(V.lamp).multiplyScalar(2.2), toneMapped: false });
    const lamps = [], glow = [], step = lo ? 4 : 2; let shaftPts = [];
    for (let j = 0; j < n; j += step) {
      const p = pts[j], x = p[0] - p[2] * 2.2, z = p[1] - p[3] * 2.2, y = yR + .6; for (let k = -1; k <= 1; k += 2) { const m = new THREE.Matrix4(); const yaw = Math.atan2(-p[2], -p[3]); m.compose(new THREE.Vector3(x - p[3] * k * .5, y, z + p[2] * k * .5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(.8, .5, .12)); lamps.push(m); }
      glow.push(x, y - .2, z); if (j % (lo ? 16 : 8) === 0) shaftPts.push([x, y, z, p[2], p[3]]);
    }
    const lm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lampM, lamps.length); lamps.forEach((m, i) => lm.setMatrixAt(i, m)); lm.frustumCulled = false; G.add(lm);
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
    const gm = new THREE.PointsMaterial({ map: ctex(paintGlow()), size: 9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(V.lamp), opacity: .75, fog: false }); const gp = new THREE.Points(gg, gm); gp.frustumCulled = false; G.add(gp); this.glowPts = gp;
    // feixes (cones aditivos apontando para o campo)
    const sh = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uC: { value: new THREE.Vector3(...V.shaft) }, uK: { value: V.shaftI }, uT: this.crowdU.uT },
      vertexShader: 'varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 uC;uniform float uK;uniform float uT;varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){float f=pow(abs(dot(normalize(vN),normalize(vV))),1.6);float a=pow(1.-vUv.y,1.6)*f*uK*(.9+.1*sin(uT*1.3+vUv.x*6.));gl_FragColor=vec4(uC*a,a);}' });
    for (const s of shaftPts) { const len = 60, geo = new THREE.ConeGeometry(7.5, len, 20, 1, true); geo.translate(0, -len / 2, 0); const m = new THREE.Mesh(geo, sh); m.position.set(s[0], s[1], s[2]); const tgt = new THREE.Vector3((Math.random() - .5) * 30, 0, (Math.random() - .5) * 50); const dir2 = tgt.clone().sub(m.position).normalize(); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir2); m.renderOrder = 5; m.frustumCulled = false; G.add(m); }
  }
  buildBoards() {
    const V = this.V, G = this.local, tex = ctex(paintBoards(V)); tex.wrapS = THREE.RepeatWrapping; this.boardTex = tex;
    const a = ring(BX + .3, BZ + .3, 2.2, 2), n = a.length; const P = [], N = [], UV = [], I = []; let vi = 0, acc = 0;
    for (let j = 0; j < n; j++) { const p0 = a[j], p1 = a[(j + 1) % n], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u0 = acc / 35.2, u1 = (acc + L) / 35.2; acc += L;
      P.push(p0[0], 0, p0[1], p1[0], 0, p1[1], p1[0], 1.1, p1[1], p0[0], 1.1, p0[1]); for (let k = 0; k < 4; k++) N.push(-p0[2], 0, -p0[3]); UV.push(u0, 0, u1, 0, u1, 1, u0, 1); I.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2); vi += 4; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.setIndex(I);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, color: 0xffffff })); G.add(m);
    const cap2 = []; const topM = new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: .6 }); // tampa preta fina
    const P2 = [], I2 = []; vi = 0; for (let j = 0; j < n; j++) { const p0 = a[j], p1 = a[(j + 1) % n]; P2.push(p0[0], 1.1, p0[1], p1[0], 1.1, p1[1], p1[0] - p1[2] * .35, 1.1, p1[1] - p1[3] * .35, p0[0] - p0[2] * .35, 1.1, p0[1] - p0[3] * .35); I2.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3); vi += 4; }
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g2.setIndex(I2); g2.computeVertexNormals(); const tm = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({ color: 0x15181d, roughness: .6, side: THREE.DoubleSide })); G.add(tm);
  }
  buildGoals() {
    const G = this.group, cx = REALM_X, post = new THREE.MeshStandardMaterial({ color: 0xf4f6f8, roughness: .35, metalness: .3 }), netTex = ctex(paintNet()); netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    this.goals = [];
    for (const s of [-1, 1]) {
      const zl = s * HL, zb = s * (HL + GD), grp = new THREE.Group(); G.add(grp);
      const cyl = (x0, y0, z0, x1, y1, z1, r) => { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), L = a.distanceTo(b), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 10), post); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.castShadow = true; grp.add(m); };
      cyl(cx - GW, 0, zl, cx - GW, GH, zl, .075); cyl(cx + GW, 0, zl, cx + GW, GH, zl, .075); cyl(cx - GW, GH, zl, cx + GW, GH, zl, .075);
      cyl(cx - GW, GH, zl, cx - GW, GH - .6, zb, .035); cyl(cx + GW, GH, zl, cx + GW, GH - .6, zb, .035);
      const nm = (w, h, rx, ry) => { const t = netTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: .8, alphaTest: .05 }); };
      const nets = []; const mk = (w, h, rx, ry) => new THREE.Mesh(new THREE.PlaneGeometry(w, h, 12, 8), nm(w, h, rx, ry));
      const back = mk(GW * 2, GH, GW * 2 / .12, GH / .12); back.position.set(cx, GH / 2, zb); grp.add(back); nets.push(back);
      for (const sx of [-1, 1]) { const side = mk(GD, GH, GD / .12, GH / .12); side.position.set(cx + sx * GW, GH / 2, (zl + zb) / 2); side.rotation.y = PI / 2; grp.add(side); nets.push(side); }
      const top = mk(GW * 2, GD, GW * 2 / .12, GD / .12); top.rotation.x = PI / 2; top.position.set(cx, GH, (zl + zb) / 2); grp.add(top); nets.push(top);
      this.goals.push({ s, grp, nets, rip: 0, hit: new THREE.Vector3() });
    }
  }
  buildFlags() {
    const G = this.group, cx = REALM_X, pm = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: .5 }), fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.V.flag), side: THREE.DoubleSide });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.6, 6), pm); p.position.set(cx + sx * HW, .8, sz * HL); G.add(p); const f = new THREE.Mesh(new THREE.PlaneGeometry(.4, .3), fm); f.position.set(cx + sx * HW - sx * .2, 1.45, sz * HL); f.rotation.y = PI / 2; G.add(f); }
  }
  buildScreens() {
    const G = this.group, c = this.scoreCanvas = cv(1024, 384), tex = this.scoreTex = ctex(c), sm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    for (const s of [-1, 1]) { const grp = new THREE.Group(), pl = new THREE.Mesh(new THREE.PlaneGeometry(18, 6.75), sm), fr = new THREE.Mesh(new THREE.BoxGeometry(18.8, 7.5, .5), new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: .5, metalness: .6 })); fr.position.z = -.3; grp.add(fr, pl);
      grp.position.set(REALM_X, 17.4, s * (BZ + 14.5)); grp.rotation.y = s > 0 ? PI : 0; G.add(grp); }
    this.setScore({ a: 0, b: 0, time: '00:00', label: this.V.name.toUpperCase(), na: 'AZUL', nb: 'LARANJA' });
  }
  setScore(info) {
    this.scoreInfo = info; const c = this.scoreCanvas, g = c.getContext('2d'), V = this.V, W = c.width, H = c.height;
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#05080d'); gr.addColorStop(1, '#0d141d'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = V.boards[0]; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9fb4c8'; g.font = '700 34px Arial'; g.fillText(info.label || '', W / 2, 52);
    g.fillStyle = '#fff'; g.font = '900 170px Arial'; g.fillText(String(info.a), W * .27, H * .55); g.fillText(String(info.b), W * .73, H * .55); g.fillStyle = V.boards[0]; g.fillText('–', W / 2, H * .52);
    g.fillStyle = '#c9d6e3'; g.font = '800 40px Arial'; g.fillText(info.na || '', W * .27, H - 62); g.fillText(info.nb || '', W * .73, H - 62);
    g.fillStyle = '#ffd24a'; g.font = '800 46px Arial'; g.fillText(info.time || '', W / 2, H - 40); this.scoreTex.needsUpdate = true;
  }
  /* ---------- por quadro ---------- */
  update(t, cam) {
    if (!this.built || !this.group.visible) return; const dt = this.t ? Math.min(.1, t - this.t) : .016; this.t = t;
    this.sky.position.copy(cam); this.skyU.uTime.value = t; this.crowdU.uT.value = t; this.cheer = Math.max(0, this.cheer - dt * .35); this.crowdU.uCheer.value = Math.min(1, .12 + this.cheer);
    this.boardTex.offset.x = (t * .012) % 1;
    for (const g of this.goals) if (g.rip > 0) { g.rip = Math.max(0, g.rip - dt * 1.4); const k = g.rip, w = Math.sin(t * 22) * k * .18; for (const n of g.nets) { n.position.y = (n.userData.y0 ?? (n.userData.y0 = n.position.y)) + w * .25; } }
    const sd = this.light.sunDir; U.uSun.value.set(sd[0], sd[1], sd[2]).normalize();
  }
  goalRipple(side) { const g = this.goals[side > 0 ? 1 : 0]; if (g) g.rip = 1; }
  cheerUp(k = 1) { this.cheer = Math.min(1.4, this.cheer + k); }
}
