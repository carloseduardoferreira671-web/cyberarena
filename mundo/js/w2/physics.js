/* CyberArena 3D · física do mundo: sólidos (paredes, caixotes, degraus, pontes), chão pisável, colisão e raycast.
   Formas: box {x,z,hx,hz,rot}, circle {x,z,r}, poly {pts:[[x,z]...] convexo}. Faixa vertical [y0,y1].
   floor:true → o topo é pisável. vault:true → obstáculo baixo que dá para pular com animação. */
export const STEP = 0.46;

export class Physics {
  constructor(heightAt) { this.heightAt = heightAt; this.solids = []; this.cell = 8; this.grid = new Map(); }
  key(ix, iz) { return (ix + 4096) * 8192 + (iz + 4096); }
  add(s) {
    if (s.type === 'box') { const c = Math.cos(s.rot || 0), sn = Math.sin(s.rot || 0); s.c = c; s.s = sn; const ex = Math.abs(c) * s.hx + Math.abs(sn) * s.hz, ez = Math.abs(sn) * s.hx + Math.abs(c) * s.hz; s.bb = [s.x - ex, s.z - ez, s.x + ex, s.z + ez]; }
    else if (s.type === 'circle') s.bb = [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
    else if (s.type === 'poly') {
      /* garante a orientação esperada (centro fica do lado "de dentro" de todas as arestas) */
      const P = s.pts, cx = P.reduce((t, p) => t + p[0], 0) / P.length, cz = P.reduce((t, p) => t + p[1], 0) / P.length, e0 = [P[1][0] - P[0][0], P[1][1] - P[0][1]];
      if ((cx - P[0][0]) * e0[1] - (cz - P[0][1]) * e0[0] > 0) s.pts = P.slice().reverse();
      let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of s.pts) { a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]); } s.bb = [a, b, c, d]; }
    if (s.vault === undefined) s.vault = false;
    s.id = this.solids.length; this.solids.push(s);
    const C = this.cell;
    for (let ix = Math.floor(s.bb[0] / C); ix <= Math.floor(s.bb[2] / C); ix++) for (let iz = Math.floor(s.bb[1] / C); iz <= Math.floor(s.bb[3] / C); iz++) {
      const k = this.key(ix, iz); let l = this.grid.get(k); if (!l) this.grid.set(k, l = []); l.push(s);
    }
    return s;
  }
  near(x, z, r, out) {
    out.length = 0; const C = this.cell, mark = ++this._m || (this._m = 1);
    for (let ix = Math.floor((x - r) / C); ix <= Math.floor((x + r) / C); ix++) for (let iz = Math.floor((z - r) / C); iz <= Math.floor((z + r) / C); iz++) {
      const l = this.grid.get(this.key(ix, iz)); if (!l) continue;
      for (const s of l) if (s._m !== mark) { s._m = mark; if (x + r >= s.bb[0] && x - r <= s.bb[2] && z + r >= s.bb[1] && z - r <= s.bb[3]) out.push(s); }
    }
    return out;
  }
  /* ponto dentro da forma (com margem m) */
  inside(s, x, z, m = 0) {
    if (s.type === 'box') { const dx = x - s.x, dz = z - s.z, lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c; return Math.abs(lx) <= s.hx + m && Math.abs(lz) <= s.hz + m; }
    if (s.type === 'circle') return Math.hypot(x - s.x, z - s.z) <= s.r + m;
    const P = s.pts, n = P.length; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], l = Math.hypot(ex, ez); if (((x - a[0]) * ez - (z - a[1]) * ex) / l > m) return false; } return true;
  }
  topOf(s, x, z) { return s.topFn ? s.topFn(x, z) : s.y1; }
  /* chão: maior topo pisável ≤ fromY + STEP (terreno incluído) */
  groundAt(x, z, fromY = 1e9, info, step = STEP) {
    let best = this.heightAt(x, z), who = null; const l = this.near(x, z, 0.05, this._g || (this._g = []));
    for (const s of l) if (s.floor && this.inside(s, x, z, 0.02)) { const t = this.topOf(s, x, z); if (t <= fromY + step && t > best) { best = t; who = s; } }
    if (info) info.solid = who; return best;
  }
  /* empurra o círculo (pés em pos.y) para fora dos sólidos que cruzam a faixa do corpo */
  resolve(pos, radius = 0.4, height = 1.85, step = STEP) {
    const res = { hit: false, nx: 0, nz: 0, collider: null, depth: 0 }, l = this.near(pos.x, pos.z, radius + 0.1, this._r || (this._r = []));
    for (let iter = 0; iter < 2; iter++) for (const s of l) {
      if (s.noCollide) continue;
      const top = s.topFn ? s.topFn(pos.x, pos.z) : s.y1;
      if (top <= pos.y + step || s.y0 >= pos.y + height) continue;
      let nx = 0, nz = 0, d = 0;
      if (s.type === 'circle') { const dx = pos.x - s.x, dz = pos.z - s.z, L = Math.hypot(dx, dz) || 1e-6; d = s.r + radius - L; if (d <= 0) continue; nx = dx / L; nz = dz / L; }
      else if (s.type === 'box') {
        const dx = pos.x - s.x, dz = pos.z - s.z, lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c;
        const qx = Math.max(-s.hx, Math.min(s.hx, lx)), qz = Math.max(-s.hz, Math.min(s.hz, lz)); let ox = lx - qx, oz = lz - qz, L = Math.hypot(ox, oz);
        if (L > 1e-6) { d = radius - L; if (d <= 0) continue; ox /= L; oz /= L; }
        else { const px = s.hx - Math.abs(lx), pz = s.hz - Math.abs(lz); if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; d = px + radius; } else { ox = 0; oz = Math.sign(lz) || 1; d = pz + radius; } }
        nx = ox * s.c + oz * s.s; nz = -ox * s.s + oz * s.c;
      } else {
        const P = s.pts, n = P.length; let inside = true, bestD = 1e9, bnx = 0, bnz = 0, cd = 1e9, cnx = 0, cnz = 0;
        for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], el = Math.hypot(ex, ez), onx = ez / el, onz = -ex / el, sd = (pos.x - a[0]) * onx + (pos.z - a[1]) * onz;
          if (sd > 0) inside = false; if (-sd < bestD) { bestD = -sd; bnx = onx; bnz = onz; }
          let t = ((pos.x - a[0]) * ex + (pos.z - a[1]) * ez) / (el * el); t = Math.max(0, Math.min(1, t)); const qx = pos.x - (a[0] + ex * t), qz = pos.z - (a[1] + ez * t), ql = Math.hypot(qx, qz); if (ql < cd) { cd = ql; cnx = qx / (ql || 1); cnz = qz / (ql || 1); } }
        if (inside) { d = bestD + radius; nx = bnx; nz = bnz; } else { d = radius - cd; if (d <= 0) continue; nx = cnx; nz = cnz; }
      }
      pos.x += nx * d; pos.z += nz * d;
      if (d > res.depth) { res.hit = true; res.nx = nx; res.nz = nz; res.collider = s; res.depth = d; }
    }
    return res;
  }
  /* distância até o primeiro obstáculo ao longo do raio (sólidos + terreno) */
  raycast(o, dir, maxDist = 60) {
    let best = maxDist; const steps = Math.ceil(maxDist / 6), tmp = this._rc || (this._rc = []), seen = new Set();
    for (let k = 0; k <= steps; k++) {
      const t = Math.min(maxDist, k * 6), x = o.x + dir.x * t, z = o.z + dir.z * t;
      for (const s of this.near(x, z, 6, tmp)) { if (seen.has(s.id) || s.noCollide) continue; seen.add(s.id); const h = this.rayHit(s, o, dir, best); if (h < best) best = h; }
      if (t > best) break;
    }
    /* terreno: marcha + refinamento */
    let prev = 0;
    for (let t = 0.5; t < best; t += 0.75) {
      const y = o.y + dir.y * t, h = this.heightAt(o.x + dir.x * t, o.z + dir.z * t);
      if (y < h) { let a = prev, b = t; for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (o.y + dir.y * m < this.heightAt(o.x + dir.x * m, o.z + dir.z * m)) b = m; else a = m; } best = Math.min(best, a); break; }
      prev = t;
    }
    return best >= maxDist ? Infinity : best;
  }
  rayHit(s, o, d, maxT) {
    let t0 = 0, t1 = maxT;
    if (s.type === 'box') {
      const dx = o.x - s.x, dz = o.z - s.z, lx = dx * s.c - dz * s.s, lz = dx * s.s + dz * s.c, vx = d.x * s.c - d.z * s.s, vz = d.x * s.s + d.z * s.c;
      for (const [p, v, h] of [[lx, vx, s.hx], [lz, vz, s.hz]]) { if (Math.abs(v) < 1e-9) { if (Math.abs(p) > h) return Infinity; continue; } let a = (-h - p) / v, b = (h - p) / v; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
    } else if (s.type === 'circle') {
      const fx = o.x - s.x, fz = o.z - s.z, A = d.x * d.x + d.z * d.z, B = 2 * (fx * d.x + fz * d.z), C = fx * fx + fz * fz - s.r * s.r; if (A < 1e-9) { if (C > 0) return Infinity; } else { const D = B * B - 4 * A * C; if (D < 0) return Infinity; const q = Math.sqrt(D); t0 = Math.max(t0, (-B - q) / (2 * A)); t1 = Math.min(t1, (-B + q) / (2 * A)); if (t0 > t1) return Infinity; }
    } else {
      const P = s.pts, n = P.length; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], nx = ez, nz = -ex, den = nx * d.x + nz * d.z, num = nx * (o.x - a[0]) + nz * (o.z - a[1]);
        if (Math.abs(den) < 1e-9) { if (num > 0) return Infinity; continue; } const t = -num / den; if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); if (t0 > t1) return Infinity; }
    }
    /* faixa vertical */
    const top = s.y1;
    if (Math.abs(d.y) < 1e-9) { if (o.y < s.y0 || o.y > top) return Infinity; }
    else { let a = (s.y0 - o.y) / d.y, b = (top - o.y) / d.y; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return Infinity; }
    return t0 > 0.02 ? t0 : (t1 > 0.02 && t0 <= 0.02 ? Infinity : Infinity);
  }
}
