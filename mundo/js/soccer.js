/* CyberArena · Futebol (v155 · Fase 1) — bola, chute, passe, cruzamento, drible, regras (gol, lateral, escanteio, tiro de meta),
   goleiro bot, Treino e Pênaltis (offline). Usa a física pura de ballphys.js e o estádio de stadium.js.
   O game.js só chama: createSoccer(api) · soccer.update(dt) · soccer.act(nome) — o resto fica aqui. */
import * as THREE from '../lib/three.module.min.js';
import { BallPhys, BALL } from './ballphys.js';
import { FIELD } from './stadium.js';
import { SoccerLayer } from './soccerrig.js';
import { solveAim, launchVec, accuracy, errCone, pickFoot } from './aim.js';   // v161: mira e precisão do chute

const { HL, HW, GW, GH, CX } = FIELD, R = BALL.R, PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t, d2r = d => d * PI / 180;
const angDiff = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
/* Chutes mais fortes (estilo BLUE LOCK). v0/v1 = velocidade MOSTRADA (km/h → m/s) da carga mínima à máxima; b = fator de "sensação":
   o mundo é grande e a câmera é aberta, então a bola real precisa andar b× mais rápido para PARECER a velocidade escrita.
   Passe mínimo = 70 km/h, chute básico ≈ 90 km/h, chute carregado = 135 km/h (acima do Kaiser Impact, 104–130 km/h). */
const kmh = v => v / 3.6;
const KICK = {
  shot: { v0: kmh(60), v1: kmh(135), b: 1.9, el: 5, elUp: 24, elDn: 4, spin: 46, full: .95, label: 'CHUTE' },
  pass: { v0: kmh(70), v1: kmh(110), b: 1.7, el: 1.2, elUp: 10, elDn: 0, spin: 12, full: .7, label: 'PASSE' },
  cross: { v0: kmh(85), v1: kmh(125), b: 1.35, el: 36, elUp: 48, elDn: 24, spin: 34, full: .85, label: 'CRUZAMENTO' },
  chip: { v0: kmh(70), v1: kmh(115), b: 1.35, el: 30, elUp: 44, elDn: 20, spin: 18, full: .8, label: 'LANÇAMENTO' },
  head: { v0: kmh(45), v1: kmh(95), b: 1.5, el: -4, elUp: 12, elDn: -14, spin: 8, full: .6, label: 'CABECEIO' },
};
const SB = 1.9;   // fator do chute: o goleiro compara a força do chute na escala "mostrada" (km/h do HUD), não na física
const NAMES = { punch: 'shot', kick: 'shot', laser: 'pass', super: 'cross', extra: 'drib' };
const KEYS = { h: 'shot', j: 'shot', k: 'pass', l: 'cross', q: 'cross' };

export function createSoccer(api) {
  const { scene, stadium, audio, banner, fx } = api, ball = new BallPhys(), actors = api.actors;
  ball.colliders = stadium.bcols;
  const S = { mode: 'train', state: 'play', timer: 0, last: null, lastTeam: 0, goals: 0, shots: 0, saved: 0, maxV: 0, keeperOn: true, ch: null, lock: 0, drib: 0, t: 0, clock: 0, restartKind: '', free: 0, targets: true, tHit: 0, pen: null, gk: null, gkState: null, whistleT: 0, hold: null, kickT: 0, noCtl: 0, ctl: 0, ph: 0, lastStep: -1, sp: null, thr: null, pk: null, trapT: 0, x1: null, xq: 0 };
  const cx = CX;

  /* ============================== bola (malha + sombra + textura de gomos) ============================== */
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .42, metalness: 0 }); mat.userData.caPBR = true;
  const PH = (1 + Math.sqrt(5)) / 2, vs = []; for (const a of [-1, 1]) for (const b of [-PH, PH]) vs.push([0, a, b], [a, b, 0], [b, 0, a]);
  const glslV = vs.map(v => { const l = Math.hypot(...v); return `vec3(${v.map(x => (x / l).toFixed(4)).join(',')})`; }).join(',');
  mat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP = normalize(position);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vOP;\nconst vec3 PV[12] = vec3[12](${glslV});`)
      .replace('#include <color_fragment>', `#include <color_fragment>
 float m1 = -1., m2 = -1.; for (int i = 0; i < 12; i++) { float d = dot(normalize(vOP), PV[i]); if (d > m1) { m2 = m1; m1 = d; } else if (d > m2) m2 = d; }
 float pent = smoothstep(.925, .935, m1); float seam = 1. - smoothstep(.0, .045, m1 - m2);
 diffuseColor.rgb = mix(vec3(.97, .97, .95), vec3(.04, .045, .06), pent); diffuseColor.rgb *= 1. - seam * .5 * (1. - pent);`);
  };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 36, 24), mat); mesh.castShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  const blob = new THREE.Mesh(new THREE.CircleGeometry(.3, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .38, depthWrite: false })); blob.rotation.x = -PI / 2; scene.add(blob);
  const ringM = new THREE.Mesh(new THREE.RingGeometry(.55, .66, 40), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: .0, depthWrite: false, side: THREE.DoubleSide })); ringM.rotation.x = -PI / 2; scene.add(ringM);
  const spin = new THREE.Quaternion(), tq = new THREE.Quaternion(), ax = new THREE.Vector3();
  function syncMesh(dt) {
    mesh.position.set(ball.x, ball.y, ball.z); const w = Math.hypot(ball.wx, ball.wy, ball.wz);
    if (w > 1e-3) { ax.set(ball.wx / w, ball.wy / w, ball.wz / w); tq.setFromAxisAngle(ax, w * dt); mesh.quaternion.premultiply(tq); }
    blob.position.set(ball.x, .03, ball.z); const k = clamp(1 - (ball.y - R) / 14, .25, 1); blob.scale.setScalar(k * 1.1); blob.material.opacity = .42 * k;
  }
  // alvos de treino (4 anéis nos cantos do gol adversário)
  const targets = []; for (const [sx, y] of [[-1, GH - .6], [1, GH - .6], [-1, .65], [1, .65]]) { const m = new THREE.Mesh(new THREE.RingGeometry(.42, .54, 28), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.position.set(cx + sx * (GW - 1.0), y, HL - .15); scene.add(m); targets.push({ m, sx, y, flash: 0 }); }

  /* ============================== sons (síntese leve, sem arquivos) ============================== */
  const ac = () => audio.ctx && audio.master ? audio.ctx : null;
  function burst(f0, f1, dur, vol, type = 'bandpass', q = 1.2) { const c = ac(); if (!c || !audio.noiseBuf) return; const t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = audio.noiseBuf; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(audio.master); s.start(t, Math.random()); s.stop(t + dur + .05); }
  function tone(f0, f1, dur, vol, type = 'sine') { const c = ac(); if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); o.connect(g); g.connect(audio.master); o.start(t); o.stop(t + dur + .05); }
  const snd = {
    kick(p) { tone(150, 55, .12, .55 * (.4 + p * .6)); burst(1400, 300, .09, .45 * (.4 + p * .6)); },
    bounce(v) { const k = clamp(v / 14, .1, 1); tone(120, 60, .1, .35 * k); burst(800, 200, .06, .2 * k); },
    post() { tone(1250, 900, .5, .22, 'triangle'); tone(880, 620, .4, .16, 'sine'); burst(3000, 800, .08, .25); },
    net() { burst(2500, 500, .35, .3, 'highpass', .5); },
    whistle() { tone(2900, 2900, .55, .13, 'square'); setTimeout(() => tone(3050, 3050, .35, .1, 'square'), 120); },
    save() { burst(600, 150, .12, .5, 'lowpass'); tone(110, 70, .1, .4); },
    whoosh() { burst(900, 3000, .12, .18, 'bandpass', .8); },
    cheer(k = 1) { burst(700, 1100, 1.8, .22 * k, 'bandpass', .4); burst(1800, 900, 1.4, .1 * k, 'bandpass', .3); },
  };
  ball.onBounce = v => { if (v > 2.5) snd.bounce(v); };
  ball.onHit = (c, v) => { if (v < 1.2) return; if (c.post) { snd.post(); fx && fx.emit && fx.emit(ball.x, ball.y, ball.z, 8, { color: [1, 1, 1], speed: 2, life: .3, size: .1 }); S.hitPost = true; } else if (c.net) { snd.net(); stadium.goalRipple(c.net); } else if (v > 4) snd.bounce(v * .6); };

  /* ============================== HUD próprio ============================== */
  const css = document.createElement('style'); css.textContent = `
