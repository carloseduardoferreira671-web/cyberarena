/* CyberRig — esqueleto, animações e renderizador com skinning do Cyber.
   Espaço do modelo: Y para cima, o personagem olha para +Z, direita do personagem = -X.
   Rotações dos ossos em graus, ordem Y·X·Z, sempre relativas ao osso pai (pose de repouso = rotação zero).
   Convenções (osso apontando para baixo, como braços e pernas):
     X negativo = levantar para frente | X positivo = levar para trás
     Z positivo = abrir para +X (braço esquerdo abre com Z+, braço direito com Z-)
     Y positivo = girar o corpo para a esquerda do personagem
   Sem dependências externas. */
(function (global) {
'use strict';

/* ---------------- matemática ---------------- */
const D2R = Math.PI / 180;
function qmul(a, b) {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
          a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}
function eulerQ(x, y, z) {               // ordem Y·X·Z
  const hx = x*D2R/2, hy = y*D2R/2, hz = z*D2R/2;
  return qmul(qmul([0, Math.sin(hy), 0, Math.cos(hy)], [Math.sin(hx), 0, 0, Math.cos(hx)]), [0, 0, Math.sin(hz), Math.cos(hz)]);
}
function qMat(q, t, o) {
  const x=q[0], y=q[1], z=q[2], w=q[3], xx=x*x, yy=y*y, zz=z*z, xy=x*y, xz=x*z, yz=y*z, wx=w*x, wy=w*y, wz=w*z;
  o[0]=1-2*(yy+zz); o[1]=2*(xy+wz);   o[2]=2*(xz-wy);   o[3]=0;
  o[4]=2*(xy-wz);   o[5]=1-2*(xx+zz); o[6]=2*(yz+wx);   o[7]=0;
  o[8]=2*(xz+wy);   o[9]=2*(yz-wx);   o[10]=1-2*(xx+yy);o[11]=0;
  o[12]=t[0]; o[13]=t[1]; o[14]=t[2]; o[15]=1; return o;
}
function mmul(a, b, o) {                 // o = a·b (colunas), o não pode ser a nem b
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  } return o;
}
function perspective(fovy, asp, n, f) {
  const t = 1/Math.tan(fovy/2), nf = 1/(n-f);
  return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*nf,-1, 0,0,2*f*n*nf,0]);
}
function lookAt(e, c, u) {
  let zx=e[0]-c[0], zy=e[1]-c[1], zz=e[2]-c[2]; const zl = Math.hypot(zx,zy,zz)||1; zx/=zl; zy/=zl; zz/=zl;
  let xx=u[1]*zz-u[2]*zy, xy=u[2]*zx-u[0]*zz, xz=u[0]*zy-u[1]*zx; const xl = Math.hypot(xx,xy,xz)||1; xx/=xl; xy/=xl; xz/=xl;
  const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
  return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xy*e[1]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]);
}
function modelMat(x, y, z, yawDeg, s) {  // translação + giro em Y + escala uniforme
  const c = Math.cos(yawDeg*D2R)*s, si = Math.sin(yawDeg*D2R)*s;
  return new Float32Array([c,0,-si,0, 0,s,0,0, si,0,c,0, x,y,z,1]);
}

/* ---------------- esqueleto ---------------- */
let SK = null;                           // preenchido ao carregar cyber.json
const BASE = {};                         // pose-base (postura de combate relaxada)
function mir(a) { return [a[0], -a[1], -a[2]]; }
function setupBase(names) {
  const set = (n, v) => { BASE[n] = v; };
  names.forEach(n => set(n, [0,0,0]));
  set('spine',[4,0,0]); set('chest',[2,0,0]); set('head',[-4,0,0]);
  const L = {uarm:[-6,0,8], farm:[-22,0,0], hand:[-6,0,0], thigh:[-3,0,3], shin:[7,0,0], foot:[-3,0,0]};
  for (const k in L) { set(k+'_L', L[k]); set(k+'_R', mir(L[k])); }
}

/* ---------------- animação ---------------- */
const EASE = { ease: u => u*u*(3-2*u), out: u => 1-Math.pow(1-u,3), snap: u => 1-Math.pow(1-u,5), in: u => u*u*u, lin: u => u };
const lerp3 = (a, b, f) => [a[0]+(b[0]-a[0])*f, a[1]+(b[1]-a[1])*f, a[2]+(b[2]-a[2])*f];

function mirrorPose(p) {                 // espelha esquerda/direita
  const o = {};
  for (const n in p) {
    const m = n.endsWith('_R') ? n.slice(0,-2)+'_L' : n.endsWith('_L') ? n.slice(0,-2)+'_R' : n;
    o[m] = (n === 'root' || n === 'r') ? [-p[n][0], p[n][1], p[n][2]] : mir(p[n]);
  }
  return o;
}

