/* CyberArena · efeitos dos poderes dos personagens.
   NEXUS: Singularidade (buraco negro que suga e implode) e ABISMO ESTELAR (leva o alvo para uma dimensão própria
   com planetas, estrelas, meteoros e buracos negros que o atingem).
   CYBER: Descarga em Cadeia (raio de plasma que salta entre inimigos) e PROTOCOLO ÔMEGA (asas de energia, mísseis
   teleguiados, canhão orbital vindo do céu e impacto no chão).
   Tudo é procedural (shaders próprios), sem texturas externas. */
import { SOFT } from './softbody.js';
import * as THREE from '../lib/three.module.min.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
const ss = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const smoothstepJS = (e0, e1, x) => ss((x - e0) / (e1 - e0));

const NOISE = `
float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
`;
const add = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
const VS_UV = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const G = {}; // geometrias compartilhadas
const geo = (k, f) => G[k] || (G[k] = f());

/* ===================================================== buraco negro ===================================================== */
const _sbp = new THREE.Vector3();
export function makeBlackHole(r = 1, o = {}) {
  const T = { value: 0 }, K = { value: 1 }, group = new THREE.Group(); group.scale.setScalar(r);
  const hz = new THREE.Mesh(geo('bhS', () => new THREE.SphereGeometry(1, 40, 24)), new THREE.MeshBasicMaterial({ color: 0x000000 })); group.add(hz);
  // anel de fótons + lente gravitacional (sempre virado para a câmera)
  const halo = new THREE.Mesh(geo('bhP', () => new THREE.PlaneGeometry(2, 2)), new THREE.ShaderMaterial({ ...add, uniforms: { uT: T, uK: K, uC: { value: new THREE.Color(o.color || 0xff9a3c) }, uC2: { value: new THREE.Color(o.color2 || 0x9a5cff) } }, vertexShader: VS_UV,
    fragmentShader: NOISE + 'uniform float uT,uK;uniform vec3 uC,uC2;varying vec2 vUv;void main(){vec2 q=(vUv-.5)*2.*4.2;float d=length(q);if(d<.98)discard;float a=atan(q.y,q.x);' +
      'float ring=exp(-pow((d-1.06)/.06,2.))*2.2+exp(-pow((d-1.25)/.18,2.))*.6;float sw=fbm(vec3(a*2.+uT*1.6-3./d,d*1.5-uT*.4,uT*.2));float glow=exp(-(d-1.)*1.25)*(.35+.9*sw);' +
      'vec3 c=mix(uC,uC2,smoothstep(1.,3.5,d))*glow+vec3(1.,.92,.8)*ring;float f=smoothstep(4.2,2.8,d);gl_FragColor=vec4(c*f*uK,1.);}' }));
  group.add(halo);
  // disco de acreção inclinado: faixas que giram mais rápido perto do centro, lado que vem em direção à câmera mais brilhante
  const disk = new THREE.Mesh(geo('bhD', () => new THREE.RingGeometry(1.2, 4.4, 160, 6)), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: { uT: T, uK: K, uC: { value: new THREE.Color(o.color || 0xff9a3c) }, uC2: { value: new THREE.Color(o.color2 || 0x9a5cff) } },
    vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: NOISE + 'uniform float uT,uK;uniform vec3 uC,uC2;varying vec2 vP;void main(){float r=length(vP),a=atan(vP.y,vP.x);float w=uT*3./pow(r,1.5);' +
      'float b=fbm(vec3(cos(a+w)*r*1.4,sin(a+w)*r*1.4,r*3.-uT*.3));float band=.55+.45*sin(r*14.-uT*2.+b*6.);float fall=smoothstep(4.4,2.2,r)*smoothstep(1.2,1.5,r);' +
      'float dop=1.+.65*sin(a);vec3 hot=mix(vec3(1.,.97,.85),uC,smoothstep(1.3,2.4,r));vec3 c=mix(hot,uC2,smoothstep(2.4,4.2,r));gl_FragColor=vec4(c*b*band*fall*dop*1.8*uK,1.);}' }));
  disk.rotation.x = -Math.PI / 2 + (o.tilt ?? .32); disk.rotation.y = o.tilt2 ?? .12; group.add(disk);
  // matéria espiralando para dentro
  const N = o.particles ?? 260, seed = new Float32Array(N), pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) seed[i] = Math.random();
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('sd', new THREE.BufferAttribute(seed, 1));
  const pts = new THREE.Points(pg, new THREE.ShaderMaterial({ ...add, uniforms: { uT: T, uK: K, uS: { value: r } },
    vertexShader: 'attribute float sd;uniform float uT,uS;varying float vL;void main(){float l=fract(uT*(.18+sd*.25)+sd*7.13);float rr=mix(6.,1.05,pow(l,.8));float a=sd*62.83+l*9.;' +
      'vec3 p=vec3(cos(a)*rr,sin(sd*40.)*(1.-l)*1.6,sin(a)*rr);vL=l;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp(uS*(3.+sd*5.)*30./max(-mv.z,.5),1.,28.);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform float uK;varying float vL;void main(){vec2 d=gl_PointCoord-.5;float a=exp(-dot(d,d)*14.)*sin(vL*3.14159);gl_FragColor=vec4(mix(vec3(.6,.4,1.),vec3(1.,.85,.6),vL)*a*1.6*uK,1.);}' }));
  pts.frustumCulled = false; group.add(pts);
  for (const m of [halo, disk, pts]) m.renderOrder = 7;
  return {
    group, T, K, disk,
    update(dt, camera) { T.value += dt * (o.speed ?? 1); if (group.parent) { group.getWorldPosition(_sbp); SOFT.hole(_sbp, group.scale.x * (o.mass ?? 1)); } halo.quaternion.copy(camera.quaternion); if (group.parent && group.parent.quaternion) { const q = new THREE.Quaternion(); group.parent.getWorldQuaternion(q); halo.quaternion.premultiply(q.invert()); } },
    dispose() { group.removeFromParent(); for (const m of [hz, halo, disk, pts]) m.material.dispose(); pg.dispose(); },
  };
}

/* portal em espiral (abertura da dimensão) */
function makePortal(color = 0x9a5cff) {
  const U = { uT: { value: 0 }, uO: { value: 0 }, uC: { value: new THREE.Color(color) } };
  const m = new THREE.Mesh(geo('bhP', () => new THREE.PlaneGeometry(2, 2)), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: U, vertexShader: VS_UV,
    fragmentShader: NOISE + 'uniform float uT,uO;uniform vec3 uC;varying vec2 vUv;void main(){vec2 q=(vUv-.5)*2.;float d=length(q)/max(uO,.001);if(d>1.)discard;float a=atan(q.y,q.x)+uT*3.+2.2/(d+.15);' +
      'float arms=.5+.5*sin(a*5.+fbm(vec3(q*3.,uT))*4.);float edge=smoothstep(.75,1.,d);vec3 c=mix(vec3(0.),uC*1.6,arms*smoothstep(.05,.9,d))+vec3(.8,.9,1.)*edge*1.5;' +
      'float al=smoothstep(1.,.92,d);gl_FragColor=vec4(c,al*(.65+.35*arms));}' }));
  m.renderOrder = 8; return { m, U };
}

/* fita virada para a câmera (rastros e raios) */
class Ribbon {
  constructor(n, width, color, opacity = 1) {
    this.n = n; this.w = width; this.pts = []; this.pos = new Float32Array(n * 6); this.al = new Float32Array(n * 2);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('al', new THREE.BufferAttribute(this.al, 1));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.U = { uC: { value: new THREE.Color(color) }, uO: { value: opacity } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: this.U, vertexShader: 'attribute float al;varying float vA;void main(){vA=al;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 uC;uniform float uO;varying float vA;void main(){gl_FragColor=vec4(uC*vA*uO,1.);}' }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 7; this.geo = g;
  }
  set(points, cam, taper = true) {
    const n = Math.min(this.n, points.length), P = this.pos, A = this.al, v = new THREE.Vector3(), t = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < this.n; i++) {
      const j = Math.min(i, n - 1), p = points[j], q = points[Math.min(j + 1, n - 1)], o = points[Math.max(j - 1, 0)];
      t.subVectors(q, o); if (t.lengthSq() < 1e-8) t.set(0, 1, 0); v.subVectors(cam, p); s.crossVectors(t, v).normalize();
      const k = n > 1 ? j / (n - 1) : 1, w = this.w * (taper ? Math.sin(Math.PI * clamp(k, .05, .95)) * .7 + .3 * k : 1) * .5;
      P[i * 6] = p.x - s.x * w; P[i * 6 + 1] = p.y - s.y * w; P[i * 6 + 2] = p.z - s.z * w; P[i * 6 + 3] = p.x + s.x * w; P[i * 6 + 4] = p.y + s.y * w; P[i * 6 + 5] = p.z + s.z * w;
      A[i * 2] = A[i * 2 + 1] = i < n ? (taper ? .25 + .75 * k : 1) : 0;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.al.needsUpdate = true;
  }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); this.mesh.material.dispose(); }
}

/* ===================================================== planetas ===================================================== */
const PLANET_FS = NOISE + `uniform float uT,uType,uSeed;uniform vec3 uA,uB,uC,uL;varying vec3 vN,vP,vV;
void main(){vec3 n=normalize(vN);vec3 p=vP*1.6+uSeed;float lat=vP.y;vec3 col;
 if(uType<.5){float b=sin(lat*13.+fbm(p*1.5+vec3(uT*.05,0,0))*5.);col=mix(uA,uB,.5+.5*b);col=mix(col,uC,smoothstep(.55,.8,fbm(p*3.)));}
 else if(uType<1.5){float h=fbm(p*2.2);col=mix(uA,uB,smoothstep(.35,.65,h));float cr=smoothstep(.72,.78,fbm(p*6.));col=mix(col,uC,cr*.6);}
 else if(uType<2.5){float h=fbm(p*2.5);float crack=smoothstep(.05,0.,abs(fbm(p*4.+3.)-.5));col=mix(uA,uB,h)+uC*crack*2.5*(0.7+.3*sin(uT*3.));}
 else{float h=fbm(p*3.);col=mix(uA,uB,h);col=mix(col,vec3(1.),smoothstep(.7,.9,abs(lat)));}
 float dif=clamp(dot(n,normalize(uL)),0.,1.)*.9+.08;float rim=pow(1.-clamp(dot(n,normalize(vV)),0.,1.),3.);
 vec3 c=col*dif+mix(uB,vec3(.6,.8,1.),.5)*rim*1.2;if(uType>1.5&&uType<2.5)c+=uC*smoothstep(.05,0.,abs(fbm(p*4.+3.)-.5))*1.5;gl_FragColor=vec4(c,1.);}`;
