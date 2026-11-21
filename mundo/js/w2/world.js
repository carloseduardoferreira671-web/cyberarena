/* CyberArena 3D · mundo: terreno suave com splat procedural, água animada, céu com nuvens em movimento, casona andável
   (escadarias, janelas para pular, interior), acampamentos, pontes, fogo animado, partículas, minimapa e física.
   Unidades em metros; o layout (blocos) é convertido com S = 1,5. Ver CONTRACT.md. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYOUT } from './layout.js';
import { Physics } from './physics.js';
import { makeTextures, upgradeWithPacks } from './world_tex.js';
import { NOISE_GLSL, WIND_GLSL, patchWorldVertex } from './world_shaders.js';
import { buildVegetation } from './world_veg.js';

export const S = 1.5;
const D2R = Math.PI / 180;

export async function loadCore() {
  if (globalThis.CW && globalThis.CW.heightAt) return globalThis.CW;
  const L = JSON.parse(JSON.stringify(LAYOUT)); L.temple.scale = 1.6 / S;          // casona: 1 unidade local = 1,6 m
  if (typeof window === "undefined") globalThis.window = globalThis; globalThis.CW = { LAYOUT: L };
  await import('./core_blocks.js');
  return globalThis.CW;
}

/* ---------- utilidades de geometria ---------- */
function planarUV(geo, tile) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) { uv[i * 2] = x / tile; uv[i * 2 + 1] = z / tile; }
    else if (ax >= az) { uv[i * 2] = z / tile; uv[i * 2 + 1] = y / tile; }
    else { uv[i * 2] = x / tile; uv[i * 2 + 1] = y / tile; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo;
}
function prep(g) { if (g.index) g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }
class Bucket {
  constructor() { this.list = []; }
  add(g, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) { g = prep(g); if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'))); g.translate(x, y, z); this.list.push(g); return g; }
  box(w, h, d, x, y, z, ry = 0) { return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, ry); }
  mesh(mat, tile = 0, shadow = true) {
    if (!this.list.length) return null; let g = mergeGeometries(this.list, false); if (tile) planarUV(g, tile);
    const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; return m;
  }
}

