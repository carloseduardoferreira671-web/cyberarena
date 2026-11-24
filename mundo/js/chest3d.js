/* CyberArena · chest3d (v154) — caixas 3D com abertura cinematográfica.
   Mini / Cyber / Mecha são modelos 3D reais (mundo/models/chest_boxes.glb), cortados em tampa + corpo, com interior de energia.
   Nenhuma animação antiga foi reaproveitada: tudo aqui é coreografado em código (squash & stretch com molas, carga por pulsos de raridade,
   explosão com hit-stop, feixe de luz, raios, ondas de choque, estilhaços, fonte de recompensas, câmera com FOV-punch e tremor, som sintetizado).

   Estilos de tampa (troque em CFG.styles ou com window.CHEST3D = { styles:{ mini:'launch' } }):
     'hinge'    → tampa gira na dobradiça de trás, estilo baú (Clash Royale / Brawl Stars)
     'levitate' → tampa levita, gira e voa para longe, estilo hextech (Wild Rift / LoL)
     'launch'   → tampa é disparada para cima por um propulsor, estilo loot-box de FPS (Overwatch / Valorant) */
import * as THREE from '../lib/three.module.min.js';
import { clamp, lerp, smooth, easeOutCubic, easeInCubic, easeInOutCubic, easeOutBack, rnd, Spring, loadChestGLB, buildEnv, makeFloor, makeRing, makeRays, makeBeam, makeGlowSprite, Particles, Sfx, haptic } from './chest3d_core.js';

const GLB_URL = new URL('../models/chest_boxes.glb', import.meta.url).href;
const ROOT = new URL('../../', import.meta.url);

export const CFG = {
  styles: { mini: 'hinge', cyber: 'levitate', mecha: 'launch' },
  reveal: { mini: 1.6, cyber: 1.9, mecha: 2.3 },          // segundos entre a explosão e a passagem para a tela de recompensas
  maxDpr: 2,
};
export const RARITY = [
  { name: 'COMUM', hex: 0x38f2ff }, { name: 'RARO', hex: 0x3a8cff }, { name: 'ÉPICO', hex: 0xb45cff }, { name: 'LENDÁRIO', hex: 0xffc02e }];
const LADDER = [[0], [0, 1], [0, 1, 2], [0, 1, 2, 3]];     // cor de cada pulso até chegar à raridade final
const hexRGB = h => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3();

export class ChestStage {
  constructor() {
    this.wrap = document.createElement('div'); this.wrap.className = 'c3d-wrap';
    this.canvas = document.createElement('canvas'); this.canvas.className = 'c3d-canvas';
    this.flashEl = document.createElement('div'); this.flashEl.className = 'c3d-flash';
    this.wrap.append(this.canvas, this.flashEl);
    this.ready = false; this.mode = 'hidden'; this.type = 'mini'; this.time = 0; this.running = false;
    this.anchor = null; this.sy = new Spring(1, 260, 15); this.kick = 0; this.shake = 0; this.fovKick = 0; this.flash = 0;
    this.col = new THREE.Color(0x38f2ff); this.colT = new THREE.Color(0x38f2ff); this.charge = 0; this.glow = .3; this.coreK = 0;
    this.yawOff = 0; this.tilt = 0; this.tm = 0; this.T = 0; this.lid = null; this.beamA = 0; this.raysA = 0; this.haloA = 0; this.lastType = null; this.camPull = 0;
  }

  /* ------------------------------------------------------------ carregamento */
  init() {
    if (this._init) return this._init;
    this._init = (async () => {
      const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      r.setClearColor(0x000000, 0); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15; r.outputColorSpace = THREE.SRGBColorSpace;
      this.data = await loadChestGLB(GLB_URL, r);
      this._build(); this.ready = true;
    })();
    this._init.catch(() => { this._init = null; });
    return this._init;
  }

