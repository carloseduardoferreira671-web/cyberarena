/* CyberArena · Mundo Cristal — o outro mundo, alcançado pelo cristal central da casona (só no Mundo Aberto).
   Ilhas flutuantes sobre o vazio, ligadas por pontes de luz, florestas de cristal, rochas que flutuam,
   céu noturno com aurora, estrelas e nebulosa, partículas de luz e um portal de volta.
   Fica longe do vale (x = +4000) e tem a mesma interface de colisão que o World. */
import * as THREE from '../lib/three.module.min.js';
import { crystalMaterial, crystalMesh, clusterSpec, halo, PALETTE, crystalGeometry } from './crystals.js';
import { U } from './world.js';

const PI = Math.PI, TAU = PI * 2, clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
export const REALM_X = 4000, REALM_Z = 0;
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const n2 = (x, z) => Math.sin(x * .21 + Math.sin(z * .17) * 1.3) * Math.cos(z * .19 - x * .07) + .5 * Math.sin(x * .53 - z * .41);

export class Realm {
  constructor(scene, q) {
    this.scene = scene; this.q = q; this.group = new THREE.Group(); this.group.visible = false; this.built = false; this.cols = [];
    const I = [[0, 0, 34, 0], [62, 12, 16, 3.5], [-48, 40, 14, -1.5], [8, -64, 18, 5], [-54, -34, 12, 9]];
    this.islands = I.map(([x, z, r, h]) => ({ x: REALM_X + x, z: REALM_Z + z, r, h }));
    this.bridges = this.islands.slice(1).map(b => { const a = this.islands[0], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
      return { ax: a.x + ux * (a.r - 2), az: a.z + uz * (a.r - 2), ay: this.islandH(0, a.x + ux * (a.r - 2), a.z + uz * (a.r - 2)), bx: b.x - ux * (b.r - 2), bz: b.z - uz * (b.r - 2), by: 0, ux, uz, w: 1.7 }; });
    this.bridges.forEach((br, i) => { br.by = this.islandH(i + 1, br.bx, br.bz); br.len = Math.hypot(br.bx - br.ax, br.bz - br.az); });
    this.spawn = [REALM_X, REALM_Z + 9]; this.portal = { x: REALM_X, z: REALM_Z - 8, y: this.islandH(0, REALM_X, REALM_Z - 8), r: 2.6 };
  }
  islandH(i, x, z) { const s = this.islands[i], d = Math.hypot(x - s.x, z - s.z) / s.r; return s.h + n2(x, z) * .9 * (1 - d * d) + (1 - d * d) * 1.2 - (d > .92 ? (d - .92) * 6 : 0); }
  /* ---------- interface de terreno/colisão ---------- */
  terrainAt(x, z) {
    let h = -1000;
    for (let i = 0; i < this.islands.length; i++) { const s = this.islands[i]; if (Math.hypot(x - s.x, z - s.z) < s.r) h = Math.max(h, this.islandH(i, x, z)); }
    for (const b of this.bridges) { const px = x - b.ax, pz = z - b.az, t = px * b.ux + pz * b.uz; if (t < 0 || t > b.len) continue; if (Math.abs(px * -b.uz + pz * b.ux) < b.w) h = Math.max(h, lerp(b.ay, b.by, t / b.len) + .35 + Math.sin(t / b.len * PI) * 1.2); }
    return h;
  }
  groundAt(x, z) { return this.terrainAt(x, z); }
  waterDepth() { return -10; }
  blockers(x, z, y, rad) { const out = []; for (const o of this.cols) { const d = Math.hypot(x - o.x, z - o.z) - o.r; if (d < rad && y < o.y1) out.push([o, d]); } return out; }
  collide(p, rad) { let hit = null; for (const o of this.cols) { if (p.y > o.y1) continue; const dx = p.x - o.x, dz = p.z - o.z, d = Math.hypot(dx, dz) || 1e-6; if (d < o.r + rad) { const k = (o.r + rad - d) / d; p.x += dx * k; p.z += dz * k; hit = { o, top: o.y1, nx: dx / d, nz: dz / d }; } } return hit; }
  rayBlocked() { return null; }
  isFree(x, z) { return this.terrainAt(x, z) > -50 && !this.cols.some(o => Math.hypot(x - o.x, z - o.z) < o.r + 1); }
  contains(x) { return x > REALM_X - 600; }

