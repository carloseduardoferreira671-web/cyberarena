/* CyberArena · clipctl (v154) — toca os clipes GRAVADOS dos 3 personagens (Nexus, Atlas, Cyber).
   Mesma interface do antigo FightCtl (update / strike / once / react / fall / getUp / dodge / cancel / zoneWorld / lying)
   mais os recursos novos: variações de golpe, pulo duplo, deslizar, sentar, emotes, escalada, mortal, rolamento. */
import * as THREE from '../lib/three.module.min.js';

/* ---------- clipes a partir do GLB ---------- */
export function buildClips(json, acc) {
  const clips = {}, names = json.nodes.map((n, i) => n.name || ('n' + i));
  for (const a of json.animations || []) {
    const tr = [];
    for (const c of a.channels) {
      const s = a.samplers[c.sampler], t = Float32Array.from(acc(s.input)), v = Float32Array.from(acc(s.output)), nm = names[c.target.node];
      if (c.target.path === 'rotation') tr.push(new THREE.QuaternionKeyframeTrack(nm + '.quaternion', t, v));
      else if (c.target.path === 'translation') tr.push(new THREE.VectorKeyframeTrack(nm + '.position', t, v));
    }
    clips[a.name] = new THREE.AnimationClip(a.name, -1, tr);
  }
  return clips;
}