  _build() {
    const S = this.scene = new THREE.Scene(); S.environment = buildEnv(this.renderer); S.environmentIntensity = 1;
    this.camera = new THREE.PerspectiveCamera(30, 1, .1, 80); this.camTarget = new THREE.Vector3(0, .85, 0);
    const key = new THREE.DirectionalLight(0xfff1dd, 2.4); key.position.set(-3, 6, 4); S.add(key);
    const rim = new THREE.DirectionalLight(0x38f2ff, 2.2); rim.position.set(4, 3, -5); S.add(rim);
    const fill = new THREE.DirectionalLight(0xb45cff, .9); fill.position.set(5, 1.5, 3); S.add(fill);
    this.pl = new THREE.PointLight(0x38f2ff, 0, 7, 2); S.add(this.pl);
    this.lights = { key, rim, fill };

    /* piso: plataforma com anéis/hex + brilho + sombra */
    this.floorMat = makeFloor(); const floor = new THREE.Mesh(new THREE.CircleGeometry(2.7, 64), this.floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = -.002; floor.renderOrder = 0; S.add(floor); this.floor = floor;
    this.floorGlow = makeGlowSprite(0x38f2ff); const fg = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 5.6), this.floorGlow); fg.rotation.x = -Math.PI / 2; fg.position.y = .004; fg.renderOrder = 1; S.add(fg);
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const sx = sc.getContext('2d'), gr = sx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(.55, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); sx.fillStyle = gr; sx.fillRect(0, 0, 128, 128);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, toneMapped: false }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.position.y = .006; this.shadow.renderOrder = 2; S.add(this.shadow);
    this.rings = [0, 1, 2].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), makeRing()); m.rotation.x = -Math.PI / 2; m.position.y = .012; m.visible = false; m.renderOrder = 3; m.userData = { t: 0, dur: 1, maxS: 6 }; S.add(m); return m; });
    this.bbRing = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), makeRing()); this.bbRing.visible = false; this.bbRing.renderOrder = 22; this.bbRing.userData = { t: 0, dur: 1, maxS: 8 }; S.add(this.bbRing);

    /* caixas */
    this.holder = new THREE.Group(); S.add(this.holder); this.sq = new THREE.Group(); this.holder.add(this.sq);
    this.boxes = {};
    for (const n of Object.keys(this.data.boxes)) {
      const B = this.data.boxes[n], g = new THREE.Group(), body = new THREE.Group(), pivot = new THREE.Group(), lid = new THREE.Group(), seam = new THREE.Group();
      const add = (arr, to) => arr.forEach(p => { const m = new THREE.Mesh(p.geo, p.mat); m.frustumCulled = false; to.add(m); });
      add(B.parts.body, body); add(B.parts.lid, lid); add(B.parts.seam, seam); seam.renderOrder = 6; pivot.add(lid); g.add(body, pivot, seam); g.visible = false; this.sq.add(g);
      this.boxes[n] = { name: n, group: g, body, pivot, lid, seam, H: B.height, cutY: B.cutY, W: B.width, D: B.depth, cx: B.center[0], cz: B.center[1] };
    }

    /* efeitos */
    this.fx = new Particles(1000); S.add(this.fx.points);
    this.raysMat = makeRays(); this.rays = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), this.raysMat); this.rays.renderOrder = 18; this.rays.visible = false; S.add(this.rays);
    this.beamMat = makeBeam(); const bg = new THREE.PlaneGeometry(1, 1); bg.translate(0, .5, 0); this.beam = new THREE.Mesh(bg, this.beamMat); this.beam.renderOrder = 17; this.beam.visible = false; S.add(this.beam);
    this.haloMat = makeGlowSprite(0xffffff); this.halo = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), this.haloMat); this.halo.renderOrder = 19; this.halo.visible = false; S.add(this.halo);
    const cg = new THREE.BoxGeometry(.11, .06, .15); this.chipMat = new THREE.MeshStandardMaterial({ color: 0x1a3fb0, metalness: .85, roughness: .35, emissive: 0x38f2ff, emissiveIntensity: .25 });
    this.chips = new THREE.InstancedMesh(cg, this.chipMat, 44); this.chips.count = 0; this.chips.frustumCulled = false; S.add(this.chips); this.chipData = [];
    this._loadItemTextures(); this.items = []; this.itemGroup = new THREE.Group(); S.add(this.itemGroup);
  }

  async _loadItemTextures() {
    this.itemTex = {};
    for (const [k, f] of [['coin', 'coin_logo.svg'], ['token', 'token_logo.svg'], ['gem', 'gem_logo.svg']]) {
      try {
        const im = new Image(); im.src = new URL('assests/ui/' + f, ROOT).href; await im.decode();
        const c = document.createElement('canvas'); c.width = c.height = 160; c.getContext('2d').drawImage(im, 0, 0, 160, 160);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; this.itemTex[k] = t;
      } catch (_) { }
    }
  }

  /* ------------------------------------------------------------ montagem na tela */
  attach(parent, anchor) {
    if (this.wrap.parentNode !== parent) parent.prepend(this.wrap);
    this.anchor = anchor || null; this.layout();
    if (!this._ro && window.ResizeObserver) { this._ro = new ResizeObserver(() => this.layout()); this._ro.observe(this.wrap); }
  }
  layout() {
    if (!this.renderer) return;
    const r = this.wrap.getBoundingClientRect(); const w = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height)); if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, CFG.maxDpr); this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.cw = w; this.ch = h; this.camera.aspect = w / h;
    const a = this.anchor && this.anchor.getBoundingClientRect(); const ax = a && a.width ? a.left + a.width / 2 - r.left : w / 2, ay = a && a.height ? a.top + a.height / 2 - r.top : h / 2, ah = a && a.height ? a.height : h * .6;
    this.off = { x: ax - w / 2, y: ay - h / 2 }; const FIT = 3.3;       /* unidades de mundo que a altura da âncora ocupa */
    this.baseDist = ((h / ah) * FIT / 2) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    this.camera.setViewOffset(w, h, -this.off.x, -this.off.y, w, h); this.camera.updateProjectionMatrix();
    this.fx.mat.uniforms.uScale.value = (h * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  /* ------------------------------------------------------------ apresentar uma caixa (entra caindo e fica em idle) */
  present(type, o = {}) {
    if (!this.ready) return; const B = this.boxes[type]; if (!B) return;
    for (const k in this.boxes) this.boxes[k].group.visible = k === type;
    this.type = type; this.box = B; this._resetLid(); this._clearFx(); this.rarity = clamp(o.rarity | 0, 0, 3);
    this.col.set(RARITY[0].hex); this.colT.copy(this.col); this.charge = 0; this.kick = 0; this.flash = 0; this.flashEl.style.opacity = 0; this.beamA = this.raysA = this.haloA = 0; this.camPull = 0;
    this.sy.x = this.sy.t = 1; this.sy.v = 0; this.holder.position.set(0, 0, 0); this.yawOff = 0; this.tilt = 0; this.baseYaw = -.5; this.fanfare = !!o.fanfare;
    this.shadow.scale.set(B.W * 1.5, B.D * 1.5, 1);
    if (o.instant) { this.mode = 'idle'; this.tm = 0; } else { this.mode = 'enter'; this.tm = 0; this.landed = false; this.holder.position.y = 6.5; Sfx.whoosh(.4); }
    this.lastType = type; this.start();
  }
  nudge() { if (this.mode === 'idle' || this.mode === 'enter') { this.sy.v -= 3.2; Sfx.tick(0); haptic(10); } }

  /* ------------------------------------------------------------ abrir: tap → carga → pulsos de raridade → explosão → revelação */
  open(o = {}) {
    if (!this.ready || this.mode === 'open' || this.mode === 'hidden') return false;
    const type = this.type, r = clamp(o.rarity | 0, 0, 3), heavy = type === 'mecha' ? 1 : type === 'cyber' ? .5 : 0;
    const P = this.plan = { r, n: r + 1, tAnt: .30 + .12 * heavy, style: (window.CHEST3D?.styles?.[type]) || CFG.styles[type] || 'hinge' };
    const gap = .40 + .05 * heavy; P.pulseT = [...Array(P.n)].map((_, i) => P.tAnt + .24 + i * gap); P.tBurst = P.pulseT[P.n - 1] + .52 + .12 * heavy; P.tEnd = P.tBurst + (window.CHEST3D?.reveal?.[type] || CFG.reveal[type] || 1.8);
    this.opts = o; this.mode = 'open'; this.T = 0; this.ev = { pulse: 0, burst: false, finishing: false, done: false }; this.hitstop = 0; this.rewards = o.rewards || { coin: 1, token: 1 };
    this.sy.t = .84; this.sy.v = -2; this.holder.position.y = 0; this.mist = 0;
    Sfx.unlock(); Sfx.thump(.5); Sfx.riser(P.tBurst); haptic([14, 20, 14]);
    this.start(); return true;
  }
  skip() { if (this.mode === 'open' && this.ev.burst && !this.ev.finishing) this.T = Math.max(this.T, this.plan.tEnd - .3); }

  /* ------------------------------------------------------------ loop */
  start() { if (this.running) return; this.running = true; this._last = performance.now(); this._raf = requestAnimationFrame(this._loop = t => { if (!this.running) return; const dt = Math.min(.05, (t - this._last) / 1000); this._last = t; this.step(dt); this.render(); this._raf = requestAnimationFrame(this._loop); }); }
  stop() { this.running = false; cancelAnimationFrame(this._raf); }
  hide() { this.stop(); this.mode = 'hidden'; this._clearFx(); this.flashEl.style.opacity = 0; if (this.wrap.parentNode) this.wrap.remove(); }
  render() { if (this.ready && this.cw) this.renderer.render(this.scene, this.camera); }

  step(dt) {
    if (!this.ready) return; this.time += dt; const B = this.box; if (!B) return;
    this.floorMat.uniforms.uTime.value = this.time; this.raysMat.uniforms.uTime.value = this.time; this.beamMat.uniforms.uTime.value = this.time;
    if (this.mode === 'enter') this._tickEnter(dt); else if (this.mode === 'idle') this._tickIdle(dt); else if (this.mode === 'open') this._tickOpen(dt);
    /* squash & stretch (preserva volume) */
    const sy = this.sy.step(dt), sxz = 1 / Math.sqrt(Math.max(.3, sy)); this.sq.scale.set(sxz, sy, sxz);
    /* cor / brilho (circuitos do casco, núcleo, luz do poço) */
    this.col.lerp(this.colT, 1 - Math.exp(-14 * dt)); this.kick *= Math.exp(-7 * dt);
    const m = this.data.mats; m.shell.emissive.copy(this.col); m.seam.color.copy(this.col); m.core.color.copy(this.col).multiplyScalar(.6 + this.coreK * .8);
    this.floorMat.uniforms.uColor.value.copy(this.col); this.floorGlow.uniforms.uColor.value.copy(this.col); this.floorGlow.uniforms.uA.value = this.glow; this.floorMat.uniforms.uGlow.value = this.glow; this.floorMat.uniforms.uCharge.value = this.charge;
    this.pl.color.copy(this.col); this.lights.rim.color.copy(this.col).lerp(new THREE.Color(0xffffff), .3);
    /* sombra acompanha a altura */
    const h = this.holder.position.y, sh = clamp(1 - h * .16, .15, 1); this.shadow.material.opacity = .85 * sh; this.shadow.scale.set(B.W * 1.5 * (1 + h * .08), B.D * 1.5 * (1 + h * .08), 1);
    this._tickFx(dt); this._tickCamera(dt);
    this.flash = Math.max(0, this.flash - dt * 3.2 * (this.ev?.finishing ? 0 : 1)); this.flashEl.style.opacity = String(clamp(this.flash, 0, 1) * .95);
  }

  /* ---------- entrada: a caixa cai girando, amassa no chão e solta poeira de energia */
  _tickEnter(dt) {
    this.tm += dt; const T = this.tm, Tf = .5, B = this.box;
    if (T < Tf) { const u = T / Tf; this.holder.position.y = 6.5 * (1 - u * u); this.yawOff = -2.8 * (1 - easeOutCubic(u)); this.tilt = .38 * (1 - u); this.glow = .2 + u * .3;
      if (Math.random() < .8) this.fx.emit({ pos: [rnd(-.4, .4), this.holder.position.y + B.H * .5 + rnd(0, .8), rnd(-.3, .3)], vel: [0, 2.5, 0], life: .35, s0: .09, s1: 0, color: hexRGB(0x38f2ff), kind: 0, alpha: .8 }); }
    else {
      if (!this.landed) { this.landed = true; this.holder.position.y = 0; this.yawOff = 0; this.tilt = 0; this.sy.v = -7.5; this._shock(0, .9, 5.2); this.shake = Math.max(this.shake, .11); this.glow = 1; Sfx.thump(1);
        haptic(22); for (let i = 0; i < 26; i++) { const a = rnd(0, 6.283), s = rnd(1.2, 3.4); this.fx.emit({ pos: [Math.cos(a) * .7, .06, Math.sin(a) * .7], vel: [Math.cos(a) * s, rnd(.4, 1.6), Math.sin(a) * s], life: rnd(.4, .8), s0: rnd(.08, .17), s1: 0, color: hexRGB(0x7fd8ff), kind: i % 3 ? 0 : 1, alpha: .85, drag: 2.2 }); } }
      this.glow = lerp(this.glow, .38, 1 - Math.exp(-3 * dt)); if (T > Tf + .5) { this.mode = 'idle'; this.tm = 0; if (this.fanfare) this._arrivalBurst(); }
    }
    this._applyIdlePose(0);
  }
  _arrivalBurst() { Sfx.sparkle(0); this._ring3d(.9); for (let i = 0; i < 40; i++) { const a = rnd(0, 6.283), s = rnd(1.5, 4); this.fx.emit({ pos: [0, this.box.H * .55, 0], vel: [Math.cos(a) * s, rnd(1, 4), Math.sin(a) * s], life: rnd(.7, 1.3), s0: rnd(.1, .22), s1: 0, color: hexRGB(i % 3 ? 0x38f2ff : 0xffffff), kind: 1, alpha: 1, grav: -2, drag: 1.4 }); } }

  /* ---------- idle: respira, balança de leve, circuitos pulsam e soltam faíscas */
  _tickIdle(dt) {
    this.tm += dt; const t = this.tm, B = this.box; this.glow = .36 + .08 * Math.sin(t * 2.1); this.charge = 0;
    this._applyIdlePose(t); this.coreK = 0; this.data.mats.seam.opacity = .1 + .08 * Math.sin(t * 2.4);
    this.data.mats.shell.emissiveIntensity = .55 + .22 * Math.sin(t * 2.1) + this.kick * 2;
    if (Math.random() < dt * 7) this.fx.emit({ pos: [rnd(-B.W * .4, B.W * .4), rnd(.1, B.H), rnd(-B.D * .4, B.D * .4)], vel: [rnd(-.15, .15), rnd(.4, .9), rnd(-.15, .15)], life: rnd(.9, 1.6), s0: rnd(.05, .11), s1: 0, color: hexRGB(0x7fe9ff), kind: Math.random() < .3 ? 1 : 0, alpha: .75 });
  }
  _applyIdlePose(t) { this.sq.rotation.y = this.baseYaw + this.yawOff + Math.sin(t * .7) * .2; this.sq.rotation.x = this.tilt; this.holder.position.y += (this.mode === 'idle' ? Math.sin(t * 1.6) * .035 : 0); }

  /* ---------- o show: carga, pulsos, explosão, revelação */
  _tickOpen(dt) {
    const P = this.plan, B = this.box; let ts = 1; if (this.hitstop > 0) { this.hitstop -= dt; ts = .1; }
    this.T += dt * ts; const T = this.T, E = this.ev;
    const c = smooth(P.tAnt, P.tBurst, T), cc = Math.pow(c, 1.35); this.charge = E.burst ? 0 : c;
    if (T >= P.tAnt && !E.rebound) { E.rebound = true; this.sy.t = 1.03; this.sy.v = 5; }
    /* pulsos de raridade: a cor sobe degrau a degrau (cinza→azul→roxo→dourado) */
    while (E.pulse < P.n && T >= P.pulseT[E.pulse]) {
      const i = E.pulse++, ci = LADDER[P.r][i]; this.colT.set(RARITY[ci].hex); this.kick = 1; this.sy.v += 3.4 + i; this.shake = Math.max(this.shake, .045 + .02 * i); this.flash = Math.max(this.flash, .1 + .05 * i);
      this._shock(i % 3, 1, 3.2 + i * .5, this.colT); Sfx.tick(i); haptic(16 + i * 8); this._steam(1 + i, this.colT);
      if (i === P.n - 1 && P.r >= 2) this.flash = Math.max(this.flash, .3);
    }
    if (!E.burst) {
      const f = 28 + 46 * cc, amp = .012 + .1 * cc + this.kick * .035;
      this.sq.rotation.z = Math.sin(T * f) * amp; this.sq.rotation.x = Math.sin(T * f * .83 + 1.3) * amp * .6; this.sq.rotation.y = this.baseYaw * (1 - easeOutCubic(T / (P.tAnt + .5))) + Math.sin(T * f * .5) * amp * .5;
      this.holder.position.set(Math.sin(T * f * 1.1) * amp * .22, .22 * cc * cc + Math.sin(T * 3) * .02 * c, 0);
      this.data.mats.shell.emissiveIntensity = .55 + 3.4 * cc + this.kick * 2.6; this.data.mats.seam.opacity = clamp((.15 + c * .9 + this.kick * .5) * (.85 + .15 * Math.sin(T * 60)), 0, 1);
      this.glow = .4 + c * 1.1 + this.kick * .6; this.coreK = 0; this.pl.intensity = 0;
      /* energia sendo sugada para dentro */
      if (T > P.tAnt) { const n = Math.floor((18 + 120 * c) * dt + Math.random()); for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), el = rnd(-.2, 1), R = rnd(1.8, 3.2) * (1 - c * .25); const x = Math.cos(a) * R, z = Math.sin(a) * R, y = B.H * .5 + el * 1.4; this.fx.emit({ pos: [x, y, z], vel: [-x * 2.9, (B.H * .5 - y) * 2.9, -z * 2.9], life: .62, s0: rnd(.05, .13), s1: .01, color: hexRGB(RARITY[LADDER[P.r][Math.min(E.pulse, P.n) - 1 < 0 ? 0 : Math.min(E.pulse, P.n) - 1]].hex), kind: Math.random() < .25 ? 1 : 0, alpha: .9 }); } }
      if (T >= P.tBurst) this._burst();
    } else {
      const Tb = T - P.tBurst; this._tickPost(dt, Tb);
      if (!E.finishing && T >= P.tEnd - .3) { E.finishing = true; }
      if (E.finishing) { this.flash = Math.max(this.flash, smooth(P.tEnd - .3, P.tEnd, T)); this.flashEl.style.opacity = String(clamp(this.flash, 0, 1)); }
      if (!E.done && T >= P.tEnd) { E.done = true; this.mode = 'done'; try { this.opts.onDone && this.opts.onDone(); } catch (e) { console.error(e); } }
    }
  }

  _burst() {
    const P = this.plan, B = this.box, E = this.ev, r = P.r, type = this.type, big = type === 'mecha' ? 1.35 : type === 'cyber' ? 1.1 : .9; E.burst = true; this.hitstop = .09;
    this.colT.set(RARITY[r].hex); this.col.copy(this.colT); this.flash = 1; this.shake = .2 * big + .03 * r; this.fovKick = 5 + 2.5 * big; this.sy.t = 1; this.sy.v = -9 * big;
    this.sq.rotation.set(0, 0, 0); this.sq.rotation.y = 0; this.holder.position.set(0, 0, 0); this.data.mats.seam.opacity = 1;
    Sfx.boom(big); Sfx.sparkle(r); Sfx.whoosh(.7); haptic([40, 25, 70, 30, 110], 1 + r * .1);
    /* tampa */
    this._startLid(P.style);
    /* luz: poço de energia, feixe, raios, halo, ondas */
    this.coreK = 1; this.pl.intensity = 16 * big + 4 * r; this.beamA = 1; this.raysA = 1; this.haloA = 1; this.beam.visible = this.rays.visible = this.halo.visible = true;
    [this.beamMat, this.raysMat, this.haloMat].forEach(m => m.uniforms.uColor.value.copy(this.col).lerp(new THREE.Color(0xffffff), .35));
    this._shock(0, 1.1, 7.5 * big, null, true); setTimeout(() => this._shock(1, .9, 5.5 * big), 110); this._ring3d(1.1);
    /* faíscas */
    const top = B.cutY + .05, n = Math.round(120 + 40 * r) * big, rgb = hexRGB(RARITY[r].hex);
    for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), up = rnd(.4, 1), s = rnd(2.5, 9) * big; this.fx.emit({ pos: [Math.cos(a) * .3, top, Math.sin(a) * .3], vel: [Math.cos(a) * s * (1 - up * .5), s * up * 1.1, Math.sin(a) * s * (1 - up * .5)], life: rnd(.7, 1.6), s0: rnd(.08, .22), s1: 0, color: i % 4 ? rgb : [1, 1, 1], kind: i % 5 === 0 ? 1 : i % 7 === 0 ? 3 : 0, alpha: 1, grav: -7, drag: .6 }); }
    /* estilhaços de casco */
    this._chips(Math.round(18 + 6 * r * big));
    /* recompensas jorrando */
    setTimeout(() => { if (this.mode === 'open') this._fountain(); }, 140);
    try { this.opts.onBurst && this.opts.onBurst(r); } catch (e) { console.error(e); }
  }

  /* ---------- pós-explosão ---------- */
  _tickPost(dt, Tb) {
    const P = this.plan, B = this.box, r = P.r, reveal = P.tEnd - P.tBurst;
    /* feixe, raios, halo: ataque rápido e queda suave */
    const env = Tb < .12 ? Tb / .12 : Math.max(0, 1 - Math.pow((Tb - .12) / (reveal - .1), 1.6)); const a = clamp(env, 0, 1);
    const top = B.cutY + .04; this.beam.position.set(0, top, 0); this.beam.scale.set(1.5 + .5 * r + a * .5, 11, 1); this.beam.rotation.y = Math.atan2(this.camera.position.x, this.camera.position.z); this.beamMat.uniforms.uA.value = a * 1.1;
    this.rays.position.set(0, top + .5, 0); this.rays.quaternion.copy(this.camera.quaternion); this.rays.scale.setScalar(.8 + Tb * .45 + r * .1); this.raysMat.uniforms.uA.value = a * (.7 + .1 * r);
    this.halo.position.set(0, top + .3, 0); this.halo.quaternion.copy(this.camera.quaternion); this.halo.scale.setScalar(1 + Math.sin(Math.min(1, Tb / .5) * Math.PI) * .6 + .5); this.haloMat.uniforms.uA.value = a * 1.1;
    this.pl.intensity = (16 + 4 * r) * a; this.pl.position.set(0, top + .6, 0); this.coreK = .5 + a * .5; this.glow = .5 + a * 1.2;
    this.data.mats.shell.emissiveIntensity = lerp(3.4, 1.1, clamp(Tb / .8)); this.data.mats.seam.opacity = Math.max(0, 1 - Tb * 2.2);
    this.sq.rotation.z = Math.sin(Tb * 38) * .05 * Math.exp(-Tb * 6); this.sq.rotation.y = this.baseYaw * easeOutCubic(Tb / 1.2) * .0;
    this._tickLid(dt, Tb);
    /* brasas contínuas saindo do poço */
    if (Tb < reveal - .3 && Math.random() < dt * (40 + 20 * r)) { const a2 = rnd(0, 6.283), rr = rnd(0, .45); this.fx.emit({ pos: [Math.cos(a2) * rr, top, Math.sin(a2) * rr], vel: [Math.cos(a2) * .5, rnd(2.5, 5.5), Math.sin(a2) * .5], life: rnd(.8, 1.5), s0: rnd(.05, .13), s1: 0, color: hexRGB(RARITY[r].hex), kind: Math.random() < .3 ? 1 : 0, alpha: .9, drag: .3 }); }
    this.camPull = easeOutCubic(Tb / 1.1);
  }

  /* ---------- tampa (3 estilos) ---------- */
  _resetLid() { const B = this.box; if (!B) return; B.pivot.position.set(0, 0, 0); B.lid.position.set(0, 0, 0); B.pivot.rotation.set(0, 0, 0); B.pivot.scale.setScalar(1); B.pivot.visible = true; this.lid = null; this.beam && (this.beam.visible = this.rays.visible = this.halo.visible = false); this.pl && (this.pl.intensity = 0); this.coreK = 0; this.data.mats.seam.opacity = 0; }
  _setPivot(x, y, z) { const B = this.box; B.pivot.position.set(x, y, z); B.lid.position.set(-x, -y, -z); }
  _startLid(style) {
    const B = this.box, hl = B.H - B.cutY; this.lid = { style };
    if (style === 'hinge') { this._setPivot(B.cx, B.cutY, B.cz - B.D * .46); this.lid.sp = new Spring(0, 70, 6.5); this.lid.sp.t = 2.05; this.lid.sp.v = 14; }
    else { this._setPivot(B.cx, B.cutY + hl * .5, B.cz); this.lid.v = new THREE.Vector3(0, style === 'launch' ? 9 : 4.6, style === 'launch' ? -.6 : -.5); this.lid.p = new THREE.Vector3(); this.lid.rv = style === 'launch' ? new THREE.Vector3(3.4, 2.2, 7) : new THREE.Vector3(.8, 9.5, .6); this.lid.r = new THREE.Vector3(); }
  }
  _tickLid(dt, Tb) {
    const L = this.lid, B = this.box; if (!L) return;
    if (L.style === 'hinge') { B.pivot.rotation.x = -L.sp.step(dt); const lift = Math.sin(clamp(Tb / .5) * Math.PI) * .12; B.pivot.position.y = B.cutY + lift; return; }
    if (L.style === 'levitate') {                       /* hextech: sobe girando, desacelera, depois some para trás/cima */
      const u = clamp(Tb / 1.0); L.v.y = lerp(4.6, .55, easeOutCubic(u)) + (Tb > 1 ? 1.7 * (Tb - 1) : 0); L.rv.y = lerp(9.5, 1.2, easeOutCubic(u)); L.v.z = Tb > 1 ? -1.4 : -.5;
    } else {                                            /* propulsor: acelera para cima com rastro de fogo */
      if (Tb < .5) L.v.y += 30 * dt; L.v.y += -2 * dt;
      if (Tb < .9 && L.p) { B.pivot.getWorldPosition(TMP); for (let i = 0; i < 3; i++) this.fx.emit({ pos: [TMP.x + rnd(-.2, .2), TMP.y - .1, TMP.z + rnd(-.2, .2)], vel: [rnd(-.8, .8), rnd(-3, -.5), rnd(-.8, .8)], life: rnd(.25, .55), s0: rnd(.14, .28), s1: 0, color: i % 2 ? hexRGB(0xffe9a8) : hexRGB(RARITY[this.plan.r].hex), kind: 0, alpha: .95, drag: 1.5 }); }
    }
    L.p.addScaledVector(L.v, dt); L.r.addScaledVector(L.rv, dt); B.pivot.position.set(B.cx + L.p.x, B.cutY + (B.H - B.cutY) * .5 + L.p.y, B.cz + L.p.z); B.pivot.rotation.set(L.r.x, L.r.y, L.r.z);
    if (L.style === 'levitate') B.pivot.scale.setScalar(Math.max(.01, 1 - Math.max(0, Tb - 1.2) * .6)); if (L.p.y > 11) B.pivot.visible = false;
  }

  /* ---------- efeitos auxiliares ---------- */
  _shock(i, a = 1, s = 5, color = null, strong = false) {
    const m = this.rings[i % this.rings.length]; m.visible = true; m.userData = { t: 0, dur: strong ? 1.1 : .8, maxS: s * 1.0, a }; m.scale.set(1, 1, 1);
    m.material.uniforms.uColor.value.copy(color || this.col).lerp(new THREE.Color(0xffffff), .25);
  }
  _ring3d(a = 1) { const m = this.bbRing; m.visible = true; m.userData = { t: 0, dur: .9, maxS: 9, a }; m.material.uniforms.uColor.value.copy(this.col).lerp(new THREE.Color(0xffffff), .4); }
  _steam(n, color) { const B = this.box, rgb = [color.r, color.g, color.b]; for (let i = 0; i < 6 * n; i++) { const a = rnd(0, 6.283), rr = Math.max(B.W, B.D) * .45; this.fx.emit({ pos: [Math.cos(a) * rr, B.cutY, Math.sin(a) * rr * (B.D / B.W)], vel: [Math.cos(a) * 1.4, rnd(.5, 1.6), Math.sin(a) * 1.4], life: rnd(.5, .9), s0: rnd(.12, .22), s1: .02, color: [rgb[0] * .6 + .4, rgb[1] * .6 + .4, rgb[2] * .6 + .4], kind: i % 3 ? 0 : 3, alpha: .9, drag: 1.6 }); } }
  _chips(n) {
    this.chipData.length = 0; const B = this.box; this.chipMat.emissive.copy(this.col);
    for (let i = 0; i < n && i < 44; i++) { const a = rnd(0, 6.283), s = rnd(2.2, 5.5); this.chipData.push({ p: new THREE.Vector3(Math.cos(a) * B.W * .4, B.cutY + rnd(-.2, .1), Math.sin(a) * B.D * .4), v: new THREE.Vector3(Math.cos(a) * s, rnd(3, 7.5), Math.sin(a) * s), r: new THREE.Euler(rnd(0, 6), rnd(0, 6), rnd(0, 6)), w: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), s: rnd(.6, 1.5), life: rnd(1.1, 1.8), age: 0 }); }
    this.chips.count = this.chipData.length;
  }
  _fountain() {
    if (!this.itemTex) return; const R = this.rewards, rar = this.plan.r, B = this.box; const kinds = [];
    const want = { coin: R.coins ?? R.coin ?? 1, token: R.tokens ?? R.token ?? 1, gem: R.gems ?? R.gem ?? 0 };
    const total = 12 + rar * 4 + (this.type === 'mecha' ? 6 : this.type === 'cyber' ? 3 : 0); const wsum = (want.coin ? 4 : 0) + (want.token ? 3 : 0) + (want.gem ? 2.2 : 0) || 1;
    for (const k of ['coin', 'token', 'gem']) { if (!want[k]) continue; const n = Math.max(1, Math.round(total * ({ coin: 4, token: 3, gem: 2.2 }[k]) / wsum)); for (let i = 0; i < n; i++) kinds.push(k); }
    kinds.sort(() => Math.random() - .5); let sfxAt = 0;
    kinds.forEach((k, i) => {
      let it = this.items.find(x => !x.on); if (!it) { if (this.items.length >= 40) return; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false })); sp.renderOrder = 21; this.itemGroup.add(sp); it = { sp, on: false }; this.items.push(it); }
      it.on = true; it.k = k; it.sp.material.map = this.itemTex[k]; it.sp.material.needsUpdate = true; it.sp.visible = false; it.delay = i * .028 + rnd(0, .05); it.age = 0; it.life = rnd(1.35, 1.8);
      it.p = new THREE.Vector3(rnd(-.15, .15), B.cutY + .05, rnd(-.1, .1)); it.v = new THREE.Vector3(rnd(-2.4, 2.4), rnd(6, 9.5), rnd(-1.2, 1.6)); it.spin = rnd(6, 14); it.ph = rnd(0, 6); it.size = (k === 'gem' ? .5 : .42) * rnd(.9, 1.15) * (1 + rar * .05);
    });
  }
  _clearFx() { if (!this.fx) return; this.fx.clear(); this.items.forEach(i => { i.on = false; i.sp.visible = false; }); this.chips.count = 0; this.chipData.length = 0; this.rings.forEach(m => m.visible = false); this.bbRing.visible = false; this.beam.visible = this.rays.visible = this.halo.visible = false; this.shake = 0; this.fovKick = 0; }

  _tickFx(dt) {
    this.fx.update(dt);
    for (const m of [...this.rings, this.bbRing]) {
      if (!m.visible) continue; const u = m.userData; u.t += dt; const k = u.t / u.dur; if (k >= 1) { m.visible = false; continue; }
      const e = easeOutCubic(k), isBB = m === this.bbRing; m.scale.setScalar(.4 + e * u.maxS * (isBB ? 1 : 1)); const mt = m.material.uniforms; mt.uR.value = .9; mt.uW.value = .045 + .05 * (1 - k); mt.uA.value = (u.a ?? 1) * Math.pow(1 - k, 1.5);
      if (isBB) { m.position.set(0, (this.box?.cutY || 1) + .2, 0); m.quaternion.copy(this.camera.quaternion); }
    }
    /* estilhaços com gravidade e quique */
    if (this.chips.count) {
      const d = new THREE.Object3D(); let alive = 0;
      this.chipData.forEach((c, i) => { c.age += dt; c.v.y -= 15 * dt; c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt; if (c.p.y < .06) { c.p.y = .06; c.v.y *= -.38; c.v.x *= .7; c.v.z *= .7; c.w.multiplyScalar(.6); }
        const k = c.age < c.life ? 1 : Math.max(0, 1 - (c.age - c.life) * 3); if (k > 0) alive++; d.position.copy(c.p); d.rotation.copy(c.r); d.scale.setScalar(c.s * k); d.updateMatrix(); this.chips.setMatrixAt(i, d.matrix); });
      this.chips.instanceMatrix.needsUpdate = true; if (!alive) this.chips.count = 0;
    }
    /* itens da fonte (moeda / ficha / gema) */
    for (const it of this.items) {
      if (!it.on) continue; it.delay -= dt; if (it.delay > 0) continue; if (!it.sp.visible) { it.sp.visible = true; Sfx.coin(Math.floor(rnd(0, 6))); }
      it.age += dt; it.v.y -= 15.5 * dt; it.p.addScaledVector(it.v, dt); it.sp.position.copy(it.p); const k = Math.min(1, (it.life - it.age) / .3), kin = Math.min(1, it.age / .1);
      if (it.age >= it.life || it.p.y < .1) { it.on = false; it.sp.visible = false; continue; }
      const sp = it.size * clamp(k) * easeOutBack(kin), flip = Math.cos(it.age * it.spin + it.ph); it.sp.scale.set(sp * (.25 + .75 * Math.abs(flip)), sp, 1); it.sp.material.opacity = clamp(k + .2);
    }
  }

  /* ---------- câmera: dolly na carga, FOV-punch + tremor na explosão, puxada na revelação ---------- */
  _tickCamera(dt) {
    if (!this.baseDist) return; const c = this.camera, open = this.mode === 'open' || this.mode === 'done'; this.shake *= Math.exp(-5.5 * dt); this.fovKick *= Math.exp(-6 * dt);
    const dolly = open ? 1 - .12 * this.charge + .1 * this.camPull : 1, dist = this.baseDist * dolly, pitch = THREE.MathUtils.degToRad(23 - 3 * this.camPull);
    const az = open ? Math.sin(this.time * .8) * .03 + this.camPull * -.08 : Math.sin(this.time * .35) * .025;
    const sx = (Math.sin(this.time * 71) + Math.sin(this.time * 43)) * .5 * this.shake, sy = (Math.sin(this.time * 57 + 2) + Math.sin(this.time * 29)) * .5 * this.shake;
    const tgt = this.camTarget.clone(); tgt.y = .1 + (this.box ? this.box.H * .42 : .4);
    c.position.set(tgt.x + Math.sin(az) * dist * Math.cos(pitch) + sx, tgt.y + Math.sin(pitch) * dist + sy, tgt.z + Math.cos(az) * dist * Math.cos(pitch)); c.lookAt(tgt);
    const f = 30 + this.fovKick; if (Math.abs(c.fov - f) > .01) { c.fov = f; c.updateProjectionMatrix(); }
  }

  /* ------------------------------------------------------------ ícone estático (usado para gerar os PNGs das caixas) */
  icon(type, w = 512, h = 512, yaw = -.55) {
    const B = this.boxes[type]; for (const k in this.boxes) this.boxes[k].group.visible = k === type; this.box = B; this._resetLid(); this._clearFx();
    [this.floor, this.shadow].forEach(m => m.visible = false); this.floorGlow && (this.scene.children.forEach(o => { if (o.material === this.floorGlow) o.visible = false; }));
    this.sy.x = this.sy.t = 1; this.sy.v = 0; this.holder.position.set(0, 0, 0); this.sq.scale.set(1, 1, 1); this.sq.rotation.set(0, yaw, 0); this.col.set(0x38f2ff); this.data.mats.shell.emissive.copy(this.col); this.data.mats.shell.emissiveIntensity = 1.1; this.data.mats.seam.opacity = 0; this.data.mats.core.color.set(0x38f2ff);
    this.renderer.setPixelRatio(1); this.renderer.setSize(w, h, false); const c = this.camera; c.clearViewOffset(); c.aspect = w / h; c.fov = 24; c.updateProjectionMatrix();
    const mid = new THREE.Vector3(0, B.H * .5 - .02, 0), d = (B.H * 1.55) / (2 * Math.tan(THREE.MathUtils.degToRad(c.fov) / 2)) * 1.25; const pitch = THREE.MathUtils.degToRad(24);
    c.position.set(mid.x + Math.sin(.05) * d, mid.y + Math.sin(pitch) * d, mid.z + Math.cos(pitch) * d); c.lookAt(mid); this.sq.updateMatrixWorld(true); this.renderer.render(this.scene, c);
    const url = this.canvas.toDataURL('image/png'); [this.floor, this.shadow].forEach(m => m.visible = true); this.scene.children.forEach(o => { if (o.material === this.floorGlow) o.visible = true; }); return url;
  }
}
