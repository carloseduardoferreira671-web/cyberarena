/*
 * CyberArena · camada PBR (substitui o cel-shading).
 * Injeta nos materiais Standard/Physical do three.js:
 *   - micro-detalhe (normal por bump procedural + variação de rugosidade) que só aparece de perto  → "Detail Maps"
 *   - espalhamento subsuperficial (SSS) aproximado: luz embrulhada, transmitância e borda fina    → pele
 *   - oclusão de cavidade (vincos) e céu/solo no ambiente indireto                                 → AO de material
 *   - suor / sujeira / sangue dinâmicos (máscaras procedurais com escorrimento vertical)           → "Gore & Sweat Shaders"
 * Nada aqui usa faixas de luz nem contorno: o resultado é o BRDF físico do three.js + estas camadas.
 */
import * as THREE from '../lib/three.module.min.js';

export const PBR_U = {
  uPbrSun: { value: new THREE.Vector3(.4, .8, .3).normalize() },   // direção PARA o sol (mundo)
  uPbrSunC: { value: new THREE.Color(1, .94, .84) },
  uPbrT: { value: 0 },
};
export const PBR_CFG = { gore: true, aniso: 1 };   // aniso: filtragem anisotrópica das texturas (mipmaps + nitidez em ângulo rasante)

const _a = new THREE.Vector3(), _b = new THREE.Vector3();
/** chamado uma vez por quadro com a luz do sol da cena */
export function syncPBR(sun, t) {
  if (sun) {
    _a.setFromMatrixPosition(sun.matrixWorld); _b.setFromMatrixPosition(sun.target.matrixWorld);
    _a.sub(_b); if (_a.lengthSq() > 1e-6) PBR_U.uPbrSun.value.copy(_a).normalize();
    PBR_U.uPbrSunC.value.copy(sun.color).multiplyScalar(Math.min(1.6, Math.max(.05, sun.intensity / 2.9)));
  }
  PBR_U.uPbrT.value = t;
}

const GLSL_COMMON = /* glsl */`
uniform vec3 uPbrSun; uniform vec3 uPbrSunC; uniform float uPbrT;
uniform float uCaWet; uniform float uCaBlood; uniform float uCaDirt; uniform float uCaGore;
uniform vec3 uCaSss; uniform float uCaDS; uniform float uCaDK; uniform float uCaAOk;
varying vec3 vCaObj; varying vec3 vCaW;
float caH(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float caN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(caH(i), caH(i + vec3(1,0,0)), f.x), mix(caH(i + vec3(0,1,0)), caH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(caH(i + vec3(0,0,1)), caH(i + vec3(1,0,1)), f.x), mix(caH(i + vec3(0,1,1)), caH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float caF(vec3 p){ return caN(p) * .5 + caN(p * 2.03) * .25 + caN(p * 4.1) * .125 + caN(p * 8.3) * .0625; }
float caWetM = 0.; float caBloodM = 0.; float caDirtM = 0.;
`;

/**
 * @param {THREE.Material} material  MeshStandardMaterial / MeshPhysicalMaterial
 * @param {object} o  { key, sss:[r,g,b]|null, detail:{scale,k}|null, body:boolean, ao:number }
 */
