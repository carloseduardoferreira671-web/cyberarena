/* Lógica do mapa em "blocos" (herdada do mundo 3D anterior). O world.js converte para metros. Carregado depois de definir globalThis.CW.LAYOUT. */
/* CyberWorld · núcleo: ruído determinístico, rios, estradas, altura do terreno e colocação de objetos.
   Unidade = 1 bloco (Cyber tem 3 blocos de altura). Eixos: X leste, Z sul, Y para cima. Tudo é função pura da posição
   e da semente, então qualquer chunk pode ser (re)gerado sozinho e sempre sai igual. */
(function (G) {
'use strict';
const CW = G.CW = G.CW || {}, L = CW.LAYOUT;
const HX = (L.world && L.world.hx) || 100, HZ = (L.world && L.world.hz) || 56, EXT = 12;   // v142: tamanho do mapa vem do layout
CW.W = { HX, HZ, EXT, X0: -HX - EXT, Z0: -HZ - EXT, CWID: 28, CHGT: 35, NCX: 8, NCZ: 4, CELL: 0.7, WATER_Y: -0.25 };

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
  let h = 1.3 + (fbm(x * .017, z * .017, 3, 1) - .5) * 2.6 + (fbm(x * .06 + 9, z * .06, 2, 2) - .5) * .8;
  for (const m of L.mountains) { const d = Math.hypot(x - m.x, z - m.z) / m.r; if (d < 1) { const g = 1 - d, gg = g * g * (3 - 2 * g); h += m.h * gg * (.55 + .9 * ridged(x * .045 + m.x, z * .045 + m.z, 4, 5)); } }
  const ox = Math.max(0, Math.abs(x) - HX), oz = Math.max(0, Math.abs(z) - HZ), od = Math.hypot(ox, oz);
  h += smooth(0, 12, od) * (10 + 8 * ridged(x * .08, z * .08, 3, 9));
  return h;
}
for (const c of L.camps) c.h0 = clamp(baseHeight(c.x, c.z), .9, 2.2);
for (const f of L.fields) f.h0 = clamp(baseHeight((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2), .9, 2);
CW.TEMPLE_Y = .9;
T.scale = T.scale || 1; T.face = T.face || 0;
CW.TF = { s: Math.sin(T.face * Math.PI / 180), c: Math.cos(T.face * Math.PI / 180), k: T.scale };   // fachada da casona olha para (s, c)
CW.templeLocal = (x, z) => { const dx = x - T.x, dz = z - T.z; return [(dx * CW.TF.c - dz * CW.TF.s) / T.scale, (dx * CW.TF.s + dz * CW.TF.c) / T.scale]; };   // espaço da construção (sem escala): +Z = fachada
CW.templeWorld = (lx, lz) => [T.x + (lx * CW.TF.c + lz * CW.TF.s) * T.scale, T.z + (-lx * CW.TF.s + lz * CW.TF.c) * T.scale];
{ const pz = 18 * Math.cos(Math.PI / 8) + 6.65 + 4.6, w = CW.templeWorld(0, pz); CW.PLAZA = { x: w[0], z: w[1], r: 6.6 * T.scale }; }
/* escadarias da casona (espaço local): frente e laterais */
CW.templeSolid = function (x, z) {
  const q = CW.templeLocal(x, z), A = 18 * Math.cos(Math.PI / 8), lx = q[0], lz = q[1];
  if (Math.hypot(lx, lz) < 18.6) return true;
  if (Math.abs(lx) < 4.9 && lz > A - .5 && lz < A + 7.1) return true;
  if (Math.abs(lz) < 3.4 && Math.abs(lx) > A - .5 && Math.abs(lx) < A + 5.1) return true;
  return false;
};
CW.heightAt = function (x, z) {
  let h = baseHeight(x, z);
  const dt = Math.hypot(x - T.x, z - T.z); if (dt < T.platformR + 20) h = lerp(h, CW.TEMPLE_Y, 1 - smooth(T.platformR + 2, T.platformR + 19, dt));
  { const dp = Math.hypot(x - CW.PLAZA.x, z - CW.PLAZA.z); if (dp < CW.PLAZA.r + 8) h = lerp(h, CW.TEMPLE_Y + .05, 1 - smooth(CW.PLAZA.r, CW.PLAZA.r + 8, dp)); }
  for (const c of L.camps) { const d = Math.hypot(x - c.x, z - c.z); if (d < 12) h = lerp(h, c.h0, 1 - smooth(6, 11, d)); }
  for (const f of L.fields) { const d = Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1)); if (d < 5) h = lerp(h, f.h0, 1 - smooth(0, 5, d)); }
  const ri = CW.riverInfo(x, z);
  if (ri) { const bankW = 2.4 + clamp((h - 3) * .14, 0, 3.5), t = ri.t; if (t < bankW) { const c = 1 - smooth(.85, bankW, t), bed = -1.15 + .7 * Math.min(1, t * t); h = lerp(h, Math.min(h, bed), c); } }
  return h;
};

