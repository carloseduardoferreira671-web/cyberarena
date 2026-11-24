/* CyberArena · Futebol (v155 · Fase 1) — bola, chute, passe, cruzamento, drible, regras (gol, lateral, escanteio, tiro de meta),
   goleiro bot, Treino e Pênaltis (offline). Usa a física pura de ballphys.js e o estádio de stadium.js.
   O game.js só chama: createSoccer(api) · soccer.update(dt) · soccer.act(nome) — o resto fica aqui. */
import * as THREE from '../lib/three.module.min.js';
import { BallPhys, BALL } from './ballphys.js';
import { FIELD } from './stadium.js';

const { HL, HW, GW, GH, CX } = FIELD, R = BALL.R, PI = Math.PI, TAU = PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t, d2r = d => d * PI / 180;
const angDiff = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
const KICK = {   // velocidade (m/s) mínima→máxima, elevação base e alcance do efeito, tempo de carga
  shot: { v0: 9, v1: 33, el: 5, elUp: 24, elDn: 4, spin: 46, full: .95, label: 'CHUTE' },
  pass: { v0: 5.5, v1: 20, el: 1.5, elUp: 14, elDn: 0, spin: 12, full: .7, label: 'PASSE' },
  cross: { v0: 11, v1: 26, el: 36, elUp: 48, elDn: 24, spin: 34, full: .85, label: 'CRUZAMENTO' },
  head: { v0: 7, v1: 19, el: -4, elUp: 12, elDn: -14, spin: 8, full: .6, label: 'CABECEIO' },
};
const NAMES = { punch: 'shot', kick: 'shot', laser: 'pass', super: 'cross', extra: 'drib' };
const KEYS = { h: 'shot', j: 'shot', k: 'pass', l: 'cross', q: 'cross' };

