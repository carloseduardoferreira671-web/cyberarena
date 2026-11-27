/*
 * CyberArena · pós-processamento cinematográfico (sem depender de examples/jsm).
 *   cena → RT HDR (half float, MSAA opcional, com textura de profundidade)
 *   SSAO em meia resolução + borrão que respeita profundidade          (nível ≥ 2)
 *   bloom por filtro duplo (pirâmide de 4–5 níveis) sobre o HDR
 *   motion blur de câmera por reprojeção de profundidade               (nível ≥ 3)
 *   composição: aberração cromática de impacto, AO, bloom, grading, vinheta, grão → tone mapping + sRGB do three.
 * Níveis: 0 desligado · 1 bloom+grading · 2 + SSAO · 3 + motion blur e bloom máximo · 4 MÁXIMO (SSAO + bloom máximo + cores vivas + nitidez, SEM motion blur).
 */
import * as THREE from '../lib/three.module.min.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const mk = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial(Object.assign({
  vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false,
}, extra));

const F_AO = /* glsl */`
uniform sampler2D tDepth; uniform mat4 uProj; uniform mat4 uProjInv; uniform vec2 uTexel; uniform float uRadius; uniform float uStr;
varying vec2 vUv;
vec3 vp(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2. - 1., d * 2. - 1., 1.); return p.xyz / p.w; }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
void main(){
  float d0 = texture2D(tDepth, vUv).x;
  if (d0 >= .99999) { gl_FragColor = vec4(1.); return; }
  vec3 P = vp(vUv);
  float fade = 1. - smoothstep(30., 80., -P.z);
  if (fade <= 0.) { gl_FragColor = vec4(1.); return; }
  vec3 px = vp(vUv + vec2(uTexel.x, 0.)), nx = vp(vUv - vec2(uTexel.x, 0.));
  vec3 py = vp(vUv + vec2(0., uTexel.y)), ny = vp(vUv - vec2(0., uTexel.y));
  vec3 dx = abs(px.z - P.z) < abs(P.z - nx.z) ? px - P : P - nx;
  vec3 dy = abs(py.z - P.z) < abs(P.z - ny.z) ? py - P : P - ny;
  vec3 N = normalize(cross(dx, dy));
  if (dot(N, P) > 0.) N = -N;
  float rnd = ign(gl_FragCoord.xy);
  vec3 T = normalize(abs(N.y) < .9 ? cross(N, vec3(0., 1., 0.)) : cross(N, vec3(1., 0., 0.)));
  vec3 B = cross(N, T);
  float occ = 0.;
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    float a = (fi + rnd) * 2.3999632;
    float h = mix(.18, .95, fract(fi * .381966 + rnd));
    float s = sqrt(1. - h * h);
    vec3 dir = T * cos(a) * s + B * sin(a) * s + N * h;
    float r = uRadius * mix(.15, 1., (fi + 1.) / 12.);
    vec3 S = P + dir * r;
    vec4 pr = uProj * vec4(S, 1.);
    vec2 suv = pr.xy / pr.w * .5 + .5;
    if (suv.x < 0. || suv.x > 1. || suv.y < 0. || suv.y > 1.) continue;
    float sz = vp(suv).z;
    float rc = smoothstep(0., 1., uRadius / max(abs(P.z - sz), 1e-3));
    occ += (sz >= S.z + .03 * (1. + -P.z * .02) ? 1. : 0.) * rc;
  }
  float ao = 1. - occ / 12. * uStr * fade;
  gl_FragColor = vec4(vec3(clamp(ao, 0., 1.)), 1.);
}`;

