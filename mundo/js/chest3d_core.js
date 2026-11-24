/* CyberArena · chest3d_core (v154) — peças do motor das caixas 3D: leitor de GLB, shaders, partículas e sons sintetizados.
   Nada aqui depende do resto do jogo; só do three. A coreografia fica em chest3d.js. */
import * as THREE from '../lib/three.module.min.js';

/* ---------------------------------------------------------------- matemática / easing */
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutCubic = t => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = t => Math.pow(clamp(t), 3);
export const easeInOutCubic = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOutBack = t => { t = clamp(t); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
/* mola amortecida: dá o "tchan" de overshoot de squash/stretch e de tampa */
export class Spring {
  constructor(x = 0, k = 220, d = 14) { this.x = x; this.v = 0; this.t = x; this.k = k; this.d = d; }
  step(dt) { const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (-this.k * (this.x - this.t) - this.d * this.v) * h; this.x += this.v * h; } return this.x; }
}

/* ---------------------------------------------------------------- GLB (várias malhas + PBR embutido, sem compressão) */
export async function loadChestGLB(url, renderer) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('GLB inválido');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), s = off + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, s, len))); else if (type === 0x004e4942) bin = buf.slice(s, s + len);
    off = s + len + ((4 - len % 4) % 4);
  }
  const aniso = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  const texs = await Promise.all(json.textures.map(async (t, i) => {
    const im = json.images[t.source], bv = json.bufferViews[im.bufferView];
    const url2 = URL.createObjectURL(new Blob([new Uint8Array(bin, bv.byteOffset, bv.byteLength)], { type: im.mimeType }));
    const img = new Image(); img.src = url2; await img.decode(); URL.revokeObjectURL(url2);
    const T = new THREE.Texture(img); T.flipY = false; T.anisotropy = aniso; T.colorSpace = i === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace; T.needsUpdate = true; return T;
  }));
  const acc = i => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type];
    const C = a.componentType === 5126 ? Float32Array : a.componentType === 5123 ? Uint16Array : Uint32Array;
    return { arr: new C(bin, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n), n };
  };
  const mats = {};
  for (const m of json.materials) {
    const f = m.pbrMetallicRoughness || {};
    if (m.name === 'shell') {
      mats.shell = new THREE.MeshStandardMaterial({ map: texs[f.baseColorTexture.index], metalnessMap: texs[f.metallicRoughnessTexture.index], roughnessMap: texs[f.metallicRoughnessTexture.index],
        normalMap: texs[m.normalTexture.index], emissiveMap: texs[m.emissiveTexture.index], emissive: new THREE.Color(0x38f2ff), emissiveIntensity: .6, metalness: 1, roughness: 1 });
    } else if (m.name === 'inner') {
      mats.inner = new THREE.MeshStandardMaterial({ color: new THREE.Color().setRGB(...f.baseColorFactor.slice(0, 3)), metalness: f.metallicFactor, roughness: f.roughnessFactor, emissive: new THREE.Color(0x0a3a5a), side: THREE.DoubleSide });
    } else if (m.name === 'core') {
      mats.core = new THREE.MeshBasicMaterial({ color: 0x38f2ff, side: THREE.DoubleSide, toneMapped: false });
    } else if (m.name === 'seam') {
      mats.seam = new THREE.MeshBasicMaterial({ color: 0x38f2ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    }
  }
  const matByIdx = json.materials.map(m => mats[m.name]);
  const meshes = json.meshes.map(m => m.primitives.map(p => {
    const g = new THREE.BufferGeometry(), P = acc(p.attributes.POSITION), N = acc(p.attributes.NORMAL), U = acc(p.attributes.TEXCOORD_0), I = acc(p.indices);
    g.setAttribute('position', new THREE.BufferAttribute(P.arr, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N.arr, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U.arr, 2));
    g.setIndex(new THREE.BufferAttribute(I.arr, 1)); g.computeBoundingSphere();
    return { geo: g, mat: matByIdx[p.material] };
  }));
  const boxes = {};
  for (const ni of json.scenes[json.scene].nodes) {
    const nd = json.nodes[ni], ex = nd.extras, B = { name: nd.name, ...ex, parts: {} };
    for (const ci of nd.children) { const c = json.nodes[ci], key = c.name.split('_')[1]; B.parts[key] = meshes[c.mesh]; }
    boxes[nd.name] = B;
  }
  return { boxes, mats, textures: texs };
}

/* ---------------------------------------------------------------- ambiente (reflexos de softboxes neon) */
export function buildEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(24, 14, 24), new THREE.MeshBasicMaterial({ color: 0x070d1c, side: THREE.BackSide })));
  const panel = (w, h, col, k, x, y, z, ry, rx) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); s.add(m);
  };
  panel(10, 10, 0xffffff, 5.5, 0, 6.8, 0, 0, Math.PI / 2);
  panel(12, 3.5, 0x38f2ff, 4.5, -11.8, 2.5, 2, Math.PI / 2);
  panel(12, 3.5, 0xb45cff, 3.8, 11.8, 1.5, -2, -Math.PI / 2);
  panel(9, 2.2, 0xffe2b8, 3.2, 0, 3.4, 11.8, Math.PI);
  panel(16, 3, 0x2f6bff, 3, 0, 2.2, -11.8, 0);
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(s, .035); pm.dispose();
  s.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  return rt.texture;
}