#sc{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:30;display:flex;gap:10px;align-items:center;padding:6px 16px;border-radius:14px;background:rgba(8,12,20,.72);border:1px solid rgba(255,255,255,.16);color:#fff;font:800 15px/1 system-ui,sans-serif;backdrop-filter:blur(6px);pointer-events:none}
#sc b{font-size:24px;letter-spacing:1px}#sc small{opacity:.7;font-weight:700;font-size:11px;letter-spacing:.12em}#sc .pn{display:flex;gap:5px}#sc .pn i{width:13px;height:13px;border-radius:50%;border:2px solid rgba(255,255,255,.55);display:block}#sc .pn i.g{background:#43e08a;border-color:#43e08a}#sc .pn i.m{background:#ff5a4a;border-color:#ff5a4a}
#chg{position:fixed;left:50%;bottom:calc(150px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(46vw,260px);z-index:30;pointer-events:none;opacity:0;transition:opacity .12s}
#chg.on{opacity:1}#chg .bar{height:12px;border-radius:8px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.3);overflow:hidden}#chg i{display:block;height:100%;width:0;background:linear-gradient(90deg,#43e08a,#ffd24a 65%,#ff5a4a)}
#chg .lb{display:flex;justify-content:space-between;color:#fff;font:800 11px system-ui;margin-top:4px;text-shadow:0 1px 3px #000}#chg .pad{position:relative;height:36px;margin-top:5px;border-radius:10px;background:rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.2)}#chg .pad u{position:absolute;width:12px;height:12px;border-radius:50%;background:#ffd24a;left:50%;top:50%;transform:translate(-50%,-50%);box-shadow:0 0 8px #ffd24a}
#spt{position:fixed;left:50%;top:calc(56px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:30;display:flex;flex-direction:row;gap:6px;pointer-events:none}
#spt button{pointer-events:auto;padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(8,12,20,.7);color:#fff;font:800 11px system-ui;letter-spacing:.05em;white-space:nowrap}#spt button.on{background:rgba(255,210,74,.85);color:#111}
#spi{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:30;color:#fff;font:700 11px/1.5 system-ui;text-shadow:0 1px 3px #000;pointer-events:none;opacity:.85}
#scAim{position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.7),0 0 6px rgba(0,0,0,.5);z-index:29;pointer-events:none}
#scRing{position:fixed;left:50%;top:50%;width:0;height:0;transform:translate(-50%,-50%);box-sizing:border-box;border-radius:50%;border:2px solid #ffd24a;z-index:29;pointer-events:none;opacity:0;transition:width .12s,height .12s,opacity .15s,border-color .15s}
#drw{position:fixed;left:0;top:0;width:0;height:0;z-index:31;pointer-events:none;display:none}#drw.on{display:block}
#drw .dc{position:absolute;left:-44px;top:-44px;width:88px;height:88px;border-radius:50%;background:rgba(8,12,20,.6);border:2px solid rgba(255,210,74,.75);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:#fff;font:900 10px/1.2 system-ui,sans-serif;letter-spacing:.04em;box-shadow:0 0 18px rgba(255,210,74,.25)}
#drw .dc small{opacity:.65;font-size:8px;margin-top:2px}
#drw i{position:absolute;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(8,12,20,.78);border:2px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;font-style:normal;transition:transform .08s,background .08s}
#drw i u{text-decoration:none;color:#fff;font:900 21px/1 system-ui,sans-serif}
#drw i.sel{background:#ffd24a;border-color:#fff;transform:scale(1.28);box-shadow:0 0 16px rgba(255,210,74,.9)}#drw i.sel u{color:#111}`;
  document.head.appendChild(css);
  const mk = (tag, id, html, parent = document.body) => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; parent.appendChild(e); return e; };
  const $sc = mk('div', 'sc', '<small id="scL">TREINO</small><b id="scA">0</b><small>GOLS</small><span id="scX"></span>');
  const $chg = mk('div', 'chg', '<div class="bar"><i id="chgF"></i></div><div class="lb"><span id="chgK">CHUTE</span><span id="chgV"></span></div><div class="pad"><u id="chgU"></u></div><div class="lb"><span>◄ efeito ►</span><span>▲ altura ▼</span></div>');
  const $spt = mk('div', 'spt', '<button id="spTrain" class="on">TREINO</button><button id="spPen">PÊNALTIS</button><button id="spGk">GOLEIRO: SIM</button><button id="spRst">REPOR BOLA</button>');
  const $spi = mk('div', 'spi', api.touch ? 'CHUTE: segure e solte · arraste o dedo no botão: efeito e altura · ponto no centro = mira · RAIO: segure p/ dominar; com a bola, segure o RAIO e ARRASTE o dedo até um drible da roda (carretilha, roleta, corte, elástico, puxada)' : 'J/H chute · K passe · L cruzar · R domínio (segure; com a bola: R + 1-8 = dribles da roda) · segure para carregar · U/O efeito · I/N altura · ponto no centro = mira · RAIO: segure p/ dominar; com a bola, segure o RAIO e arraste até um drible da roda');
  { const st = document.createElement('style'); st.textContent = '#scMv{position:fixed;left:50%;top:calc(96px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:31;padding:5px 14px;border-radius:999px;background:rgba(255,210,74,.95);color:#111;font:900 14px system-ui;letter-spacing:.08em;pointer-events:none;opacity:0;transition:opacity .25s}'; document.head.appendChild(st); }
  const $mv = mk('div', 'scMv', ''); let mvT = 0;
  const showMove = t => { $mv.textContent = t; $mv.style.opacity = 1; clearTimeout(mvT); mvT = setTimeout(() => { $mv.style.opacity = 0; }, 1300); };
  const $xh = mk('div', 'scAim', ''), $xr = mk('div', 'scRing', '');   // v161: ponto de mira no centro da tela + anel que mostra a precisão
  const el = id => document.getElementById(id);
  el('spTrain').onclick = () => setMode('train'); el('spPen').onclick = () => setMode('pen'); el('spRst').onclick = () => resetBall(true);
  el('spGk').onclick = () => { if (S.x1) return; S.keeperOn = !S.keeperOn; el('spGk').textContent = 'GOLEIRO: ' + (S.keeperOn ? 'SIM' : 'NÃO'); if (S.gk) { S.gk.hero.object.visible = S.keeperOn; } placeKeeper(); };

  /* ============================== roda de dribles (botão do raio) ==============================
     Segure o RAIO com a bola no pé: aparece uma roda de dribles em volta. Arraste o dedo (como um segundo analógico) até o drible e ele acontece. */
  const DRB = [   // sentido horário a partir de cima (45° cada)
    { nm: 'CARRETILHA', ic: '⤒', g: { k: 'cober' } },
    { nm: 'ROLETA ›', ic: '↻', g: { k: 'giro', sg: 1 } },
    { nm: 'CORTE ›', ic: '→', g: { k: 'corte', sg: -1 } },
    { nm: 'ELÁSTICO ›', ic: '⇄', g: { k: 'elastico', sg: -1 } },
    { nm: 'PUXADA', ic: '⤓', g: { k: 'puxada', sg: 1 } },
    { nm: '‹ ELÁSTICO', ic: '⇄', g: { k: 'elastico', sg: 1 } },
    { nm: '‹ CORTE', ic: '←', g: { k: 'corte', sg: 1 } },
    { nm: '‹ ROLETA', ic: '↺', g: { k: 'giro', sg: -1 } },
  ];
  const $drw = mk('div', 'drw', '<div class="dc"><b id="drN">DRIBLE</b><small>arraste</small></div>' + DRB.map((d, i) => { const a = i * PI / 4; return `<i data-i="${i}" style="left:${(Math.sin(a) * 80).toFixed(1)}px;top:${(-Math.cos(a) * 80).toFixed(1)}px"><u>${d.ic}</u></i>`; }).join(''));
  function setSel(i) { if (S.wSel === i) return; S.wSel = i; for (const n of $drw.querySelectorAll('i')) n.classList.toggle('sel', +n.dataset.i === i); document.getElementById('drN').textContent = i >= 0 ? DRB[i].nm : 'DRIBLE'; }
  function syncWheel() {
    const on = !!(S.tr && S.tr.mode === 'drib' && S.tr.held); if (on === !!S.wOn) return; S.wOn = on; $drw.classList.toggle('on', on);
    if (on) { const b = document.getElementById('bVel'), r = b ? b.getBoundingClientRect() : null, x = r ? r.left + r.width / 2 : innerWidth - 90, y = r ? r.top + r.height / 2 : innerHeight - 120; $drw.style.left = clamp(x, 112, Math.max(112, innerWidth - 112)) + 'px'; $drw.style.top = clamp(y, 112, Math.max(112, innerHeight - 112)) + 'px'; S.wSel = -2; setSel(-1); }
  }
  const wheelIdx = (ex, ey) => { let i = Math.round(Math.atan2(ex, -ey) / (PI / 4)); if (i < 0) i += 8; return i % 8; };   // 0 = cima, sentido horário
  function dragWheel(t, ex, ey, ln) {
    if (ln < 14) { t.armed = true; setSel(-1); return; }
    const i = wheelIdx(ex, ey); setSel(i);
    if (ln >= 34 && t.armed) { t.armed = false; t.pick = DRB[i].g; t.pickT = t.t; }
  }

  /* ============================== câmera acompanha o jogador (futebol) ==============================
     A câmera gira sozinha para ficar atrás de quem corre, então a mira (ponto no centro) já aponta para onde você vai. Correr de lado/de costas quase não gira;
     arrastar a tela para olhar em volta tem prioridade por ~1,4 s. */
  function camFollow(dt, m) {
    const cs = api.camState; if (!cs || dt < 1e-4) return;
    const px = S.cpx == null ? m.x : S.cpx, pz = S.cpz == null ? m.z : S.cpz; S.cpx = m.x; S.cpz = m.z;
    if (Math.hypot(m.x - px, m.z - pz) > 2.5) { S.cvx = S.cvz = 0; return; }   // teleporte (reinício): não gira
    const k = 1 - Math.exp(-dt * 10); S.cvx = (S.cvx || 0) + ((m.x - px) / dt - (S.cvx || 0)) * k; S.cvz = (S.cvz || 0) + ((m.z - pz) / dt - (S.cvz || 0)) * k;
    cs.manT = Math.max(0, (cs.manT || 0) - dt);
    const sp = Math.hypot(S.cvx, S.cvz); if (sp < .9 || S.ch || S.thr || cs.manT > 0 || S.state !== 'play' || S.mode === 'pen') return;
    const d = angDiff(Math.atan2(S.cvx, S.cvz), cs.yaw), w = Math.abs(d) > 2.5 ? 0 : Math.max(.35, Math.cos(d));
    cs.yaw += d * (1 - Math.exp(-dt * 5.2 * w * clamp(sp / 5, .6, 1.2)));
  }

  /* ============================== utilidades de jogo ============================== */
  const me = () => api.me();
  function touchBall(a) { S.last = a; const K = S.x1 && kOf(a); S.lastTeam = (a === me() || (K && K.sd < 0)) ? 0 : 1; S.free = 0; if (S.x1 && a === me()) claim(); }
  function place(a, x, z, yaw) { a.x = x; a.z = z; a.y = 0; a.vx = a.vz = a.vy = 0; a.grounded = true; if (yaw !== undefined) { a.yaw = yaw; if (a === me()) api.setCamYaw(yaw); } }
  const spotKick = HL - 10.5;
  function resetBall(manual) {
    const m = me(); S.state = 'play'; S.hitPost = false; S.pen && (S.pen.phase = S.pen.phase === 'over' ? 'over' : S.pen.phase);
    if (S.mode === 'pen' && S.pen) { penaltySetup(); return; }
    ball.frozen = false; ball.place(cx, R, 0); place(m, cx, -6, 0); placeKeeper(); S.free = 0; if (manual) banner('Bola no centro', 700);
  }
  function placeKeeper(only) {
    for (const K of KS) {
      if (only && only !== K) continue; const g = K.g; if (!g) continue; const on = K.on(); g.hero.object.visible = on; g.hidden = !on;
      if (!on) { g.x = cx; g.z = K.sd * (HL + 30); continue; }
      g.x = cx; g.z = K.sd * (HL - 1.2); g.y = 0; g.vx = g.vz = g.vy = 0; g.grounded = true; g.yaw = K.sd > 0 ? PI : 0; g.alive = true; K.st = { mode: 'ready', t: 0, dive: null, plan: null, cool: 0, think: 0 }; const gl = L(g); if (gl) { gl.stop(); gl.setTilt(0, false, 30); gl.setDivePose(null); gl.setReady(true); }
    }
    S.gkState = KS[0] ? KS[0].st : null;
  }
  function setMode(m) {
    if (S.x1) return;
    S.mode = m; el('spTrain').classList.toggle('on', m === 'train'); el('spPen').classList.toggle('on', m === 'pen');
    S.pen = null; S.goals = 0; S.shots = 0; S.saved = 0; S.clock = 0; el('scL').textContent = m === 'pen' ? 'PÊNALTIS' : 'TREINO';
    for (const t of targets) t.m.visible = m === 'train';
    if (m === 'pen') { S.keeperOn = true; el('spGk').textContent = 'GOLEIRO: SIM'; S.pen = { round: 0, total: 5, goals: 0, res: [], phase: 'ready', t: 0, kicked: false }; penaltySetup(); banner('PÊNALTIS · 5 cobranças', 1600); }
    else resetBall(false); updateScoreHud();
  }
  function penaltySetup() {
    const P = S.pen; if (!P) return; if (P.round >= P.total) { P.phase = 'over'; return; }
    S.state = 'play'; ball.frozen = false; ball.place(cx, R, spotKick); place(me(), cx, spotKick - 3.2, 0); placeKeeper(); P.phase = 'ready'; P.kicked = false; P.t = 0; S.hitPost = false; S.free = 0; S.last = null; P.resolved = false;
    api.focusCam && api.focusCam(); updateScoreHud();
  }
  function updateScoreHud() {
    const A = el('scA'), X = el('scX');
    if (S.x1) { const Z = S.x1, mi = Z.host ? 0 : 1, a = Z.sc[mi], b = Z.sc[1 - mi], ha = Z.hs[mi], hb = Z.hs[1 - mi], nm = String(Z.oppName || 'ADVERSÁRIO').toUpperCase().slice(0, 9), tl = Z.golden ? 'GOL DE OURO' : Z.h + 'º TEMPO';
      A.textContent = a; X.innerHTML = '<small>×</small><b>' + b + '</b><small>' + nm + ' · ' + tl + ' ' + ha + '-' + hb + ' (até 5)</small>'; stadium.setScore({ a, b, time: ha + ' - ' + hb, label: '1X1 · ' + tl, na: 'VOCÊ', nb: nm }); return; }
    if (S.mode === 'pen' && S.pen) { A.textContent = S.pen.goals; X.innerHTML = '<span class="pn">' + Array.from({ length: S.pen.total }, (_, i) => `<i class="${S.pen.res[i] === 1 ? 'g' : S.pen.res[i] === 0 ? 'm' : ''}"></i>`).join('') + '</span>'; }
    else { A.textContent = S.goals; X.innerHTML = '<small>CHUTES ' + S.shots + ' · MÁX ' + Math.round(S.maxV * 3.6) + ' km/h</small>'; }
    stadium.setScore({ a: S.mode === 'pen' && S.pen ? S.pen.goals : S.goals, b: S.saved, time: fmt(S.clock), label: S.mode === 'pen' ? 'PÊNALTIS' : 'TREINO LIVRE', na: 'GOLS', nb: 'DEFESAS' });
  }
  const fmt = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  /* ============================== animações (camada procedural por cima do clipe) ============================== */
  const layers = new Map(), tmpP = new THREE.Vector3(), tmpF = new THREE.Vector3(), RUNV = 7.2;
  function L(a) { if (!a || !a.hero) return null; let l = layers.get(a); if (!l && a.hero.atlasRig) { l = new SoccerLayer(a.hero.atlasRig); l.onEvent = (e, an) => animEvent(a, e, an); layers.set(a, l); } return l; }
  function animEvent(a, e, an) {
    if (a === me()) { if (e === 'impact' && S.pk && an.name === S.pk.anim) { const k = S.pk; S.pk = null; doKick(k.kind, k.p, k.spin, k.lift, k.foot); } else if (e === 'release' && S.thr) throwRelease(); }
    else { const K = kOf(a); if (K && K.st) { if (e === 'release' && K.st.mode === 'throw') gkRelease(K); else if (e === 'impact' && K.st.kicking) gkKickImpact(K); } }
  }

  /* ============================== chute / passe / lançamento / cruzamento / cabeceio ============================== */
  function press(kind) {
    const m = me(); if (!m || !m.alive || S.lock > 0 || m.down || m.stunT > 0) return true;
    if (S.mode === 'pen' && S.pen && (S.pen.kicked || S.pen.phase !== 'ready')) return true;
    if (S.ch || S.thr) return true; S.ch = { kind, t: 0, spin: 0, lift: 0, x0: null, y0: null }; $chg.classList.add('on'); el('chgK').textContent = S.sp === 'lateral' ? 'LATERAL' : KICK[kind].label; return true;
  }
  /* ============================== mira (v161) ==============================
     O ponto no centro da tela diz onde a bola deve chegar: no gol (altura incluída) ou num ponto do chão. Independe de para onde o corpo olha. */
  const vO = new THREE.Vector3(), vD = new THREE.Vector3();
  function aimTarget() {
    const cam = api.camera; if (!cam) return null;
    cam.updateMatrixWorld(); cam.getWorldPosition(vO); cam.getWorldDirection(vD);
    const out = { camYaw: Math.atan2(vD.x, vD.z), t: null }; let best = null;
    if (vD.y < -.01) { const t = (R - vO.y) / vD.y; if (t > 0 && t < 160) best = { t, k: 'ground', x: vO.x + vD.x * t, y: R, z: vO.z + vD.z * t }; }
    for (const sd of [1, -1]) {   // boca do gol (a bola vale gol ao passar da linha)
      if (vD.z * sd <= .01) continue; const zp = sd * (HL + R), t = (zp - vO.z) / vD.z; if (t <= 0 || t > 220 || (best && t >= best.t)) continue;
      const x = vO.x + vD.x * t, y = vO.y + vD.y * t;
      if (Math.abs(x - cx) < GW - .15 && y > .1 && y < GH - .1) best = { t, k: 'goal', x, y: clamp(y, R + .12, GH - .3), z: zp, sd };
    }
    if (best && Math.hypot(best.x - ball.x, best.z - ball.z) > 2.2) out.t = best;
    return out;
  }
  const aimYaw = tg => tg.t ? Math.atan2(tg.t.x - ball.x, tg.t.z - ball.z) : tg.camYaw;
  /* escolhe sozinho a animação certa para a situação (bola no chão, alta, no ar; passe curto ou longo) e o pé:
     mais com a direita; a esquerda só quando o efeito pede (parte de dentro do pé) ou a bola está bem do lado esquerdo */
  function chooseAnim(kind, p, lift, spin = 0) {
    const m = me(), air = !m.grounded, by = ball.y - m.y; let anim, k = kind;
    if ((air && by > .7) || by > 1.45) { if (by > 1.3) { anim = 'header'; k = 'head'; } else { anim = 'volley'; k = 'shot'; } }
    else if (kind === 'shot') anim = by > .6 ? 'volley' : 'shot';
    else if (kind === 'pass') { if (lift > .45 || p > .8) { anim = 'chip'; k = 'chip'; } else anim = 'pass'; }
    else anim = 'cross';
    const tg = aimTarget(), ay = tg ? aimYaw(tg) : m.yaw, rx = -((ball.x - m.x) * Math.cos(ay) - (ball.z - m.z) * Math.sin(ay));   // + = bola do lado DIREITO do corpo
    return { anim, kind: k, foot: pickFoot(rx, spin) };
  }
  function release() {
    const c = S.ch; if (!c) return; S.ch = null; $chg.classList.remove('on'); const m = me(); if (!m || !m.alive) return;
    const K = KICK[c.kind], p = clamp(Math.max(.24, c.t / K.full), 0, 1);
    if (S.sp === 'lateral') return startThrow(p);
    const ch = chooseAnim(c.kind, p, c.lift, c.spin), l = L(m);
    if (l) { const an = l.play(ch.anim, { foot: ch.foot, scale: lerp(1.08, .9, p) }); S.pk = { kind: ch.kind, p, spin: c.spin, lift: c.lift, foot: ch.foot, anim: ch.anim }; S.lock = an.dur * .75; S.kickT = an.dur * .8; m.aimT = Math.max(m.aimT || 0, an.dur * .6); S.noCtl = an.dur * 1.1 + .15; S.ctl = 0; m.busyMove = Math.max(m.busyMove, an.dur * .5); }
    else { const r = m.play('kick'); S.lock = .4; S.noCtl = .6; S.ctl = 0; m.pending.push({ t: r && r.impact ? Math.min(r.impact, .3) : .2, fn: () => doKick(ch.kind, p, c.spin, c.lift, ch.foot) }); }
  }
  function aimAssist(yaw) {   // alinha levemente ao gol adversário se você olha para ele
    const dx = cx - ball.x, dz = HL - ball.z, d = Math.hypot(dx, dz); if (d > 62 || d < 4) return yaw;
    const to = Math.atan2(dx, dz), diff = angDiff(to, yaw); if (Math.abs(diff) > d2r(32)) return yaw; return yaw + diff * .55;
  }
  function doKick(kind, p, spinIn, liftIn, foot) {
    const m = me(); if (!m) return; S.sp = null;
    const f0 = Math.sin(m.yaw), f1 = Math.cos(m.yaw), dx = ball.x - m.x, dz = ball.z - m.z, d = Math.hypot(dx, dz), air = !m.grounded;
    const reach = air ? 1.5 : 1.6, okH = ball.y < m.y + (air ? 2.5 : 1.45), fr = d < .6 ? 1 : (dx * f0 + dz * f1) / d;
    if (!(d < reach && okH && fr > -.4)) { snd.whoosh(); return; }   // v161: bola ao lado ou levemente atrás também vale (antes só à frente)
    const K = KICK[kind] || KICK.shot, q = clamp(1 - Math.abs(d - .85) / 1.5, .65, 1), tg = aimTarget(), lift = liftIn;
    let yaw = tg ? aimYaw(tg) : (kind === 'shot' || kind === 'head') ? aimAssist(m.yaw) : m.yaw;   // direção = ponto da mira (sem mira: como antes)
    const v = lerp(K.v0, K.v1, p) * (.9 + .1 * q) * K.b;   // velocidade real da bola (a mostrada no HUD × fator de sensação)
    let el = d2r(lift >= 0 ? lerp(K.el, K.elUp, lift) : lerp(K.el, K.elDn, -lift)) + (ball.y > R + .4 ? -.02 : 0);
    // chute no gol ou lançamento: simula a física e acha direção e altura para a bola CHEGAR no ponto da mira, com o efeito escolhido (gol olímpico)
    const T = tg && tg.t;
    if (T && kind !== 'pass') {
      const goal = T.k === 'goal', land = !goal && (kind === 'cross' || kind === 'chip' || lift > .3);
      if (goal || land) { const r = solveAim({ kind, K, p, spin: spinIn, lift, v, el0: el, T: { x: T.x, y: T.y, z: T.z, sd: T.sd }, land }, ball); if (r.err < 1.2) { yaw = r.yaw; el = r.el; } }
    }
    // precisão: parado, bola no ponto certo do pé e força moderada = exato; correndo, no ar, força máxima ou desalinhado = a bola foge da mira
    const acc = accuracy({ d, p, sp: Math.hypot(m.vx, m.vz), runV: RUNV, grounded: !air, fr, mis: Math.abs(angDiff(yaw, m.yaw)), weak: foot === 'L' }), e = errCone(acc);
    yaw += (Math.random() + Math.random() - 1) * e; el += (Math.random() + Math.random() - 1) * e * .5;
    const [vx, vy, vz, wx, wy, wz] = launchVec({ kind, K, p, spin: spinIn, lift, v }, yaw, el);
    ball.launch(vx, vy, vz, wx, wy, wz); touchBall(m); S.ctl = 0; S.noCtl = .45;
    snd.kick(p); S.maxV = Math.max(S.maxV, v / K.b);   // recorde mostrado em km/h do HUD
    if (kind === 'shot' || kind === 'head') { S.shots++; }
    if (S.pen) S.pen.kicked = true;
    if (p > .75 && fx && fx.emit) fx.emit(ball.x, ball.y, ball.z, 14, { color: [1, .9, .6], speed: 3.5, life: .35, size: .12, grav: 0 });
    if (p > .8) api.shake(.18);
    updateScoreHud();
  }
  /* ============== domínio (botão do raio, v163) ==============
     Segure para dominar a bola que está vindo (no chão ou no ar) e solte; a direção do primeiro toque vem do analógico ou de arrastar o botão.
     Com a bola no pé, segurar = controle fechado (toques curtos e a bola não foge). Sem bola por perto, o botão só dá uma arrancada. */
  function dribble() {
    const m = me(); if (!m || !m.alive || S.lock > 0 || m.down || m.stunT > 0) return true;
    if (S.tr) { S.tr.held = true; S.tr.rel = null; return true; }
    const bx = ball.x - m.x, bz = ball.z - m.z, bd = Math.hypot(bx, bz), inc = bd < 16 && ball.speed > 3 && (bx * (ball.vx - m.vx) + bz * (ball.vz - m.vz)) < 0;   // bola vindo na minha direção
    const roll = ball.speed > 1.2 && bd < 9 && ball.y < 3, carrying = S.car && bd < 1.7;
    if (!inc && !roll && !carrying && (bd > 3.6 || ball.y > 3)) { api.doDodge(m); snd.whoosh(); return true; }
    const near = !inc && bd < 2.6 && ball.y < .9 && (S.car || S.last === m || S.last == null || ball.speed < .3 && bd < 1.2);   // bola de outro jogador: raio = carrinho para roubar   // bola no pé: o botão abre a RODA DE DRIBLES; bola chegando/longe: domínio (como antes)
    S.tr = { t: 0, held: true, rel: null, done: false, dx: null, dz: null, h: [], lunged: false, mode: near ? 'drib' : 'trap', armed: true, pick: null, pickT: 0 }; return true;
  }
  function trapRelease() { if (S.tr) S.tr.held = false; return true; }
  /* lateral com as duas mãos */
  function startThrow(p) { const m = me(), l = L(m); S.thr = { p, attach: false }; S.kickT = 1.2; S.noCtl = 1.5; S.ctl = 0; m.busyMove = Math.max(m.busyMove, 1); if (l) l.play('throwin'); else throwRelease(); }
  function throwRelease() {
    const t = S.thr; if (!t) return; S.thr = null; ball.frozen = false; const m = me(), v = lerp(7, 21, t.p), el = d2r(30), yaw = m.yaw;
    ball.launch(Math.sin(yaw) * v * Math.cos(el), v * Math.sin(el), Math.cos(yaw) * v * Math.cos(el), 0, 0, 0); touchBall(m); S.sp = null; snd.kick(.35); S.noCtl = .5;
  }

  /* ============================== contato com a bola (v163): SEM ÍMÃ ==============================
     A bola só muda de velocidade nos TOQUES do jogador (um a cada passada, quando ela está ao alcance do pé) e no domínio (botão do raio).
     Entre um toque e outro ela rola livre pela física (atrito, quique). Toque longo demais = a bola escapa, como na vida real.
     Cada toque calcula a força para a bola ficar à frente do jeito certo (perto no passo curto, mais longe na corrida). */
  function feet(dt, m) {
    const pvx = S.pp && dt > 1e-4 ? (m.x - S.pp.x) / dt : m.vx, pvz = S.pp && dt > 1e-4 ? (m.z - S.pp.z) / dt : m.vz; S.pp = { x: m.x, z: m.z };
    const vxm = m.dash ? pvx : m.vx, vzm = m.dash ? pvz : m.vz;   // durante o drible (movimento programado) a velocidade vem do deslocamento real
    const l = L(m), sp = Math.hypot(vxm, vzm), dx = ball.x - m.x, dz = ball.z - m.z, d = Math.hypot(dx, dz);
    const ok = S.noCtl <= 0 && S.kickT <= 0 && !S.thr && m.grounded && m.alive && !m.down && S.state === 'play' && S.mode !== 'pen' && !S.pk && S.sp !== 'lateral';
    S.tcd = Math.max(0, (S.tcd || 0) - dt); if (S.slT > 0 && (S.slT -= dt) <= 0) slideEnd(m);
    S.cobT = Math.max(0, (S.cobT || 0) - dt);   // CORREÇÃO: o recarregamento da cobertinha tem que correr SEMPRE (antes só corria conduzindo, e conduzir exigia ele zerado: travava para sempre)
    if (!ok) { if (S.slT > 0) slideEnd(m); S.ctl = 0; S.car = false; S.hd = 0; S.stp = null; S.pin = null; S.tr = null; S.mv = null; S.rdash = false; return; }
    const tr = S.tr; if (tr) { tr.t += dt; if (!tr.held && tr.rel == null) tr.rel = tr.t; if ((!tr.held && tr.t > tr.rel + .3) || tr.t > 6 || (tr.done && !tr.held)) { S.tr = null; if (S.rdash && m.dash && !S.mv) m.dash = null; S.rdash = false; } }
    const mv = api.readMove(), mag = mv[2] || 0, want = mag > .1, fx = sp > .7 ? vxm / sp : Math.sin(m.yaw), fz = sp > .7 ? vzm / sp : Math.cos(m.yaw);
    const hx = want ? mv[0] / mag : fx, hz = want ? mv[1] / mag : fz;                       // direção em que o jogador quer ir
    const along = dx * fx + dz * fz, lat = dx * fz - dz * fx;                                 // bola no referencial do corpo: à frente e ao lado (+ = esquerda)
    const cut = want && Math.abs((ball.vx - vxm) * hz - (ball.vz - vzm) * hx) > 2.2;           // jogador mudou de direção e a bola ficou para o lado: corta já
    const inZone = ball.y < .5 && along > -.75 && Math.hypot(Math.max(along, .3) - .85, lat) < (cut ? 2.3 : 1.75);       // alcance do pé (inclui o lado, para giros e cortes)
    S.ctl = d < 1.5 && ball.y < .55 ? 1 : 0;
    const rvx = ball.vx - vxm, rvz = ball.vz - vzm, rs = Math.hypot(rvx, rvz), toward = d > .05 ? -(dx * rvx + dz * rvz) / d : 0;
    S.cin = toward > .6 && rs > 1.5 && d > .62;   // bola indo de encontro ao corpo: o corpo bloqueia (não atravessa)
    const pickF = () => lat > .06 ? 'L' : lat < -.06 ? 'R' : ((S.fl = !S.fl) ? 'R' : 'L');   // lat > 0 = bola do lado ESQUERDO
    const fx0 = Math.sin(m.yaw), fz0 = Math.cos(m.yaw), atFeet = ball.y < .4 && d < 1.6 && dx * fx0 + dz * fz0 > -.3;
    S.mvCd = Math.max(0, (S.mvCd || 0) - dt);
    if (S.mv) { S.mv.t += dt; if (S.mv.t >= S.mv.dur) { S.mv = null; S.mvCd = .35; S.cph = 2; if (S.car && ball.y < .4) { const rv = want ? Math.max(mag, .9) * RUNV * .95 : 0; ball.vx = want ? hx * rv : pvx; ball.vz = want ? hz * rv : pvz; if (!want) { S.lsp = Math.hypot(pvx, pvz); S.ldx = pvx / (S.lsp || 1); S.ldz = pvz / (S.lsp || 1); } ball.wx = ball.vz / R; ball.wz = -ball.vx / R; } } }
    if (tr && tr.mode !== 'drib' && S.car && tr.held && !S.mv && !m.dash && !tr.frz && sp > 2.5) { tr.frz = true; S.rdash = true; const ux = vxm / sp, uz = vzm / sp; m.dash = { segs: [{ x0: m.x, z0: m.z, x1: m.x + ux * sp, z1: m.z + uz * sp, du: 1, hold: 0 }], i: 0, t: 0, h: 0 }; }
    if (tr && tr.mode !== 'drib' && tr.held && !tr.done && atFeet && !S.mv && !m.dash && (sp < 2.5 || S.pin) && !S.stp) {          // parado com o raio apertado: o jogador fica no lugar enquanto faz o gesto
      if (!S.pin) S.pin = { x: m.x, z: m.z }; m.x = S.pin.x; m.z = S.pin.z; if (m.hero && m.hero.object) { m.hero.object.position.x = m.x; m.hero.object.position.z = m.z; }
    } else S.pin = null;
    if (tr && tr.mode !== 'drib' && !tr.done && l && !tr.lunged && !S.car && d < 4.6 && !S.mv && !m.dash) { tr.lunged = true; lunge(m); }
    if (tr && tr.pick) {   // drible escolhido na roda (arrastar o botão do raio até ele)
      if (tr.t - tr.pickT > .7) tr.pick = null;                                     // não deu para fazer a tempo: descarta
      else if (!S.mv && S.mvCd <= 0) {
        const pk = tr.pick; tr.pick = null; const cam = api.camera; let cy = m.yaw; if (cam) { cam.getWorldDirection(vD); cy = Math.atan2(vD.x, vD.z); }
        if (d < 2.1 && ball.y < .6) { if (S.stp) { S.stp = null; if (m.dash && !S.mv) m.dash = null; S.rdash = false; } startMove(pk, m, cy, S.pin ? 0 : vxm, S.pin ? 0 : vzm); if (!S.car) return; }   // carretilha: a bola já saiu lançada; não deixa o resto do quadro apagar essa velocidade
      }
    }
    // --- domínio pedido no botão: amortece a bola que chega (chão, coxa ou peito) e a deixa onde o jogador quer ---
    if (tr && tr.mode !== 'drib' && !tr.done && d < Math.min(2.3, 1.15 + rs * dt * 1.3) && ball.y < 1.95 && S.tcd <= 0 && (!S.car || ball.y > .5) && !S.mv && ((toward > .8 && rs > 2) || (rs < 2.2 && ball.y > .35) || (tr.lunged && (d < 1.3 || !m.dash) && d < 2.3) || (ball.speed > .6 && rs > .6 && d < 1.4 && ball.y < .6))) {
      const tdx = tr.dx != null ? tr.dx : want ? hx : 0, tdz = tr.dz != null ? tr.dz : want ? hz : 0, push = (tdx || tdz) ? .5 + (tr.dx != null ? .8 : mag) * .9 : .15;
      const dsh = !!m.dash && !S.mv, bvx = dsh ? 0 : vxm, bvz = dsh ? 0 : vzm, qx = dsh ? ball.vx : rvx, qz = dsh ? ball.vz : rvz; if (dsh) { m.dash = null; S.rdash = false; } if (S.slT > 0) slideEnd(m);   // chegou na bola: a corrida programada acaba
      ball.vx = bvx + qx * .06 + tdx * push; ball.vz = bvz + qz * .06 + tdz * push;
      ball.vy = ball.y > .5 ? Math.min(ball.vy, 0) * .12 - .2 : 0; if (ball.y < .3) { ball.wx = ball.vz / R; ball.wz = -ball.vx / R; }
      tr.done = true; S.tcd = .22; touchBall(m); S.last = m; S.lastTeam = 0; if (l && !l.busy('trap')) l.play('trap', { foot: pickF() });
      return;
    }
    // --- controle fechado parado: segurando o botão com a bola no pé, ela não foge (pisa na bola) ---
    if (tr && tr.held && !tr.done && inZone && rs < 3 && d < 1.2 && sp < .8 && !S.car) { const k = Math.exp(-9 * dt); ball.vx = vxm + rvx * k; ball.vz = vzm + rvz * k; ball.wx = ball.vz / R; ball.wz = -ball.vx / R; S.last = m; S.lastTeam = 0; return; }
    if (S.car) { /* já conduzindo */ } else if (S.tcd > 0 || !inZone) return;
    // --- bola chegando forte sem domínio: bate no pé e desvia (recepção ruim) ---
    if (toward > 2.5 && rs > 4 && d < 1.25) {
      const a = (Math.random() - .5) * 1.0, c = Math.cos(a), sn = Math.sin(a);
      ball.vx = vxm + (rvx * c - rvz * sn) * .42; ball.vz = vzm + (rvx * sn + rvz * c) * .42; if (ball.vy > 0) ball.vy *= .5;
      S.tcd = .35; touchBall(m); S.last = m; S.lastTeam = 0; if (l && !l.busy()) l.play('touch', { foot: pickF(), scale: 1 }); return;
    }
    // --- condução física: a bola rola livre pela física; só o PÉ a toca, uma vez por passada (quando o pé em balanço chega ao ponto mais à frente) ---
    if (S.pin) { S.last = m; return; }                       // preso no lugar fazendo o gesto: a bola fica onde está
    const moving = sp > .5 || want || !!S.mv, bx = Math.sin(m.yaw), bz = Math.cos(m.yaw), al = dx * bx + dz * bz, la = dx * bz - dz * bx;   // referencial do corpo: al = à frente · la = + esquerda
    if (sp > 1) { S.lsp = sp; S.ldx = vxm / sp; S.ldz = vzm / sp; }                                   // última velocidade de corrida (para frear)
    if (S.car && !moving && !S.stp && ball.y < .4 && d < 2.2) {          // parou com a bola: freia e PISA nela com a sola do pé direito
      const v0 = S.lsp || 0, ux = S.ldx || bx, uz = S.ldz || bz; S.stp = { t: 0, v0 }; S.lsp = 0;
      if (v0 > 1.8) { const A = 26, T = v0 / A, n = 4, segs = []; let px = m.x, pz = m.z; for (let i = 1; i <= n; i++) { const tt = T * i / n, ds = v0 * tt - .5 * A * tt * tt, q = limP(m.x + ux * ds, m.z + uz * ds); segs.push({ x0: px, z0: pz, x1: q.x, z1: q.z, du: T / n, hold: 0 }); px = q.x; pz = q.z; } m.dash = { segs, i: 0, t: 0, h: 0 }; S.rdash = true; }
      if (l) l.play('sole', { foot: 'R' }); touchBall(m);
    }
    if (S.stp) {
      const st = S.stp; st.t += dt;
      if (want && st.t > .15) { S.stp = null; if (S.rdash && m.dash) m.dash = null; S.rdash = false; }       // quer andar de novo: solta
      else {
        S.last = m; S.lastTeam = 0;
        if (st.t < .66) {                                  // sola em cima da bola: arrasta até debaixo do pé e amortece (atrito da sola)
          const tx = m.x + bx * .84 - bz * .13, tz = m.z + bz * .84 + bx * .13, e = Math.exp(-16 * dt), g = 4.2;   // a sola amortece a velocidade relativa (atrito) e leva a bola devagar para debaixo do pé
          ball.vx = pvx + (ball.vx - pvx) * e + (1 - e) * (tx - ball.x) * g; ball.vz = pvz + (ball.vz - pvz) * e + (1 - e) * (tz - ball.z) * g; ball.vy = 0; ball.y = Math.max(ball.y, R);
          ball.wx = ball.vz / R; ball.wz = -ball.vx / R;
        }
        if (st.t >= .66) { ball.vx = ball.vz = ball.vy = 0; ball.wx = ball.wy = ball.wz = 0; S.stp = null; S.car = false; S.rdash = false; }   // tira o pé: a bola fica parada no lugar certo
        return;
      }
    }
    if (!moving) { S.car = false; return; }
    if (!S.car) { if (ball.y < .4 && al > -.25 && d < 1.25 && rs < 9 && (!S.cin || ball.speed < 1.5) && !(S.cobT > 0)) { S.car = true; S.cph = 1; S.cn = 0; S.cs = 'R'; S.tint = .4; S.tlast = S.clock; S.fp = { R: { v: 0, dv: 0 }, L: { v: 0, dv: 0 } }; } else return; }
    if (ball.y > .45 || (d > 1.9 && !S.ch && !S.mv) || (al < -.95 && !S.mv) || S.noCtl > 0) { S.car = false; return; }
    S.last = m; S.lastTeam = 0;
    if (S.mv || S.ch) {                           // movimento de drible ou carregando chute/passe: a bola fica protegida junto do corpo: a bola acompanha o corpo (protegida) enquanto o corpo faz o movimento
      const k = S.mv ? 1 : 1 - Math.exp(-22 * dt), tx = m.x + bx * .76 - bz * .1 * ((S.mv && S.mv.side) || 0), tz = m.z + bz * .76 + bx * .1 * ((S.mv && S.mv.side) || 0);
      let nx = ball.x + (tx - ball.x) * k, nz = ball.z + (tz - ball.z) * k; const ex = nx - m.x, ez = nz - m.z, ed = Math.hypot(ex, ez);
      if (ed < .68) { nx = m.x + ex / (ed || 1) * .68; nz = m.z + ez / (ed || 1) * .68; }
      ball.x = nx; ball.z = nz; ball.y = R; ball.vx = vxm; ball.vz = vzm; ball.vy = 0; ball.wx = ball.vz / R; ball.wz = -ball.vx / R; return;
    }
    // toque preso à perna de verdade: lê o pé direito e o esquerdo; quando um chega ao ponto mais à frente da passada, ele toca a bola
    let ev = null;
    if (l && l.footPos) for (const sd of ['R', 'L']) { l.footPos(sd, tmpF); const f = (tmpF.x - m.x) * bx + (tmpF.z - m.z) * bz, q = S.fp[sd], dv = f - q.v; if (q.dv > 0 && dv <= 0 && f > .1 && S.cph > .3) ev = sd; q.dv = dv; q.v = f; }
    S.cph = Math.min(2, S.cph + dt * (2.6 + sp * .12));
    if (!ev && S.cph >= 1.5) ev = S.cs === 'R' ? 'L' : 'R';                                              // sem leitura do pé: mantém o ritmo
    const ms = clamp(sp / RUNV, 0, 1.2), outrun = (vxm - ball.vx) * bx + (vzm - ball.vz) * bz > 2.5 && al < 1.0, swerve = ((want && Math.abs((ball.vx - vxm) * hz - (ball.vz - vzm) * hx) > 1.8) || outrun) && S.cph > .12;   // virou ou o corpo vai mais rápido que a bola: o pé toca na hora
    if (!ev && swerve) ev = la > 0 ? 'L' : 'R';                                                         // virou e a bola ficou de lado: o pé mais perto corta na hora
    if (ev && ball.y < .4 && al > (swerve ? -.95 : -.3) && al < 2.2 && Math.abs(la) < (swerve ? 1.7 : 1.2)) {
      // o toque: dá à bola a velocidade que a deixa à frente do jeito certo no PRÓXIMO toque (descontando o atrito de rolagem)
      const T = clamp(S.tint, .25, .6), tgtA = (tr && tr.held ? .72 : .82) + ms * (tr && tr.held ? .15 : .42), tgtL = -.1 * (ev === 'R' ? 1 : -1);
      const rf = clamp((tgtA - al) / T + .8 * T, -1.2, 4.5), rl = clamp((tgtL - la) / T, -4, 4);
      ball.vx = vxm + bx * rf + bz * rl; ball.vz = vzm + bz * rf - bx * rl; ball.vy = 0; ball.wx = ball.vz / R; ball.wz = -ball.vx / R;
      S.tint = clamp(S.tint * .6 + (S.clock - S.tlast) * .4, .25, .6); S.tlast = S.clock; S.cph = 0; S.cn++; S.cs = ev; S.fl = ev === 'R'; touchBall(m);
    } else if (ev) { S.cph = 0; S.cs = ev; }
    // o corpo nunca atravessa a bola: se ela ficar dentro do corpo, é empurrada para fora na velocidade do jogador
    if (d < .64 && al > -.2) { const nd = d || 1e-6; ball.x = m.x + dx / nd * .68; ball.z = m.z + dz / nd * .68; ball.vx = vxm; ball.vz = vzm; ball.wx = ball.vz / R; ball.wz = -ball.vx / R; }
  }

  /* ---- interceptar (raio sem a bola): corre até onde a bola vai estar e domina ---- */
  function slideEnd(m) { S.slT = 0; const l = L(m); if (l) { l.setTilt(0, false, 9); l.setDivePose(null); } }
  function lunge(m) {   // CARRINHO (raio sem a bola): desliza curto na direção da bola, rouba a posse e domina; sem corrida forçada nem poeira
    const V = 10.5; let tgt = null;
    for (let t = .1; t <= 1.0; t += .05) { const f = Math.max(0, 1 - .12 * t), px = ball.x + ball.vx * t * f, pz = ball.z + ball.vz * t * f, dd = Math.hypot(px - m.x, pz - m.z); if (dd <= V * t + .3) { tgt = { x: px, z: pz, t, dd }; break; } }
    if (!tgt || tgt.dd < .9 || tgt.dd > 4.6) return false;
    const ux = (tgt.x - m.x) / tgt.dd, uz = (tgt.z - m.z) / tgt.dd, stop = Math.min(4.2, tgt.dd + .35), du = Math.max(.22, stop / V);
    m.dash = { segs: [{ x0: m.x, z0: m.z, x1: m.x + ux * stop, z1: m.z + uz * stop, du, hold: .06 }], i: 0, t: 0, h: 0, nodust: true }; S.slT = du + .4;
    const l = L(m); if (l) { l.setReady(false); l.setDivePose('low'); l.setTilt(68, true, 14); } snd.whoosh(); return true;
  }

  /* ---- dribles por gesto do analógico (raio apertado + movimento) ---- */
  function gesture(h) {
    if (h.length < 4) return null;
    let ang = 0, pa = null; const seq = [];
    for (const [t, ix, iy] of h) {
      const mg = Math.hypot(ix, iy); if (mg < .5) continue;
      const a = Math.atan2(ix, iy); if (pa != null) { let d = a - pa; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; ang += d; } pa = a;
      const dir = Math.abs(iy) >= Math.abs(ix) ? (iy > 0 ? 'U' : 'D') : (ix > 0 ? 'R' : 'L'), q = seq[seq.length - 1];
      if (q && q.d === dir) q.t1 = t; else seq.push({ d: dir, t0: t, t1: t });
    }
    if (Math.abs(ang) > 4.0) return { k: 'giro', sg: ang > 0 ? 1 : -1 };
    const f = seq.filter((q, i) => q.t1 - q.t0 > .035 || i === 0 || i === seq.length - 1); if (f.length < 2) return null;
    const a = f[f.length - 2], b = f[f.length - 1], now = S.clock, settled = now - b.t0 > .09;
    if (a.d === 'D' && b.d === 'U' && settled) return { k: 'cober' };
    if (a.d === 'L' && b.d === 'R' && settled) return { k: 'corte', sg: 1 };
    if (a.d === 'R' && b.d === 'L' && settled) return { k: 'corte', sg: -1 };
    if (a.d === 'U' && b.d === 'D' && now - b.t0 > .32) return { k: 'puxada' };
    return null;
  }
  const limP = (x, z) => ({ x: clamp(x, cx - HW - 1.5, cx + HW + 1.5), z: clamp(z, -HL - 1.5, HL + 1.5) });
  const MVN = { giro: 'ROLETA', cober: 'CARRETILHA', puxada: 'PUXADA', elastico: 'ELÁSTICO' };
  function startMove(g, m, cy, vxm, vzm) {
    showMove(g.k === 'corte' ? (g.sg > 0 ? 'CORTE PELA ESQUERDA' : 'CORTE PELA DIREITA') : MVN[g.k]); if (!S.fp) S.fp = { R: { v: 0, dv: 0 }, L: { v: 0, dv: 0 } }; S.cph = 1; S.pin = null;
    const bx = Math.sin(m.yaw), bz = Math.cos(m.yaw), lx = Math.cos(cy), lz = -Math.sin(cy);     // frente do corpo e ESQUERDA da tela (mundo)
    const P = { x: m.x, z: m.z }, l = L(m), lim = (x, z) => ({ x: clamp(x, cx - HW - 1.5, cx + HW + 1.5), z: clamp(z, -HL - 1.5, HL + 1.5) });
    const segs = []; let cur = P; const add = (x, z, du) => { const q = lim(x, z); segs.push({ x0: cur.x, z0: cur.z, x1: q.x, z1: q.z, du, hold: 0 }); cur = q; };
    if (g.k === 'cober') {                       // CARRETILHA: o pé passa por baixo e lança a bola por cima, ALTA, à frente (dá para driblar por cima de quem marca)
      if (ball.y < .5 && Math.hypot(ball.x - m.x, ball.z - m.z) < 1.9) {
        const sp0 = Math.hypot(vxm, vzm), mv0 = api.readMove(), dir = mv0[2] > .1 ? [mv0[0] / mv0[2], mv0[1] / mv0[2]] : sp0 > .8 ? [vxm / sp0, vzm / sp0] : [bx, bz], fwd = 3.9 + Math.min(sp0, 7.2) * .28;
        ball.launch(dir[0] * fwd, 6.6, dir[1] * fwd, 0, 0, 0); S.cobT = .55; S.car = false; touchBall(m); if (l) l.play('touch', { foot: 'R', scale: .8 });
        snd.kick(.45); if (fx && fx.emit) fx.emit(ball.x, ball.y, ball.z, 8, { color: [1, 1, 1], speed: 1.8, life: .3, size: .09 });
        const run = 3.6 + Math.min(sp0, 7.2) * .3, q = lim(m.x + dir[0] * run, m.z + dir[1] * run); m.dash = { segs: [{ x0: m.x, z0: m.z, x1: q.x, z1: q.z, du: .62, hold: 0 }], i: 0, t: 0, h: 0 }; S.rdash = false;
        S.mv = { k: 'cober', t: 0, dur: .62, side: 0 }; S.mvCd = .9;
      } return;
    }
    if (g.k === 'elastico') {                    // elástico: empurra a bola para um lado e puxa para o outro, saindo em frente
      const sg = g.sg || 1; add(P.x + bx * .5 + lx * .75 * sg, P.z + bz * .5 + lz * .75 * sg, .13); add(P.x + bx * 1.05 - lx * .7 * sg, P.z + bz * 1.05 - lz * .7 * sg, .17); add(P.x + bx * 2.0 - lx * .25 * sg, P.z + bz * 2.0 - lz * .25 * sg, .16); S.mv = { k: 'elastico', t: 0, dur: .5, side: sg };
    } else     if (g.k === 'corte') {                       // corta para o lado e volta para a linha de onde saiu
      const sg = g.sg; add(P.x + bx * .65 + lx * .95 * sg, P.z + bz * .65 + lz * .95 * sg, .17); add(P.x + bx * 1.5, P.z + bz * 1.5, .17); S.mv = { k: 'corte', t: 0, dur: .36, side: sg };
    } else {                                     // giro (roleta, 360°) e puxada (meia-volta, 180°)
      const half = g.k === 'puxada', sg = g.sg || 1, r = .62, n = half ? 4 : 8, du = half ? .09 : .075, th = half ? Math.PI : 2 * Math.PI, rx = -bz * sg, rz = bx * sg;   // lado do giro: sg>0 = direita
      for (let i = 1; i <= n; i++) { const a = th * i / n; add(P.x + bx * r * Math.sin(a) + rx * r * (1 - Math.cos(a)) * -1 * -1, P.z + bz * r * Math.sin(a) + rz * r * (1 - Math.cos(a)), du); }
      const hx = half ? -bx : bx, hz = half ? -bz : bz; add(cur.x + hx * (half ? .9 : 1.1), cur.z + hz * (half ? .9 : 1.1), .15); S.mv = { k: g.k, t: 0, dur: n * du + .15, side: 0 };
    }
    m.dash = { segs, i: 0, t: 0, h: 0 }; S.rdash = false; S.car = true; if (l) l.play('touch', { foot: g.sg > 0 || g.k === 'giro' ? 'R' : 'L', scale: .8 });
  }

  /* ============================== contato corpo × bola ============================== */
  function bodyContact(a, isKeeper) {
    const dx = ball.x - a.x, dz = ball.z - a.z, d = Math.hypot(dx, dz) || 1e-6, rr = .46 + R * .95, top = a.y + (a.crouch ? 1.2 : 1.95), bot = a.y - R;
    if (d >= rr || ball.y > top || ball.y < bot) return false;
    const nx = dx / d, nz = dz / d, vrel = (ball.vx - a.vx) * nx + (ball.vz - a.vz) * nz; ball.x = a.x + nx * rr; ball.z = a.z + nz * rr;
    if (vrel >= 0) return true;
    const an = a.vx * nx + a.vz * nz, chest = ball.y > a.y + .85; let vn = an + (-vrel) * (chest ? .38 : .2);
    const cur = ball.vx * nx + ball.vz * nz, dv = vn - cur; ball.vx += nx * dv; ball.vz += nz * dv;
    if (chest && ball.vy < 0) ball.vy = -ball.vy * .3; touchBall(a); if (Math.abs(dv) > 3) snd.bounce(Math.abs(dv));
    return true;
  }

  /* ============================== goleiros (um por gol; sd = +1 gol de cima, -1 gol de baixo) ============================== */
  const hashf = v => { const q = Math.sin(v * 12.9898 + 78.233) * 43758.5453; return q - Math.floor(q); };   // "acaso" determinístico: os dois lados do 1x1 decidem igual
  const owns = () => !S.x1 || S.x1.own;   // no 1x1 só quem manda na bola mexe nela; o outro lado recebe pelo estado
  const KS = [], kOf = a => KS.find(k => k.g === a);
  const isHuman = a => !!a && (a === me() || (!!S.x1 && a === S.x1.oppA));
  function humanBallDist() { const m = me(); let d = Math.hypot(ball.x - m.x, ball.z - m.z); const o = S.x1 && S.x1.oppA; if (o) d = Math.min(d, Math.hypot(ball.x - o.x, ball.z - o.z)); return d; }
  function predict(sd, maxT = 1.6) {   // onde a bola cruza o plano do gol (simulação rápida)
    const b = new BallPhys(); Object.assign(b, { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, wx: ball.wx, wy: ball.wy, wz: ball.wz, colliders: [] });
    for (let t = 0; t < maxT; t += 1 / 60) { b.step(1 / 60); if (b.z * sd >= HL - .1) return { x: b.x, y: b.y, t }; if (b.speed < .3) break; } return null;
  }
  function predictLand(maxT = 1.5) {   // onde a bola desce até a altura das mãos (cruzamentos / bolas altas na área)
    const b = new BallPhys(); Object.assign(b, { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, wx: ball.wx, wy: ball.wy, wz: ball.wz, colliders: [] });
    for (let t = 0; t < maxT; t += 1 / 30) { b.step(1 / 30); if (b.y < 1.3 && b.vy <= 0) return { x: b.x, z: b.z, t }; } return null;
  }
  function gkGather(K) {   // goleiro domina a bola com as mãos (bola rasteira, solta ou nos pés do atacante dentro da área)
    const g = K.g, st = K.st, l = L(g); if (!owns() || ball.frozen) return false;
    ball.vx = ball.vy = ball.vz = 0; ball.frozen = true; banner('DEFESA!', 900); snd.save(); stadium.cheerUp(.25); S.hitPost = false;
    if (l) { l.setTilt(0, false, 9); l.setDivePose(null); l.play('catch'); }
    gkSetMode(st, 'hold'); st.throwing = false; st.chase = 0; st.punt = Math.random() < .5; return true;   // metade das vezes joga com a mão, metade chuta
  }
  function gkSetMode(st, mode) { st.mode = mode; st.t = 0; }
  function gkUpdate(K, dt) {
    const g = K.g, st = K.st, sd = K.sd; if (!g || !st) return; const br = g.brain, l = L(g), rig = g.hero.atlasRig; br.mx = br.mz = 0;
    if (!K.on()) return; if (!l) return; const skill = S.x1 ? (S.x1.bot && S.bot ? (sd > 0 ? .5 + .42 * S.bot.skill : .72) : .74) : S.mode === 'pen' ? .56 : .7; st.cool -= dt; st.think -= dt; st.t += dt;
    const toB = Math.atan2(ball.x - g.x, ball.z - g.z); g.aimT = .2; g.yaw += angDiff(toB, g.yaw) * Math.min(1, 10 * dt);
    const fr = friendOf(K); if (fr && (st.mode === 'hold' || st.mode === 'throw' || st.mode === 'kick')) g.yaw = Math.atan2(fr.x - g.x, fr.z - g.z);
    const hp = tmpP, hold = () => { if (!owns()) return; l.handsPos(hp); ball.frozen = true; ball.place(hp.x, Math.max(R, hp.y), hp.z); ball.frozen = true; };
    if (st.mode === 'hold') {
      rig.forceSpd = 0; l.setReady(false); hold();
      if (st.punt && S.mode !== 'pen' && !fr) g.yaw = sd > 0 ? PI : 0;   // de frente para o campo
      if (st.t > (st.punt ? .8 : .95)) {
        if (st.punt && S.mode !== 'pen' && owns()) {   // solta a bola nos pés, domina e chuta
          const fx = Math.sin(g.yaw), fz = Math.cos(g.yaw); ball.frozen = false; ball.vx = ball.vy = ball.vz = 0; ball.place(g.x + fx * 1.05, R, g.z + fz * 1.05); touchBall(g);
          st.kicking = true; gkSetMode(st, 'kick'); l.setReady(false); l.play('shot');
        } else { gkSetMode(st, 'throw'); st.toss = S.mode === 'train'; l.play('gkthrow'); }
      }
      return;
    }
    if (st.mode === 'kick') { rig.forceSpd = 0; if (st.kicking && st.t > .95) gkKickImpact(K); if (st.t > 1.4) { st.kicking = false; gkSetMode(st, 'ready'); l.setReady(true); } return; }
    if (st.mode === 'throw') { rig.forceSpd = 0; if (ball.frozen) hold(); if (st.t > .95) { gkSetMode(st, 'ready'); l.setReady(true); } return; }
    if (st.mode === 'down') { rig.forceSpd = 0; if (st.t > .55) { gkSetMode(st, 'getup'); l.setTilt(0, false, 8); l.setDivePose(null); l.play('getup'); } return; }
    if (st.mode === 'getup') { rig.forceSpd = 0; if (st.t > .7) { gkSetMode(st, 'ready'); l.setReady(true); } return; }
    if (st.mode === 'dive') {
      const D = st.dive; D.t += dt; const k = clamp(D.t / D.dur, 0, 1); g.x = clamp(D.x0 + (D.x1 - D.x0) * (1 - (1 - k) * (1 - k)), cx - GW + .2, cx + GW - .2);
      if (g.grounded && D.t > .18 && !D.landed) { D.landed = true; l.setTilt(D.sgn * 84, true, 10); }
      if (k >= 1 && g.grounded) { D.hold += dt; if (D.hold > .1) gkSetMode(st, 'down'); }
      if (D.t > D.dur + 1) gkSetMode(st, 'down');
      gkSave(K, true, D); return;
    }
    // ----- pronto / corrida -----
    const gx = cx, gz = sd * HL, bdx = ball.x - gx, bdz = ball.z - gz, bd = Math.hypot(bdx, bdz) || 1, depth = sd * ball.z, ax = Math.abs(ball.x - cx);
    const inBox = depth > HL - 16.5 && ax < 20.5, zone = depth > HL - 27 && ax < 29, hb = humanBallDist(), live = S.state === 'play' && S.mode !== 'pen' && S.last !== g;
    const danger = live && zone && hb < 11;   // atacante chegando perto da área: o goleiro SAI e fecha o ângulo, em vez de ficar só na linha
    const out = danger ? clamp(bd * .5 - 1.5, 1, 9.5) : clamp(bd * .075, .5, 4.2);
    let tx = clamp(gx + bdx / bd * out * 1.3, cx - GW + .6, cx + GW - .6), tz = sd * clamp(sd * (gz + bdz / bd * out), HL - (danger ? 10.5 : 4.4), HL - .5), run = false;
    // bola solta, rasteira ou nos pés do atacante dentro da área: vai ATÉ ela, domina e depois joga com a mão ou chuta
    const mineInc = live && !!fr && S.last === fr && ball.vz * sd > .4 && depth > HL - 32, pursue = live && (inBox && ball.y < 1.25 && ball.speed < 12 || mineInc && ball.y < 1.6 && ball.speed < 15);   // passe do meu time (recuo): o goleiro vai buscar e encaixa
    if (pursue) { st.chase = (st.chase || 0) + dt; tx = ball.x; tz = ball.z; run = true; } else st.chase = 0;
    // bola alta/cruzamento que vai descer na área: corre até o ponto de queda
    if ((st.lpT = (st.lpT || 0) - dt) <= 0) { st.lpT = .15; st.lp = (!pursue && live && depth > HL - 32 && ball.y > .9 && ball.speed > 3 && hb > 2.2) ? predictLand() : null; }
    if (!pursue && st.lp && st.lp.t > .15 && sd * st.lp.z > HL - 17 && Math.abs(st.lp.x - cx) < 19) { tx = st.lp.x; tz = st.lp.z; run = true; }
    if (live && owns() && !ball.frozen && st.mode === 'ready' && (pursue || st.lp) && Math.hypot(ball.x - g.x, ball.z - g.z) < 1.45 && ball.y < 1.75 && ball.speed < (mineInc ? 15 : 12) && (!S.ctl || st.chase > .4 || mineInc) && gkGather(K)) return;
    if (st.plan) { /* seguindo uma jogada */ }
    else if (st.think <= 0 && ball.vz * sd > 3 && ball.speed > (mineInc ? 15 : 7) && isHuman(S.last) && st.cool <= 0) {
      st.think = .06; const pr = predict(sd);
      if (pr && Math.abs(pr.x - cx) < GW + 1 && pr.y < GH + .5 && pr.t > .08) {
        /* bola no corpo/meio do gol: sem erro de propósito (antes ele errava o lado e "liberava o caminho"); só erra um pouco nos cantos */
        const dx0 = Math.abs(pr.x - g.x), h1 = hashf(pr.x * 3.1 + pr.t * 5.7), h2 = hashf(pr.y * 4.3 + pr.t * 2.9), mid = dx0 < 2.4;
        const err = mid ? 0 : (h1 - .5) * (1 - skill) * 5;
        st.plan = { x: clamp(pr.x + err, cx - GW - .3, cx + GW + .3), y: pr.y + (mid ? 0 : (h2 - .5) * (1 - skill) * 1), t: pr.t, age: 0, react: mid ? .07 : .12 + (1 - skill) * .35 };
      }
    }
    if (st.plan) {
      const P = st.plan; P.age += dt; const rem = P.t - P.age, dist = Math.abs(P.x - g.x);
      if (P.age >= P.react) {
        if (dist < 1.1 && P.y < 2.3) { tx = P.x; tz = sd * Math.max(sd * tz, HL - 1.2); }
        else if (dist / 5.8 < Math.max(.06, rem - .06) && P.y < 1.6) { tx = P.x; run = false; br.mx = Math.sign(P.x - g.x); br.mz = 0; st.stepping = true; }
        else { startDive(K, P); st.plan = null; return; }
      }
      if (rem < -.5) st.plan = null;
    }
    const lat = g.vx;
    if (!run) { rig.forceSpd = 0; l.setReady(true); l.setShuffle(Math.sign(lat) * (Math.cos(g.yaw) < 0 ? 1 : -1) || 0, Math.abs(g.vx) + Math.abs(g.vz)); g.aimT = .2; }
    else { rig.forceSpd = null; l.setReady(false); g.aimT = 0; l.setShuffle(0, 0); }
    if (!br.mx) { const ex = tx - g.x, ez = tz - g.z, el = Math.hypot(ex, ez); if (el > .25) { const sc = run ? 1 : Math.min(1, el * 1.4); br.mx = ex / el * sc; br.mz = ez / el * sc; } }
    gkSave(K, false, null);
  }
  function startDive(K, P) {
    const g = K.g, st = K.st, l = L(g); if (!l) return; const dx = clamp(P.x, cx - GW + .3, cx + GW - .3) - g.x, dirW = Math.sign(dx) || 1;
    const rightX = Math.cos(g.yaw), toRight = dirW * rightX > 0, sgn = toRight ? 1 : -1, kind = P.y < .75 ? 'low' : P.y < 1.65 ? 'mid' : 'high', ang = kind === 'low' ? 76 : kind === 'mid' ? 64 : 48;
    st.dive = { t: 0, dur: clamp(Math.abs(dx) / 6.2, .3, .85), x0: g.x, x1: g.x + dx, sgn, kind, hold: 0, landed: false }; gkSetMode(st, 'dive'); st.cool = 1.6; g.grounded = false; g.vy = kind === 'low' ? 3 : kind === 'mid' ? 4.4 : 5.8;
    l.setReady(false); l.setDivePose(kind); l.setTilt(sgn * ang, false, 13); g.hero.atlasRig.forceSpd = 0;
  }
  function gkSave(K, diving, D) {   // encaixa ou espalma
    const g = K.g, st = K.st, sd = K.sd, l = L(g); if (!owns() || ball.frozen || S.last === g || ball.speed < .5) return;
    const ext = diving ? 1.15 : .4, dirx = diving ? (D.x1 - D.x0 >= 0 ? 1 : -1) : 0, hx = g.x + dirx * ext, hy = g.y + (diving ? (D.kind === 'low' ? .7 : D.kind === 'mid' ? 1.3 : 2.1) : 1.3), hz = g.z;
    const dd = Math.hypot(ball.x - hx, ball.y - hy, ball.z - hz); if (dd > (diving ? 1.6 : 1.35)) return;
    const sp = ball.speed, spn = sp / SB, pCatch = clamp(1.05 - spn / 22, .12, .95) * (S.mode === 'pen' ? .8 : .9), catchable = (friendOf(K) && S.last === friendOf(K)) || spn < 9 || (spn < 19 && hashf(sp * 7.3 + ball.x * 3.7 + ball.y * 5.1) < pCatch);   // força na escala do HUD
    if (sd > 0) { S.saved++; resolveShot('save'); } S.hitPost = false; updateScoreHud();
    if (catchable) { ball.vx = ball.vy = ball.vz = 0; ball.frozen = true; banner('DEFESA!', 900); snd.save(); stadium.cheerUp(.25); if (diving) { st.dive.hold = 9; } l.setTilt(0, false, 9); l.setDivePose(null); l.play('catch'); gkSetMode(st, 'hold'); st.throwing = false; st.punt = Math.random() < .5; }
    else { const nx = (ball.x - hx) / (dd || 1), out = Math.sign(ball.x - cx) || (hashf(ball.z * 9.1) < .5 ? -1 : 1); ball.vx = (nx * .45 + out * .55) * sp * .5; ball.vz = -sd * (Math.abs(ball.vz) * .4 + 2); ball.vy = Math.abs(ball.vy) * .4 + 2.8; banner('ESPALMOU!', 800); snd.save(); touchBall(g); if (!diving) l.play('punch'); if (diving) st.dive.hold = 0; }
    if (!diving) st.plan = null;
  }
  const friendOf = K => K.sd < 0 ? me() : S.x1 ? (S.x1.oppA || (S.bot && S.bot.a) || null) : null;   // companheiro de time do goleiro (para quem ele distribui)
  function gkAim(K, el) {
    const g = K.g, f = friendOf(K); let dx, dz, dist = 16;
    if (f && f.alive !== false) { dx = f.x + (f.vx || 0) * .5 - g.x; dz = f.z + (f.vz || 0) * .5 - g.z; dist = Math.hypot(dx, dz) || 1; dx /= dist; dz /= dist; }
    else { const a = (Math.random() - .5) * .7; dx = Math.sin(a); dz = -K.sd * Math.cos(a); }
    return { dx, dz, v: clamp(Math.sqrt(Math.max(dist, 6) * 9.8 * 1.15 / Math.sin(2 * el)), 8, 24), f };
  }
  function gkRelease(K) {   // arremesso do goleiro depois de encaixar
    const g = K.g, st = K.st; if (!ball.frozen || !owns()) return; ball.frozen = false; const f0 = friendOf(K), dir = (Math.random() - .5) * .8, short = Math.random() < .35, v = short ? 11 : 18, el = d2r(f0 ? 18 : short ? 12 : 38);
    if (f0) { const A = gkAim(K, el); ball.launch(A.dx * A.v * Math.cos(el), A.v * Math.sin(el), A.dz * A.v * Math.cos(el), 0, 0, 0); } else ball.launch(Math.sin(dir) * v * Math.cos(el), v * Math.sin(el), -K.sd * Math.cos(dir) * v * Math.cos(el), 0, 0, 0); touchBall(g); snd.kick(.4); S.noCtl = .3;
  }
  function gkKickImpact(K) { const g = K.g, st = K.st; st.kicking = false; if (!owns()) return; ball.frozen = false; const dir = (Math.random() - .5) * .7, v = 22, f0 = friendOf(K); if (f0) { const el = d2r(26), A = gkAim(K, el); ball.launch(A.dx * A.v * Math.cos(el), A.v * Math.sin(el), A.dz * A.v * Math.cos(el), 0, 0, 0); } else ball.launch(Math.sin(dir) * v * .85, v * .52, -K.sd * Math.cos(dir) * v * .85, 0, 0, 0); touchBall(g); snd.kick(.8); }
  function resolveShot(res) {   // só os pênaltis precisam do resultado de cada cobrança
    const P = S.pen; if (!P || P.phase !== 'flight' && P.phase !== 'ready' || P.resolved) return; if (P.phase === 'ready' && !P.kicked) return;
    P.resolved = true; P.res[P.round] = res === 'goal' ? 1 : 0; if (res === 'goal') P.goals++; P.round++; P.phase = 'result'; P.t = 0; updateScoreHud();
  }

  /* ============================== 1x1 online (amigo contra amigo) ==============================
     Totem no meio do campo (lado direito) → botão 1X1 → fila → dois jogadores da sala viram adversários. Cada lado vê a si mesmo atacando o gol de cima:
     o convidado joga num referencial girado 180° (x → 2cx−x, z → −z) e isso é desfeito ao enviar/receber. A bola é simulada por quem mexeu nela por último
     ("posse"); o outro lado recebe o estado a cada sincronização. Gols, laterais, escanteios e tiros de meta são eventos numerados (idempotentes). */
  const TOT = { x: cx + HW + 2.6, z: 0 };
  const totem = new THREE.Group(); totem.position.set(TOT.x, 0, TOT.z);
  { const base = new THREE.Mesh(new THREE.CylinderGeometry(.6, .75, .25, 24), new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: .5, metalness: .6 }));
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(.26, .32, 2.7, 18), new THREE.MeshStandardMaterial({ color: 0x20304a, emissive: 0x1d6fff, emissiveIntensity: 1.5, roughness: .35, metalness: .5 })); pil.position.y = 1.55;
    const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'); x.fillStyle = 'rgba(8,12,24,.9)'; x.fillRect(0, 0, 256, 128); x.strokeStyle = '#ffd24a'; x.lineWidth = 6; x.strokeRect(5, 5, 246, 118); x.fillStyle = '#ffd24a'; x.font = '900 76px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('1x1', 128, 58); x.font = '700 17px system-ui,sans-serif'; x.fillStyle = '#fff'; x.fillText('AMIGO × AMIGO', 128, 106);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })); sign.position.y = 3.7; sign.rotation.y = -PI / 2;
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.7, 40), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: .55, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); ring.rotation.x = -PI / 2; ring.position.y = .06; totem.userData.ring = ring;
    totem.add(base, pil, sign, ring); scene.add(totem); }
  { const st = document.createElement('style'); st.textContent = '#sx1,#sx1b{position:fixed;left:calc(14px + env(safe-area-inset-left,0px));top:126px;z-index:32;max-width:42vw;padding:12px 16px;border-radius:14px;border:2px solid #ffd24a;background:rgba(8,12,24,.9);color:#ffd24a;font:900 14px system-ui,sans-serif;letter-spacing:.06em;display:none;box-shadow:0 4px 18px rgba(0,0,0,.5)}#sx1b{top:190px;color:#7ce8ff;border-color:#7ce8ff}#sx1.q{color:#fff;border-color:#43e08a}#sx1.m{color:#ff8a7a;border-color:#ff5a4a}'; document.head.appendChild(st); css.after(st); }
  const $sx1 = mk('button', 'sx1', '1X1'), $sx1b = mk('button', 'sx1b', '1X1 · CONTRA BOT');
  const nearTotem = () => { const m = me(); return !!m && Math.hypot(m.x - TOT.x, m.z - TOT.z) < 7; };
  function sx1Refresh() {
    if (S.x1) { $sx1.style.display = 'block'; $sx1.className = 'm'; $sx1.textContent = 'SAIR DO 1X1'; }
    else if (S.xq) { $sx1.style.display = 'block'; $sx1.className = 'q'; $sx1.textContent = 'PROCURANDO ADVERSÁRIO… (cancelar)'; }
    else if (nearTotem()) { $sx1.style.display = 'block'; $sx1.className = ''; $sx1.textContent = '1X1 · ENTRAR NA FILA'; }
    else $sx1.style.display = 'none';
    $sx1b.style.display = !S.x1 && !S.xq && nearTotem() ? 'block' : 'none';
  }
  $sx1.addEventListener('pointerdown', e => e.stopPropagation()); $sx1b.addEventListener('pointerdown', e => e.stopPropagation()); $sx1b.onclick = () => x1BotStart();
  $sx1.onclick = () => {
    if (S.x1) { x1End('Você saiu do 1x1'); return; }
    if (api.isOffline && api.isOffline()) { banner('O 1x1 precisa de internet', 1600); return; }
    if (S.xq) { S.xq = 0; banner('Fila cancelada', 900); } else { S.xq = Date.now(); banner('1X1 · aguardando um amigo apertar o 1X1 também', 2600); }
    sx1Refresh();
  };
  const rotXZ = (x, z) => S.x1 && !S.x1.host ? { x: 2 * cx - x, z: -z } : { x, z };
  function rotS(s) { if (!s || !S.x1 || S.x1.host) return s; return Object.assign({}, s, { x: 2 * cx - s.x, z: -s.z, r: (s.r || 0) + PI }); }
  function x1Start(host, oppId) {
    const oa = actors.get(oppId); S.xq = 0;
    S.x1 = { host, opp: oppId, oppA: oa, oppName: oa ? oa.name : 'ADVERSÁRIO', own: host, n: 0, evN: 0, ev: null, sc: [0, 0], hs: [0, 0], h: 1, golden: false, clk: 0, seen: performance.now() + 4000, tk: 0, over: false, ui: 0 };
    S.pen = null; S.mode = 'train'; S.keeperOn = true; el('spGk').textContent = 'GOLEIRO: SIM'; $spt.style.display = 'none'; el('scL').textContent = '1X1'; for (const t of targets) t.m.visible = false;
    S.goals = 0; S.shots = 0; S.saved = 0; S.clock = 0; S.sp = null; S.thr = null; S.pk = null; placeKeeper();
    S.state = 'wait'; S.timer = 3; S.restartKind = 'center'; ball.frozen = false; ball.place(cx, R, 0);
    banner('1X1 · VOCÊ × ' + String(S.x1.oppName).toUpperCase(), 2600); snd.whistle(); updateScoreHud(); sx1Refresh();
  }
  function x1End(msg) {
    if (!S.x1) return; const wasBot = S.x1.bot; S.x1 = null; S.xq = 0; if (wasBot) botClear(); $spt.style.display = ''; el('spGk').textContent = 'GOLEIRO: SIM'; S.keeperOn = true; S.mode = 'pen'; setMode('train');
    if (msg) banner(msg, 2200); sx1Refresh();
  }
  function claim() { const X = S.x1; if (!X || X.own) return; X.own = true; X.n++; }
  function emit(ev) { const X = S.x1; ev.n = X.evN + 1; ev.t = Math.round(api.serverNow()); X.ev = ev; applyEv(ev); }
  function x1Goal(sd) {   // 1x1 sem relógio: cada tempo acaba quando alguém faz 5 gols NAQUELE tempo; o placar total soma os dois tempos
    const X = S.x1, mi = X.host ? 0 : 1, by = sd > 0 ? mi : 1 - mi, sc = X.sc.slice(), hs = X.hs.slice(); sc[by]++; hs[by]++; if (X.bot) botOnGoal(by === 0);
    let end = 0, w = -1;
    if (X.golden) { end = 2; w = by; }
    else if (hs[by] >= 5) { if (X.h === 1) end = 1; else if (sc[0] !== sc[1]) { end = 2; w = sc[0] > sc[1] ? 0 : 1; } else end = 3; }
    emit({ k: 'goal', by, sc, hs, h: X.h, end, w });
  }
  function x1OutTouch(sx) { const X = S.x1, z = clamp(ball.z, -HL + 4, HL - 4), p = rotXZ(cx + sx * (HW - .35), z), mi = X.host ? 0 : 1, tkL = 1 - S.lastTeam; emit({ k: 'out', kind: 'lateral', tk: tkL === 0 ? mi : 1 - mi, x: p.x, z: p.z, sd: 0 }); }
  function x1OutEnd(sd) {
    // posse: quem DEFENDE aquele fundo tocou por último = ESCANTEIO de quem ataca; senão = TIRO DE META de quem defende (no lado do seu gol isto estava invertido)
    const X = S.x1, mi = X.host ? 0 : 1, def = sd > 0 ? 1 : 0, kind = S.lastTeam === def ? 'corner' : 'goalkick', tkL = kind === 'corner' ? 1 - def : def; let xl, zl;
    if (kind === 'corner') { xl = cx + (Math.sign(ball.x - cx) || 1) * (HW - .35); zl = sd * (HL - .35); } else { xl = cx + (Math.random() - .5) * 4; zl = sd * (HL - 5.5); }
    const p = rotXZ(xl, zl); emit({ k: 'out', kind, tk: tkL === 0 ? mi : 1 - mi, x: p.x, z: p.z, sd: X.host ? sd : -sd });
  }
  function applyEv(ev) {
    const X = S.x1; if (!X || ev.n <= X.evN && X.ev !== ev) return; X.evN = Math.max(X.evN, ev.n); const age = clamp((api.serverNow() - ev.t) / 1000, 0, 3), mi = X.host ? 0 : 1; X.n = Math.max(X.n, ev.n * 100);
    if (ev.k === 'goal') {
      X.sc = ev.sc; X.hs = ev.hs; X.h = ev.h; X.ck = 1 - ev.by; const mine = ev.by === mi;   // X.ck = quem leva a saída de bola: quem sofreu o gol
 S.state = 'wait'; S.timer = Math.max(.4, (ev.end ? 4.6 : 3.4) - age); S.restartKind = 'center';
      stadium.goalRipple(mine ? 1 : -1); stadium.cheerUp(1.3); snd.net(); snd.cheer(1.2); snd.whistle(); banner(mine ? 'GOOOL!' : 'GOL DO ADVERSÁRIO', 2000);
      if (fx && fx.emit) fx.emit(ball.x, 1.5, ball.z, 40, { color: mine ? [1, .85, .4] : [.5, .7, 1], speed: 5, up: 4, life: 1.1, size: .2 });
      if (ev.end === 1) { X.h = 2; X.hs = [0, 0]; setTimeout(() => { if (S.x1 === X) banner('FIM DO 1º TEMPO · ' + X.sc[mi] + ' × ' + X.sc[1 - mi] + ' — 2º TEMPO: primeiro a 5', 3200); }, 1800); }
      else if (ev.end === 3) { X.golden = true; setTimeout(() => { if (S.x1 === X) banner('EMPATE! GOL DE OURO: o próximo gol vence', 3200); }, 1800); }
      else if (ev.end === 2) { X.over = true; S.timer = 99; setTimeout(() => { if (S.x1 === X) banner(ev.w === mi ? 'VOCÊ VENCEU! ' + X.sc[mi] + ' × ' + X.sc[1 - mi] : 'VOCÊ PERDEU · ' + X.sc[mi] + ' × ' + X.sc[1 - mi], 4000); }, 1800); setTimeout(() => { if (S.x1 === X) x1End(); }, 6400); }
    } else if (ev.k === 'out') {
      S.state = 'wait'; S.timer = Math.max(.4, 1.4 - age); S.restartKind = ev.kind; X.tk = ev.tk; const p = rotXZ(ev.x, ev.z); X.rx = p.x; X.rz = p.z; X.rsd = X.host ? ev.sd : -ev.sd; snd.whistle();
      banner((ev.kind === 'lateral' ? 'LATERAL' : ev.kind === 'corner' ? 'ESCANTEIO' : 'TIRO DE META') + ' · ' + (ev.tk === mi ? 'SEU' : 'ADVERSÁRIO'), 1300);
    }
    updateScoreHud();
  }
  function x1Restart() {
    const X = S.x1, k = S.restartKind, mi = X.host ? 0 : 1, iTake = k === 'center' ? (X.ck != null ? X.ck === mi : X.host) : X.tk === mi, m = me();
    S.state = 'play'; S.free = 0; ball.frozen = false; S.hitPost = false; S.sp = null; S.thr = null; S.pk = null; X.own = iTake || !!X.bot; if (X.bot) botReset();
    if (k === 'center') { resetBall(false); place(m, cx, iTake ? -1.5 : -9, 0); if (X.bot) botKickoff(iTake); return; }   // quem cobra a saída fica perto da bola; o outro recua
    const sxl = Math.sign(X.rx - cx) || 1; ball.place(X.rx, R, X.rz);
    if (k === 'lateral') { if (iTake) { S.sp = 'lateral'; S.spX = ball.x; S.spZ = ball.z; place(m, cx + sxl * (HW + 1.0), X.rz, -sxl * PI / 2); } else if (X.bot) botSetPiece('lateral', sxl); }
    else if (k === 'corner') { if (iTake) place(m, cx + sxl * (HW + .9), X.rsd * (HL + .7), Math.atan2(-sxl * 1.2, -X.rsd)); else if (X.bot) botSetPiece('corner', sxl); }
    else if (k === 'goalkick') {
      const K = KS.find(q => q.sd === X.rsd); if (K && K.g) { placeKeeper(K); K.g.x = ball.x; K.g.z = ball.z + X.rsd * 1.15; K.st.kicking = true; setTimeout(() => { if (S.state !== 'play' || !S.x1 || K.st.mode === 'dive') return; const l = L(K.g); if (l) l.play('shot'); else gkKickImpact(K); }, 900); }
    }
  }
  function ballOut() {
    const X = S.x1, rot = !X.host, g = rot ? -1 : 1, q = v => Math.round(v * 100) / 100;
    return { x: q(rot ? 2 * cx - ball.x : ball.x), y: q(ball.y), z: q(g * ball.z), vx: q(g * ball.vx), vy: q(ball.vy), vz: q(g * ball.vz), wx: q(g * ball.wx), wz: q(g * ball.wz), f: ball.frozen ? 1 : 0, ts: Math.round(api.serverNow()), n: X.n };
  }
  function ballIn(b) {
    const X = S.x1, rot = !X.host, g = rot ? -1 : 1, px = ball.x, pz = ball.z;
    const x = rot ? 2 * cx - b.x : b.x, z = g * b.z;
    if (b.f) { ball.frozen = false; ball.place(x, b.y, z); ball.frozen = true; return; }
    ball.frozen = false; ball.x = x; ball.y = b.y; ball.z = z; ball.vx = g * b.vx; ball.vy = b.vy; ball.vz = g * b.vz; ball.wx = g * b.wx; ball.wz = g * b.wz;
    const age = clamp((api.serverNow() - b.ts) / 1000, 0, .5); for (let t = 0; t < age; t += 1 / 60) ball.step(Math.min(1 / 60, age - t));
    const d = Math.hypot(ball.x - px, ball.z - pz); if (d < .6 && !ball.frozen) { ball.x = px + (ball.x - px) * .45; ball.z = pz + (ball.z - pz) * .45; }
  }
  function x1Same(p) {   // quem joga 1x1 fica num "campo" à parte: só se vê com o próprio adversário; treino só vê treino
    const myId = api.myId(), mine = S.x1 ? [myId, S.x1.opp].sort().join() : '', o = p && p.s && p.s.x1, theirs = o && o.vs ? [p.id, o.vs].sort().join() : '';
    return mine === theirs;
  }
  function x1Pack(s) {
    const X = S.x1; if (!X) { if (S.xq) s.x1 = { q: 1 }; return; }
    if (!X.host) { s.x = Math.round((2 * cx - s.x) * 100) / 100; s.z = Math.round(-s.z * 100) / 100; s.r = Math.round(((s.r || 0) + PI) * 100) / 100; }
    const o = { vs: X.opp, h: X.host ? 1 : 0, sc: X.sc, n: X.n }; if (X.ev) o.ev = X.ev; if (X.own && !X.bot) o.bl = ballOut(); s.x1 = o;
  }
  function x1Recv(players) {
    const myId = api.myId(); if (!players) return; if (S.x1 && S.x1.bot) return;
    if (!S.x1) {
      if (!S.xq) return;
      for (const p of players) { const o = p.id !== myId && p.s && p.s.x1; if (o && o.vs === myId && o.h === 1) return x1Start(false, p.id); }
      const cand = players.filter(p => p.id !== myId && p.s && p.s.x1 && p.s.x1.q).sort((a, b) => a.id < b.id ? -1 : 1)[0];
      if (cand && myId < cand.id) x1Start(true, cand.id);
      return;
    }
    const X = S.x1, p = players.find(q => q.id === X.opp), o = p && p.s && p.s.x1; X.oppA = actors.get(X.opp) || X.oppA; if (X.oppA) X.oppName = X.oppA.name;
    if (!o || o.vs !== myId) return; X.seen = performance.now();
    if (o.ev && o.ev.n > X.evN) applyEv(o.ev);
    if (o.bl) { const b = o.bl; if (b.n > X.n || (b.n === X.n && (!X.own || !X.host))) { if (X.own) { X.own = false; S.last = X.oppA || S.last; S.lastTeam = 1; } else if (b.n > X.n) { S.last = X.oppA || S.last; S.lastTeam = 1; } X.n = b.n; X.own = false; ballIn(b); } }
  }
  function x1Tick(dt) {
    const X = S.x1, m = me(); X.oppA = actors.get(X.opp) || X.oppA; X.ui -= dt;
    if (!X.bot && performance.now() - X.seen > 5000 && !X.over) { x1End('O adversário saiu do 1x1'); return; }
    if (!X.own && S.state === 'play' && ball.y < 1.3 && Math.hypot(ball.x - m.x, ball.z - m.z) < .85) claim();
    if (X.ui <= 0) { X.ui = .5; updateScoreHud(); }
  }


  /* ============================== 1x1 contra BOT ==============================
     O bot é um ator comum (makeFieldBot no game.js) guiado por brain.mx/mz, como o goleiro. Joga com as MESMAS regras do 1x1 online (2 tempos de 5 gols, gol de ouro, laterais,
     escanteios, tiros de meta) porque reaproveita x1Goal/x1Restart: aqui "eu" sou sempre o anfitrião e a bola é sempre simulada neste aparelho. Ele ataca o gol de baixo (z = −HL).
     NÍVEL (skill 0..1): sobe com o tempo, +0,075 a cada gol meu e +0,02 a cada gol dele (nunca desce). Quanto maior: mais rápido, marca mais perto, dá bote, escolhe cantos longe do goleiro,
     chuta mais forte (até ~134 km/h), e usa dribles (passe por fora, finta, corte, chapéu). Ele também aprende para qual lado EU costumo driblar e fecha esse lado. */
  const BOT0 = .3, rotv = (x, z, t) => [x * Math.cos(t) - z * Math.sin(t), x * Math.sin(t) + z * Math.cos(t)];
  const inField = (x, z) => [clamp(x, cx - HW + 1.6, cx + HW - 1.6), clamp(z, -HL + 1.6, HL - 1.6)], botFoot = () => Math.random() < .75 ? 'R' : 'L';
  function x1BotStart() {
    if (S.x1 || S.xq) return; const oa = api.makeFieldBot && api.makeFieldBot(); if (!oa) { banner('Bot indisponível', 1400); return; }
    S.bot = { a: oa, skill: BOT0, t: 0, think: 0, tackleCd: 0, shotCd: 0, touchCd: 0, mvCd: 0, mv: null, sp: null, pk: null, hab: { drib: 0 } };
    x1Start(true, oa.id); const X = S.x1; X.bot = true; X.own = true; X.seen = Infinity; X.oppA = oa; botKickoff(); updateScoreHud();
  }
  function botClear() { const B = S.bot; if (!B) return; S.bot = null; layers.delete(B.a); try { api.removeActor && api.removeActor(B.a.id); } catch (_) { } }
  function botReset() { const B = S.bot; if (B) { B.mv = null; B.sp = null; B.pk = null; B.touchCd = .3; } }
  function botKickoff(meTakes = true) { const B = S.bot; if (B) place(B.a, cx, meTakes ? 9 : 1.6, PI); }
  function botOnGoal(mine) { const B = S.bot; if (B) B.skill = clamp(B.skill + (mine ? .075 : .02), 0, .98); }
  function botSetPiece(kind, sxl) {
    const B = S.bot, X = S.x1; if (!B) return;
    if (kind === 'lateral') place(B.a, cx + sxl * (HW + 1.0), ball.z, -sxl * PI / 2); else place(B.a, cx + sxl * (HW + .9), X.rsd * (HL + .7), Math.atan2(-sxl * 1.2, -X.rsd));
    B.sp = { kind, t: 0 };
  }
  function botTouchBall(vx, vz, vy = 0, anim = 'touch') {   // toque curto no chão (vy = 0) ou bola levantada
    const B = S.bot, a = B.a, l = L(a);
    if (vy > 0) ball.launch(vx, vy, vz, 0, 0, 0); else { ball.vx = vx; ball.vz = vz; ball.vy = 0; ball.wx = vz / R; ball.wz = -vx / R; }
    touchBall(a); S.free = 0; if (l && !l.busy()) l.play(anim, { foot: botFoot(), scale: 1 });
  }
  function simY(v, yaw, el, gz) {   // altura em que o chute cruza o plano do gol (mesma física da bola)
    const b = new BallPhys(), c = Math.cos(el); Object.assign(b, { x: ball.x, y: Math.max(ball.y, R), z: ball.z, vx: Math.sin(yaw) * c * v, vy: Math.sin(el) * v, vz: Math.cos(yaw) * c * v, wx: 0, wy: 0, wz: 0, colliders: [] });
    for (let t = 0; t < 1.7; t += 1 / 60) { b.step(1 / 60); if (b.z <= gz + .1) return b.y; } return null;
  }
  function botKick(tx, tz, v, el, anim = 'shot', err = 0) {   // agenda o chute: a bola sai um instante depois do início da animação
    const B = S.bot, a = B.a, l = L(a), yaw = Math.atan2(tx - ball.x, tz - ball.z) + (Math.random() - .5) * err;
    B.pk = { t: .15, v, yaw, el }; B.mv = null; a.yaw = yaw; if (l) l.play(anim, { foot: botFoot(), scale: 1 });
  }
  function botShoot() {
    const B = S.bot, s = B.skill, K = KS.find(q => q.sd === -1), kg = K && K.g, gz = -HL;
    const side = kg && Math.abs(kg.x - cx) > .6 ? (kg.x > cx ? -1 : 1) : (Math.random() < .5 ? -1 : 1);   // canto longe do goleiro
    const dg = Math.hypot(cx - ball.x, gz - ball.z), long = dg > 24;   // chute de longe: sempre alto, na força máxima e com mais erro quanto mais longe
    const tx = cx + side * (GW - .75 - Math.random() * .5) + (Math.random() - .5) * ((1 - s) * 3.4 + (long ? (dg - 24) / 30 * 1.8 : 0)), high = long || (s > .45 && Math.random() < .5 + s * .2), ty = high ? GH - .5 : R + .3;
    const v = lerp(kmh(78), kmh(134), long ? Math.max(s, .85) : s) * 1.9, yaw = Math.atan2(tx - ball.x, gz - ball.z); let lo = -.03, hi = .7;
    for (let i = 0; i < 11; i++) { const mid = (lo + hi) / 2, y = simY(v, yaw, mid, gz); if (y === null || y < ty) lo = mid; else hi = mid; }
    botKick(tx, gz, v, (lo + hi) / 2, 'shot', (1 - s) * .05); B.shotCd = 1.1;
  }
  function botWatch() {   // aprende para que lado eu costumo driblar (só enquanto estou com a bola)
    const B = S.bot, m = me(); if (!m || S.lastTeam !== 0) return; const sp = Math.hypot(m.vx, m.vz);
    if (sp > 2 && Math.hypot(ball.x - m.x, ball.z - m.z) < 1.8) B.hab.drib = lerp(B.hab.drib, Math.sign(m.vx) * Math.min(1, Math.abs(m.vx) / 3), .02);
  }
  function botTick(dt) {
    const X = S.x1, B = S.bot, m = me(); if (!X || !B || !m) return; const a = B.a, br = a.brain; if (!br) return;
    br.mx = br.mz = 0; br.jump = false; a.alive = true; a.hp = a.maxHp; B.t += dt; const s = B.skill = Math.min(.98, B.skill + dt * .0007);
    B.tackleCd = Math.max(0, B.tackleCd - dt); B.shotCd = Math.max(0, B.shotCd - dt); B.touchCd = Math.max(0, B.touchCd - dt); B.mvCd = Math.max(0, B.mvCd - dt); B.think -= dt;
    X.oppName = 'BOT · NV' + (1 + Math.round(s * 9)); botWatch();
    const toBall = Math.atan2(ball.x - a.x, ball.z - a.z), face = k => { a.aimT = .2; a.yaw += angDiff(toBall, a.yaw) * Math.min(1, k * dt); };
    if (S.state !== 'play' || X.over) { face(8); return; }
    if (B.pk) { face(0); br.mx = br.mz = 0; B.pk.t -= dt;   // chute agendado
      if (B.pk.t <= 0) { const p = B.pk; B.pk = null; if (!ball.frozen && Math.hypot(ball.x - a.x, ball.z - a.z) < 2.1 && ball.y < 1.7) { const c = Math.cos(p.el); ball.launch(Math.sin(p.yaw) * c * p.v, Math.sin(p.el) * p.v, Math.cos(p.yaw) * c * p.v, 0, 0, 0); touchBall(a); S.free = 0; snd.kick(.9); } }
      return; }
    if (B.sp) { face(10); B.sp.t += dt;   // cobrança de lateral / escanteio do bot
      if (B.sp.t > 1.1) { const k = B.sp.kind; B.sp = null; if (k === 'corner') botKick(cx + (Math.random() - .5) * 5, -HL + 7, 22, .62, 'cross', .05); else botKick(cx + (Math.random() - .5) * 14, a.z - 14, 13.5, .32, 'pass', .1); }
      return; }
    const dB = Math.hypot(ball.x - a.x, ball.z - a.z), dM = Math.hypot(ball.x - m.x, ball.z - m.z), spd = .8 + .2 * s;
    const go = (tx, tz, mul = 1) => { const q = inField(tx, tz), ex = q[0] - a.x, ez = q[1] - a.z, d = Math.hypot(ex, ez); if (d < .12) return; const k = Math.min(1, d * 1.3) * mul * spd; br.mx = ex / d * k; br.mz = ez / d * k; };
    if (ball.frozen) { go(cx, 9, .6); face(4); return; }   // goleiro segurando a bola: recua para o meio
    if (B.mv) { botMoveStep(dt, dB, s, go); return; }
    const have = dB < 1.5 && ball.y < 1.4 && (dB <= dM + .2 || S.lastTeam === 1);
    if (have) { botAttack(dB, s, go); return; }
    if (dM < 2.4 && ball.speed < 10 && S.lastTeam === 0) {   // EU estou com a bola: marcação / pressão
      const lead = .15 + .25 * s, px = m.x + m.vx * lead + B.hab.drib * s * .9, pz = m.z + m.vz * lead; let dx = cx - px, dz = HL - pz; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      const D = lerp(3.4, 1.3, s); go(px + dx * D, pz + dz * D, 1); face(6);
      if (dB < 1.15 && Math.hypot(a.x - m.x, a.z - m.z) < 1.9 && ball.y < .9 && B.tackleCd <= 0 && Math.random() < dt * (.4 + 2.2 * s) * (S.car ? .45 : 1)) {   // bote
        const ex = (cx - ball.x) * .35, ez = -1, el2 = Math.hypot(ex, ez), v = 6 + 4 * s; botTouchBall(ex / el2 * v, ez / el2 * v); B.tackleCd = 1.6 - .9 * s; }
      return; }
    const t = clamp(dB / (7 * spd), 0, 1.1); go(ball.x + ball.vx * t * .7, ball.z + ball.vz * t * .7, 1); face(6);   // bola solta: vai buscar (antecipando)
  }
  function botAttack(dB, s, go) {
    const B = S.bot, a = B.a, m = me(), gz = -HL, dGoal = Math.hypot(cx - a.x, gz - a.z) || 1; let dx = (cx - a.x) / dGoal, dz = (gz - a.z) / dGoal;
    const ex = m.x - a.x, ez = m.z - a.z, dm = Math.hypot(ex, ez) || 1, cr = dx * ez - dz * ex, ahead = (ex * dx + ez * dz) / dm;   // cr: de que lado eu estou · ahead: estou na frente dele
    const near = 15 + 18 * s, far = s > .45 ? 20 + 38 * s : 0;   // alcance normal; de nível 5 para cima ele também arrisca de longe (até ~57 m: de antes do meio-campo)
    if (B.shotCd <= 0 && dB < 1.25 && dGoal < Math.max(near, far)) {
      const lane = Math.abs(cr) < 1.3 && ahead > .3 && dm < dGoal;   // estou na linha do chute?
      if (dGoal > near) { if (!lane && Math.random() < .035) { botShoot(); return; } }   // de longe: só com a linha livre e de vez em quando (não vira só isso)
      else if (!lane || dGoal < 9 || (s > .55 && Math.random() < .35)) { botShoot(); return; }
    }
    if (B.mvCd <= 0 && B.think <= 0 && s > .2 && ahead > .1 && dm < 5.4 && dB < 1.3) {   // tenta passar por mim
      B.think = .25;
      if (Math.random() < .35 + s * .55) { const side = cr > 0 ? -1 : 1, r = Math.random();
        const kind = s < .4 ? (r < .6 ? 'past' : 'feint') : s < .7 ? (r < .4 ? 'past' : r < .75 ? 'feint' : 'cut') : (dm > 2.3 && dm < 4.4 && r < .28 ? 'chip' : r < .5 ? 'past' : r < .78 ? 'feint' : 'cut');
        B.mv = { kind, t: 0, side, did: false }; B.mvCd = 1.4 - .7 * s; return; }
    }
    if (dm < 7 && ahead > .2) { const r2 = rotv(dx, dz, -Math.sign(cr || 1) * (1 - dm / 7) * (.55 + .5 * s)); dx = r2[0]; dz = r2[1]; }   // conduz desviando de mim
    if (dB > .95) go(ball.x + dx * .3, ball.z + dz * .3, 1);
    else { go(a.x + dx * 4, a.z + dz * 4, 1); if (B.touchCd <= 0 && dB < 1.2) { const v = Math.max(Math.hypot(a.vx, a.vz), 3.2) * (1.15 + .15 * s); botTouchBall(dx * v, dz * v); B.touchCd = .27 - .08 * s; } }
  }
  function botMoveStep(dt, dB, s, go) {
    const B = S.bot, a = B.a, M = B.mv, gd = Math.hypot(cx - a.x, -HL - a.z) || 1, dx = (cx - a.x) / gd, dz = (-HL - a.z) / gd, lat = rotv(dx, dz, M.side * PI / 2); M.t += dt;
    const abort = () => { B.mv = null; }, chase = () => go(ball.x + ball.vx * .25, ball.z + ball.vz * .25, 1);
    if (M.kind === 'feint') {   // finta: arranca para um lado e leva a bola para o outro
      if (M.t < .2) { go(a.x + lat[0] * 3, a.z + lat[1] * 3, 1); return; }
      if (!M.did) { M.did = true; if (dB > 1.6) return abort(); const d2 = rotv(dx, dz, -M.side * .55), v = 8 + 3.5 * s; botTouchBall(d2[0] * v, d2[1] * v); }
      chase(); if (M.t > .9) abort(); return;
    }
    if (!M.did) {
      if (dB > 1.7) return abort(); M.did = true;
      if (M.kind === 'past') { const d2 = rotv(dx, dz, M.side * .6), v = 9.5 + 4 * s; botTouchBall(d2[0] * v, d2[1] * v); }                 // toca por fora e corre atrás
      else if (M.kind === 'cut') { const d2 = rotv(dx, dz, M.side * 1.9), v = 6 + 2 * s; botTouchBall(d2[0] * v, d2[1] * v); }                  // corte: puxa a bola e muda de direção
      else if (M.kind === 'chip') { const v = 7.2 + 1.5 * s; botTouchBall(dx * v, dz * v, 8.4, 'chip'); }                                      // chapéu por cima
    }
    chase(); if (M.t > (M.kind === 'chip' ? 1 : .9)) abort();
  }

  /* ============================== regras: gol, lateral, escanteio, tiro de meta ============================== */
  function checkRules() {
    if (S.state !== 'play') return; if (S.x1 && !S.x1.own) return; const bx = ball.x - cx, bz = ball.z, sd = Math.sign(bz);
    if (Math.abs(bz) > HL + R * .9) {
      if (Math.abs(bx) < GW - R * .5 && ball.y < GH - R * .4) return goal(sd);
      return outGoalLine(sd);
    }
    if (Math.abs(bx) > HW + R * .9) outTouch(Math.sign(bx));
  }
  function goal(sd) {
    if (S.x1) return x1Goal(sd);
    if (sd < 0) { S.state = 'wait'; S.timer = 2.2; S.restartKind = 'center'; banner('GOL CONTRA!', 1500); snd.cheer(.6); stadium.goalRipple(sd); if (S.mode === 'pen') resolveShot('goal'); return; }
    S.state = 'wait'; S.timer = 3.4; S.restartKind = 'center'; S.goals++; stadium.goalRipple(sd); stadium.cheerUp(1.3); snd.net(); snd.cheer(1.2); snd.whistle();
    let tg = null; for (const t of targets) if (S.mode === 'train' && Math.abs(ball.x - (cx + t.sx * (GW - 1.0))) < .85 && Math.abs(ball.y - t.y) < .65) { tg = t; t.flash = 1; }
    banner(tg ? 'ALVO! · GOOOL!' : 'GOOOL!', 2000); if (S.mode === 'pen') resolveShot('goal'); updateScoreHud();
    if (fx && fx.emit) fx.emit(ball.x, 1.5, ball.z - 1, 40, { color: [1, .85, .4], speed: 5, up: 4, life: 1.1, size: .2 });
  }
  function outTouch(sx) { if (S.x1) return x1OutTouch(sx); if (S.mode === 'pen') return missPen(); S.state = 'wait'; S.timer = 1.4; S.restartKind = 'lateral'; S.restartX = sx; S.restartZ = clamp(ball.z, -HL + 4, HL - 4); banner('LATERAL', 1100); snd.whistle(); }
  function outGoalLine(sd) {
    if (S.x1) return x1OutEnd(sd);
    if (S.mode === 'pen') return missPen();
    S.state = 'wait'; S.timer = 1.5; snd.whistle(); S.restartEnd = sd; S.restartX = Math.sign(ball.x - cx) || 1;
    if (sd > 0 && S.lastTeam === 1) { S.restartKind = 'corner'; banner('ESCANTEIO · SEU', 1200); }          // o goleiro desviou para fora: escanteio SEU
    else if (sd > 0) { S.restartKind = 'goalkick'; banner('TIRO DE META · ADVERSÁRIO', 1200); }
    else { S.restartKind = 'goalkick'; banner('TIRO DE META · SEU', 1200); }                                  // saiu pelo fundo do SEU lado: tiro de meta seu
  }
  function missPen() { const P = S.pen; if (P && !P.resolved && P.kicked) { banner(S.hitPost ? 'NA TRAVE!' : 'PARA FORA!', 1200); resolveShot('miss'); } S.state = 'wait'; S.timer = 99; }
  function doRestart() {
    if (S.x1) return x1Restart();
    const m = me(), k = S.restartKind; S.state = 'play'; S.free = 0; ball.frozen = false; S.hitPost = false; S.sp = null; S.thr = null; S.pk = null;
    if (k === 'center') { resetBall(false); return; }
    if (k === 'lateral') { S.sp = 'lateral'; const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, S.restartZ); S.spX = ball.x; S.spZ = ball.z; place(m, cx + sx * (HW + 1.0), S.restartZ, -sx * PI / 2); }
    else if (k === 'corner') { const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, HL - .35); place(m, cx + sx * (HW + .9), HL + .7, Math.atan2(-sx * 1.2, -1)); S.lastTeam = 0; }   // escanteio SEU, no lado do gol adversário
    else if (k === 'goalkick' && S.restartEnd < 0) { placeKeeper(); ball.place(cx + (Math.random() - .5) * 4, R, -HL + 5.5); place(m, cx, -HL + 3.2, 0); S.lastTeam = 0; }   // tiro de meta SEU: bola na sua pequena área
    else if (k === 'goalkick') { ball.place(cx + (Math.random() - .5) * 4, R, HL - 5.5); place(m, cx, 6, PI); placeKeeper(); const g = S.gk; if (g && S.keeperOn) { g.x = ball.x; g.z = ball.z + 1.15; S.gkState.kicking = true; setTimeout(() => { if (S.state !== 'play' || S.mode !== 'train') return; const l = L(g); if (l) l.play('shot'); else gkKickImpact(KS[0]); }, 900); } }
  }

  /* ============================== por quadro ============================== */
  function update(dt) {
    dt = Math.min(dt, .05); S.t += dt; S.clock += dt; const m = me(); if (!m) return;
    if (S.sp === 'lateral' && !S.thr && !S.ch && (Math.hypot(ball.x - S.spX, ball.z - S.spZ) > 1.2 || Math.abs(m.x - cx) < HW - .8)) S.sp = null;   // a mão só vale na cobrança do lateral: saiu do ponto, acabou
    S.lock = Math.max(0, S.lock - dt); S.drib = Math.max(0, S.drib - dt); S.free += dt; S.kickT = Math.max(0, S.kickT - dt); S.noCtl = Math.max(0, S.noCtl - dt); L(m); for (const K of KS) K.g && L(K.g);
    camFollow(dt, m); syncWheel();
    // carga do chute
    if (S.ch) { const c = S.ch, K = KICK[c.kind]; c.t += dt; const K2 = api.keysDown, kx = (K2.has('o') ? 1 : 0) - (K2.has('u') ? 1 : 0), ky = (K2.has('i') ? 1 : 0) - (K2.has('n') ? 1 : 0); if (kx || ky) { c.spin = clamp(c.spin + kx * dt * 2.5, -1, 1); c.lift = clamp(c.lift + ky * dt * 2.5, -1, 1); }
      const p = clamp(c.t / K.full, 0, 1); el('chgF').style.width = p * 100 + '%'; el('chgV').textContent = Math.round(lerp(K.v0, K.v1, Math.max(.24, p)) * 3.6) + ' km/h'; el('chgU').style.left = 50 + c.spin * 42 + '%'; el('chgU').style.top = 50 - c.lift * 38 + '%'; }
    // mira: ponto fixo no centro; o anel mostra a precisão do chute AGORA (verde = exato, vermelho = vai fugir da mira)
    { const tg = aimTarget(), ay = tg ? aimYaw(tg) : m.yaw, bx = ball.x - m.x, bz = ball.z - m.z, db = Math.hypot(bx, bz), near = db < 2.4 && ball.y < m.y + 1.6;
      const acc = near ? accuracy({ d: db, p: S.ch ? clamp(S.ch.t / KICK[S.ch.kind].full, 0, 1) : .55, sp: Math.hypot(m.vx, m.vz), runV: RUNV, grounded: m.grounded, fr: db < .6 ? 1 : (bx * Math.sin(m.yaw) + bz * Math.cos(m.yaw)) / db, mis: Math.abs(angDiff(ay, m.yaw)), weak: false }) : 0;
      const sz = near ? Math.round(10 + Math.pow(1 - acc, 1.2) * 60) + 'px' : '0px'; $xr.style.width = sz; $xr.style.height = sz; $xr.style.opacity = near ? '.9' : '0'; $xr.style.borderColor = acc > .86 ? '#43e08a' : acc > .55 ? '#ffd24a' : '#ff5a4a'; }
    // física da bola + contatos + condução
    if (!ball.frozen) {
      ball.step(dt);
      if (!(S.mode === 'pen' && S.pen && !S.pen.kicked) && (!S.ctl || S.cin) && !S.thr) bodyContact(m, false); if (owns()) for (const K of KS) if (K.g && K.on() && K.st && K.st.mode !== 'hold' && K.st.mode !== 'throw') bodyContact(K.g, true);
      if (S.x1 && S.x1.bot && S.bot) bodyContact(S.bot.a, false);
      feet(dt, m);
    } else feet(dt, m);
    if (S.thr) { const l = L(m), a = l && l.anims.find(x => x.name === 'throwin'); if (a && a.t > .1) { ball.frozen = true; l.handsPos(tmpP); ball.place(tmpP.x, Math.max(R, tmpP.y + .12), tmpP.z); ball.frozen = true; } }
    syncMesh(dt);
    // anel de cobrança quando a bola está parada num reinício
    const idle = ball.speed < .4 && ball.y < R + .05; ringM.position.set(ball.x, .05, ball.z); ringM.material.opacity = idle ? .45 + Math.sin(S.t * 6) * .2 : 0;
    { const rg = totem.userData.ring; if (rg) rg.material.opacity = .4 + Math.sin(S.t * 3) * .2; if ((S.t * 4 | 0) !== S._sx) { S._sx = S.t * 4 | 0; if (S.xq && Date.now() - S.xq > 90000) { S.xq = 0; banner('Ninguém entrou na fila', 1400); } sx1Refresh(); } }
    if (S.x1) { x1Tick(dt); if (S.x1 && S.x1.bot) botTick(dt); } checkRules(); for (const K of KS) if (K.g) gkUpdate(K, dt); stadium.crowdFollow && stadium.crowdFollow(ball);
    // estados de espera
    if (S.state === 'wait') { S.timer -= dt; if (S.timer <= 0 && S.mode !== 'pen') doRestart(); }
    if (S.mode === 'pen' && S.pen) penaltyTick(dt);
    for (const t of targets) { t.flash = Math.max(0, t.flash - dt * 1.5); t.m.material.opacity = .6 + t.flash * .4 + Math.sin(S.t * 3 + t.sx) * .1; t.m.scale.setScalar(1 + t.flash * .6); }
    if (S.mode === 'train' && Math.floor(S.clock * 2) !== S._c) { S._c = Math.floor(S.clock * 2); stadium.setScore({ a: S.goals, b: S.saved, time: fmt(S.clock), label: 'TREINO LIVRE', na: 'GOLS', nb: 'DEFESAS' }); }
  }
  function penaltyTick(dt) {
    const P = S.pen; if (P.phase === 'ready' && P.kicked) { P.phase = 'flight'; P.t = 0; }
    if (P.phase === 'flight') { P.t += dt; const settled = ball.speed < .6 && ball.y < R + .1; if (!P.resolved && (P.t > 5 || (settled && P.t > 1.2))) { banner(S.hitPost ? 'NA TRAVE!' : 'PARA FORA!', 1000); resolveShot('miss'); } }
    if (P.phase === 'flight' && S.state === 'wait' && !P.resolved && S.timer < 98) { /* gol/saída já resolveu */ }
    if (P.phase === 'result') { P.t += dt; if (P.t > 2.4) { if (P.round >= P.total) { P.phase = 'over'; P.t = 0; banner(`RESULTADO: ${P.goals}/${P.total}`, 3500); setTimeout(() => { if (S.mode === 'pen' && S.pen === P) setMode('train'); }, 4200); } else { S.state = 'play'; penaltySetup(); } } }
  }
  function onRelease(kind) { if (kind === 'drib') return trapRelease(); if (S.ch && S.ch.kind === kind) release(); }
  /* entrada: devolve true se o jogo de futebol tratou a ação */
  function act(name) {
    const k = NAMES[name]; if (!k) return false; if (k === 'drib') return dribble(); return press(k);
  }
  // soltar botões / teclas e arrastar para efeito e altura
  for (const [id, kind] of [['bAtk', 'shot'], ['bLas', 'pass'], ['bSup', 'cross']]) {
    const b = document.getElementById(id); if (!b) continue;
    b.addEventListener('pointerdown', e => { if (S.ch) { S.ch.pid = e.pointerId; S.ch.x0 = e.clientX; S.ch.y0 = e.clientY; } });
    b.addEventListener('pointerup', () => onRelease(kind)); b.addEventListener('pointercancel', () => onRelease(kind));
  }
  addEventListener('pointermove', e => { const c = S.ch; if (!c || c.pid !== e.pointerId || c.x0 == null) return; c.spin = clamp((e.clientX - c.x0) / 55, -1, 1); c.lift = clamp(-(e.clientY - c.y0) / 55, -1, 1); });
  addEventListener('keydown', e => { if (S.tr && S.tr.mode === 'drib' && S.tr.held && /^[1-8]$/.test(e.key)) { S.tr.pick = DRB[+e.key - 1].g; S.tr.pickT = S.tr.t; setSel(+e.key - 1); } });
  addEventListener('keyup', e => { const kk = e.key.toLowerCase(), k = KEYS[kk]; if (k) onRelease(k); else if (kk === 'r') trapRelease(); });
  { const b = document.getElementById('bVel');   // botão do raio: soltar = fim do domínio; arrastar = direção do primeiro toque
    if (b) { b.addEventListener('pointerdown', e => { S.ptrB = { pid: e.pointerId, x0: e.clientX, y0: e.clientY }; }); b.addEventListener('pointerup', () => trapRelease()); b.addEventListener('pointercancel', () => trapRelease()); }
    addEventListener('pointermove', e => {
      const t = S.tr, p = S.ptrB; if (!t || !p || p.pid !== e.pointerId || !api.camera) return; const ex = e.clientX - p.x0, ey = e.clientY - p.y0, ln = Math.hypot(ex, ey);
      if (t.mode === 'drib') { dragWheel(t, ex, ey, ln); return; }   // bola no pé: arrastar escolhe o drible na roda
      if (ln < 22) { t.dx = t.dz = null; return; }
      const cam = api.camera; cam.updateMatrixWorld(); cam.getWorldDirection(vD); const fl = Math.hypot(vD.x, vD.z) || 1, fxx = vD.x / fl, fzz = vD.z / fl, e0 = cam.matrixWorld.elements, rl = Math.hypot(e0[0], e0[2]) || 1, rxx = e0[0] / rl, rzz = e0[2] / rl;
      t.dx = (fxx * -ey + rxx * ex) / ln; t.dz = (fzz * -ey + rzz * ex) / ln;
    });
  }
  // clique do mouse no campo = chute leve
  api.setKeeper = g => { S.gk = g; KS[0] = { g, st: null, sd: 1, on: () => S.keeperOn || !!S.x1 }; placeKeeper(); };
  api.setKeeper2 = g => { KS[1] = { g, st: null, sd: -1, on: () => !!S.x1 }; placeKeeper(KS[1]); };
  function start(mode) { setMode(mode || 'train'); }
  function dispose() { botClear(); for (const e of [$sc, $chg, $spt, $spi, $xh, $xr, $drw, css, $sx1, $sx1b]) e.remove(); scene.remove(mesh, blob, ringM, totem); for (const t of targets) scene.remove(t.m); }
  return { x1Pack, x1Recv, x1Same, x1Rot: () => !!S.x1 && !S.x1.host, rotS, update, act, start, setMode, ball, S, dispose, resetBall, onRelease, L, me, preview(name, t, foot) { const l = L(me()); if (!l) return; l.preview = name ? { name, t, foot } : null; if (!name) l.stop(); } };
}
