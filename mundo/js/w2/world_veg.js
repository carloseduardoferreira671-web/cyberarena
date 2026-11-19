/* CyberArena 3D · vegetação viva: pinheiros e árvores de copa em 3D (malha suave, sem cartões PNG) que balançam com o vento,
   arbustos que se abrem quando alguém passa, grama na GPU em volta do jogador, flores, trigo, pedras e folhas caindo/voando. */
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { NOISE_GLSL, WIND_GLSL, patchWorldVertex } from './world_shaders.js';

export async function buildVegetation(ctx) {
  const { THREE, scene, CW, S, U, phys, heightAt, tex, Q, DOM, heightTex, maskTex, uDomain, WATER_Y, inPlatform, yieldUI } = ctx;
  const TH = ctx.TH || 'classic', FIRE = TH === 'fire', FOREST = TH === 'forest', ULTRA = !!ctx.ultra; let KIND = '';
  /* cores por tema: Vale em Chamas = madeira carbonizada e mato seco; Floresta Ancestral = verde profundo com musgo */
  const themed = (p, leaf) => {
    if (FIRE) { if (!leaf) return [p[0] * 0.42, p[1] * 0.36, p[2] * 0.34]; if (KIND === 'bush' || KIND === 'wheat') return [0.16 * (0.7 + p[1] * 2), 0.09 * (0.7 + p[1] * 2), 0.035]; return [0.05 + p[1] * 0.15, 0.04 + p[1] * 0.1, 0.035]; }
    if (FOREST) { if (!leaf) return [p[0] * 0.85, p[1] * 1.12, p[2] * 0.8]; return [p[0] * 0.7, p[1] * 1.18, p[2] * 0.85]; }
    return p;
  };
  const W = CW.W, sx = new SimplexNoise({ random: CW.mulberry32(77) });

  /* ---------- geometrias ---------- */
  const finish = (g, col, leaf) => {
    g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g, 1e-3); g.computeVertexNormals();
    const n = g.attributes.position.count, c = new Float32Array(n * 3), l = new Float32Array(n);
    for (let i = 0; i < n; i++) { const p = themed(typeof col === 'function' ? col(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)) : col, leaf); c[i * 3] = p[0]; c[i * 3 + 1] = p[1]; c[i * 3 + 2] = p[2]; l[i] = leaf; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('aLeaf', new THREE.BufferAttribute(l, 1)); return g;
  };
  const displace = (g, amp, freq, seed = 0, yScale = 1) => { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = sx.noise3d(x * freq + seed, y * freq, z * freq) * amp + sx.noise3d(x * freq * 2.7, y * freq * 2.7 + seed, z * freq * 2.7) * amp * 0.35, L = Math.hypot(x, y * yScale, z) || 1; p.setXYZ(i, x + x / L * n, y + y / L * n * yScale, z + z / L * n); } return g; };
  const trunkCol = (x, y, z) => { const v = 0.5 + 0.2 * sx.noise3d(x * 3, y * 2, z * 3); return [0.11 * v * 2, 0.07 * v * 2, 0.045 * v * 2]; };
  function pineGeo(detail) {
    const parts = [], seg = detail ? 14 : 8, h = 10;
    let t = new THREE.CylinderGeometry(0.13, 0.32, h * 0.75, detail ? 10 : 6, 4); t.translate(0, h * 0.375, 0); displace(t, 0.03, 4); parts.push(finish(t, trunkCol, 0));
    const layers = detail ? 6 : 4;
    for (let i = 0; i < layers; i++) {
      const k = i / (layers - 1), r = (2.9 * (1 - k * 0.78) + 0.25) * (FIRE ? 0.22 : 1), ch = 3.0 - k * 1.1, y = 2.4 + k * (h - 3.6);
      let c = new THREE.ConeGeometry(r, ch, seg, detail ? 3 : 1); const p = c.attributes.position;
      for (let j = 0; j < p.count; j++) { const yy = p.getY(j), x = p.getX(j), z = p.getZ(j), a = Math.atan2(z, x), rr = Math.hypot(x, z) / r; const droop = rr * rr * 0.55, wav = 1 + 0.16 * Math.sin(a * (5 + i) + i * 2.1) + 0.08 * sx.noise3d(x, yy + i, z);
        p.setXYZ(j, x * wav, yy - droop + (yy < -ch / 2 + 0.01 ? 0.25 : 0), z * wav); }
      c.translate(0, y + ch / 2, 0); displace(c, 0.12, 1.4, i * 3);
      parts.push(finish(c, (x, yy, z) => { const shade = 0.55 + 0.45 * Math.min(1, Math.hypot(x, z) / r) * (0.6 + 0.4 * k), n = 0.85 + 0.25 * sx.noise3d(x * 2, yy * 2, z * 2); return [0.035 * shade * n, 0.105 * shade * n, 0.045 * shade * n]; }, 1));
    }
    return mergeGeometries(parts);
  }
  function oakGeo(detail) {
    const parts = [];
    let t = new THREE.CylinderGeometry(0.22, 0.42, 4.2, detail ? 10 : 6, 4); t.translate(0, 2.1, 0); displace(t, 0.05, 3); parts.push(finish(t, trunkCol, 0));
    for (const [ax, az, len] of [[0.6, 0.2, 2.2], [-0.5, 0.45, 2.0], [0.1, -0.7, 1.9]]) { const b = new THREE.CylinderGeometry(0.07, 0.16, len, 6, 2); b.translate(0, len / 2, 0); b.rotateZ(-ax); b.rotateX(az); b.translate(0, 3.4, 0); parts.push(finish(b, trunkCol, 0)); }
    const blobs = [[0, 6.0, 0, 2.6], [1.6, 5.2, 0.6, 1.9], [-1.5, 5.4, 0.8, 1.9], [0.4, 5.0, -1.6, 1.8], [-0.6, 7.2, -0.3, 1.8], [0.9, 6.6, 1.4, 1.6], [-1.2, 6.4, -1.2, 1.5]];
    if (FIRE) for (const [ax, az, len] of [[1.0, 0.9, 1.6], [-0.9, -0.6, 1.5], [0.3, 1.2, 1.3], [-0.4, -1.1, 1.2]]) { const b = new THREE.CylinderGeometry(0.03, 0.09, len, 5, 2); b.translate(0, len / 2, 0); b.rotateZ(-ax); b.rotateX(az); b.translate(0, 4.4, 0); parts.push(finish(b, trunkCol, 0)); }
    blobs.forEach(([x, y, z, r], i) => { if (i > 4 || FIRE) return; r *= 1.12; let s = new THREE.IcosahedronGeometry(r, detail ? 3 : 1); displace(s, r * 0.22, 0.9, i * 5.3, 0.9); s.translate(x, y, z);
      parts.push(finish(s, (px, py, pz) => { const up = Math.max(0, Math.min(1, (py - 4) / 4)), n = 0.8 + 0.35 * (sx.noise3d(px * 1.3, py * 1.3, pz * 1.3) * 0.5 + 0.5); return [(0.05 + up * 0.05) * n, (0.13 + up * 0.08) * n, (0.035 + up * 0.01) * n]; }, 1)); });
    return mergeGeometries(parts);
  }
  function bushGeo() {
    const parts = []; [[0, 0.55, 0, 0.75], [0.5, 0.45, 0.2, 0.55], [-0.45, 0.4, 0.25, 0.55], [0.1, 0.4, -0.5, 0.5]].forEach(([x, y, z, r], i) => {
      let s = new THREE.IcosahedronGeometry(r, 2); displace(s, r * 0.25, 2.2, i * 7, 0.85); s.translate(x, y, z);
      parts.push(finish(s, (px, py, pz) => { const n = 0.75 + 0.4 * (sx.noise3d(px * 3, py * 3, pz * 3) * 0.5 + 0.5), up = Math.min(1, py / 1.1); return [(0.05 + up * 0.05) * n, (0.12 + up * 0.09) * n, 0.04 * n]; }, 1)); });
    return mergeGeometries(parts);
  }
  function rockGeo(seed) { let g = new THREE.IcosahedronGeometry(1, 2); displace(g, 0.26, 0.9, seed); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.78 + 0.1); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); g.computeVertexNormals();
    const uv = new Float32Array(p.count * 2); for (let i = 0; i < g.attributes.position.count; i++) { uv[i * 2] = g.attributes.position.getX(i) * 0.5 + g.attributes.position.getZ(i) * 0.3; uv[i * 2 + 1] = g.attributes.position.getY(i) * 0.5; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
  function flowerGeo() {
    const stem = new THREE.CylinderGeometry(0.012, 0.018, 0.45, 5, 2); stem.translate(0, 0.225, 0);
    const head = new THREE.SphereGeometry(0.06, 8, 6); head.scale(1, 0.45, 1); head.translate(0, 0.46, 0);
    const parts = [finish(stem, [0.05, 0.16, 0.04], 0)];
    for (let i = 0; i < 5; i++) { const pt = new THREE.SphereGeometry(0.055, 8, 5); pt.scale(1.3, 0.25, 0.7); pt.translate(0.07, 0.46, 0); pt.rotateY(i / 5 * Math.PI * 2); parts.push(finish(pt, [1, 1, 1], 1)); }
    parts.push(finish(head, [0.9, 0.7, 0.1], 1)); return mergeGeometries(parts);
  }
  function wheatGeo() {
    const parts = []; const r = CW.mulberry32(3);
    for (let i = 0; i < 5; i++) { const x = (r() - 0.5) * 0.45, z = (r() - 0.5) * 0.45, h = 0.85 + r() * 0.35, lean = (r() - 0.5) * 0.3;
      const st = new THREE.CylinderGeometry(0.008, 0.014, h, 4, 3); st.translate(0, h / 2, 0); st.rotateZ(lean); st.translate(x, 0, z); parts.push(finish(st, [0.32, 0.26, 0.07], 1));
      const ear = new THREE.SphereGeometry(0.035, 4, 3); ear.scale(1, 3.2, 1); ear.translate(0, h + 0.08, 0); ear.rotateZ(lean); ear.translate(x, 0, z); parts.push(finish(ear, [0.5, 0.38, 0.1], 1)); }
    return mergeGeometries(parts);
  }

  /* ---------- materiais com vento ---------- */
  const foliage = (stiff, flutter, inter, key) => patchWorldVertex(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), U, `
      vWp = wpos.xyz; vLeaf = aLeaf;
      wpos.xyz += windDisp(base, hgt, ${stiff.toFixed(5)}, 0.) ;
      wpos.xyz += vec3(sin(uTime*5.7 + wpos.x*1.7 + wpos.y), cos(uTime*4.9 + wpos.z*1.9) * .5, sin(uTime*6.6 + wpos.y*2.1)) * ${flutter.toFixed(3)} * aLeaf * (.35 + uWind.z);
      ${inter ? 'wpos.xyz += interDisp(wpos.xyz, min(hgt, 1.6), ' + inter.toFixed(2) + ');' : ''}`,
    { key: key + ((key === 'pine' || key === 'oak') && tex.bark && tex.leaf ? '-tri' : ''), vertexHead: 'attribute float aLeaf; varying vec3 vWp; varying float vLeaf;',
      fragment: (sh) => { const TRI = (key === 'pine' || key === 'oak') && tex.bark && tex.leaf; if (TRI) { sh.uniforms.uBarkT = { value: tex.bark.map }; sh.uniforms.uLeafT = { value: tex.leaf.map }; }
        sh.uniforms.uPlayer = U.uPlayer; sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uPlayer; varying vec3 vWp; varying float vLeaf;' + (TRI ? 'uniform sampler2D uBarkT, uLeafT;' : '') + NOISE_GLSL)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          {
            /* folhagem entre a câmera e o personagem fica "vazada" (pontilhado), como em jogos de tiro em 3ª pessoa */
            vec3 cp = cameraPosition, pp = uPlayer; vec3 seg = pp - cp; float L = length(seg); vec3 sd = seg / max(L, 1e-3);
            float t = clamp(dot(vWp - cp, sd), 0., L); float dl = length(vWp - (cp + sd * t));
            float near = 1. - smoothstep(1.6, 3.2, distance(vWp, cp));
            float occ = (1. - smoothstep(1.1, 2.4, dl)) * step(t, L - .6);
            float k = max(near, occ * .85);
            float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
            if (k > 0. && n < k) discard;
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float lf = vnoise(vWp.xz * 5.1 + vWp.y * 3.7) * .6 + vnoise(vWp.xy * 11.) * .4;
          diffuseColor.rgb *= mix(1., .7 + .6 * lf, vLeaf);
          ${TRI ? `vec3 wnT = abs(normalize(cross(dFdx(vWp), dFdy(vWp)))); wnT = pow(wnT, vec3(3.)); wnT /= (wnT.x + wnT.y + wnT.z);
          vec3 bkT = texture2D(uBarkT, vWp.zy * .42).rgb * wnT.x + texture2D(uBarkT, vWp.xz * .42).rgb * wnT.y + texture2D(uBarkT, vWp.xy * .42).rgb * wnT.z;
          vec3 lfT = texture2D(uLeafT, vWp.zy * .8).rgb * wnT.x + texture2D(uLeafT, vWp.xz * .8).rgb * wnT.y + texture2D(uLeafT, vWp.xy * .8).rgb * wnT.z;
          diffuseColor.rgb *= mix(bkT * 3.4, lfT * 3.0, vLeaf);` : ''}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
          reflectedLight.indirectDiffuse += diffuseColor.rgb * vLeaf * .18;`); } });
  const pineMat = foliage(0.0042, 0.025, 0, 'pine'), oakMat = foliage(0.0065, 0.05, 0, 'oak'), bushMat = foliage(0.03, 0.03, 0.55, 'bush'), flowerMat = foliage(0.35, 0.02, 0.4, 'flower'), wheatMat = foliage(0.22, 0.03, 0.5, 'wheat');
  const rockMat = new THREE.MeshStandardMaterial({ ...tex.rock, color: 0xc8c0b4, roughness: 1 });

  /* ---------- distribuição ---------- */
  const trees = [], pines = [], oaks = [], bushes = [], rocks = [], flowers = [], canopies = [];
  const ix0 = Math.floor(-(W.HX + W.EXT + 4) / CW.CS), ix1 = Math.ceil((W.HX + W.EXT + 4) / CW.CS), iz0 = Math.floor(-(W.HZ + W.EXT + 4) / CW.CS), iz1 = Math.ceil((W.HZ + W.EXT + 4) / CW.CS);
  const bush3 = Q === 0 ? 0.6 : 1;
  for (let ix = ix0; ix <= ix1; ix++) {
    for (let iz = iz0; iz <= iz1; iz++) for (const o of CW.cellObjects(ix, iz)) {
      const x = o.x * S, z = o.z * S; if (inPlatform(x, z, 6)) continue; const y = heightAt(x, z);
      if (o.t === 'pine' || o.t === 'oak') {
        const s = o.s * (o.t === 'pine' ? 1.05 : 1.0), r = (o.t === 'pine' ? 0.32 : 0.42) * s, ry = (o.seed % 628) / 100;
        (o.t === 'pine' ? pines : oaks).push({ x, y: y - 0.1, z, s, ry });
        trees.push({ x, z, r: (o.t === 'pine' ? 2.6 : 3) * s });
        canopies.push({ x, y: y + (o.t === 'pine' ? 6 : 5.8) * s, z, r: (o.t === 'pine' ? 2 : 2.8) * s, oak: o.t === 'oak' });
        phys.add({ type: 'circle', x, z, r, y0: y - 1, y1: y + 9 * s });
      } else if (o.t === 'bush') { if ((o.seed % 100) / 100 < bush3) bushes.push({ x, y: y - 0.05, z, s: o.s * 1.15, ry: (o.seed % 628) / 100 }); }
      else if (o.t === 'rock') { const s = o.s * 0.9 * S; rocks.push({ x, y: y - 0.25 * s, z, s, ry: (o.seed % 628) / 100, sy: 0.8 + (o.seed % 50) / 100 }); const top = y + s * 0.6; phys.add({ type: 'circle', x, z, r: s * 0.85, y0: y - 1, y1: top, vault: top - y < 1.3, floor: true }); }
      else if (o.t === 'flowers') { const r = CW.mulberry32(o.seed); const pal = [[0.9, 0.2, 0.25], [0.95, 0.85, 0.2], [0.85, 0.85, 0.95], [0.6, 0.3, 0.9], [1, 0.5, 0.15]], col = pal[(r() * pal.length) | 0];
        for (let i = 0; i < o.n; i++) { const fx = x + (r() - 0.5) * 3, fz = z + (r() - 0.5) * 3; flowers.push({ x: fx, y: heightAt(fx, fz) - 0.02, z: fz, s: 0.8 + r() * 0.6, ry: r() * 6.28, col }); } }
    }
    if (ix % 12 === 0) { ctx.prog(0.6 + 0.2 * (ix - ix0) / (ix1 - ix0), 'Plantando a floresta'); await yieldUI(); }
  }
  for (const c of CW.crags) { const x = c.x * S, z = c.z * S, y = heightAt(x, z), s = c.s * S * 0.75; if ((c.seed % 3) === 0) continue; rocks.push({ x, y: y - 0.45 * s, z, s: s * 0.8, ry: (c.seed % 628) / 100, sy: 1.1 }); phys.add({ type: 'circle', x, z, r: s * 0.8, y0: y - 1, y1: y + s * 0.6, floor: true }); }
  const wheat = [];
  for (const f of CW.LAYOUT.fields) { const r = CW.mulberry32(f.x0 * 31 + f.z0); for (let z = f.z0 * S + 0.6; z < f.z1 * S - 0.3; z += 0.95) for (let x = f.x0 * S + 0.4; x < f.x1 * S - 0.3; x += 0.7) { const jx = x + (r() - 0.5) * 0.2, jz = z + (r() - 0.5) * 0.2; wheat.push({ x: jx, y: heightAt(jx, jz) - 0.05, z: jz, s: 0.9 + r() * 0.3, ry: r() * 6.28 }); } }

  /* ---------- instâncias em blocos (para descartar o que está fora da câmera) com 2 níveis de detalhe ---------- */
  const CH = 72, lodGroups = [];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  function instanced(items, geoHi, geoLo, mat, { shadow = true, color = false, lodDist = 70 } = {}) {
    const buckets = new Map();
    for (const it of items) { const k = Math.floor(it.x / CH) + ',' + Math.floor(it.z / CH); let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(it); }
    for (const list of buckets.values()) {
      const m = new THREE.InstancedMesh(geoHi, mat, list.length); m.castShadow = shadow; m.receiveShadow = true;
      list.forEach((it, i) => { _e.set(0, it.ry || 0, 0); _q.setFromEuler(_e); _p.set(it.x, it.y, it.z); _s.set(it.s, it.s * (it.sy || 1), it.s); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); if (color) m.setColorAt(i, new THREE.Color(...it.col)); });
      m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); scene.add(m);
      if (geoLo) lodGroups.push({ m, hi: geoHi, lo: geoLo, c: m.boundingSphere.center.clone(), d: lodDist + m.boundingSphere.radius });
    }
  }
  if (FOREST) { const r2 = CW.mulberry32(404); for (const t of trees) if (r2() < 0.7) { const a = r2() * 6.28, d = t.r * (0.8 + r2() * 0.6), x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d; if (!inPlatform(x, z, 6) && heightAt(x, z) > WATER_Y + 0.2) bushes.push({ x, y: heightAt(x, z) - 0.05, z, s: 0.9 + r2() * 0.6, ry: r2() * 6.28 }); } }
  if (ULTRA) { bushes.splice(0, bushes.length, ...bushes.filter((_, i) => i % 2 === 0)); flowers.length = 0; }
  if (FIRE) flowers.length = 0;
  KIND = 'tree';
  instanced(pines, pineGeo(true), pineGeo(false), pineMat, { lodDist: ULTRA ? 35 : 60 });
  instanced(oaks, oakGeo(true), oakGeo(false), oakMat, { lodDist: ULTRA ? 32 : 55 });
  KIND = 'bush';
  if (tex.bushes && tex.bushes.map && !FIRE) {
    /* v143 · arbustos fotográficos: 3 planos cruzados (cada um com frente e verso próprios, normais "de copa"), um atlas 3×3 escolhido por instância,
       vento + empurrão de quem passa; a sombra vem de um proxy invisível (esfera achatada) para não ficar com "cara de papelão". */
    const baseGeo = (() => {
      const parts = [];
      for (let k = 0; k < 3; k++) for (let side = 0; side < 2; side++) {
        const g = new THREE.PlaneGeometry(2.0, 1.85); g.translate(0, 0.92, 0); if (side) g.rotateY(Math.PI); g.rotateY(k * Math.PI / 3);
        const n = g.attributes.normal, p = g.attributes.position;
        for (let v = 0; v < n.count; v++) { const x = p.getX(v), z = p.getZ(v), y = p.getY(v) + 0.5, l = Math.hypot(x, y, z) || 1; n.setXYZ(v, x / l, y / l, z / l); }
        parts.push(g);
      }
      return mergeGeometries(parts);
    })();
    const spriteMat = patchWorldVertex(new THREE.MeshStandardMaterial({ map: tex.bushes.map, alphaTest: 0.42, side: THREE.FrontSide, roughness: 0.9, metalness: 0, color: 0xffffff }), U,
      'wpos.xyz += windDisp(base, hgt, 0.03, 0.); wpos.xyz += vec3(sin(uTime*4.1 + wpos.x*1.3 + wpos.z), 0., cos(uTime*3.7 + wpos.z*1.1)) * .045 * (.35 + uWind.z) * hgt; wpos.xyz += interDisp(wpos.xyz, hgt * .9, .8);', { key: 'bushSprite' });
    const prevOBC = spriteMat.onBeforeCompile;
    spriteMat.onBeforeCompile = (sh, r) => { prevOBC(sh, r); sh.vertexShader = 'attribute float aCell;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = (vMapUv + vec2(mod(aCell, 3.), 2. - floor(aCell / 3.))) / 3.;\n#endif'); };
    spriteMat.customProgramCacheKey = () => 'bushSpriteAtlas';
    const blobGeo = new THREE.SphereGeometry(0.78, 8, 6); blobGeo.scale(1, 0.75, 1); blobGeo.translate(0, 0.7, 0);
    const blobMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    /* arbustos decorativos extras: sub-bosque, margens de rio, prados e clareiras (só visual: a lista "bushes" de esconderijo não muda) */
    const deco = [], rq = CW.mulberry32(4242), stepD = [6.5, 5.0, 4.0][Q], HXs = CW.W.HX * S, HZs = CW.W.HZ * S;
    for (let x = -HXs + 8; x < HXs - 8; x += stepD) for (let z = -HZs + 8; z < HZs - 8; z += stepD) {
      const jx = x + (rq() - 0.5) * stepD, jz = z + (rq() - 0.5) * stepD; if (inPlatform(jx, jz, 6)) continue;
      const bx = jx / S, bz = jz / S; if (CW.freeness(bx, bz) < 0.7) continue;
      const h = heightAt(jx, jz); if (h < WATER_Y + 0.35 || CW.slopeAt(bx, bz) > 0.45) continue;
      const ri = CW.riverInfo(bx, bz), pr = 0.2 + 0.75 * CW.forestDensity(bx, bz) + 0.35 * CW.meadow(bx, bz) + (ri && ri.t < 9 ? 0.3 : 0);
      if (rq() > pr) continue;
      const n = 1 + ((rq() * 3) | 0); for (let k = 0; k < n; k++) { const fx = jx + (rq() - 0.5) * 2.6, fz = jz + (rq() - 0.5) * 2.6; deco.push({ x: fx, y: heightAt(fx, fz) - 0.05, z: fz, s: 0.75 + rq() * 1.3, ry: rq() * 6.28, cell: (rq() * 9) | 0 }); }
    }
    const all = bushes.map(b => ({ ...b, cell: (b.ry * 100 | 0) % 9 })).concat(deco);
    const bk = new Map(); for (const it of all) { const k = Math.floor(it.x / 72) + ',' + Math.floor(it.z / 72); let l = bk.get(k); if (!l) bk.set(k, l = []); l.push(it); }
    for (const list of bk.values()) {
      const g = baseGeo.clone(), cells = new Float32Array(list.length); list.forEach((it, i) => { cells[i] = it.cell; });
      g.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
      const m = new THREE.InstancedMesh(g, spriteMat, list.length), pb = new THREE.InstancedMesh(blobGeo, blobMat, list.length);
      list.forEach((it, i) => { _e.set(0, it.ry || 0, 0); _q.setFromEuler(_e); _p.set(it.x, it.y, it.z); _s.set(it.s, it.s * 0.9, it.s); _m.compose(_p, _q, _s); m.setMatrixAt(i, _m); pb.setMatrixAt(i, _m); });
      m.castShadow = false; m.receiveShadow = false; m.computeBoundingSphere(); scene.add(m);
      if (Q >= 1) { pb.castShadow = true; pb.receiveShadow = false; pb.computeBoundingSphere(); scene.add(pb); }
    }
    ctx.decoBushes = deco.length;
  } else instanced(bushes, bushGeo(), null, bushMat, { shadow: Q >= 1 });
  { const rg = [rockGeo(1), rockGeo(7), rockGeo(13)]; rg.forEach((g, i) => instanced(rocks.filter((_, k) => k % 3 === i), g, null, rockMat)); }
  instanced(flowers, flowerGeo(), null, flowerMat, { shadow: false, color: true });
  KIND = 'wheat';
  instanced(wheat, wheatGeo(), null, wheatMat, { shadow: false });
  KIND = '';
  await yieldUI();

  /* ---------- grama na GPU: lâminas que acompanham o jogador, dobram com vento e com quem passa ---------- */
  const GR = [15, 20, 26][Q], GN = [9000, 20000, 36000][Q];
  {
    const blade = new THREE.PlaneGeometry(0.09, 1, 1, 4); blade.translate(0, 0.5, 0);
    const p = blade.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * 0.85)); }
    const g = new THREE.InstancedBufferGeometry(); g.index = blade.index; g.attributes.position = blade.attributes.position; g.attributes.uv = blade.attributes.uv;
    const off = new Float32Array(GN * 3), r = CW.mulberry32(55);
    for (let i = 0; i < GN; i++) { off[i * 3] = r() * GR * 2; off[i * 3 + 1] = r() * GR * 2; off[i * 3 + 2] = r(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); g.instanceCount = GN;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFocus: { value: new THREE.Vector2() }, uR: { value: GR } }]),
      vertexShader: '#include <common>\n#include <fog_pars_vertex>\n' + NOISE_GLSL + WIND_GLSL + `
        attribute vec3 aOff; uniform vec2 uFocus; uniform float uR; uniform sampler2D uH, uM; uniform vec4 uDom; uniform vec3 uSun;
        varying vec3 vC; varying float vT; varying float vL;
        void main(){
          vec2 wp = uFocus - uR + mod(aOff.xy - (uFocus - uR), 2. * uR);
          vec2 uv = (wp - uDom.xy) / uDom.zw; float gh = texture2D(uH, uv).r; vec4 mk = texture2D(uM, uv);
          float r = aOff.z, dist = length(wp - uFocus);
          float keep = step(r, mk.r * 1.05 - .05) * (1. - smoothstep(uR * .65, uR, dist));
          float hgt = (.32 + .45 * fract(r * 7.31) + mk.b * .25) * keep;
          float ang = r * 81.7, t = position.y;
          vec3 local = vec3(position.x * cos(ang), 0., position.x * sin(ang));
          vec3 base = vec3(wp.x, gh - .03, wp.y);
          vec3 w = base + local + vec3(0., t * hgt, 0.);
          vec2 lean = vec2(cos(ang * 1.3), sin(ang * 1.3)) * .18 * t * t * hgt;
          w.xz += lean;
          w += windDisp(base + vec3(r * 43., 0., r * 19.), t * hgt, 1.5, 0.) * 2.3 + windDisp(base * 2.3, t * hgt, .9, .22) * .45;
          w += interDisp(w, t * hgt, 1.9);
          float n = vnoise(wp * .08) * .6 + vnoise(wp * .5) * .4;
          ${FIRE ? 'vec3 c0 = mix(vec3(.07,.045,.02), vec3(.1,.06,.03), n), c1 = mix(vec3(.28,.17,.06), vec3(.36,.24,.09), n);' : FOREST ? 'vec3 c0 = mix(vec3(.025,.09,.02), vec3(.05,.13,.03), n), c1 = mix(vec3(.09,.24,.05), vec3(.16,.3,.07), n);' : 'vec3 c0 = mix(vec3(.05,.12,.025), vec3(.09,.18,.035), n), c1 = mix(vec3(.16,.3,.06), vec3(.27,.34,.08), n);'}
          vC = mix(c0, c1, t) * mix(1., .7, mk.g);
          vT = t; vL = .55 + .45 * max(dot(normalize(vec3(-lean.x, 1., -lean.y)), uSun), 0.);
          vec4 mvPosition = viewMatrix * vec4(w, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: '#include <common>\n#include <fog_pars_fragment>\n' + `varying vec3 vC; varying float vT; varying float vL;
        void main(){ vec3 c = vC * (vL * 1.25 + .25) + vec3(.06,.08,.02) * vT * vT; gl_FragColor = vec4(c, 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`
    });
    Object.assign(mat.uniforms, { uTime: U.uTime, uWind: U.uWind, uInter: U.uInter, uH: { value: heightTex }, uM: { value: maskTex }, uDom: uDomain, uSun: { value: new THREE.Vector3(-0.45, 0.72, 0.35).normalize() } });
    const grass = new THREE.Mesh(g, mat); grass.frustumCulled = false; scene.add(grass);
    ctx.grass = { mat };
  }

  /* ---------- v143 · flores 3D na GPU: haste + pétalas (não é imagem no chão), balançam com o vento e dobram quando alguém passa ---------- */
  {
    const GRF = [15, 20, 26][Q], FN = [2600, 6000, 10500][Q], pos = [], part = [], idx = [];
    const addV = (x, y, z, pt) => { pos.push(x, y, z); part.push(pt); return pos.length / 3 - 1; };
    for (let k = 0; k < 4; k++) { const y0 = k / 4, y1 = (k + 1) / 4, w0 = 0.014 * (1 - y0 * 0.4), w1 = 0.014 * (1 - y1 * 0.4); const a = addV(-w0, y0, 0, 0), b = addV(w0, y0, 0, 0), c = addV(-w1, y1, 0, 0), d = addV(w1, y1, 0, 0); idx.push(a, b, c, b, d, c); }
    const cH = addV(0, 1.0, 0, 2), PET = 7;
    for (let k = 0; k < PET; k++) {                                       // pétalas arredondadas (losango largo no meio), levemente em concha
      const am = k / PET * 6.2832, pt = (rad, da, y) => addV(Math.cos(am + da) * rad, y, Math.sin(am + da) * rad, 1);
      const Lm = pt(0.052, -0.42, 1.012), Tp = pt(0.082, 0, 1.03), Rm = pt(0.052, 0.42, 1.012);
      idx.push(cH, Lm, Tp, cH, Tp, Rm);
    }
    const fg = new THREE.InstancedBufferGeometry(); fg.setIndex(idx); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
    const off = new Float32Array(FN * 3), rf = CW.mulberry32(909); for (let i = 0; i < FN; i++) { off[i * 3] = rf() * GRF * 2; off[i * 3 + 1] = rf() * GRF * 2; off[i * 3 + 2] = rf(); }
    fg.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3)); fg.instanceCount = FN;
    const fmat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uFocus: { value: new THREE.Vector2() }, uR: { value: GRF } }]),
      vertexShader: '#include <common>\n#include <fog_pars_vertex>\n' + NOISE_GLSL + WIND_GLSL + `
        attribute vec3 aOff; attribute float aPart; uniform vec2 uFocus; uniform float uR; uniform sampler2D uH, uM; uniform vec4 uDom; uniform vec3 uSun;
        varying vec3 vC; varying float vL;
        void main(){
          vec2 wp = uFocus - uR + mod(aOff.xy - (uFocus - uR), 2. * uR);
          vec2 uv = (wp - uDom.xy) / uDom.zw; float gh = texture2D(uH, uv).r; vec4 mk = texture2D(uM, uv);
          float r = aOff.z, dist = length(wp - uFocus);
          float keep = step(r, mk.r * .55 + mk.b * .7 - .1) * (1. - smoothstep(uR * .6, uR, dist));
          float hgt = (.62 + .55 * fract(r * 5.7)) * keep;
          float ang = r * 81.7, t = position.y, tt = min(t, 1.);
          vec3 lp = vec3(position.x * cos(ang) - position.z * sin(ang), 0., position.x * sin(ang) + position.z * cos(ang));
          vec3 base = vec3(wp.x, gh - .03, wp.y);
          vec3 w = base + lp + vec3(0., t * hgt, 0.);
          vec2 lean = vec2(cos(ang * 1.7), sin(ang * 1.7)) * .12 * tt * tt * hgt; w.xz += lean;
          w += windDisp(base + vec3(r * 31., 0., r * 11.), tt * hgt, 1.6, 0.) * 2.0 + windDisp(base * 2.1, tt * hgt, .9, .2) * .4;
          w += interDisp(w, tt * hgt, 1.8);
          float pick = fract(r * 13.7); vec3 pc = pick < .2 ? vec3(.9,.62,.03) : pick < .38 ? vec3(.9,.25,.02) : pick < .6 ? vec3(.85,.82,.75) : pick < .78 ? vec3(.8,.2,.35) : pick < .92 ? vec3(.35,.15,.8) : vec3(.7,.04,.06);
          vec3 stem = mix(vec3(.05,.14,.03), vec3(.11,.24,.05), tt);
          vC = aPart < .5 ? stem : (aPart < 1.5 ? mix(pc * 1.15, pc * .75, smoothstep(.02, .085, length(position.xz))) : vec3(.55,.32,.03));
          vL = .6 + .4 * max(dot(normalize(vec3(-lean.x, 1., -lean.y)), uSun), 0.);
          vec4 mvPosition = viewMatrix * vec4(w, 1.); gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: '#include <common>\n#include <fog_pars_fragment>\n' + `varying vec3 vC; varying float vL;
        void main(){ gl_FragColor = vec4(vC * (vL * 1.3 + .25), 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`
    });
    Object.assign(fmat.uniforms, { uTime: U.uTime, uWind: U.uWind, uInter: U.uInter, uH: { value: heightTex }, uM: { value: maskTex }, uDom: uDomain, uSun: { value: new THREE.Vector3(-0.45, 0.72, 0.35).normalize() } });
    const fl = new THREE.Mesh(fg, fmat); fl.frustumCulled = false; scene.add(fl); ctx.flowersGPU = { mat: fmat };
  }

  /* ---------- v143 · toras caídas e tocos (casca + corte do tronco reais) com física ---------- */
  if (tex.bark && tex.cut) {
    const logs = [], stumps = [], rl = CW.mulberry32(31337), nL = [50, 110, 170][Q];
    for (let tries = 0; tries < 4000 && (logs.length + stumps.length) < nL * 1.6; tries++) {
      const x = (rl() * 2 - 1) * (CW.W.HX - 8) * S, z = (rl() * 2 - 1) * (CW.W.HZ - 8) * S, bx = x / S, bz = z / S;
      if (inPlatform(x, z, 6) || CW.freeness(bx, bz) < 0.8 || CW.forestDensity(bx, bz) < 0.45) continue;
      const y = heightAt(x, z); if (y < WATER_Y + 0.6 || CW.slopeAt(bx, bz) > 0.3) continue;
      if (rl() < 0.62) { const len = 2.6 + rl() * 3.2, r = 0.26 + rl() * 0.2, ry = rl() * 3.14; logs.push({ x, y, z, len, r, ry }); phys.add({ type: 'box', x, z, hx: len / 2, hz: r, rot: ry, y0: y - 0.3, y1: y + r * 1.8, vault: true, floor: true }); }
      else { const r = 0.4 + rl() * 0.3, h = 0.35 + rl() * 0.35; stumps.push({ x, y, z, r, h, ry: rl() * 6.28 }); phys.add({ type: 'circle', x, z, r: r * 1.05, y0: y - 0.3, y1: y + h, vault: true, floor: true }); }
    }
    const barkM = new THREE.MeshStandardMaterial({ ...tex.bark, roughness: 1, color: 0xd8c8b8 }), cutM = new THREE.MeshStandardMaterial({ ...tex.cut, roughness: 1, color: 0xf0e4d4 });
    const side = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true), cap = new THREE.CircleGeometry(1, 14);
    const su = side.attributes.uv; for (let i = 0; i < su.count; i++) su.setXY(i, su.getX(i) * 2, su.getY(i) * 2);
    const ma = new THREE.Matrix4(), qa = new THREE.Quaternion(), ea = new THREE.Euler(), pa = new THREE.Vector3(), sa = new THREE.Vector3();
    const nS = logs.length + stumps.length, nC = logs.length * 2 + stumps.length;
    if (nS) {
      const im = new THREE.InstancedMesh(side, barkM, nS), ic = new THREE.InstancedMesh(cap, cutM, nC); let a = 0, c = 0;
      for (const L1 of logs) {                                          // tora deitada: eixo ao longo de X
        ea.set(0, L1.ry, Math.PI / 2); qa.setFromEuler(ea); pa.set(L1.x, L1.y + L1.r * 0.85, L1.z); sa.set(L1.r, L1.len, L1.r); ma.compose(pa, qa, sa); im.setMatrixAt(a++, ma);
        for (const sg of [-1, 1]) { const d = new THREE.Vector3(Math.cos(L1.ry) * sg * L1.len / 2, 0, -Math.sin(L1.ry) * sg * L1.len / 2); ea.set(0, L1.ry + (sg > 0 ? Math.PI / 2 : -Math.PI / 2), 0); qa.setFromEuler(ea); pa.set(L1.x + d.x, L1.y + L1.r * 0.85, L1.z + d.z); sa.set(L1.r, L1.r, L1.r); ma.compose(pa, qa, sa); ic.setMatrixAt(c++, ma); }
      }
      for (const S1 of stumps) {                                        // toco em pé
        ea.set(0, S1.ry, 0); qa.setFromEuler(ea); pa.set(S1.x, S1.y + S1.h / 2 - 0.05, S1.z); sa.set(S1.r, S1.h, S1.r); ma.compose(pa, qa, sa); im.setMatrixAt(a++, ma);
        ea.set(-Math.PI / 2, S1.ry, 0); qa.setFromEuler(ea); pa.set(S1.x, S1.y + S1.h - 0.04, S1.z); sa.set(S1.r, S1.r, S1.r); ma.compose(pa, qa, sa); ic.setMatrixAt(c++, ma);
      }
      for (const m of [im, ic]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); }
    }
    ctx.logs = { logs: logs.length, stumps: stumps.length };
  }

  /* ---------- folhas caindo e voando com o vento (folhas 3D curvadas, não PNG) ---------- */
  const LN = ULTRA ? 30 : [80, 160, 260][Q];
  const leafGeo = (() => { const g = new THREE.BufferGeometry(); const v = [0, 0, 0, 0.05, 0.015, 0.06, 0, 0.0, 0.14, -0.05, 0.015, 0.06, 0, 0.012, 0.07]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setIndex([0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4]); g.computeVertexNormals(); g.scale(1.4, 1.4, 1.4); return g; })();
  const leafMesh = new THREE.InstancedMesh(leafGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), LN); leafMesh.frustumCulled = false; leafMesh.castShadow = false; scene.add(leafMesh);
  const leaves = Array.from({ length: LN }, (_, i) => ({ p: new THREE.Vector3(0, -999, 0), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(), life: -Math.random() * 6, ground: 0, rest: 0 }));
  const lc = FIRE ? [[0.3, 0.29, 0.28], [0.18, 0.17, 0.16], [0.42, 0.4, 0.37], [0.9, 0.35, 0.08], [0.24, 0.22, 0.2]] : [[0.16, 0.32, 0.05], [0.3, 0.36, 0.06], [0.55, 0.32, 0.05], [0.48, 0.16, 0.04], [0.12, 0.26, 0.05]];
  leaves.forEach((l, i) => leafMesh.setColorAt(i, new THREE.Color(...lc[i % lc.length])));
  let near = [], nearT = 0;
  const spawnLeaf = (l, x, y, z, burst) => {
    l.p.set(x, y, z); l.v.set((Math.random() - 0.5) * (burst ? 3 : 0.4), burst ? 1 + Math.random() * 2 : -0.2, (Math.random() - 0.5) * (burst ? 3 : 0.4));
    l.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); l.spin.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 8);
    l.life = 1; l.rest = 0; l.ground = heightAt(x, z);
  };
  const _lm = new THREE.Matrix4(), _lq = new THREE.Quaternion(), _ls = new THREE.Vector3(1, 1, 1);
  const veg = {
    trees, canopies, bushes,
    nearBush(x, z) { let b = 1e9; for (const o of bushes) { const d = (o.x - x) ** 2 + (o.z - z) ** 2; if (d < b) b = d; } return Math.sqrt(b); },
    burst(x, y, z, n = 8) { let k = 0; for (const l of leaves) { if (k >= n) break; if (l.life <= 0 || l.rest > 0) { spawnLeaf(l, x + (Math.random() - 0.5), y + Math.random(), z + (Math.random() - 0.5), true); k++; } } },
    update(dt, time, fx, fz, camera, wind) {
      ctx.grass.mat.uniforms.uFocus.value.set(fx, fz);
      if (ctx.flowersGPU) ctx.flowersGPU.mat.uniforms.uFocus.value.set(fx, fz);
      /* LOD por bloco */
      if (camera) for (const gq of lodGroups) { const d = Math.hypot(gq.c.x - camera.position.x, gq.c.z - camera.position.z); const want = d < gq.d ? gq.hi : gq.lo; if (gq.m.geometry !== want) gq.m.geometry = want; }
      nearT -= dt; if (nearT <= 0) { nearT = 1; near = canopies.filter(c => (c.x - fx) ** 2 + (c.z - fz) ** 2 < 38 * 38); }
      const gust = wind.strength;
      for (let i = 0; i < LN; i++) {
        const l = leaves[i];
        if (l.life <= 0) { l.life += dt; if (l.life > 0 && near.length) { const c = near[(Math.random() * near.length) | 0], a = Math.random() * 6.28, rr = Math.random() * c.r; spawnLeaf(l, c.x + Math.cos(a) * rr, c.y + (Math.random() - 0.3) * c.r, c.z + Math.sin(a) * rr, false); } else if (l.life > 0) l.life = -1; if (l.life <= 0) { l.p.y = -999; } }
        else if (l.rest > 0) { l.rest -= dt; if (l.rest <= 0) l.life = -(1 + Math.random() * 5); }
        else {
          /* queda com balanço (folha "planando"), arrasto e vento */
          const sway = Math.sin(time * 2.6 + i) * 0.9;
          l.v.x += (wind.x * gust * 2.6 - l.v.x) * dt * 1.5 + Math.cos(time * 1.7 + i) * sway * dt * 2;
          l.v.z += (wind.z * gust * 2.6 - l.v.z) * dt * 1.5 + Math.sin(time * 1.9 + i * 1.3) * sway * dt * 2;
          l.v.y += (-0.9 - l.v.y) * dt * 2.2 + (gust > 0.85 ? 1.6 * dt : 0);
          l.p.addScaledVector(l.v, dt); l.rot.x += l.spin.x * dt; l.rot.y += l.spin.y * dt; l.rot.z += l.spin.z * dt;
          l.ground = heightAt(l.p.x, l.p.z);
          if (l.p.y < Math.max(l.ground, l.ground < WATER_Y ? WATER_Y : -99) + 0.02) { l.p.y = Math.max(l.ground, WATER_Y) + 0.02; l.rot.x = -Math.PI / 2 * 0; l.rest = 3 + Math.random() * 3; }
          if ((l.p.x - fx) ** 2 + (l.p.z - fz) ** 2 > 60 * 60) l.life = -1;
        }
        _lq.setFromEuler(l.rot); _ls.setScalar(l.rest > 0 ? Math.min(1, l.rest) : 1); _lm.compose(l.p, _lq, _ls); leafMesh.setMatrixAt(i, _lm);
      }
      leafMesh.instanceMatrix.needsUpdate = true;
    }
  };
  return veg;
}
