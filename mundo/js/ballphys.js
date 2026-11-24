/* CyberArena · ballphys (v155) — física da bola de futebol (sem THREE, só números).
   Esfera com gravidade, arrasto do ar, efeito Magnus (curva), quique com restituição, atrito/rolagem com rotação real
   (escorrega → rola), e colisão com caixas, cápsulas (traves/travessão) e a rede.
   Eixos: x = largura do campo, y = altura, z = comprimento. Unidades em metros e segundos. */
export const BALL = {
  R: .22,          // raio (um pouco maior que a bola oficial, para ler bem no celular)
  g: 13,           // gravidade da bola (o jogo é mais "pesado" que a vida real: personagens pulam ~1,8 m)
  e: .62,          // restituição no gramado
  mu: .5,          // atrito de deslize bola×grama
  kd: .0085,        // arrasto do ar: a = -kd·|v|·v
  magnus: .0050,   // efeito: a = magnus·(ω × v)
  roll: 1.4,       // resistência de rolagem (m/s²)
  rollLin: .03,   // + parte proporcional à velocidade (1/s)
  wDecayAir: .06,  // perda de rotação no ar (1/s)
  wDecayYaw: .9,   // perda da rotação vertical no chão (1/s)
};
const R = BALL.R, I_K = 2 / 3;   // oca: I = 2/3·m·R²