/* ---------------------------------------------------------------- shaders */
const VERT_PLANE = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }';
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };

export function makeFloor() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: true, uniforms: { uColor: { value: new THREE.Color(0x38f2ff) }, uGlow: { value: .3 }, uTime: { value: 0 }, uCharge: { value: 0 } }, vertexShader: VERT_PLANE,
    fragmentShader: `uniform vec3 uColor; uniform float uGlow,uTime,uCharge; varying vec2 vUv;
    float hexd(vec2 p){ p=abs(p); return max(dot(p,normalize(vec2(1.,1.7320508))),p.x); }
    void main(){
      vec2 p=(vUv-.5)*2.; float r=length(p); float edge=smoothstep(1.,.80,r);
      vec3 base=mix(vec3(.012,.018,.045),vec3(.035,.055,.11),smoothstep(1.,0.,r));
      float ring=0.; float wob=sin(uTime*2.+r*9.)*.012*uCharge;
      for(int i=0;i<4;i++){ float rr=.30+float(i)*.17-uCharge*.05*float(i); ring+=smoothstep(.011,0.,abs(r-rr+wob))*(1.-float(i)*.14); }
      vec2 q=p*6.5; vec2 s=vec2(1.,1.7320508); vec2 a=mod(q,s)-s*.5; vec2 b=mod(q-s*.5,s)-s*.5; vec2 g=dot(a,a)<dot(b,b)?a:b;
      float grid=smoothstep(.05,0.,abs(hexd(g)-.46));
      float sweep=smoothstep(.05,0.,abs(r-fract(uTime*.55)*1.05))*uCharge;
      vec3 col=base+uColor*(ring*(.5+uGlow*1.6)+grid*.13*(.35+uGlow)*(1.-r*.8)+sweep*.9);
      col+=uColor*uGlow*.28*smoothstep(.75,0.,r);
      gl_FragColor=vec4(col,edge);
    }` });
  return m;
}
export function makeRing() {      /* anel de onda de choque (plano no chão ou billboard) */
  return new THREE.ShaderMaterial({ ...ADD, uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uR: { value: .1 }, uW: { value: .06 }, uA: { value: 1 } }, vertexShader: VERT_PLANE,
    fragmentShader: `uniform vec3 uColor; uniform float uR,uW,uA; varying vec2 vUv;
    void main(){ vec2 p=(vUv-.5)*2.; float r=length(p); float a=smoothstep(uW,0.,abs(r-uR))*uA; a+=smoothstep(uW*3.,0.,abs(r-uR))*uA*.25; a*=smoothstep(1.,.9,r); gl_FragColor=vec4(uColor,a); }` });
}
export function makeRays() {      /* raios de luz giratórios (billboard) */
  return new THREE.ShaderMaterial({ ...ADD, uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uA: { value: 0 }, uTime: { value: 0 } }, vertexShader: VERT_PLANE,
    fragmentShader: `uniform vec3 uColor; uniform float uA,uTime; varying vec2 vUv;
    void main(){ vec2 p=(vUv-.5)*2.; float r=length(p); float an=atan(p.y,p.x);
      float r1=pow(.5+.5*sin(an*11.+uTime*.9),4.); float r2=pow(.5+.5*sin(an*17.-uTime*1.3+1.7),5.); float r3=pow(.5+.5*sin(an*5.+uTime*.4),3.);
      float rays=(r1*.6+r2*.5+r3*.35); float fall=smoothstep(1.,.05,r)*(1./(1.+r*2.4));
      float core=smoothstep(.35,0.,r)*1.2;
      gl_FragColor=vec4(uColor,clamp((rays*fall*1.6+core)*uA,0.,1.)); }` });
}
export function makeBeam() {      /* pilar de luz vertical (billboard cilíndrico) */
  return new THREE.ShaderMaterial({ ...ADD, uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uA: { value: 0 }, uTime: { value: 0 } }, vertexShader: VERT_PLANE,
    fragmentShader: `uniform vec3 uColor; uniform float uA,uTime; varying vec2 vUv;
    void main(){ float x=abs(vUv.x*2.-1.); float side=pow(1.-x,1.8); float core=pow(1.-x,6.);
      float up=pow(1.-vUv.y,1.15); float streak=.72+.28*sin(vUv.x*38.+uTime*5.+vUv.y*7.)*sin(vUv.x*17.-uTime*3.);
      float a=(side*.55+core*1.1)*up*streak*uA; gl_FragColor=vec4(mix(uColor,vec3(1.),core*.7),clamp(a,0.,1.)); }` });
}
export function makeGlowSprite(hex) {     /* halo radial simples (fake bloom) */
  return new THREE.ShaderMaterial({ ...ADD, uniforms: { uColor: { value: new THREE.Color(hex || 0xffffff) }, uA: { value: 0 } }, vertexShader: VERT_PLANE,
    fragmentShader: `uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float r=length(vUv*2.-1.); float a=pow(smoothstep(1.,0.,r),2.2)*uA; gl_FragColor=vec4(uColor,a); }` });
}

