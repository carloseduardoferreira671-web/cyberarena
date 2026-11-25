/* CyberArena · Futebol (v155 · Fase 1) — bola, chute, passe, cruzamento, drible, regras (gol, lateral, escanteio, tiro de meta),
   goleiro bot, Treino e Pênaltis (offline). Usa a física pura de ballphys.js e o estádio de stadium.js.
   O game.js só chama: createSoccer(api) · soccer.update(dt) · soccer.act(nome) — o resto fica aqui. */
import * as THREE from '../lib/three.module.min.js';
import { BallPhys, BALL } from './ballphys.js';
import { FIELD } from './stadium.js';
import { SoccerLayer } from './soccerrig.js';

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
#spi{position:fixed;left:calc(10px + env(safe-area-inset-left,0px));bottom:calc(10px + env(safe-area-inset-bottom,0px));z-index:30;color:#fff;font:700 11px/1.5 system-ui;text-shadow:0 1px 3px #000;pointer-events:none;opacity:.85}`;
  document.head.appendChild(css);
  const mk = (tag, id, html, parent = document.body) => { const e = document.createElement(tag); e.id = id; e.innerHTML = html; parent.appendChild(e); return e; };
  const $sc = mk('div', 'sc', '<small id="scL">TREINO</small><b id="scA">0</b><small>GOLS</small><span id="scX"></span>');
  const $chg = mk('div', 'chg', '<div class="bar"><i id="chgF"></i></div><div class="lb"><span id="chgK">CHUTE</span><span id="chgV"></span></div><div class="pad"><u id="chgU"></u></div><div class="lb"><span>◄ efeito ►</span><span>▲ altura ▼</span></div>');
  const $spt = mk('div', 'spt', '<button id="spTrain" class="on">TREINO</button><button id="spPen">PÊNALTIS</button><button id="spGk">GOLEIRO: SIM</button><button id="spRst">REPOR BOLA</button>');
  const $spi = mk('div', 'spi', api.touch ? 'CHUTE: segure e solte · arraste o dedo no botão: efeito e altura' : 'J/H chute · K passe · L cruzar · R drible · segure para carregar · U/O efeito · I/N altura');
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
  const layers = new Map(), tmpP = new THREE.Vector3(), RUNV = 7.2;
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
  /* escolhe sozinho a animação certa para a situação (bola no chão, alta, no ar; passe curto ou longo; pé mais perto) */
  function chooseAnim(kind, p, lift) {
    const m = me(), air = !m.grounded, by = ball.y - m.y; let anim, k = kind;
    if ((air && by > .7) || by > 1.45) { if (by > 1.3) { anim = 'header'; k = 'head'; } else { anim = 'volley'; k = 'shot'; } }
    else if (kind === 'shot') anim = by > .6 ? 'volley' : 'shot';
    else if (kind === 'pass') { if (lift > .45 || p > .8) { anim = 'chip'; k = 'chip'; } else anim = 'pass'; }
    else anim = 'cross';
    const rx = (ball.x - m.x) * Math.cos(m.yaw) - (ball.z - m.z) * Math.sin(m.yaw);
    return { anim, kind: k, foot: rx > -.08 ? 'R' : 'L' };
  }
  function release() {
    const c = S.ch; if (!c) return; S.ch = null; $chg.classList.remove('on'); const m = me(); if (!m || !m.alive) return;
    const K = KICK[c.kind], p = clamp(Math.max(.24, c.t / K.full), 0, 1);
    if (S.sp === 'lateral') return startThrow(p);
    const ch = chooseAnim(c.kind, p, c.lift), l = L(m);
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
    const reach = air ? 1.5 : 1.6, okH = ball.y < m.y + (air ? 2.5 : 1.45), front = d < .6 || (dx * f0 + dz * f1) / d > .05;
    if (!(d < reach && okH && front)) { snd.whoosh(); return; }
    const K = KICK[kind] || KICK.shot, q = clamp(1 - Math.abs(d - .85) / 1.5, .65, 1);
    let yaw = (kind === 'shot' || kind === 'head') ? aimAssist(m.yaw) : m.yaw; yaw += (1 - q) * .22 * (Math.random() - .5) * 2;
    const v = lerp(K.v0, K.v1, p) * (.9 + .1 * q), lift = liftIn;
    const el = d2r(lift >= 0 ? lerp(K.el, K.elUp, lift) : lerp(K.el, K.elDn, -lift)) + (ball.y > R + .4 ? -.02 : 0);
    const hv = v * Math.cos(el), vy = v * Math.sin(el), dx2 = Math.sin(yaw), dz2 = Math.cos(yaw);
    const wy = spinIn * K.spin * (.45 + .55 * p), bs = lift * (kind === 'cross' || kind === 'chip' ? 16 : 12) * (.5 + p * .5);
    ball.launch(dx2 * hv, vy, dz2 * hv, -bs * dz2, wy, bs * dx2); touchBall(m); S.ctl = 0; S.noCtl = .45;
    snd.kick(p); S.maxV = Math.max(S.maxV, v);
    if (kind === 'shot' || kind === 'head') { S.shots++; }
    if (S.pen) S.pen.kicked = true;
    if (p > .75 && fx && fx.emit) fx.emit(ball.x, ball.y, ball.z, 14, { color: [1, .9, .6], speed: 3.5, life: .35, size: .12, grav: 0 });
    if (p > .8) api.shake(.18);
    updateScoreHud();
  }
  function dribble() {   // drible: arrancada curta com a bola colada (toques curtos e mais rápidos)
    const m = me(); if (!m || !m.alive || S.lock > 0) return true; S.drib = .55; api.doDodge(m);
    const mv = api.readMove(); if (mv[2] > .1) { m.vx += mv[0] / mv[2] * 3.4; m.vz += mv[1] / mv[2] * 3.4; }
    snd.whoosh(); return true;
  }
  /* lateral com as duas mãos */
  function startThrow(p) { const m = me(), l = L(m); S.thr = { p, attach: false }; S.kickT = 1.2; S.noCtl = 1.5; S.ctl = 0; m.busyMove = Math.max(m.busyMove, 1); if (l) l.play('throwin'); else throwRelease(); }
  function throwRelease() {
    const t = S.thr; if (!t) return; S.thr = null; ball.frozen = false; const m = me(), v = lerp(7, 21, t.p), el = d2r(30), yaw = m.yaw;
    ball.launch(Math.sin(yaw) * v * Math.cos(el), v * Math.sin(el), Math.cos(yaw) * v * Math.cos(el), 0, 0, 0); touchBall(m); S.sp = null; snd.kick(.35); S.noCtl = .5;
  }

  /* ============================== condução: a bola quase gruda no pé (sem grudar) ============================== */
  function control(dt, m) {
    const l = L(m), sp = Math.hypot(m.vx, m.vz), dx = ball.x - m.x, dz = ball.z - m.z, d = Math.hypot(dx, dz);
    const ok = S.noCtl <= 0 && S.kickT <= 0 && !S.thr && m.grounded && m.alive && !m.down && S.state === 'play' && S.mode !== 'pen' && !S.pk;
    if (!ok) { S.ctl = 0; return; }
    if (!S.ctl) {
      // domínio: bola vindo na sua direção é amortecida e "cai" no pé
      if (d < 2.3 && ball.y < 1.25 && ball.speed > 4 && ball.speed < 26) {
        const toward = (-dx * (ball.vx - m.vx) - dz * (ball.vz - m.vz)) / (d || 1);
        if (toward > 2.2) { if (!S.trapT) { S.trapT = .45; if (l && !l.busy('trap')) l.play('trap', { foot: (dx * Math.cos(m.yaw) - dz * Math.sin(m.yaw)) > 0 ? 'R' : 'L' }); touchBall(m); }
          const k = Math.exp(-7.5 * dt); ball.vx = m.vx + (ball.vx - m.vx) * k; ball.vz = m.vz + (ball.vz - m.vz) * k; if (ball.vy > 0 && ball.y > R + .08) ball.vy *= .8; }
      }
      if (S.trapT > 0) S.trapT = Math.max(0, S.trapT - dt);
      if (d < 1.6 && ball.y < .55 && ball.speed < sp + 5.2) { S.ctl = 1; S.ph = 0; S.lastStep = -1; touchBall(m); }
      return;
    }
    if (d > 2.8 || ball.y > 1.0) { S.ctl = 0; return; }
    const ms = clamp(sp / RUNV, 0, 1.25), fx = sp > .7 ? m.vx / sp : Math.sin(m.yaw), fz = sp > .7 ? m.vz / sp : Math.cos(m.yaw);
    S.ph += dt * (S.drib > 0 ? 3.6 : 1.05 + sp * .36);
    const cyc = S.ph % 1, pulse = Math.pow(Math.max(0, Math.sin(cyc * PI)), 1.5), base = .74 + ms * .5 + (S.drib > 0 ? .08 : 0), dist = base + pulse * (.1 + .3 * ms);
    const foot = Math.floor(S.ph) % 2 ? 1 : -1, lat = foot * (.16 + .06 * ms) * (1 - pulse * .55);
    const tx = m.x + fx * dist + fz * lat, tz = m.z + fz * dist - fx * lat;
    let vx = m.vx + (tx - ball.x) * 9.5, vz = m.vz + (tz - ball.z) * 9.5; const rvx = vx - m.vx, rvz = vz - m.vz, rl = Math.hypot(rvx, rvz), lim = 5.4 + sp * .45;
    if (rl > lim) { vx = m.vx + rvx / rl * lim; vz = m.vz + rvz / rl * lim; }
    const k = 1 - Math.exp(-(S.drib > 0 ? 18 : 11) * dt); ball.vx += (vx - ball.vx) * k; ball.vz += (vz - ball.vz) * k; if (ball.vy > 0) ball.vy *= .6;
    const step = Math.floor(S.ph); if (step !== S.lastStep) { S.lastStep = step; if (l && sp > 1.3 && !l.busy()) l.play('touch', { foot: foot > 0 ? 'R' : 'L', scale: 1 / (1 + sp * .05) }); }
    S.last = m; S.lastTeam = 0;
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
    if (k === 'lateral') { S.sp = 'lateral'; const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, S.restartZ); place(m, cx + sx * (HW + 1.0), S.restartZ, -sx * PI / 2); }
    else if (k === 'corner') { const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, -HL + .35); place(m, cx + sx * (HW + .9), -HL - .7, Math.atan2(-sx * 1.2, 1)); }
    else if (k === 'goalkick') { ball.place(cx + (Math.random() - .5) * 4, R, HL - 5.5); place(m, cx, 6, PI); placeKeeper(); const g = S.gk; if (g && S.keeperOn) { g.x = ball.x; g.z = ball.z + 1.15; S.gkState.kicking = true; setTimeout(() => { if (S.state !== 'play' || S.mode !== 'train') return; const l = L(g); if (l) l.play('shot'); else gkKickImpact(); }, 900); } }
  }

  /* ============================== por quadro ============================== */
  function update(dt) {
    dt = Math.min(dt, 1 / 30); S.t += dt; S.clock += dt; const m = me(); if (!m) return;
    S.lock = Math.max(0, S.lock - dt); S.drib = Math.max(0, S.drib - dt); S.free += dt; S.kickT = Math.max(0, S.kickT - dt); S.noCtl = Math.max(0, S.noCtl - dt); L(m); S.gk && L(S.gk);
    // carga do chute
    if (S.ch) { const c = S.ch, K = KICK[c.kind]; c.t += dt; const K2 = api.keysDown, kx = (K2.has('o') ? 1 : 0) - (K2.has('u') ? 1 : 0), ky = (K2.has('i') ? 1 : 0) - (K2.has('n') ? 1 : 0); if (kx || ky) { c.spin = clamp(c.spin + kx * dt * 2.5, -1, 1); c.lift = clamp(c.lift + ky * dt * 2.5, -1, 1); }
      const p = clamp(c.t / K.full, 0, 1); el('chgF').style.width = p * 100 + '%'; el('chgV').textContent = Math.round(lerp(K.v0, K.v1, Math.max(.24, p)) * 3.6) + ' km/h'; el('chgU').style.left = 50 + c.spin * 42 + '%'; el('chgU').style.top = 50 - c.lift * 38 + '%'; }
    // física da bola + contatos + condução
    if (!ball.frozen) {
      ball.step(dt);
      if (!(S.mode === 'pen' && S.pen && !S.pen.kicked) && !S.ctl && !S.thr) bodyContact(m, false); const g = S.gk; if (g && S.keeperOn && S.gkState && S.gkState.mode !== 'hold' && S.gkState.mode !== 'throw') bodyContact(g, true);
      control(dt, m);
    } else control(dt, m);
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
  function onRelease(kind) { if (kind === 'drib') return; if (S.ch && S.ch.kind === kind) release(); }
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
  addEventListener('keyup', e => { const k = KEYS[e.key.toLowerCase()]; if (k) onRelease(k); });
  // clique do mouse no campo = chute leve
  api.setKeeper = g => { S.gk = g; placeKeeper(); };
  function start(mode) { setMode(mode || 'train'); }
  function dispose() { for (const e of [$sc, $chg, $spt, $spi, css]) e.remove(); scene.remove(mesh, blob, ringM); for (const t of targets) scene.remove(t.m); }
  return { update, act, start, setMode, ball, S, dispose, resetBall, onRelease, L, me, preview(name, t, foot) { const l = L(me()); if (!l) return; l.preview = name ? { name, t, foot } : null; if (!name) l.stop(); } };
}
