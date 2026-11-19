/* CyberWorld · núcleo: ruído determinístico, rios, estradas, altura do terreno e colocação de objetos.
   Unidade = 1 bloco (Cyber tem 3 blocos de altura). Eixos: X leste, Z sul, Y para cima. Tudo é função pura da posição
   e da semente, então qualquer chunk pode ser (re)gerado sozinho e sempre sai igual. */
(function (G) {
'use strict';
const CW = G.CW = G.CW || {}, L = CW.LAYOUT;
/* escala do mundo: o vale inteiro é K× maior que o desenho original; a casona e as tendas crescem ainda mais */
const K = CW.SCALE = 2, TS = CW.TEMPLE_S = 2.4, TC = CW.TENT_S = 3.2;
CW.CAMP_R = 3.1 * TC + 1.3;               // raio do deck da tenda (≈ 11 m: dá para entrar e andar dentro)
if (!L._scaled) { L._scaled = true;
  const P = p => [p[0] * K, p[1] * K];
  Object.assign(L.temple, { x: L.temple.x * K, z: L.temple.z * K, platformR: 18 * TS });
  const tr = L.terrace; Object.assign(tr, { x: tr.x * K, z: tr.z * K, cx: tr.cx * K, cz: tr.cz * K, r0: tr.r0 * K, r1: tr.r1 * K, h: tr.h * 1.6 });
  for (const r of L.rivers) { r.pts = r.pts.map(P); r.hw *= 1.7; }
  for (const r of L.roads) { r.pts = r.pts.map(P); r.hw *= 1.6; }
  for (const c of L.camps) { c.x *= K; c.z *= K; }
  for (const f of L.fields) { f.x0 *= K; f.x1 *= K; f.z0 *= K; f.z1 *= K; }
  for (const m of L.meadows) { m.x *= K; m.z *= K; m.r *= K; }
  for (const f of L.forests) { f.x *= K; f.z *= K; f.r *= K; }
  for (const b of L.boulders) { b.x *= K; b.z *= K; b.s *= 1.7; }
  for (const m of L.mountains) { m.x *= K; m.z *= K; m.r *= K; m.h *= 1.9; }
  // estradas não passam por baixo da casona: a principal sai da praça em frente à escadaria
  const T0 = L.temple, inT = p => Math.hypot(p[0] - T0.x, p[1] - T0.z) < T0.platformR * 1.2;
  for (const r of L.roads) { const k = r.pts.filter(p => !inT(p)); if (k.length >= 2) r.pts = k; }
  const plz = [T0.x, T0.z + TS * (18 * Math.cos(Math.PI / 8) + 6.65 + 4.6)]; const main = L.roads.find(r => r.id === 'main'); if (main) main.pts.unshift(plz);
  L.ruins = [[-22, 8], [28, -12], [-48, -6], [44, 30], [-64, 26], [72, -6], [8, 28], [-30, -26], [34, -34], [-86, -6], [84, 32], [-14, 46], [-60, -40], [70, 44], [-90, 40], [96, -30]].map(P);
}
const HX = 100 * K, HZ = 56 * K, EXT = 12 * K;
CW.W = { HX, HZ, EXT, X0: -HX - EXT, Z0: -HZ - EXT, CWID: 28 * K, CHGT: 35 * K, NCX: 8, NCZ: 4, CELL: 0.7, WATER_Y: -0.25 };

/* ---------- ruído ---------- */
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash2(x, z, s) { let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + Math.imul(s | 0, 1274126177) | 0; h = Math.imul(h ^ h >>> 13, 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
const sm = t => t * t * (3 - 2 * t);
function vnoise(x, z, s) { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, ux = sm(fx), uz = sm(fz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s); return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz; }
function fbm(x, z, o, s) { let a = .5, f = 1, r = 0, n = 0; for (let i = 0; i < o; i++) { r += a * vnoise(x * f, z * f, (s || 0) + i * 17); n += a; a *= .5; f *= 2.03; } return r / n; }
function ridged(x, z, o, s) { let a = .5, f = 1, r = 0, n = 0; for (let i = 0; i < o; i++) { const v = 1 - Math.abs(vnoise(x * f, z * f, (s || 0) + i * 31) * 2 - 1); r += a * v * v; n += a; a *= .5; f *= 2.1; } return r / n; }
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t, clamp = (x, a, b) => Math.min(b, Math.max(a, x));
Object.assign(CW, { mulberry32, hash2, vnoise, fbm, ridged, smooth, lerp, clamp });

/* ---------- polilinhas (rios e estradas) com índice espacial ---------- */
function spline(pts, step) {
  const out = [], n = pts.length, P = i => pts[clamp(i, 0, n - 1)];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2), len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), k = Math.max(2, Math.ceil(len / step));
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t, f = (a, b, c, d) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]); }
  }
  out.push(pts[n - 1].slice()); return out;
}
function makePoly(def, step) {
  const d = spline(def.pts, step || 1), cs = 8, M = 18, grid = new Map(), key = (a, b) => (a + 512) * 1024 + (b + 512);
  for (let i = 0; i < d.length - 1; i++) {
    const a = d[i], b = d[i + 1], x0 = Math.floor((Math.min(a[0], b[0]) - M) / cs), x1 = Math.floor((Math.max(a[0], b[0]) + M) / cs), z0 = Math.floor((Math.min(a[1], b[1]) - M) / cs), z1 = Math.floor((Math.max(a[1], b[1]) + M) / cs);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = key(x, z); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(i); }
  }
  return Object.assign({ d, grid, cs, key }, def);
}
function nearest(p, x, z) {
  const l = p.grid.get(p.key(Math.floor(x / p.cs), Math.floor(z / p.cs))); if (!l) return null;
  let best = 1e18, bi = 0, bt = 0;
  for (let q = 0; q < l.length; q++) { const i = l[q], a = p.d[i], b = p.d[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1; let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; const px = a[0] + dx * t - x, pz = a[1] + dz * t - z, d2 = px * px + pz * pz; if (d2 < best) { best = d2; bi = i; bt = t; } }
  return { d: Math.sqrt(best), i: bi, t: bt };
}
CW.rivers = L.rivers.map(r => makePoly(r, 1)); CW.roads = L.roads.map(r => makePoly(r, 1));
CW.riverInfo = function (x, z) {            // t = distância/meia-largura (t<1 = dentro d'água)
  let best = null;
  for (const r of CW.rivers) { const n = nearest(r, x, z); if (!n) continue; const hw = r.hw * (.85 + .35 * vnoise(n.i * .08, r.hw * 7, 3)), t = n.d / hw; if (t < 4 && (!best || t < best.t)) best = { t, hw, d: n.d, i: n.i, id: r.id }; }
  return best;
};
CW.roadInfo = function (x, z) {             // d = distância à borda da estrada (negativo = sobre a estrada)
  let best = null;
  for (const r of CW.roads) { const n = nearest(r, x, z); if (!n) continue; const dd = n.d - r.hw; if (!best || dd < best.d) best = { d: dd, kind: r.kind, hw: r.hw, i: n.i }; }
  return best;
};

/* ---------- altura ---------- */
const T = L.temple;
function edgeDist(x, z) { return Math.min(HX - Math.abs(x), HZ - Math.abs(z)); }
CW.edgeDist = edgeDist;
function baseHeight(x, z) {
  let h = 1.3 + (fbm(x * .017 / K, z * .017 / K, 3, 1) - .5) * 4.2 + (fbm(x * .06 + 9, z * .06, 2, 2) - .5) * .9;
  for (const m of L.mountains) { const d = Math.hypot(x - m.x, z - m.z) / m.r; if (d < 1) { const g = 1 - d, gg = g * g * (3 - 2 * g); h += m.h * gg * (.55 + .9 * ridged(x * .045 / K + m.x, z * .045 / K + m.z, 5, 5)); } }
  const ox = Math.max(0, Math.abs(x) - HX), oz = Math.max(0, Math.abs(z) - HZ), od = Math.hypot(ox, oz);
  h += smooth(0, 12 * K, od) * (10 + 8 * ridged(x * .08 / K, z * .08 / K, 3, 9)) * K;
  const TR = L.terrace; if (TR) { const sd = (x - TR.x) * TR.nx + (z - TR.z) * TR.nz, rr = Math.hypot(x - TR.cx, z - TR.cz); h += TR.h * (1 - smooth(-1.6, 1.6, sd)) * (1 - smooth(TR.r0, TR.r1, rr)); }
  return h;
}
for (const c of L.camps) c.h0 = clamp(baseHeight(c.x, c.z), .9, 2.2);
for (const f of L.fields) f.h0 = clamp(baseHeight((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2), .9, 2);
CW.TEMPLE_Y = 2.3;
CW.PLAZA = { x: T.x, z: T.z + TS * (18 * Math.cos(Math.PI / 8) + 6.65 + 4.6), r: 6.6 * 1.8 };
CW.heightAt = function (x, z) {
  let h = baseHeight(x, z);
  const dt = Math.hypot(x - T.x, z - T.z); if (dt < T.platformR + 40) h = lerp(h, CW.TEMPLE_Y, 1 - smooth(T.platformR + 10, T.platformR + 38, dt));
  for (const c of L.camps) { const d = Math.hypot(x - c.x, z - c.z); if (d < CW.CAMP_R + 16) h = lerp(h, c.h0, 1 - smooth(CW.CAMP_R + 3, CW.CAMP_R + 15, d)); }
  for (const f of L.fields) { const d = Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1)); if (d < 5) h = lerp(h, f.h0, 1 - smooth(0, 5, d)); }
  const ri = CW.riverInfo(x, z);
  if (ri) { const bankW = 2.4 + clamp((h - 3) * .14, 0, 3.5), t = ri.t; if (t < bankW) { const c = 1 - smooth(.85, bankW, t), bed = -1.15 + .7 * Math.min(1, t * t); h = lerp(h, Math.min(h, bed), c); } }
  return h;
};