// pose de corrida (ciclo procedural). ph em radianos; amp = intensidade.
function runPose(ph, amp, out) {
  const s = Math.sin(ph), c = Math.cos(ph), a = amp;
  const leg = (f, cc, side) => {
    const th = -(38*f) - 4, sh = 14 + 66*Math.pow(Math.max(0, cc), 1.2);
    out['thigh_'+side] = [th*a + BASE['thigh_'+side][0]*(1-a), 0, side==='L'?3:-3];
    out['shin_'+side]  = [sh*a, 0, 0];
    out['foot_'+side]  = [-(th+sh)*0.55*a, 0, 0];
    out['toe_'+side]   = [0,0,0];
  };
  leg(s, c, 'R'); leg(-s, -c, 'L');
  out.uarm_R = [(34*s-6)*a, 0, -10]; out.uarm_L = [(-34*s-6)*a, 0, 10];
  out.farm_R = [-72+16*s, 0, 0];     out.farm_L = [-72-16*s, 0, 0];
  out.spine = [12*a, 0, 0]; out.chest = [4*a, -14*s*a, 0]; out.pelvis = [0, 8*s*a, 0]; out.head = [-10*a, 6*s*a, 0];
  out.root = [0.015*s*a, (-0.04*Math.cos(2*ph) - 0.02)*a, 0];
}

function pwl(pts, t) {                   // curva linear por partes [[t,w],...]
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length-1; i++) if (t < pts[i+1][0]) { const u = (t-pts[i][0])/(pts[i+1][0]-pts[i][0]); return pts[i][1]+(pts[i+1][1]-pts[i][1])*u; }
  return pts[pts.length-1][1];
}

function makeClip(dur, keys, opts) {
  opts = opts || {};
  const tracks = {};
  const add = (n, t, v, e) => (tracks[n] = tracks[n] || []).push({t, v, e: e || 'ease'});
  for (const k of keys) {
    if (k.p) for (const n in k.p) add(n, k.t, k.p[n], k.e);
    if (k.r) add('root', k.t, k.r, k.e);
  }
  for (const n in tracks) {
    const a = tracks[n].sort((x, y) => x.t - y.t), base = n === 'root' ? [0,0,0] : (BASE[n] || [0,0,0]);
    if (a[0].t > 0) a.unshift({t:0, v:base, e:'ease'});
    if (!opts.hold && a[a.length-1].t < dur) a.push({t:dur, v:base, e:'ease'});
  }
  return {
    dur, loop: !!opts.loop, hold: !!opts.hold, events: (opts.events || []).slice().sort((a,b)=>a.t-b.t),
    rootMotion: !!opts.rootMotion, run: opts.run || null, runAmp: opts.runAmp || 1, runPeriod: opts.runPeriod || 0.62,
    eval(t, out) {
      for (const n in BASE) out[n] = BASE[n].slice();
      out.root = [0,0,0];
      for (const n in tracks) {
        const a = tracks[n];
        if (t >= a[a.length-1].t) { out[n] = a[a.length-1].v.slice(); continue; }
        let i = 0; while (i < a.length-1 && t >= a[i+1].t) i++;
        const u = (t - a[i].t) / (a[i+1].t - a[i].t);
        out[n] = lerp3(a[i].v, a[i+1].v, EASE[a[i+1].e](Math.min(1, Math.max(0, u))));
      }
      if (opts.run) {
        const w = pwl(opts.run, t);
        if (w > 0.001) {
          const rp = {}; runPose(2*Math.PI*t/this.runPeriod, this.runAmp, rp);
          for (const n in rp) { const cur = out[n] || (n==='root'?[0,0,0]:BASE[n]||[0,0,0]); out[n] = lerp3(cur, rp[n], w); }
        }
      }
    }
  };
}