export function createSoccer(api) {
  const { scene, stadium, audio, banner, fx } = api, ball = new BallPhys(), actors = api.actors;
  ball.colliders = stadium.bcols;
  const S = { mode: 'train', state: 'play', timer: 0, last: null, lastTeam: 0, goals: 0, shots: 0, saved: 0, maxV: 0, keeperOn: true, ch: null, lock: 0, drib: 0, t: 0, clock: 0, restartKind: '', free: 0, targets: true, tHit: 0, pen: null, gk: null, gkState: null, whistleT: 0, hold: null };
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
    g.x = cx; g.z = HL - 1.2; g.y = 0; g.vx = g.vz = g.vy = 0; g.grounded = true; g.yaw = PI; g.alive = true; S.gkState = { dive: null, hold: 0, react: 0, tgt: null, cool: 0, think: 0 };
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

  /* ============================== chute / passe / cruzamento / cabeceio ============================== */
  function press(kind) {
    const m = me(); if (!m || !m.alive || S.lock > 0 || m.down || m.stunT > 0) return true;
    if (S.mode === 'pen' && S.pen && (S.pen.kicked || S.pen.phase !== 'ready')) return true;
    if (S.ch) return true; S.ch = { kind, t: 0, spin: 0, lift: 0, x0: null, y0: null }; $chg.classList.add('on'); el('chgK').textContent = KICK[kind].label; return true;
  }
  function release() {
    const c = S.ch; if (!c) return; S.ch = null; $chg.classList.remove('on'); const m = me(); if (!m || !m.alive) return;
    let kind = c.kind, K = KICK[kind];
    const p = clamp(Math.max(.24, c.t / K.full), 0, 1);
    let r; try { r = m.play('kick'); } catch (e) { r = null; } const imp = r && r.impact ? Math.min(r.impact, .3) : .2, dur = r && r.duration ? r.duration : .6;
    S.lock = dur * .55; m.busyMove = Math.max(m.busyMove, dur * .25); S.kickSpin = c.spin; S.kickLift = c.lift;
    m.pending.push({ t: imp, fn: () => doKick(kind, p, c.spin, c.lift) });
  }
  function aimAssist(yaw, dist) {   // alinha levemente ao gol adversário se você olha para ele
    const dx = cx - ball.x, dz = HL - ball.z, d = Math.hypot(dx, dz); if (d > 62 || d < 4) return yaw;
    const to = Math.atan2(dx, dz), diff = angDiff(to, yaw); if (Math.abs(diff) > d2r(32)) return yaw; return yaw + diff * .55;
  }
  function doKick(kind, p, spinIn, liftIn) {
    const m = me(); if (!m) return;
    const f0 = Math.sin(m.yaw), f1 = Math.cos(m.yaw), dx = ball.x - m.x, dz = ball.z - m.z, d = Math.hypot(dx, dz);
    const air = !m.grounded, high = ball.y > m.y + 1.15;
    if (air && high && kind === 'shot') kind = 'head';
    const reach = air ? 1.45 : 1.5, okH = ball.y < m.y + (air ? 2.5 : 1.35), front = d < .55 || (dx * f0 + dz * f1) / d > .1;
    if (!(d < reach && okH && front)) { snd.whoosh(); return; }
    const K = KICK[kind], q = clamp(1 - Math.abs(d - .85) / 1.4, .6, 1);
    let yaw = m.yaw; if (kind === 'shot' || kind === 'head') yaw = aimAssist(yaw, d);
    yaw += (1 - q) * .3 * (Math.random() - .5) * 2;
    const v = lerp(K.v0, K.v1, p) * (.88 + .12 * q), lift = liftIn;
    const el = d2r(lift >= 0 ? lerp(K.el, K.elUp, lift) : lerp(K.el, K.elDn, -lift)) + (ball.y > R + .4 ? -.02 : 0);
    const hv = v * Math.cos(el), vy = v * Math.sin(el), dx2 = Math.sin(yaw), dz2 = Math.cos(yaw);
    const wy = spinIn * K.spin * (.45 + .55 * p), bs = lift * (kind === 'cross' ? 16 : 12) * (.5 + p * .5);
    ball.launch(dx2 * hv, vy, dz2 * hv, -bs * dz2, wy, bs * dx2); touchBall(m);
    snd.kick(p); S.maxV = Math.max(S.maxV, v);
    if (kind === 'shot' || kind === 'head') { S.shots++; if (S.pen) S.pen.kicked = true; }
    if (S.pen && kind !== 'pass') S.pen.kicked = true;
    if (p > .75 && fx && fx.emit) fx.emit(ball.x, ball.y, ball.z, 14, { color: [1, .9, .6], speed: 3.5, life: .35, size: .12, grav: 0 });
    if (p > .8) api.shake(.18);
    updateScoreHud();
  }
  function dribble() {
    const m = me(); if (!m || !m.alive || S.lock > 0) return true; S.drib = .45; api.doDodge(m);
    const mv = api.readMove(); if (mv[2] > .1) { m.vx += mv[0] / mv[2] * 3.2; m.vz += mv[1] / mv[2] * 3.2; }
    snd.whoosh(); return true;
  }

  /* ============================== contato corpo × bola ============================== */
  function bodyContact(a, isKeeper) {
    const dx = ball.x - a.x, dz = ball.z - a.z, d = Math.hypot(dx, dz) || 1e-6, rr = .46 + R * .95, top = a.y + (a.crouch ? 1.2 : 1.95), bot = a.y - R;
    if (d >= rr || ball.y > top || ball.y < bot) return false;
    const nx = dx / d, nz = dz / d, vrel = (ball.vx - a.vx) * nx + (ball.vz - a.vz) * nz; ball.x = a.x + nx * rr; ball.z = a.z + nz * rr;
    if (vrel >= 0) return true;
    const an = a.vx * nx + a.vz * nz, chest = ball.y > a.y + .85; let vn = an + (-vrel) * (chest ? .38 : .2);
    if (!isKeeper && an > 1.2 && ball.y < a.y + .7) vn = Math.max(vn, an * (S.drib > 0 ? 1.12 : 1.3) + .7);   // toque de condução
    const cur = ball.vx * nx + ball.vz * nz, dv = vn - cur; ball.vx += nx * dv; ball.vz += nz * dv;
    if (chest && ball.vy < 0) ball.vy = -ball.vy * .3; touchBall(a); if (Math.abs(dv) > 3) snd.bounce(Math.abs(dv));
    return true;
  }

  /* ============================== goleiro ============================== */
  function predict(maxT = 1.6) {   // onde a bola cruza o plano do gol (simulação rápida)
    const b = new BallPhys(); Object.assign(b, { x: ball.x, y: ball.y, z: ball.z, vx: ball.vx, vy: ball.vy, vz: ball.vz, wx: ball.wx, wy: ball.wy, wz: ball.wz, colliders: [] });
    for (let t = 0; t < maxT; t += 1 / 60) { b.step(1 / 60); if (b.z >= HL - .1) return { x: b.x, y: b.y, t }; if (b.speed < .3) break; } return null;
  }
  function brainUpdate(dt) {
    const g = S.gk, st = S.gkState; if (!g || !st || !S.keeperOn || S.state !== 'play' && S.state !== 'wait') { if (g && g.brain) { g.brain.mx = g.brain.mz = 0; } return; }
    const skill = S.mode === 'pen' ? .5 : .6; st.cool -= dt; st.think -= dt;
    g.aimT = .2; const toB = Math.atan2(ball.x - g.x, ball.z - g.z); g.yaw += angDiff(toB, g.yaw) * Math.min(1, 9 * dt);
    if (st.hold > 0) { st.hold -= dt; ball.frozen = true; ball.place(g.x + Math.sin(g.yaw) * .35, g.y + 1.25, g.z + Math.cos(g.yaw) * .35); ball.frozen = true; g.brain.mx = g.brain.mz = 0;
      if (st.hold <= 0) { ball.frozen = false; const dir = S.mode === 'pen' ? PI * 0 : (Math.random() - .5) * .6, v = 15 + Math.random() * 5; ball.launch(Math.sin(dir) * v * .8, v * .55, -Math.cos(dir) * v * .8, 0, 0, 0); touchBall(g); snd.kick(.6); g.play('kick'); }
      return; }
    if (st.dive) { const D = st.dive; D.t += dt; const k = clamp(D.t / D.dur, 0, 1); g.x = clamp(D.x0 + (D.x1 - D.x0) * (1 - (1 - k) * (1 - k)), cx - GW + .2, cx + GW - .2); g.brain.mx = g.brain.mz = 0; if (k >= 1) { D.hold = (D.hold || 0) + dt; if (D.hold > .5) st.dive = null; } }
    // posição: bissetriz entre a bola e o centro do gol
    const gx = cx, gz = HL, bdx = ball.x - gx, bdz = ball.z - gz, bd = Math.hypot(bdx, bdz) || 1, out = clamp(bd * .075, .5, 4.2), tx = clamp(gx + bdx / bd * out * 1.3, cx - GW + .6, cx + GW - .6), tz = clamp(gz + bdz / bd * out, HL - 4.4, HL - .5);
    let mx = 0, mz = 0;
    if (!st.dive) {
      const ex = tx - g.x, ez = tz - g.z, el = Math.hypot(ex, ez); if (el > .25) { mx = ex / el * Math.min(1, el * 1.4); mz = ez / el * Math.min(1, el * 1.4); }
      // chute vindo: prever e mergulhar
      if (st.think <= 0 && ball.vz > 3 && ball.speed > 8 && S.last === me() && st.cool <= 0) {
        st.think = .08; const pr = predict(); if (pr && Math.abs(pr.x - cx) < GW + 1.2 && pr.y < GH + .6) {
          const err = (Math.random() - .5) * (1 - skill) * 7.5, px = pr.x + err, dist = Math.abs(px - g.x);
          if (dist > .9 || pr.y > 1.7) { if (pr.t > .1) { const rt = .16 + (1 - skill) * .4; if (!st.react) st.react = rt; st.tgt = { x: px, y: pr.y, t: pr.t }; } }
        } }
      if (st.react) { st.react -= dt; if (st.react <= 0 && st.tgt) { st.react = 0; const T = st.tgt, dx = clamp(T.x, cx - GW + .3, cx + GW - .3) - g.x, dir = Math.sign(dx) || 1, hi = T.y > 1.5; st.dive = { t: 0, dur: clamp(Math.abs(dx) / 5.6, .3, .85), x0: g.x, x1: g.x + dx }; st.cool = 1.8; st.tgt = null;
          g.play(hi ? 'jump' : (dir > 0 ? 'dodge_r' : 'dodge_l')); g.vy = hi ? 5.4 : 3.4; g.grounded = false; } }
    }
    g.brain.mx = mx; g.brain.mz = mz;
    // defesa: encaixa ou espalma
    const dx = ball.x - g.x, dz = ball.z - g.z, dy = ball.y - (g.y + 1.0), dd = Math.hypot(dx, dz);
    if (!ball.frozen && dd < 1.0 && Math.abs(dy) < 1.2 && S.last !== g && ball.speed > .5) {
      const sp = ball.speed, catchable = sp < 15 && ball.y > .25 && Math.random() < skill * .85 + (sp < 8 ? .25 : 0);
      if (catchable) { st.hold = 1.1; ball.frozen = true; ball.vx = ball.vy = ball.vz = 0; S.saved++; banner('DEFESA!', 900); snd.save(); S.hitPost = false; resolveShot('save'); }
      else { const nx = dx / (dd || 1), out2 = Math.sign(ball.x - cx) || (Math.random() < .5 ? -1 : 1); ball.vx = (nx * .5 + out2 * .5) * sp * .5; ball.vz = -Math.abs(ball.vz) * .45 - 2; ball.vy = Math.abs(ball.vy) * .4 + 2.5; S.saved++; banner('ESPALMOU!', 800); snd.save(); touchBall(g); resolveShot('save'); }
      updateScoreHud();
    }
    // bola parada perto do goleiro (tiro de meta / rebote): ele chuta
  }
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
    const m = me(), k = S.restartKind; S.state = 'play'; S.free = 0; ball.frozen = false; S.hitPost = false;
    if (k === 'center') { resetBall(false); return; }
    if (k === 'lateral') { const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, S.restartZ); place(m, cx + sx * (HW + 1.0), S.restartZ, -sx * PI / 2); }
    else if (k === 'corner') { const sx = S.restartX; ball.place(cx + sx * (HW - .35), R, -HL + .35); place(m, cx + sx * (HW + .9), -HL - .7, Math.atan2(-sx * 1.2, 1)); }
    else if (k === 'goalkick') { ball.place(cx + (Math.random() - .5) * 4, R, HL - 5.5); place(m, cx, 6, PI); placeKeeper(); const g = S.gk; if (g && S.keeperOn) { g.x = cx; g.z = HL - 3.2; setTimeout(() => { if (S.state !== 'play' || S.mode !== 'train') return; const dir = (Math.random() - .5) * .7; g.play('kick'); ball.launch(Math.sin(dir) * 13, 11, -Math.cos(dir) * 13, 0, 0, 0); touchBall(g); snd.kick(.6); }, 900); } }
  }

  /* ============================== por quadro ============================== */
  function update(dt) {
    dt = Math.min(dt, 1 / 30); S.t += dt; S.clock += dt; const m = me(); if (!m) return;
    S.lock = Math.max(0, S.lock - dt); S.drib = Math.max(0, S.drib - dt); S.free += dt;
    // carga do chute
    if (S.ch) { const c = S.ch, K = KICK[c.kind]; c.t += dt; const K2 = api.keysDown, kx = (K2.has('o') ? 1 : 0) - (K2.has('u') ? 1 : 0), ky = (K2.has('i') ? 1 : 0) - (K2.has('n') ? 1 : 0); if (kx || ky) { c.spin = clamp(c.spin + kx * dt * 2.5, -1, 1); c.lift = clamp(c.lift + ky * dt * 2.5, -1, 1); }
      const p = clamp(c.t / K.full, 0, 1); el('chgF').style.width = p * 100 + '%'; el('chgV').textContent = Math.round(lerp(K.v0, K.v1, Math.max(.24, p)) * 3.6) + ' km/h'; el('chgU').style.left = 50 + c.spin * 42 + '%'; el('chgU').style.top = 50 - c.lift * 38 + '%'; }
    // física da bola + contatos
    if (!ball.frozen) {
      ball.step(dt);
      bodyContact(m, false); const g = S.gk; if (g && S.keeperOn && !(S.gkState && S.gkState.hold > 0)) bodyContact(g, true);
    }
    // condução (drible): puxa a bola para a frente do jogador enquanto o drible dura
    if (S.drib > 0) { const dx = ball.x - m.x, dz = ball.z - m.z; if (Math.hypot(dx, dz) < 1.9 && ball.y < m.y + .9) { const f = Math.hypot(m.vx, m.vz) || 1, tx = m.x + m.vx / f * .8, tz = m.z + m.vz / f * .8; ball.vx = lerp(ball.vx, m.vx * 1.05 + (tx - ball.x) * 6, .35); ball.vz = lerp(ball.vz, m.vz * 1.05 + (tz - ball.z) * 6, .35); } }
    syncMesh(dt);
    // anel de cobrança quando a bola está parada num reinício
    const idle = ball.speed < .4 && ball.y < R + .05; ringM.position.set(ball.x, .05, ball.z); ringM.material.opacity = idle ? .45 + Math.sin(S.t * 6) * .2 : 0;
    checkRules(); brainUpdate(dt); stadium.crowdFollow && stadium.crowdFollow(ball);
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
  api.setKeeper = g => { S.gk = g; g.brain.update = brainUpdate; placeKeeper(); };
  function start(mode) { setMode(mode || 'train'); }
  function dispose() { for (const e of [$sc, $chg, $spt, $spi, css]) e.remove(); scene.remove(mesh, blob, ringM); for (const t of targets) scene.remove(t.m); }
  return { update, act, start, setMode, ball, S, dispose, resetBall, onRelease };
}