/* ---------- máscaras de zona ---------- */
CW.forestDensity = function (x, z) {
  const n = fbm(x * .035 / K + 7, z * .035 / K - 3, 3, 11);
  let b = smooth(14 * K, 2 * K, edgeDist(x, z)) * .6;
  for (const f of L.forests) { const s = f.r * .62; b += f.k * Math.exp(-((x - f.x) ** 2 + (z - f.z) ** 2) / (2 * s * s)); }
  const open = 1 - .8 * (1 - smooth(26 * K, 46 * K, Math.hypot(x * .8, z - 4 * K)));
  return clamp((n - .6 + b * 1.1) * 3.4 * open, 0, 1);
};
CW.meadowAt = function (x, z) { let m = 0; for (const q of L.meadows) m = Math.max(m, 1 - smooth(q.r * .45, q.r, Math.hypot(x - q.x, z - q.z))); return m;
};
CW.campDist = function (x, z) { let d = 1e9; for (const c of L.camps) d = Math.min(d, Math.hypot(x - c.x, z - c.z)); return d; };
CW.fieldDist = function (x, z) { let d = 1e9; for (const f of L.fields) d = Math.min(d, Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1))); return d; };
CW.freeness = function (x, z) {            // 0 = ocupado (água, estrada, acampamento, casona, plantação), 1 = livre
  const ri = CW.riverInfo(x, z), rd = ri ? (ri.d - ri.hw) : 99, ro = CW.roadInfo(x, z), dt = Math.hypot(x - T.x, z - T.z);
  return smooth(1.2, 3, rd) * smooth(1.6, 3.2, ro ? ro.d : 99) * smooth(CW.CAMP_R + 3, CW.CAMP_R + 9, CW.campDist(x, z)) * smooth(T.platformR + 10, T.platformR + 18, dt) * smooth(.2, 2.4, CW.fieldDist(x, z)) * CW.boulderFree(x, z);
};
CW.boulderFree = function (x, z) { let f = 1; for (const b of L.boulders) f = Math.min(f, smooth(b.s * 2.2, b.s * 3.4, Math.hypot(x - b.x, z - b.z))); return f; };
CW.slopeAt = function (x, z) { const e = .8, h = CW.heightAt(x, z); return Math.max(Math.abs(CW.heightAt(x + e, z) - h), Math.abs(CW.heightAt(x, z + e) - h), Math.abs(CW.heightAt(x - e, z) - h), Math.abs(CW.heightAt(x, z - e) - h)) / e; };