const rnd = a => a[(Math.random() * a.length) | 0];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- ações semânticas → clipes (lista de candidatos por ordem; vale o primeiro que o personagem tem) ---------- */
/* [candidatos, velocidade, opções]. opções: hold (congela no fim), fi/fo (entrada/saída), loop */
const SEM = {
  CrouchDown: [['Crouch Enter'], 2.2, { fi: .08, fo: .1 }], CrouchUp: [['Crouch Exit'], 2.2, { fi: .08, fo: .1 }],
  JumpStart: [['Jump Start'], 2.1, { fi: .06, fo: .14, cut: .5 }], DoubleJump: [['Double Jump', 'Ninja Jump Double', 'Jump Start'], 1.5, { fi: .05, fo: .15 }],
  Land: [['Jump Land', 'Ninja Jump Land'], 2.4, { fi: .05, fo: .12 }], LandHard: [['Jump Land', 'Ninja Jump Land'], 1.3, { fi: .05, fo: .15 }],
  Roll: [['Roll'], 1.45, { fi: .06, fo: .14 }], Flip: [['Back Flip', 'Jog To Flip', 'Roll', 'Double Jump'], 1.3, { fi: .06, fo: .14 }],
  Vault: [['Jog To Flip', 'Roll', 'Double Jump', 'Jump Start'], 1.5, { fi: .08, fo: .14 }],
  Uppercut: [['Melee Uppercut'], 1.35, { fi: .06, fo: .14 }],
  Cast_Fwd: { nexus: [['Overhand Throw'], 1.5], atlas: [['Bow Rapid Shoot', 'Bow Shoot', 'Overhand Throw'], 1.3], cyber: [['Overhand Throw'], 1.5] },
  Cast_Slam: { nexus: [['Sword Ground Pound Root Motion', 'Melee Combo'], 1.0], atlas: [['Sword Heavy A', 'Sword Aerial Combo'], 1.1], cyber: [['Sword Ground Pound Root Motion', 'Sword Heavy D'], 1.0] },
  Cast_Up: { nexus: [['Melee Uppercut'], .9], atlas: [['Bow Aim Up', 'Lift Air Idle'], 1.0, { hold: true }], cyber: [['Lift Air Idle', 'Ninja Jump Idle'], 1.0, { hold: true }] },
  Channel: { nexus: [['Sword Block', 'Idle'], 1.0, { hold: true, loop: true }], atlas: [['Lift Air Idle', 'Bow Aim Neutral'], 1.0, { hold: true, loop: true }], cyber: [['Lift Air Idle', 'Ninja Jump Idle'], 1.0, { hold: true, loop: true }] },
  Super: { nexus: [['Melee Combo'], 1.15], atlas: [['Sword Heavy Combo'], 1.1], cyber: [['Sword Heavy Combo', 'Melee Combo'], 1.1] },
  Dash: { nexus: [['Sword Dash Root Motion', 'Shield Dash Root Motion'], 1.4], atlas: [['Shield Dash Root Motion', 'Sword Heavy A'], 1.4], cyber: [['Sword Heavy B', 'Sword Ground Pound Root Motion'], 1.3] },
  Chain: { nexus: [['Shield One Shot', 'Overhand Throw'], 1.4], atlas: [['Sword Light B', 'Overhand Throw'], 1.3], cyber: [['Sword Attack', 'Overhand Throw'], 1.3] },
  Omega: { nexus: [['Sword Ground Pound Root Motion', 'Melee Combo'], .9], atlas: [['Sword Heavy A'], .9], cyber: [['Sword Heavy D', 'Sword Ground Pound Root Motion'], .9] },
  Flash: { nexus: [['Overhand Throw'], 1.2], atlas: [['Pistol Aim Neutral', 'Overhand Throw'], 1.0, { hold: true }], cyber: [['Sword Attack', 'Overhand Throw'], 1.1] },
  Wave: { nexus: [['Sitting Nodding', 'Idle'], 1.0], atlas: [['Pistol Idle', 'Idle'], 1.0], cyber: [['Ninja Jump Idle', 'Idle'], 1.0] },
  GetUp_Back: [['Kip Up', 'Lay To Idle'], 1.0, { fi: .1, fo: .15 }],
  PickUp: [['Pick Up Kneeling'], 1.3, { fi: .1, fo: .15 }],
  Plant: [['Farm Plant Seed'], 1.0, { fi: .1, fo: .15 }],
};
/* emotes: id → [candidatos, velocidade, hold?] — a lista mostrada na tela é montada com o que o personagem realmente tem */
export const EMOTES = {
  sit: { label: 'SENTAR', icon: '🪑' }, talk: { label: 'CONVERSAR', icon: '💬' }, nod: { label: 'CONCORDAR', icon: '👍' },
  pickup: { label: 'PEGAR', icon: '✋' }, plant: { label: 'PLANTAR', icon: '🌱' }, flip: { label: 'MORTAL', icon: '🤸' },
  kipup: { label: 'LEVANTE', icon: '⚡' }, bow: { label: 'ARCO', icon: '🏹' }, pistol: { label: 'MIRAR', icon: '🎯' },
  ninja: { label: 'NINJA', icon: '🥷' }, guard: { label: 'GUARDA', icon: '🥊' }, crawl: { label: 'RASTEJAR', icon: '🐛' }, sword: { label: 'ESPADA', icon: '⚔' },
  levit: { label: 'LEVITAR', icon: '✨' }, swim: { label: 'NADAR', icon: '🌊' },
};
const EMOTE_CLIPS = {
  sit: [['Sitting Idle', 'Ground Sit Enter', 'Crouch Idle'], 1], talk: [['Sitting Talking'], 1], nod: [['Sitting Nodding'], 1],
  pickup: [['Pick Up Kneeling'], 1.1], plant: [['Farm Plant Seed'], 1], flip: [['Back Flip', 'Jog To Flip', 'Roll'], 1.15], kipup: [['Kip Up'], 1],
  guard: [['Punch Kick Enter'], 1], bow: [['Bow Notch', 'Bow Aim Neutral'], 1], pistol: [['Pistol Aim Neutral', 'Pistol Idle'], 1], ninja: [['Ninja Jump Idle'], 1],
  crawl: [['Crawl Enter', 'Crawl Backward'], 1], sword: [['Sword Idle', 'Sword Light B'], 1], levit: [['Lift Air Idle'], 1], swim: [['Swim Idle'], 1],
};
const SITTERS = ['Sitting Idle', 'Sitting Idle 02', 'Sitting Idle 03', 'Sitting Talking', 'Sitting Nodding'];

