/* CyberArena · aim (v161) — mira do futebol: só números, sem THREE (dá para testar no Node).
   A mira (ponto no centro da tela) diz ONDE a bola deve chegar. Como o efeito (curva) desvia a bola, este módulo SIMULA o voo com a
   mesma física do jogo (ballphys.js) e acha a direção e a elevação do chute para a bola chegar no ponto, com o efeito escolhido.
   É isso que permite o gol olímpico: mira no gol, de qualquer ângulo, e o efeito só muda o formato da curva.
   Se o jogador chutar mal (longe do pé, correndo, força máxima, fora de equilíbrio) o erro (accuracy) afasta a bola do ponto. */
import { BallPhys, BALL } from './ballphys.js';

const R = BALL.R, sim = new BallPhys();
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;

/* vetor de lançamento: velocidade (3) + rotação (3). Mesma conta do chute, usada na simulação e no chute de verdade */
export function launchVec(C, yaw, el) {
  const hv = C.v * Math.cos(el), vy = C.v * Math.sin(el), dx = Math.sin(yaw), dz = Math.cos(yaw);
  const wy = C.spin * C.K.spin * (.45 + .55 * C.p), bs = C.lift * (C.kind === 'cross' || C.kind === 'chip' ? 16 : 12) * (.5 + C.p * .5);
  return [dx * hv, vy, dz * hv, -bs * dz, wy, bs * dx];
}

/* simula o voo e devolve onde a bola chega:
   · gol (C.T.sd definido): quando a bola cruza a linha do gol de verdade (erro = lado em x e altura). Se nunca cruza (a curva leva a bola
     para longe), usa a chegada no plano da linha bola→alvo só para dar a direção certa de correção;
   · lançamento (C.land): o primeiro toque no chão (erro = lado e alcance). */
function fly(C, B, G, yaw, el) {
  sim.place(B.x, B.y, B.z); sim.launch(...launchVec(C, yaw, el));
  const T = C.T; let air = false, soft = null;
  for (let t = 0; t < 3.4; t += 1 / 60) {
    const px = sim.x, py = sim.y, pz = sim.z; sim.step(1 / 60);
    if (C.land) {
      if (sim.y > R + .15) air = true;
      if (air && sim.y <= R + .001) return { eL: (sim.x - B.x) * G.nx + (sim.z - B.z) * G.nz, eY: (sim.x - B.x) * G.ux + (sim.z - B.z) * G.uz - G.D };
    } else {
      if ((pz - T.z) * T.sd < 0 && (sim.z - T.z) * T.sd >= 0) { const f = (T.z - pz) / ((sim.z - pz) || 1e-6); return { eL: px + (sim.x - px) * f - T.x, eY: py + (sim.y - py) * f - T.y, real: true }; }
      const a0 = (px - B.x) * G.ux + (pz - B.z) * G.uz, a1 = (sim.x - B.x) * G.ux + (sim.z - B.z) * G.uz;
      if (!soft && a0 < G.D && a1 >= G.D) { const f = (G.D - a0) / ((a1 - a0) || 1e-6); soft = { eL: (px + (sim.x - px) * f - B.x) * G.nx + (pz + (sim.z - pz) * f - B.z) * G.nz, eY: py + (sim.y - py) * f - T.y, soft: true }; }
    }
    if (sim.speed < .3) break;
  }
  return soft;
}

/* C = { kind, K, p, spin, lift, v, el0, T:{x,y,z,sd}, land }  (sd = +1/-1 do lado do gol; só no modo gol)  ·  B = posição da bola {x,y,z}  →  { yaw, el, err (m), ok }
   Ajusta direção (yaw) e elevação (el) com o método de Newton (derivadas por simulação) até a bola chegar no ponto da mira. */