/* ---------- objetos espalhados (células de 3 blocos, determinísticos) ---------- */
const CS = 3; CW.CS = CS;
CW.cellObjects = function (ix, iz) {
  const out = [], r = mulberry32((hash2(ix, iz, 777) * 4294967296) | 0), jx = () => (ix + r()) * CS, jz = () => (iz + r()) * CS;
  const inWorld = (x, z) => Math.abs(x) < HX + EXT + 4 && Math.abs(z) < HZ + EXT + 4;
  for (let k = 0; k < 2; k++) {                                   // árvores
    const x = jx(), z = jz(), roll = r(), kind = r(); if (!inWorld(x, z)) continue;
    const fd = CW.forestDensity(x, z); if (roll > fd * .95) continue;
    const fr = CW.freeness(x, z); if (fr < .55) continue;
    const h = CW.heightAt(x, z); if (h > 26 || CW.slopeAt(x, z) > 1.0) continue;
    const ri = CW.riverInfo(x, z), nearWater = ri && ri.d - ri.hw < 9;
    const oak = kind < (nearWater ? .3 : .1) * (1.1 - fd * .5);
    out.push({ t: oak ? 'oak' : 'pine', x, z, y: h, s: .8 + r() * .5, seed: (r() * 1e9) | 0 });
  }
  { const x = jx(), z = jz(), roll = r(); if (inWorld(x, z)) {          // arbustos
      const fr = CW.freeness(x, z), ri = CW.riverInfo(x, z), ro = CW.roadInfo(x, z), cd = CW.campDist(x, z);
      let p = .07 * (1 - CW.forestDensity(x, z) * .5);
      if (ri && ri.d - ri.hw < 7) p += .12; if (ro && ro.d > 2.6 && ro.d < 7) p += .06; if (cd > CW.CAMP_R + 4 && cd < CW.CAMP_R + 12) p += .14;
      const dt = Math.hypot(x - T.x, z - T.z); if (dt > T.platformR + 14 && dt < T.platformR + 26) p += .12;
      if (roll < p && fr > .6) { const h = CW.heightAt(x, z); if (h < 9 && CW.slopeAt(x, z) < 1.1) out.push({ t: 'bush', x, z, y: h, s: .8 + r() * .8, seed: (r() * 1e9) | 0 }); } } }
  { const x = jx(), z = jz(), roll = r(); if (inWorld(x, z)) {          // pedras
      const fr = CW.freeness(x, z), ri = CW.riverInfo(x, z), cd = CW.campDist(x, z), h = CW.heightAt(x, z), sl = CW.slopeAt(x, z);
      let p = .05 + clamp(sl - .35, 0, .6) * .5 + (h > 6 ? .15 : 0); if (ri && ri.d - ri.hw < 5) p += .1; if (cd > CW.CAMP_R + 3 && cd < CW.CAMP_R + 9) p += .12;
      if (roll < p && fr > .45) out.push({ t: 'rock', x, z, y: h, s: .5 + r() * r() * 2.2, seed: (r() * 1e9) | 0 }); } }
  for (let k = 0; k < 3; k++) { const x = jx(), z = jz(), roll = r(); if (!inWorld(x, z)) continue;   // seixos nas margens dos rios
    const ri = CW.riverInfo(x, z); if (!ri) continue; const e = ri.d - ri.hw; if (e < .2 || e > 2.6 || roll > .8) continue; const ro = CW.roadInfo(x, z); if (ro && ro.d < 2.5) continue;
    out.push({ t: 'pebble', x, z, y: CW.heightAt(x, z), s: .32 + r() * .4, seed: (r() * 1e9) | 0 }); }
  for (let k = 0; k < 2; k++) { const x = jx(), z = jz(), roll = r(), md = CW.meadowAt(x, z); if (inWorld(x, z) && roll < .22 + md * .7) {   // campos de flores (prados)
      const m = Math.max(smooth(.5, .6, fbm(x * .05 / K + 40, z * .05 / K, 3, 31)) * .6, md), fr = CW.freeness(x, z), h = CW.heightAt(x, z);
      if (m > .25 && fr > .7 && CW.forestDensity(x, z) < .4 && h < 6) out.push({ t: 'flowers', x, z, y: h, s: 1, seed: (r() * 1e9) | 0, n: 6 + ((r() * (8 + md * 10)) | 0) }); } }
  return out;
};