export class BallPhys {
  constructor() {
    this.x = 0; this.y = R; this.z = 0; this.vx = this.vy = this.vz = 0; this.wx = this.wy = this.wz = 0;
    this.colliders = []; this.onHit = null; this.onBounce = null; this.onGround = true; this.frozen = false; this.rest = 0;
  }
  place(x, y, z) { this.x = x; this.y = Math.max(R, y); this.z = z; this.vx = this.vy = this.vz = 0; this.wx = this.wy = this.wz = 0; this.rest = 0; }
  get speed() { return Math.hypot(this.vx, this.vy, this.vz); }
  /* chute: velocidade (vetor) e rotação (vetor) já calculadas por quem chuta */
  launch(vx, vy, vz, wx, wy, wz) { this.vx = vx; this.vy = vy; this.vz = vz; this.wx = wx; this.wy = wy; this.wz = wz; this.onGround = false; this.rest = 0; }
  step(dt) {
    if (this.frozen) return;
    const sp = this.speed, n = Math.min(14, Math.max(1, Math.ceil(sp * dt / (R * .45))));
    const h = dt / n; for (let i = 0; i < n; i++) this.sub(h);
  }
  sub(h) {
    let { vx, vy, vz, wx, wy, wz } = this; const air = this.y > R + .02;
    // forças no ar: gravidade, arrasto, Magnus (ω × v)
    vy -= BALL.g * h;
    const sp = Math.hypot(vx, vy, vz);
    if (sp > 1e-4) { const k = BALL.kd * sp * h; vx -= vx * k; vy -= vy * k; vz -= vz * k; }
    if (air) {
      const mx = wy * vz - wz * vy, my = wz * vx - wx * vz, mz = wx * vy - wy * vx, M = BALL.magnus * h;
      vx += mx * M; vy += my * M; vz += mz * M;
      const d = Math.max(0, 1 - BALL.wDecayAir * h); wx *= d; wy *= d; wz *= d;
    }
    this.vx = vx; this.vy = vy; this.vz = vz; this.wx = wx; this.wy = wy; this.wz = wz;
    this.x += vx * h; this.y += vy * h; this.z += vz * h;
    this.ground(h);
    for (let k = 0; k < 2; k++) for (const c of this.colliders) this.collide(c);
    if (this.y < R) this.ground(h);
  }
  ground(h) {
    if (this.y > R) { this.onGround = false; return; }
    this.y = R;
    if (this.vy < -1.4) {          // quique: restituição + atrito no impacto (a rotação muda)
      const vin = -this.vy, e = BALL.e;
      let ux = this.vx + R * this.wz, uz = this.vz - R * this.wx; const ul = Math.hypot(ux, uz);
      this.vy = vin * e;
      if (ul > 1e-4) {
        ux /= ul; uz /= ul;
        const Jn = (1 + e) * vin, Jstick = ul / (1 + 1 / I_K), Jf = Math.min(BALL.mu * Jn, Jstick);   // por unidade de massa
        this.vx -= Jf * ux; this.vz -= Jf * uz;
        const Fx = -Jf * ux, Fz = -Jf * uz, I = I_K * R * R;
        this.wx += (-R * Fz) / I; this.wz += (R * Fx) / I;
      }
      this.onGround = false; this.rest = 0; if (this.onBounce) this.onBounce(vin);
      return;
    }
    // em contato com o chão (rolando/deslizando)
    this.vy = 0; this.onGround = true;
    let ux = this.vx + R * this.wz, uz = this.vz - R * this.wx; const ul = Math.hypot(ux, uz);
    if (ul > .02) {                 // deslizando: atrito cinético até começar a rolar
      const need = ul / (h * BALL.g * (1 + 1 / I_K)), f = Math.min(BALL.mu, need), ax = -ux / ul, az = -uz / ul, dv = f * BALL.g * h;
      this.vx += ax * dv; this.vz += az * dv;
      const I = I_K * R * R; this.wx += (-R * az * dv) / I; this.wz += (R * ax * dv) / I;
    }
    // resistência de rolagem
    const sp = Math.hypot(this.vx, this.vz);
    if (sp > 1e-3) {
      const dec = (BALL.roll + BALL.rollLin * sp) * h, ns = Math.max(0, sp - dec), k = ns / sp; this.vx *= k; this.vz *= k;
      if (ns < .05) { this.vx = this.vz = 0; }
    }
    // mantém ω coerente com a rolagem (sem deslize) e deixa a rotação vertical morrer
    if (Math.hypot(ux, uz) < .6 || sp < 3) { this.wx = this.vz / R; this.wz = -this.vx / R; }
    this.wy *= Math.max(0, 1 - BALL.wDecayYaw * h);
    this.rest = (Math.hypot(this.vx, this.vz) < .05) ? this.rest + h : 0;
  }
  /* colisão esfera × (caixa | cápsula) */
  collide(c) {
    let cx, cy, cz;
    if (c.t === 'box') {
      cx = Math.min(Math.max(this.x, c.x0), c.x1); cy = Math.min(Math.max(this.y, c.y0), c.y1); cz = Math.min(Math.max(this.z, c.z0), c.z1);
      if (cx === this.x && cy === this.y && cz === this.z) {   // centro dentro da caixa: sai pela face mais próxima
        const d = [this.x - c.x0, c.x1 - this.x, this.y - c.y0, c.y1 - this.y, this.z - c.z0, c.z1 - this.z]; let m = 0; for (let i = 1; i < 6; i++) if (d[i] < d[m]) m = i;
        if (m === 0) cx = c.x0; else if (m === 1) cx = c.x1; else if (m === 2) cy = c.y0; else if (m === 3) cy = c.y1; else if (m === 4) cz = c.z0; else cz = c.z1;
      }
    } else {                       // cápsula: segmento (x0,y0,z0)-(x1,y1,z1) com raio c.r
      const dx = c.x1 - c.x0, dy = c.y1 - c.y0, dz = c.z1 - c.z0, L2 = dx * dx + dy * dy + dz * dz || 1e-9;
      let t = ((this.x - c.x0) * dx + (this.y - c.y0) * dy + (this.z - c.z0) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      cx = c.x0 + dx * t; cy = c.y0 + dy * t; cz = c.z0 + dz * t;
    }
    let nx = this.x - cx, ny = this.y - cy, nz = this.z - cz, d = Math.hypot(nx, ny, nz); const rr = R + (c.r || 0);
    if (d >= rr) return false;
    if (d < 1e-6) { nx = 0; ny = 1; nz = 0; d = 1; } else { nx /= d; ny /= d; nz /= d; }
    const pen = rr - d; this.x += nx * pen; this.y += ny * pen; this.z += nz * pen;
    const vn = this.vx * nx + this.vy * ny + this.vz * nz; if (vn >= 0) return true;
    const e = c.e ?? .5, tf = c.tf ?? .9;     // restituição e fração da velocidade tangencial que sobra
    const tx = this.vx - vn * nx, ty = this.vy - vn * ny, tz = this.vz - vn * nz;
    this.vx = tx * tf - e * vn * nx; this.vy = ty * tf - e * vn * ny; this.vz = tz * tf - e * vn * nz;
    // a rotação responde ao atrito tangencial (levemente)
    const sx = ty * nz - tz * ny, sy = tz * nx - tx * nz, sz = tx * ny - ty * nx, k = (1 - tf) * .5 / R;
    this.wx += sx * k; this.wy += sy * k; this.wz += sz * k;
    if (c.soft) { this.vx *= c.soft; this.vy *= c.soft; this.vz *= c.soft; this.wx *= .5; this.wy *= .5; this.wz *= .5; }
    if (this.onHit) this.onHit(c, -vn);
    return true;
  }
}

/* ---- construtores de colisores ---- */
export const box = (x0, y0, z0, x1, y1, z1, o = {}) => Object.assign({ t: 'box', x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0, y1, z0: Math.min(z0, z1), z1: Math.max(z0, z1) }, o);
export const cap = (x0, y0, z0, x1, y1, z1, r, o = {}) => Object.assign({ t: 'cap', x0, y0, z0, x1, y1, z1, r }, o);