  /* ---------- construção (só na primeira viagem) ---------- */
  build() {
    if (this.built) return; this.built = true; const G = this.group, r = rng(777);
    this.scene.add(G);
    // céu: aurora, estrelas, nebulosa e um planeta
    const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uTime: U.uTime },
      vertexShader: 'varying vec3 vD;void main(){vD=normalize(position);vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
      fragmentShader: `uniform float uTime;varying vec3 vD;
float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
void main(){vec3 d=normalize(vD);float y=d.y;
 vec3 c=mix(vec3(.05,.03,.12),vec3(.01,.01,.04),clamp(y*1.4,0.,1.));c=mix(c,vec3(.16,.06,.22),smoothstep(.1,-.5,y));
 float neb=fb(d*3.+vec3(uTime*.004,0.,0.));c+=vec3(.35,.12,.55)*pow(neb,3.)*1.6+vec3(.05,.25,.45)*pow(fb(d*5.-3.),4.)*1.5;
 vec3 sd=floor(d*260.);float st=step(.9975,h(sd));c+=vec3(.9,.95,1.)*st*(.5+.5*sin(uTime*3.+h(sd+3.)*40.));
 float ab=sin(d.x*4.+uTime*.25+sin(d.z*3.+uTime*.15)*1.5);float band=exp(-pow((y-.42-ab*.08)*9.,2.))*(.5+.5*fb(vec3(d.x*6.,uTime*.12,d.z*6.)));
 c+=mix(vec3(.1,1.,.7),vec3(.7,.3,1.),.5+.5*sin(d.x*3.+uTime*.2))*band*.9;
 float mw=exp(-pow(dot(d,normalize(vec3(.3,.85,.42)))*3.2,2.));c+=vec3(.5,.45,.7)*mw*pow(fb(d*14.),2.)*.9;vec3 sd2=floor(d*600.);c+=vec3(1.)*step(.996,h(sd2))*mw*.8;
 vec3 sun=normalize(vec3(-.62,.28,-.73));c+=vec3(1.,.8,.5)*pow(max(dot(d,sun),0.),60.)*.5;
 gl_FragColor=vec4(c,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` }));
    sky.renderOrder = -1; sky.frustumCulled = false; G.add(sky); this.sky = sky;
    this.buildPlanets(G);
    // ilhas: topo com grama cristalina e veios brilhantes, base rochosa pendurada
    const topMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: .05 });
    topMat.onBeforeCompile = sh => { sh.uniforms.uTime = U.uTime; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWp=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;varying vec3 vWp;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n{float v=abs(sin(vWp.x*.35+sin(vWp.z*.29)*2.)*sin(vWp.z*.31-sin(vWp.x*.23)*1.7));float l=smoothstep(.06,0.,v);totalEmissiveRadiance+=vec3(.35,.7,1.)*l*(.6+.4*sin(uTime*1.5+vWp.x*.2));}'); };
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2236, roughness: .95, flatShading: false });
    this.islands.forEach((s, i) => {
      const R = 26, A = 72, pos = [], col = [], idx = [], c = new THREE.Color();
      for (let j = 0; j <= R; j++) for (let k = 0; k < A; k++) { const rr = j / R * s.r, a = k / A * TAU, x = s.x + Math.cos(a) * rr, z = s.z + Math.sin(a) * rr; pos.push(x - s.x, this.islandH(i, x, z), z - s.z);
        const v = .5 + .5 * n2(x * 2.1, z * 2.1); c.setRGB(lerp(.16, .32, v), lerp(.26, .46, v), lerp(.4, .55, v)); if (j > R - 2) c.setRGB(.3, .26, .36); col.push(c.r, c.g, c.b); }
      for (let j = 0; j < R; j++) for (let k = 0; k < A; k++) { const a = j * A + k, b = j * A + (k + 1) % A, cc = a + A, d = b + A; idx.push(a, cc, b, b, cc, d); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
      const top = new THREE.Mesh(g, topMat); top.position.set(s.x, 0, s.z); top.receiveShadow = true; G.add(top);
      const ug = new THREE.ConeGeometry(s.r * 1.02, s.r * 1.4, 40, 10, true); const up = ug.attributes.position;
      for (let v = 0; v < up.count; v++) { const x = up.getX(v), y = up.getY(v), z = up.getZ(v), k = 1 + .22 * Math.sin(x * .7 + y * .5) * Math.cos(z * .6 - y * .3) * (1 - (y + s.r * .7) / (s.r * 1.4)); up.setXYZ(v, x * k, y, z * k); }
      ug.rotateX(PI); ug.computeVertexNormals(); const under = new THREE.Mesh(ug, rockMat); under.position.set(s.x, s.h - s.r * .7 - .2, s.z); under.castShadow = true; G.add(under);
    });
    // pontes de luz
    const bm = new THREE.MeshStandardMaterial({ color: 0x1b2440, emissive: 0x2a6cff, emissiveIntensity: .6, metalness: .6, roughness: .3 }), railM = new THREE.MeshBasicMaterial({ color: 0x7ce8ff });
    for (const b of this.bridges) for (let t = 0; t < b.len; t += 1.4) { const k = t / b.len, x = b.ax + b.ux * t, z = b.az + b.uz * t, y = lerp(b.ay, b.by, k) + .35 + Math.sin(k * PI) * 1.2;
      const p = new THREE.Mesh(new THREE.BoxGeometry(b.w * 2, .25, 1.25), bm); p.position.set(x, y - .12, z); p.rotation.y = Math.atan2(b.ux, b.uz); p.castShadow = p.receiveShadow = true; G.add(p);
      for (const sd of [-1, 1]) { const q = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, 1.3), railM); q.position.set(x - b.uz * sd * b.w, y + .9, z + b.ux * sd * b.w); q.rotation.y = p.rotation.y; G.add(q); } }
    // floresta de cristais e árvores de cristal
    const cm = crystalMaterial(U.uTime, { glow: 1.1 }), specs = [], trunkM = new THREE.MeshStandardMaterial({ color: 0x1a1426, roughness: .9 });
    this.islands.forEach((s, i) => { const n = Math.round(s.r * .55); for (let k = 0; k < n; k++) { const a = r() * TAU, d = (.35 + r() * .55) * s.r, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; if (i === 0 && Math.hypot(x - this.portal.x, z - this.portal.z) < 7) continue; if (i === 0 && Math.abs(x - REALM_X) < 4 && z > REALM_Z) continue;
      const y = this.islandH(i, x, z), sz = .6 + r() * .9; specs.push(...clusterSpec(r, x, y, z, 4 + ((r() * 5) | 0), sz, r() < .5 ? PALETTE.ice : PALETTE.mix)); this.cols.push({ x, z, r: sz * 1.1, y1: y + sz * 3 });
      if (r() < .35) { const h2 = halo(r() < .5 ? 0x6fe8ff : 0xb07bff, 5 * sz, .3); h2.position.set(x, y + sz * 1.5, z); G.add(h2); } }
      for (let k = 0; k < Math.round(s.r * .25); k++) { const a = r() * TAU, d = (.3 + r() * .55) * s.r, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d; if (i === 0 && Math.hypot(x - this.portal.x, z - this.portal.z) < 8) continue; const y = this.islandH(i, x, z), h = 4 + r() * 3;
        const tr = new THREE.Mesh(new THREE.CylinderGeometry(.12, .3, h, 8), trunkM); tr.position.set(x, y + h / 2, z); tr.rotation.z = (r() - .5) * .2; tr.castShadow = true; G.add(tr);
        for (let b = 0; b < 7; b++) { const a2 = b / 7 * TAU + r(), up = .5 + r() * .4; specs.push([x + Math.cos(a2) * .3, y + h - .3 - r() * 1.2, z + Math.sin(a2) * .3, .35 + r() * .25, 1.2 + r(), Math.sin(a2) * up * 1.4, -Math.cos(a2) * up * 1.4, r() * TAU, PALETTE.mix[(r() * 5) | 0]]); }
        this.cols.push({ x, z, r: .45, y1: y + h }); } });
    G.add(crystalMesh(specs, cm));
    // rochas que flutuam no vazio
    this.rocks = []; for (let k = 0; k < 34; k++) { const a = r() * TAU, d = 50 + r() * 140, s = 1 + r() * 5, m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockMat); m.position.set(REALM_X + Math.cos(a) * d, -10 + r() * 50, REALM_Z + Math.sin(a) * d); m.scale.y = .6; m.rotation.set(r() * 3, r() * 3, 0); G.add(m); this.rocks.push([m, m.position.y, r() * 6, .2 + r() * .3]); }
    // portal de volta: arco de pedra com disco de energia em espiral
    const P = this.portal, arch = new THREE.Mesh(new THREE.TorusGeometry(2.4, .32, 16, 64), new THREE.MeshStandardMaterial({ color: 0x3a3050, roughness: .6, metalness: .4, emissive: 0x2a1060, emissiveIntensity: .6 }));
    arch.position.set(P.x, P.y + 2.7, P.z); arch.castShadow = true; G.add(arch);
    const disk = new THREE.Mesh(new THREE.CircleGeometry(2.2, 64), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uTime;varying vec2 vUv;void main(){vec2 p=vUv*2.-1.;float r=length(p),a=atan(p.y,p.x);float s=sin(a*5.+r*14.-uTime*4.)*.5+.5;float e=smoothstep(1.,.2,r);vec3 c=mix(vec3(.25,.9,1.),vec3(.8,.4,1.),s)*(e*(.5+.8*s))+vec3(1.)*exp(-r*r*10.)*.6;gl_FragColor=vec4(c,1.);}' }));
    disk.position.copy(arch.position); G.add(disk); this.disk = disk; this.arch = arch;
    const ph = halo(0x8ad8ff, 9, .5); ph.position.copy(arch.position); G.add(ph);
    this.cols.push({ x: P.x - 2.4, z: P.z, r: .4, y1: P.y + 6 }, { x: P.x + 2.4, z: P.z, r: .4, y1: P.y + 6 });
    // partículas de luz flutuando
    const N = 700, pp = new Float32Array(N * 3), ph2 = new Float32Array(N); for (let i = 0; i < N; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 90; pp.set([REALM_X + Math.cos(a) * d, -4 + r() * 22, REALM_Z + Math.sin(a) * d], i * 3); ph2[i] = r() * 100; }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aPh', new THREE.BufferAttribute(ph2, 1));
    const motes = new THREE.Points(pg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: U.uTime },
      vertexShader: 'uniform float uTime;attribute float aPh;varying float vA;varying float vC;void main(){vec3 p=position+vec3(sin(uTime*.2+aPh)*1.5,sin(uTime*.31+aPh*1.7)*1.2,cos(uTime*.17+aPh)*1.5);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(90./-mv.z,1.,9.);vA=.4+.6*pow(.5+.5*sin(uTime*1.3+aPh),3.);vC=fract(aPh*.13);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vA;varying float vC;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(mix(vec3(.4,.95,1.),vec3(.85,.5,1.),vC)*smoothstep(.5,0.,d)*vA,1.);}' }));
    motes.frustumCulled = false; G.add(motes);
    if (this.q.lights) { const l1 = new THREE.PointLight(0x7ce8ff, 30, 26, 1.6); l1.position.set(P.x, P.y + 3, P.z); G.add(l1); }
  }
  /* ---------- céu do espaço: Sol, Terra com Lua, Júpiter, Saturno com anéis, Marte e estrelas brilhantes ---------- */
  buildPlanets(G) {
    const P = this.planets = new THREE.Group(); P.renderOrder = -1; G.add(P); this.spin = [];
    const SUN = new THREE.Vector3(-.62, .28, -.73).normalize();
    const NOISE = `float ph(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float pn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(ph(i),ph(i+vec3(1,0,0)),f.x),mix(ph(i+vec3(0,1,0)),ph(i+vec3(1,1,0)),f.x),f.y),mix(mix(ph(i+vec3(0,0,1)),ph(i+vec3(1,0,1)),f.x),mix(ph(i+vec3(0,1,1)),ph(i+vec3(1,1,1)),f.x),f.y),f.z);}
float pf(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*pn(p);p*=2.07;a*=.5;}return s;}`;
    const surf = {
      earth: `float c=pf(o*2.6+3.);vec3 col=mix(vec3(.02,.12,.38),vec3(.05,.3,.6),pf(o*6.));float land=smoothstep(.5,.53,c);vec3 lc=mix(vec3(.13,.36,.1),vec3(.5,.42,.25),smoothstep(.55,.7,c));lc=mix(lc,vec3(.95),smoothstep(.82,.9,abs(o.y)));col=mix(col,lc,land);
        float cl=smoothstep(.5,.75,pf(o*4.+vec3(uT*.01,0.,0.)));col=mix(col,vec3(1.),cl*.85);spec=(1.-land)*(1.-cl);night=land*(1.-cl)*step(.6,pn(o*40.))*.9;atm=vec3(.3,.6,1.);`,
      moon: `float c=pf(o*3.);vec3 col=vec3(.55,.54,.52)*(.7+.5*c);for(int i=0;i<3;i++){float k=pn(o*(6.+float(i)*7.));col*=1.-smoothstep(.72,.8,k)*.35+smoothstep(.8,.84,k)*.15;}atm=vec3(0.);`,
      jupiter: `float y=o.y+pf(o*3.+vec3(uT*.02,0.,0.))*.12;float b=sin(y*22.)*.5+.5;vec3 col=mix(vec3(.78,.62,.45),vec3(.95,.88,.78),b);col=mix(col,vec3(.6,.38,.25),smoothstep(.6,1.,sin(y*9.+1.))*.6);
        float sp=1.-smoothstep(.12,.2,length(vec2((atan(o.z,o.x)-1.)*.5,(o.y+.35)*1.6)));col=mix(col,vec3(.75,.3,.18),sp);atm=vec3(.9,.75,.55)*.5;`,
      saturn: `float y=o.y+pf(o*2.)*.04;vec3 col=mix(vec3(.85,.75,.55),vec3(.95,.88,.7),sin(y*30.)*.5+.5);atm=vec3(.9,.8,.6)*.4;`,
      mars: `float c=pf(o*3.);vec3 col=mix(vec3(.55,.2,.08),vec3(.8,.42,.22),c);col=mix(col,vec3(.95),smoothstep(.86,.93,abs(o.y)));atm=vec3(1.,.5,.3)*.4;`,
      neptune: `vec3 col=mix(vec3(.15,.3,.85),vec3(.35,.55,1.),sin(o.y*14.+pf(o*3.)*2.)*.5+.5);atm=vec3(.4,.6,1.)*.6;`,
    };
    const planetMat = kind => new THREE.ShaderMaterial({ depthWrite: false, fog: false, uniforms: { uT: U.uTime, uSun: { value: SUN } },
      vertexShader: 'varying vec3 vO;varying vec3 vN;varying vec3 vV;void main(){vO=normalize(position);vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: `uniform float uT;uniform vec3 uSun;varying vec3 vO;varying vec3 vN;varying vec3 vV;${NOISE}
void main(){vec3 o=vO;float spec=0.,night=0.;vec3 atm;${surf[kind]}
 vec3 n=normalize(vN);float l=dot(n,uSun);float lit=smoothstep(-.08,.25,l);vec3 oc=col*(lit*1.15+.03);
 oc+=vec3(1.,.95,.8)*pow(clamp(dot(reflect(-uSun,n),vV),0.001,1.),40.)*spec*lit*.8;oc+=vec3(1.,.75,.35)*night*(1.-lit);
 float fr=pow(clamp(1.-dot(n,vV),0.,1.),3.);oc+=atm*fr*(.25+lit)*1.3;gl_FragColor=vec4(max(oc,vec3(0.)),1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}` });
    const R = 560, place = (m, dir, dist) => { m.position.copy(new THREE.Vector3(...dir).normalize().multiplyScalar(dist || R)); P.add(m); return m; };
    const planet = (kind, r, dir, tilt = 0, sp = .02) => { const m = place(new THREE.Mesh(new THREE.SphereGeometry(r, 64, 40), planetMat(kind)), dir); m.rotation.z = tilt; m.frustumCulled = false; this.spin.push([m, sp]); return m; };
    // Sol: disco ardente + coroa e brilho aditivos
    const glowTex = (inner, outer) => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, inner); g.addColorStop(.25, outer); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const sunM = new THREE.ShaderMaterial({ depthWrite: false, fog: false, uniforms: { uT: U.uTime }, vertexShader: 'varying vec3 vO;varying vec3 vN;varying vec3 vV;void main(){vO=normalize(position);vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: `uniform float uT;varying vec3 vO;varying vec3 vN;varying vec3 vV;${NOISE}void main(){float g=pf(vO*5.+vec3(uT*.05));float limb=pow(clamp(dot(normalize(vN),vV),.001,1.),.45);vec3 c=mix(vec3(1.,.45,.08),vec3(1.,.95,.7),g)*(1.6+g)*limb;gl_FragColor=vec4(c,1.);}` });
    const sun = place(new THREE.Mesh(new THREE.SphereGeometry(30, 48, 32), sunM), SUN.toArray()); this.spin.push([sun, .01]);
    for (const [s, op, col] of [[260, .9, 'rgba(255,220,160,1)'], [520, .45, 'rgba(255,150,80,.8)']]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,255,240,1)', col), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op, fog: false })); sp.scale.set(s, s, 1); sp.position.copy(sun.position); P.add(sp); }
    // Terra + Lua, Júpiter, Saturno com anéis, Marte, Netuno
    const earth = planet('earth', 26, [.45, .3, -.84], .4, .03);
    const moon = planet('moon', 7, [.62, .36, -.7], 0, .005); this.moon = moon; this.earth = earth;
    planet('jupiter', 52, [-.2, .5, .85], .05, .04);
    const sat = planet('saturn', 26, [.9, .22, .35], .45, .03);
    const ringM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: { uSun: { value: SUN } },
      vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vP;float h(float x){return fract(sin(x*127.1)*43758.5);}void main(){float r=length(vP)/26.;float b=.55+.45*sin(r*90.)*sin(r*23.);float gap=smoothstep(.0,.02,abs(r-1.95))*smoothstep(.0,.015,abs(r-1.62));float a=smoothstep(1.3,1.36,r)*(1.-smoothstep(2.25,2.32,r))*b*gap;vec3 c=mix(vec3(.75,.65,.5),vec3(.95,.88,.72),h(floor(r*60.)));gl_FragColor=vec4(c*.9,a*.85);\n#include <colorspace_fragment>\n}' });
    const ring = new THREE.Mesh(new THREE.RingGeometry(26 * 1.3, 26 * 2.32, 128, 1), ringM); ring.rotation.x = -PI / 2 + .45; ring.rotation.y = .3; ring.position.copy(sat.position); ring.frustumCulled = false; P.add(ring);
    planet('mars', 11, [-.85, .2, .2], .2, .025);
    planet('neptune', 15, [.1, .75, -.2], .3, .02);
    // estrelas brilhantes com cor e cintilação (por cima do céu pintado)
    const N = 1600, pos = new Float32Array(N * 3), cl = new Float32Array(N * 3), r = rng(4242);
    for (let i = 0; i < N; i++) { const u = r() * 2 - 1, a = r() * TAU, q = Math.sqrt(1 - u * u); pos[i * 3] = Math.cos(a) * q * 640; pos[i * 3 + 1] = u * 640; pos[i * 3 + 2] = Math.sin(a) * q * 640; const t = r(); cl[i * 3] = t < .3 ? .7 : 1; cl[i * 3 + 1] = t < .3 ? .8 : t > .85 ? .75 : .95; cl[i * 3 + 2] = t > .85 ? .6 : 1; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    const stars = new THREE.Points(sg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, uniforms: { uT: U.uTime }, vertexColors: true,
      vertexShader: 'uniform float uT;varying vec3 vC;varying float vA;void main(){vC=color;float s=fract(sin(dot(position,vec3(12.9,78.2,37.7)))*43758.5);vA=.55+.45*sin(uT*(1.+s*3.)+s*60.);gl_PointSize=1.5+s*s*4.5;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec3 vC;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float d=length(q);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vC*a*vA*1.5,1.);}' }));
    stars.frustumCulled = false; P.add(stars);
    // estrelas cadentes ocasionais
    this.shoot = new THREE.Mesh(new THREE.PlaneGeometry(40, .9), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); this.shoot.frustumCulled = false; P.add(this.shoot); this.shootT = 3;
  }
  update(t, cam) {
    if (!this.built || !this.group.visible) return;
    this.sky.position.copy(cam);
    if (this.planets) { this.planets.position.copy(cam); for (const [m, sp] of this.spin) m.rotation.y = t * sp;
      const ma = t * .03, ep = this.earth.position; this.moon.position.set(ep.x + Math.cos(ma) * 60, ep.y + Math.sin(ma) * 14, ep.z + Math.sin(ma) * 60);
      const dt = t - (this.lastT ?? t); this.lastT = t; this.shootT -= dt; const sh = this.shoot;
      if (this.shootT < 0) { this.shootT = 4 + Math.random() * 7; const a = Math.random() * TAU; sh.userData = { t: 0, p: new THREE.Vector3(Math.cos(a) * 400, 220 + Math.random() * 150, Math.sin(a) * 400), v: new THREE.Vector3(-Math.sin(a), -.35, Math.cos(a)).multiplyScalar(320) }; }
      const u = sh.userData; if (u && u.p) { u.t += dt; sh.position.copy(u.p).addScaledVector(u.v, u.t); sh.lookAt(cam); sh.material.opacity = Math.max(0, Math.sin(Math.min(1, u.t / .9) * PI)) * .9; const vv = u.v.clone().normalize(); sh.rotation.z = Math.atan2(vv.y, Math.hypot(vv.x, vv.z)) * .6; } } this.arch.rotation.z = Math.sin(t * .3) * .05; this.disk.rotation.z = -t * .5;
    for (const [m, y0, ph, sp] of this.rocks) { m.position.y = y0 + Math.sin(t * sp + ph) * 1.5; m.rotation.y += .0015; }
  }
}
