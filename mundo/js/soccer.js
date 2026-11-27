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
const KICK = {   // velocidade (m/s) mínima→máxima, elevação base e alcance do efeito, tempo de carga
  shot: { v0: 9, v1: 33, el: 5, elUp: 24, elDn: 4, spin: 46, full: .95, label: 'CHUTE' },
  pass: { v0: 5.5, v1: 20, el: 1.2, elUp: 10, elDn: 0, spin: 12, full: .7, label: 'PASSE' },
  cross: { v0: 11, v1: 26, el: 36, elUp: 48, elDn: 24, spin: 34, full: .85, label: 'CRUZAMENTO' },
  chip: { v0: 9, v1: 27, el: 30, elUp: 44, elDn: 20, spin: 18, full: .8, label: 'LANÇAMENTO' },
  head: { v0: 7, v1: 19, el: -4, elUp: 12, elDn: -14, spin: 8, full: .6, label: 'CABECEIO' },
};
const NAMES = { punch: 'shot', kick: 'shot', laser: 'pass', super: 'cross', extra: 'drib' };
const KEYS = { h: 'shot', j: 'shot', k: 'pass', l: 'cross', q: 'cross' };

export function createSoccer(api) {
  const { scene, stadium, audio, banner, fx } = api, ball = new BallPhys(), actors = api.actors;
  ball.colliders = stadium.bcols;
  const S = { mode: 'train', state: 'play', timer: 0, last: null, lastTeam: 0, goals: 0, shots: 0, saved: 0, maxV: 0, keeperOn: true, ch: null, lock: 0, drib: 0, t: 0, clock: 0, restartKind: '', free: 0, targets: true, tHit: 0, pen: null, gk: null, gkState: null, whistleT: 0, hold: null, kickT: 0, noCtl: 0, ctl: 0, ph: 0, lastStep: -1, sp: null, thr: null, pk: null, trapT: 0 };
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
  const targets = []; for (const [sx, y] of [[-1, 2.0], [1, 2.0], [-1, .65], [1, .65]]) { const m = new THREE.Mesh(new THREE.RingGeometry(.42, .54, 28), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: .75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })); m.position.set(cx + sx * (GW - 1.0), y, HL - .15); scene.add(m); targets.push({ m, sx, y, flash: 0 }); }

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
#scRing{position:fixed;left:50%;top:50%;width:0;height:0;transform:translate(-50%,-50%);box-sizing:border-box;border-radius:50%;border:2px solid #ffd24a;z-index:29;pointer-events:none;opacity:0;transition:width .12s,height .12s,opacity .15s,border-color .15s}`;
  document.head.appendChild(css);
  const mk = (tag, id, html, parent = document.body) => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; parent.appendChild(e); return e; };
  const $sc = mk('div', 'sc', '<small id="scL">TREINO</small><b id="scA">0</b><small>GOLS</small><span id="scX"></span>');
  const $chg = mk('div', 'chg', '<div class="bar"><i id="chgF"></i></div><div class="lb"><span id="chgK">CHUTE</span><span id="chgV"></span></div><div class="pad"><u id="chgU"></u></div><div class="lb"><span>◄ efeito ►</span><span>▲ altura ▼</span></div>');
  const $spt = mk('div', 'spt', '<button id="spTrain" class="on">TREINO</button><button id="spPen">PÊNALTIS</button><button id="spGk">GOLEIRO: SIM</button><button id="spRst">REPOR BOLA</button>');
  const $spi = mk('div', 'spi', api.touch ? 'CHUTE: segure e solte · arraste o dedo no botão: efeito e altura · ponto no centro = mira · RAIO: segure p/ dominar; com a bola, segure o RAIO e mova o analógico: círculo = giro · trás→frente = cobertinha · esq→dir / dir→esq = corte · frente→trás = puxada' : 'J/H chute · K passe · L cruzar · R domínio (segure; com a bola: R + setas = dribles) · segure para carregar · U/O efeito · I/N altura · ponto no centro = mira · RAIO: segure p/ dominar; com a bola, segure o RAIO e mova o analógico: círculo = giro · trás→frente = cobertinha · esq→dir / dir→esq = corte · frente→trás = puxada');
  { const st = document.createElement('style'); st.textContent = '#scMv{position:fixed;left:50%;top:calc(96px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:31;padding:5px 14px;border-radius:999px;background:rgba(255,210,74,.95);color:#111;font:900 14px system-ui;letter-spacing:.08em;pointer-events:none;opacity:0;transition:opacity .25s}'; document.head.appendChild(st); }
  const $mv = mk('div', 'scMv', ''); let mvT = 0;
  const showMove = t => { $mv.textContent = t; $mv.style.opacity = 1; clearTimeout(mvT); mvT = setTimeout(() => { $mv.style.opacity = 0; }, 1300); };
  const $xh = mk('div', 'scAim', ''), $xr = mk('div', 'scRing', '');   // v161: ponto de mira no centro da tela + anel que mostra a precisão
  const el = id => document.getElementById(id);
  el('spTrain').onclick = () => setMode('train'); el('spPen').onclick = () => setMode('pen'); el('spRst').onclick = () => resetBall(true);
  el('spGk').onclick = () => { S.keeperOn = !S.keeperOn; el('spGk').textContent = 'GOLEIRO: ' + (S.keeperOn ? 'SIM' : 'NÃO'); if (S.gk) { S.gk.hero.object.visible = S.keeperOn; } placeKeeper(); };

  /* ============================== utilidades de jogo ============================== */
  const me = () => api.me();
  function touchBall(a) { S.last = a; S.lastTeam = a === me() ? 0 : 1; S.free = 0; }
  function place(a, x, z, yaw) { a.x = x; a.z = z; a.y = 0; a.vx = a.vz = a.vy = 0; a.grounded = true; if (yaw !== undefined) { a.yaw = yaw; if (a === me()) api.setCamYaw(yaw); } }
  const spotKick = HL - 10.5;
  function resetBall(manual) {
    const m = me(); S.state = 'play'; S.hitPost = false; S.pen && (S.pen.phase = S.pen.phase === 'over' ? 'over' : S.pen.phase);
    if (S.mode === 'pen' && S.pen) { penaltySetup(); return; }
    ball.frozen = false; ball.place(cx, R, 0); place(m, cx, -6, 0); placeKeeper(); S.free = 0; if (manual) banner('Bola no centro', 700);
  }
  function placeKeeper() {
    const g = S.gk; if (!g) return; g.hero.object.visible = S.keeperOn; g.hidden = !S.keeperOn; if (!S.keeperOn) { g.x = cx; g.z = HL + 30; return; }
    g.x = cx; g.z = HL - 1.2; g.y = 0; g.vx = g.vz = g.vy = 0; g.grounded = true; g.yaw = PI; g.alive = true; S.gkState = { mode: 'ready', t: 0, dive: null, plan: null, cool: 0, think: 0 }; const gl = L(g); if (gl) { gl.stop(); gl.setTilt(0, false, 30); gl.setDivePose(null); gl.setReady(true); }
  }
  function setMode(m) {
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
    const A = el('scA'), X = el('scX'); if (S.mode === 'pen' && S.pen) { A.textContent = S.pen.goals; X.innerHTML = '<span class="pn">' + Array.from({ length: S.pen.total }, (_, i) => `<i class="${S.pen.res[i] === 1 ? 'g' : S.pen.res[i] === 0 ? 'm' : ''}"></i>`).join('') + '</span>'; }
    else { A.textContent = S.goals; X.innerHTML = '<small>CHUTES ' + S.shots + ' · MÁX ' + Math.round(S.maxV * 3.6) + ' km/h</small>'; }
    stadium.setScore({ a: S.mode === 'pen' && S.pen ? S.pen.goals : S.goals, b: S.saved, time: fmt(S.clock), label: S.mode === 'pen' ? 'PÊNALTIS' : 'TREINO LIVRE', na: 'GOLS', nb: 'DEFESAS' });
  }
  const fmt = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  /* ============================== animações (camada procedural por cima do clipe) ============================== */
  const layers = new Map(), tmpP = new THREE.Vector3(), tmpF = new THREE.Vector3(), RUNV = 7.2;
  function L(a) { if (!a || !a.hero) return null; let l = layers.get(a); if (!l && a.hero.atlasRig) { l = new SoccerLayer(a.hero.atlasRig); l.onEvent = (e, an) => animEvent(a, e, an); layers.set(a, l); } return l; }
  function animEvent(a, e, an) {
    if (a === me()) { if (e === 'impact' && S.pk && an.name === S.pk.anim) { const k = S.pk; S.pk = null; doKick(k.kind, k.p, k.spin, k.lift, k.foot); } else if (e === 'release' && S.thr) throwRelease(); }
    else if (a === S.gk && S.gkState) { if (e === 'release' && S.gkState.mode === 'throw') gkRelease(); else if (e === 'impact' && S.gkState.kicking) gkKickImpact(); }
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
    const v = lerp(K.v0, K.v1, p) * (.9 + .1 * q);
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
    snd.kick(p); S.maxV = Math.max(S.maxV, v);
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
    S.tr = { t: 0, held: true, rel: null, done: false, dx: null, dz: null, h: [], lunged: false }; return true;
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
    S.tcd = Math.max(0, (S.tcd || 0) - dt);
    if (!ok) { S.ctl = 0; S.car = false; S.hd = 0; S.stp = null; S.pin = null; S.tr = null; S.mv = null; S.rdash = false; return; }
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
    if (tr && S.car && tr.held && !S.mv && !m.dash && !tr.frz && sp > 2.5) { tr.frz = true; S.rdash = true; const ux = vxm / sp, uz = vzm / sp; m.dash = { segs: [{ x0: m.x, z0: m.z, x1: m.x + ux * sp, z1: m.z + uz * sp, du: 1, hold: 0 }], i: 0, t: 0, h: 0 }; }
    if (tr && tr.held && !tr.done && atFeet && !S.mv && !m.dash && (sp < 2.5 || S.pin) && !S.stp) {          // parado com o raio apertado: o jogador fica no lugar enquanto faz o gesto
      if (!S.pin) S.pin = { x: m.x, z: m.z }; m.x = S.pin.x; m.z = S.pin.z; if (m.hero && m.hero.object) { m.hero.object.position.x = m.x; m.hero.object.position.z = m.z; }
    } else S.pin = null;
    if (tr && !tr.done) {
      if (l && !tr.lunged && !S.car && ball.speed > 1.5 && d > 1.4) { tr.lunged = true; lunge(m); }
      const cam = api.camera; let cy = 0; if (cam) { cam.getWorldDirection(vD); cy = Math.atan2(vD.x, vD.z); }
      const sc = Math.sin(cy), cc = Math.cos(cy); tr.h.push([S.clock, want ? -mv[0] * cc + mv[1] * sc : 0, want ? mv[0] * sc + mv[1] * cc : 0]); while (tr.h.length && S.clock - tr.h[0][0] > 1.2) tr.h.shift();
      const g = (S.car || atFeet) && !S.mv && !S.stp && S.mvCd <= 0 ? gesture(tr.h) : null; if (g) { tr.done = true; tr.h.length = 0; startMove(g, m, cy, S.pin ? 0 : vxm, S.pin ? 0 : vzm); }
    }
    // --- domínio pedido no botão: amortece a bola que chega (chão, coxa ou peito) e a deixa onde o jogador quer ---
    if (tr && !tr.done && d < Math.min(2.3, 1.15 + rs * dt * 1.3) && ball.y < 1.95 && S.tcd <= 0 && (!S.car || ball.y > .5) && !S.mv && ((toward > .8 && rs > 2) || (rs < 2.2 && ball.y > .35) || (tr.lunged && (d < 1.3 || !m.dash) && d < 2.3) || (ball.speed > .6 && rs > .6 && d < 1.4 && ball.y < .6))) {
      const tdx = tr.dx != null ? tr.dx : want ? hx : 0, tdz = tr.dz != null ? tr.dz : want ? hz : 0, push = (tdx || tdz) ? .5 + (tr.dx != null ? .8 : mag) * .9 : .15;
      const dsh = !!m.dash && !S.mv, bvx = dsh ? 0 : vxm, bvz = dsh ? 0 : vzm, qx = dsh ? ball.vx : rvx, qz = dsh ? ball.vz : rvz; if (dsh) { m.dash = null; S.rdash = false; }   // chegou na bola: a corrida programada acaba
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
    S.cobT = Math.max(0, (S.cobT || 0) - dt);
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
  function lunge(m) {
    const V = 8.6; let tgt = null;
    for (let t = .15; t <= 1.4; t += .05) { const f = Math.max(0, 1 - .12 * t), px = ball.x + ball.vx * t * f, pz = ball.z + ball.vz * t * f, dd = Math.hypot(px - m.x, pz - m.z); if (dd <= V * t + .3) { tgt = { x: px, z: pz, t, dd }; break; } }
    if (!tgt || tgt.dd < .8) return;
    const ux = (tgt.x - m.x) / tgt.dd, uz = (tgt.z - m.z) / tgt.dd, stop = Math.max(0, tgt.dd - .1);
    m.dash = { segs: [{ x0: m.x, z0: m.z, x1: m.x + ux * stop, z1: m.z + uz * stop, du: Math.max(.12, stop / V), hold: 0 }], i: 0, t: 0 };
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
  const MVN = { giro: 'GIRO', cober: 'COBERTINHA', puxada: 'PUXADA' };
  function startMove(g, m, cy, vxm, vzm) {
    showMove(g.k === 'corte' ? (g.sg > 0 ? 'CORTE PELA ESQUERDA' : 'CORTE PELA DIREITA') : MVN[g.k]); if (!S.fp) S.fp = { R: { v: 0, dv: 0 }, L: { v: 0, dv: 0 } }; S.cph = 1; S.pin = null;
    const bx = Math.sin(m.yaw), bz = Math.cos(m.yaw), lx = Math.cos(cy), lz = -Math.sin(cy);     // frente do corpo e ESQUERDA da tela (mundo)
    const P = { x: m.x, z: m.z }, l = L(m), lim = (x, z) => ({ x: clamp(x, cx - HW - 1.5, cx + HW + 1.5), z: clamp(z, -HL - 1.5, HL + 1.5) });
    const segs = []; let cur = P; const add = (x, z, du) => { const q = lim(x, z); segs.push({ x0: cur.x, z0: cur.z, x1: q.x, z1: q.z, du, hold: 0 }); cur = q; };
    if (g.k === 'cober') {                       // cobertinha: o pé passa por baixo e levanta a bola, que sobe e cai à frente; o corpo segue
      if (ball.y < .4 && Math.hypot(ball.x - m.x, ball.z - m.z) < 1.5) {
        const dir = Math.hypot(vxm, vzm) > .5 ? [vxm / Math.hypot(vxm, vzm), vzm / Math.hypot(vxm, vzm)] : [bx, bz];
        ball.vx = vxm + dir[0] * .6; ball.vz = vzm + dir[1] * .6; ball.vy = 4.7; ball.wx = ball.wz = 0; S.cobT = .35; S.car = false; touchBall(m); if (l) l.play('touch', { foot: 'R', scale: .8 });
        S.mv = { k: 'cober', t: 0, dur: .2, side: 0 }; S.mvCd = .6;
      } return;
    }
    if (g.k === 'corte') {                       // corta para o lado e volta para a linha de onde saiu
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

  /* ============================== goleiro ============================== */
  function predict(maxT = 1.6) {   // onde a bola cruza o plano do gol (simulação rápida)
    const b = new BallPhys(); Object.assign(b, { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, wx: ball.wx, wy: ball.wy, wz: ball.wz, colliders: [] });
    for (let t = 0; t < maxT; t += 1 / 60) { b.step(1 / 60); if (b.z >= HL - .1) return { x: b.x, y: b.y, t }; if (b.speed < .3) break; } return null;
  }
  function gkSetMode(st, mode) { st.mode = mode; st.t = 0; }
  function gkUpdate(dt) {
    const g = S.gk, st = S.gkState; if (!g || !st) return; const br = g.brain, l = L(g), rig = g.hero.atlasRig; br.mx = br.mz = 0;
    if (!S.keeperOn) return; if (!l) return; const skill = S.mode === 'pen' ? .5 : .6; st.cool -= dt; st.think -= dt; st.t += dt;
    const toB = Math.atan2(ball.x - g.x, ball.z - g.z); g.aimT = .2; g.yaw += angDiff(toB, g.yaw) * Math.min(1, 10 * dt);
    const hp = tmpP, hold = () => { l.handsPos(hp); ball.frozen = true; ball.place(hp.x, Math.max(R, hp.y), hp.z); ball.frozen = true; };
    if (st.mode === 'hold') { rig.forceSpd = 0; l.setReady(false); hold(); if (st.t > .95) { gkSetMode(st, 'throw'); st.toss = S.mode === 'train'; l.play('gkthrow'); } return; }
    if (st.mode === 'throw') { rig.forceSpd = 0; if (ball.frozen) hold(); if (st.t > .95) { gkSetMode(st, 'ready'); l.setReady(true); } return; }
    if (st.mode === 'down') { rig.forceSpd = 0; if (st.t > .55) { gkSetMode(st, 'getup'); l.setTilt(0, false, 8); l.setDivePose(null); l.play('getup'); } return; }
    if (st.mode === 'getup') { rig.forceSpd = 0; if (st.t > .7) { gkSetMode(st, 'ready'); l.setReady(true); } return; }
    if (st.mode === 'dive') {
      const D = st.dive; D.t += dt; const k = clamp(D.t / D.dur, 0, 1); g.x = clamp(D.x0 + (D.x1 - D.x0) * (1 - (1 - k) * (1 - k)), cx - GW + .2, cx + GW - .2);
      if (g.grounded && D.t > .18 && !D.landed) { D.landed = true; l.setTilt(D.sgn * 84, true, 10); }
      if (k >= 1 && g.grounded) { D.hold += dt; if (D.hold > .1) gkSetMode(st, 'down'); }
      if (D.t > D.dur + 1) gkSetMode(st, 'down');
      gkSave(true, D); return;
    }
    // ----- pronto / corrida -----
    const gx = cx, gz = HL, bdx = ball.x - gx, bdz = ball.z - gz, bd = Math.hypot(bdx, bdz) || 1, out = clamp(bd * .075, .5, 4.2);
    let tx = clamp(gx + bdx / bd * out * 1.3, cx - GW + .6, cx + GW - .6), tz = clamp(gz + bdz / bd * out, HL - 4.4, HL - .5), run = false;
    // bola solta perto da área: sai e pega
    const hd = Math.hypot(ball.x - me().x, ball.z - me().z);
    if (S.state === 'play' && S.mode === 'train' && S.last !== g && ball.speed < 7 && ball.y < .7 && ball.z > HL - 14 && Math.abs(ball.x - cx) < 17 && hd > 6 && !S.ctl) { tx = ball.x; tz = ball.z; run = true; }
    if (st.plan) { /* seguindo uma jogada */ }
    else if (st.think <= 0 && ball.vz > 3 && ball.speed > 7 && S.last === me() && st.cool <= 0) {
      st.think = .06; const pr = predict();
      if (pr && Math.abs(pr.x - cx) < GW + 1 && pr.y < GH + .5 && pr.t > .08) { const err = (Math.random() - .5) * (1 - skill) * 7; st.plan = { x: clamp(pr.x + err, cx - GW - .3, cx + GW + .3), y: pr.y + (Math.random() - .5) * (1 - skill) * 1.2, t: pr.t, age: 0, react: .16 + (1 - skill) * .4 }; }
    }
    if (st.plan) {
      const P = st.plan; P.age += dt; const rem = P.t - P.age, dist = Math.abs(P.x - g.x);
      if (P.age >= P.react) {
        if (dist < 1.0 && P.y < 1.9) { tx = P.x; tz = Math.max(tz, HL - 1.2); }
        else if (dist / 5.4 < Math.max(.06, rem - .06) && P.y < 1.5) { tx = P.x; run = false; br.mx = Math.sign(P.x - g.x); br.mz = 0; st.stepping = true; }
        else { startDive(P); st.plan = null; return; }
      }
      if (rem < -.5) st.plan = null;
    }
    const lat = g.vx;
    if (!run) { rig.forceSpd = 0; l.setReady(true); l.setShuffle(Math.sign(lat) * (Math.cos(g.yaw) < 0 ? 1 : -1) || 0, Math.abs(g.vx) + Math.abs(g.vz)); g.aimT = .2; }
    else { rig.forceSpd = null; l.setReady(false); g.aimT = 0; l.setShuffle(0, 0); }
    if (!br.mx) { const ex = tx - g.x, ez = tz - g.z, el = Math.hypot(ex, ez); if (el > .25) { const sc = run ? 1 : Math.min(1, el * 1.4); br.mx = ex / el * sc; br.mz = ez / el * sc; } }
    gkSave(false, null);
  }
  function startDive(P) {
    const g = S.gk, st = S.gkState, l = L(g); if (!l) return; const dx = clamp(P.x, cx - GW + .3, cx + GW - .3) - g.x, dirW = Math.sign(dx) || 1;
    const rightX = Math.cos(g.yaw), toRight = dirW * rightX > 0, sgn = toRight ? 1 : -1, kind = P.y < .75 ? 'low' : P.y < 1.65 ? 'mid' : 'high', ang = kind === 'low' ? 76 : kind === 'mid' ? 64 : 48;
    st.dive = { t: 0, dur: clamp(Math.abs(dx) / 5.6, .32, .85), x0: g.x, x1: g.x + dx, sgn, kind, hold: 0, landed: false }; gkSetMode(st, 'dive'); st.cool = 1.6; g.grounded = false; g.vy = kind === 'low' ? 3 : kind === 'mid' ? 4.4 : 5.8;
    l.setReady(false); l.setDivePose(kind); l.setTilt(sgn * ang, false, 13); g.hero.atlasRig.forceSpd = 0;
  }
  function gkSave(diving, D) {   // encaixa ou espalma
    const g = S.gk, st = S.gkState, l = L(g); if (ball.frozen || S.last === g || ball.speed < .5) return;
    const ext = diving ? 1.1 : .35, dirx = diving ? (D.x1 - D.x0 >= 0 ? 1 : -1) : 0, hx = g.x + dirx * ext, hy = g.y + (diving ? (D.kind === 'low' ? .7 : D.kind === 'mid' ? 1.3 : 2.0) : 1.25), hz = g.z;
    const dd = Math.hypot(ball.x - hx, ball.y - hy, ball.z - hz); if (dd > (diving ? 1.5 : 1.25)) return;
    const sp = ball.speed, pCatch = clamp(1.05 - sp / 22, .12, .95) * (S.mode === 'pen' ? .8 : .9), catchable = sp < 9 || (sp < 19 && Math.random() < pCatch);
    S.saved++; resolveShot('save'); S.hitPost = false; updateScoreHud();
    if (catchable) { ball.vx = ball.vy = ball.vz = 0; ball.frozen = true; banner('DEFESA!', 900); snd.save(); stadium.cheerUp(.25); if (diving) { st.dive.hold = 9; } l.setTilt(0, false, 9); l.setDivePose(null); l.play('catch'); gkSetMode(st, 'hold'); st.throwing = false; }
    else { const nx = (ball.x - hx) / (dd || 1), out = Math.sign(ball.x - cx) || (Math.random() < .5 ? -1 : 1); ball.vx = (nx * .45 + out * .55) * sp * .5; ball.vz = -Math.abs(ball.vz) * .4 - 2; ball.vy = Math.abs(ball.vy) * .4 + 2.8; banner('ESPALMOU!', 800); snd.save(); touchBall(g); if (!diving) l.play('punch'); if (diving) st.dive.hold = 0; }
    if (!diving) st.plan = null;
  }
  function gkRelease() {   // arremesso do goleiro depois de encaixar
    const g = S.gk, st = S.gkState; if (!ball.frozen) return; ball.frozen = false; const dir = (Math.random() - .5) * .8, sd = S.mode === 'train' ? 1 : 0, short = Math.random() < .35, v = short ? 11 : 18, el = d2r(short ? 12 : 38);
    ball.launch(Math.sin(dir) * v * Math.cos(el), v * Math.sin(el), -Math.cos(dir) * v * Math.cos(el), 0, 0, 0); touchBall(g); snd.kick(.4); S.noCtl = .3;
  }
  function gkKickImpact() { const g = S.gk, st = S.gkState; st.kicking = false; ball.frozen = false; const dir = (Math.random() - .5) * .7, v = 22; ball.launch(Math.sin(dir) * v * .85, v * .52, -Math.cos(dir) * v * .85, 0, 0, 0); touchBall(g); snd.kick(.8); }
  function resolveShot(res) {   // só os pênaltis precisam do resultado de cada cobrança
    const P = S.pen; if (!P || P.phase !== 'flight' && P.phase !== 'ready' || P.resolved) return; if (P.phase === 'ready' && !P.kicked) return;
    P.resolved = true; P.res[P.round] = res === 'goal' ? 1 : 0; if (res === 'goal') P.goals++; P.round++; P.phase = 'result'; P.t = 0; updateScoreHud();
  }

  /* ============================== regras: gol, lateral, escanteio, tiro de meta ============================== */
  function checkRules() {
    if (S.state !== 'play') return; const bx = ball.x - cx, bz = ball.z, sd = Math.sign(bz);
    if (Math.abs(bz) > HL + R * .9) {
      if (Math.abs(bx) < GW - R * .5 && ball.y < GH - R * .4) return goal(sd);
      return outGoalLine(sd);
    }
    if (Math.abs(bx) > HW + R * .9) outTouch(Math.sign(bx));
  }
  function goal(sd) {
    if (sd < 0) { S.state = 'wait'; S.timer = 2.2; S.restartKind = 'center'; banner('GOL CONTRA!', 1500); snd.cheer(.6); stadium.goalRipple(sd); if (S.mode === 'pen') resolveShot('goal'); return; }
    S.state = 'wait'; S.timer = 3.4; S.restartKind = 'center'; S.goals++; stadium.goalRipple(sd); stadium.cheerUp(1.3); snd.net(); snd.cheer(1.2); snd.whistle();
    let tg = null; for (const t of targets) if (S.mode === 'train' && Math.abs(ball.x - (cx + t.sx * (GW - 1.0))) < .85 && Math.abs(ball.y - t.y) < .65) { tg = t; t.flash = 1; }
    banner(tg ? 'ALVO! · GOOOL!' : 'GOOOL!', 2000); if (S.mode === 'pen') resolveShot('goal'); updateScoreHud();
    if (fx && fx.emit) fx.emit(ball.x, 1.5, ball.z - 1, 40, { color: [1, .85, .4], speed: 5, up: 4, life: 1.1, size: .2 });
  }
  function outTouch(sx) { if (S.mode === 'pen') return missPen(); S.state = 'wait'; S.timer = 1.4; S.restartKind = 'lateral'; S.restartX = sx; S.restartZ = clamp(ball.z, -HL + 4, HL - 4); banner('LATERAL', 1100); snd.whistle(); }
  function outGoalLine(sd) {
    if (S.mode === 'pen') return missPen();
    S.state = 'wait'; S.timer = 1.5; snd.whistle();
    if (sd > 0) { S.restartKind = 'goalkick'; banner('TIRO DE META', 1100); }
    else { S.restartKind = 'corner'; S.restartX = Math.sign(ball.x - cx) || 1; banner('ESCANTEIO', 1100); }
  }
  function missPen() { const P = S.pen; if (P && !P.resolved && P.kicked) { banner(S.hitPost ? 'NA TRAVE!' : 'PARA FORA!', 1200); resolveShot('miss'); } S.state = 'wait'; S.timer = 99; }
  function doRestart() {
    const m = me(), k = S.restartKind; S.state = 'play'; S.free = 0; ball.frozen = false; S.hitPost = false; S.sp = null; S.thr = null; S.pk = null;
    if (k === 'center') { resetBall(false); return; }
    if (k === 'lateral') { S.sp = 'lateral'; const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, S.restartZ); S.spX = ball.x; S.spZ = ball.z; place(m, cx + sx * (HW + 1.0), S.restartZ, -sx * PI / 2); }
    else if (k === 'corner') { const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, -HL + .35); place(m, cx + sx * (HW + .9), -HL - .7, Math.atan2(-sx * 1.2, 1)); }
    else if (k === 'goalkick') { ball.place(cx + (Math.random() - .5) * 4, R, HL - 5.5); place(m, cx, 6, PI); placeKeeper(); const g = S.gk; if (g && S.keeperOn) { g.x = ball.x; g.z = ball.z + 1.15; S.gkState.kicking = true; setTimeout(() => { if (S.state !== 'play' || S.mode !== 'train') return; const l = L(g); if (l) l.play('shot'); else gkKickImpact(); }, 900); } }
  }

  /* ============================== por quadro ============================== */
  function update(dt) {
    dt = Math.min(dt, .05); S.t += dt; S.clock += dt; const m = me(); if (!m) return;
    if (S.sp === 'lateral' && !S.thr && !S.ch && (Math.hypot(ball.x - S.spX, ball.z - S.spZ) > 1.2 || Math.abs(m.x - cx) < HW - .8)) S.sp = null;   // a mão só vale na cobrança do lateral: saiu do ponto, acabou
    S.lock = Math.max(0, S.lock - dt); S.drib = Math.max(0, S.drib - dt); S.free += dt; S.kickT = Math.max(0, S.kickT - dt); S.noCtl = Math.max(0, S.noCtl - dt); L(m); S.gk && L(S.gk);
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
      if (!(S.mode === 'pen' && S.pen && !S.pen.kicked) && (!S.ctl || S.cin) && !S.thr) bodyContact(m, false); const g = S.gk; if (g && S.keeperOn && S.gkState && S.gkState.mode !== 'hold' && S.gkState.mode !== 'throw') bodyContact(g, true);
      feet(dt, m);
    } else feet(dt, m);
    if (S.thr) { const l = L(m), a = l && l.anims.find(x => x.name === 'throwin'); if (a && a.t > .1) { ball.frozen = true; l.handsPos(tmpP); ball.place(tmpP.x, Math.max(R, tmpP.y + .12), tmpP.z); ball.frozen = true; } }
    syncMesh(dt);
    // anel de cobrança quando a bola está parada num reinício
    const idle = ball.speed < .4 && ball.y < R + .05; ringM.position.set(ball.x, .05, ball.z); ringM.material.opacity = idle ? .45 + Math.sin(S.t * 6) * .2 : 0;
    checkRules(); if (S.gk && S.gk.brain === S.gk.brain) gkUpdate(dt); stadium.crowdFollow && stadium.crowdFollow(ball);
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
  addEventListener('keyup', e => { const kk = e.key.toLowerCase(), k = KEYS[kk]; if (k) onRelease(k); else if (kk === 'r') trapRelease(); });
  { const b = document.getElementById('bVel');   // botão do raio: soltar = fim do domínio; arrastar = direção do primeiro toque
    if (b) { b.addEventListener('pointerdown', e => { S.ptrB = { pid: e.pointerId, x0: e.clientX, y0: e.clientY }; }); b.addEventListener('pointerup', () => trapRelease()); b.addEventListener('pointercancel', () => trapRelease()); }
    addEventListener('pointermove', e => {
      const t = S.tr, p = S.ptrB; if (!t || !p || p.pid !== e.pointerId || !api.camera) return; const ex = e.clientX - p.x0, ey = e.clientY - p.y0, ln = Math.hypot(ex, ey);
      if (ln < 22) { t.dx = t.dz = null; return; }
      const cam = api.camera; cam.updateMatrixWorld(); cam.getWorldDirection(vD); const fl = Math.hypot(vD.x, vD.z) || 1, fxx = vD.x / fl, fzz = vD.z / fl, e0 = cam.matrixWorld.elements, rl = Math.hypot(e0[0], e0[2]) || 1, rxx = e0[0] / rl, rzz = e0[2] / rl;
      t.dx = (fxx * -ey + rxx * ex) / ln; t.dz = (fzz * -ey + rzz * ex) / ln;
    });
  }
  // clique do mouse no campo = chute leve
  api.setKeeper = g => { S.gk = g; placeKeeper(); };
  function start(mode) { setMode(mode || 'train'); }
  function dispose() { for (const e of [$sc, $chg, $spt, $spi, $xh, $xr, css]) e.remove(); scene.remove(mesh, blob, ringM); for (const t of targets) scene.remove(t.m); }
  return { update, act, start, setMode, ball, S, dispose, resetBall, onRelease, L, me, preview(name, t, foot) { const l = L(me()); if (!l) return; l.preview = name ? { name, t, foot } : null; if (!name) l.stop(); } };
}