/* combos de punho (3 golpes por corrente). Cada personagem usa o que tem; a corrente é sorteada no 1º golpe */
const CHAINS = {
  nexus: [['Punch Jab', 'Punch Cross', 'Kick'], ['Punch Jab M', 'Punch Cross M', 'Kick M'], ['Melee Hook', 'Melee Uppercut', 'Kick'], ['Punch Jab', 'Melee Hook', 'Kick M'], ['Punch Cross M', 'Melee Hook M', 'Melee Uppercut M']],
  atlas: [['Punch Jab', 'Punch Cross', 'Kick'], ['Punch Jab M', 'Punch Cross M', 'Kick M'], ['Melee Hook', 'Melee Uppercut', 'Kick'], ['Sword Light B', 'Punch Cross', 'Kick M'], ['Punch Cross M', 'Melee Hook M', 'Melee Uppercut M']],
  cyber: [['Melee Hook', 'Melee Uppercut', 'Kick'], ['Melee Hook M', 'Melee Uppercut M', 'Kick M'], ['Melee Hook', 'Melee Knee', 'Kick'], ['Melee Hook M', 'Melee Knee', 'Kick M'], ['Melee Hook M', 'Melee Uppercut M', 'Kick']],
};
const KICKS = ['Melee Knee', 'Melee Knee M'], CPUNCH = ['Melee Uppercut', 'Melee Uppercut M'], SWEEP = ['Slide', 'Slide Start', 'Kick'];
const NAT = { walk: 2.3, jog: 5.0, sprint: 8.0, cwalk: 1.6 };