const CLIPS = {};
function buildClips() {
  /* ---- idle (respiração, loop) ---- */
  CLIPS.idle = { dur: 2.6, loop: true, events: [], eval(t, out) {
    for (const n in BASE) out[n] = BASE[n].slice();
    const s = Math.sin(t/2.6*2*Math.PI);
    out.chest = [2+2.2*s, 0, 0]; out.spine = [4+1.2*s, 0, 0]; out.head = [-4-1.6*s, 0, 0];
    out.uarm_L = [-6+1.5*s, 0, 8+1*s]; out.uarm_R = [-6+1.5*s, 0, -8-1*s];
    out.root = [0, -0.012*s - 0.02, 0];
    out.shin_L = [8, 0, 0]; out.shin_R = [8, 0, 0]; out.thigh_L = [-4, 0, 3]; out.thigh_R = [-4, 0, -3];
  }};

  /* ---- corrida (loop) ---- */
  CLIPS.run = { dur: 0.62, loop: true, events: [{t:0.0,name:'step'},{t:0.31,name:'step'}], eval(t, out) {
    for (const n in BASE) out[n] = BASE[n].slice(); runPose(2*Math.PI*t/0.62, 1, out);
  }};

  /* ---- soco direito (ataque básico) ---- */
  const punchR = {
    0.12: { p:{ pelvis:[0,-10,0], spine:[10,-22,0], chest:[4,-18,0], head:[-4,10,0],
               uarm_R:[40,0,6], farm_R:[-115,0,0], hand_R:[0,0,0], uarm_L:[-35,0,12], farm_L:[-100,0,0],
               thigh_L:[-20,0,5], shin_L:[25,0,0], thigh_R:[14,0,-6], shin_R:[28,0,0] }, r:[0,-0.06,-0.03] },
    0.21: { e:'snap', p:{ pelvis:[0,14,0], spine:[6,24,0], chest:[2,22,0], head:[-2,-16,0],
               uarm_R:[-88,0,10], farm_R:[-8,0,0], hand_R:[-6,0,0], uarm_L:[20,0,10], farm_L:[-120,0,0],
               thigh_L:[-32,0,5], shin_L:[38,0,0], thigh_R:[18,0,-6], shin_R:[20,0,0] }, r:[0,-0.05,0.18] },
    0.32: { p:{ pelvis:[0,12,0], spine:[6,22,0], chest:[2,20,0], head:[-2,-14,0],
               uarm_R:[-84,0,10], farm_R:[-12,0,0], uarm_L:[20,0,10], farm_L:[-120,0,0],
               thigh_L:[-30,0,5], shin_L:[36,0,0], thigh_R:[18,0,-6], shin_R:[20,0,0] }, r:[0,-0.05,0.17] },
  };
  const keysOf = o => Object.keys(o).map(t => Object.assign({t: +t}, o[t]));
  CLIPS.punch_R = makeClip(0.58, keysOf(punchR), { events: [{t:0.21, name:'hit', arm:'R'}] });
  const mirKeys = ks => ks.map(k => ({t:k.t, e:k.e, p:mirrorPose(k.p), r:k.r ? [-k.r[0],k.r[1],k.r[2]] : null}));
  CLIPS.punch_L = makeClip(0.58, mirKeys(keysOf(punchR)), { events: [{t:0.21, name:'hit', arm:'L'}] });
  CLIPS.punch_R2 = makeClip(0.7, keysOf(punchR).map(k => ({ t:k.t*1.15, e:k.e, p:Object.assign({}, k.p, k.p.spine ? {spine:[k.p.spine[0]+4, k.p.spine[1]*1.25, 0]} : {}), r:k.r ? [k.r[0],k.r[1]*1.4,k.r[2]*1.3] : null })),
                             { events: [{t:0.21*1.15, name:'hit', arm:'R', heavy:true}] });

  /* ---- gerador de rajadas de laser alternadas (R, L, R, L...) ---- */
  function laserKeys(t0, n, gap) {
    const keys = [], ev = [];
    for (let k = 0; k < n; k++) {
      const tk = t0 + k*gap, side = k % 2 === 0 ? 'R' : 'L';
      const prep = { ['uarm_'+side]:[-60,0,0], ['farm_'+side]:[-70,0,0], ['hand_'+side]:[0,0,0] };
      const fire = { ['uarm_'+side]:[-88,0,0], ['farm_'+side]:[-4,0,0], ['hand_'+side]:[0,0,0],
                     chest:[2,(side==='R'?3:-3),0], spine:[5,(side==='R'?2:-2),0], head:[-3,(side==='R'?-3:3),0] };
      const rec  = { ['uarm_'+side]:[-80,0,0], ['farm_'+side]:[-14,0,0], chest:[0,(side==='R'?2:-2),0], spine:[1,(side==='R'?1:-1),0] };
      keys.push({t:tk-0.20, p:prep}, {t:tk, e:'out', p:fire}, {t:tk+0.07, e:'out', p:rec});
      ev.push({t:tk, name:'laser_'+side, index:k});
    }
    return { keys, ev };
  }
  const stance = { thigh_L:[-14,0,5], shin_L:[20,0,0], thigh_R:[8,0,-5], shin_R:[20,0,0], pelvis:[0,0,0] };

  /* ---- laser (habilidade): braço direito, depois esquerdo ---- */
  { const L = laserKeys(0.32, 2, 0.42);
    const keys = L.keys.concat([{t:0.06, p:stance, r:[0,-0.04,0]}, {t:1.2, p:stance, r:[0,-0.04,0]}]);
    CLIPS.laser = makeClip(1.4, keys, { events: L.ev }); }

  /* ---- super contra UM alvo: avança, soco que lança para cima, 4 lasers alternados ---- */
  { const L = laserKeys(1.75, 4, 0.34);
    const keys = [
      { t:0.22, p:{ spine:[16,-8,0], chest:[8,-6,0], head:[-14,0,0], thigh_L:[-30,0,0], shin_L:[34,0,0], thigh_R:[16,0,0], shin_R:[44,0,0],
                    uarm_R:[34,0,6], farm_R:[-110,0,0] }, r:[0,-0.1,0] },
      { t:0.62, p:{ spine:[14,0,0], chest:[6,0,0], head:[-14,0,0], uarm_R:[34,0,6], farm_R:[-110,0,0] }, r:[0,-0.05,1.3] },
      { t:0.88, e:'out', p:{ pelvis:[0,-18,0], spine:[18,-24,0], chest:[8,-20,0], head:[-10,12,0],
                    thigh_L:[-34,0,0], shin_L:[52,0,0], thigh_R:[22,0,0], shin_R:[60,0,0],
                    uarm_R:[58,0,-14], farm_R:[-30,0,0], hand_R:[10,0,0], uarm_L:[-30,0,14], farm_L:[-95,0,0] }, r:[0,-0.16,1.35] },
      { t:1.0, e:'snap', p:{ pelvis:[0,20,0], spine:[-8,26,0], chest:[-6,20,0], head:[-18,-18,0],
                    thigh_L:[-26,0,0], shin_L:[24,0,0], thigh_R:[6,0,0], shin_R:[4,0,0],
                    uarm_R:[-168,0,-4], farm_R:[-8,0,0], hand_R:[0,0,0], uarm_L:[16,0,14], farm_L:[-110,0,0] }, r:[0,0.08,1.55] },
      { t:1.32, p:{ pelvis:[0,10,0], spine:[-4,14,0], chest:[-2,10,0], uarm_R:[-150,0,-6], farm_R:[-10,0,0],
                    thigh_L:[-18,0,5], shin_L:[22,0,0], thigh_R:[8,0,-5], shin_R:[20,0,0] }, r:[0,0,1.55] },
      { t:1.62, p:Object.assign({}, stance), r:[0,-0.04,1.55] },
    ].concat(L.keys).concat([{t:3.2, p:Object.assign({}, stance), r:[0,-0.04,1.55]}]);
    CLIPS.super_single = makeClip(3.55, keys, { rootMotion:true, run:[[0,0],[0.3,1],[0.7,1],[0.84,0]], runAmp:1.15,
      events: [{t:0.3,name:'dash'},{t:1.0,name:'uppercut'}].concat(L.ev) }); }

  /* ---- super contra VÁRIOS: avança, salta, golpeia o chão (stun), 6 lasers alternados ---- */
  { const L = laserKeys(2.35, 6, 0.30);
    const keys = [
      { t:0.2, p:{ spine:[16,0,0], chest:[8,0,0], head:[-14,0,0] }, r:[0,-0.08,0] },
      { t:0.6, p:{ spine:[14,0,0], chest:[6,0,0], head:[-14,0,0] }, r:[0,-0.04,1.1] },
      { t:0.78, e:'out', p:{ spine:[22,0,0], chest:[10,0,0], head:[-12,0,0], thigh_L:[-45,0,3], shin_L:[70,0,0], thigh_R:[-45,0,-3], shin_R:[70,0,0],
                    uarm_L:[-40,0,10], farm_L:[-95,0,0], uarm_R:[-40,0,-10], farm_R:[-95,0,0] }, r:[0,-0.16,1.2] },
      { t:1.0, e:'out', p:{ spine:[-6,0,0], chest:[-8,0,0], head:[-18,0,0], thigh_L:[-55,0,3], shin_L:[85,0,0], thigh_R:[-30,0,-3], shin_R:[60,0,0],
                    uarm_L:[-170,0,6], farm_L:[-10,0,0], uarm_R:[-170,0,-6], farm_R:[-10,0,0] }, r:[0,0.62,1.45] },
      { t:1.2, e:'in', p:{ spine:[34,0,0], chest:[14,0,0], head:[-24,0,0], thigh_L:[-30,0,6], shin_L:[34,0,0], thigh_R:[-30,0,-6], shin_R:[34,0,0],
                    uarm_L:[-25,0,12], farm_L:[-20,0,0], uarm_R:[-25,0,-12], farm_R:[-20,0,0] }, r:[0,-0.1,1.7] },
      { t:1.28, e:'snap', p:{ spine:[40,0,0], chest:[16,0,0], head:[-26,0,0], thigh_L:[-48,0,8], shin_L:[56,0,0], thigh_R:[-48,0,-8], shin_R:[56,0,0],
                    uarm_L:[-18,0,14], farm_L:[-10,0,0], uarm_R:[-18,0,-14], farm_R:[-10,0,0] }, r:[0,-0.2,1.75] },
      { t:1.75, p:{ spine:[16,0,0], chest:[6,0,0], thigh_L:[-30,0,5], shin_L:[40,0,0], thigh_R:[-30,0,-5], shin_R:[40,0,0] }, r:[0,-0.1,1.75] },
      { t:2.1, p:Object.assign({}, stance), r:[0,-0.04,1.75] },
    ].concat(L.keys).concat([{t:4.3, p:Object.assign({}, stance), r:[0,-0.04,1.75]}]);
    CLIPS.super_multi = makeClip(4.7, keys, { rootMotion:true, run:[[0,0],[0.25,1],[0.55,1],[0.7,0]], runAmp:1.15,
      events: [{t:0.25,name:'dash'},{t:0.8,name:'jump'},{t:1.26,name:'slam',radius:3}].concat(L.ev) }); }

  /* ---- reação a golpe ---- */
  CLIPS.hit = makeClip(0.5, [
    { t:0.07, e:'snap', p:{ pelvis:[6,0,0], spine:[-16,0,0], chest:[-10,0,0], neck:[-6,0,0], head:[-22,6,0],
                    uarm_L:[18,0,14], uarm_R:[18,0,-14], farm_L:[-35,0,0], farm_R:[-35,0,0],
                    thigh_L:[-12,0,3], thigh_R:[-12,0,-3], shin_L:[18,0,0], shin_R:[18,0,0] }, r:[0,-0.04,-0.12] },
    { t:0.22, p:{ spine:[-8,0,0], chest:[-4,0,0], head:[-10,3,0] }, r:[0,-0.03,-0.08] },
  ], { events: [] });

  /* ---- morte (fica no chão, de costas) ---- */
  CLIPS.death = makeClip(1.6, [
    { t:0.10, e:'snap', p:{ spine:[-16,0,0], chest:[-10,0,0], head:[-22,6,0], uarm_L:[18,0,14], uarm_R:[18,0,-14] }, r:[0,-0.03,-0.1] },
    { t:0.45, p:{ pelvis:[-14,0,0], spine:[-18,0,0], chest:[-8,0,0], head:[-16,10,0], thigh_L:[-34,0,3], thigh_R:[-30,0,-3],
                  shin_L:[66,0,0], shin_R:[60,0,0], uarm_L:[20,0,30], uarm_R:[20,0,-30] }, r:[0,-0.22,-0.3] },
    { t:0.95, e:'in', p:{ pelvis:[-58,0,0], spine:[-14,0,0], chest:[-6,0,0], head:[-12,12,0], thigh_L:[-26,0,6], thigh_R:[-18,0,-6],
                  shin_L:[44,0,0], shin_R:[30,0,0], uarm_L:[10,0,48], uarm_R:[10,0,-48], farm_L:[-12,0,0], farm_R:[-12,0,0] }, r:[0,-0.42,-0.45] },
    { t:1.35, e:'out', p:{ pelvis:[-90,0,0], spine:[-2,0,0], chest:[0,0,0], head:[-6,14,0], thigh_L:[2,0,8], thigh_R:[-2,0,-6],
                  shin_L:[4,0,0], shin_R:[8,0,0], foot_L:[-8,0,0], foot_R:[-8,0,0], uarm_L:[6,0,52], uarm_R:[6,0,-50], farm_L:[-8,0,0], farm_R:[-14,0,0] }, r:[0,-0.69,-0.2] },
  ], { hold: true, events: [{t:1.3, name:'land'}] });
}