function makePlanet(type, a, b, c, seed, T) {
  const mat = new THREE.ShaderMaterial({ uniforms: { uT: T, uType: { value: type }, uSeed: { value: seed }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uC: { value: new THREE.Color(c) }, uL: { value: new THREE.Vector3(1, .6, .4) } },
    vertexShader: 'varying vec3 vN,vP,vV;void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=cameraPosition-w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}', fragmentShader: PLANET_FS });
  return new THREE.Mesh(geo('pl', () => new THREE.SphereGeometry(1, 48, 32)), mat);
}
function makeRing(inner, outer, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 2), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uC: { value: new THREE.Color(color) }, uI: { value: inner }, uO: { value: outer } },
    vertexShader: 'varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform vec3 uC;uniform float uI,uO;varying vec2 vP;void main(){float r=(length(vP)-uI)/(uO-uI);float s=.5+.5*sin(r*80.)*sin(r*23.);gl_FragColor=vec4(uC*(.6+.6*s),(.35+.45*s)*smoothstep(0.,.1,r)*smoothstep(1.,.85,r));}' }));
  m.rotation.x = -Math.PI / 2 + .45; return m;
}

/* ===================================================== dimensão (ABISMO ESTELAR) ===================================================== */
class Dimension {
  constructor(fx, center, R) {
    this.fx = fx; this.c = center.clone(); this.R = R; this.t = 0; this.T = { value: 0 }; this.open = 0; this.group = new THREE.Group(); this.group.position.copy(center);
    this.sky = new THREE.Mesh(geo('dimS', () => new THREE.SphereGeometry(1, 64, 40)), new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uT: this.T, uO: { value: 0 } },
      vertexShader: 'varying vec3 vD;void main(){vD=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: NOISE + `uniform float uT,uO;varying vec3 vD;
        void main(){vec3 d=normalize(vD);float n1=fbm(d*2.2+vec3(uT*.02,0.,uT*.015));float n2=fbm(d*4.5-vec3(0.,uT*.03,0.));
        vec3 neb=mix(vec3(.02,.01,.06),vec3(.32,.06,.42),smoothstep(.35,.8,n1))+vec3(.05,.22,.5)*smoothstep(.45,.85,n2)+vec3(.6,.15,.3)*pow(smoothstep(.55,.95,n1*n2*1.8),2.);
        float band=exp(-abs(dot(d,normalize(vec3(.3,1.,.2))))*7.)*(.5+.5*fbm(d*9.));neb+=vec3(.75,.6,1.)*band*.6;
        vec3 g=d*180.;vec3 id=floor(g);float h=h31(id);vec3 f=fract(g)-.5;float st=step(.985,h)*exp(-dot(f,f)*28.)*(.6+.4*sin(uT*3.+h*90.));
        vec3 g2=d*60.;float h2=h31(floor(g2)+7.);vec3 f2=fract(g2)-.5;float st2=step(.993,h2)*exp(-dot(f2,f2)*16.);
        vec3 c=neb+vec3(1.,.95,.9)*st*2.+mix(vec3(.6,.8,1.),vec3(1.,.7,.5),h2)*st2*3.;
        gl_FragColor=vec4(c*uO,1.);}` }));
    this.sky.scale.setScalar(R); this.sky.renderOrder = -5; this.group.add(this.sky);
    // planetas orbitando
    const P = [[0, 0xd8a868, 0x8a4a26, 0xf4e0c0, 6.5], [1, 0x2a5aa8, 0x3aa86a, 0xe8e8e8, 3.8], [2, 0x241010, 0x401816, 0xff5a1a, 4.4], [3, 0x9ad0ff, 0x3a6aa8, 0xffffff, 3.2], [0, 0x6a3aa8, 0xd070ff, 0x2a0a4a, 5.2], [1, 0x8a7a6a, 0x4a3e36, 0x222222, 2.4]];
    this.planets = P.map((p, i) => { const m = makePlanet(p[0], p[1], p[2], p[3], i * 3.7, this.T); m.scale.setScalar(p[4]); const a = i / P.length * TAU, d = R * (.55 + (i % 3) * .1), y = (i % 2 ? 1 : -1) * (4 + i * 2.2);
      m.position.set(Math.cos(a) * d, y, Math.sin(a) * d); this.group.add(m); return { m, a, d, y, w: .08 + (i % 3) * .05, r: p[4], free: null }; });
    this.planets[0].m.add(makeRing(1.35, 2.3, 0xe8c890));
    this.holes = [makeBlackHole(3.2, { tilt: .5 }), makeBlackHole(2.2, { color: 0x5ad0ff, color2: 0xff4ad0, tilt: -.3 })];
    this.holes[0].group.position.set(-R * .62, 12, -R * .45); this.holes[1].group.position.set(R * .5, -6, R * .55); for (const h of this.holes) this.group.add(h.group);
    // poeira estelar e estrelas grandes com brilho em cruz
    const N = 900, ps = new Float32Array(N * 3), sd = new Float32Array(N); for (let i = 0; i < N; i++) { const u = Math.random() * 2 - 1, a = Math.random() * TAU, rr = R * (.15 + .8 * Math.cbrt(Math.random())); ps[i * 3] = Math.cos(a) * Math.sqrt(1 - u * u) * rr; ps[i * 3 + 1] = u * rr; ps[i * 3 + 2] = Math.sin(a) * Math.sqrt(1 - u * u) * rr; sd[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(ps, 3)); g.setAttribute('sd', new THREE.BufferAttribute(sd, 1));
    this.dust = new THREE.Points(g, new THREE.ShaderMaterial({ ...add, uniforms: { uT: this.T, uO: { value: 0 } },
      vertexShader: 'attribute float sd;uniform float uT;varying float vS;void main(){vS=sd;vec3 p=position;float a=uT*.05*(sd-.5);p.xz=mat2(cos(a),-sin(a),sin(a),cos(a))*p.xz;vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=clamp((sd>.96?40.:6.)*(12./max(-mv.z,1.)),1.,60.);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform float uT,uO;varying float vS;void main(){vec2 q=gl_PointCoord-.5;float d=length(q);float a=exp(-d*d*30.);if(vS>.96)a+=max(0.,1.-abs(q.x)*30.)*max(0.,1.-abs(q.y)*2.2)+max(0.,1.-abs(q.y)*30.)*max(0.,1.-abs(q.x)*2.2);a*=.6+.4*sin(uT*4.+vS*80.);gl_FragColor=vec4(mix(vec3(.7,.8,1.),vec3(1.,.8,.95),vS)*a*uO,1.);}' }));
    this.dust.frustumCulled = false; this.group.add(this.dust);
    // plataforma de cristal flutuante sob o NEXUS
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(2.6, .9, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x1a1030, emissive: 0x6a2aff, emissiveIntensity: .6, metalness: .6, roughness: .25, flatShading: true }));
    this.plat = plat; this.group.add(plat);
    this.meteors = []; this.flare = null;
  }
  arena(R) { // chão de cristal gigante e um campo de força: não dá para fugir
    this.plat.visible = false; const T = this.T;
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(R, R * .55, 2.4, 64, 1), new THREE.MeshStandardMaterial({ color: 0x140a2a, emissive: 0x4a1aa8, emissiveIntensity: .45, metalness: .7, roughness: .25, flatShading: true }));
    disk.position.y = -1.2; disk.receiveShadow = true; this.group.add(disk);
    const lines = new THREE.Mesh(new THREE.RingGeometry(.2, R, 64, 8).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ ...add, uniforms: { uT: T, uR: { value: R } }, vertexShader: 'varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uT,uR;varying vec2 vP;void main(){float r=length(vP)/uR,a=atan(vP.y,vP.x);float g=smoothstep(.04,0.,abs(fract(r*6.-uT*.4)-.5)-.44)+smoothstep(.02,0.,abs(fract(a*3.183)-.5)-.47)*.5;float e=smoothstep(.9,1.,r);gl_FragColor=vec4(vec3(.6,.35,1.)*(g*.6+e*1.4),1.);}' }));
    lines.position.y = .03; this.group.add(lines);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 26, 64, 1, true), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: { uT: T }, vertexShader: VS_UV,
      fragmentShader: 'uniform float uT;varying vec2 vUv;void main(){vec2 h=vec2(vUv.x*90.,vUv.y*26.);vec2 r=mod(h,vec2(1.,1.732))-vec2(.5,.866);float hex=smoothstep(.12,.02,abs(length(r)-.45));float sc=.5+.5*sin(vUv.y*40.-uT*6.);float f=smoothstep(1.,.2,vUv.y)*smoothstep(0.,.04,vUv.y);gl_FragColor=vec4(vec3(.55,.3,1.)*(hex*.5+sc*.15)*f,1.);}' }));
    wall.position.y = 11; wall.renderOrder = 6; this.group.add(wall); this.arenaParts = [disk, lines, wall];
  }
  setPlatform(local) { this.plat.position.copy(local); this.plat.position.y -= .6; }
  attach(scene) { scene.add(this.group); }
  planetObj(size, i) { const P = [[0, 0xd8a868, 0x8a4a26, 0xf4e0c0], [1, 0x2a5aa8, 0x3aa86a, 0xe8e8e8], [2, 0x241010, 0x401816, 0xff5a1a], [3, 0x9ad0ff, 0x3a6aa8, 0xffffff], [0, 0x6a3aa8, 0xd070ff, 0x2a0a4a]][i % 5];
    const m = makePlanet(P[0], P[1], P[2], P[3], i * 2.3, this.T); m.scale.setScalar(size); if (i % 3 === 0) m.add(makeRing(1.35, 2.2, P[3]));
    return { group: m, update: dt => { m.rotation.y += dt * 2; m.rotation.x += dt * .7; }, dispose: () => { m.removeFromParent(); m.material.dispose(); for (const c of m.children) { c.geometry.dispose(); c.material.dispose(); } } }; }
  meteor(from, to, dur, color, size, onHit, obj) {
    let head;
    if (obj) { head = obj.group; this.fx.scene.add(head); }
    else { head = new THREE.Mesh(geo('mH', () => new THREE.SphereGeometry(1, 16, 12)), new THREE.MeshBasicMaterial({ color, ...add })); head.scale.setScalar(size); head.renderOrder = 8; this.fx.scene.add(head);
      const core = new THREE.Mesh(geo('mH', () => new THREE.SphereGeometry(1, 16, 12)), new THREE.MeshBasicMaterial({ color: 0xffffff, ...add })); head.add(core); core.scale.setScalar(.5); }
    const trail = new Ribbon(18, size * 2.2, color, .9); this.fx.scene.add(trail.mesh);
    const ctrl = from.clone().lerp(to, .5).add(new THREE.Vector3((Math.random() - .5) * 14, 8 + Math.random() * 8, (Math.random() - .5) * 14));
    this.meteors.push({ from: from.clone(), to: to.live ? to : to.clone(), ctrl, dur, t: 0, head, trail, hist: [], onHit, color: new THREE.Color(color), size, obj });
  }
  update(dt, cam) {
    this.t += dt; this.T.value += dt; const o = this.open; this.sky.material.uniforms.uO.value = o; this.dust.material.uniforms.uO.value = o;
    for (const h of this.holes) { h.update(dt, cam); h.K.value = o; }
    for (const p of this.planets) { if (p.free) continue; p.a += p.w * dt; p.m.position.set(Math.cos(p.a) * p.d, p.y + Math.sin(this.t * .4 + p.a) * 1.5, Math.sin(p.a) * p.d); p.m.rotation.y += dt * .25; p.m.scale.setScalar(p.r * ss(o)); }
    for (const m of this.meteors) {
      m.t += dt; const k = clamp(m.t / m.dur, 0, 1), e = k * k, a = m.from.clone().lerp(m.ctrl, e), b = m.ctrl.clone().lerp(m.to, e), p = a.lerp(b, e);
      m.head.position.copy(p); if (m.obj) m.obj.update(dt, cam); m.hist.unshift(p.clone()); if (m.hist.length > 18) m.hist.pop(); m.trail.set([...m.hist].reverse(), cam.position);
      if (Math.random() < .6) this.fx.emit(p.x, p.y, p.z, 1, { color: [m.color.r, m.color.g, m.color.b], speed: 1, up: 0, life: .4, size: m.size * .4, grav: 0 });
      if (k >= 1 && !m.done) { m.done = true; this.fx.impact(m.to, m.color.getHex(), true); this.fx.flash(m.to, 0xffffff, Math.min(30, m.size * 3), .3); if (m.size > 2) { this.fx.ring(m.to.x, m.to.y - 1, m.to.z, m.color.getHex(), m.size * 3, .7); this.fx.emit(m.to.x, m.to.y, m.to.z, 70, { color: [m.color.r, m.color.g, m.color.b], speed: 14, up: 3, life: .8, size: .3, grav: 0 }); } if (m.onHit) m.onHit(); }
    }
    this.meteors = this.meteors.filter(m => { if (m.done) { if (m.obj) m.obj.dispose(); else { m.head.removeFromParent(); m.head.material.dispose(); m.head.children[0].material.dispose(); } m.trail.dispose(); return false; } return true; });
  }
  dispose() { for (const h of this.holes) h.dispose(); for (const m of this.meteors) { if (m.obj) m.obj.dispose(); else m.head.removeFromParent(); m.trail.dispose(); } for (const m of this.arenaParts || []) { m.geometry.dispose(); m.material.dispose(); } this.group.removeFromParent(); this.sky.material.dispose(); this.dust.material.dispose(); this.dust.geometry.dispose(); for (const p of this.planets) p.m.material.dispose(); this.plat.geometry.dispose(); this.plat.material.dispose(); }
}

/* ===================================================== asas de energia (CYBER) ===================================================== */
function makeWings(color) {
  const U = { uT: { value: 0 }, uO: { value: 0 }, uC: { value: new THREE.Color(color) } }, g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: U, vertexShader: VS_UV,
    fragmentShader: 'uniform float uT,uO;uniform vec3 uC;varying vec2 vUv;void main(){float x=vUv.x,y=vUv.y;float top=.95-x*x*.55;float fe=fract(x*7.);float bottom=.25+.45*x+fe*.18*(1.-x);' +
      'if(y>top*1.||y<bottom*(1.-uO*.0)||x>uO)discard;vec2 h=vec2(x*26.,y*15.);vec2 r=mod(h,vec2(1.,1.732))-vec2(.5,.866);float hex=smoothstep(.1,.02,abs(length(r)-.45));' +
      'float edge=smoothstep(.04,0.,abs(y-top))+smoothstep(.05,0.,abs(y-bottom));float sc=.5+.5*sin(x*30.-uT*10.);vec3 c=uC*(.35+hex*.8+sc*.25)+vec3(1.)*edge*1.2;gl_FragColor=vec4(c*(1.-x*.4)*min(1.,uO*1.5),1.);}' });
  for (const s of [-1, 1]) { const m = new THREE.Mesh(geo('wing', () => { const p = new THREE.PlaneGeometry(2.6, 2.2); p.translate(1.3, 0, 0); return p; }), mat); m.scale.x = s; m.position.set(0, 2.45, -.38); m.rotation.y = s * -.35; m.rotation.z = s * .25; m.renderOrder = 7; g.add(m); }
  return { g, U, mat };
}

/* ===================================================== gerenciador ===================================================== */
export class Powers {
  constructor(scene, fx, camera) { this.scene = scene; this.fx = fx; this.cam = camera; this.list = []; this.flashEl = null; }
  add(e) { this.list.push(e); return e; }
  update(dt) { for (const e of this.list) { e.t += dt; if (e.update(dt) === false) e.dead = true; } this.list = this.list.filter(e => { if (e.dead) { e.dispose && e.dispose(); return false; } return true; }); }
  screenFlash(color = '#fff', dur = .5, peak = .95) {
    if (!this.flashEl) { this.flashEl = document.createElement('div'); Object.assign(this.flashEl.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 40, opacity: 0, transition: 'none' }); document.body.appendChild(this.flashEl); }
    const el = this.flashEl; el.style.background = color; el.style.transition = 'none'; el.style.opacity = peak; void el.offsetWidth; el.style.transition = `opacity ${dur}s ease-out`; el.style.opacity = 0;
  }

  /* ---------- NEXUS: mini buraco negro na mão (carregando) ---------- */
  handOrb(getPos, dur, r = .28) {
    const bh = makeBlackHole(r, { particles: 80 }); this.scene.add(bh.group); const fx = this.fx;
    return this.add({ t: 0, bh, update: dt => { const p = getPos(); if (!p) return false; bh.group.position.copy(p); bh.group.scale.setScalar(r * (.3 + .7 * ss(bh.T.value / .35))); bh.update(dt, this.cam);
      if (Math.random() < .5) { const a = Math.random() * TAU, d = .9; fx.emit(p.x + Math.cos(a) * d, p.y + (Math.random() - .5) * d, p.z + Math.sin(a) * d, 1, { color: [.7, .45, 1], speed: .2, up: 0, life: .3, size: .1, grav: 0 }); }
      return bh.T.value < dur; }, dispose: () => bh.dispose() });
  }
  /* ---------- NEXUS: Singularidade (projétil → buraco negro que suga e implode) ---------- */
  singularity(from, dir, opt) {
    const P = this, fx = this.fx, sp = opt.speed || 24, range = opt.range || 18, life = opt.life || 2.3, R = opt.radius || 7;
    const orb = makeBlackHole(.62, { particles: 140, speed: 1.6 }), trail = new Ribbon(26, 1.1, 0x9a5cff, .95), trail2 = new Ribbon(26, .32, 0xffffff, .9), trail3 = new Ribbon(26, .6, 0xff9a3c, .7); this.scene.add(orb.group, trail.mesh, trail2.mesh, trail3.mesh); let spin = 0;
    const pos = from.clone(), d = dir.clone().normalize(), hist = []; let flown = 0; let state = 'fly', T0 = 0, bh = null, ring = null, imploded = false;
    const e = { t: 0, get pos() { return pos; }, get open() { return state === 'open'; }, radius: R,
      update(dt) {
        if (state === 'fly') {
          if (opt.home) { const h = opt.home(); if (h) { const want = h.clone().sub(pos).normalize(); d.lerp(want, Math.min(1, dt * 7)).normalize(); } } const prev = pos.clone(); pos.addScaledVector(d, sp * dt); flown += sp * dt; const hit = opt.collide ? opt.collide(prev, pos) : null; orb.group.position.copy(pos); orb.update(dt, P.cam);
          hist.unshift(pos.clone()); if (hist.length > 26) hist.pop(); const h = [...hist].reverse(); trail.set(h, P.cam.position); trail2.set(h, P.cam.position); spin += dt * 14;
          trail3.set(h.map((q, j) => q.clone().add(new THREE.Vector3(Math.cos(spin - j * .5) * .5, Math.sin(spin - j * .5) * .5, 0))), P.cam.position);
          for (let k = 0; k < 3; k++) { const a2 = spin + k * 2.1, rr = .9; fx.emit(pos.x + Math.cos(a2) * rr, pos.y + Math.sin(a2 * .7) * rr, pos.z + Math.sin(a2) * rr, 1, { color: k ? [.7, .45, 1] : [1, .7, .35], speed: .2, up: 0, life: .4, size: .18, grav: 0, dir: [-d.x * 3, -d.y * 3, -d.z * 3], spread: .2 }); }
          if (Math.random() < .8) fx.emit(pos.x, pos.y, pos.z, 2, { color: [.6, .35, 1], speed: 1.2, up: 0, life: .35, size: .16, grav: 0 });
          if (hit || flown > range) { if (hit) pos.copy(hit); state = 'open'; T0 = e.t; orb.dispose(); trail.dispose(); trail2.dispose(); trail3.dispose();
            if (opt.ground) pos.y = Math.max(pos.y, opt.ground(pos.x, pos.z) + 1.9);
            bh = makeBlackHole(.2, { particles: 520, speed: 1.3 }); bh.group.position.copy(pos); P.scene.add(bh.group); fx.flash(pos, 0xb07bff, 3, .3); fx.ring(pos.x, pos.y - 1.8, pos.z, 0x9a5cff, R, .6, .3);
            const rg = new THREE.Mesh(geo('vRing', () => { const g = new THREE.RingGeometry(.2, 1, 96); g.rotateX(-Math.PI / 2); return g; }), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: { uT: { value: 0 } },
              vertexShader: 'varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
              fragmentShader: NOISE + 'uniform float uT;varying vec2 vP;void main(){float r=length(vP),a=atan(vP.y,vP.x)+uT*2.5+1.5/r;float s=.5+.5*sin(a*6.+fbm(vec3(vP*4.,uT))*3.);gl_FragColor=vec4(vec3(.55,.3,1.)*s*smoothstep(1.,.6,r)*smoothstep(.2,.4,r)*.7,1.);}' }));
            ring = rg; rg.scale.setScalar(R); rg.position.set(pos.x, (opt.ground ? opt.ground(pos.x, pos.z) : pos.y - 1.8) + .1, pos.z); rg.renderOrder = 6; P.scene.add(rg);
            if (opt.onOpen) opt.onOpen(pos.clone()); }
          return true;
        }
        const k = e.t - T0; if (!bh) return false;
        const grow = ss(k / .35) * (k > life ? Math.max(0, 1 - (k - life) / .18) : 1); bh.group.scale.setScalar(.05 + 1.45 * grow * (1 + Math.sin(k * 9) * .04)); bh.update(dt * (1 + k), P.cam); ring.material.uniforms.uT.value += dt; ring.material.opacity = 1;
        // matéria sendo puxada de longe
        for (let i = 0; i < 4; i++) { const a = Math.random() * TAU, rr = R * (.6 + Math.random() * .5), x = pos.x + Math.cos(a) * rr, z = pos.z + Math.sin(a) * rr, y = pos.y - 1.6 + Math.random() * 3; fx.emit(x, y, z, 1, { color: [.65, .4, 1], speed: .1, up: 0, life: .7, size: .14, grav: 0, dir: [(pos.x - x) * 1.4, (pos.y - y) * 1.4, (pos.z - z) * 1.4], spread: .05 }); }
        if (Math.random() < .25) fx.puff(pos.x + (Math.random() - .5) * R, pos.y - 1.8, pos.z + (Math.random() - .5) * R, 1, { color: [.35, .3, .45], speed: -1.5, up: .6, size: .9, life: .8 });
        if (k > life && !imploded) { imploded = true; fx.flash(pos, 0xffffff, 6, .35); fx.flash(pos, 0x9a5cff, 9, .5); fx.ring(pos.x, pos.y - 1.7, pos.z, 0xffffff, R * 1.3, .5, .25); fx.ring(pos.x, pos.y - 1.7, pos.z, 0x9a5cff, R * 1.8, .8, .3);
          fx.emit(pos.x, pos.y, pos.z, 120, { color: [.75, .55, 1], speed: 16, up: 2, life: .8, size: .2, grav: 2 }); fx.emit(pos.x, pos.y, pos.z, 40, { color: [1, 1, 1], speed: 9, up: 0, life: .4, size: .3, grav: 0 }); if (opt.onImplode) opt.onImplode(pos.clone()); }
        if (k > life + .25) return false; return true;
      },
      dispose() { if (state === 'fly') { orb.dispose(); trail.dispose(); trail2.dispose(); trail3.dispose(); } if (bh) bh.dispose(); if (ring) { ring.removeFromParent(); ring.material.dispose(); } } };
    return this.add(e);
  }

  /* ---------- NEXUS: ABISMO ESTELAR ---------- */
  portal(pos, size, dur, color) {
    const p = makePortal(color); p.m.position.copy(pos); this.scene.add(p.m);
    const e = this.add({ t: 0, update: dt => { const t = e.t; p.U.uT.value += dt; p.U.uO.value = ss(t / .3) * (t > dur - .25 ? Math.max(0, (dur - t) / .25) : 1); p.m.scale.setScalar(size); p.m.quaternion.copy(this.cam.quaternion); return t < dur; }, dispose: () => { p.m.removeFromParent(); p.m.material.dispose(); } });
    return e;
  }
  dimension(center, R, dur) {
    const D = new Dimension(this.fx, center, R); D.attach(this.scene);
    const e = this.add({ t: 0, D, update: dt => { D.open = ss(e.t / .45) * (e.t > dur - .4 ? Math.max(0, (dur - e.t) / .4) : 1); D.update(dt, this.cam); if (e.kill) { e.kill = false; dur = Math.min(dur, e.t + .45); } return e.t < dur; }, dispose: () => D.dispose() });
    return e;
  }

  /* ---------- CYBER: raio elétrico entre dois pontos ---------- */
  bolt(a, b, color = 0x38f2ff, life = .35, width = .16) {
    const core = new Ribbon(14, width, 0xffffff, 1), glow = new Ribbon(14, width * 4, color, .7); this.scene.add(core.mesh, glow.mesh); const A = a.clone(), B = b.clone(); let jt = 0;
    const regen = () => { const pts = [], L = A.distanceTo(B); for (let i = 0; i < 14; i++) { const k = i / 13, p = A.clone().lerp(B, k), j = Math.sin(Math.PI * k) * L * .09; p.x += (Math.random() - .5) * j * 2; p.y += (Math.random() - .5) * j * 2; p.z += (Math.random() - .5) * j * 2; pts.push(p); } core.set(pts, this.cam.position, false); glow.set(pts, this.cam.position, false); };
    regen(); this.fx.flash(B, color, 1.4, .15); this.fx.emit(B.x, B.y, B.z, 18, { color: [.6, .95, 1], speed: 7, up: 1, life: .3, size: .1 });
    const e = this.add({ t: 0, update: dt => { jt -= dt; if (jt < 0) { jt = .035; regen(); } const o = Math.max(0, 1 - e.t / life); core.U.uO.value = o; glow.U.uO.value = .7 * o; return e.t < life; }, dispose: () => { core.dispose(); glow.dispose(); } });
    return e;
  }
  /* faíscas presas a um alvo atordoado */
  shockOn(getPos, dur, color = 0x38f2ff) {
    const e = this.add({ t: 0, k: 0, update: dt => { const p = getPos(); if (!p) return false; e.k -= dt; if (e.k < 0) { e.k = .09; const a = p.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, Math.random() * 2.6, (Math.random() - .5) * 1.2)), b = p.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, Math.random() * 2.6, (Math.random() - .5) * 1.2)); this.bolt(a, b, color, .12, .05); } return e.t < dur; } });
    return e;
  }
  wings(hero, dur, color) {
    const w = makeWings(color); hero.object.add(w.g);
    const e = this.add({ t: 0, update: dt => { w.U.uT.value += dt; w.U.uO.value = ss(e.t / .35) * (e.t > dur - .3 ? Math.max(0, (dur - e.t) / .3) : 1); for (const m of w.g.children) m.rotation.z = Math.sign(m.scale.x) * (.25 + Math.sin(e.t * 9) * .08); return e.t < dur; }, dispose: () => { w.g.removeFromParent(); w.mat.dispose(); } });
    return e;
  }
  /* míssil de plasma teleguiado */
  missile(from, getTarget, dur, color, onHit) {
    const head = new THREE.Mesh(geo('mH', () => new THREE.SphereGeometry(1, 16, 12)), new THREE.MeshBasicMaterial({ color, ...add })); head.scale.setScalar(.22); head.renderOrder = 8; this.scene.add(head);
    const trail = new Ribbon(16, .35, color, .9); this.scene.add(trail.mesh); const hist = [], p0 = from.clone(), side = new THREE.Vector3((Math.random() - .5) * 10, 5 + Math.random() * 6, (Math.random() - .5) * 10); let done = false;
    const e = this.add({ t: 0, update: dt => { const tg = getTarget(); if (!tg) return false; const k = clamp(e.t / dur, 0, 1), ctrl = p0.clone().add(side), a = p0.clone().lerp(ctrl, k), b = ctrl.lerp(tg, k), p = a.lerp(b, k);
      head.position.copy(p); hist.unshift(p.clone()); if (hist.length > 16) hist.pop(); trail.set([...hist].reverse(), this.cam.position);
      if (k >= 1 && !done) { done = true; this.fx.impact(tg, color, true); if (onHit) onHit(); return false; } return true; }, dispose: () => { head.removeFromParent(); head.material.dispose(); trail.dispose(); } });
    return e;
  }
  /* Núcleo de SUPERNOVA lançado como projétil físico de escala colossal. */
  novaProjectile(from, getTarget, dur = .34, color = 0xffa044, onHit, scaleFactor = 1) {
    const group=new THREE.Group(), core=new THREE.Mesh(geo('novaProjectileCore',()=>new THREE.SphereGeometry(1,40,28)),new THREE.MeshBasicMaterial({color:0xfff0c9}));
    const corona=new THREE.Mesh(geo('novaProjectileCorona',()=>new THREE.SphereGeometry(1.32,32,22)),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.38,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    group.add(corona,core);const rings=[];
    for(let i=0;i<3;i++){const ring=new THREE.Mesh(geo('novaProjectileRing'+i,()=>new THREE.TorusGeometry(1.65+i*.28,.035+i*.01,8,64)),new THREE.MeshBasicMaterial({color:i===1?0xffffff:color,transparent:true,opacity:.82,blending:THREE.AdditiveBlending,depthWrite:false}));ring.rotation.set(.45+i*.7,.2+i*.5,i*.8);group.add(ring);rings.push(ring);}
    this.scene.add(group);const trail=new Ribbon(22,1.35*scaleFactor,color,.9);this.scene.add(trail.mesh);const hist=[];const p0=from.clone();let hit=false,emitT=0;
    const e=this.add({t:0,update:dt=>{const target=getTarget();if(!target)return false;const k=clamp(e.t/dur,0,1),ctrl=p0.clone().lerp(target,.42).add(new THREE.Vector3(0,Math.min(34,p0.distanceTo(target)*.16),0)),p=p0.clone().lerp(ctrl,k).lerp(ctrl.clone().lerp(target,k),k);
      group.position.copy(p);const size=(1.1+2.4*ss(k))*scaleFactor;group.scale.setScalar(size);group.rotation.set(e.t*5,e.t*7,e.t*4);for(const r of rings)r.rotation.z+=dt*(3.5+r.position.x*.1);
      hist.unshift(p.clone());if(hist.length>22)hist.pop();trail.set([...hist].reverse(),this.cam.position);emitT-=dt;if(emitT<=0){emitT=.025;this.fx.emit(p.x,p.y,p.z,5,{color:[1,.72,.32],speed:13,up:2,life:.38,size:.32,grav:0});}
      if(k>=1&&!hit){hit=true;this.fx.flash(target,0xffffff,18,.32);this.fx.ring(target.x,target.y,target.z,color,13,.55,.35);this.fx.impact(target,color,true);if(onHit)onHit();return false;}return true;
    },dispose:()=>{group.removeFromParent();for(const m of group.children)if(m.material)m.material.dispose();trail.dispose();}});return e;
  }

  /* canhão orbital: mira no chão → feixe gigante do céu */
  orbital(pos, groundY, R, chargeT, fireT, color = 0xff6a2a) {
    const U = { uT: { value: 0 }, uO: { value: 0 }, uF: { value: 0 }, uC: { value: new THREE.Color(color) } };
    const ret = new THREE.Mesh(geo('ret', () => { const g = new THREE.RingGeometry(.05, 1, 128, 1); g.rotateX(-Math.PI / 2); return g; }), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: U,
      vertexShader: 'varying vec2 vP;void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uT,uO,uF;uniform vec3 uC;varying vec2 vP;void main(){float r=length(vP),a=atan(vP.y,vP.x);float ring=smoothstep(.03,0.,abs(r-.97))+smoothstep(.025,0.,abs(r-.6))*.8+smoothstep(.02,0.,abs(r-mix(1.,.05,fract(uT*.9))))*.9;' +
        'float dash=step(.5,fract(a*8./6.283+uT*.6))*smoothstep(.03,0.,abs(r-.8));float cross=(smoothstep(.015,0.,abs(vP.x))+smoothstep(.015,0.,abs(vP.y)))*step(r,.5);float fill=(.15+.25*uF)*smoothstep(1.,.0,r);' +
        'gl_FragColor=vec4((uC*(ring+dash+cross*.8+fill)+vec3(1.,.9,.7)*uF*smoothstep(.5,0.,r))*uO,1.);}' }));
    ret.position.set(pos.x, groundY + .12, pos.z); ret.scale.setScalar(R); ret.renderOrder = 6; this.scene.add(ret);
    const beam = new THREE.Mesh(geo('beam', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 40, 1, true); g.translate(0, .5, 0); return g; }), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: U,
      vertexShader: 'varying vec2 vUv;varying vec3 vN,vV;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: NOISE + 'uniform float uT,uO,uF;uniform vec3 uC;varying vec2 vUv;varying vec3 vN,vV;void main(){float f=abs(dot(normalize(vN),vV));float core=pow(f,2.5);float n=fbm(vec3(vUv.x*8.,vUv.y*30.-uT*14.,uT));' +
        'float bands=.6+.4*sin(vUv.y*120.-uT*60.);vec3 c=mix(uC*1.4,vec3(1.,.97,.9),core)*(.5+n)*bands;float fade=smoothstep(0.,.03,vUv.y)*smoothstep(1.,.6,vUv.y);gl_FragColor=vec4(c*(core*.8+.25)*fade*uF*1.5,1.);}' }));
    beam.position.set(pos.x, groundY, pos.z); beam.scale.set(.01, 160, .01); beam.renderOrder = 7; this.scene.add(beam);
    const fx = this.fx; let fired = false;
    const e = this.add({ t: 0, update: dt => { U.uT.value += dt; const t = e.t, end = chargeT + fireT;
      U.uO.value = ss(t / .3) * (t > end ? Math.max(0, 1 - (t - end) / .4) : 1);
      const thin = t < chargeT ? .12 + .1 * Math.sin(t * 40) : 0, fire = t >= chargeT ? (t < end ? ss((t - chargeT) / .12) : Math.max(0, 1 - (t - end) / .35)) : (t > chargeT - .6 ? .25 : 0);
      U.uF.value = Math.max(fire, t < chargeT ? ss((t - chargeT + .6) / .6) * .5 : 0); const w = t < chargeT ? thin * ss((t - chargeT + .8) / .8) : R * .72 * fire * (1 + Math.sin(t * 50) * .04); beam.scale.set(Math.max(.01, w), 160, Math.max(.01, w));
      if (t >= chargeT && !fired) { fired = true; fx.flash(new THREE.Vector3(pos.x, groundY + 1, pos.z), 0xffffff, 8, .3); fx.ring(pos.x, groundY, pos.z, 0xffffff, R * 1.6, .5, .3); fx.ring(pos.x, groundY, pos.z, color, R * 2.6, .9, .3); fx.puff(pos.x, groundY, pos.z, 60, { r: R * .5, speed: 9, up: 1.5, size: 2, life: 1.6, color: [.45, .38, .34] }); }
      if (fire > .3 && t < end) { fx.emit(pos.x + (Math.random() - .5) * R, groundY + .3, pos.z + (Math.random() - .5) * R, 6, { color: [1, .7, .35], speed: 9, up: 9, life: .6, size: .18, grav: 14 }); if (Math.random() < .4) fx.puff(pos.x, groundY, pos.z, 3, { r: R * .7, speed: 6, up: 2, size: 1.4, life: 1.1, color: [.4, .34, .3] }); }
      return t < end + .45; }, dispose: () => { for (const m of [ret, beam]) { m.removeFromParent(); m.material.dispose(); } } });
    return e;
  }

  /* Jornada de realidades: cenários tridimensionais distintos e uma passagem microscópica,
     sem usar portais repetidos como substituto de uma viagem cinematográfica. */
  realityJourney(from, to, dur = 3.4, color = 0xffa044) {
    const group = new THREE.Group(); this.scene.add(group);
    const axis = to.clone().sub(from), stages = [];
    const mat = (c, e = c, rough = .7) => new THREE.MeshStandardMaterial({ color:c, emissive:e, emissiveIntensity:.42, roughness:rough, metalness:.08 });
    const addStage = (k, kind) => {
      const g = new THREE.Group(); g.position.copy(from).lerp(to, k); group.add(g);
      if (kind === 0) {
        const ocean = new THREE.Mesh(geo('journeyOcean',()=>new THREE.SphereGeometry(1,40,28)),mat(0x174e73,0x12628a)); ocean.scale.set(1.8,1.65,1.8); g.add(ocean);
        for(let i=0;i<7;i++){const land=new THREE.Mesh(geo('journeyLand',()=>new THREE.SphereGeometry(1,16,12)),mat(0x4e9b68,0x1c593e)); const a=i*2.399; land.scale.set(.55,.12,.38); land.position.set(Math.cos(a)*1.2,Math.sin(a*1.7)*.9,Math.sin(a)*1.2); g.add(land);}
        const cloud=new THREE.Mesh(geo('journeyCloud',()=>new THREE.SphereGeometry(1.04,28,18)),new THREE.MeshBasicMaterial({color:0xb9e9ff,transparent:true,opacity:.16,wireframe:true})); cloud.scale.set(1.95,1.8,1.95); g.add(cloud);
      } else if (kind === 1) {
        const core=new THREE.Mesh(geo('journeyCrystalCore',()=>new THREE.IcosahedronGeometry(1,1)),mat(0x542c91,0x8e4cff,.32)); core.scale.set(1.35,1.8,1.2); g.add(core);
        for(let i=0;i<11;i++){const shard=new THREE.Mesh(geo('journeyShard',()=>new THREE.OctahedronGeometry(1,0)),mat(i%2?0x36b8d5:0x9a68ff,i%2?0x1a8eae:0x6d3dff,.3)); const a=i*2.399,r=.8+(i%3)*.3; shard.position.set(Math.cos(a)*r,(i-5)*.23,Math.sin(a)*r); shard.rotation.set(a*.4,a,a*.7); shard.scale.set(.18,.55+(i%3)*.16,.18); g.add(shard);}
      } else {
        const center=new THREE.Mesh(geo('journeyAtom',()=>new THREE.SphereGeometry(1,24,16)),mat(0xffb84d,0xff7a20,.25)); center.scale.setScalar(.38); g.add(center);
        for(let i=0;i<8;i++){const a=i*TAU/8, b=(i%3-1)*.7, pos=new THREE.Vector3(Math.cos(a)*1.15,b,Math.sin(a)*1.15); const atom=new THREE.Mesh(geo('journeyElectron',()=>new THREE.SphereGeometry(1,16,12)),mat(i%2?0x73dfff:0xffd36a,i%2?0x2b9bff:0xff9a28,.2)); atom.position.copy(pos); atom.scale.setScalar(.16); g.add(atom); const bond=new THREE.Mesh(geo('journeyBond',()=>new THREE.CylinderGeometry(.025,.025,pos.length(),8)),new THREE.MeshBasicMaterial({color:0xd9eaff,transparent:true,opacity:.7})); bond.position.copy(pos).multiplyScalar(.5); bond.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),pos.clone().normalize()); g.add(bond);}
      }
      stages.push({g,k,kind});
    };
    addStage(.22,0); addStage(.53,1); addStage(.82,2);
    const dustN=260, arr=new Float32Array(dustN*3); for(let i=0;i<dustN;i++){const k=Math.random(), side=(Math.random()-.5)*5, up=(Math.random()-.5)*5, base=from.clone().lerp(to,k); arr[i*3]=base.x+side;arr[i*3+1]=base.y+up;arr[i*3+2]=base.z+side*.6;}
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(arr,3));const dust=new THREE.Points(dg,new THREE.PointsMaterial({color:color,size:.12,transparent:true,opacity:.65,depthWrite:false}));group.add(dust);
    const e=this.add({t:0,update:dt=>{const k=clamp(e.t/dur,0,1),fade=Math.min(1,k*5,(1-k)*5);group.position.set(0,0,0);group.scale.setScalar(1);for(const st of stages){const pass=clamp((k-(st.k-.13))/.26,0,1);st.g.scale.setScalar(.08+Math.sin(pass*Math.PI)*1.05);st.g.rotation.y+=dt*(.3+st.kind*.5);st.g.rotation.x+=dt*.12;}dust.rotation.z+=dt*.22;dust.material.opacity=.65*fade;return e.t<dur;},dispose:()=>{group.removeFromParent();dg.dispose();dust.material.dispose();group.traverse(o=>{if(o.isMesh&&o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}});
    return e;
  }

  /* Três mundos de jogo empilhados verticalmente. Cada camada tem leitura visual própria;
     a terceira é sempre o modo atual e funciona como destino da travessia. */
  modeWorldStack(from, target, modes, spacing = 130) {
    const root = new THREE.Group(); this.scene.add(root);
    const points = [], owned = [];
    const mat = (color, emissive = color, roughness = .82, metalness = .05) => {
      const m = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: .28, roughness, metalness }); owned.push(m); return m;
    };
    const add = (g, geoName, geometry, material, pos, scale, rot) => {
      const m = new THREE.Mesh(geo(geoName, geometry), material); m.position.copy(pos); if (scale) m.scale.copy(scale); if (rot) m.rotation.set(rot.x,rot.y,rot.z); g.add(m); return m;
    };
    const layers = modes.map((mode, i) => {
      const k=(i+1)/modes.length, center=from.clone().lerp(target,k); center.y=target.y+12+(modes.length-1-i)*spacing;
      points.push(center.clone());
      const g=new THREE.Group();g.position.copy(center);root.add(g);
      const base=mat(mode==='battle'?0x27334a:mode==='open'?0x315c42:0x263b52,mode==='battle'?0x152a55:mode==='open'?0x173d26:0x12324a);
      const edge=mat(mode==='battle'?0x6e9dff:mode==='open'?0x8acb82:0x57cfff,mode==='battle'?0x3e70ff:mode==='open'?0x3b8b50:0x2a8fc4,.36,.25);
      const dark=mat(0x151b2b,0x080d18,.62,.2), bright=mat(0xe5f3ff,0x8bcfff,.32,.15);
      add(g,'modeLayerDisk',()=>new THREE.CylinderGeometry(27,30,3,64),base,new THREE.Vector3(0,-2,0),null);
      const rim=add(g,'modeLayerRim',()=>new THREE.TorusGeometry(28,.42,10,96),edge,new THREE.Vector3(0,-.25,0));rim.rotation.x=Math.PI/2;
      if(mode==='battle'){
        const arena=add(g,'modeBattleFloor',()=>new THREE.CylinderGeometry(20,20,.35,64),dark,new THREE.Vector3(0,-.1,0));
        for(let j=0;j<4;j++){const a=j*Math.PI/2, x=Math.cos(a)*23,z=Math.sin(a)*23;add(g,'modeBattlePylon',()=>new THREE.CylinderGeometry(1.3,2.1,13,8),edge,new THREE.Vector3(x,6,z));const beam=add(g,'modeBattleBeam',()=>new THREE.CylinderGeometry(.09,.09,19,8),bright,new THREE.Vector3(x*.82,5,z*.82));beam.rotation.z=Math.PI/2;}
        const shield=add(g,'modeBattleShield',()=>new THREE.TorusGeometry(18,.12,8,96),bright,new THREE.Vector3(0,2,0));shield.rotation.x=Math.PI/2;
        for(let j=0;j<8;j++){const a=j*Math.PI/4;add(g,'modeBattleMark',()=>new THREE.BoxGeometry(4,.12,.35),edge,new THREE.Vector3(Math.cos(a)*13,.16,Math.sin(a)*13),null,{x:0,y:-a,z:0});}
      } else if(mode==='open'){
        add(g,'modeOpenHill',()=>new THREE.SphereGeometry(1,32,20),mat(0x47734b,0x1c4828),new THREE.Vector3(0,-1.3,0),new THREE.Vector3(25,5,25));
        const road=add(g,'modeOpenRoad',()=>new THREE.BoxGeometry(5,.22,38),dark,new THREE.Vector3(0,1,0));road.rotation.y=.18;
        for(let j=0;j<9;j++){const a=j*2.399,r=12+(j%3)*3,x=Math.cos(a)*r,z=Math.sin(a)*r;add(g,'modeOpenTreeTrunk',()=>new THREE.CylinderGeometry(.45,.7,5,7),dark,new THREE.Vector3(x,2,z));add(g,'modeOpenTreeCanopy',()=>new THREE.ConeGeometry(3.2,8,7),base,new THREE.Vector3(x,7,z));}
        const house=add(g,'modeOpenHouse',()=>new THREE.BoxGeometry(8,5,7),mat(0x8b7863,0x3b2b20),new THREE.Vector3(8,2,5));add(g,'modeOpenRoof',()=>new THREE.ConeGeometry(6,3,4),edge,new THREE.Vector3(8,6,5),null,{x:0,y:Math.PI/4,z:0});
        const lake=add(g,'modeOpenLake',()=>new THREE.CircleGeometry(7,40),mat(0x286c9c,0x164e8b,.25,.25),new THREE.Vector3(-12,.05,-7));lake.rotation.x=-Math.PI/2;
      } else {
        const grid=add(g,'modeTrainGrid',()=>new THREE.BoxGeometry(38,.24,38),dark,new THREE.Vector3(0,0,0));
        for(let j=-3;j<=3;j++){const line=add(g,'modeTrainLine',()=>new THREE.BoxGeometry(.12,.08,36),edge,new THREE.Vector3(j*5,.17,0));}
        for(let j=0;j<5;j++){const x=(j-2)*8,z=(j%2?8:-8);add(g,'modeTrainDummy',()=>new THREE.CylinderGeometry(.75,.95,4.5,12),base,new THREE.Vector3(x,2.6,z));add(g,'modeTrainHead',()=>new THREE.SphereGeometry(.8,16,12),bright,new THREE.Vector3(x,5.4,z));const targetRing=add(g,'modeTrainTarget',()=>new THREE.TorusGeometry(2.1,.16,8,32),edge,new THREE.Vector3(x,5.4,z));targetRing.rotation.y=Math.PI/2;}
        for(let j=0;j<2;j++){const goal=add(g,'modeTrainGoal',()=>new THREE.BoxGeometry(.35,7,.35),bright,new THREE.Vector3(j?18:-18,3.5,-15));}
      }
      const halo=add(g,'modeLayerHalo',()=>new THREE.TorusGeometry(31,.055,6,100),bright,new THREE.Vector3(0,0,0));halo.rotation.x=Math.PI/2;
      return {g,mode,halo};
    });
    const dustN=360,arr=new Float32Array(dustN*3);for(let i=0;i<dustN;i++){const k=Math.random(),p=from.clone().lerp(target,k);arr[i*3]=p.x+(Math.random()-.5)*70;arr[i*3+1]=p.y+(Math.random()-.5)*55;arr[i*3+2]=p.z+(Math.random()-.5)*70;}
    const dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(arr,3));const dustMat=new THREE.PointsMaterial({color:0xd8eaff,size:.28,transparent:true,opacity:.75,depthWrite:false});const dust=new THREE.Points(dg,dustMat);root.add(dust);
    return {root,points,layers,update:(t)=>{layers.forEach((l,i)=>{l.g.rotation.y=Math.sin(t*.35+i)*.045;l.halo.rotation.z=t*(i%2?-.12:.12);});dust.rotation.y=t*.025;},dispose:()=>{root.removeFromParent();dg.dispose();dustMat.dispose();owned.forEach(m=>m.dispose());}};
  }

  /* Revelação tridimensional de três camadas de realidade durante a carga da SUPERNOVA. */
  worldsReveal(getPos, dur = 5.4) {
    const group = new THREE.Group(), colors = [0x5b8cff, 0x9a5cff, 0xffa044], planets = [];
    colors.forEach((color, i) => {
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .48, roughness: .72, metalness: .12 });
      const sphere = new THREE.Mesh(geo('worldLensSphere' + i, () => new THREE.SphereGeometry(1, 28, 20)), mat); sphere.scale.setScalar(i === 2 ? 1.12 : .82); group.add(sphere);
      const ring = new THREE.Mesh(geo('worldLensRing' + i, () => new THREE.TorusGeometry(1.35, .018, 6, 72)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .75, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = .9 + i * .24; group.add(ring); planets.push({ sphere, ring, i });
    });
    const orbit = new THREE.Mesh(geo('worldLensOrbit', () => new THREE.TorusGeometry(4.2, .025, 6, 96)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false })); orbit.rotation.x = Math.PI / 2; group.add(orbit); this.scene.add(group);
    const e = this.add({ t: 0, update: dt => { const p = getPos(); if (!p) return false; group.position.copy(p).add(new THREE.Vector3(0, 1.2, 0)); const k = ss(e.t / .55) * (e.t > dur - .5 ? Math.max(0, (dur - e.t) / .5) : 1); group.scale.setScalar(.01 + 1.0 * k); planets.forEach(({ sphere, ring, i }) => { const a = e.t * (.7 + i * .12) + i * TAU / 3, r = 3.1 + i * .35; sphere.position.set(Math.cos(a) * r, Math.sin(a * 1.4) * .7, Math.sin(a) * r); sphere.rotation.y += dt * (.3 + i * .15); ring.position.copy(sphere.position); ring.rotation.z += dt * (.2 + i * .1); }); orbit.rotation.z += dt * .18; return e.t < dur; }, dispose: () => { group.removeFromParent(); for (const p of planets) { p.sphere.material.dispose(); p.ring.material.dispose(); } orbit.material.dispose(); } });
    return e;
  }

  /* ---------- CYBER: FLASH ÔMEGA — feixe de laser gigante que atravessa e destrói tudo ---------- */
  megaBeam(o, dir, len, R, dur, color) {
    const U = { uT: { value: 0 }, uO: { value: 0 }, uC: { value: new THREE.Color(color) } }, d = dir.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const g = geo('mbeam', () => { const c = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true); c.translate(0, .5, 0); return c; });
    const mk = (core) => new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: U,
      vertexShader: 'varying vec2 vUv;varying vec3 vN,vV;void main(){vUv=uv;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: NOISE + 'uniform float uT,uO;uniform vec3 uC;varying vec2 vUv;varying vec3 vN,vV;void main(){float f=abs(dot(normalize(vN),vV));float n=fbm(vec3(vUv.x*6.,vUv.y*40.-uT*30.,uT*2.));' +
        (core ? 'vec3 c=mix(uC*2.,vec3(1.),pow(f,1.5))*(1.2+n);float a=pow(f,1.2);' : 'vec3 c=uC*(.6+n*1.4);float a=pow(f,3.)*.8;') +
        'float fade=smoothstep(0.,.02,vUv.y)*smoothstep(1.,.8,vUv.y);gl_FragColor=vec4(c*a*fade*uO*1.6,1.);}' });
    const core = new THREE.Mesh(g, mk(true)), glow = new THREE.Mesh(g, mk(false)); glow.material.uniforms = U;
    for (const m of [core, glow]) { m.position.copy(o); m.quaternion.copy(q); m.renderOrder = 8; m.frustumCulled = false; this.scene.add(m); }
    // anéis de choque que correm pelo feixe
    const rings = []; for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(geo('mbRing', () => new THREE.TorusGeometry(1, .08, 8, 48)), new THREE.MeshBasicMaterial({ color, ...add, opacity: 1 })); r.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))); r.renderOrder = 8; this.scene.add(r); rings.push({ r, k: i / 6 }); }
    const fx = this.fx, end = o.clone().addScaledVector(d, len);
    fx.flash(o, 0xffffff, R * 5, .3); fx.flash(o, color, R * 9, .5); fx.ring(o.x, o.y, o.z, color, R * 4, .5);
    const e = this.add({ t: 0, update: dt => { const t = e.t; U.uT.value += dt; const k = t < .08 ? t / .08 : t > dur ? Math.max(0, 1 - (t - dur) / .35) : 1; U.uO.value = k;
      const w = R * k * (1 + Math.sin(t * 70) * .06); core.scale.set(w * .55, len, w * .55); glow.scale.set(w * 1.6, len, w * 1.6);
      for (const it of rings) { it.k = (it.k + dt * 1.8) % 1; it.r.position.copy(o).addScaledVector(d, it.k * len); it.r.scale.setScalar(R * (1.1 + it.k * 1.2) * k); it.r.material.opacity = (1 - it.k) * k; }
      if (t < dur) { for (let i = 0; i < 6; i++) { const p = o.clone().addScaledVector(d, Math.random() * len); fx.emit(p.x, p.y, p.z, 1, { color: [.8, .95, 1], speed: 6, up: 1, life: .45, size: .25, grav: 0 }); }
        if (Math.random() < .5) fx.flash(end, color, R * 3, .12); }
      return t < dur + .4; }, dispose: () => { for (const m of [core, glow]) { m.removeFromParent(); } core.material.dispose(); glow.material.dispose(); for (const it of rings) { it.r.removeFromParent(); it.r.material.dispose(); } } });
    return e;
  }
  /* EXTINÇÃO SOLAR: estrela procedural com superfície turbulenta, corona e anéis de plasma */
  solarStar(pos, radius = 8, dur = 3.2, color = 0xff8b2e) {
    const group = new THREE.Group(); group.position.copy(pos); this.scene.add(group);
    const T = { value: 0 }, C = new THREE.Color(color);
    const coreMat = new THREE.ShaderMaterial({ uniforms: { uT: T, uC: { value: C } }, vertexShader: 'varying vec3 vP;varying vec3 vN;void main(){vP=position;vN=normalize(normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: NOISE + 'uniform float uT;uniform vec3 uC;varying vec3 vP;varying vec3 vN;void main(){float n=fbm(vP*5.2+vec3(0.,uT*.22,uT*.08));float bands=.78+.22*sin(vP.y*34.+n*9.-uT*2.);float hot=smoothstep(.28,.78,n);vec3 c=mix(vec3(1.,.16,.015),vec3(1.,.88,.48),hot);c=mix(c,uC, .24);float limb=.72+.28*max(0.,dot(normalize(vN),vec3(.2,.5,1.)));gl_FragColor=vec4(c*(1.15+n*.9)*bands*limb,1.);}' });
    const core = new THREE.Mesh(geo('solarCore', () => new THREE.SphereGeometry(1, 56, 40)), coreMat); group.add(core);
    const coronaMat = new THREE.ShaderMaterial({ ...add, side: THREE.BackSide, uniforms: { uT: T, uC: { value: C } },
      vertexShader: 'varying vec3 vN;varying vec3 vV;void main(){vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: NOISE + 'uniform float uT;uniform vec3 uC;varying vec3 vN;varying vec3 vV;void main(){float f=pow(1.-abs(dot(normalize(vN),normalize(vV))),1.7);float n=fbm(vN*7.+uT*.8);float pulse=.72+.28*sin(uT*5.+n*8.);vec3 c=mix(vec3(1.,.25,.035),uC*1.8,n);gl_FragColor=vec4(c*(f*2.4+.12)*pulse,f*.8+.12);}' });
    const corona = new THREE.Mesh(geo('solarCorona', () => new THREE.SphereGeometry(1.18, 48, 32)), coronaMat); group.add(corona);
    const rings = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(geo('solarRing' + i, () => new THREE.TorusGeometry(1.3 + i * .17, .012 + i * .004, 8, 96)), new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffe1a0 : color, transparent: true, opacity: .72, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.set(.5 + i * .8, .3 + i * .65, i * .55); group.add(m); rings.push(m); }
    const light = new THREE.PointLight(0xffa34a, 26, radius * 14, 2); group.add(light);
    const fx = this.fx; fx.flash(pos, 0xffffff, radius * 1.8, .42); fx.flash(pos, color, radius * 2.8, .7);
    const e = this.add({ t: 0, update: dt => { T.value += dt; const k = ss(e.t / .35) * (e.t > dur - .45 ? Math.max(0, 1 - (e.t - (dur - .45)) / .45) : 1); group.scale.setScalar(radius * (.97 + .035 * Math.sin(e.t * 4.2)) * (.75 + .25 * k)); group.rotation.y += dt * .16; corona.rotation.y -= dt * .22; rings.forEach((m, i) => { m.rotation.x += dt * (i % 2 ? -.3 : .22); m.rotation.z += dt * (.35 + i * .12); m.material.opacity = .38 + .25 * Math.sin(e.t * 3 + i); }); if (Math.random() < .8) { const a = Math.random() * TAU, h = (Math.random() - .5) * 2, rr = radius * (1.1 + Math.random() * .25); fx.emit(pos.x + Math.cos(a) * rr, pos.y + h * radius * .55, pos.z + Math.sin(a) * rr, 1, { color: [1, .58, .2], speed: 2.2, up: 0, life: .45, size: .18, grav: 0, dir: [Math.cos(a) * 2, h, Math.sin(a) * 2], spread: .3 }); } return e.t < dur; }, dispose: () => { group.removeFromParent(); coreMat.dispose(); coronaMat.dispose(); for (const m of rings) m.material.dispose(); } });
    return e;
  }

  /* energia sendo sugada para a mão antes de um disparo */
  charge(getPos, dur, color) {
    const c = new THREE.Color(color), fx = this.fx;
    const e = this.add({ t: 0, update: dt => { const p = getPos(); if (!p || e.t > dur) return false; for (let i = 0; i < 5; i++) { const a = Math.random() * TAU, b = Math.random() * Math.PI, rr = 2.5 + Math.random(), x = p.x + Math.cos(a) * Math.sin(b) * rr, y = p.y + Math.cos(b) * rr, z = p.z + Math.sin(a) * Math.sin(b) * rr;
      fx.emit(x, y, z, 1, { color: [c.r * .5 + .5, c.g * .5 + .5, c.b * .5 + .5], speed: .1, up: 0, life: .35, size: .14, grav: 0, dir: [(p.x - x) * 2.8, (p.y - y) * 2.8, (p.z - z) * 2.8], spread: .02 }); }
      if (Math.random() < .5) fx.flash(p, color, .6 + Math.random() * .8, .1); return true; } }); return e;
  }
  /* ---------- CYBER: SUPERNOVA — estrela que se comprime e explode ---------- */
  supernova(pos, R, color, onBoom) {
    const fx = this.fx, U = { uT: { value: 0 }, uO: { value: 1 }, uC: { value: new THREE.Color(color) } };
    const star = new THREE.Mesh(geo('nvS', () => new THREE.SphereGeometry(1, 48, 32)), new THREE.ShaderMaterial({ uniforms: U, vertexShader: 'varying vec3 vP,vN,vV;void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: NOISE + 'uniform float uT;uniform vec3 uC;varying vec3 vP,vN,vV;void main(){float n=fbm(vP*3.+uT*2.);float f=pow(1.-abs(dot(vN,vV)),2.);gl_FragColor=vec4(mix(vec3(1.,.95,.8),uC*2.,n)*1.6+uC*f*2.,1.);}' }));
    star.position.copy(pos); star.scale.setScalar(.01); this.scene.add(star);
    const shell = new THREE.Mesh(geo('nvS', () => new THREE.SphereGeometry(1, 48, 32)), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: U, vertexShader: 'varying vec3 vP,vN,vV;void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader: NOISE + 'uniform float uT,uO;uniform vec3 uC;varying vec3 vP,vN,vV;void main(){float f=pow(1.-abs(dot(vN,vV)),1.5);float n=fbm(vP*4.-uT*3.);vec3 c=mix(uC*1.5,vec3(1.,.8,.5),n)*(f*1.6+.15)*(.6+n);gl_FragColor=vec4(c*uO,1.);}' }));
    shell.position.copy(pos); shell.visible = false; shell.renderOrder = 8; this.scene.add(shell);
    let boom = false;
    const e = this.add({ t: 0, update: dt => { const t = e.t; U.uT.value += dt;
      if (t < 1) { star.scale.setScalar(Math.max(1.6, R * .16) * Math.sin(Math.min(1, t * 1.3) * Math.PI * .5) * (1 - ss((t - .8) / .2) * .7)); for (let i = 0; i < 8; i++) { const a = Math.random() * TAU, rr = R * .7, x = pos.x + Math.cos(a) * rr, z = pos.z + Math.sin(a) * rr, y = pos.y + (Math.random() - .3) * rr * .6; fx.emit(x, y, z, 1, { color: [1, .8, .5], speed: .1, up: 0, life: .5, size: .22, grav: 0, dir: [(pos.x - x) * 2, (pos.y - y) * 2, (pos.z - z) * 2], spread: .02 }); } return true; }
      if (!boom) { boom = true; star.visible = false; shell.visible = true; fx.flash(pos, 0xffffff, R * 2, .5); fx.flash(pos, color, R * 3, .9); fx.ring(pos.x, pos.y - 1.4, pos.z, 0xffffff, R * 1.2, .6); fx.ring(pos.x, pos.y - 1.4, pos.z, color, R * 1.9, 1.1);
        fx.emit(pos.x, pos.y, pos.z, 260, { color: [1, .75, .4], speed: R * 1.6, up: 2, life: 1.1, size: .35, grav: 0 }); fx.puff(pos.x, pos.y - 1, pos.z, 60, { r: 2, speed: R, up: 1, size: 3, life: 1.8, color: [.4, .3, .3] }); if (onBoom) onBoom(); }
      const k = (t - 1) / 1.3; shell.scale.setScalar(R * (1 - Math.pow(1 - Math.min(1, k), 3))); SOFT.nova(pos, shell.scale.x, Math.min(5, R * .08) * (1 - Math.min(1, k)), Math.max(1.5, R * .06)); U.uO.value = Math.max(0, 1 - k); return k < 1; },
      dispose: () => { for (const m of [star, shell]) { m.removeFromParent(); m.material.dispose(); } } });
    return e;
  }
  /* ---------- NEXUS: VELOCIDADE ABSOLUTA — rasgo luminoso no tecido do universo ---------- */
  rift(getPos, collect, color = 0x9a5cff) {
    const core = new Ribbon(90, .55, 0xffffff, 1), glow = new Ribbon(90, 2.6, color, .9), dark = new Ribbon(90, 1.3, 0x220044, .9); this.scene.add(glow.mesh, dark.mesh, core.mesh);
    const pts = []; let last = null; const fx = this.fx;
    const e = this.add({ t: 0, update: dt => { const t = e.t;
      if (t < collect) { const p = getPos(); if (p) { p.y += 1.5; if (!last || last.distanceTo(p) > .5) { const q = p.clone(); q.x += (Math.random() - .5) * .5; q.y += (Math.random() - .5) * .7; q.z += (Math.random() - .5) * .5; pts.push(q); if (pts.length > 90) pts.shift(); last = p; } } }
      if (pts.length > 1) { core.set(pts, this.cam.position, false); glow.set(pts, this.cam.position, false); dark.set(pts, this.cam.position, false); }
      const o = t < collect ? 1 : Math.max(0, 1 - (t - collect) / 1.6); core.U.uO.value = o * (.8 + Math.random() * .4); glow.U.uO.value = .9 * o; dark.U.uO.value = .9 * o;
      if (pts.length && Math.random() < .6 * o) { const p = pts[(Math.random() * pts.length) | 0]; fx.emit(p.x, p.y, p.z, 2, { color: [.8, .6, 1], speed: 2, up: 0, life: .5, size: .15, grav: 0 }); }
      return t < collect + 1.6; }, dispose: () => { core.dispose(); glow.dispose(); dark.dispose(); } });
    return e;
  }
  /* ---------- LUZ DE CINEMA: flare anamórfico horizontal + raios volumétricos + halo + brilho do núcleo, sempre virado para a câmera ---------- */
  cinemaLight(getPos, dur, color = 0xffffff, size = 6, opt = {}) {
    const U = { uT: { value: Math.random() * 10 }, uO: { value: 0 }, uC: { value: new THREE.Color(color) }, uK: { value: opt.streak == null ? 1 : opt.streak } };
    const m = new THREE.Mesh(geo('cinePl', () => new THREE.PlaneGeometry(2, 2)), new THREE.ShaderMaterial({ ...add, depthTest: false, uniforms: U, vertexShader: VS_UV,
      fragmentShader: 'uniform float uT,uO,uK;uniform vec3 uC;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);' +
        'float core=exp(-r*r*16.)*1.6+exp(-r*5.5)*.32;' +
        'float sh=exp(-abs(p.y)*42.)*exp(-abs(p.x)*1.7)*uK*1.5*smoothstep(1.,.6,abs(p.x));' +
        'float sv=exp(-abs(p.x)*60.)*exp(-abs(p.y)*5.)*.45*smoothstep(1.,.6,abs(p.y));' +
        'float rays=pow(abs(sin(a*7.+uT*.9)*sin(a*13.-uT*.6)),3.)*exp(-r*2.6)*.8;' +
        'float halo=smoothstep(.05,0.,abs(r-.58))*.3+smoothstep(.03,0.,abs(r-.82))*.16;' +
        'vec3 c=uC*(core*.8+sh+sv*.7+rays+halo)+vec3(1.)*core*.85+vec3(.25,.55,1.)*sh*.6+vec3(1.,.5,.2)*halo*.4;' +
        'float fl=1.+.12*sin(uT*47.)+.06*sin(uT*91.);gl_FragColor=vec4(c*fl*uO*smoothstep(1.,.82,r),1.);}' }));
    m.renderOrder = 12; m.frustumCulled = false; this.scene.add(m);
    const e = this.add({ t: 0, update: dt => { const p = getPos(); if (!p) return false; U.uT.value += dt; const t = e.t, k = ss(t / .12) * (1 - ss((t - (dur - .35)) / .35));
      const dc = p.distanceTo(this.cam.position); U.uO.value = k * (opt.gain || 1) * (.12 + .88 * ss((dc - 3) / 10)); m.position.copy(p); m.quaternion.copy(this.cam.quaternion); m.scale.setScalar(size * (.75 + .25 * k)); return t < dur; }, dispose: () => { m.removeFromParent(); m.material.dispose(); } });
    return e;
  }
  /* ---------- TÚNEL ESPAÇO-TEMPO: riscos de estrelas em velocidade absurda + portais-relógio que passam voando ---------- */
  warp(getPos, getDir, dur, color = 0x9a5cff, speedK = 1) {
    const N = 460, base = new THREE.PlaneGeometry(1, 1), g = new THREE.InstancedBufferGeometry(); g.index = base.index; g.setAttribute('position', base.attributes.position);
    const sd = new Float32Array(N * 4); for (let i = 0; i < sd.length; i++) sd[i] = Math.random(); g.setAttribute('sd', new THREE.InstancedBufferAttribute(sd, 4)); g.instanceCount = N;
    const T = { value: 0 }, O = { value: 0 }, SP = { value: 0 }, P = { value: new THREE.Vector3() }, D = { value: new THREE.Vector3(0, 0, 1) }, UP = { value: new THREE.Vector3(0, 1, 0) }, SI = { value: new THREE.Vector3(1, 0, 0) };
    const mat = new THREE.ShaderMaterial({ ...add, uniforms: { uT: T, uO: O, uSp: SP, uP: P, uD: D, uUp: UP, uSi: SI, uC: { value: new THREE.Color(color) }, uAsp: { value: new THREE.Vector2(1, 1) }, uPW: { value: .005 } },
      vertexShader: 'attribute vec4 sd;uniform float uT,uSp,uO,uPW;uniform vec2 uAsp;uniform vec3 uP,uD,uUp,uSi;varying float vA,vC;void main(){float L=300.;float al=L*.5-mod(sd.z*L+uT*uSp,L);float an=sd.x*6.2831853+uT*.2;float rd=2.5+pow(sd.y,1.5)*46.;' +
        'vec3 head=uP+uD*al+(uSi*cos(an)+uUp*sin(an))*rd;float len=(2.+uSp*.05)*(.5+sd.w);vec3 tail=head+uD*len;vec4 h=projectionMatrix*viewMatrix*vec4(head,1.),t=projectionMatrix*viewMatrix*vec4(tail,1.);' +
        'vA=smoothstep(L*.5,L*.18,al)*smoothstep(-L*.5,-L*.15,al)*(.35+.65*sd.w)*uO;vC=sd.y;if(h.w<.1||t.w<.1){gl_Position=vec4(2.,2.,2.,1.);return;}' +
        'vec2 a=h.xy/h.w,b=t.xy/t.w;vec2 dr=(b-a)*uAsp;float dl=length(dr);dr=dl>1e-5?dr/dl:vec2(1.,0.);vec2 pr=vec2(-dr.y,dr.x)/uAsp;float x=position.x+.5;vec2 ps=mix(a,b,x)+pr*position.y*uPW;' +
        'float w=mix(h.w,t.w,x);float z=mix(h.z/h.w,t.z/t.w,x);vA*=mix(1.,.15,x);gl_Position=vec4(ps*w,z*w,w);}',
      fragmentShader: 'uniform vec3 uC;varying float vA,vC;void main(){vec3 c=mix(vec3(1.),uC,.3+.7*vC);gl_FragColor=vec4(c*vA*1.5,1.);}' });
    const streaks = new THREE.Mesh(g, mat); streaks.frustumCulled = false; streaks.renderOrder = 6; this.scene.add(streaks);
    // portais-relógio (anéis com marcas e ponteiros girando ao contrário) passando em alta velocidade
    const GN = 7, gates = [], gq = new THREE.Quaternion(), z0 = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < GN; i++) {
      const U = { uT: T, uO: { value: 0 }, uC: { value: new THREE.Color(color) } };
      const m = new THREE.Mesh(geo('cinePl', () => new THREE.PlaneGeometry(2, 2)), new THREE.ShaderMaterial({ ...add, side: THREE.DoubleSide, uniforms: U, vertexShader: VS_UV,
        fragmentShader: 'uniform float uT,uO;uniform vec3 uC;varying vec2 vUv;void main(){vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);float ring=smoothstep(.035,0.,abs(r-.93))+smoothstep(.02,0.,abs(r-.75))*.7;' +
          'float tk=step(.78,fract(a*12./6.2832))*smoothstep(.035,0.,abs(r-.84));float a1=uT*7.,a2=-uT*1.3;' +
          'float h1=step(abs(p.x*sin(a1)-p.y*cos(a1)),.012)*step(0.,dot(p,vec2(cos(a1),sin(a1))))*step(r,.68);float h2=step(abs(p.x*sin(a2)-p.y*cos(a2)),.02)*step(0.,dot(p,vec2(cos(a2),sin(a2))))*step(r,.46);' +
          'float c=ring+tk*.9+h1+h2*.8+exp(-r*r*1.4)*.1;gl_FragColor=vec4((uC*c+vec3(1.)*ring*.35)*uO*step(r,1.),1.);}' }));
      m.frustumCulled = false; m.renderOrder = 5; this.scene.add(m); gates.push({ m, U, ph: i / GN, sc: 12 + (i % 3) * 5 });
    }
    const cam = this.cam, up0 = new THREE.Vector3(0, 1, 0), dd = new THREE.Vector3(), tmp = new THREE.Vector3();
    const e = this.add({ t: 0, update: dt => { const p = getPos(), d = getDir(); if (!p || !d) return false; const t = e.t, k = ss(t / .3) * (1 - ss((t - (dur - .35)) / .35));
      T.value += dt; O.value = k; SP.value = 330 * speedK * (.6 + .4 * k); P.value.copy(p); dd.copy(d).normalize(); D.value.copy(dd); SI.value.crossVectors(dd, up0); if (SI.value.lengthSq() < 1e-4) SI.value.set(1, 0, 0); SI.value.normalize(); UP.value.crossVectors(SI.value, dd).normalize();
      mat.uniforms.uAsp.value.set(cam.aspect, 1); mat.uniforms.uPW.value = 2.6 * 2 / Math.max(300, innerHeight);
      gq.setFromUnitVectors(z0, dd);
      for (const gt of gates) { const al = 150 - ((gt.ph * 180 + T.value * SP.value * .6) % 180); tmp.copy(p).addScaledVector(dd, al); gt.m.position.copy(tmp); gt.m.quaternion.copy(gq); gt.m.scale.setScalar(gt.sc * (1 + Math.max(0, -al) * .01));
        gt.U.uO.value = k * smoothstepJS(150, 60, al) * smoothstepJS(-30, 2, al) * .9; }
      return t < dur; }, dispose: () => { streaks.removeFromParent(); g.dispose(); mat.dispose(); for (const gt of gates) { gt.m.removeFromParent(); gt.m.material.dispose(); } } });
    return e;
  }
  /* marcas de queimado no chão (rastro do feixe / cratera da supernova) */
  scorch(pts, r, life = 10) {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, uniforms: { uO: { value: 1 } }, vertexShader: VS_UV,
      fragmentShader: 'uniform float uO;varying vec2 vUv;void main(){float d=length(vUv-.5)*2.;if(d>1.)discard;float a=smoothstep(1.,.35,d);vec3 c=mix(vec3(.03,.02,.02),vec3(1.,.45,.1)*2.5,smoothstep(.55,1.,uO)*smoothstep(.15,.8,d)*(1.-d)*3.);gl_FragColor=vec4(c,a*.85*min(1.,uO*3.));}' });
    const g = geo('scorch', () => { const p = new THREE.PlaneGeometry(2, 2); p.rotateX(-Math.PI / 2); return p; });
    const ms = pts.map(p => { const m = new THREE.Mesh(g, mat); m.position.set(p.x, p.y + .07, p.z); m.scale.setScalar(r * (.8 + Math.random() * .5)); m.rotation.y = Math.random() * 6; m.renderOrder = 2; this.scene.add(m); return m; });
    const e = this.add({ t: 0, update: dt => { mat.uniforms.uO.value = Math.max(0, 1 - e.t / life); return e.t < life; }, dispose: () => { ms.forEach(m => m.removeFromParent()); mat.dispose(); } });
    return e;
  }
  /* plasma do laser do Cyber: anéis girando em volta do feixe */
  plasmaMuzzle(p, dir, color) {
    this.fx.flash(p, color, 1.1, .14); this.fx.emit(p.x, p.y, p.z, 16, { color: [.6, .95, 1], speed: 5, up: 0, life: .22, size: .1, dir: [dir.x * 2, dir.y * 2, dir.z * 2], spread: .7, grav: 0 });
  }
}