const PBR_OFF = typeof location !== 'undefined' && /[?&]pbr=0/.test(location.search);   // ?pbr=0 desliga a camada (diagnóstico)
export function applyPBR(material, o = {}) {
  if (PBR_OFF) return material;
  if (!material || (!material.isMeshStandardMaterial && !material.isMeshPhysicalMaterial)) return material;
  material.userData = material.userData || {};
  if (material.userData.caPBR) return material;
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) { const t = material[k]; if (t && t.isTexture && t.anisotropy < PBR_CFG.aniso) { t.anisotropy = PBR_CFG.aniso; t.needsUpdate = true; } }
  const opt = {
    key: o.key || 'scene',
    sss: o.sss || null,
    detail: o.detail === undefined ? { scale: 18, k: .012 } : o.detail,
    body: !!o.body,
    ao: o.ao === undefined ? 1 : o.ao,
  };
  // estado dinâmico (por material): o Hero escreve aqui; materiais de cenário ficam sempre em 0
  const U = material.userData.caU = {
    uCaWet: { value: 0 }, uCaBlood: { value: 0 }, uCaDirt: { value: 0 }, uCaGore: { value: PBR_CFG.gore ? 1 : 0 },
    uCaSss: { value: new THREE.Color(...(opt.sss || [0, 0, 0])) },
    uCaDS: { value: opt.detail ? opt.detail.scale : 1 }, uCaDK: { value: opt.detail ? opt.detail.k : 0 }, uCaAOk: { value: opt.ao },
  };
  const prevCompile = material.onBeforeCompile, prevKey = material.customProgramCacheKey ? material.customProgramCacheKey.bind(material) : null;
  material.onBeforeCompile = function (sh, renderer) {
    if (prevCompile) prevCompile.call(this, sh, renderer);
    Object.assign(sh.uniforms, PBR_U, U);
    let vs = sh.vertexShader, fs = sh.fragmentShader;
    if (fs.includes('CA_PBR_LAYER')) return;
    vs = vs.replace('#include <common>', '#include <common>\nvarying vec3 vCaObj; varying vec3 vCaW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCaObj = position * length(modelMatrix[0].xyz);')
      .replace('#include <project_vertex>', `#include <project_vertex>
{ vec4 caWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  caWp = instanceMatrix * caWp;
#endif
  vCaW = (modelMatrix * caWp).xyz; }`);
    fs = fs.replace('#include <common>', '#include <common>\n/* CA_PBR_LAYER */\n' + GLSL_COMMON);
    // 1) máscaras de suor / sujeira / sangue (antes da iluminação, alteram albedo)
    if (opt.body) {
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 o = vCaObj;
  float m1 = caF(o * vec3(5., 2.2, 5.) + vec3(1.3, 0., 2.7));
  float m2 = caF(o * vec3(6.5, 1.5, 6.5) + vec3(7.7, 3.3, 1.1));
  float m3 = caF(o * 7. + vec3(9.1, 4.2, 5.5));
  caWetM = uCaWet * smoothstep(.30, .65, m1 + uCaWet * .55);
  caBloodM = smoothstep(1. - uCaBlood * .78, 1. - uCaBlood * .78 + .10, m2) * uCaGore;
  caDirtM = uCaDirt * smoothstep(.38, .72, m3);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.40, .35, .32), caDirtM * .85);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * .80, caWetM * .6);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.15, .004, .006), caBloodM * .92);
}`);
    }
    // 2) rugosidade / metalicidade: micro-variação + molhado + sujo
    fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
${opt.detail ? `{ float caR = caF(vCaObj * uCaDS * .55 + 3.7); roughnessFactor = clamp(roughnessFactor * (.82 + .36 * caR), .04, 1.); }` : ''}
${opt.body ? `roughnessFactor = mix(roughnessFactor, .13, clamp(caWetM + caBloodM, 0., 1.));
roughnessFactor = mix(roughnessFactor, .95, caDirtM * .8);` : ''}`);
    if (opt.body) fs = fs.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1. - clamp(caBloodM + caDirtM * .7, 0., 1.);');
    // 3) bump procedural (sem tangentes): poros, grão, arranhões — esmaece com a distância
    if (opt.detail) {
      fs = fs.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 o = vCaObj * uCaDS;
  float h = caF(o) * .6 + caF(o * 3.7 + 11.) * .4;
  float k = uCaDK * (1. - smoothstep(3., 14., length(vViewPosition)));
  vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 g = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  normal = normalize(abs(det) * normal - k * g);
}`);
    }
    // 4) SSS aproximado (pele)
    if (opt.sss) {
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 caV = normalize(vViewPosition);
  vec3 caL = normalize((viewMatrix * vec4(uPbrSun, 0.)).xyz);
  float caNL = dot(normal, caL);
  float caWrap = clamp((caNL + .55) / 1.55, 0., 1.);
  float caBack = pow(clamp(dot(caV, -normalize(caL + normal * .4)), 0., 1.), 3.);
  float caThin = pow(1. - clamp(dot(normal, caV), 0., 1.), 2.5);
  float caLit = .35 + .65 * clamp(dot(reflectedLight.directDiffuse, vec3(.333)) * 2., 0., 1.);
  vec3 caSss = uCaSss * (caWrap * caWrap * .20 + caBack * .65 + caThin * .14) * caLit * (1. - caBloodM);
  reflectedLight.directDiffuse += caSss * uPbrSunC * diffuseColor.rgb;
  reflectedLight.indirectDiffuse += uCaSss * caThin * .08 * diffuseColor.rgb;
}`);
    }
    // 5) AO de material: vincos + ambiente (céu mais forte que o solo)
    if (opt.ao > 0) {
      fs = fs.replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float caCav = 1. - smoothstep(.06, .5, length(fwidth(normal))) * .5 * uCaAOk;
  vec3 caWN = normalize((vec4(normal, 0.) * viewMatrix).xyz);
  float caSky = 1. - uCaAOk * .28 * (1. - (caWN.y * .5 + .5));
  float caAO = caCav * caSky;
  reflectedLight.indirectDiffuse *= caAO;
  reflectedLight.indirectSpecular *= mix(1., caAO, .8);
}`);
    }
    sh.vertexShader = vs; sh.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => (prevKey ? prevKey() : '') + `|pbr1-${opt.key}-${opt.sss ? 's' : 'n'}${opt.detail ? 'd' : 'n'}${opt.body ? 'b' : 'n'}${opt.ao > 0 ? 'a' : 'n'}`;
  material.userData.caPBR = true;
  material.needsUpdate = true;
  return material;
}

/** presets por chave (compatível com as antigas chamadas de applyCinematicToon) */
export function applyPBRByKey(material, options = {}) {
  const key = options.key || 'scene';
  if (/emission|veins|core/.test(key)) return applyPBR(material, { key, detail: null, ao: .5 });
  if (key === 'world') return applyPBR(material, { key, detail: { scale: 8, k: .05 }, ao: .8 });
  if (/^atlas-dread|^atlas-hair/.test(key)) return applyPBR(material, { key, detail: { scale: 70, k: .03 }, body: true, ao: 1 });
  if (/^(hero|cyber|atlas|soft)/.test(key)) return applyPBR(material, { key, detail: { scale: 40, k: .012 }, body: true, ao: 1 });
  return applyPBR(material, { key });
}

/** escreve suor / sangue / sujeira (0..1) em todos os materiais PBR de um objeto */
export function setBodyState(root, wet, blood, dirt) {
  root.traverse(obj => {
    if (!obj.material) return;
    for (const m of [].concat(obj.material)) {
      const u = m && m.userData && m.userData.caU; if (!u) continue;
      u.uCaWet.value = wet; u.uCaBlood.value = blood; u.uCaDirt.value = dirt; u.uCaGore.value = PBR_CFG.gore ? 1 : 0;
    }
  });
}