/* ---------------- reprodutor ---------------- */
class Player {
  constructor() { this.clip = null; this.t = 0; this.speed = 1; this.prev = null; this.fade = 1; this.fadeDur = 0.15; this.pose = {}; this.onEvent = null; this.done = false; }
  play(name, opts) {
    opts = opts || {}; const c = CLIPS[name]; if (!c) throw new Error('clipe inexistente: ' + name);
    if (this.clip === c && !opts.restart) return;
    this.prev = this.clip ? JSON.parse(JSON.stringify(this.pose)) : null;
    this.fadeDur = opts.fade != null ? opts.fade : 0.15; this.fade = this.prev && this.fadeDur > 0 ? 0 : 1;
    this.clip = c; this.t = 0; this.done = false; this.name = name; this._lastT = -1e-6;
    this._eval();
  }
  update(dt) {
    const c = this.clip; if (!c) return;
    const t0 = this.t, t1 = t0 + dt*this.speed;
    this._fire(t0, t1);
    this.t = t1;
    if (c.loop) { if (this.t >= c.dur) { this._fire(-1e-6, this.t - c.dur); this.t -= c.dur; } }
    else if (this.t >= c.dur) { this.t = c.dur; this.done = true; }
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt/this.fadeDur);
    this._eval();
  }
  setTime(t) { this.t = t; this.fade = 1; this._eval(); }
  _fire(a, b) { const c = this.clip; if (!this.onEvent) return; for (const e of c.events) if (e.t > a && e.t <= b) this.onEvent(e); }
  _eval() {
    const out = {}; this.clip.eval(this.t, out);
    if (this.prev && this.fade < 1) { const f = EASE.ease(this.fade); for (const n in out) if (this.prev[n]) out[n] = lerp3(this.prev[n], out[n], f); }
    this.pose = out;
  }
}