export function solveAim(C, B) {
  const T = C.T, dx = T.x - B.x, dz = T.z - B.z, D = Math.hypot(dx, dz) || 1, ux = dx / D, uz = dz / D, G = { D, ux, uz, nx: uz, nz: -ux };
  const yaw0 = Math.atan2(dx, dz), H = .012; let best = { yaw: yaw0, el: C.el0, err: Infinity, ok: false };
  const starts = C.land ? [.3, .72, .5] : [C.el0, .26, .55];      // o alcance não cresce sempre com a elevação: tenta chute baixo, alto e médio
  for (const e0 of starts) {
    let yaw = yaw0, el = clamp(e0, -.15, 1.35);
    for (let it = 0; it < 10; it++) {
      const r0 = fly(C, B, G, yaw, el); if (!r0) break;
      const err = Math.hypot(r0.eL, r0.eY); if (err < best.err) best = { yaw, el, err, ok: err < .6 && !r0.soft };
      if (Math.abs(r0.eL) < .08 && Math.abs(r0.eY) < .1 && !r0.soft) break;
      const r1 = fly(C, B, G, yaw + H, el), r2 = fly(C, B, G, yaw, el + H);
      let dY = -r0.eL / D, dE = -r0.eY / D;
      if (r1 && r2) {
        const a = (r1.eL - r0.eL) / H, b = (r2.eL - r0.eL) / H, c = (r1.eY - r0.eY) / H, d = (r2.eY - r0.eY) / H, det = a * d - b * c;
        if (Math.abs(det) > 1e-3) { dY = (-r0.eL * d + r0.eY * b) / det; dE = (-r0.eY * a + r0.eL * c) / det; }
      }
      yaw = clamp(yaw + clamp(dY, -.3, .3) * .9, yaw0 - .9, yaw0 + .9); el = clamp(el + clamp(dE, -.3, .3) * .9, -.15, 1.35);
    }
    if (best.ok) break;
  }
  return best;
}

/* precisão do chute, de 0 (péssimo) a 1 (perfeito). Entradas já medidas por quem chama:
   d = distância bola→jogador · p = força 0..1 · sp = velocidade do jogador (m/s) · runV = velocidade de corrida · grounded
   fr = bola à frente do corpo (1 = bem na frente, -0.4 = atrás) · mis = ângulo (rad) entre o corpo e a mira · weak = pé fraco */
export function accuracy({ d, p, sp, runV = 7.2, grounded, fr, mis, weak }) {
  const q = clamp(1 - Math.abs(d - .85) / 1.5, .65, 1), qd = (q - .65) / .35;
  let a = .5 + .5 * qd;                                           // distância ideal do pé: bola nem colada nem longe
  a *= 1 - clamp((p - .78) / .22, 0, 1) * .4;                      // força máxima tira precisão
  a *= 1 - clamp(sp / runV, 0, 1.2) * .22;                         // correndo
  a *= grounded ? 1 : .6;                                          // no ar
  a *= 1 - clamp((.35 - fr) / .7, 0, 1) * .45;                     // bola do lado ou atrás do corpo
  a *= 1 - clamp((mis - .35) / 1.2, 0, 1) * .4;                    // corpo virado para outro lado da mira
  if (weak) a *= .93;                                              // pé fraco
  return clamp(a, 0, 1);
}
/* erro máximo (rad) para uma precisão: perfeito = 0, péssimo ≈ 16° */
export const errCone = a => Math.pow(1 - a, 1.5) * 16 * Math.PI / 180;

/* pé do chute: mais com a direita; esquerda só quando o efeito pede (parte de dentro do pé) ou a bola está bem do lado esquerdo.
   rx > 0 = bola do lado direito (mesma convenção do rig) · spin > 0 = curva para a direita */
export function pickFoot(rx, spin) {
  if (spin > .35) return rx > 1.1 ? 'R' : 'L';
  if (spin < -.35) return rx < -1.1 ? 'L' : 'R';
  return rx < -.5 ? 'L' : 'R';
}