export class ClipCtl {
  constructor(root, clips, id, k, meta = {}) {
    this.root = root; this.clips = clips; this.id = id; this.k = k; this.meta = meta;
    this.mixer = new THREE.AnimationMixer(root); this.slots = {}; this.t = 0;
    this.ev = null; this.down = null; this.lying = false; this.busyDown = false; this.sitting = null; this.loc = 'Idle'; this.crouchLoc = false;
    this.planned = {}; this.lastPlan = null; this.prevLoc = 'Idle'; this.climbDir = 1; this.chain = null; this.air = { t: 0, was: false }; this.prevSpd = 0; this.cur = null; this.slide = null; this.emoteEv = null;
    this._v = new THREE.Vector3(); this._q = new THREE.Quaternion(); this.bones = {};
    root.traverse(o => { if (o.isBone) this.bones[o.name.replace(/^mixamorig:?/, '')] = o; });
    this.sc = k;
  }
  has(n) { return !!this.clips[n]; }
  pick(list) { for (const n of list) if (this.clips[n]) return n; return null; }
  dur(n) { return this.clips[n] ? this.clips[n].duration : 0; }
  /* ---------- slots (ações do mixer com peso suave) ---------- */
  _slot(n) {
    let s = this.slots[n]; if (s) return s;
    const act = this.mixer.clipAction(this.clips[n]); act.enabled = true; act.setEffectiveWeight(0); act.play(); act.paused = true;
    return this.slots[n] = { n, act, w: 0, tw: 0, fi: .15, fo: .15, on: false };
  }
  _start(s, ts, loop, time = 0) {
    const a = s.act; a.paused = false; a.reset(); a.time = time < 0 ? 0 : time; a.timeScale = ts;
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity); a.clampWhenFinished = !loop; a.play(); s.on = true;
  }
  /* ---------- eventos de uma vez ---------- */
  _playEv(name, ts, o = {}) {
    if (!this.clips[name]) return null; const d = this.clips[name].duration, end = o.end != null ? o.end : d;
    const ev = { n: name, t: o.from || 0, ts, dur: d, end, fi: o.fi ?? .08, fo: o.fo ?? .15, hold: !!o.hold, loop: !!o.loop, kind: o.kind || 'act', started: false, next: o.next || null, cb: o.cb || null };
    this.ev = ev; return ev;
  }
  cancel() { if (this.ev && this.ev.kind !== 'down') this.ev = null; this.slide = null; }
  isBusy() { return !!this.ev || !!this.down; }
  /* semântica → clipe do personagem */
  _sem(name) {
    let v = SEM[name]; if (!v) return null; if (!Array.isArray(v)) v = v[this.id]; if (!v) return null;
    const n = this.pick(v[0]); if (!n) return null; return { n, sp: v[1] || 1, o: v[2] || {} };
  }
  once(name, sp = 1, opt = {}) {
    const m = this._sem(name); if (!m) return null;
    const o = { ...m.o, ...opt }; if (name === 'Channel') o.loop = true;
    const end = o.cut ? Math.min(this.dur(m.n), o.cut) : undefined;
    return this._playEv(m.n, m.sp * (sp || 1), { fi: o.fi, fo: o.fo, hold: o.hold, loop: o.loop, end, kind: o.kind || 'act' });
  }
  /* ---------- golpes ---------- */
  _hit(clip, key) {
    const m = (this.meta[clip] || {}), hs = m.hits || [], foot = /Kick|Knee|Slide/.test(clip);
    let best = null;
    for (const h of hs) { const okL = foot ? h.limb.startsWith('foot') : h.limb.startsWith('hand'); if (okL && (!best || h.z > best.z)) best = h; }
    if (!best && hs.length) best = hs[0];
    const d = m.dur || this.dur(clip);
    return best ? { imp: best.t, reach: clamp(best.z, .3, 1.2) } : { imp: d * .3, reach: .5 };
  }
  plan(key, vsId) {
    let clip;
    if (key === 'punch0' || key === 'punch1' || key === 'punch2') {
      const i = +key.slice(-1); if (i === 0 || !this.chain) { const cs = CHAINS[this.id].filter(c => c.every(n => this.has(n))); this.chain = rnd(cs.length ? cs : [['Melee Hook', 'Melee Uppercut', 'Kick']]); }
      clip = this.chain[i];
    } else if (key === 'kick') clip = this.pick([rnd(KICKS), 'Melee Knee', 'Kick']);
    else if (key === 'cpunch') clip = this.pick([rnd(CPUNCH), 'Melee Uppercut', 'Melee Hook']);
    else if (key === 'sweep') clip = this.pick(SWEEP);
    if (this.airNow && /^(punch|kick)/.test(key)) { const an = this.pick([rnd(['Sword Aerial A', 'Sword Aerial B']), 'Sword Aerial A']); if (an) clip = an; }
    if (!clip || !this.clips[clip]) clip = this.pick(['Melee Hook', 'Kick', 'Overhand Throw', 'Idle']);
    const { imp, reach } = this._hit(clip, key), foot = /Kick|Knee|Slide/.test(clip), d = this.dur(clip);
    const sp = key === 'punch2' ? 1.2 : foot ? 1.2 : 1.32, rec = foot ? .42 : .3, end = Math.min(d, imp + rec);
    const p = { clip, sp, end, dur: end / sp, imp: imp / sp, reach };
    this.planned[key] = p; this.lastPlan = p; return p;
  }
  strike(mv, vsId, target, key) {
    const k = key || Object.keys(this.planned).find(x => this.planned[x] && this.planned[x].used !== true);
    const p = (k && this.planned[k]) || null; if (!p) return;
    this.planned[k].used = true; this.sitting = null; this.slide = null; this.emoteEv = null;
    this._playEv(p.clip, p.sp, { end: p.end, fi: .05, fo: .12, kind: 'atk' });
  }
  /* ---------- reações ---------- */
  react(zone, o = {}) {
    if (this.down) return; this.sitting = null; this.slide = null;
    if (this.airNow && (this.has('Lift Air Hit Left') || this.has('Lift Air Hit Right'))) { const n = this.pick([rnd(['Lift Air Hit Left', 'Lift Air Hit Right'])]); if (n) { this._playEv(n, 1.5, { fi: .04, fo: .14, kind: 'react', end: .6 }); return; } }
    const L = (zone === 'shoulderL'), Rr = (zone === 'shoulderR');
    let list;
    if (o.resist) list = ['Sword Block', 'Hit Chest'];
    else if (L) list = ['Hit Shoulder Left']; else if (Rr) list = ['Hit Shoulder Right'];
    else if (zone === 'head') list = [rnd(['Hit Head', 'Hit Head M'])];
    else if (zone === 'belly') list = [rnd(['Hit Stomach', 'Hit Stomach M'])];
    else if (zone === 'shin') list = [rnd(['Hit Shoulder Left', 'Hit Shoulder Right'])];
    else list = [rnd(['Hit Chest', 'Hit Chest M', rnd(['Hit Shoulder Left', 'Hit Shoulder Right'])])];
    const n = this.pick([...list, 'Hit Chest']); if (!n) return;
    this._playEv(n, o.resist ? 1.5 : 1.45, { fi: .04, fo: .14, kind: 'react', end: o.resist ? .5 : Math.min(this.dur(n), .62) });
  }
  fall(kind) {
    this.sitting = null; this.slide = null; this.emoteEv = null; this.ev = null;
    const air = kind === 'air' || kind === 'lift';
    const n = this.pick(air ? ['Lift Air Fall', 'Hit Knockback'] : ['Hit Knockback', 'Lift Air Fall']); if (!n) return;
    this.down = { phase: 'fall', t: 0, n }; this.lying = true; this.busyDown = true;
  }
  getUp() {
    if (!this.down) { this.lying = false; return; }
    let n = this.pick(this.id === 'atlas' ? ['Kip Up', 'Lay To Idle'] : [rnd(['Kip Up', 'Lay To Idle']), 'Kip Up', 'Lay To Idle']), rev = false;
    if (!n && this.down.n && this.clips[this.down.n]) { n = this.down.n; rev = true; }      // sem clipe de levantar: toca a queda ao contrário
    this.down = n ? { phase: 'up', t: 0, n, rev } : null; if (!n) { this.lying = false; this.busyDown = false; }
  }
  dodge(kind) {
    this.sitting = null; this.slide = null; const k = String(kind || 'l')[0];
    if (k === 'd') { const d0 = this.pick(['Crouch Enter']); if (d0) this._playEv(d0, 2.6, { fi: .04, fo: .1, kind: 'dodge', end: .34 }); return; }
    const n = k === 'r' ? this.pick(['Dodge Right', 'Dodge Left']) : k === 'b' ? this.pick(['Back Flip', 'Roll', 'Dodge Left']) : k === 'f' ? this.pick(['Roll', 'Jog To Flip', 'Dodge Left']) : this.pick(['Dodge Left']);
    if (n) this._playEv(n, n.startsWith('Dodge') ? 1.5 : 1.3, { fi: .05, fo: .14, kind: 'dodge' });
  }
  /* ---------- novos movimentos ---------- */
  doSlide(dur = .9) {
    if (!this.has('Slide') && !this.has('Slide Start')) return this.once('Roll', 1.2);
    this.sitting = null; const s0 = this.pick(['Slide Start']), s1 = this.pick(['Slide']), s2 = this.pick(['Slide Exit']);
    const a = s0 ? this.dur(s0) : 0, c = s2 ? this.dur(s2) : 0, mid = Math.max(.05, dur - a / 2.0 - c / 2.0);
    this.slide = { phase: s0 ? 0 : 1, t: 0, mid, s0, s1, s2 };
  }
  doubleJump() { return this.once('DoubleJump', 1.2); }
  emotes() { return Object.keys(EMOTE_CLIPS).filter(id => this.pick(EMOTE_CLIPS[id][0])).map(id => ({ id, ...EMOTES[id] })); }
  emote(id) {
    const e = EMOTE_CLIPS[id]; if (!e) return 0; if (id === 'sit') return this.sit(true);
    const n = this.pick(e[0]); if (!n) return 0; this.sitting = null;
    const hold = id === 'ninja' || id === 'levit' || id === 'swim' || id === 'sword' || id === 'bow' || id === 'pistol';
    const ev = this._playEv(n, e[1] || 1, { fi: .15, fo: .2, hold, loop: hold, kind: 'emote' }); this.emoteEv = ev; return this.dur(n) / (e[1] || 1);
  }
  emoteDur(id) { const e = EMOTE_CLIPS[id]; const n = e && this.pick(e[0]); return n ? this.dur(n) / (e[1] || 1) : 0; }
  /* sentar: Nexus tem as poses de cadeira (cicla entre elas); Atlas senta no chão; Cyber (sem clipe de sentar) agacha */
  canSit() { return this.has('Sitting Idle') || (this.has('Ground Sit Enter') && this.has('Ground Sit Exit')); } // cadeira (Nexus) ou chão (Atlas); sem animação própria = não senta (nada de ajoelhar)
  seatMode() { return this.has('Sitting Idle') ? 'chair' : this.has('Ground Sit Enter') ? 'ground' : 'kneel'; }
  sit(on) {
    if (on) {
      if (this.sitting || !this.canSit()) return 0; this.ev = null; this.slide = null;
      const mode = this.seatMode(); this.sitting = { mode, t: 0, phase: mode === 'ground' ? 'enter' : 'idle', n: null, cyc: 0 };
      return 1;
    }
    if (!this.sitting) return 0;
    if (this.sitting.mode === 'ground' && this.has('Ground Sit Exit')) { this.sitting.phase = 'exit'; this.sitting.t = 0; }
    else this.sitting = null; return 1;
  }
  /* ---------- posições do corpo para faíscas/efeitos ---------- */
  zoneWorld(zone, out = new THREE.Vector3()) {
    const bn = zone === 'head' ? 'Head' : zone === 'belly' ? 'Spine' : zone === 'shin' ? 'LeftLeg' : 'Spine2', b = this.bones[bn];
    if (!b) return out; b.getWorldPosition(out); this.root.getWorldQuaternion(this._q);
    const fwd = this._v.set(0, 0, 1).applyQuaternion(this._q); fwd.y = 0; fwd.normalize();
    out.addScaledVector(fwd, .06 * this.sc); return out;
  }
  /* ---------- escolha do clipe primário do quadro ---------- */
  _primary(dt, st) {
    const spd = st.spd || 0, lv = st.lv || { x: 0, z: 1 }, back = spd > .6 && lv.z < -Math.abs(lv.x) * .8 - .2;
    // queda / chão / levantar
    if (this.down) {
      const d = this.down; d.t += dt;
      if (d.phase === 'fall') { const dd = this.dur(d.n) / 1.2; if (d.t >= dd) { d.phase = 'lie'; } return { n: d.n, ts: 1.2, loop: false, fi: .06, fo: .1, hold: true, once: d.t < 0.001 || !d._s, start: !d._s && (d._s = true) }; }
      if (d.phase === 'lie') return { n: d.n, ts: 1.2, loop: false, fi: .1, fo: .1, hold: true, noRestart: true };
      if (d.phase === 'up') { const sp = d.rev ? 1.25 : 1, dd = this.dur(d.n) / sp; if (d.t >= dd - .12) { this.down = null; this.lying = false; this.busyDown = false; } else return { n: d.n, ts: d.rev ? -sp : 1, loop: false, fi: .12, fo: .2, start: !d._s && (d._s = true), t0: d.rev ? this.dur(d.n) - .01 : 0 }; }
    }
    if (this.ev) {
      const e = this.ev; if (!e.started) { e.started = true; e.start = true; }
      const dEnd = e.end / Math.abs(e.ts);
      if (!e.loop && !e.hold) { e.t += dt * Math.abs(e.ts); if (e.t >= e.end - 1e-4) { this.ev = null; if (e.cb) e.cb(); } }
      else if (e.hold && !e.loop) { e.t += dt * Math.abs(e.ts); }
      else e.t += dt;
      if (this.ev) return { n: e.n, ts: e.ts, loop: e.loop, fi: e.fi, fo: e.fo, hold: e.hold, start: e.start && !(e.start = false), ev: e };
    }
    // deslizar (sequência)
    if (this.slide) {
      const s = this.slide; s.t += dt; let n, ts = 1.9;
      if (s.phase === 0) { n = s.s0; if (s.t >= this.dur(n) / 2.0) { s.phase = 1; s.t = 0; s.fresh = true; } }
      if (s.phase === 1) { n = s.s1 || s.s0; ts = 1; if (s.t >= s.mid) { s.phase = s.s2 ? 2 : 3; s.t = 0; s.fresh = true; } }
      if (s.phase === 2) { n = s.s2; ts = 1.9; if (s.t >= this.dur(n) / 1.9) s.phase = 3; }
      if (s.phase === 3) { this.slide = null; }
      else { const start = (s.pl !== s.phase); s.pl = s.phase; return { n, ts, loop: s.phase === 1, fi: .08, fo: .12, start, noEnd: true }; }
    }
    if (st.climb) return this._climb(st.climb, dt);
    if (this.sitting) return this._sit(dt, st);
    if (this.emoteEv && !this.ev) this.emoteEv = null;
    if ((st.water || 0) > .35 && this.has('Swim Idle') && !st.air) return { n: 'Swim Idle', ts: clamp(.7 + spd / 6, .7, 1.5), loop: true, fi: .25, fo: .25 };
    // ar
    if (st.air) {
      this.air.t += dt;
      const n = this.pick(this.id === 'cyber' ? ['Ninja Jump Idle', 'Jump'] : ['Jump']);
      if (n) return { n, ts: 1, loop: true, fi: .18, fo: .12 };
    } else this.air.t = 0;
    // chão
    let n, ts = 1;
    if (st.crouch) {
      if (spd > .35) { n = back ? this.pick(['Crouch Backward', 'Crouch Forward']) : this.pick(['Crouch Forward', 'Walk']); ts = clamp(spd / NAT.cwalk, .6, 1.5); }
      else n = this.pick(['Crouch Idle', 'Idle']);
    } else {
      const sw = (cur, up, dn) => cur ? spd > dn : spd > up;
      const wk = sw(this.loc !== 'Idle', .55, .3), jg = sw(this.loc === 'Jog' || this.loc === 'Sprint', 3.4, 2.8), sp = sw(this.loc === 'Sprint', 6.4, 5.6);
      this.loc = !wk ? 'Idle' : sp ? 'Sprint' : jg ? 'Jog' : 'Walk';
      if (this.loc === 'Idle') { n = this.pick(['Idle']); if (this.has('Turn 90 Left') && Math.abs(st.yr || 0) > 2.6 && this.t - (this.turnT || -9) > .7 && !st.crouch) { this.turnT = this.t; const tn = (st.yr || 0) > 0 ? 'Turn 90 Left' : 'Turn 90 Right'; this._playEv(tn, 1.8, { fi: .08, fo: .12, kind: 'turn', end: Math.min(this.dur(tn), .5) }); } }
      else if (this.loc === 'Walk') { n = back ? this.pick(['Walk Backward', 'Walk']) : this.pick(['Walk']); ts = clamp(spd / NAT.walk, .55, 1.6) * (back && n === 'Walk' ? -1 : 1); }
      else if (this.loc === 'Jog') { if (!back && Math.abs(st.yr || 0) > 1.6 && this.has('Jog Forward Lean Left')) { n = st.yr > 0 ? 'Jog Forward Lean Left' : 'Jog Forward Lean Right'; ts = clamp(spd / NAT.jog, .6, 1.5); } else if (back && this.has('Jog Backward')) { n = 'Jog Backward'; ts = clamp(spd / NAT.jog, .6, 1.5); } else { n = this.pick(['Jog Forward', 'Sprint']); ts = clamp(spd / (n === 'Sprint' ? NAT.sprint : NAT.jog), .6, 1.5); } }
      else { n = this.pick(['Sprint', 'Jog Forward']); ts = clamp(spd / (n === 'Sprint' ? NAT.sprint : NAT.jog), .7, 1.4); }
    }
    if (!st.crouch && !st.air) {
      if (this.loc === 'Sprint' && this.prevLoc !== 'Sprint' && this.prevSpd < 4.5 && this.has('Sprint Enter') && !this.ev) this._playEv('Sprint Enter', 1.9, { fi: .08, fo: .18, kind: 'turn', end: .5 });
      if (this.prevLoc === 'Sprint' && this.loc !== 'Sprint' && this.loc !== 'Jog' && this.has('Sprint Exit') && !this.ev) this._playEv('Sprint Exit', 1.7, { fi: .1, fo: .2, kind: 'turn', end: .55 });
    }
    this.prevLoc = this.loc; this.prevSpd = spd;
    return { n: n || 'Idle', ts, loop: true, fi: .2, fo: .2 };
  }
  _climb(cl, dt) {
    const dir = (cl.phase - (this.lastPh ?? cl.phase)); if (Math.abs(dir) > 1e-4) this.climbDir = dir; this.lastPh = cl.phase;
    const up = this.pick(this.climbDir < 0 ? ['Climb Down', 'Climb Up'] : ['Climb Up']), n = cl.over > 0 && this.has('Climb Ledge') ? 'Climb Ledge' : (up || 'Idle');
    if (n === 'Climb Ledge') return { n, ts: 0, loop: false, fi: .12, fo: .12, time: clamp(cl.over, 0, 1) * (this.dur(n) - .02), forced: true };
    const d = this.dur(n), f = (((cl.phase * 1) % 1) + 1) % 1; return { n, ts: 0, loop: false, fi: .15, fo: .12, time: (n === 'Climb Down' ? 1 - f : f) * (d - .02), forced: true };
  }
  _sit(dt, st) {
    const s = this.sitting; s.t += dt;
    if (s.mode === 'ground') {
      if (s.phase === 'enter') { const n = 'Ground Sit Enter'; if (s.t >= this.dur(n) - .05) { s.phase = 'idle'; s.t = 0; } return { n, ts: 1.1, loop: false, fi: .15, fo: .1, hold: true, start: !s.st && (s.st = true) }; }
      if (s.phase === 'exit') { const n = 'Ground Sit Exit'; if (s.t >= this.dur(n) / 1.2 - .1) { this.sitting = null; return { n: 'Idle', ts: 1, loop: true, fi: .2, fo: .2 }; } return { n, ts: 1.2, loop: false, fi: .12, fo: .15, start: !s.xt && (s.xt = true) }; }
      return { n: 'Ground Sit Enter', ts: 0, loop: false, fi: .1, fo: .1, time: this.dur('Ground Sit Enter') - .02, forced: true };
    }
    if (s.mode === 'chair') {
      if (!s.n || s.t > s.len) { const pool = SITTERS.filter(x => this.has(x)); const nn = s.n === 'Sitting Idle' || !s.n ? rnd(pool) : 'Sitting Idle'; s.n = nn; s.t = 0; s.len = nn === 'Sitting Idle' ? 5 + Math.random() * 5 : this.dur(nn) * 1; s.fresh = true; }
      const start = s.fresh; s.fresh = false; return { n: s.n, ts: 1, loop: true, fi: .35, fo: .3, start };
    }
    return { n: this.pick(['Crouch Idle', 'Idle']), ts: 1, loop: true, fi: .25, fo: .2 };
  }
  /* ---------- quadro ---------- */
  update(dt, st = {}) {
    this.t += dt; dt = Math.min(dt, .1); this.airNow = !!st.air;
    if (this.ev && this.ev.kind === 'emote' && (st.spd || 0) > 1.0) this.ev = null;
    if (st.neutral) { this.ev = null; this.down = null; this.sitting = null; }
    if (this.sitting && (st.spd || 0) > 1.2 && this.sitting.phase !== 'exit') this.sit(false);
    const pr = this._primary(dt, st);
    if (!this.clips[pr.n]) { this.mixer.update(dt); return; }
    const s = this._slot(pr.n);
    if (!s.on || pr.start) {
      if (!s.on || pr.start) this._start(s, pr.ts, pr.loop, pr.forced ? pr.time : (pr.t0 || 0));
    }
    if (pr.forced) { s.act.paused = false; s.act.timeScale = 0; s.act.time = pr.time; }
    else { s.act.timeScale = pr.ts; if (pr.loop && s.act.loop !== THREE.LoopRepeat) s.act.setLoop(THREE.LoopRepeat, Infinity); }
    s.fi = pr.fi || .15; this.cur = s;
    for (const k in this.slots) { const q = this.slots[k]; q.tw = q === s ? 1 : 0; }
    let sum = 0;
    for (const k in this.slots) {
      const q = this.slots[k], rate = q.tw > q.w ? 1 / Math.max(.03, s.fi) : 1 / Math.max(.03, (pr.fo || .15));
      q.w += clamp(q.tw - q.w, -rate * dt, rate * dt);
      if (q.w < .002 && q.tw === 0) { if (q.on) { q.act.paused = true; q.act.setEffectiveWeight(0); q.on = false; } q.w = 0; continue; }
      sum += q.w;
    }
    for (const k in this.slots) { const q = this.slots[k]; if (q.on) q.act.setEffectiveWeight(sum > 0 ? q.w / sum : 0); }
    this.mixer.update(dt);
  }
}