/* ---------------- rig (matrizes) ---------------- */
class Rig {
  constructor() {
    this.n = SK.names.length; this.world = []; this.skin = new Float32Array(this.n*16); this._loc = new Float32Array(16);
    for (let i = 0; i < this.n; i++) this.world.push(new Float32Array(16));
    this.player = new Player(); this.useClipRootXZ = true;
  }
  apply(pose) {
    const n = this.n, loc = this._loc, root = pose.root || [0,0,0];
    for (let i = 0; i < n; i++) {
      const nm = SK.names[i], r = pose[nm] || [0,0,0], p = SK.parent[i], h = SK.head[i];
      let t;
      if (p < 0) t = [h[0] + (this.useClipRootXZ ? root[0] : 0), h[1] + root[1], h[2] + (this.useClipRootXZ ? root[2] : 0)];
      else { const hp = SK.head[p]; t = [h[0]-hp[0], h[1]-hp[1], h[2]-hp[2]]; }
      qMat(eulerQ(r[0], r[1], r[2]), t, loc);
      if (p < 0) this.world[i].set(loc); else mmul(this.world[p], loc, this.world[i]);
      // matriz de skin = mundo · T(-head)
      const W = this.world[i], o = this.skin, b = i*16;
      for (let k = 0; k < 12; k++) o[b+k] = W[k];
      o[b+12] = W[12] - (W[0]*h[0] + W[4]*h[1] + W[8]*h[2]);
      o[b+13] = W[13] - (W[1]*h[0] + W[5]*h[1] + W[9]*h[2]);
      o[b+14] = W[14] - (W[2]*h[0] + W[6]*h[1] + W[10]*h[2]);
      o[b+15] = 1;
    }
  }
  update(dt) { this.player.update(dt); this.apply(this.player.pose); }
  /* boca do laser: posição na ponta da mão, direção pelo eixo do antebraço (side = 'R' | 'L') */
  muzzle(side) { return { pos: this.bonePoint('hand_' + side).pos, dir: this.bonePoint('farm_' + side).dir }; }
  /* posição (espaço do modelo) do ponto 'tail' de um osso e direção do eixo do osso */
  bonePoint(name) {
    const i = SK.names.indexOf(name), W = this.world[i], h = SK.head[i], t = SK.tail[i];
    const d = [t[0]-h[0], t[1]-h[1], t[2]-h[2]], l = Math.hypot(d[0],d[1],d[2]) || 1;
    const pos = [W[12] + W[0]*d[0] + W[4]*d[1] + W[8]*d[2], W[13] + W[1]*d[0] + W[5]*d[1] + W[9]*d[2], W[14] + W[2]*d[0] + W[6]*d[1] + W[10]*d[2]];
    const dir = [(W[0]*d[0]+W[4]*d[1]+W[8]*d[2])/l, (W[1]*d[0]+W[5]*d[1]+W[9]*d[2])/l, (W[2]*d[0]+W[6]*d[1]+W[10]*d[2])/l];
    return { pos, dir };
  }
}

