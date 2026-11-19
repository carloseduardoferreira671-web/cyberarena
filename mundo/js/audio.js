/* CyberArena · áudio sintetizado (WebAudio): efeitos com posição 3D simples e ambiente (vento, rio, pássaros, fogo). */
const STEP_SLICES = {"space":[[0.154,0.5,6.0],[0.779,0.5,6.0],[1.431,0.5,5.32],[2.19,0.5,6.0],[2.859,0.5,6.0],[3.628,0.5,6.0],[4.293,0.5,3.79],[4.873,0.5,6.0],[6.487,0.5,6.0],[7.159,0.5,6.0],[8.043,0.5,6.0]],"earth":[[0.823,0.4,6.0],[1.395,0.4,6.0],[2.054,0.4,6.0],[2.766,0.4,6.0],[3.268,0.4,6.0],[3.794,0.4,6.0],[4.564,0.4,6.0],[5.037,0.4,6.0],[5.614,0.4,5.17],[6.816,0.4,6.0],[7.379,0.4,6.0],[7.972,0.4,6.0],[8.548,0.4,6.0],[9.3,0.4,6.0],[9.773,0.4,3.58],[11.483,0.4,4.86],[12.135,0.4,6.0],[12.685,0.4,6.0],[13.288,0.4,6.0],[13.915,0.4,6.0],[14.49,0.4,6.0],[15.159,0.4,6.0],[15.732,0.4,4.03],[16.35,0.4,6.0],[16.905,0.4,6.0],[17.502,0.4,6.0],[18.075,0.4,5.5],[18.69,0.4,6.0],[19.245,0.4,6.0],[20.416,0.4,5.31],[21.023,0.4,6.0],[21.585,0.4,6.0],[22.718,0.4,3.64],[23.35,0.4,6.0],[23.892,0.4,6.0],[25.711,0.333,6.0]]};
const STEP_FILE = { space: 'passos_espaco.mp3', earth: 'passos_terra.mp3' };
const ATLAS_LP = new Set(['step', 'stepWater', 'whoosh', 'punch', 'hit', 'hurt', 'jump', 'land', 'death', 'kill', 'vault', 'laser', 'beam', 'nova', 'novaCharge', 'sonic', 'swap', 'charge', 'zap', 'void', 'implode', 'kamui', 'meteor', 'super', 'superCharge']);
const LINES = {
  atlas: {
    attack: ['Morra!', 'Toma isso!', 'Sente a dor!', 'Quebra!', 'Ajoelha!', 'Sem piedade!', 'Você é meu!', 'Arrebento você!', 'Vem cá!'],
    hit: ['Isso!', 'Arrebentou!', 'Mais!', 'Cai!', 'Fraco!', 'Sangra!', 'Nem sentiu?'],
    pain: ['Argh!', 'Uuugh!', 'Maldito!', 'Você vai pagar!', 'Isso doeu!'],
    death: ['Não... pode ser!', 'Aaaargh!'],
    super: ['Acabou pra você!', 'Sinta o abismo!', 'Ajoelhe-se!', 'Ninguém escapa!'],
  },
  nexus: {
    attack: ['Atacar.', 'Alvo travado.', 'Eliminar.', 'Armas ativas.', 'Destruir inimigo.', 'Engajando.', 'Iniciando combate.'],
    hit: ['Impacto confirmado.', 'Alvo atingido.', 'Dano crítico.', 'Alvo neutralizado.'],
    pain: ['Danos detectados.', 'Armadura comprometida.', 'Falha parcial.', 'Alerta.'],
    death: ['Sistemas desligando.', 'Falha crítica.'],
    super: ['Protocolo final ativado.', 'Poder máximo.', 'Transformando.', 'Energia total.'],
  },
};
export class Audio {
  constructor() { this.ctx = null; this.vol = +(localStorage.getItem('cyberarena.vol') ?? .8); this.listener = { x: 0, z: 0, yaw: 0 }; this.amb = null; this.last = {}; }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return; this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.gain.value = this.vol; const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; this.master.connect(comp); comp.connect(this.ctx.destination);
    const n = this.ctx.sampleRate * 2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b;
    this.startAmbient();
    this.loadExternalSamples();
  }
  setVolume(v) { this.vol = v; localStorage.setItem('cyberarena.vol', v); if (this.master) this.master.gain.value = v; }

  async loadExternalSamples() {
    if (!this.ctx || this.samplesLoading || this.samplesReady) return;
    this.samplesLoading = true;
    const files = [
      'universfield-punch-140236.mp3',
      'universfield-punch-03-352040.mp3',
      'universfield-combat-impact-352458.mp3',
      'universfield-ground-impact-352053.mp3',
      'universfield-impact-cinematic-boom-02-487858.mp3',
      'cyber_hit_soft.mp3',
      'atlas_hit_contact.mp3',
      'freesound_community-robot-step-39326.mp3',
      'passos_espaco.mp3',
      'passos_terra.mp3',
      'golpe_whoosh.mp3',
      'audiopapkin-big-robot-footstep-014-445104.mp3',
      'audiopapkin-big-robot-footstep-020-500843.mp3'
    ];
    this.samples = this.samples || new Map();
    await Promise.all(files.map(async file => {
      try {
        const response = await fetch(new URL('../assets/audio/' + file, import.meta.url));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const bytes = await response.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(bytes);
        this.samples.set(file, buffer);
      } catch (err) {
        console.warn('[Audio] amostra indisponível:', file, err);
      }
    }));
    this.samplesReady = true;
    this.samplesLoading = false;
  }
  playSample(file, pos, k = 1, rate = 1, maxDur = .7, gv = .82) {
    const buffer = this.samples && this.samples.get(file);
    if (!buffer || !this.ctx || !this.master) return false;
    const dst = this.out(pos, Math.min(1.35, Math.max(.05, k * 1.15)));
    if (!dst) return true;
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), gain = c.createGain();
    src.buffer = buffer;
    src.playbackRate.value = Math.max(.72, Math.min(1.35, rate));
    const dur = Math.min(maxDur, buffer.duration / src.playbackRate.value);
    gain.gain.setValueAtTime(gv, t); gain.gain.setValueAtTime(gv, t + Math.max(.02, dur - .12)); gain.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(gain);
    gain.connect(dst);
    src.start(t, 0, dur + .05);
    return true;
  }
  // Fatia um trecho da gravação real (um passo, ou um sopro de ar) e toca com envelope curto.
  playSlice(file, start, dur, pos, k = 1, rate = 1, gv = 1, shelf = 0, hp = 0, lp = 0) {
    const buffer = this.samples && this.samples.get(file);
    if (!buffer || !this.ctx || !this.master) return false;
    const dst = this.out(pos, Math.min(1.6, Math.max(.05, k * 1.15)));
    if (!dst) return true;
    const c = this.ctx, t = c.currentTime, src = c.createBufferSource(), g = c.createGain();
    src.buffer = buffer; src.playbackRate.value = rate;
    const d = Math.min(dur, buffer.duration - start);
    if (d <= .05) return false;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(gv, t + .006); g.gain.setValueAtTime(gv, t + Math.max(.01, d / rate - .05)); g.gain.linearRampToValueAtTime(0, t + d / rate);
    let last = g; src.connect(g);
    if (shelf) { const f = c.createBiquadFilter(); f.type = 'lowshelf'; f.frequency.value = 220; f.gain.value = shelf; last.connect(f); last = f; }
    if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; last.connect(f); last = f; }
    if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; last.connect(f); last = f; }
    last.connect(dst); src.start(t, start, d); return true;
  }
  realStep(run, pos, k, space) {
    const kind = space ? 'space' : 'earth', list = STEP_SLICES[kind], f = STEP_FILE[kind];
    if (!this.samples || !this.samples.has(f)) return false;
    const sl = list[Math.floor(Math.random() * list.length)];
    return this.playSlice(f, sl[0], sl[1], pos, k * 1.3, run ? 1.08 + Math.random() * .08 : .96 + Math.random() * .08, Math.min(6, sl[2]) * 1.1, 0, 0, space ? 1500 : 3000);
  }
  /* passo de robô: só o "baque" limpo das gravações (sem o brilho de prato/chiado do final) */
  robotStep(pos, k, run, gain = .85) {
    const R = [['audiopapkin-big-robot-footstep-020-500843.mp3', .13, .42], ['audiopapkin-big-robot-footstep-014-445104.mp3', .36, .42]];
    const r = R[Math.floor(Math.random() * R.length)];
    return this.playSlice(r[0], r[1], r[2], pos, k, run ? 1.08 : .98 + Math.random() * .06, gain, 0, 0, 2600);
  }
  swish(pos, k) {
    if (!this.samples || !this.samples.has('golpe_whoosh.mp3')) return false;
    return this.playSlice('golpe_whoosh.mp3', 0, .48, pos, k * 1.2, .95 + Math.random() * .3, 1.7, 0, 0, 0);
  }
  foliageBrush(pos, k = .7) {
    if (!this.ctx || !this.master || this.vol <= 0) return;
    const t = this.ctx.currentTime, key = 'foliage:' + (pos && pos.id != null ? pos.id : 'local');
    if (t - (this.last[key] || -10) < .28) return;
    this.last[key] = t;
    const o = this.out(pos, .1 * Math.max(.35, Math.min(1, k))); if (!o) return;
    this.noise(o, t, .14, 700, 260, .6, 'lowpass', .12 * k);
  }
  playImpact(pos, k = 1, ch = 'atlas') {
    if (!this.ctx || this.vol <= 0) return;
    if (this.playSample('atlas_hit_contact.mp3', pos, k, .96, 4, .82)) return;
    this.play('hit', pos, k, 'atlas');
  }
  sampleFor(name) {
    const choose = list => list[Math.floor(Math.random() * list.length)];
    const map = {
      punch: ['universfield-punch-140236.mp3', 'universfield-punch-03-352040.mp3'],
      hit: ['cyber_hit_soft.mp3', 'universfield-combat-impact-352458.mp3', 'universfield-impact-cinematic-boom-02-487858.mp3'],
      land: ['universfield-ground-impact-352053.mp3'],
      stepRobot: ['audiopapkin-big-robot-footstep-014-445104.mp3', 'audiopapkin-big-robot-footstep-020-500843.mp3', 'freesound_community-robot-step-39326.mp3'],
      runRobot: ['audiopapkin-big-robot-footstep-014-445104.mp3', 'audiopapkin-big-robot-footstep-020-500843.mp3']
    };
    const options = map[name];
    return options ? choose(options) : null;
  }

  out(pos, gain = 1) {
    const c = this.ctx, g = c.createGain(); let node = g;
    if (pos && c.createStereoPanner) { const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z, d = Math.hypot(dx, dz); const att = 1 / (1 + d * d * .004); g.gain.value = gain * att; const p = c.createStereoPanner(); const ang = Math.atan2(dx, dz) - this.listener.yaw; p.pan.value = Math.max(-1, Math.min(1, -Math.sin(ang) * Math.min(1, d / 6))); g.connect(p); p.connect(this.master); if (att < .02) return null; }
    else { g.gain.value = gain; g.connect(this.master); }
    return node;
  }
  noise(dst, t, dur, f0, f1, q = 1, type = 'bandpass', g0 = 1) { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf; const f = c.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); const g = c.createGain(); g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); s.connect(f); f.connect(g); g.connect(dst); s.start(t, Math.random()); s.stop(t + dur + .05); }
  tone(dst, t, dur, f0, f1, type = 'sine', g0 = .5, attack = .005) { const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); const g = c.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(g0, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + .05); }
  /* sons de carne, sangue e osso (estilo luta realista) */
  thud(o, t, f0, f1, dur, g) { this.tone(o, t, dur, f0, f1, 'sine', g, .002); this.noise(o, t, dur * .7, 420, 70, .7, 'lowpass', g * .9); }
  crack(o, t, g = .5) { this.noise(o, t, .035, 1500, 600, 1.4, 'bandpass', g); this.noise(o, t + .015, .03, 1000, 400, 1.6, 'bandpass', g * .7); }
  squelch(o, t, dur = .25, g = .5) { for (let i = 0; i < 3; i++) this.noise(o, t + i * dur / 4, dur / 3, 380 + Math.random() * 260, 260 + Math.random() * 300, 1.6, 'lowpass', g * (1 - i * .2)); }
  splat(o, t, g = .6) { this.noise(o, t, .3, 900, 160, .8, 'lowpass', g); this.squelch(o, t + .03, .26, g * .7); }
  grunt(o, t, f = 170, dur = .3, g = .3) { this.tone(o, t, dur, f, f * .55, 'sawtooth', g, .02); this.tone(o, t, dur, f * 2.1, f * 1.1, 'square', g * .25, .02); this.noise(o, t, dur, 900, 400, 1.6, 'bandpass', g * .9); }

  /* ================= personalidade sonora por personagem ================= */
  /* Atlas: brutal, carne/osso/sangue + rosnados e gritos (estilo luta sangrenta). Nexus: robô gigante (metal, servos, hidráulica, motores). */
  clang(o, t, g = .6, base = 420) { [1, 2.7, 4.46, 6.3].forEach((m, i) => this.tone(o, t, .32 - i * .05, base * m, base * m * .98, i % 2 ? 'square' : 'sine', g * (.7 - i * .14), .001)); this.noise(o, t, .05, 7000, 2500, 1.5, 'highpass', g * .7); }
  servo(o, t, dur = .3, f0 = 220, f1 = 520, g = .3) { this.tone(o, t, dur, f0, f1, 'sawtooth', g, .02); this.tone(o, t, dur, f0 * 2.01, f1 * 2.02, 'square', g * .35, .02); this.noise(o, t, dur, 2500, 5500, 3, 'bandpass', g * .5); }
  hydra(o, t, g = .5, dur = .22) { this.noise(o, t, dur, 5200, 2200, .7, 'highpass', g); this.noise(o, t + .01, dur * .6, 1800, 900, 1.2, 'bandpass', g * .5); }
  ring(o, t, dur, f, g = .3) { const c = this.ctx, a = c.createOscillator(), b = c.createOscillator(), m = c.createGain(), out = c.createGain(); a.type = 'sawtooth'; b.type = 'sine'; a.frequency.value = f; b.frequency.value = f * 1.5 + 47; m.gain.value = 0; b.connect(m.gain); a.connect(m); m.connect(out); out.gain.setValueAtTime(.0001, t); out.gain.exponentialRampToValueAtTime(g, t + .02); out.gain.exponentialRampToValueAtTime(.0001, t + dur); out.connect(o); a.start(t); b.start(t); a.stop(t + dur + .05); b.stop(t + dur + .05); }
  playNexus(name, o, t, k) {
    switch (name) {
      case 'whoosh': this.servo(o, t, .22, 180, 620, .22); this.hydra(o, t + .02, .35, .16); return true;
      case 'punch': this.clang(o, t, .8, 300); this.thud(o, t, 120, 40, .18, .8); this.hydra(o, t + .03, .4, .18); return true;
      case 'hit': this.clang(o, t, .75, 520); this.crack(o, t, .4); this.thud(o, t, 140, 45, .15, .7); this.noise(o, t + .02, .12, 6000, 1800, 1.2, 'highpass', .4); return true;
      case 'hurt': this.clang(o, t, .5, 250); this.servo(o, t + .04, .35, 520, 120, .28); this.tone(o, t + .02, .25, 90, 55, 'square', .22); return true;
      case 'laser': this.tone(o, t, .28, 2600, 260, 'sawtooth', .35); this.tone(o, t, .22, 3400, 700, 'square', .16); this.noise(o, t, .12, 7000, 1500, 2, 'highpass', .45); this.thud(o, t, 110, 45, .25, .6); this.hydra(o, t + .1, .35); return true;
      case 'beam': this.ring(o, t, 1.4, 120, .5); this.tone(o, t, 1.4, 70, 36, 'sawtooth', .5, .02); this.noise(o, t, 1.4, 6000, 900, .8, 'highpass', .45); this.thud(o, t, 60, 25, .8, .9); return true;
      case 'nova': this.thud(o, t, 55, 16, 2.0, 1.2); for (let i = 0; i < 5; i++) this.clang(o, t + .05 + i * .14, .7 - i * .1, 200 + Math.random() * 300); this.noise(o, t, 2.2, 3000, 70, .6, 'lowpass', 1.3); this.hydra(o, t + .1, .8, .5); return true;
      case 'novaCharge': this.servo(o, t, 1.1, 90, 900, .3); for (let i = 0; i < 6; i++) this.clang(o, t + i * .17, .22 + i * .04, 600 + i * 80); this.ring(o, t, 1.1, 180, .25); return true;
      case 'sonic': this.hydra(o, t, .6, .3); this.servo(o, t, .3, 900, 160, .3); this.thud(o, t + .04, 100, 35, .25, .8); return true;
      case 'swap': case 'charge': this.servo(o, t, .22, 150, 420, .2); this.clang(o, t + .18, .35, 500); this.hydra(o, t + .1, .3); if (name === 'swap') this.servo(o, t + .2, .35, 420, 120, .22); return true;
      case 'zap': this.ring(o, t, .22, 700, .3); this.crack(o, t, .5); return true;
      case 'void': this.ring(o, t, 1.5, 70, .55); this.thud(o, t, 65, 24, 1.3, .9); for (let i = 0; i < 4; i++) this.clang(o, t + i * .3, .3, 140 + i * 40); return true;
      case 'implode': this.thud(o, t, 65, 20, .6, 1); this.clang(o, t, .7, 160); this.hydra(o, t + .02, .6, .4); this.crack(o, t + .05, .6); return true;
      case 'kamui': this.ring(o, t, 2.0, 90, .45); this.servo(o, t, 2.0, 70, 480, .22); for (let i = 0; i < 5; i++) this.clang(o, t + .3 * i, .25, 300 + i * 90); return true;
      case 'meteor': this.noise(o, t, .7, 1800, 100, 1, 'lowpass', .9); this.thud(o, t + .5, 70, 22, .5, 1); this.clang(o, t + .5, .7, 140); return true;
      case 'super': case 'superCharge': this.servo(o, t, name === 'super' ? 1.0 : .5, 100, 700, .32); for (let i = 0; i < 4; i++) this.clang(o, t + i * .1, .5, 260 + i * 140); this.thud(o, t, 60, 22, .9, name === 'super' ? 1 : .5); this.hydra(o, t, .6, .4); return true;
      case 'jump': this.servo(o, t, .14, 260, 520, .16); this.hydra(o, t, .25, .12); return true;
      case 'land': this.clang(o, t, .45 * k, 220); this.thud(o, t, 100, 35, .2, .7 * k); return true;
      case 'death': this.servo(o, t, 1.0, 600, 40, .4); this.clang(o, t + .2, .6, 200); this.clang(o, t + .5, .5, 150); this.thud(o, t + .8, 70, 25, .5, .9); this.noise(o, t, 1, 4000, 100, .7, 'lowpass', .5); return true;
      case 'kill': this.clang(o, t, .5, 600); this.servo(o, t + .05, .3, 200, 800, .22); return true;
      case 'vault': this.servo(o, t, .25, 200, 500, .2); this.clang(o, t + .2, .3, 400); return true;
    }
    return false;
  }
  /* voz sintetizada com formantes: huh / uff / ahh / hah / ugh */
  vowel(o, t, f0a, f0b, dur, F, g, breath = .5, grow = 0) {
    const c = this.ctx, out = c.createGain(); out.gain.setValueAtTime(.0001, t); out.gain.exponentialRampToValueAtTime(g, t + Math.min(.04, dur * .25)); out.gain.exponentialRampToValueAtTime(.0001, t + dur); const lpv = c.createBiquadFilter(); lpv.type = 'lowpass'; lpv.frequency.value = 2200; lpv.Q.value = .3; out.connect(lpv); lpv.connect(o);
    const osc = c.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f0a, t); osc.frequency.exponentialRampToValueAtTime(Math.max(30, f0b), t + dur);
    if (grow) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 38; lg.gain.value = f0a * grow; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + .05); }
    const nz = c.createBufferSource(); nz.buffer = this.noiseBuf; const ng = c.createGain(); ng.gain.value = breath;
    const vg = c.createGain(); vg.gain.value = 1 - breath * .5; osc.connect(vg); nz.connect(ng);
    F.forEach((f, i) => { const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2.2 + i * .8; const fg = c.createGain(); fg.gain.value = [1, .7, .35][i] || .2; vg.connect(bp); ng.connect(bp); bp.connect(fg); fg.connect(out); });
    osc.start(t); osc.stop(t + dur + .05); nz.start(t); nz.stop(t + dur + .05);
  }
  grunt2(o, t, kind, g = 1) {
    switch (kind) {
      case 'huh': this.vowel(o, t, 150, 105, .16, [700, 1150, 2600], g * 1.2, .8); break;
      case 'hah': this.vowel(o, t, 170, 110, .22, [850, 1300, 2700], g * 1.2, .9); this.noise(o, t, .2, 1400, 700, 1, 'bandpass', g * .4); break;
      case 'uff': this.vowel(o, t, 125, 70, .26, [380, 850, 2400], g * 1.4, .45, .1); this.noise(o, t + .16, .2, 2200, 1100, .8, 'lowpass', g * .45); break;
      case 'ahh': this.vowel(o, t, 175, 95, .42, [800, 1220, 2800], g * 1.3, .5, .05); break;
      case 'ugh': this.vowel(o, t, 105, 58, .34, [470, 1000, 2350], g * 1.4, .35, .22); break;
      case 'roar': this.vowel(o, t, 90, 50, .9, [600, 1050, 2400], g * 1.5, .5, .3); this.vowel(o, t + .02, 180, 95, .9, [800, 1250, 2700], g * .7, .6, .2); break;
    }
  }
  vocal(ch, kind, pos) {
    if (!this.ctx || this.vol <= 0) return; const now = performance.now(); this._vT = this._vT || {}; if (now - (this._vT[ch + kind] || 0) < (kind === 'attack' ? 140 : 260)) return; this._vT[ch + kind] = now;
    let gm = 1; if (pos) { const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z); if (d > 30) return; gm = Math.max(.3, 1 - d / 36); }
    const o = this.out(pos, 2.9 * gm), t = this.ctx.currentTime + .005; if (!o) return; const R = a => a[Math.floor(Math.random() * a.length)];
    if (ch === 'nexus') {
      const k = { attack: ['p', 's', 'm'], hit: ['p', 'b'], pain: ['b', 'm'], death: ['d'], super: ['m', 'd'] }[kind] || ['p'];
      switch (R(k)) {
        case 'p': this.hydra(o, t, .8, .2); this.servo(o, t, .16, 240, 460, .22); break;               // pssht + motor
        case 's': this.servo(o, t, .22, 180, 700, .3); this.clang(o, t + .12, .25, 600); break;           // chiado + engrenagem
        case 'm': this.vowel(o, t, 110, 80, .3, [500, 1100, 2400], 1.1, .3, .2); this.ring(o, t, .3, 95, .3); break;   // "mmrr" mecânico
        case 'b': this.tone(o, t, .2, 1800, 600, 'square', .25); this.tone(o, t + .08, .2, 900, 300, 'square', .2); this.hydra(o, t + .05, .5, .25); break;   // bipe de alerta + vapor
        case 'd': this.servo(o, t, .9, 500, 40, .5); this.hydra(o, t + .2, .8, .6); break;
      }
      return;
    }
    switch (kind) {
      case 'attack': { const a = R(['huh', 'hah', 'uff', 'ahh']); this.grunt2(o, t, a, 1); if (Math.random() < .35) this.grunt2(o, t + .17, R(['huh', 'uff']), .8); break; }
      case 'hit': this.grunt2(o, t, R(['uff', 'ugh', 'hah']), 1.1); break;
      case 'pain': this.grunt2(o, t, R(['ugh', 'ahh']), 1.2); break;
      case 'death': this.grunt2(o, t, 'ahh', 1.4); this.grunt2(o, t + .35, 'ugh', 1.2); break;
      case 'super': this.grunt2(o, t, 'roar', 1.2); break;
    }
  }
  /* (desativado) voz falada (pt-BR) com tom de cada personagem; quem tem voz de verdade no aparelho fala, senão fica só o som */
  say(ch, kind, pos) {
    try {
      const ss = window.speechSynthesis; if (!ss || this.vol <= 0) return; const now = performance.now(); this._sayT = this._sayT || {};
      if (now - (this._sayT[ch] || 0) < (kind === 'pain' ? 1200 : 1700)) return; if (kind !== 'death' && kind !== 'super' && Math.random() > .62) return;
      let near = 1; if (pos) { const d = Math.hypot(pos.x - this.listener.x, pos.z - this.listener.z); if (d > 22) return; near = Math.max(.35, 1 - d / 26); }
      const L = LINES[ch] && LINES[ch][kind]; if (!L) return; const txt = L[Math.floor(Math.random() * L.length)];
      this._sayT[ch] = now; if (ss.speaking && ss.pending) ss.cancel();
      const u = new SpeechSynthesisUtterance(txt); u.lang = 'pt-BR'; const vs = ss.getVoices ? ss.getVoices() : []; const v = vs.find(x => /pt[-_]BR/i.test(x.lang)) || vs.find(x => /^pt/i.test(x.lang)); if (v) u.voice = v;
      if (ch === 'atlas') { u.pitch = 0; u.rate = kind === 'attack' ? .78 : .7; } else { u.pitch = .35; u.rate = 1.12; }
      u.volume = Math.min(1, (kind === 'pain' ? .8 : 1) * near * Math.max(.5, this.vol + .2)); ss.speak(u);
      if (ch === 'nexus' && this.ctx) { const o = this.out(pos, .7); if (o) { const t = this.ctx.currentTime + .02; this.servo(o, t, .2, 300, 700, .12); this.tone(o, t + .02, .12, 1400, 1400, 'square', .06); } }
    } catch (_) { }
  }
  /* respiração contínua do jogador (alta): Atlas = ofegar pesado e rosnado, Nexus = ventilação hidráulica e motor */
  breathe(dt, ch, exert, on) {
    if (!this.ctx || this.vol <= 0) return; const c = this.ctx, t = c.currentTime; ch = ch === 'nexus' ? 'nexus' : 'atlas';
    if (!this.br || this.br.ch !== ch) {
      if (this.br) { try { this.br.src.stop(); this.br.o.stop(); } catch (_) { } try { this.br.out.disconnect(); } catch (_) { } }
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true; const f = c.createBiquadFilter(), f2 = c.createBiquadFilter(), g = c.createGain(), out = c.createGain(); out.gain.value = 0;
      const o = c.createOscillator(), og = c.createGain(), of = c.createBiquadFilter();
      if (ch === 'atlas') { f.type = 'bandpass'; f.frequency.value = 800; f.Q.value = 1.1; f2.type = 'lowpass'; f2.frequency.value = 2400; o.type = 'sawtooth'; o.frequency.value = 58; of.type = 'lowpass'; of.frequency.value = 240; }
      else { f.type = 'highpass'; f.frequency.value = 3200; f.Q.value = .7; f2.type = 'bandpass'; f2.frequency.value = 4800; f2.Q.value = .8; o.type = 'triangle'; o.frequency.value = 110; of.type = 'lowpass'; of.frequency.value = 900; }
      src.connect(f); f.connect(f2); f2.connect(g); g.connect(out); o.connect(of); of.connect(og); og.connect(out); out.connect(this.master); src.start(); o.start();
      this.br = { ch, src, o, f, f2, g, og, out, ph: 0 };
    }
    const b = this.br; b.ph += dt * Math.PI * 2 * (.42 + exert * 1.15); const e = Math.pow(Math.max(0, Math.sin(b.ph)), 1.4), L = on ? 1 : 0;
    if (ch === 'atlas') { b.g.gain.setTargetAtTime(0, t, .03); b.f.frequency.setTargetAtTime(600 + 500 * e + exert * 250, t, .05); b.og.gain.setTargetAtTime(0, t, .04); b.o.frequency.setTargetAtTime(52 + 14 * e + exert * 12, t, .06); }
    else { b.g.gain.setTargetAtTime(0, t, .02); b.f2.frequency.setTargetAtTime(4000 + 1500 * e, t, .04); b.og.gain.setTargetAtTime(0, t, .15); b.o.frequency.setTargetAtTime(96 + exert * 60 + 10 * Math.sin(b.ph * .5), t, .1); }
    b.out.gain.setTargetAtTime(1.1 * L, t, .1);
    const cyc = Math.floor(b.ph / (Math.PI * 2)); if (b.cyc === undefined) b.cyc = cyc;
    if (cyc !== b.cyc) { b.cyc = cyc; if (L && exert > .4) { const o = this.out(null, 1.5), tt = t + .01; if (ch === 'atlas') { /* sem voz sintética ao se mover */ } /* sem chiado de robô */ } }
  }
  play(name, pos, k = 1, ch = 'atlas') {
    if (!this.ctx || this.vol <= 0) return; const now = this.ctx.currentTime; if (this.last[name] && now - this.last[name] < .03) return; this.last[name] = now;
    const robot = ch === 'nexus';
    if (robot) {
      // Robôs: movimento e ataque = só o baque do passo; acerto = carne e sangue (igual ao Atlas). Sem prato/chiado/voz.
      if (/^(step|run)(Grass|Stone|Crystal|Robot)$/.test(name) || name === 'step') { if (this.robotStep(pos, k, name.startsWith('run'))) return; }
      else if (name === 'whoosh') { if (this.robotStep(pos, k * .8, true, .75)) return; }
      else if (name === 'jump' || name === 'vault') { if (this.robotStep(pos, k * .8, false, .9)) return; }
      else if (name === 'land') { if (this.robotStep(pos, k, false, 1.0)) return; }
      else if (name === 'punch') { this.robotStep(pos, k * .8, false, .8); const sm = this.sampleFor('punch'); if (sm && this.playSample(sm, pos, k, 1, 4, .82)) return; }
      else if (name === 'hit') { const sm = this.sampleFor('hit'); if (sm && this.playSample(sm, pos, k, 1, 4, .82)) return; }
    } else {
      // Atlas: gravações reais (passo de sapato, sopro de ar no golpe, impacto) sem camada sintética.
      if (/^(step|run)(Grass|Stone|Crystal)$/.test(name) || name === 'step') { if (this.realStep(name.startsWith('run'), pos, k, name.endsWith('Crystal'))) return; }
      else if (name === 'whoosh') { if (this.swish(pos, k)) return; }
      else if (name === 'punch' || name === 'hit') {
        const sm = this.sampleFor(name);
        if (sm && this.playSample(sm, pos, k, 1, 4, .82)) return;
      }
      else if (name === 'land') { if (this.playSlice('universfield-ground-impact-352053.mp3', .12, .7, pos, k * 1.1, 1, 1.1, 0, 0, 1000)) return; }
    }
    let o = this.out(pos, k * 1.5); if (!o) return; const t = now + .005;
    const synthName = ({ stepGrass: 'step', runGrass: 'step', stepStone: 'step', runStone: 'step',
      stepCrystal: 'step', runCrystal: 'step', stepRobot: 'step', runRobot: 'step' })[name] || name;

    if ((ch === 'nexus' || ATLAS_LP.has(name)) && !(ch === 'cyber' && false)) { const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = .35; lp.connect(o); o = lp; }
    if (ch === 'nexus' && this.playNexus(name, o, t, k)) return;
    switch (synthName) {
      case 'laser': this.noise(o, t, .09, 5000, 700, 1.5, 'highpass', .5); this.crack(o, t + .02, .5); this.splat(o, t + .05, .55); this.thud(o, t, 140, 55, .2, .5); break;
      case 'beam': this.thud(o, t, 70, 30, 1.2, .8); this.noise(o, t, 1.4, 1400, 200, .8, 'bandpass', .9); for (let i = 0; i < 6; i++) this.squelch(o, t + i * .2, .22, .4); this.grunt(o, t, 95, 1.0, .25); break;
      case 'nova': this.thud(o, t, 60, 18, 2.0, 1.1); this.crack(o, t, .8); this.crack(o, t + .05, .7); this.splat(o, t + .08, .9); this.splat(o, t + .35, .7); this.noise(o, t, 2.2, 1800, 60, .6, 'lowpass', 1.2); break;
      case 'novaCharge': for (let i = 0; i < 7; i++) this.thud(o, t + i * .16, 80, 45, .14, .3 + i * .05); this.noise(o, t, 1.1, 200, 1400, 1.5, 'bandpass', .35); this.grunt(o, t, 110, 1.0, .22); break;
      case 'sonic': this.noise(o, t, .3, 1200, 200, .8, 'lowpass', 1.1); this.crack(o, t + .05, .5); this.thud(o, t + .04, 110, 40, .25, .8); break;
      case 'swap': this.noise(o, t, .4, 500, 3000, 1.4, 'bandpass', .5); this.squelch(o, t + .12, .3, .5); this.thud(o, t + .3, 120, 50, .2, .5); break;
      case 'charge': this.thud(o, t, 90, 70, .16, .25); break;
      case 'zap': this.crack(o, t, .6); this.squelch(o, t + .02, .15, .4); break;
      case 'void': this.thud(o, t, 70, 25, 1.4, .9); for (let i = 0; i < 5; i++) this.squelch(o, t + i * .22, .28, .45); this.grunt(o, t, 85, 1.2, .25); break;
      case 'implode': this.thud(o, t, 70, 22, .6, 1); this.crack(o, t, .8); this.splat(o, t + .05, .8); this.crack(o, t + .09, .6); break;
      case 'kamui': this.noise(o, t, 2.0, 300, 1800, 1.2, 'bandpass', .5); for (let i = 0; i < 8; i++) this.squelch(o, t + i * .25, .3, .35); this.thud(o, t + 1.8, 60, 20, .5, .9); break;
      case 'meteor': this.noise(o, t, .7, 1500, 100, 1, 'lowpass', .9); this.thud(o, t + .5, 70, 25, .5, 1); this.crack(o, t + .5, .7); break;
      case 'whoosh': this.noise(o, t, .12, 380, 160, .5, 'lowpass', .12); break;
      case 'punch': this.thud(o, t, 150, 42, .2, .95); this.noise(o, t, .12, 700, 220, .8, 'lowpass', 1.0); this.noise(o, t + .005, .08, 900, 350, 1.2, 'bandpass', .6); this.squelch(o, t + .01, .12, .3); break;
      case 'hit': this.thud(o, t, 130, 38, .22, 1.0); this.noise(o, t, .14, 800, 250, .9, 'lowpass', 1.0); this.crack(o, t + .01, .35); this.squelch(o, t + .03, .2, .5); if (Math.random() < .55) this.splat(o, t + .05, .5); break;
      case 'hurt': this.grunt(o, t + .03, 190 + Math.random() * 50, .3, .32); this.squelch(o, t, .15, .4); break;
      case 'super': this.thud(o, t, 65, 25, 1.0, 1); this.crack(o, t, .8); this.crack(o, t + .07, .7); this.splat(o, t + .1, .8); this.grunt(o, t, 90, .8, .3); break;
      case 'superCharge': for (let i = 0; i < 4; i++) this.thud(o, t + i * .11, 85, 50, .1, .3 + i * .06); this.grunt(o, t, 120, .45, .2); break;
      case 'jump': this.thud(o, t, 120, 60, .1, .4); break;
      case 'land': this.thud(o, t, 110, 40, .16, .8 * k); break;
      case 'step': { const p = .85 + Math.random() * .3, hv = ch === 'nexus' ? 1.25 : 1; this.noise(o, t, .11, 320 * p, 90, .5, 'lowpass', 1.5 * hv); this.tone(o, t, .06, 70 * p, 42, 'sine', .7 * hv, .004); this.noise(o, t + .03, .09, 1100 * p, 350, .45, 'lowpass', .5); this.noise(o, t + .08, .08, 700, 250, .4, 'lowpass', .22); } break;
      case 'stepWater': this.noise(o, t, .2, 700, 300, .8, 'lowpass', .4); this.thud(o, t, 120, 60, .1, .4); break;
      case 'splash': this.noise(o, t, .5, 700, 3000, .8, 'bandpass', .8); this.noise(o, t + .05, .4, 3000, 900, 1, 'bandpass', .4); break;
      case 'vault': this.grunt(o, t, 190, .14, .2); this.tone(o, t + .15, .1, 150, 70, 'sine', .4); break;
      case 'death': this.grunt(o, t, 230, .7, .35); this.splat(o, t + .1, .8); this.squelch(o, t + .2, .5, .6); this.thud(o, t + .75, 80, 28, .4, .8); this.splat(o, t + .8, .5); break;
      case 'kill': this.crack(o, t, .5); this.thud(o, t, 95, 40, .3, .6); this.squelch(o, t + .05, .3, .5); break;
      case 'pickup': [660, 880, 1320].forEach((f, i) => this.tone(o, t + i * .07, .18, f, f * 1.01, 'triangle', .2)); break;
      case 'click': this.tone(o, t, .05, 1200, 900, 'square', .08); break;
      case 'zone': this.tone(o, t, .5, 520, 520, 'triangle', .2); this.tone(o, t + .55, .5, 390, 390, 'triangle', .2); break;
      case 'victory': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(o, t + i * .13, .5, f, f, 'triangle', .25)); break;
      case 'chat': this.tone(o, t, .08, 900, 1200, 'sine', .12); break;
      case 'count': this.tone(o, t, .15, 700, 700, 'square', .1); break;
      case 'go': this.tone(o, t, .4, 1050, 1050, 'square', .14); break;
      case 'heal': this.tone(o, t, .5, 500, 1000, 'sine', .2, .1); break;
    }
  }
  startAmbient() {
    const c = this.ctx, mk = (f, q, type) => { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); return { g, fl }; };
    this.amb = { wind: mk(420, .6, 'lowpass'), realmWind: mk(1650, .45, 'bandpass'), foliage: mk(920, .75, 'bandpass'), river: mk(1400, .5, 'bandpass'), fire: mk(2500, 1.5, 'highpass') };
    this.birdT = 2;
  }
  ambient(dt, wind, waterDist, fireDist, isRealm = false, forestDensity = 0) {
    if (!this.amb) return; const t = this.ctx.currentTime;
    // Brisa ambiente fixa e discreta; nunca acompanha a velocidade do personagem.
    this.amb.wind.g.gain.setTargetAtTime(isRealm ? 0 : .009 + wind * .006, t, .8);
    this.amb.wind.fl.frequency.setTargetAtTime(300 + wind * 260, t, .9);
    this.amb.realmWind.g.gain.setTargetAtTime(isRealm ? .006 + wind * .002 : 0, t, .9);
    this.amb.realmWind.fl.frequency.setTargetAtTime(1450 + wind * 220, t, 1);
    const forest = Math.max(0, Math.min(1, forestDensity || 0));
    this.amb.foliage.g.gain.setTargetAtTime(isRealm ? 0 : .0015 + forest * .0065, t, .9);
    this.amb.foliage.fl.frequency.setTargetAtTime(720 + wind * 360, t, 1.1);
    this.amb.river.g.gain.setTargetAtTime(isRealm ? 0 : Math.max(0, .14 * (1 - waterDist / 22)), t, .3);
    this.amb.fire.g.gain.setTargetAtTime(isRealm ? 0 : Math.max(0, .05 * (1 - fireDist / 10)) * (.6 + Math.random() * .8), t, .05);
    this.birdT -= dt; if (false && this.birdT < 0) { this.birdT = 3 + Math.random() * 7; const o = this.out(null, .5); const f = 2400 + Math.random() * 1600; for (let i = 0; i < 2 + (Math.random() * 4 | 0); i++) this.tone(o, t + i * .11, .08, f, f * (1.2 + Math.random() * .3), 'sine', .05); }
  }
}