/* ---------- máscaras de zona ---------- */
CW.forestDensity = function (x, z) {
  const n = fbm(x * .035 + 7, z * .035 - 3, 3, 11);
  let b = smooth(16, 2, edgeDist(x, z)) * .7 + smooth(HX * .7, HX * .9, Math.abs(x)) * .45;
  for (const f of L.forests || []) { const d2 = (x - f.x) ** 2 + (z - f.z) ** 2; if (d2 < 9 * f.r * f.r) b += Math.exp(-d2 / (2 * f.r * f.r * .45)) * .95 * f.k; }
  return clamp((n - .42 + b) * 3.2, 0, 1);
};
CW.spotDist = function (x, z) { let d = 1e9; for (const r of (L.ruins || [])) d = Math.min(d, Math.hypot(x - r.x, z - r.z) - 3); for (const t of (L.towers || [])) d = Math.min(d, Math.hypot(x - t.x, z - t.z)); return d; };   // v143: distância até ruínas/torres (blocos)
CW.campDist = function (x, z) { let d = 1e9; for (const c of L.camps) d = Math.min(d, Math.hypot(x - c.x, z - c.z)); return d; };
CW.fieldDist = function (x, z) { let d = 1e9; for (const f of L.fields) d = Math.min(d, Math.hypot(Math.max(f.x0 - x, 0, x - f.x1), Math.max(f.z0 - z, 0, z - f.z1))); return d; };
CW.freeness = function (x, z) {            // 0 = ocupado (água, estrada, acampamento, casona, plantação), 1 = livre
  const ri = CW.riverInfo(x, z), rd = ri ? (ri.d - ri.hw) : 99, ro = CW.roadInfo(x, z), dt = Math.hypot(x - T.x, z - T.z);
  return smooth(1.2, 3, rd) * smooth(1.6, 3.2, ro ? ro.d : 99) * smooth(7, 11, CW.campDist(x, z)) * smooth(T.platformR + 3, T.platformR + 9, dt) * smooth(.2, 2.4, CW.fieldDist(x, z)) * smooth(CW.PLAZA.r + 1, CW.PLAZA.r + 4, Math.hypot(x - CW.PLAZA.x, z - CW.PLAZA.z)) * (CW.templeSolid(x, z) ? 0 : 1) * smooth(5, 9, CW.spotDist(x, z));
};
CW.meadow = function (x, z) {
  let m = 0; for (const w of L.meadows || []) { const d = Math.hypot(x - w.x, z - w.z); if (d < w.r) m = Math.max(m, 1 - d / w.r); } return m;
};
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
    const h = CW.heightAt(x, z); if (h > 12 || CW.slopeAt(x, z) > 1.0) continue;
    const ri = CW.riverInfo(x, z), nearWater = ri && ri.d - ri.hw < 9;
    const oak = kind < (nearWater ? .55 : .2) * (1.1 - fd * .5);
    out.push({ t: oak ? 'oak' : 'pine', x, z, y: h, s: .8 + r() * .5, seed: (r() * 1e9) | 0 });
  }
  { const x = jx(), z = jz(), roll = r(); if (inWorld(x, z)) {          // arbustos
      const fr = CW.freeness(x, z), ri = CW.riverInfo(x, z), ro = CW.roadInfo(x, z), cd = CW.campDist(x, z);
      let p = .16 * (1 - CW.forestDensity(x, z) * .5);
      if (ri && ri.d - ri.hw < 7) p += .22; if (ro && ro.d > 2.6 && ro.d < 7) p += .12; if (cd > 8 && cd < 16) p += .2;
      const dt = Math.hypot(x - T.x, z - T.z); if (dt > T.platformR + 4 && dt < T.platformR + 14) p += .12;
      if (roll < p && fr > .6) { const h = CW.heightAt(x, z); if (h < 9 && CW.slopeAt(x, z) < 1.1) out.push({ t: 'bush', x, z, y: h, s: .8 + r() * .8, seed: (r() * 1e9) | 0 }); } } }
  { const x = jx(), z = jz(), roll = r(); if (inWorld(x, z)) {          // pedras
      const fr = CW.freeness(x, z), ri = CW.riverInfo(x, z), cd = CW.campDist(x, z), h = CW.heightAt(x, z), sl = CW.slopeAt(x, z);
      let p = .05 + clamp(sl - .35, 0, .6) * .5 + (h > 6 ? .15 : 0); if (ri && ri.d - ri.hw < 5) p += .1; if (cd > 7 && cd < 13) p += .12;
      if (roll < p && fr > .45) out.push({ t: 'rock', x, z, y: h, s: .5 + r() * r() * 2.2, seed: (r() * 1e9) | 0 }); } }
  { const x = jx(), z = jz(), roll = r(); if (inWorld(x, z) && roll < .30 + CW.meadow(x, z) * .6) {   // campos de flores (prados)
      const m = Math.max(smooth(.44, .56, fbm(x * .05 + 40, z * .05, 3, 31)), CW.meadow(x, z) * 1.2), fr = CW.freeness(x, z), h = CW.heightAt(x, z);
      if (m > .25 && fr > .7 && CW.forestDensity(x, z) < .4 && h < 5) out.push({ t: 'flowers', x, z, y: h, s: 1, seed: (r() * 1e9) | 0, n: 5 + ((r() * 8) | 0) }); } }
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