/* ---------------- renderizador WebGL ---------------- */
const VS = `attribute vec3 a_pos;attribute vec3 a_nrm;attribute vec2 a_uv;attribute vec4 a_si;attribute vec4 a_sw;
uniform mat4 u_bones[21];uniform mat4 u_model;uniform mat4 u_vp;
varying vec3 v_n;varying vec2 v_uv;varying vec3 v_w;
void main(){
 mat4 m=u_bones[int(a_si.x+.5)]*a_sw.x+u_bones[int(a_si.y+.5)]*a_sw.y+u_bones[int(a_si.z+.5)]*a_sw.z+u_bones[int(a_si.w+.5)]*a_sw.w;
 vec4 p=m*vec4(a_pos,1.);vec3 n=(m*vec4(a_nrm,0.)).xyz;
 vec4 wp=u_model*p;v_w=wp.xyz;v_n=(u_model*vec4(n,0.)).xyz;v_uv=a_uv;gl_Position=u_vp*wp;}`;
const FS = `precision highp float;
uniform sampler2D u_tex;uniform vec3 u_eye;uniform vec3 u_tint;uniform float u_flash;
varying vec3 v_n;varying vec2 v_uv;varying vec3 v_w;
void main(){
 vec3 al=pow(texture2D(u_tex,v_uv).rgb,vec3(2.2));
 vec3 N=normalize(v_n),V=normalize(u_eye-v_w),L=normalize(vec3(.45,.8,.5));
 float d=max(dot(N,L),0.)*.9+.1;
 vec3 hemi=mix(vec3(.06,.04,.12),vec3(.30,.34,.46),N.y*.5+.5);
 float rim=pow(1.-max(dot(N,V),0.),3.);
 float sp=pow(max(dot(N,normalize(L+V)),0.),36.)*.22;
 vec3 c=al*(hemi+d*vec3(1.,.95,.88)*1.05)+sp+rim*vec3(.18,.55,.8)*.7+u_tint*u_flash;
 c=c/(1.+c);gl_FragColor=vec4(pow(c,vec3(1./2.2)),1.);}`;