const F_AOBLUR = /* glsl */`
uniform sampler2D tAO; uniform sampler2D tDepth; uniform mat4 uProjInv; uniform vec2 uTexel;
varying vec2 vUv;
float vz(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = uProjInv * vec4(uv * 2. - 1., d * 2. - 1., 1.); return p.z / p.w; }
void main(){
  float z0 = vz(vUv), tol = .08 + .02 * max(-z0, 0.);
  float sum = texture2D(tAO, vUv).x, w = 1.;
  for (int x = -2; x <= 2; x++) {
    for (int y = -2; y <= 2; y++) {
      if (x == 0 && y == 0) continue;
      vec2 uv = vUv + vec2(float(x), float(y)) * uTexel;
      float wt = exp(-abs(vz(uv) - z0) / tol);
      sum += texture2D(tAO, uv).x * wt; w += wt;
    }
  }
  gl_FragColor = vec4(vec3(sum / w), 1.);
}`;

const F_BRIGHT = /* glsl */`
uniform sampler2D tScene; uniform vec2 uTexel; uniform float uThr; uniform float uKnee;
varying vec2 vUv;
float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
void main(){
  vec3 a = texture2D(tScene, vUv + vec2(-1., -1.) * uTexel).rgb, b = texture2D(tScene, vUv + vec2(1., -1.) * uTexel).rgb;
  vec3 c = texture2D(tScene, vUv + vec2(-1., 1.) * uTexel).rgb, d = texture2D(tScene, vUv + vec2(1., 1.) * uTexel).rgb;
  float wa = 1. / (1. + lum(a)), wb = 1. / (1. + lum(b)), wc = 1. / (1. + lum(c)), wd = 1. / (1. + lum(d));
  vec3 col = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);
  col = min(col, vec3(60.));
  float br = max(col.r, max(col.g, col.b));
  float soft = clamp(br - uThr + uKnee, 0., 2. * uKnee); soft = soft * soft / (4. * uKnee + 1e-4);
  float k = max(soft, br - uThr) / max(br, 1e-4);
  gl_FragColor = vec4(col * k, 1.);
}`;