export async function buildWorld(_T, scene, renderer, { quality = 'medium', onProgress, theme = 'classic', ultra = false, ext = {} } = {}) {
  const THEME = ['forest', 'fire'].includes(theme) ? theme : 'classic', FIRE = THEME === 'fire', FOREST = THEME === 'forest';
  const CW = await loadCore(), L = CW.LAYOUT, W = CW.W;
  const prog = (p, t) => { try { onProgress && onProgress(p, t); } catch (e) {} };
  const Q = { low: 0, medium: 1, high: 2 }[quality] ?? 1;
  const hB = CW.heightAt, heightAt = (x, z) => hB(x / S, z / S) * S;
  const WATER_Y = W.WATER_Y * S;
  const phys = new Physics(heightAt);
  const U = { uPlayer: { value: new THREE.Vector3(0, -999, 0) }, uTime: { value: 0 }, uWind: { value: new THREE.Vector3(0.8, 0.6, 0.6) }, uInter: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) } };
  const tex = makeTextures(quality);
  try { await upgradeWithPacks(tex, quality, prog); } catch (e) { console.warn('texturas do pack indisponíveis', e); }   // v142: materiais PBR reais, se o pack estiver instalado
  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  /* domínio do terreno (metros) */
  const DOM = { minX: -(W.HX + W.EXT + 12) * S, maxX: (W.HX + W.EXT + 12) * S, minZ: -(W.HZ + W.EXT + 12) * S, maxZ: (W.HZ + W.EXT + 12) * S };
  DOM.w = DOM.maxX - DOM.minX; DOM.h = DOM.maxZ - DOM.minZ;
  const bounds = { minX: -(W.HX - 3) * S, maxX: (W.HX - 3) * S, minZ: -(W.HZ - 3) * S, maxZ: (W.HZ - 3) * S };

  /* ---------- texturas de altura e máscara (para grama, água e vegetação na GPU) ---------- */
  prog(0.05, 'Gerando terreno');
  const HW = Math.ceil(DOM.w), HH = Math.ceil(DOM.h), hData = new Uint16Array(HW * HH), mData = new Uint8Array(HW * HH * 4), hF = new Float32Array(HW * HH);
  const T = L.temple, TC = { x: T.x * S, z: T.z * S }, TH = CW.TF, tRot = Math.atan2(TH.s, TH.c);
  const tLocal = (x, z) => { const dx = x - TC.x, dz = z - TC.z; return [dx * TH.c - dz * TH.s, dx * TH.s + dz * TH.c]; };
  const tWorld = (lx, lz) => [TC.x + lx * TH.c + lz * TH.s, TC.z - lx * TH.s + lz * TH.c];
  const PR = 28, PA = PR * Math.cos(Math.PI / 8);                                   // plataforma da casona (raio e apótema)
  const inPlatform = (x, z, m = 0) => { const q = tLocal(x, z); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; if (q[0] * Math.sin(a) + q[1] * Math.cos(a) > PA + m) return false; } return true; };
  const puddleList = [];
  if (Q >= 1) {
    const rp = CW.mulberry32(5150), puddles = puddleList, want = Q >= 2 ? 90 : 55;
    for (let t = 0; t < 9000 && puddles.length < want; t++) {
      const x = (rp() * 2 - 1) * (CW.W.HX - 10) * S, z = (rp() * 2 - 1) * (CW.W.HZ - 10) * S, bx = x / S, bz = z / S, y = heightAt(x, z);
      if (y < WATER_Y + 0.5 || CW.slopeAt(bx, bz) > 0.06 || CW.freeness(bx, bz) < 0.9 || CW.forestDensity(bx, bz) > 0.55 || inPlatform(x, z, 8)) continue;
      if (puddles.some(p => Math.hypot(p.x - x, p.z - z) < 14)) continue;
      puddles.push({ x, z, r: 1.1 + rp() * 1.9, ry: rp() * 6.28 });
    }
  }
  const spots = [...(L.ruins || []).map(r => [r.x * S, r.z * S, 10.5]), ...(L.towers || []).map(t => [t.x * S, t.z * S, 7]), ...puddleList.map(p => [p.x, p.z, p.r * 1.7])];   // v143: sem grama sobre pisos de ruínas/torres
  for (let j = 0; j < HH; j++) {
    for (let i = 0; i < HW; i++) {
      const x = DOM.minX + i + 0.5, z = DOM.minZ + j + 0.5, bx = x / S, bz = z / S, h = heightAt(x, z), k = j * HW + i; hF[k] = h; hData[k] = THREE.DataUtils.toHalfFloat(h);
      const ri = CW.riverInfo(bx, bz), ro = CW.roadInfo(bx, bz), fd = CW.fieldDist(bx, bz), wet = h < WATER_Y + 0.25, plaza = Math.hypot(bx - CW.PLAZA.x, bz - CW.PLAZA.z) < CW.PLAZA.r;
      const road = ro ? 1 - CW.smooth(-0.6, 0.9, ro.d) : 0, sl = CW.slopeAt(bx, bz);
      let g = (1 - road) * (wet ? 0 : 1) * (fd < 0.3 ? 0 : 1) * (plaza ? 0 : 1) * (1 - CW.smooth(0.5, 0.9, sl)) * (inPlatform(x, z, 1) ? 0 : 1);
      if (ri && ri.t < 1.3) g = 0; if (CW.campDist(bx, bz) < 4.6) g *= 0.2;
      for (const sp of spots) { const dd = Math.hypot(x - sp[0], z - sp[1]); if (dd < sp[2]) g *= CW.smooth(sp[2] * 0.5, sp[2], dd); }
      mData[k * 4] = g * 255; mData[k * 4 + 1] = CW.forestDensity(bx, bz) * 255; mData[k * 4 + 2] = CW.meadow(bx, bz) * 255; mData[k * 4 + 3] = road * 255;
    }
    if (j % 40 === 0) { prog(0.05 + 0.15 * j / HH, 'Gerando terreno'); await yieldUI(); }
  }
  const heightTex = new THREE.DataTexture(hData, HW, HH, THREE.RedFormat, THREE.HalfFloatType); heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter; heightTex.needsUpdate = true;
  const maskTex = new THREE.DataTexture(mData, HW, HH, THREE.RGBAFormat); maskTex.magFilter = maskTex.minFilter = THREE.LinearFilter; maskTex.needsUpdate = true;
  const uDomain = { value: new THREE.Vector4(DOM.minX, DOM.minZ, HW, HH) };
  const hFast = (x, z) => { const i = Math.max(0, Math.min(HW - 1, Math.floor(x - DOM.minX))), j = Math.max(0, Math.min(HH - 1, Math.floor(z - DOM.minZ))); return hF[j * HW + i]; };

  /* ---------- luzes, céu e neblina ---------- */
  const sunDir = new THREE.Vector3(-0.45, 0.72, 0.35).normalize();
  const skyTop = new THREE.Color(FIRE ? 0x3a1408 : FOREST ? 0x2f6a5a : 0x3d7fd6), skyHor = new THREE.Color(FIRE ? 0xc8805a : FOREST ? 0x9fc8a8 : 0xbfdcf2), fogCol = new THREE.Color(FIRE ? 0x7a4a3a : FOREST ? 0x7fa890 : 0xb9d3e6);
  scene.fog = new THREE.Fog(fogCol, FIRE ? 40 : FOREST ? 35 : 70, ultra ? 150 : FOREST ? (Q === 0 ? 190 : 260) : Q === 0 ? 240 : 340);
  scene.background = fogCol;
  const hemi = ext.hemi || new THREE.HemisphereLight(); hemi.color.set(FIRE ? 0xffa070 : FOREST ? 0xbfe8c8 : 0xcfe6ff); hemi.groundColor.set(FIRE ? 0x2a1008 : FOREST ? 0x2a4a22 : 0x5b6a3c); hemi.intensity = FIRE ? 0.7 : 0.85; if (!ext.hemi) scene.add(hemi);
  const sun = ext.sun || new THREE.DirectionalLight(); sun.color.set(FIRE ? 0xff7a3a : FOREST ? 0xfff2c8 : 0xfff0d8); sun.intensity = FIRE ? 2.2 : FOREST ? 2.3 : 2.7; if (!ext.sun) sun.castShadow = !ultra; else if (ultra) sun.castShadow = false;
  if (!ext.sun) {
  const SM = Q === 0 ? 1024 : Q === 1 ? 2048 : 3072; sun.shadow.mapSize.set(SM, SM);
  const SR = Q === 0 ? 34 : 48; Object.assign(sun.shadow.camera, { left: -SR, right: SR, top: SR, bottom: -SR, near: 1, far: 220 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  }
  {
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTime: U.uTime, uWind: U.uWind, uSun: { value: sunDir }, uTop: { value: skyTop }, uHor: { value: skyHor }, uCloudTex: { value: tex.sky ? tex.sky.map : null }, uHasCloud: { value: tex.sky && !FIRE ? 1 : 0 } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
      fragmentShader: NOISE_GLSL + `uniform float uTime; uniform vec3 uWind; uniform vec3 uSun, uTop, uHor; uniform sampler2D uCloudTex; uniform float uHasCloud; varying vec3 vD;
        float fbm5(vec2 p){ float a=.5,r=0.; for(int i=0;i<5;i++){ r+=a*vnoise(p); p=p*2.02+31.7; a*=.5; } return r; }
        void main(){ vec3 d = normalize(vD); float y = max(d.y, 0.);
          vec3 col = mix(uHor, uTop, pow(y, .55)); col = mix(col, vec3(.72,.78,.8), smoothstep(0.,-.2,d.y));
          float sd = max(dot(d, uSun), 0.); col += vec3(1.,.86,.6) * (pow(sd, 6.) * .25 + pow(sd, 90.) * .9) + vec3(1.,.95,.85) * smoothstep(.9994,.9998,sd) * 4.;
          if (d.y > 0.) {
            vec2 uv = d.xz / (d.y + .12) * 1.3; vec2 drift = uTime * vec2(.012, .008) * (0.6 + uWind.z);
            float c = fbm5(uv * 1.1 + drift); float c2 = fbm5(uv * 2.6 - drift * 1.7 + 4.);
            float cov = smoothstep(.48, .78, c * .75 + c2 * .35);
            float light = clamp(.55 + (c - c2) * 1.4 + pow(sd, 4.) * .5, 0., 1.4);
            vec3 cc = mix(vec3(.62,.67,.76), vec3(1.,.99,.96), light);
            if (uHasCloud > .5) {
              vec3 ph = textureLod(uCloudTex, uv * .16 + drift * 1.6 + vec2(.5, .3), 1.).rgb; float mxp = max(ph.r, max(ph.g, ph.b)), mnp = min(ph.r, min(ph.g, ph.b));
              float dens = smoothstep(.42, .88, mnp / max(mxp, .001) + (mnp - .35) * .6);
              cov = mix(cov, clamp(dens * 1.15, 0., 1.), .7); cc = mix(cc, ph * vec3(1.06,1.04,1.02) * (.8 + .5 * light), .6);
            }
            col = mix(col, cc, cov * smoothstep(0., .12, d.y) * .92);
          }
          gl_FragColor = vec4(col, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), skyMat); sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
    scene.userData.sky = sky;
  }

  /* ---------- terreno ---------- */
  prog(0.22, 'Modelando relevo');
  {
    const segX = Math.min(760, Math.round([220, 340, 460][Q] * Math.max(1, DOM.w / 372))), segZ = Math.round(segX * DOM.h / DOM.w);
    const g = new THREE.PlaneGeometry(DOM.w, DOM.h, segX, segZ); g.rotateX(-Math.PI / 2); g.translate(DOM.minX + DOM.w / 2, 0, DOM.minZ + DOM.h / 2);
    const P = g.attributes.position, mask = new Float32Array(P.count * 4), mask2 = new Float32Array(P.count * 2);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i), bx = x / S, bz = z / S; let h = heightAt(x, z);
      const ro = CW.roadInfo(bx, bz), ri = CW.riverInfo(bx, bz), plaza = 1 - CW.smooth(CW.PLAZA.r - 1.2, CW.PLAZA.r, Math.hypot(bx - CW.PLAZA.x, bz - CW.PLAZA.z));
      let cob = plaza, dirt = 0; if (ro) { const e = 1 - CW.smooth(-0.5, 0.7, ro.d); if (ro.kind === 'cobble') cob = Math.max(cob, e); else dirt = e; }
      const field = 1 - CW.smooth(0, 0.7, CW.fieldDist(bx, bz)), sand = Math.max(ri && ri.t < 2.3 ? 1 - CW.smooth(1, 2.3, ri.t) : 0, 1 - CW.smooth(WATER_Y, WATER_Y + 0.9, h));
      const camp = 1 - CW.smooth(4.5, 7, CW.campDist(bx, bz));
      mask[i * 4] = cob; mask[i * 4 + 1] = Math.max(dirt, camp * 0.85); mask[i * 4 + 2] = field; mask[i * 4 + 3] = sand;
      mask2[i * 2] = CW.forestDensity(bx, bz); mask2[i * 2 + 1] = CW.smooth(9, 15, h);
      P.setY(i, h);
      if (i % 20000 === 0) { prog(0.22 + 0.12 * i / P.count, 'Modelando relevo'); await yieldUI(); }
    }
    g.setAttribute('aMask', new THREE.BufferAttribute(mask, 4)); g.setAttribute('aMask2', new THREE.BufferAttribute(mask2, 2));
    g.computeVertexNormals();
    const flatN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1); flatN.needsUpdate = true;
    /* empacota os mapas de rugosidade/AO dos 4 materiais do chão em 1 textura RGBA cada (poupa unidades de textura no shader) */
    const packCh = (key, fill) => {
      try {
        const sets = [tex.grass, tex.dirt, tex.rock, tex.tiles]; if (!sets.every(st => st && st[key] && st[key].image && st[key].image.width)) return null;
        const N = 1024, out = new Uint8Array(N * N * 4), cv = document.createElement('canvas'); cv.width = cv.height = N; const cx = cv.getContext('2d', { willReadFrequently: true });
        sets.forEach((st, ch) => { cx.drawImage(st[key].image, 0, 0, N, N); const d = cx.getImageData(0, 0, N, N).data; for (let i = 0; i < N * N; i++) out[i * 4 + ch] = d[i * 4]; });
        const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true; return t;
      } catch (e) { return null; }
    };
    const rpTex = packCh('roughnessMap'), apTex = packCh('aoMap');
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, { uTime: U.uTime, uWind: U.uWind, uRock: { value: tex.rock.map }, uTile: { value: tex.tiles.map }, uWaterY: { value: WATER_Y },
        uGrass: { value: (tex.grass || tex.tiles).map }, uDirt: { value: (tex.dirt || tex.tiles).map },
        uGrassN: { value: (tex.grass || tex.tiles).normalMap || flatN }, uDirtN: { value: (tex.dirt || tex.tiles).normalMap || flatN },
        uRockN: { value: tex.rock.normalMap || flatN }, uCaus: { value: tex.caustic ? tex.caustic.map : flatN }, uHasCaus: { value: tex.caustic ? 1 : 0 }, uCobN: { value: tex.tiles.normalMap || flatN }, uDecal: { value: tex.decal ? tex.decal.map : flatN }, uHasDecal: { value: tex.decal ? 1 : 0 },
        uRP: { value: rpTex || flatN }, uAP: { value: apTex || flatN }, uHasRP: { value: rpTex ? 1 : 0 }, uHasAP: { value: apTex ? 1 : 0 }, uPBR: { value: tex.grass && tex.dirt ? 1 : 0 }, uNS: { value: tex.grass && tex.dirt ? 0.85 : 0 } });
      sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
        attribute vec4 aMask; attribute vec2 aMask2; varying vec4 vMask; varying vec2 vMask2; varying vec3 vW; varying vec3 vNw;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMask = aMask; vMask2 = aMask2; vW = (modelMatrix * vec4(position,1.)).xyz; vNw = normal;`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
        uniform float uTime; uniform vec3 uWind; uniform sampler2D uRock, uTile, uGrass, uDirt, uGrassN, uDirtN, uRockN, uCobN; uniform float uWaterY, uPBR, uNS, uHasCaus, uHasDecal, uHasRP, uHasAP; uniform sampler2D uCaus, uDecal, uRP, uAP;
        float wGr, wRo, wDi, wCo; vec2 nG, nR, nD, nC;
        varying vec4 vMask; varying vec2 vMask2; varying vec3 vW; varying vec3 vNw;` + NOISE_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 p = vW.xz;
        float n1 = fbm2(p * .045), n2 = fbm2(p * .21 + 5.), n3 = vnoise(p * 1.9), n4 = vnoise(p * 7.3);
        vec3 g = mix(vec3(.105,.25,.055), vec3(.2,.36,.07), smoothstep(.3,.7,n1));
        g = mix(g, vec3(.34,.38,.1), smoothstep(.55,.85,n2) * .5);
        g *= .82 + .3 * n3 + .1 * n4;
        g = mix(g, vec3(.07,.15,.045) * (.8 + .4 * n3), vMask2.x * .55);
        vec3 gt = mix(texture2D(uGrass, p * .23).rgb, texture2D(uGrass, p * .037 + 7.3).rgb, smoothstep(.35,.65,n1)) * vec3(.74,1.22,.58) * (.78 + .5 * n2);
        g = mix(g, gt, uPBR * .85);
        float slope = 1. - normalize(vNw).y;
        float rk = clamp(max(smoothstep(.2,.4,slope + (n2 - .5) * .15), vMask2.y * smoothstep(.1,.3,slope + .1)), 0., 1.);
        vec3 rock = texture2D(uRock, p * .09).rgb * mix(vec3(1.), vec3(.9,.82,.7), n1);
        vec3 sand = vec3(.47,.39,.24) * (.85 + .3 * n3);
        vec3 dirt = vec3(.3,.2,.11) * (.78 + .35 * n2) * (.92 + .12 * step(.82, vnoise(p * 5.)));
        vec3 dtx = texture2D(uDirt, p * .27).rgb * (.8 + .4 * n2) * vec3(1.05,.93,.82); dirt = mix(dirt, dtx, uPBR * .85);
        vec3 cob = texture2D(uTile, p * .36).rgb;
        float furrow = smoothstep(.2,.5,abs(fract(p.y * .7) - .5));
        vec3 soil = mix(vec3(.2,.12,.06), vec3(.3,.2,.1), furrow) * (.9 + .2 * n3);
        vec3 col = g;
        float wS = smoothstep(.1,.9,vMask.w + (n3 - .5) * .3), wD = smoothstep(.05,.8,vMask.y + (n4 - .5) * .35), wC = smoothstep(.2,.8,vMask.x + (n4 - .5) * .2), wF = smoothstep(.2,.8,vMask.z);
        col = mix(col, rock, rk); col = mix(col, sand, wS); col = mix(col, dirt, wD); col = mix(col, cob, wC); col = mix(col, soil, wF);
        { float rest = (1. - wS) * (1. - wD) * (1. - wC) * (1. - wF); wRo = rk * rest; wGr = (1. - rk) * rest; wDi = wD * (1. - wC) * (1. - wF); wCo = wC * (1. - wF); }
        if (uHasDecal > .5) { float dc = texture2D(uDecal, p * .045).r * texture2D(uDecal, p * .013 + .4).r; col *= 1. - dc * .55 * (.3 + wD + wC * .5); }
        nG = texture2D(uGrassN, p * .23).xy * 2. - 1.; nR = texture2D(uRockN, p * .09).xy * 2. - 1.; nD = texture2D(uDirtN, p * .27).xy * 2. - 1.; nC = texture2D(uCobN, p * .36).xy * 2. - 1.;
        float under = smoothstep(uWaterY + .2, uWaterY - .4, vW.y);
        if (under > 0.) {
          vec2 cp = p * .55 + uTime * vec2(.18, .12);
          float ca = pow(1. - abs(vnoise(cp) * 2. - 1.), 6.) + pow(1. - abs(vnoise(cp * 1.7 - uTime * .2) * 2. - 1.), 6.);
          if (uHasCaus > .5) { float c1 = textureLod(uCaus, p * .11 + uTime * vec2(.021, .013), 1.).r, c2 = textureLod(uCaus, p * .17 - uTime * vec2(.017, .025) + .37, 1.).r; ca = ca * .35 + min(c1, c2) * 2.6; }
          col = mix(col, col * vec3(.45,.6,.6), under) + vec3(.35,.5,.45) * ca * .22 * under;
        }
        float cs = smoothstep(.5,.72, fbm2(p * .011 + uTime * vec2(.012,.008) * 6.));
        col *= 1. - cs * .28;
        ${FIRE ? `{ float lum = dot(col, vec3(.3,.59,.11)); col = mix(col, vec3(lum) * vec3(.62,.48,.4), .82);
          float ck = pow(1. - abs(vnoise(p * .6) * 2. - 1.), 14.) * smoothstep(.2,.7,vMask.y + vMask.x * .5 + .3) * (1. - under);
          col += vec3(1.,.32,.05) * ck * (.55 + .45 * sin(uTime * 2.3 + p.x * .7 + p.y * .4)); }` : ''}
        ${FOREST ? 'col *= vec3(.78,1.02,.8);' : ''}
        diffuseColor.rgb = col;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        float rb = .95; { float ws = wGr + wDi + wRo + wCo; if (uHasRP > .5 && ws > .001) { float rr = wGr * texture2D(uRP, p * .23).r + wDi * texture2D(uRP, p * .27).g + wRo * texture2D(uRP, p * .09).b + wCo * texture2D(uRP, p * .36).a; rb = mix(.95, clamp(rr / ws, .25, 1.), clamp(ws, 0., 1.)); } }
        roughnessFactor = mix(rb, .35, smoothstep(uWaterY + .5, uWaterY, vW.y));`)
        .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        { float ws = wGr + wDi + wRo + wCo; if (uHasAP > .5 && ws > .001) { float ao = (wGr * texture2D(uAP, p * .23).r + wDi * texture2D(uAP, p * .27).g + wRo * texture2D(uAP, p * .09).b + wCo * texture2D(uAP, p * .36).a) / ws; reflectedLight.indirectDiffuse *= mix(1., ao, .85 * clamp(ws, 0., 1.)); } }`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 nn = (nG * wGr + nR * wRo + nD * wDi + nC * wCo) * uNS; normal = normalize(normal + (viewMatrix * vec4(nn.x, 0., -nn.y, 0.)).xyz); }`);
    };
    const terrain = new THREE.Mesh(g, mat); terrain.receiveShadow = true; terrain.castShadow = Q >= 1; scene.add(terrain);
  }
  await yieldUI();

  /* ---------- água ---------- */
  prog(0.36, 'Enchendo os rios');
  const ripples = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -99, 0)); let rippleI = 0;
  {
    const g = new THREE.PlaneGeometry(DOM.w, DOM.h, 1, 1); g.rotateX(-Math.PI / 2); g.translate(DOM.minX + DOM.w / 2, WATER_Y, DOM.minZ + DOM.h / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
      vertexShader: `varying vec3 vW; #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`.replace(/#include <fog_pars_vertex>/, '\n#include <fog_pars_vertex>\n').replace(/#include <fog_vertex>/, '\n#include <fog_vertex>\n'),
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        ` + NOISE_GLSL + `
        uniform float uTime; uniform sampler2D uH; uniform vec4 uDom; uniform vec3 uSun, uTop, uHor; uniform float uWaterY; uniform vec4 uRip[8];
        varying vec3 vW;
        float wh(vec2 p){ return vnoise(p * .55 + uTime * vec2(.35,.22)) * .6 + vnoise(p * 1.4 - uTime * vec2(.25,.4)) * .3 + vnoise(p * 3.7 + uTime * vec2(.6,-.3)) * .12; }
        void main(){
          vec2 uv = (vW.xz - uDom.xy) / uDom.zw; float th = texture2D(uH, uv).r; float depth = uWaterY - th;
          if (depth < -.08) discard;
          vec2 p = vW.xz; float e = .12; float h0 = wh(p);
          vec3 n = normalize(vec3((h0 - wh(p + vec2(e,0.))) * 3.2, 1., (h0 - wh(p + vec2(0.,e))) * 3.2));
          float rip = 0.;
          for (int i = 0; i < 8; i++) { vec4 R = uRip[i]; float age = uTime - R.z; if (age < 0. || age > 2.5) continue;
            float d = length(p - R.xy); float ring = sin((d - age * 3.) * 9.) * exp(-abs(d - age * 3.) * 2.) * (1. - age / 2.5) * R.w;
            rip += ring; n.xz += normalize(p - R.xy + 1e-4) * ring * .35; }
          n = normalize(n);
          vec3 v = normalize(cameraPosition - vW);
          float fres = .03 + .97 * pow(1. - max(dot(n, v), 0.), 5.);
          vec3 r = reflect(-v, n); vec3 sky = mix(uHor, uTop, pow(max(r.y, 0.), .6));
          float spec = pow(max(dot(r, uSun), 0.), 240.) * 6. + pow(max(dot(r, uSun), 0.), 30.) * .25;
          vec3 shallow = vec3(.12,.42,.4), deep = vec3(.02,.1,.14);
          vec3 body = mix(shallow, deep, smoothstep(0., 1.8, depth));
          ${FIRE ? 'body = mix(body, vec3(.28,.12,.06), .55);' : FOREST ? 'body = mix(body, vec3(.05,.22,.16), .5);' : ''}
          float caus = pow(1. - abs(vnoise(p * .9 + uTime * .3) * 2. - 1.), 8.) * (1. - smoothstep(0., 1.4, depth));
          body += vec3(.3,.45,.4) * caus * .35;
          vec3 col = mix(body, sky, fres * .85) + vec3(1.,.95,.85) * spec;
          float foam = (1. - smoothstep(0., .22 + .15 * vnoise(p * 2. + uTime), depth)) * (.6 + .4 * vnoise(p * 4. - uTime));
          col = mix(col, vec3(.92,.96,.97), clamp(foam + abs(rip) * .25, 0., 1.) * .8);
          float a = clamp(.55 + depth * .5 + fres * .4 + foam, 0., .96) * smoothstep(-.08, .03, depth);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`
    });
    Object.assign(mat.uniforms, { uTime: U.uTime, uH: { value: heightTex }, uDom: uDomain, uSun: { value: sunDir }, uTop: { value: skyTop }, uHor: { value: skyHor }, uWaterY: { value: WATER_Y }, uRip: { value: ripples } });
    const water = new THREE.Mesh(g, mat); water.renderOrder = 2; scene.add(water);
  }

  /* ---------- materiais ---------- */
  const M = {
    stone: new THREE.MeshStandardMaterial({ ...tex.stone, roughness: 1, metalness: 0, color: 0xf4efe6 }),
    stoneDark: new THREE.MeshStandardMaterial({ ...tex.stone, roughness: 1, color: 0xbab3a8 }),
    tiles: new THREE.MeshStandardMaterial({ ...tex.tiles, roughness: 1, color: 0xe2dccf }),
    wood: new THREE.MeshStandardMaterial({ ...tex.wood, roughness: 1, color: 0xffffff }),
    darkWood: new THREE.MeshStandardMaterial({ ...tex.wood, roughness: 1, color: 0x7a6250 }),
    ruin: new THREE.MeshStandardMaterial({ ...(tex.ruin || tex.stone), roughness: 1, color: 0xe6e0d6 }),
    brick: new THREE.MeshStandardMaterial({ ...(tex.brick || tex.tiles), roughness: 1, color: 0xf0e6dc }),
    bark: new THREE.MeshStandardMaterial({ ...(tex.bark || tex.wood), roughness: 1, color: 0xe0d0c0 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd8a640, metalness: 0.85, roughness: 0.32 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x3a3836, metalness: 0.7, roughness: 0.5 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a1450, emissive: 0x8a4cff, emissiveIntensity: 1.3, roughness: 0.2, metalness: 0.1 }),
    rope: new THREE.MeshStandardMaterial({ color: 0xb59a6c, roughness: 1 })
  };

  /* fogo: um único InstancedMesh de quadros voltados para a câmera com shader de chama */
  const fires = [];
  const addFire = (x, y, z, s = 1) => fires.push({ x, y, z, s });

  /* ---------- casona ---------- */
  prog(0.42, 'Erguendo a casona');
  const templeGroup = new THREE.Group(); templeGroup.position.set(TC.x, 0, TC.z); templeGroup.rotation.y = tRot; scene.add(templeGroup);
  const baseY = CW.TEMPLE_Y * S, topY = baseY + 3.6, WALL_H = 11.5, AW = 18.5, WT = 1.0;
  {
    const st = new Bucket(), dk = new Bucket(), tl = new Bucket(), gd = new Bucket(), gl = new Bucket(), wd = new Bucket();
    const octPts = (r, rot = Math.PI / 8) => Array.from({ length: 8 }, (_, i) => { const a = rot + i * Math.PI / 4; return [Math.sin(a) * r, Math.cos(a) * r]; });
    const oct = (r, y0, y1, b) => { const sh = new THREE.Shape(octPts(r).map(p => new THREE.Vector2(p[0], p[1]))); const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.12, bevelSegments: 2 }); g.rotateX(Math.PI / 2); g.translate(0, y1, 0); b.add(g); };
    /* plataforma em dois níveis + praça interna */
    oct(PR + 1.2, baseY - 2, baseY + 0.9, dk); oct(PR, baseY + 0.9, topY - 0.25, st); oct(PR - 0.3, topY - 0.25, topY, tl);
    const platPts = octPts(PR).map(p => tWorld(p[0], p[1]));
    phys.add({ type: 'poly', pts: platPts, y0: baseY - 3, y1: topY, floor: true });
    /* escadarias: frente (+Z) e laterais (±X) — 12 degraus de 30 cm */
    const NST = 12, RISE = 0.3, RUN = 0.78;
    const stair = (dir, width) => {
      for (let i = 0; i < NST; i++) {
        const top = topY - (i + 1) * RISE, d0 = PA - 0.4 + i * RUN, cz = d0 + RUN / 2, h = top - (baseY - 1);
        const lx = dir === 0 ? 0 : dir * cz, lz = dir === 0 ? cz : 0, w = dir === 0 ? width : RUN + 0.02, dd = dir === 0 ? RUN + 0.02 : width;
        st.box(w, h, dd, lx, (top + baseY - 1) / 2, lz);
        const c = tWorld(lx, lz); phys.add({ type: 'box', x: c[0], z: c[1], hx: w / 2, hz: dd / 2, rot: tRot, y0: baseY - 3, y1: top, floor: true });
      }
      /* muretas laterais com tochas */
      for (const sd of [-1, 1]) {
        const off = width / 2 + 0.45, len = NST * RUN, mid = PA - 0.4 + len / 2;
        const lx = dir === 0 ? sd * off : dir * mid, lz = dir === 0 ? mid : sd * off;
        const wW = dir === 0 ? 0.9 : len, wD = dir === 0 ? len : 0.9;
        const g = dk.add(new THREE.BoxGeometry(wW, 1, wD), lx, 0, lz);
        /* inclina a mureta acompanhando a escada */
        const P = g.attributes.position; for (let k = 0; k < P.count; k++) { const along = dir === 0 ? P.getZ(k) - mid : (P.getX(k) - dir * mid) * dir; const t = 1 - (along + len / 2) / len; P.setY(k, P.getY(k) + (baseY + 0.4) + t * 3.6 + 0.5 * (P.getY(k) > 0 ? 1 : 0)); } g.computeVertexNormals();
        for (let i = 0; i < NST; i += 3) { const a = PA - 0.4 + (i + 0.5) * RUN, top = topY - (i + 1) * RISE + 1.0; const cx = dir === 0 ? sd * off : dir * a, cz = dir === 0 ? a : sd * off, c = tWorld(cx, cz); phys.add({ type: 'box', x: c[0], z: c[1], hx: (dir === 0 ? 0.45 : RUN * 1.6), hz: (dir === 0 ? RUN * 1.6 : 0.45), rot: tRot, y0: baseY - 3, y1: top + 0.4, vault: true }); }
        const tx = dir === 0 ? sd * off : dir * (PA + len - 0.3), tz = dir === 0 ? PA + len - 0.3 : sd * off; torchAt(tx, baseY + 1.2, tz);
      }
    };
    const torchAt = (lx, y, lz) => { st.add(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 12), lx, y + 0.8, lz); gd.add(new THREE.CylinderGeometry(0.42, 0.24, 0.32, 16), lx, y + 1.7, lz); const c = tWorld(lx, lz); addFire(c[0], y + 1.95, c[1], 1); phys.add({ type: 'circle', x: c[0], z: c[1], r: 0.35, y0: y - 1, y1: y + 1.9 }); };
    stair(0, 10); stair(1, 8); stair(-1, 8);
    /* bordas da plataforma (parapeito baixo para pular) exceto onde há escadas */
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4; if (i === 0 || i === 2 || i === 6) continue;
      const side = 2 * PR * Math.sin(Math.PI / 8), cx = Math.sin(a) * (PA - 0.3), cz = Math.cos(a) * (PA - 0.3);
      st.box(side * 0.92, 0.9, 0.55, cx, topY + 0.45, cz, a);
      const c = tWorld(cx, cz); phys.add({ type: 'box', x: c[0], z: c[1], hx: side * 0.46, hz: 0.3, rot: a + tRot, y0: topY - 0.1, y1: topY + 0.9, vault: true, floor: true });
    }
    /* paredes octogonais com porta (frente) e janelas baixas que dá para pular */
    const SIDE = 2 * AW * Math.tan(Math.PI / 8);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, nx = Math.sin(a), nz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
      const opens = i === 0 ? [{ u0: -2.6, u1: 2.6, sill: 0, top: 6.2, door: true }] : [{ u0: -5.0, u1: -2.6, sill: 1.05, top: 3.5 }, { u0: 2.6, u1: 5.0, sill: 1.05, top: 3.5 }];
      let u = -SIDE / 2 - 0.5; const cuts = [...opens, { u0: SIDE / 2 + 0.5, u1: SIDE / 2 + 0.5, sill: 0, top: WALL_H }];
      const piece = (u0, u1, y0, y1, vault, floor, bucket = st) => {
        if (u1 - u0 < 0.01 || y1 - y0 < 0.01) return; const um = (u0 + u1) / 2, lx = nx * AW + tx * um, lz = nz * AW + tz * um;
        bucket.box(u1 - u0, y1 - y0, WT, lx, topY + (y0 + y1) / 2, lz, a);
        const c = tWorld(lx, lz); phys.add({ type: 'box', x: c[0], z: c[1], hx: (u1 - u0) / 2, hz: WT / 2 + 0.05, rot: a + tRot, y0: topY + y0, y1: topY + y1, vault, floor });
      };
      for (const o of cuts) {
        piece(u, o.u0, 0, WALL_H, false, false);
        if (o.u1 > o.u0) {
          if (o.sill > 0) { piece(o.u0, o.u1, 0, o.sill, true, true); dk.box(o.u1 - o.u0 + 0.3, 0.14, WT + 0.4, nx * AW + tx * (o.u0 + o.u1) / 2, topY + o.sill, nz * AW + tz * (o.u0 + o.u1) / 2, a); }
          piece(o.u0, o.u1, o.top, WALL_H, false, false);
          /* arco sobre a abertura */
          const w = o.u1 - o.u0, um = (o.u0 + o.u1) / 2, ag = new THREE.TorusGeometry(w / 2, 0.22, 10, 24, Math.PI); dk.add(ag, nx * (AW + WT / 2 + 0.05) + tx * um, topY + o.top, nz * (AW + WT / 2 + 0.05) + tz * um, a);
          if (o.door) { for (const sd of [-1, 1]) dk.box(0.6, o.top, 0.6, nx * (AW + 0.6) + tx * (o.u0 + (sd > 0 ? w : 0)), topY + o.top / 2, nz * (AW + 0.6) + tz * (o.u0 + (sd > 0 ? w : 0)), a); }
        }
        u = o.u1;
      }
      /* vitrais altos (roxos e brilhantes) */
      if (i !== 0) for (const um of [-3.8, 3.8]) { gl.box(1.6, 3.4, 0.2, nx * (AW + WT / 2 + 0.02) + tx * um, topY + 7.6, nz * (AW + WT / 2 + 0.02) + tz * um, a); dk.add(new THREE.TorusGeometry(0.95, 0.16, 8, 20, Math.PI), nx * (AW + WT / 2 + 0.1) + tx * um, topY + 9.3, nz * (AW + WT / 2 + 0.1) + tz * um, a); }
      else gl.box(4.6, 2.6, 0.2, nx * (AW + WT / 2 + 0.02), topY + 8.4, nz * (AW + WT / 2 + 0.02), a);
      /* pilar com pináculo no canto */
      const ca = a + Math.PI / 8, cr = AW / Math.cos(Math.PI / 8) + 0.6, px = Math.sin(ca) * cr, pz = Math.cos(ca) * cr;
      st.add(new THREE.CylinderGeometry(1.05, 1.25, WALL_H + 3, 16), px, topY + (WALL_H + 3) / 2, pz);
      dk.add(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 16), px, topY + WALL_H + 3.2, pz);
      st.add(new THREE.ConeGeometry(1.1, 4.2, 16), px, topY + WALL_H + 5.6, pz);
      gd.add(new THREE.SphereGeometry(0.35, 16, 10), px, topY + WALL_H + 7.9, pz);
      const pc = tWorld(px, pz); phys.add({ type: 'circle', x: pc[0], z: pc[1], r: 1.3, y0: topY - 1, y1: topY + WALL_H + 6 });
    }
    /* cornija no topo da parede e piso interno */
    oct(AW / Math.cos(Math.PI / 8) + 1.0, topY + WALL_H, topY + WALL_H + 0.8, dk);
    tl.add(new THREE.CircleGeometry(AW - 0.6, 48).rotateX(-Math.PI / 2), 0, topY + 0.02, 0);
    /* pedestal central com cristal flutuante */
    st.add(new THREE.CylinderGeometry(2.4, 2.9, 1.0, 24), 0, topY + 0.5, 0); dk.add(new THREE.CylinderGeometry(1.8, 2.2, 0.5, 24), 0, topY + 1.25, 0);
    phys.add({ type: 'circle', x: TC.x, z: TC.z, r: 2.9, y0: topY - 1, y1: topY + 1.5, vault: true, floor: true });
    /* tochas em volta da plataforma */
    for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; if (Math.abs(Math.cos(a)) < 0.3) continue; torchAt(Math.sin(a) * (PA - 2.2), topY, Math.cos(a) * (PA - 2.2)); }
    for (const [b, m, t] of [[st, M.stone, 2.6], [dk, M.stoneDark, 2.2], [tl, M.tiles, 3], [gd, M.gold, 0], [gl, M.glass, 0], [wd, M.wood, 2]]) { const me = b.mesh(m, t); if (me) templeGroup.add(me); }
    /* cúpula verde com rachaduras roxas pulsando */
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x3f8a72, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
    domeMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLP = position;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vLP;' + NOISE_GLSL)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 dn = normalize(vLP); float lat = asin(clamp(dn.y, -1., 1.)), lon = atan(dn.x, dn.z);
          float pat = fbm2(vec2(lon * 3., lat * 4.)); float tilesL = abs(fract(lat * 10.) - .5), tilesR = abs(fract(lon * 9.55) - .5);
          float seams = smoothstep(.47,.5,max(tilesL, tilesR));
          diffuseColor.rgb = mix(vec3(.08,.26,.2), vec3(.25,.55,.42), pat) * (1. - seams * .45);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float cr = 1. - abs(vnoise(vec2(lon * 2.2, lat * 3.1) + 3.) * 2. - 1.); float cr2 = 1. - abs(vnoise(vec2(lon * 5.1, lat * 6.3) - 7.) * 2. - 1.);
          float vein = smoothstep(.975,.995,cr) + smoothstep(.982,.997,cr2) * .7;
          float pulse = .7 + .3 * sin(uTime * 2.2 + lat * 6.);
          totalEmissiveRadiance += vec3(.55,.18,1.) * vein * 4. * pulse; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.3,.08,.5), vein);`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(.35,.8,seams);');
    };
    const dome = new THREE.Mesh(new THREE.SphereGeometry(AW * 1.02, 96, 40, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
    dome.scale.y = 0.92; dome.position.y = topY + WALL_H + 0.6; dome.castShadow = true; dome.receiveShadow = true; templeGroup.add(dome);
    const fin = new THREE.Mesh(mergeGeometries([prep(new THREE.CylinderGeometry(0.25, 0.7, 4, 16).translate(0, 2, 0)), prep(new THREE.SphereGeometry(0.8, 20, 12).translate(0, 4.4, 0)), prep(new THREE.ConeGeometry(0.3, 2.4, 12).translate(0, 6, 0))]), M.gold);
    fin.position.y = dome.position.y + AW * 0.92 - 0.3; fin.castShadow = true; templeGroup.add(fin);
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 2), new THREE.MeshStandardMaterial({ color: 0x6b2cff, emissive: 0x9a5cff, emissiveIntensity: 2.2, roughness: 0.1, metalness: 0.2, flatShading: false }));
    crystal.scale.y = 1.7; crystal.position.y = topY + 3.4; templeGroup.add(crystal);
    const crystalLight = new THREE.PointLight(0xa070ff, 30, 26, 2); crystalLight.position.y = topY + 3.4; templeGroup.add(crystalLight);
    scene.userData.crystal = crystal;
  }
  await yieldUI();

  /* ---------- acampamentos, plantações, pontes, postes e escada ---------- */
  prog(0.52, 'Montando acampamentos');
  const ruinB = new Bucket(), brickB = new Bucket(), barkB = new Bucket(), wood = new Bucket(), dwood = new Bucket(), stoneB = new Bucket(), stoneD = new Bucket(), iron = new Bucket(), rope = new Bucket();
  const roofCols = { red: 0xb8352a, teal: 0x2a8aa0, beige: 0xd8c4a0 };
  const tentGeo = new Map();
  for (const c of L.camps) {
    const cx = c.x * S, cz = c.z * S, y0 = c.h0 * S, rr = CW.mulberry32((CW.hash2(c.x, c.z, 9) * 4294967296) | 0);
    /* piso de madeira */
    dwood.add(new THREE.CylinderGeometry(5.6, 5.8, 0.45, 40), cx, y0 + 0.02, cz);
    phys.add({ type: 'circle', x: cx, z: cz, r: 5.6, y0: y0 - 1, y1: y0 + 0.25, floor: true });
    /* postes */
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, px = cx + Math.cos(a) * 5.1, pz = cz + Math.sin(a) * 5.1; wood.add(new THREE.CylinderGeometry(0.16, 0.2, 4.4, 10), px, y0 + 2.4, pz); phys.add({ type: 'circle', x: px, z: pz, r: 0.25, y0: y0, y1: y0 + 4.5 }); }
    wood.add(new THREE.CylinderGeometry(0.22, 0.26, 8.6, 12), cx, y0 + 4.5, cz); phys.add({ type: 'circle', x: cx, z: cz, r: 0.3, y0, y1: y0 + 8.6 });
    /* telhado de lona listrada com babado */
    const roofMat = new THREE.MeshStandardMaterial({ ...tex.fabric, color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide });
    const rc = new THREE.Color(roofCols[c.roof]), cream = new THREE.Color(0xefe6cf);
    roofMat.onBeforeCompile = (sh) => {
      sh.uniforms.uA = { value: rc }; sh.uniforms.uB = { value: cream };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vU;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvU = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uA, uB; varying vec2 vU;').replace('#include <map_fragment>', '#include <map_fragment>\nfloat st = step(.5, fract(vU.x * 12.)); diffuseColor.rgb *= mix(uB, uA, st);');
    };
    const roof = new THREE.ConeGeometry(6.9, 4.4, 48, 4, true); roof.translate(0, 4.4 + 2.2 + y0, 0);
    const val = new THREE.CylinderGeometry(6.9, 6.95, 0.8, 48, 1, true); const vp = val.attributes.position;
    for (let k = 0; k < vp.count; k++) if (vp.getY(k) < 0) { const a = Math.atan2(vp.getZ(k), vp.getX(k)); vp.setY(k, vp.getY(k) - 0.18 * Math.abs(Math.sin(a * 12))); }
    val.computeVertexNormals(); val.translate(0, 4.4 + y0 - 0.4, 0);
    const tent = new THREE.Mesh(mergeGeometries([roof, val]), roofMat); tent.position.set(cx, 0, cz); tent.castShadow = tent.receiveShadow = true; scene.add(tent);
    wood.add(new THREE.ConeGeometry(0.25, 1.2, 12), cx, y0 + 9.4, cz);
    /* caixotes (pular) e barris */
    for (let i = 0; i < 4; i++) {
      const a = rr() * Math.PI * 2, d = 6.4 + rr() * 2, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, gy = heightAt(x, z), s2 = 1.2 + rr() * 0.3, ry = rr() * 3; if (gy < WATER_Y + 0.35 || CW.riverInfo(x / S, z / S)?.t < 1.6) continue;
      const bg = new THREE.BoxGeometry(s2, s2, s2, 1, 1, 1); wood.add(bg, x, gy + s2 / 2, z, ry);
      iron.add(new THREE.BoxGeometry(s2 + 0.04, 0.1, s2 + 0.04), x, gy + s2 * 0.15, z, ry); iron.add(new THREE.BoxGeometry(s2 + 0.04, 0.1, s2 + 0.04), x, gy + s2 * 0.85, z, ry);
      phys.add({ type: 'box', x, z, hx: s2 / 2, hz: s2 / 2, rot: ry, y0: gy - 0.5, y1: gy + s2, vault: true, floor: true });
      if (rr() < 0.5) { const s3 = 0.8; wood.add(new THREE.BoxGeometry(s3, s3, s3), x, gy + s2 + s3 / 2, z, ry + 0.4); }
    }
    for (let i = 0; i < 3; i++) {
      const a = rr() * Math.PI * 2, d = 6.6 + rr() * 1.6, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, gy = heightAt(x, z); if (gy < WATER_Y + 0.35 || CW.riverInfo(x / S, z / S)?.t < 1.6) continue;
      const bar = new THREE.CylinderGeometry(0.55, 0.55, 1.3, 20, 6); const bp = bar.attributes.position; for (let k = 0; k < bp.count; k++) { const yy = bp.getY(k) / 0.65, f = 1 + 0.12 * (1 - yy * yy); bp.setX(k, bp.getX(k) * f); bp.setZ(k, bp.getZ(k) * f); } bar.computeVertexNormals();
      dwood.add(bar, x, gy + 0.65, z); iron.add(new THREE.TorusGeometry(0.6, 0.04, 6, 24).rotateX(Math.PI / 2), x, gy + 0.3, z); iron.add(new THREE.TorusGeometry(0.6, 0.04, 6, 24).rotateX(Math.PI / 2), x, gy + 1.0, z);
      phys.add({ type: 'circle', x, z, r: 0.6, y0: gy - 0.5, y1: gy + 1.3, vault: true, floor: true });
    }
    /* fogueira */
    let fx = cx - 8.2, fz = cz + 4.2; for (let k = 0; k < 8 && (heightAt(fx, fz) < WATER_Y + 0.4 || CW.riverInfo(fx / S, fz / S)?.t < 1.6); k++) { const a = k * 0.8 + 2.4; fx = cx + Math.cos(a) * 8.6; fz = cz + Math.sin(a) * 8.6; } const fy = heightAt(fx, fz);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, g = new THREE.DodecahedronGeometry(0.28, 1); stoneD.add(g, fx + Math.cos(a) * 1.0, fy + 0.12, fz + Math.sin(a) * 1.0, a); }
    for (let i = 0; i < 4; i++) dwood.add(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 8), fx, fy + 0.25, fz, i * 0.8, 0, Math.PI / 2 - 0.35);
    addFire(fx, fy + 0.35, fz, 1.8); phys.add({ type: 'circle', x: fx, z: fz, r: 1.1, y0: fy - 1, y1: fy + 0.4, vault: true });
    /* tochas */
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.8, x = cx + Math.cos(a) * 9.5, z = cz + Math.sin(a) * 9.5, gy = heightAt(x, z); if (gy < WATER_Y + 0.35 || CW.riverInfo(x / S, z / S)?.t < 1.5) continue; wood.add(new THREE.CylinderGeometry(0.1, 0.13, 2.2, 8), x, gy + 1.1, z); iron.add(new THREE.CylinderGeometry(0.26, 0.14, 0.3, 12), x, gy + 2.3, z); addFire(x, gy + 2.55, z, 0.85); phys.add({ type: 'circle', x, z, r: 0.2, y0: gy, y1: gy + 2.4 }); }
    /* bandeira que balança com o vento */
    let ba = rr() * Math.PI * 2, bx = cx + Math.cos(ba) * 9, bz = cz + Math.sin(ba) * 9; for (let k = 0; k < 8 && heightAt(bx, bz) < WATER_Y + 0.4; k++) { ba += 0.8; bx = cx + Math.cos(ba) * 9; bz = cz + Math.sin(ba) * 9; } const by = heightAt(bx, bz);
    wood.add(new THREE.CylinderGeometry(0.09, 0.11, 7, 8), bx, by + 3.5, bz); phys.add({ type: 'circle', x: bx, z: bz, r: 0.15, y0: by, y1: by + 7 });
    const flagG = new THREE.PlaneGeometry(2.2, 1.4, 16, 6); flagG.translate(1.1, 0, 0);
    const flagM = patchWorldVertex(new THREE.MeshStandardMaterial({ color: roofCols[c.roof], roughness: 0.9, side: THREE.DoubleSide }), U,
      `float fx = position.x / 2.2; wpos.xyz += vec3(uWind.x, 0., uWind.y) * fx * .4 * uWind.z; wpos.y += sin(uTime * 6. + position.x * 3.) * .12 * fx; wpos.xz += vec2(-uWind.y, uWind.x) * sin(uTime * 5.3 + position.x * 2.6 + position.y) * .22 * fx;`, { key: 'flag' });
    const flag = new THREE.Mesh(flagG, flagM); flag.position.set(bx, by + 6.2, bz); flag.rotation.y = Math.atan2(-U.uWind.value.y, U.uWind.value.x); flag.castShadow = true; scene.add(flag);
  }
  /* plantações: cercas baixas (pular) */
  for (const f of L.fields) {
    const x0 = f.x0 * S, x1 = f.x1 * S, z0 = f.z0 * S, z1 = f.z1 * S;
    for (const z of [z0 - 0.3, z1 + 0.3]) {
      for (let x = x0; x <= x1 + 0.01; x += 2.4) { const gy = heightAt(x, z); dwood.add(new THREE.CylinderGeometry(0.09, 0.1, 1.2, 8), x, gy + 0.6, z); }
      const segs = Math.ceil((x1 - x0) / 2.4);
      for (let k = 0; k < segs; k++) { const xa = x0 + k * 2.4, xb = Math.min(x1, xa + 2.4), xm = (xa + xb) / 2, gy = heightAt(xm, z); for (const hh of [0.45, 0.95]) wood.box(xb - xa, 0.12, 0.08, xm, gy + hh, z); }
      const gm = heightAt((x0 + x1) / 2, z); phys.add({ type: 'box', x: (x0 + x1) / 2, z, hx: (x1 - x0) / 2, hz: 0.15, rot: 0, y0: gm - 1, y1: gm + 1.05, vault: true });
    }
  }
  /* pontes de pedra com arco e parapeitos */
  for (const b of CW.bridges) {
    const ax = b.a[0] * S, az = b.a[1] * S, bx = b.b[0] * S, bz = b.b[1] * S, dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len, ang = Math.atan2(dx, dz);
    const ha = heightAt(ax, az), hb = heightAt(bx, bz), hw = b.hw * S + 0.8, minTop = WATER_Y + 1.3;
    const topAt = (t) => { const base = ha + (hb - ha) * t; return Math.max(base, minTop * Math.sin(Math.PI * t) + base * (1 - Math.sin(Math.PI * t))) + 0.25 + 0.8 * Math.sin(Math.PI * t); };
    const N = Math.max(8, Math.ceil(len / 1.2));
    for (let i = 0; i < N; i++) {
      const t0 = i / N, t1 = (i + 1) / N, tm = (t0 + t1) / 2, x = ax + dx * tm, z = az + dz * tm, y = topAt(tm), seg = len / N;
      stoneB.box(hw * 2, 0.6, seg + 0.05, x, y - 0.3, z, ang);
      for (const sd of [-1, 1]) stoneD.box(0.45, 0.95, seg + 0.05, x + uz * sd * (hw + 0.2), y + 0.45, z - ux * sd * (hw + 0.2), ang);
    }
    for (const sd of [-1, 1]) for (const e of [0, 1]) { const x = ax + dx * e + uz * sd * (hw + 0.2), z = az + dz * e - ux * sd * (hw + 0.2), y = topAt(e); stoneD.box(0.8, 1.6, 0.8, x, y + 0.8, z, ang); }
    const pier = (t) => { const x = ax + dx * t, z = az + dz * t, y = topAt(t); stoneD.box(hw * 2 - 0.8, y - (WATER_Y - 2), 1.4, x, (y + WATER_Y - 2) / 2 - 0.3, z, ang); };
    pier(0.3); pier(0.7);
    const cxm = (ax + bx) / 2, czm = (az + bz) / 2;
    phys.add({ type: 'box', x: cxm, z: czm, hx: hw, hz: len / 2, rot: ang, y0: -99, y1: 99, floor: true, noCollide: true,
      topFn: (x, z) => { const t = Math.max(0, Math.min(1, ((x - ax) * ux + (z - az) * uz) / len)); return topAt(t); } });
    for (const sd of [-1, 1]) phys.add({ type: 'box', x: cxm + uz * sd * (hw + 0.2), z: czm - ux * sd * (hw + 0.2), hx: 0.25, hz: len / 2, rot: ang, y0: Math.min(ha, hb) - 0.5, y1: Math.max(topAt(0.5), ha, hb) + 1.0, vault: true });
  }
  /* postes com tocha ao longo da calçada */
  const road = CW.roads.find(r => r.id === 'main');
  for (const p of L.lamps) {
    let bi = 0, bd = 1e9; road.d.forEach((q, i) => { const e = Math.hypot(q[0] - p[0], q[1] - p[1]); if (e < bd) { bd = e; bi = i; } });
    const a = road.d[Math.max(0, bi - 1)], b = road.d[Math.min(road.d.length - 1, bi + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l, w = road.hw + 1.1;
    for (const sd of [-1, 1]) { const x = (p[0] + nx * w * sd) * S, z = (p[1] + nz * w * sd) * S, y = heightAt(x, z);
      stoneD.box(1.3, 1.0, 1.3, x, y + 0.5, z); stoneB.add(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 16), x, y + 2.1, z); iron.add(new THREE.CylinderGeometry(0.55, 0.32, 0.4, 16), x, y + 3.35, z); addFire(x, y + 3.65, z, 1);
      phys.add({ type: 'box', x, z, hx: 0.65, hz: 0.65, rot: 0, y0: y - 1, y1: y + 3.4 }); }
  }
  /* segunda escadaria da calçada */
  if (L.steps) {
    const st = L.steps; let bi = 0, bd = 1e9; road.d.forEach((q, i) => { const e = Math.hypot(q[0] - st.x, q[1] - st.z); if (e < bd) { bd = e; bi = i; } });
    const a = road.d[Math.max(0, bi - 2)], b = road.d[Math.min(road.d.length - 1, bi + 2)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, ux = tx / l, uz = tz / l, ang = Math.atan2(tx, tz);
    for (let i = 0; i < st.n + 2; i++) { const o = (i - (st.n + 2) / 2) * 0.8, x = st.x * S + ux * o, z = st.z * S + uz * o, y = heightAt(x, z) + 0.12;
      stoneB.box(st.w * S, 0.7, 0.84, x, y - 0.35, z, ang); phys.add({ type: 'box', x, z, hx: st.w * S / 2, hz: 0.42, rot: ang, y0: y - 2, y1: y, floor: true }); }
  }
  let world_ring = null;
  /* ---------- v143 · discos de piso PBR colados no terreno (praça de spawn, ruínas e torres) ---------- */
  const groundPatch = (cx, cz, R, mat, uvs, lift = 0.04, seg = 36, edge = 0.72) => {
    const g = new THREE.PlaneGeometry(2 * R, 2 * R, seg, seg); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(P.count * 4);
    for (let i = 0; i < P.count; i++) {
      const vx = P.getX(i), vz = P.getZ(i), x = cx + vx, z = cz + vz, d = Math.hypot(vx, vz) / R;
      P.setXYZ(i, x, heightAt(x, z) + lift, z); uv.setXY(i, x * uvs, z * uvs);
      const t = Math.min(1, Math.max(0, (1 - d) / (1 - edge))); col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = t * t * (3 - 2 * t);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 2; scene.add(m); return m;
  };
  const patchMat = (set, tint = 0xffffff) => new THREE.MeshStandardMaterial({ ...set, roughness: 1, color: tint, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  if (tex.plaza && tex.plaza.map) { const pz = CW.PLAZA; groundPatch(pz.x * S, pz.z * S, pz.r * S * 1.12, patchMat(tex.plaza, 0xf2eee6), 0.17, 0.06, 56, 0.86); }
  const crackM = tex.crack && tex.crack.map ? patchMat(tex.crack, 0xe6e0d6) : null, mosM = tex.mosaic && tex.mosaic.map ? patchMat(tex.mosaic, 0xe8e0d4) : null;

  /* ---------- v143 · montanhas distantes (a foto da cordilheira em 8 painéis com bordas suaves ao redor do mundo) ---------- */
  if (tex.mount && tex.mount.map && !FIRE) {
    const mm = new THREE.MeshBasicMaterial({ map: tex.mount.map, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, color: FOREST ? 0xa8c8b8 : 0xc4d4e6 });
    const ring = new THREE.Group(); ring.name = 'montanhas-distantes';
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2 + 0.2, R = 880 + (k % 3) * 40, hh = 270 + (k % 4) * 30, pm = new THREE.Mesh(new THREE.PlaneGeometry(880, hh), mm);
      pm.position.set(Math.cos(a) * R, hh * 0.36, Math.sin(a) * R); pm.lookAt(0, hh * 0.36, 0); if (k % 2) pm.scale.x = -1; pm.renderOrder = -1 - (k % 3) * 0.1; ring.add(pm);
    }
    ring.onBeforeRender = () => { }; ring.traverse(o => { o.frustumCulled = false; }); scene.add(ring); world_ring = ring;
  }

  /* ---------- v143 · vitórias-régias flutuando nas águas rasas ---------- */
  if (tex.lily && tex.lily.map) {
    const pads = [], rl = CW.mulberry32(77);
    for (let x = -W.HX * S + 4; x < W.HX * S - 4; x += 2.4) for (let z = -W.HZ * S + 4; z < W.HZ * S - 4; z += 2.4) {
      const px = x + (rl() - 0.5) * 2.2, pz = z + (rl() - 0.5) * 2.2, d = WATER_Y - heightAt(px, pz);
      if (d < 0.18 || d > 1.25 || Math.sin(px * 0.13) * Math.cos(pz * 0.11) + Math.sin(px * 0.31 + pz * 0.23) * 0.5 < 0.15) continue;
      pads.push({ x: px, z: pz, s: 0.55 + rl() * 0.9, ry: rl() * 6.28, c: (rl() * 10) | 0 });
    }
    if (pads.length) {
      const lg = new THREE.PlaneGeometry(1, 1); lg.rotateX(-Math.PI / 2);
      const lm = patchWorldVertex(new THREE.MeshStandardMaterial({ map: tex.lily.map, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0 }), U, 'wpos.x += sin(uTime * .23 + base.z * .31) * .16 + uWind.x * sin(uTime * .11 + base.x) * .1; wpos.z += cos(uTime * .19 + base.x * .27) * .16 + uWind.y * sin(uTime * .13 + base.z) * .1; wpos.y += sin(uTime * 1.3 + base.x * .7 + base.z * .9) * .02; wpos.xyz += interDisp(wpos.xyz, .9, 1.6) * vec3(1., .0, 1.);', { key: 'lily' });
      for (let c = 0; c < 10; c++) {
        const list = pads.filter(p => p.c === c); if (!list.length) continue;
        const g2 = lg.clone(), uv = g2.attributes.uv, cx = c % 4, cy = 3 - Math.floor(c / 4); for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + cx) / 4, (uv.getY(i) + cy) / 4);
        const im = new THREE.InstancedMesh(g2, lm, list.length), mt = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        list.forEach((p, i) => { e.set(0, p.ry, 0); q.setFromEuler(e); mt.compose(new THREE.Vector3(p.x, WATER_Y + 0.03, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, mt); });
        im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
      }
    }
  }

  let dropUpdate = () => { };
  /* ---------- v144 · poças d'água refletivas (terreno plano, longe de estradas, acampamentos e ruínas) ---------- */
  if (Q >= 1) {
    const puddles = puddleList;
    const pm = new THREE.MeshPhysicalMaterial({ color: 0x4a6277, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.82, vertexColors: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, envMapIntensity: 1.6 });
    pm.onBeforeCompile = (sh) => {
      sh.uniforms.uInter = U.uInter; sh.uniforms.uTime = U.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWpP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWpP = (modelMatrix * vec4(transformed, 1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec4 uInter[8]; uniform float uTime; varying vec3 vWpP;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          { vec2 g = vec2(sin(vWpP.x * 3. + uTime * 1.3), cos(vWpP.z * 3.3 - uTime * 1.1)) * .02;
            for (int i = 0; i < 8; i++) { vec4 I = uInter[i]; if (I.w <= 0.) continue; vec2 dv = vWpP.xz - I.xz; float d = length(dv); if (d > 4.5 || abs(vWpP.y - I.y) > 3.) continue; float amp = exp(-d * .8) * smoothstep(0., .35, d); g += normalize(dv + 1e-4) * cos(d * 11. - uTime * 6.) * amp; }
            normal = normalize(normal + (viewMatrix * vec4(g.x, 0., g.y, 0.)).xyz * .4); }`); };
    pm.customProgramCacheKey = () => 'puddleRipple';
    for (const p of puddles) {
      const seg = 22, g = new THREE.PlaneGeometry(2 * p.r * 1.3, 2 * p.r * 1.3, seg, seg); g.rotateX(-Math.PI / 2);
      const P = g.attributes.position, col = new Float32Array(P.count * 4);
      for (let i = 0; i < P.count; i++) {
        const vx = P.getX(i), vz = P.getZ(i), a = Math.atan2(vz, vx) + p.ry, rr = p.r * (0.82 + 0.18 * Math.sin(a * 3 + p.ry) + 0.1 * Math.sin(a * 5 + p.r * 4)), d = Math.hypot(vx, vz) / rr;
        const x = p.x + vx, z = p.z + vz; P.setXYZ(i, x, heightAt(x, z) + 0.03, z);
        const t = Math.min(1, Math.max(0, (1 - d) / 0.35)); col[i * 4] = col[i * 4 + 1] = col[i * 4 + 2] = 1; col[i * 4 + 3] = t * t * (3 - 2 * t);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 4)); g.computeVertexNormals(); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, pm); m.receiveShadow = false; m.renderOrder = 3; scene.add(m);
    }
    /* respingos: quem corre dentro de uma poça levanta gotas que caem com gravidade */
    if (puddles.length) {
      const N = 90, drops = { n: 0 }, dm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 5, 4), new THREE.MeshBasicMaterial({ color: 0xcfe6f7, transparent: true, opacity: 0.85 }), N); dm.frustumCulled = false; scene.add(dm);
      const P = new Float32Array(N * 3), V = new Float32Array(N * 3), Lf = new Float32Array(N), prev = [], mt = new THREE.Matrix4(), sc = new THREE.Vector3(), q = new THREE.Quaternion(), pos = new THREE.Vector3();
      dropUpdate = (dt) => {
        const arr = U.uInter.value;
        for (let i = 0; i < 8; i++) {
          const I = arr[i]; if (I.w <= 0) { prev[i] = null; continue; } const pv = prev[i]; prev[i] = [I.x, I.z]; if (!pv) continue;
          const sp = Math.hypot(I.x - pv[0], I.z - pv[1]) / Math.max(dt, 1e-3); if (sp < 0.8 || sp > 40) continue;
          let inside = false; for (const pd of puddles) if (Math.hypot(pd.x - I.x, pd.z - I.z) < pd.r * 0.85) { inside = true; break; } if (!inside) continue;
          const gh = heightAt(I.x, I.z), k = Math.min(6, Math.ceil(sp * dt * 14));
          for (let j = 0; j < k; j++) { const d = drops.n++ % N; P[d * 3] = I.x + (Math.random() - 0.5) * 0.4; P[d * 3 + 1] = gh + 0.06; P[d * 3 + 2] = I.z + (Math.random() - 0.5) * 0.4; V[d * 3] = (Math.random() - 0.5) * 1.6; V[d * 3 + 1] = 1.8 + Math.random() * 1.6; V[d * 3 + 2] = (Math.random() - 0.5) * 1.6; Lf[d] = 0.55 + Math.random() * 0.3; }
        }
        for (let d = 0; d < N; d++) { if (Lf[d] > 0) { Lf[d] -= dt; V[d * 3 + 1] -= 9.8 * dt; P[d * 3] += V[d * 3] * dt; P[d * 3 + 1] += V[d * 3 + 1] * dt; P[d * 3 + 2] += V[d * 3 + 2] * dt; } const k = Lf[d] > 0 ? 1 : 0; pos.set(P[d * 3], P[d * 3 + 1], P[d * 3 + 2]); sc.set(k, k, k); mt.compose(pos, q, sc); dm.setMatrixAt(d, mt); }
        dm.instanceMatrix.needsUpdate = true;
      };
    }
  }

  /* ---------- v142 · ruínas antigas e torres de vigia (com física: colunas sólidas, muros e degraus pisáveis) ---------- */
  prog(0.6, 'Erguendo ruínas e torres');
  const dry = (x, z, m = 0.35) => heightAt(x, z) > WATER_Y + m && !(CW.riverInfo(x / S, z / S)?.t < 1.6);
  for (const r of L.ruins || []) {
    const cx = r.x * S, cz = r.z * S, rr = CW.mulberry32((CW.hash2(r.x, r.z, 31) * 4294967296) | 0), rot = r.rot || 0;
    if (!dry(cx, cz, 0.5)) continue;
    const N = 8 + ((rr() * 4) | 0), R = 6.5 + rr() * 2.5, gy0 = heightAt(cx, cz);
    if (crackM) groundPatch(cx, cz, R + 3.2, crackM, 0.2, 0.13, 40, 0.6);          // piso antigo rachado dentro do anel de pilares
    for (let i = 0; i < N; i++) {                                           // anel de pilares quebrados e trechos de muro
      const a = rot + i / N * Math.PI * 2 + (rr() - 0.5) * 0.12, px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R, gy = heightAt(px, pz);
      if (!dry(px, pz)) continue;
      if (rr() < 0.55) {
        const h = 2.2 + rr() * 3.8, w = 0.9 + rr() * 0.3, ry = a + rr();
        ruinB.add(new THREE.BoxGeometry(w, h, w), px, gy + h / 2 - 0.2, pz, ry);
        phys.add({ type: 'circle', x: px, z: pz, r: w * 0.65, y0: gy - 1, y1: gy + h });
        if (rr() < 0.6) ruinB.add(new THREE.BoxGeometry(w * 1.5, 0.35, w * 1.5), px, gy + h - 0.05, pz, ry);
      } else {
        const len = 3.2 + rr() * 1.6, h = 1.0 + rr() * 0.9, ang = -(a + Math.PI / 2);
        ruinB.add(new THREE.BoxGeometry(len, h, 0.7), px, gy + h / 2 - 0.1, pz, ang);
        phys.add({ type: 'box', x: px, z: pz, hx: len / 2, hz: 0.38, rot: ang, y0: gy - 0.5, y1: gy + h, vault: h < 1.6, floor: true });
      }
    }
    for (let i = 0; i < 2; i++) {                                           // colunas caídas
      const a = rr() * Math.PI * 2, d = 2.5 + rr() * 3, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, gy = heightAt(x, z), len = 3.4 + rr() * 1.4, ry = -rr() * 3;
      if (!dry(x, z)) continue;
      ruinB.add(new THREE.CylinderGeometry(0.5, 0.56, len, 14), x, gy + 0.5, z, ry, 0, Math.PI / 2);
      phys.add({ type: 'box', x, z, hx: len / 2, hz: 0.52, rot: ry, y0: gy - 0.4, y1: gy + 1.05, vault: true, floor: true });
    }
    ruinB.add(new THREE.BoxGeometry(2.8, 1.0, 1.7), cx, gy0 + 0.45, cz, rot);               // altar central e braseiro
    phys.add({ type: 'box', x: cx, z: cz, hx: 1.4, hz: 0.85, rot, y0: gy0 - 0.5, y1: gy0 + 0.95, vault: true, floor: true });
    iron.add(new THREE.CylinderGeometry(0.5, 0.3, 0.45, 12), cx, gy0 + 1.2, cz); addFire(cx, gy0 + 1.5, cz, 1.4);
  }
  for (const t of L.towers || []) {
    const cx = t.x * S, cz = t.z * S, gy = heightAt(cx, cz);
    if (!dry(cx, cz, 0.6)) continue;
    if (mosM) groundPatch(cx, cz, 6.2, mosM, 0.35, 0.13, 30, 0.6);                // calçada de seixos em volta da torre
    const BASE_H = 3.4, TOP = 17 * 0.45;                                    // 17 degraus de 0,45 m até a plataforma (7,65 m)
    ruinB.add(new THREE.CylinderGeometry(2.3, 2.6, BASE_H, 18), cx, gy + BASE_H / 2 - 0.2, cz);
    phys.add({ type: 'circle', x: cx, z: cz, r: 2.45, y0: gy - 1, y1: gy + BASE_H });
    for (let k = 0; k < 4; k++) {                                           // postes, plataforma, guarda-corpo e telhado
      const a = k * Math.PI / 2 + Math.PI / 4, px = cx + Math.cos(a) * 2.5, pz = cz + Math.sin(a) * 2.5;
      barkB.add(new THREE.CylinderGeometry(0.17, 0.2, TOP + 3.2 - BASE_H, 10), px, gy + BASE_H + (TOP + 3.2 - BASE_H) / 2 - 0.2, pz);
      phys.add({ type: 'circle', x: px, z: pz, r: 0.22, y0: gy + BASE_H - 1, y1: gy + TOP + 3.2 });
      wood.add(new THREE.BoxGeometry(2.6, 0.1, 0.1), cx + Math.cos(a + Math.PI / 2) * 0.0 + Math.cos(a) * 2.5 + 0, gy + TOP + 1.0, cz + Math.sin(a) * 2.5, -a - Math.PI / 2);
    }
    dwood.add(new THREE.BoxGeometry(5.8, 0.3, 5.8), cx, gy + TOP - 0.15, cz);
    phys.add({ type: 'box', x: cx, z: cz, hx: 2.9, hz: 2.9, rot: 0, y0: gy + TOP - 1, y1: gy + TOP, floor: true });
    dwood.add(new THREE.ConeGeometry(4.6, 2.2, 4), cx, gy + TOP + 4.3, cz, Math.PI / 4);
    const a0 = (CW.hash2(t.x, t.z, 5) * 6.28);
    for (let i = 0; i < 17; i++) {                                          // escada em espiral pisável
      const a = a0 + i * 0.28, px = cx + Math.cos(a) * 3.4, pz = cz + Math.sin(a) * 3.4, gH = heightAt(px, pz), h = (i + 1) * 0.45 + (gy - gH) + 0.0;
      if (h <= 0.1) continue;
      brickB.add(new THREE.BoxGeometry(1.7, h, 1.2), px, gH + h / 2 - 0.05, pz, -a);
      phys.add({ type: 'box', x: px, z: pz, hx: 0.85, hz: 0.6, rot: -a, y0: gH - 0.5, y1: gH + h, floor: true });
    }
    addFire(cx + Math.cos(a0 + 3.1) * 3.4, gy + 0.4, cz + Math.sin(a0 + 3.1) * 3.4, 1.3);
  }
  for (const [b, m, t] of [[wood, M.wood, 1.4], [dwood, M.darkWood, 1.4], [stoneB, M.stone, 2.4], [stoneD, M.stoneDark, 2.2], [iron, M.iron, 0], [rope, M.rope, 0], [ruinB, M.ruin, 3], [brickB, M.brick, 2.4], [barkB, M.bark, 2.2]]) { const me = b.mesh(m, t); if (me) scene.add(me); }
  await yieldUI();

  /* ---------- vegetação (árvores, arbustos, grama, flores, plantações, pedras, folhas caindo) ---------- */
  prog(0.6, 'Plantando a floresta');
  const veg = await buildVegetation({ THREE, scene, CW, S, U, phys, heightAt, hFast, tex, Q, DOM, TH: THEME, ultra, heightTex, maskTex, uDomain, WATER_Y, inPlatform, prog, yieldUI });

  /* bordas do mapa */
  for (const [x, z, hx, hz] of [[bounds.minX - 1, 0, 1, 400], [bounds.maxX + 1, 0, 1, 400], [0, bounds.minZ - 1, 400, 1], [0, bounds.maxZ + 1, 400, 1]]) phys.add({ type: 'box', x, z, hx, hz, rot: 0, y0: -50, y1: 200 });

  if (FIRE) { let k = 0; for (let i = 0; i < veg.trees.length && k < (Q === 0 ? 14 : 28); i += 5) { const t = veg.trees[i]; if (inPlatform(t.x, t.z, 4)) continue; addFire(t.x + 0.6, heightAt(t.x, t.z) + 0.1, t.z + 0.3, 1.4 + (i % 3) * 0.3); k++; } }
  /* ---------- fogo animado (todas as chamas num draw call) ---------- */
  prog(0.9, 'Acendendo tochas');
  const fireMesh = (() => {
    const n = fires.length, g = new THREE.InstancedBufferGeometry(); const base = new THREE.PlaneGeometry(1, 1.6, 1, 1); base.translate(0, 0.65, 0);
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    const off = new Float32Array(n * 4); fires.forEach((f, i) => { off[i * 4] = f.x; off[i * 4 + 1] = f.y; off[i * 4 + 2] = f.z; off[i * 4 + 3] = f.s; });
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); g.instanceCount = n;
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime, uWind: U.uWind },
      vertexShader: `attribute vec4 aOff; uniform float uTime; uniform vec3 uWind; varying vec2 vUv; varying float vSeed;
        void main(){ vUv = uv; vSeed = fract(aOff.x * 1.37 + aOff.z * 2.11);
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 p = aOff.xyz + right * position.x * aOff.w * .9 + vec3(0., 1., 0.) * position.y * aOff.w;
          p.xz += vec2(uWind.x, uWind.y) * uWind.z * position.y * position.y * .25 * aOff.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.); }`,
      fragmentShader: NOISE_GLSL + `uniform float uTime; varying vec2 vUv; varying float vSeed;
        void main(){ vec2 uv = vUv; float t = uTime * 2.2 + vSeed * 10.;
          float n = fbm2(vec2(uv.x * 4. + vSeed * 7., uv.y * 3. - t * 1.6));
          float shape = 1. - smoothstep(0., .5, length(vec2((uv.x - .5) * (1.6 + uv.y * 2.5), (uv.y - .25) * .9)));
          float f = clamp(shape * 1.4 - n * (.35 + uv.y * .9), 0., 1.);
          vec3 c = mix(vec3(1.,.25,.02), vec3(1.,.85,.4), smoothstep(.3,.9,f)); c = mix(c, vec3(1.,1.,.9), smoothstep(.85,1.,f));
          gl_FragColor = vec4(c * f * 1.6, f); }` });
    const me = new THREE.Mesh(g, m); me.frustumCulled = false; me.renderOrder = 7; scene.add(me); return me;
  })();
  const fireLights = Array.from({ length: Q === 0 ? 2 : 4 }, () => { const l = new THREE.PointLight(0xff9a40, 0, 14, 2); scene.add(l); return l; });

  /* ---------- partículas (respingos, poeira, folhas soltas) ---------- */
  const PN = 400, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 4), pSize = new Float32Array(PN), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pGrav = new Float32Array(PN);
  const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aCol', new THREE.BufferAttribute(pCol, 4)); pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  const pMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: innerHeight / 2 } },
    vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - .5; float a = smoothstep(.5,.15,length(d)); gl_FragColor = vec4(vC.rgb, vC.a * a); }` });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; points.renderOrder = 8; scene.add(points);
  let pI = 0;
  const emit = (x, y, z, vx, vy, vz, life, size, r, g, b, a, grav) => { const i = pI = (pI + 1) % PN; pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z; pVel[i * 3] = vx; pVel[i * 3 + 1] = vy; pVel[i * 3 + 2] = vz; pLife[i] = pMax[i] = life; pSize[i] = size; pCol[i * 4] = r; pCol[i * 4 + 1] = g; pCol[i * 4 + 2] = b; pCol[i * 4 + 3] = a; pGrav[i] = grav; };
  for (let i = 0; i < PN; i++) pPos[i * 3 + 1] = -999;

  /* ---------- clima do tema: faíscas e cinzas (Vale em Chamas) ou vaga-lumes (Floresta). Tudo na GPU: custo de CPU ~0 ---------- */
  const ambU = { uFocus: { value: new THREE.Vector3() }, uTime: U.uTime, uWind: U.uWind, uScale: { value: innerHeight / 2 } };
  if ((FIRE || FOREST) && !ultra) {
    const AN = [260, 520, 820][Q], BOX = 70, ag = new THREE.BufferGeometry(), ap = new Float32Array(AN * 3), at = new Float32Array(AN), r = CW.mulberry32(901);
    for (let i = 0; i < AN; i++) { ap[i * 3] = r() * BOX; ap[i * 3 + 1] = r() * 30; ap[i * 3 + 2] = r() * BOX; at[i] = FIRE ? (r() < 0.45 ? 1 : 0) : r(); }
    ag.setAttribute('position', new THREE.BufferAttribute(ap, 3)); ag.setAttribute('aT', new THREE.BufferAttribute(at, 1));
    const am = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: FIRE ? THREE.NormalBlending : THREE.AdditiveBlending, fog: false, uniforms: ambU,
      vertexShader: `attribute float aT; uniform vec3 uFocus; uniform float uTime, uScale; uniform vec3 uWind; varying float vT; varying float vA;
        void main(){ vT = aT; vec3 p = position; float B = ${BOX.toFixed(1)}; float s = fract(sin(dot(p.xz, vec2(12.9898,78.233))) * 43758.5453);
          ${FIRE ? `
          if (aT > .5) { p.y = mod(p.y + uTime * (2.2 + s * 2.), 30.); p.x += sin(uTime * 1.7 + s * 20.) * 1.2 + uWind.x * uWind.z * p.y * .6; p.z += cos(uTime * 1.3 + s * 17.) * 1.2 + uWind.y * uWind.z * p.y * .6; vA = 1. - p.y / 30.; }
          else { p.y = 30. - mod(30. - p.y + uTime * (.5 + s * .6), 30.); p.x += uTime * uWind.x * 1.4 + sin(uTime * .8 + s * 9.) * 1.5; p.z += uTime * uWind.y * 1.4 + cos(uTime * .7 + s * 7.) * 1.5; vA = smoothstep(0., 4., p.y) * smoothstep(30., 24., p.y); }`
          : `p.x += sin(uTime * .35 + s * 30.) * 3.; p.z += cos(uTime * .29 + s * 21.) * 3.; p.y = 0.6 + mod(p.y, 5.) + sin(uTime * .9 + s * 11.) * .6; vA = .5 + .5 * sin(uTime * (1.5 + s * 2.) + s * 40.); vA *= vA;`}
          vec3 w = uFocus + vec3(mod(p.x - uFocus.x + B * .5, B) - B * .5, p.y - 2., mod(p.z - uFocus.z + B * .5, B) - B * .5);
          w.y += uFocus.y;
          vec4 mv = viewMatrix * vec4(w, 1.); float sz = ${FIRE ? 'aT > .5 ? .16 : .24' : '.14'};
          gl_PointSize = clamp(sz * uScale / -mv.z, 1., 18.); gl_Position = projectionMatrix * mv;
          vA *= smoothstep(B * .5, B * .3, length(w.xz - uFocus.xz)); }`,
      fragmentShader: `varying float vT; varying float vA; void main(){ vec2 d = gl_PointCoord - .5; float a = smoothstep(.5, .05, length(d));
        ${FIRE ? 'vec3 c = vT > .5 ? mix(vec3(1.,.35,.05), vec3(1.,.85,.4), a) : vec3(.42,.4,.38); gl_FragColor = vec4(c * (vT > .5 ? 2.2 : 1.), a * vA * (vT > .5 ? 1. : .75));'
          : 'gl_FragColor = vec4(vec3(.8,1.,.35) * 1.8 * a, a * vA);'} }` });
    const amb = new THREE.Points(ag, am); amb.frustumCulled = false; amb.renderOrder = 9; scene.add(amb);
  }

  /* ---------- minimapa ---------- */
  prog(0.95, 'Desenhando o mapa');
  const minimap = (() => {
    const mm = { minX: bounds.minX - 6, maxX: bounds.maxX + 6, minZ: bounds.minZ - 6, maxZ: bounds.maxZ + 6 }, Wc = 1024, Hc = Math.round(Wc * (mm.maxZ - mm.minZ) / (mm.maxX - mm.minX));
    const small = document.createElement('canvas'); small.width = 512; small.height = Math.round(512 * Hc / Wc); const sg = small.getContext('2d'), img = sg.createImageData(small.width, small.height);
    for (let j = 0; j < small.height; j++) for (let i = 0; i < small.width; i++) {
      const x = mm.minX + (i + 0.5) / small.width * (mm.maxX - mm.minX), z = mm.minZ + (j + 0.5) / small.height * (mm.maxZ - mm.minZ), h = hFast(x, z), hx = hFast(x + 1.5, z) - h, hz = hFast(x, z + 1.5) - h;
      const mi = (Math.max(0, Math.min(HH - 1, Math.floor(z - DOM.minZ))) * HW + Math.max(0, Math.min(HW - 1, Math.floor(x - DOM.minX)))) * 4;
      let c = [86, 140, 62]; const fo = mData[mi + 1] / 255, rd = mData[mi + 3] / 255;
      c = c.map((v, k) => v * (1 - fo * 0.4) + [40, 84, 40][k] * fo * 0.4);
      if (h > 12) c = c.map((v, k) => v * 0.4 + [150, 136, 116][k] * 0.6);
      if (rd > 0.4) c = [196, 168, 120];
      if (h < WATER_Y) { const d = Math.min(1, (WATER_Y - h) / 1.6); c = [70 - 40 * d, 160 - 50 * d, 200 - 30 * d]; }
      const shade = Math.max(0.6, Math.min(1.25, 1 - (hx * 0.5 + hz * 0.35) * 0.6));
      const k2 = (j * small.width + i) * 4; img.data[k2] = c[0] * shade; img.data[k2 + 1] = c[1] * shade; img.data[k2 + 2] = c[2] * shade; img.data[k2 + 3] = 255;
    }
    sg.putImageData(img, 0, 0);
    const cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc; const g = cv.getContext('2d'); g.imageSmoothingEnabled = true; g.drawImage(small, 0, 0, Wc, Hc);
    const P = (x, z) => [(x - mm.minX) / (mm.maxX - mm.minX) * Wc, (z - mm.minZ) / (mm.maxZ - mm.minZ) * Hc], k = Wc / (mm.maxX - mm.minX);
    for (const r of CW.roads) { g.strokeStyle = r.kind === 'cobble' ? '#d8d0c0' : '#c9a774'; g.lineWidth = r.hw * 2 * S * k; g.lineCap = g.lineJoin = 'round'; g.beginPath(); r.d.forEach((p, i) => { const q = P(p[0] * S, p[1] * S); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); }
    g.fillStyle = 'rgba(20,50,24,.55)'; for (const t of veg.trees) { const q = P(t.x, t.z); g.beginPath(); g.arc(q[0], q[1], Math.max(1.5, t.r * k * 0.9), 0, 7); g.fill(); }
    g.fillStyle = '#b5aea2'; g.strokeStyle = '#5c564e'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4, w = tWorld(Math.sin(a) * PR, Math.cos(a) * PR), q = P(w[0], w[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); } g.closePath(); g.fill(); g.stroke();
    { const q = P(TC.x, TC.z); g.fillStyle = '#3f8a72'; g.beginPath(); g.arc(q[0], q[1], AW * k, 0, 7); g.fill(); g.strokeStyle = '#b07aff'; g.lineWidth = 2; g.stroke(); }
    for (const c of L.camps) { const q = P(c.x * S, c.z * S); g.fillStyle = '#' + new THREE.Color(roofCols[c.roof]).getHexString(); g.beginPath(); g.arc(q[0], q[1], 6.9 * k, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.4)'; g.stroke(); }
    for (const f of L.fields) { const a = P(f.x0 * S, f.z0 * S), b = P(f.x1 * S, f.z1 * S); g.fillStyle = 'rgba(196,150,60,.85)'; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
    const vg = g.createRadialGradient(Wc / 2, Hc / 2, Hc * 0.3, Wc / 2, Hc / 2, Wc * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = vg; g.fillRect(0, 0, Wc, Hc);
    return { canvas: cv, ...mm };
  })();

  /* ---------- pontos de nascimento e locais nomeados ---------- */
  const spawnPoints = [];
  { const r = CW.mulberry32(9001); let tries = 0;
    while (spawnPoints.length < 40 && tries++ < 6000) {
      const x = bounds.minX + 12 + r() * (bounds.maxX - bounds.minX - 24), z = bounds.minZ + 10 + r() * (bounds.maxZ - bounds.minZ - 20), bx = x / S, bz = z / S, h = heightAt(x, z);
      if (h < WATER_Y + 0.4 || h > 9 || CW.slopeAt(bx, bz) > 0.45 || CW.freeness(bx, bz) < 0.5 || CW.forestDensity(bx, bz) > 0.4 || inPlatform(x, z, 4)) continue;
      const tmp = { x, y: h, z }; if (phys.resolve(tmp, 0.9, 1.8).hit) continue;
      if (spawnPoints.some(p => Math.hypot(p[0] - x, p[1] - z) < 22)) continue; spawnPoints.push([x, z]);
    } }
  const poi = [{ name: 'Casona', x: TC.x, z: TC.z }];
  const campNames = { C1: 'Acampamento Vermelho', C2: 'Acampamento Azul', C3: 'Acampamento do Vale', C4: 'Acampamento da Ponte', C5: 'Ilha Vermelha', C6: 'Acampamento Norte', C7: 'Posto das Ruínas', C8: 'Acampamento do Bosque', C9: 'Vila do Sul', C10: 'Acampamento do Pântano', C11: 'Fortim Leste', C12: 'Acampamento do Rio Grande', C13: 'Posto da Fronteira', C14: 'Mirante do Norte' };
  for (const c of L.camps) poi.push({ name: campNames[c.id] || c.id, x: c.x * S, z: c.z * S });
  (L.ruins || []).forEach((r, i) => poi.push({ name: 'Ruínas Antigas ' + (i + 1), x: r.x * S, z: r.z * S }));
  (L.towers || []).forEach((t, i) => poi.push({ name: 'Torre de Vigia ' + (i + 1), x: t.x * S, z: t.z * S }));
  poi.push({ name: 'Plantações', x: -58 * S, z: -30 * S }, { name: 'Pinheiral', x: -52 * S, z: 42 * S }, { name: 'Praça', x: CW.PLAZA.x * S, z: CW.PLAZA.z * S }, { name: 'Serra Norte', x: 34 * S, z: -58 * S }, { name: 'Bosque Leste', x: 62 * S, z: -8 * S });

  /* ---------- API ---------- */
  const wind = { x: 0.8, z: 0.6, strength: 0.6 };
  const focus = new THREE.Vector2(); let lightTimer = 0;
  const world = {
    S, WATER_Y, bounds, spawnPoints, poi, minimap, wind, phys, theme: THEME, fires, U, ripples, sunDir, veg, CWc: CW, TC, topY, AW, inPlatform, hemi, sun, fogCol,
    nearestFire(x, z) { let b = 1e9; for (const f of fires) { const d = (f.x - x) ** 2 + (f.z - z) ** 2; if (d < b) b = d; } return Math.sqrt(b); },
    nearestBush(x, z) { return veg.nearBush ? veg.nearBush(x, z) : 99; },
    nearestWater(x, z) { for (let r = 0; r <= 30; r += 3) for (let a = 0; a < 6.28; a += r ? 0.8 : 7) { if (heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) < WATER_Y) return r; } return 99; }, temple: { x: TC.x, z: TC.z, topY },
    heightAt, groundAt: (x, z, fromY = 1e9, info) => phys.groundAt(x, z, fromY, info),
    get colliders() { return phys.solids; },
    resolve: (pos, r, h) => phys.resolve(pos, r, h),
    raycast: (o, d, m) => phys.raycast(o, d, m),
    waterAt(x, z) { const h = heightAt(x, z); if (h >= WATER_Y) return null; const g = phys.groundAt(x, z, WATER_Y + 0.1); if (g >= WATER_Y) return null; return { surfaceY: WATER_Y, depth: WATER_Y - h }; },
    setInteractors(list) { const a = U.uInter.value; for (let i = 0; i < 8; i++) { const p = list[i]; if (p) a[i].set(p.x, p.y, p.z, p.r || 1.1); else a[i].set(0, -999, 0, 0); } },
    setFocus(x, z, y) { focus.set(x, z); U.uPlayer.value.set(x, (y ?? heightAt(x, z)) + 1.1, z); },
    splash(x, y, z, k = 1) {
      ripples[rippleI].set(x, z, U.uTime.value, Math.min(1.5, k)); rippleI = (rippleI + 1) % 8;
      const n = Math.round(8 + 14 * k); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = (1 + Math.random() * 2.5) * k; emit(x, WATER_Y + 0.05, z, Math.cos(a) * s, 2 + Math.random() * 3.5 * k, Math.sin(a) * s, 0.6 + Math.random() * 0.4, 0.09 + Math.random() * 0.1, 0.85, 0.95, 1, 0.85, 12); }
    },
    ripple(x, z, k = 0.4) { ripples[rippleI].set(x, z, U.uTime.value, k); rippleI = (rippleI + 1) % 8; },
    dust(x, y, z, k = 1) { const n = Math.round(4 + 8 * k); for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = (0.4 + Math.random()) * k; emit(x, y + 0.05, z, Math.cos(a) * s, 0.3 + Math.random() * 0.8, Math.sin(a) * s, 0.7 + Math.random() * 0.5, 0.25 + Math.random() * 0.3 * k, 0.62, 0.55, 0.45, 0.45, -0.3); } },
    leafBurst(x, y, z, n = 8) { veg.burst(x, y, z, n); },
    update(dt, time, camera) {
      U.uTime.value = time; dropUpdate(dt);
      /* vento com rajadas que mudam devagar */
      const ang = 0.6 + Math.sin(time * 0.05) * 0.6, str = 0.45 + 0.35 * Math.sin(time * 0.21) * Math.sin(time * 0.13 + 1) + 0.2 * Math.max(0, Math.sin(time * 0.7));
      wind.x = Math.cos(ang); wind.z = Math.sin(ang); wind.strength = Math.max(0.15, str); U.uWind.value.set(wind.x, wind.z, wind.strength);
      /* sombra acompanha o foco */
      const fx = Math.round(focus.x / 2) * 2, fz = Math.round(focus.y / 2) * 2, fy = heightAt(fx, fz);
      if (!ext.sun) { sun.target.position.set(fx, fy, fz); sun.position.set(fx + sunDir.x * 100, fy + sunDir.y * 100, fz + sunDir.z * 100); }
      if (scene.userData.sky && camera) scene.userData.sky.position.copy(camera.position);
      if (world_ring && camera) world_ring.position.set(camera.position.x, 0, camera.position.z);   // montanhas distantes acompanham a câmera (sem paralaxe)
      if (scene.userData.crystal) { const c = scene.userData.crystal; c.rotation.y = time * 0.6; c.position.y = topY + 3.4 + Math.sin(time * 1.4) * 0.25; }
      /* luzes das chamas mais próximas, com tremulação */
      lightTimer -= dt; if (lightTimer <= 0) { lightTimer = 0.4; const sorted = fires.map(f => [f, (f.x - focus.x) ** 2 + (f.z - focus.y) ** 2]).sort((a, b) => a[1] - b[1]); fireLights.forEach((l, i) => { const f = sorted[i] && sorted[i][0]; l.userData.f = f && sorted[i][1] < 50 * 50 ? f : null; if (l.userData.f) l.position.set(f.x, f.y + 0.6, f.z); }); }
      fireLights.forEach((l, i) => { const f = l.userData.f; l.intensity = f ? (6 + f.s * 6) * (0.8 + 0.2 * Math.sin(time * 17 + i * 3) * Math.sin(time * 7.3 + i)) : 0; });
      /* partículas */
      for (let i = 0; i < PN; i++) if (pLife[i] > 0) { pLife[i] -= dt; pVel[i * 3 + 1] -= pGrav[i] * dt; pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt; pCol[i * 4 + 3] = Math.max(0, pLife[i] / pMax[i]) * 0.8; if (pLife[i] <= 0) pPos[i * 3 + 1] = -999; }
      pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aCol.needsUpdate = true; pMat.uniforms.uScale.value = innerHeight / 2;
      ambU.uFocus.value.set(focus.x, U.uPlayer.value.y - 1.1, focus.y); ambU.uScale.value = innerHeight / 2;
      veg.update(dt, time, focus.x, focus.y, camera, wind);
    }
  };
  prog(1, 'Pronto');
  return world;
}
