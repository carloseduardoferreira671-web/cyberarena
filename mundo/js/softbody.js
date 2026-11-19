/* Carne elástica na GPU: o corpo do Atlas deforma por vértice, sem custo na CPU.
   - Balanço: uma mola por personagem (uJig) arrasta a carne para trás da aceleração; músculo (aSoft.x) balança, cabelo/tecido (aSoft.y) balança mais.
   - Buraco Negro: cada vértice é puxado por  d·M/(|d|²+ε²)^1.5  → quem está mais perto estica mais, o boneco alonga em direção ao buraco.
   - Supernova: a frente da onda (esfera em expansão) empurra os vértices para fora conforme passa por eles.
   Os poderes só registram posição/raio a cada quadro em SOFT; todos os materiais do jogo leem os mesmos uniforms. */
import * as THREE from '../lib/three.module.min.js';
const V4 = () => new THREE.Vector4(0, 0, 0, 0);
export const SOFT = {
  U: { uHoles: { value: [V4(), V4(), V4()] }, uNova: { value: [V4(), V4()] }, uNovaP: { value: [V4(), V4()] } },
  h: 0, n: 0,
  begin() { this.h = 0; this.n = 0; },
  hole(pos, mass) { if (this.h < 3 && mass > .01) this.U.uHoles.value[this.h++].set(pos.x, pos.y, pos.z, mass); },
  nova(pos, R, J, width = 2) { if (this.n < 2 && R > .01) { this.U.uNova.value[this.n].set(pos.x, pos.y, pos.z, R); this.U.uNovaP.value[this.n].set(0, J, width, 0); this.n++; } },
  end() { for (let i = this.h; i < 3; i++) this.U.uHoles.value[i].w = 0; for (let i = this.n; i < 2; i++) this.U.uNova.value[i].w = 0; },
};
const GLSL = /* glsl */`
  vec3 sw = (modelMatrix * vec4(transformed, 1.0)).xyz;
  float fl = aSoft.x, fx = aSoft.y, sus = 0.35 + fl + fx * 1.4;
  sw += uJig * (fl + fx * 1.6) * uSoftK;
  float lo = aLoose;
  sw += (uJig * 2.4 + uWind) * lo * uSoftK * (1.0 + aHair * 1.6);
  sw.y -= aHair * 0.22;
  sw += vec3(sin(uT * 6.3 + sw.y * 4.0 + sw.x * 2.0), 0.15 * sin(uT * 5.1 + sw.x * 3.0), cos(uT * 5.7 + sw.y * 3.7 + sw.z * 2.0)) * 0.035 * lo * (0.5 + uFlut);
  for (int i = 0; i < 3; i++) {
    if (uHoles[i].w > 0.0) {
      vec3 d = uHoles[i].xyz - sw; float r2 = dot(d, d), r = sqrt(r2);
      float pull = uHoles[i].w * 1.8 / pow(r2 + 1.0, 1.5) * (1.0 - smoothstep(10.0, 18.0, r));
      vec3 mv = d * pull * sus; float ml = length(mv), cap = min(r * 0.92, 1.7 * (0.5 + sus));
      if (ml > cap) mv *= cap / ml;
      sw += mv;
    }
  }
  for (int i = 0; i < 2; i++) {
    if (uNova[i].w > 0.0) {
      vec3 d = sw - uNova[i].xyz; float dist = length(d) + 1e-4;
      float x = (dist - uNova[i].w) / uNovaP[i].z;
      float amp = uNovaP[i].y / (1.0 + dist * 0.05) * exp(-x * x);
      sw += (d / dist + vec3(0.0, 0.35, 0.0)) * amp * (0.3 + fl * 0.9 + fx * 1.5);
    }
  }
  transformed = (inverse(modelMatrix) * vec4(sw, 1.0)).xyz;
`;
/* injeta o código acima num material Standard/Physical já existente; perChar = uniforms próprios (uJig, uSoftK, uGlow) */
export function addSoftShader(material, perChar) {
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uWind: { value: new THREE.Vector3() }, uT: { value: 0 }, uFlut: { value: 0 } }, SOFT.U, perChar);
    sh.vertexShader = 'attribute vec2 aSoft;attribute float aLoose;attribute float aHair;uniform vec3 uWind;uniform float uT,uFlut;uniform vec4 uHoles[3];uniform vec4 uNova[2];uniform vec4 uNovaP[2];uniform vec3 uJig;uniform float uSoftK;\n' +
      sh.vertexShader.replace('#include <skinning_vertex>', '#include <skinning_vertex>\n' + GLSL);
    // brilho violeta: onde a textura é roxa saturada (núcleo do peito, veias, manoplas, olhos) vira emissivo
    sh.fragmentShader = 'uniform float uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n float pm = smoothstep(0.10, 0.34, diffuseColor.b - max(diffuseColor.r, diffuseColor.g) * 0.85) * smoothstep(0.12, 0.4, diffuseColor.b);\n totalEmissiveRadiance += diffuseColor.rgb * pm * uGlow;');
  };
  material.customProgramCacheKey = () => 'atlas-soft-v3';
  material.needsUpdate = true;
}