/* ---------- penhascos nas montanhas e pontes (calculados uma vez) ---------- */
CW.crags = [];
{ const r = mulberry32(4242);
  for (const m of L.mountains) {
    const N = Math.floor(m.r * 1.5);
    for (let i = 0; i < N; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * m.r * .85, x = m.x + Math.cos(a) * d, z = m.z + Math.sin(a) * d, h = CW.heightAt(x, z), ri = CW.riverInfo(x, z), rr = r(), ss = r();
      if (h > 5 && (!ri || ri.d - ri.hw > 6)) CW.crags.push({ x, z, y: h, s: (.7 + ss * 1.4) * (.7 + h * .05), seed: (rr * 1e9) | 0 }); }
  } }
for (const b of L.boulders) CW.crags.push({ x: b.x, z: b.z, y: CW.heightAt(b.x, b.z), s: b.s * .55, seed: (b.x * 977 + b.z * 131) | 0, boulder: true });
CW.bridges = [];
for (const rd of CW.roads) {
  let inside = false, start = null, last = null;
  for (let i = 0; i < rd.d.length; i++) {
    const p = rd.d[i], ri = CW.riverInfo(p[0], p[1]), isIn = ri && ri.t < 1.15;
    if (isIn && !inside) { inside = true; start = i; }
    if ((!isIn || i === rd.d.length - 1) && inside) { inside = false; const a = rd.d[Math.max(0, start - 2)], b = rd.d[Math.min(rd.d.length - 1, i + 1)]; CW.bridges.push({ a: a.slice(), b: b.slice(), hw: rd.hw, kind: rd.kind }); }
  }
}
})(typeof window !== 'undefined' ? window : globalThis);