const GVS = `attribute vec3 a_pos;uniform mat4 u_vp;varying vec3 v_w;void main(){v_w=a_pos;gl_Position=u_vp*vec4(a_pos,1.);}`;
const GFS = `precision highp float;varying vec3 v_w;uniform vec3 u_c;uniform float u_y;
void main(){float r=length(v_w.xz);float fade=1.-smoothstep(3.,14.,r);
 vec2 g=abs(fract(v_w.xz*.5)-.5);float line=(1.-smoothstep(0.,.02,min(g.x,g.y)))*.35;
 float sh=exp(-dot(v_w.xz-u_c.xz,v_w.xz-u_c.xz)*3.2)*.55;
 vec3 base=vec3(.10,.12,.17)+vec3(.05,.08,.12)*line*3.;
 gl_FragColor=vec4(mix(vec3(.04,.05,.08),base,fade)*(1.-sh),1.);}`;
const FVS = `attribute vec3 a_pos;attribute vec2 a_uv;uniform mat4 u_vp;varying vec2 v_uv;void main(){v_uv=a_uv;gl_Position=u_vp*vec4(a_pos,1.);}`;
const FFS = `precision highp float;varying vec2 v_uv;uniform vec3 u_col;uniform float u_kind;uniform float u_a;
void main(){float v;
 if(u_kind<.5){float d=abs(v_uv.x*2.-1.);v=(exp(-d*d*9.)*.8+exp(-d*d*80.)*1.2)*(1.-v_uv.y*.65);}
 else if(u_kind<1.5){float r=length(v_uv-.5)*2.;float ring=exp(-pow((r-u_a)*14.,2.));v=ring*(1.-u_a)*1.6;}
 else{float r=length(v_uv-.5)*2.;v=exp(-r*r*5.)*u_a*1.6;}
 gl_FragColor=vec4(u_col*v,v);}`;