/* ---------------------------------------------------------------- partículas aditivas (um único Points) */
export class Particles {
  constructor(max = 900) {
    this.max = max; this.cur = 0;
    const f = n => new Float32Array(max * n);
    this.pos = f(3); this.vel = f(3); this.col = f(4); this.size = f(1); this.kind = f(1); this.life = f(1); this.age = f(1); this.grav = f(1); this.drag = f(1); this.s0 = f(1); this.s1 = f(1); this.c0 = f(3); this.a0 = f(1);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aKind', new THREE.BufferAttribute(this.kind, 1));
    this.mat = new THREE.ShaderMaterial({ ...ADD, uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aColor; attribute float aSize; attribute float aKind; uniform float uScale; varying vec4 vC; varying float vK;
        void main(){ vC=aColor; vK=aKind; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=max(0.,aSize*uScale/(-mv.z)); }`,
      fragmentShader: `varying vec4 vC; varying float vK;
        void main(){ vec2 p=gl_PointCoord*2.-1.; float r=length(p); float a;
          if(vK<.5){ a=pow(smoothstep(1.,0.,r),2.); }
          else if(vK<1.5){ float c=exp(-abs(p.x)*10.)*exp(-abs(p.y)*1.7)+exp(-abs(p.y)*10.)*exp(-abs(p.x)*1.7); a=clamp(c*1.3+pow(smoothstep(.6,0.,r),2.)*.9,0.,1.)*smoothstep(1.,.75,r); }
          else if(vK<2.5){ a=smoothstep(.14,0.,abs(r-.72))*smoothstep(1.,.9,r); }
          else { float d=abs(p.x)*.8+abs(p.y)*1.25; a=smoothstep(1.,.78,d)*smoothstep(1.,.7,max(abs(p.x),abs(p.y))); }
          gl_FragColor=vec4(vC.rgb,a*vC.a); }` });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 20;
  }
  emit(o) {
    const i = this.cur; this.cur = (this.cur + 1) % this.max; const p = o.pos, v = o.vel || [0, 0, 0], c = o.color || [1, 1, 1];
    this.pos[i * 3] = p[0]; this.pos[i * 3 + 1] = p[1]; this.pos[i * 3 + 2] = p[2]; this.vel[i * 3] = v[0]; this.vel[i * 3 + 1] = v[1]; this.vel[i * 3 + 2] = v[2];
    this.c0[i * 3] = c[0]; this.c0[i * 3 + 1] = c[1]; this.c0[i * 3 + 2] = c[2]; this.a0[i] = o.alpha ?? 1; this.life[i] = o.life || 1; this.age[i] = 0;
    this.grav[i] = o.grav || 0; this.drag[i] = o.drag || 0; this.s0[i] = o.s0 ?? .1; this.s1[i] = o.s1 ?? 0; this.kind[i] = o.kind || 0;
    this.geo.attributes.aKind.needsUpdate = true;
  }
  update(dt) {
    const { pos, vel, col, size, life, age, grav, drag, s0, s1, c0, a0 } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt; if (age[i] >= life[i]) { life[i] = 0; size[i] = 0; col[i * 4 + 3] = 0; continue; }
      const t = age[i] / life[i], dr = Math.max(0, 1 - drag[i] * dt);
      vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr + grav[i] * dt; vel[i * 3 + 2] *= dr;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      size[i] = lerp(s0[i], s1[i], t);
      col[i * 4] = c0[i * 3]; col[i * 4 + 1] = c0[i * 3 + 1]; col[i * 4 + 2] = c0[i * 3 + 2];
      col[i * 4 + 3] = a0[i] * Math.min(1, t / .08) * Math.pow(1 - t, 1.4);
    }
    const a = this.geo.attributes; a.position.needsUpdate = a.aColor.needsUpdate = a.aSize.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.size.fill(0); this.col.fill(0); }
}

/* ---------------------------------------------------------------- som sintetizado (sem arquivos) — passa pelo volume de efeitos do jogo */
export const Sfx = (() => {
  let ctx = null, out = null, noiseBuf = null;
  const gainSetting = () => { try { return typeof getEffectsGain === 'function' ? getEffectsGain() : 1.2; } catch (_) { return 1.2; } };
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => { }); return true; }
    try {
      try { if (typeof ensureAudioGraph === 'function') ensureAudioGraph(); } catch (_) { }
      let shared = null; try { shared = (typeof audioContext !== 'undefined' && audioContext) || null; } catch (_) { }
      ctx = shared || new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain(); out.gain.value = 1;
      let dest = ctx.destination; try { if (shared && typeof audioMaster !== 'undefined' && audioMaster) dest = audioMaster; } catch (_) { }
      out.connect(dest);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (ctx.state === 'suspended') ctx.resume().catch(() => { });
      return true;
    } catch (_) { return false; }
  }
  const vol = () => Math.min(1.2, gainSetting() * .42);
  function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(.0001, t + a + d); }
  function osc(type, f0, f1, t, dur, peak, a = .005) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    env(g, t, a, peak * vol(), dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + .05);
  }
  function noise(t, dur, peak, f0, f1, type = 'lowpass', q = 1) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur); env(g, t, Math.min(.03, dur / 3), peak * vol(), dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random() * .5); s.stop(t + dur + .05);
  }
  const ok = fn => (...a) => { try { if (init()) fn(ctx.currentTime, ...a); } catch (_) { } };
  return {
    unlock: () => { try { init(); } catch (_) { } },
    thump: ok((t, k = 1) => { osc('sine', 150, 42, t, .26, .9 * k); noise(t, .12, .35 * k, 900, 120); }),
    tick: ok((t, i = 0) => { const f = 330 * Math.pow(2, i * 3 / 12); osc('triangle', f, f * 1.01, t, .16, .5); osc('sine', f * 2, f * 2, t, .1, .22); noise(t, .05, .2, 6000, 2500, 'highpass'); }),
    riser: ok((t, dur = 1.6) => { osc('sawtooth', 90, 760, t, dur, .22, dur * .9); noise(t, dur, .35, 300, 7000, 'bandpass', 2); osc('sine', 60, 240, t, dur, .5, dur * .8); }),
    boom: ok((t, k = 1) => { osc('sine', 110, 28, t, .7 * k + .3, 1.1); noise(t, .55, .8, 6000, 160); osc('square', 220, 55, t, .22, .25); noise(t + .02, .18, .5, 9000, 3000, 'highpass'); }),
    whoosh: ok((t, d = .55) => { noise(t, d, .45, 400, 5200, 'bandpass', 1.4); }),
    sparkle: ok((t, r = 0) => { const sc = [0, 4, 7, 11, 12, 16, 19, 23, 24]; const n = 5 + r * 2; for (let i = 0; i < n; i++) osc('sine', 660 * Math.pow(2, sc[i % sc.length] / 12), 660 * Math.pow(2, sc[i % sc.length] / 12), t + .08 + i * .065, .5, .26 - i * .012, .004); }),
    coin: ok((t, i = 0) => { osc('square', 1318 + i * 40, 1318 + i * 40, t, .09, .12); osc('square', 1760 + i * 40, 1760 + i * 40, t + .06, .16, .12); }),
  };
})();

/* ---------------------------------------------------------------- vibração (usa a do jogo se existir) */
export function haptic(p, k = 1) { try { if (typeof vibratePattern === 'function') vibratePattern(p, k); else if (navigator.vibrate) navigator.vibrate(p); } catch (_) { } }