const F_DOWN = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; varying vec2 vUv;
void main(){
  vec3 col = texture2D(tSrc, vUv).rgb * 4.
    + texture2D(tSrc, vUv + vec2(-1., -1.) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1., -1.) * uTexel).rgb
    + texture2D(tSrc, vUv + vec2(-1., 1.) * uTexel).rgb + texture2D(tSrc, vUv + vec2(1., 1.) * uTexel).rgb;
  gl_FragColor = vec4(col / 8., 1.);
}`;

const F_UP = /* glsl */`
uniform sampler2D tLow; uniform sampler2D tCur; uniform vec2 uTexel; uniform float uScatter; varying vec2 vUv;
void main(){
  vec3 u = texture2D(tLow, vUv + vec2(-1., -1.) * uTexel).rgb + 2. * texture2D(tLow, vUv + vec2(0., -1.) * uTexel).rgb + texture2D(tLow, vUv + vec2(1., -1.) * uTexel).rgb
    + 2. * texture2D(tLow, vUv + vec2(-1., 0.) * uTexel).rgb + 4. * texture2D(tLow, vUv).rgb + 2. * texture2D(tLow, vUv + vec2(1., 0.) * uTexel).rgb
    + texture2D(tLow, vUv + vec2(-1., 1.) * uTexel).rgb + 2. * texture2D(tLow, vUv + vec2(0., 1.) * uTexel).rgb + texture2D(tLow, vUv + vec2(1., 1.) * uTexel).rgb;
  gl_FragColor = vec4(texture2D(tCur, vUv).rgb + u / 16. * uScatter, 1.);
}`;

const F_COMP = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO; uniform sampler2D tDepth;
uniform mat4 uInvVP; uniform mat4 uPrevVP;
uniform float uBloom; uniform float uAO; uniform float uMB; uniform float uVig; uniform float uGrain; uniform float uAb; uniform float uTime;
uniform float uVib; uniform float uSharp; uniform vec2 uTexel;
uniform float uSat; uniform float uCon; uniform vec3 uTintS; uniform vec3 uTintH; uniform vec3 uGain;
varying vec2 vUv;
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }
vec3 scn(vec2 uv){ return texture2D(tScene, uv).rgb; }
void main(){
  vec2 uv = vUv, dc = uv - .5;
  vec3 c;
  vec2 vel = vec2(0.);
  if (uMB > 0.) {
    float d = texture2D(tDepth, uv).x;
    if (d < .99999) {
      vec4 w = uInvVP * vec4(uv * 2. - 1., d * 2. - 1., 1.); w /= w.w;
      vec4 pc = uPrevVP * w; vec2 puv = pc.xy / pc.w * .5 + .5;
      vel = (uv - puv) * uMB;
      float l = length(vel); if (l > .035) vel *= .035 / l;
    }
  }
  if (dot(vel, vel) > 1e-8) {
    float j = ign(gl_FragCoord.xy) - .5; c = vec3(0.);
    for (int i = 0; i < 8; i++) { float t = (float(i) + j) / 8. - .5; c += scn(uv + vel * t); }
    c /= 8.;
  } else if (uAb > 1e-5) {
    c = vec3(scn(uv + dc * uAb).r, scn(uv).g, scn(uv - dc * uAb).b);
  } else c = scn(uv);
  if (uSharp > 0.) { vec3 nb = (scn(uv + vec2(uTexel.x, 0.)) + scn(uv - vec2(uTexel.x, 0.)) + scn(uv + vec2(0., uTexel.y)) + scn(uv - vec2(0., uTexel.y))) * .25; c += clamp(c - nb, vec3(-.6), vec3(.6)) * uSharp; }
  float l0 = dot(c, vec3(.2126, .7152, .0722));
  if (uAO > 0.) { float ao = texture2D(tAO, uv).x; c *= mix(1., ao, uAO * (1. - smoothstep(1.2, 4., l0))); }
  c += texture2D(tBloom, uv).rgb * uBloom;
  float l = dot(c, vec3(.2126, .7152, .0722));
  c = mix(vec3(l), c, uSat);
  if (uVib > 0.) { float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), st = (mx - mn) / (mx + 1e-4); c = mix(vec3(l), c, 1. + uVib * (1. - st)); }
  c = max((c - .18) * uCon + .18, 0.) * uGain;
  c = mix(c, c * uTintS, (1. - smoothstep(0., .4, l)) * .5);
  c = mix(c, c * uTintH, smoothstep(.5, 2., l) * .45);
  c *= 1. - uVig * smoothstep(.25, .95, length(dc) * 1.45);
  c += (ign(gl_FragCoord.xy + uTime * 61.) - .5) * uGrain * (.4 + .6 * (1. - smoothstep(0., 1., l)));
  gl_FragColor = vec4(max(c, 0.), 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/* estilos de cor (lerp suave entre eles) */
export const GRADES = {
  arena: { sat: 1.1, con: 1.1, vig: .32, tintS: [.90, 1., 1.08], tintH: [1.08, 1., .92], gain: [1, 1, 1] },
  realm: { sat: 1.18, con: 1.14, vig: .42, tintS: [.95, .88, 1.18], tintH: [1.05, .94, 1.12], gain: [1, .98, 1.04] },
  nova: { sat: 1.0, con: 1.18, vig: .5, tintS: [1., .9, .85], tintH: [1.12, 1., .85], gain: [1.04, 1, .96] },
};

export class PostFX {
  constructor(renderer, opts = {}) {
    this.r = renderer;
    const ext = renderer.extensions;
    this.hdr = !!(ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.msaaOk = !!ext.has('EXT_color_buffer_float');
    this.samples = this.msaaOk ? (opts.samples | 0) : 0;
    this.baseTier = this.hdr ? (opts.tier ?? 1) : 0; this.tier = this.baseTier; this.vivid = !!opts.vivid;
    this.w = 0; this.h = 0; this.rt = null; this.down = []; this.up = []; this.ao = null; this.ao2 = null;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.quad.frustumCulled = false;
    this.qs = new THREE.Scene(); this.qs.add(this.quad); this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    const t = { value: null }, v2 = () => ({ value: new THREE.Vector2() });
    this.mAO = mk(F_AO, { tDepth: { value: null }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uTexel: v2(), uRadius: { value: .6 }, uStr: { value: 1.15 } });
    this.mAOB = mk(F_AOBLUR, { tAO: { value: null }, tDepth: { value: null }, uProjInv: { value: new THREE.Matrix4() }, uTexel: v2() });
    this.mBright = mk(F_BRIGHT, { tScene: { value: null }, uTexel: v2(), uThr: { value: 1.0 }, uKnee: { value: .5 } });
    this.mDown = mk(F_DOWN, { tSrc: { value: null }, uTexel: v2() });
    this.mUp = mk(F_UP, { tLow: { value: null }, tCur: { value: null }, uTexel: v2(), uScatter: { value: .85 } });
    this.mComp = mk(F_COMP, {
      tScene: { value: null }, tBloom: { value: null }, tAO: { value: this.white }, tDepth: { value: null },
      uInvVP: { value: new THREE.Matrix4() }, uPrevVP: { value: new THREE.Matrix4() },
      uBloom: { value: .32 }, uAO: { value: 0 }, uMB: { value: 0 }, uVig: { value: .32 }, uGrain: { value: .014 }, uAb: { value: 0 }, uTime: { value: 0 },
      uVib: { value: 0 }, uSharp: { value: 0 }, uTexel: { value: new THREE.Vector2() }, uSat: { value: 1.1 }, uCon: { value: 1.1 }, uTintS: { value: new THREE.Vector3(.9, 1, 1.08) }, uTintH: { value: new THREE.Vector3(1.08, 1, .92) }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    }, { toneMapped: true });
    this.grade = Object.assign({}, GRADES.arena); this.gradeT = GRADES.arena;
    this.kickAb = 0; this.t = 0; this.vp = new THREE.Matrix4(); this.prevVP = new THREE.Matrix4(); this.hasPrev = false;
    this._v = new THREE.Vector2();
    renderer.info.autoReset = false;
    this.resize();
  }
  setTier(n) { n = this.hdr ? Math.max(0, Math.min(4, n | 0)) : 0; if (n === this.tier) return; const needAO = n >= 2 && !this.ao; this.tier = n; if (needAO || (n < 2 && this.ao)) this._alloc(); }
  /** qualidade adaptativa: k = 0 (folgado) … 1 (no limite) */
  adapt(k) { const b = this.baseTier; this.setTier(k > .85 ? 0 : k > .6 ? Math.min(b, 1) : k > .35 ? Math.min(b, 2) : b); }
  setGrade(name) { this.gradeT = GRADES[name] || GRADES.arena; }
  /** pico de aberração cromática (golpes pesados) */
  kick(a = .02) { this.kickAb = Math.max(this.kickAb, a); }
  resize() {
    this.r.getDrawingBufferSize(this._v); const w = Math.max(2, this._v.x | 0), h = Math.max(2, this._v.y | 0);
    if (w === this.w && h === this.h && this.rt) return;
    this.w = w; this.h = h; this._alloc();
  }
  _dispose() { for (const t of [this.rt, this.ao, this.ao2, ...this.down, ...this.up]) if (t) t.dispose(); this.rt = this.ao = this.ao2 = null; this.down = []; this.up = []; }
  _alloc() {
    this._dispose(); if (!this.hdr) return;
    const { w, h } = this, T = THREE.HalfFloatType, lin = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: T, format: THREE.RGBAFormat };
    const dt = new THREE.DepthTexture(w, h); dt.minFilter = THREE.NearestFilter; dt.magFilter = THREE.NearestFilter;
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: T, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, depthTexture: dt, samples: this.samples });
    const L = this.tier >= 3 ? 5 : 4;
    for (let i = 0; i < L; i++) { const bw = Math.max(2, w >> (i + 1)), bh = Math.max(2, h >> (i + 1)); this.down.push(new THREE.WebGLRenderTarget(bw, bh, lin)); if (i < L - 1) this.up.push(new THREE.WebGLRenderTarget(bw, bh, lin)); }
    if (this.tier >= 2) {
      const o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: THREE.UnsignedByteType, format: THREE.RGBAFormat };
      this.ao = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), o); this.ao2 = new THREE.WebGLRenderTarget(Math.max(2, w >> 1), Math.max(2, h >> 1), o);
    }
  }
  _pass(mat, target) { this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.qs, this.qc); }
  /** substitui renderer.render(scene, camera) */
  render(scene, camera, dt = 1 / 60) {
    const r = this.r; r.info.reset();
    if (!this.hdr || this.tier <= 0 || !this.rt) { r.setRenderTarget(null); r.render(scene, camera); return; }
    this.t += dt;
    // cena em HDR
    r.setRenderTarget(this.rt); r.render(scene, camera);
    camera.updateMatrixWorld();
    this.vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const C = this.mComp.uniforms, tier = this.tier;
    // SSAO
    let aoOn = 0;
    if (tier >= 2 && this.ao) {
      const u = this.mAO.uniforms; u.tDepth.value = this.rt.depthTexture; u.uProj.value.copy(camera.projectionMatrix); u.uProjInv.value.copy(camera.projectionMatrixInverse);
      u.uTexel.value.set(1 / this.ao.width, 1 / this.ao.height); this._pass(this.mAO, this.ao);
      const b = this.mAOB.uniforms; b.tAO.value = this.ao.texture; b.tDepth.value = this.rt.depthTexture; b.uProjInv.value.copy(camera.projectionMatrixInverse); b.uTexel.value.set(1 / this.ao.width, 1 / this.ao.height);
      this._pass(this.mAOB, this.ao2); C.tAO.value = this.ao2.texture; aoOn = .95;
    } else C.tAO.value = this.white;
    // bloom (filtro duplo)
    const L = this.down.length, bu = this.mBright.uniforms; bu.tScene.value = this.rt.texture; bu.uTexel.value.set(1 / this.w, 1 / this.h); this._pass(this.mBright, this.down[0]);
    for (let i = 1; i < L; i++) { const s = this.down[i - 1], u = this.mDown.uniforms; u.tSrc.value = s.texture; u.uTexel.value.set(1 / s.width, 1 / s.height); this._pass(this.mDown, this.down[i]); }
    for (let i = L - 2; i >= 0; i--) {
      const low = i === L - 2 ? this.down[L - 1] : this.up[i + 1], u = this.mUp.uniforms;
      u.tLow.value = low.texture; u.tCur.value = this.down[i].texture; u.uTexel.value.set(1 / low.width, 1 / low.height); this._pass(this.mUp, this.up[i]);
    }
    // grading suave
    const g = this.grade, T = this.gradeT, k = 1 - Math.exp(-dt * 2.2);
    g.sat += (T.sat - g.sat) * k; g.con += (T.con - g.con) * k; g.vig += (T.vig - g.vig) * k;
    const vv = this.vivid;   // MÁXIMO: cores vivas, nitidez e vibrance, sem desfoque
    C.uSat.value = g.sat * (vv ? 1.14 : 1); C.uCon.value = g.con * (vv ? 1.05 : 1); C.uVig.value = g.vig * (vv ? .7 : 1); C.uVib.value = vv ? .6 : 0; C.uSharp.value = vv ? .5 : 0; C.uTexel.value.set(1 / this.w, 1 / this.h);
    C.uTintS.value.set(...T.tintS); C.uTintH.value.set(...T.tintH); C.uGain.value.set(...T.gain);
    this.kickAb *= Math.exp(-dt * 9); if (this.kickAb < 1e-4) this.kickAb = 0;
    C.uAb.value = this.kickAb; C.uTime.value = this.t; C.uAO.value = aoOn; C.uBloom.value = tier >= 4 ? .42 : tier >= 3 ? .38 : this.vivid ? .36 : .3;
    C.tScene.value = this.rt.texture; C.tBloom.value = this.up[0].texture; C.tDepth.value = this.rt.depthTexture;
    if (tier === 3 && this.hasPrev) { C.uMB.value = .55; C.uInvVP.value.copy(this.vp).invert(); C.uPrevVP.value.copy(this.prevVP); } else C.uMB.value = 0;
    this.prevVP.copy(this.vp); this.hasPrev = true;
    this._pass(this.mComp, null);
  }
}