function sh(gl, type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
function prog(gl, v, f) { const p = gl.createProgram(); gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }

class Renderer {
  constructor(gl) { this.gl = gl; this.ready = false; this.fx = []; }
  async load(base, inline) {
    const gl = this.gl;
    const meta = inline ? inline.json : await (await fetch(base + 'cyber.json')).json();
    SK = meta.skeleton; setupBase(SK.names); buildClips();
    const buf = inline ? inline.bin : await (await fetch(base + 'cyber.bin')).arrayBuffer();
    const L = meta.layout, nV = meta.vertexCount;
    const mk = (name, ctor, target) => { const l = L[name]; const arr = new ctor(buf, l.offset, l.bytes / ctor.BYTES_PER_ELEMENT); const b = gl.createBuffer(); gl.bindBuffer(target || gl.ARRAY_BUFFER, b); gl.bufferData(target || gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW); return b; };
    this.buf = { pos: mk('pos', Float32Array), nrm: mk('nrm', Float32Array), uv: mk('uv', Float32Array), si: mk('si', Uint8Array), sw: mk('sw', Uint8Array), idx: mk('idx', Uint16Array, gl.ELEMENT_ARRAY_BUFFER) };
    this.indexCount = meta.indexCount; this.meta = meta;
    this.p = prog(gl, VS, FS); this.pg = prog(gl, GVS, GFS); this.pf = prog(gl, FVS, FFS);
    const get = (p, names, isU) => { const o = {}; names.forEach(n => o[n] = isU ? gl.getUniformLocation(p, n) : gl.getAttribLocation(p, n)); return o; };
    this.a = get(this.p, ['a_pos','a_nrm','a_uv','a_si','a_sw']); this.u = get(this.p, ['u_bones','u_model','u_vp','u_tex','u_eye','u_tint','u_flash'], true);
    this.ga = get(this.pg, ['a_pos']); this.gu = get(this.pg, ['u_vp','u_c','u_y'], true);
    this.fa = get(this.pf, ['a_pos','a_uv']); this.fu = get(this.pf, ['u_vp','u_col','u_kind','u_a'], true);
    this.groundBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf);
    const g = 40, y = meta.bounds.min[1]; gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-g,y,-g, g,y,-g, -g,y,g, g,y,g]), gl.STATIC_DRAW);
    this.fxBuf = gl.createBuffer();
    await new Promise((res, rej) => {
      const im = new Image(); im.onload = () => {
        const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
        gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        const ext = gl.getExtension('EXT_texture_filter_anisotropic'); if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
        this.tex = t; res();
      }; im.onerror = () => rej(new Error('falha ao carregar textura')); im.src = inline ? inline.tex : base + 'cyber_tex.webp';
    });
    this.ready = true; return this;
  }
  beginFrame(vp, eye, w, h) { const gl = this.gl; this.vp = vp; this.eye = eye; gl.viewport(0,0,w,h); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.clearColor(.04,.05,.08,1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
  drawGround(cx, cz) {
    const gl = this.gl; gl.disable(gl.CULL_FACE); gl.useProgram(this.pg); gl.uniformMatrix4fv(this.gu.u_vp, false, this.vp); gl.uniform3f(this.gu.u_c, cx, 0, cz);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf); gl.enableVertexAttribArray(this.ga.a_pos); gl.vertexAttribPointer(this.ga.a_pos, 3, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.enable(gl.CULL_FACE);
  }
  drawCyber(rig, model, tint, flash) {
    const gl = this.gl, a = this.a, B = this.buf; gl.useProgram(this.p);
    const bind = (loc, buf, n, type, norm) => { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, type, !!norm, 0, 0); };
    bind(a.a_pos, B.pos, 3, gl.FLOAT); bind(a.a_nrm, B.nrm, 3, gl.FLOAT); bind(a.a_uv, B.uv, 2, gl.FLOAT); bind(a.a_si, B.si, 4, gl.UNSIGNED_BYTE, false); bind(a.a_sw, B.sw, 4, gl.UNSIGNED_BYTE, true);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.idx);
    gl.uniformMatrix4fv(this.u.u_bones, false, rig.skin); gl.uniformMatrix4fv(this.u.u_model, false, model); gl.uniformMatrix4fv(this.u.u_vp, false, this.vp);
    gl.uniform3f(this.u.u_eye, this.eye[0], this.eye[1], this.eye[2]); gl.uniform3f(this.u.u_tint, tint ? tint[0] : 0, tint ? tint[1] : 0, tint ? tint[2] : 0); gl.uniform1f(this.u.u_flash, flash || 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tex); gl.uniform1i(this.u.u_tex, 0);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }
  /* efeitos aditivos: beam (a→b), ring (chão), flash (esfera) */
  drawFx(list) {
    if (!list.length) return; const gl = this.gl; gl.useProgram(this.pf); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.uniformMatrix4fv(this.fu.u_vp, false, this.vp); gl.bindBuffer(gl.ARRAY_BUFFER, this.fxBuf);
    gl.enableVertexAttribArray(this.fa.a_pos); gl.vertexAttribPointer(this.fa.a_pos, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(this.fa.a_uv); gl.vertexAttribPointer(this.fa.a_uv, 2, gl.FLOAT, false, 20, 12);
    const e = this.eye;
    for (const f of list) {
      let q; const w = f.w || 0.1;
      if (f.kind === 'beam') {
        const d = [f.b[0]-f.a[0], f.b[1]-f.a[1], f.b[2]-f.a[2]], m = [(f.a[0]+f.b[0])/2-e[0], (f.a[1]+f.b[1])/2-e[1], (f.a[2]+f.b[2])/2-e[2]];
        let s = [d[1]*m[2]-d[2]*m[1], d[2]*m[0]-d[0]*m[2], d[0]*m[1]-d[1]*m[0]]; const l = Math.hypot(s[0],s[1],s[2]) || 1; s = s.map(x => x/l*w);
        q = [f.a[0]-s[0],f.a[1]-s[1],f.a[2]-s[2],0,0, f.a[0]+s[0],f.a[1]+s[1],f.a[2]+s[2],1,0, f.b[0]-s[0],f.b[1]-s[1],f.b[2]-s[2],0,1, f.b[0]+s[0],f.b[1]+s[1],f.b[2]+s[2],1,1];
        gl.uniform1f(this.fu.u_kind, 0);
      } else if (f.kind === 'ring') {
        const R = f.r, c = f.c; q = [c[0]-R,c[1],c[2]-R,0,0, c[0]+R,c[1],c[2]-R,1,0, c[0]-R,c[1],c[2]+R,0,1, c[0]+R,c[1],c[2]+R,1,1];
        gl.uniform1f(this.fu.u_kind, 1);
      } else {   // flash billboard
        const c = f.c, R = f.r, fw = [c[0]-e[0], c[1]-e[1], c[2]-e[2]], fl = Math.hypot(fw[0],fw[1],fw[2]) || 1;
        let rx = [fw[2], 0, -fw[0]]; const rl = Math.hypot(rx[0],rx[1],rx[2]) || 1; rx = rx.map(x => x/rl*R);
        const ux = [ (fw[1]*rx[2]-fw[2]*rx[1])/fl, (fw[2]*rx[0]-fw[0]*rx[2])/fl, (fw[0]*rx[1]-fw[1]*rx[0])/fl ];
        q = [c[0]-rx[0]-ux[0],c[1]-rx[1]-ux[1],c[2]-rx[2]-ux[2],0,0, c[0]+rx[0]-ux[0],c[1]+rx[1]-ux[1],c[2]+rx[2]-ux[2],1,0, c[0]-rx[0]+ux[0],c[1]-rx[1]+ux[1],c[2]-rx[2]+ux[2],0,1, c[0]+rx[0]+ux[0],c[1]+rx[1]+ux[1],c[2]+rx[2]+ux[2],1,1];
        gl.uniform1f(this.fu.u_kind, 2);
      }
      gl.uniform3f(this.fu.u_col, f.col[0], f.col[1], f.col[2]); gl.uniform1f(this.fu.u_a, f.alpha != null ? f.alpha : 1);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(q), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.enable(gl.CULL_FACE);
  }
}

global.CyberRig = { Rig, Renderer, CLIPS, perspective, lookAt, modelMat, mmul, get SK() { return SK; }, D2R };
})(typeof window !== 'undefined' ? window : globalThis);
