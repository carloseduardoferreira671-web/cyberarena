/* CyberArena 3D · shaders compartilhados (vento, interação com personagens, ruído). */
export const NOISE_GLSL = `
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm2(vec2 p){ float a=.5,r=0.; for(int i=0;i<4;i++){ r+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return r; }
`;
export const WIND_GLSL = `
uniform float uTime; uniform vec3 uWind; uniform vec4 uInter[8];
vec3 windDisp(vec3 wp, float hgt, float stiff, float flutter){
  float ph = uTime*1.6 + wp.x*0.07 + wp.z*0.05;
  float gust = 0.55 + 0.45*sin(uTime*0.31 + wp.x*0.013 + wp.z*0.007);
  float s = (sin(ph)*0.5 + sin(ph*2.13+1.3)*0.22 + 0.45) * uWind.z * gust;
  vec3 d = vec3(uWind.x, 0., uWind.y) * s * hgt * hgt * stiff;
  d += vec3(sin(uTime*7.1+wp.y*3.+wp.x*2.), sin(uTime*6.3+wp.z*3.1)*.5, cos(uTime*7.7+wp.x*2.5+wp.z)) * flutter * (0.4 + uWind.z);
  return d;
}
vec3 interDisp(vec3 wp, float hgt, float amount){
  vec3 d = vec3(0.);
  for(int i=0;i<8;i++){ vec4 I=uInter[i]; if(I.w<=0.) continue; vec2 dv = wp.xz - I.xz; float dist=length(dv);
    float k = (1.-smoothstep(0., I.w, dist)) * (1.-smoothstep(1.5, 3.5, abs(wp.y - I.y - .6)));
    d.xz += normalize(dv+vec2(1e-4)) * k * amount * hgt; d.y -= k*amount*hgt*0.45; }
  return d;
}
`;
/* aplica deslocamento em espaço de mundo num MeshStandardMaterial (instanciado ou não).
   body: GLSL que modifica 'wpos' (vec4) usando 'base' (origem da instância em mundo) e 'hgt' (altura acima da base). */
export function patchWorldVertex(mat, U, body, extra = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind; sh.uniforms.uInter = U.uInter;
    Object.assign(sh.uniforms, extra.uniforms || {});
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + NOISE_GLSL + WIND_GLSL + (extra.vertexHead || ''))
      .replace('#include <project_vertex>', `
        vec4 wpos = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wpos = instanceMatrix * wpos; vec3 base = (modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz;
        #else
          vec3 base = (modelMatrix * vec4(0.,0.,0.,1.)).xyz;
        #endif
        wpos = modelMatrix * wpos; float hgt = max(0., wpos.y - base.y);
        ${body}
        vec4 mvPosition = viewMatrix * wpos; gl_Position = projectionMatrix * mvPosition;`);
    if (extra.fragment) extra.fragment(sh);
  };
  mat.customProgramCacheKey = () => body + (extra.key || '');
  return mat;
}
