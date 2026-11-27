/* CyberArena · Vale da Casona — jogo (batalha 16 jogadores, mundo aberto social e treino).
   Câmera em terceira pessoa (perto) ou visão alta, controles de toque/teclado, combate com mira assistida,
   bots adaptativos simulados pelo anfitrião da sala, sincronização online, zona segura, minimapa e mapa grande. */
import * as THREE from '../lib/three.module.min.js';
import { World, U, WATER_Y, CWm } from './world.js';
import { Hero, SKINS, SKIN_IDS, CHARS, useHeroEnv, heroEnv, applyCinematicToonScene, HERO_CAM } from './hero.js';
import { PostFX } from './post.js';
import { syncPBR, PBR_CFG } from './pbr.js';
import { CamShake, PhysParticles } from './combatfx.js';
import { loadClassic, makeCharacter, classicReady, loadAtlasGLB } from './classic.js';
import { FIGHT } from './fightdata.js';
import { MOVES } from './moves.js';
import { EMOTES } from './clipctl.js';
import { SOFT as SOFTBODY } from './softbody.js';
import { Realm, REALM_X } from './realm.js';
import { Stadium } from './stadium.js';
import { createSoccer } from './soccer.js';
import { ensurePacks } from './packs_ui.js';
import { FX } from './fx.js';
import { Powers, makeBlackHole } from './powers.js';
import { Audio } from './audio.js';
import { NOPROG, Net, getIdentity, saveIdentity } from './net.js';
import { initCtl } from './ctledit.js';
import { initTutMatch } from './tutmatch.js';
import { detectDevice, clampPreset, capCine } from './perf.js';   // v158: orçamento de desempenho por aparelho

const $ = id => document.getElementById(id);
const PI = Math.PI, TAU = PI * 2, CW = CWm, WD = CW.W;
const clamp = (x, a, b) => x < a ? a : x > b ? b : x, lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > PI) d -= TAU; while (d < -PI) d += TAU; return d; };
const r2 = x => Math.round(x * 100) / 100;
const embedded = window.parent && window.parent !== window;
const params = new URLSearchParams(location.search);
const MODE_RAW = params.get('mode') || '';
const MODE = MODE_RAW.startsWith('soccer') ? 'soccer' : ['battle', 'open', 'train', 'space'].includes(MODE_RAW) ? MODE_RAW : 'battle';
const VENUE = MODE_RAW === 'soccer_blue' ? 'blue' : 'gold';   // estádio do futebol: dourado (pôr do sol) ou azul (noite)
const CODE = (params.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || null;
const PARTY = /^[A-Z0-9]{8}$/.test(params.get('party') || '') ? params.get('party') : null;   // grupo do lobby: todos caem na mesma sala
const FORCE_OFFLINE = params.get('offline') === '1' || NOPROG;   // Teste de Poderes (space) e treino (train) agora são online (caem para offline sozinhos se o servidor não responder)
const TRAINLIKE = MODE === 'train' || MODE === 'space';
const TUT = params.get('tut') === '1' && MODE === 'battle'; let tut = null;   // primeira partida roteirizada (tutorial)
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (!isTouch) document.body.classList.add('desktop');

/* ---------- configurações ---------- */
const SET = Object.assign({ quality: 'auto', fps: 60, showFps: false, sens: 1, cam: 'tps', pad: false, cine: 'auto', gore: true }, JSON.parse(localStorage.getItem('cyberarena.settings') || '{}'));
const saveSet = () => localStorage.setItem('cyberarena.settings', JSON.stringify(SET));
// Migração de câmera: instala terceira pessoa próxima como padrão uma vez, sem sobrescrever futuras escolhas.
if (!localStorage.getItem('cyberarena.cameraMode.v2')) { SET.cam = 'tps'; localStorage.setItem('cyberarena.cameraMode.v2', '1'); }
/* qualidade (mesmos níveis do outro jogo): high = SUPREMO · medium = Alto · low = Leve · ultra = Ultra leve */
const PRESETS = {
  high: { pr: 2, shadows: true, shadowMap: 3072, grass: 15000, grassR: 34, leaves: 320, lights: true, terrainCell: .5, aa: true },
  medium: { pr: 1.5, shadows: true, shadowMap: 2048, grass: 9000, grassR: 28, leaves: 230, lights: true, terrainCell: .6, aa: true },
  low: { pr: 1, shadows: true, shadowMap: 1024, grass: 4500, grassR: 22, leaves: 150, lights: false, terrainCell: .6, aa: false },
  max: { pr: 2.5, shadows: true, shadowMap: 4096, grass: 22000, grassR: 40, leaves: 420, lights: true, terrainCell: .45, aa: true },   // MÁXIMO: tudo do SUPREMO + mais grama/folhas/sombra + cores vivas (o orçamento do aparelho ainda limita o que a GPU aguenta)
  ultra: { pr: 1, shadows: false, shadowMap: 0, grass: 0, grassR: 0, leaves: 60, lights: false, terrainCell: .8, aa: false },
};
const IS_APK = location.hostname === 'appassets.androidplatform.net';
{ const m = { auto: 'low', mid: 'medium', ultra4k: 'high', apk: 'low' }; if (m[SET.quality]) SET.quality = m[SET.quality]; if (!PRESETS[SET.quality]) SET.quality = 'low';
  /* padrões de TODOS (novos e já instalados), aplicados uma única vez: gráficos LEVE (quem escolheu Ultra leve continua) e efeitos cinematográficos no MÁXIMO; depois a escolha de cada um vale */
  if (!localStorage.getItem('cyberarena.defaults.v2')) { if (SET.quality !== 'ultra') SET.quality = 'low'; SET.cine = 'auto'; try { localStorage.setItem('cyberarena.defaults.v2', '1'); saveSet(); } catch (_) { } } }
const qName = SET.quality, qBase = qName === 'max' ? 'high' : qName, DEV = detectDevice(), Q = clampPreset(PRESETS[qName], DEV), ULTRA = qName === 'ultra';   // v158: celular fraco/médio recebe resolução, sombra e AA limitados ao que a GPU aguenta
const THEMES = ['classic', 'forest', 'fire']; SET.theme = THEMES.includes(SET.theme) ? SET.theme : 'classic';
if (SET.showFps) $('fps').classList.remove('hidden');
if (SET.pad) document.body.classList.add('showpad');

/* ---------- renderizador ---------- */
const canvas = $('c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance', stencil: false, precision: 'highp' }); }   // v158: 'mediump' deixava shaders pretos em GPUs Mali
catch (e) { $('loadTip').textContent = 'WebGL indisponível neste aparelho.'; throw e; }
const basePR = Q.ss ? Math.min(3, Math.max(window.devicePixelRatio || 1, 3840 / Math.max(innerWidth, innerHeight))) : Math.min(window.devicePixelRatio || 1, Q.pr); let curPR = basePR;
renderer.setPixelRatio(curPR); renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
try { useHeroEnv(renderer); } catch (e) { console.warn(e); }
PBR_CFG.gore = SET.gore !== false; PBR_CFG.aniso = qName === 'low' ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy()); globalThis.__ANISO = qName === 'ultra' ? 1 : qName === 'low' ? 2 : PBR_CFG.aniso;
// pós-processamento cinematográfico: 0 off · 1 bloom+grading · 2 +SSAO · 3 +motion blur
const CINE_AUTO = { ultra: 4, low: 4, medium: 4, high: 4, max: 4 };   // automático = MÁXIMO para todos; se o aparelho não aguentar, a qualidade adaptativa (post.adapt) desce sozinha
const cineTier = SET.cine === 'auto' || SET.cine == null ? 4 : +SET.cine;
let post = null;
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xa8c6e2, 180, 980);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .2, 3200);
const hemi = new THREE.HemisphereLight(0xc4dcff, 0x4d5b3a, 1.15); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.9); sun.castShadow = Q.shadows; scene.add(sun); scene.add(sun.target);
if (Q.shadows) { sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap); Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 220 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .04; }
const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (post) post.resize(); };
try { post = new PostFX(renderer, { tier: cineTier, samples: Q.aa && !isTouch && !Q.ss && cineTier >= 2 ? 4 : 0, vivid: cineTier >= 4 }); } catch (e) { console.warn('post', e); post = null; }
// GI aproximada: reflexos do céu (IBL fraco) + luz de rebatimento vinda do chão, na cor do solo
try { const env = heroEnv(); if (env) { scene.environment = env; scene.environmentIntensity = .22; } } catch (e) { }
if (cineTier >= 4) { renderer.toneMappingExposure = 1.14; hemi.intensity = 1.3; hemi.color.set(0xb8d8ff); hemi.groundColor.set(0x5f7a3c); sun.color.set(0xffe9c4); sun.intensity = 3.15; if (scene.environment) scene.environmentIntensity = .34; scene.fog.color.set(0x93c4f2); }   // MÁXIMO: luz mais viva e céu mais azul
const bounce = new THREE.DirectionalLight(0x5d6b45, .5); scene.add(bounce); scene.add(bounce.target);
const shake = new CamShake();
addEventListener('resize', onResize);

const world = new World(renderer, scene, Q, { quality: ULTRA ? 'low' : qBase, ultra: ULTRA, theme: SET.theme, sun, hemi }); world.camFov = camera.fov * PI / 180;
if (params.get('debug')) window.__ca = { renderer, scene, camera, world, THREE };   // ferramenta de diagnóstico (só com ?debug=1)
const fx = new FX(scene, camera), audio = new Audio(), powers = new Powers(scene, fx, camera);
const phys = new PhysParticles(scene, (x, z, y) => { const f = me || G.spec; return f ? envOf(f).groundAt(x, z, y + 1.5) : y - 1.2; }); phys.gore = SET.gore !== false;
const _UPV = new THREE.Vector3(0, 1, 0);
fx.hook = { impact: (c, big) => { if (big) phys.sparks(c, _UPV, 14, 1.1); }, shock: (x, y, z) => phys.chips(new THREE.Vector3(x, y, z), 16, 1.5), dust: (x, y, z, k) => { if (k >= 2.5) phys.chips(new THREE.Vector3(x, y, z), Math.round(k * 2), .6); } };
const fdt = (a, dt) => a._freeze > 0 ? dt * .04 : dt;   // hit stop: congela só atacante e vítima
const ident = getIdentity(); const net = new Net(ident); if (FORCE_OFFLINE) net.online = false;
const myId = ident.playerId;
const charParam = params.get('char'); if (charParam && CHARS[charParam]) { ident.char = charParam; saveIdentity({ char: charParam }); }
if (ident.skin !== 'cyber') { ident.skin = 'cyber'; saveIdentity({ skin: 'cyber' }); }   // sem skins

/* ===================================================== atores ===================================================== */
const BOT_SKINS = ['cyber'];   // sem skins: todos usam o visual padrão
const BOT_NAMES = ['NeonKira', 'Vortex', 'Raio', 'Nyx', 'Blitz', 'Lumi', 'Falcão', 'Zion', 'Ártemis', 'Pixel', 'Titã', 'Fênix', 'Orion', 'Kairo', 'Jade', 'Volt', 'Sombra', 'Astra', 'Rex', 'Nova'];
class Actor {
  constructor(id, name, skin, kind, char) {
    this.id = id; this.name = name || 'Cyber'; this.skin = SKINS[skin] ? skin : 'cyber'; this.kind = kind; // me | remote | bot
    this.char = kind === 'bot' && BOTS_ATLAS ? 'atlas' : CHARS[char] ? char : 'nexus'; this.hero = makeCharacter(this.char, this.skin); this.hero.attach(scene); { const rg = this.hero.atlasRig; if (rg) { rg.wrap.scale.multiplyScalar(1.18); rg.wrap.position.y *= 1.18; } }   // personagens maiores nas partidas
    this.x = 0; this.y = 5; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.vy = 0; this.spd = 0; this.grounded = true; this.inWater = 0;
    this.lvl = 1; this.maxHp = CS.hpAt(this.char, 1); this.hp = this.maxHp; this.energy = 0; this.alive = true; this.kills = 0; this.charges = 3; this.chargeT = 0; this.cd = { punch: 0, laser: 0, super: 0, jump: 0, vel: 0, solar: 0 }; this.solarSequence = null; this.solarVictim = null;
    this.crouch = false; this.dodgeT = 0; this.dodgeCd = 0; this.down = false; this.downT = 0; this.downKind = 'back'; this.gettingUp = false; this.lunge = null;
    this.anim = ['idle', 0]; this.lastSeq = 0; this.pending = []; this.buf = []; this.atlasSequence = null; this.atlasVictim = null; this.velocityDuel = null; this.velocityDuelBy = null; this.vault = null; this.drop = 0; this.healT = 0; this.lastHitT = -99; this.lastBy = null; this.stepPh = 0; this.simulated = kind !== 'remote';
    this.tag = null; this.busyMove = 0; this.wasInWater = false; this.lastShotT = -99; this.aimT = 0;
  }
  play(name, arg) { const r = this.hero.play(name, arg); this.anim = [name, (this.anim[1] + 1) % 1000]; return r; }
  get pos() { return new THREE.Vector3(this.x, this.y, this.z); }
  chest(out) { const c = this.hero && this.hero.atlasRig && this.hero.atlasRig.ctl; if (c) return c.zoneWorld('chest', out || new THREE.Vector3()); return (out || new THREE.Vector3()).set(this.x, this.y + 1.85, this.z); }
  dispose() { this.hero.dispose(); if (this.tag) this.tag.remove(); }
}
const actors = new Map(); let me = null;
const BOTS_ATLAS = false;   // bots voltam a ser aleatórios (Cyber, Nexus e Atlas) — os 3 personagens novos já estão prontos
const addActor = (id, name, skin, kind, char) => { let a = actors.get(id); if (!a) { a = new Actor(id, name, skin, kind, char); actors.set(id, a); } else if (char && CHARS[char] && a.char !== char && a.kind !== 'me' && !(a.kind === 'bot' && BOTS_ATLAS)) { swapChar(a, char); } return a; };
function swapChar(a, char) { const vis = a.hero.object.visible; a.hero.dispose(); a.char = char; { const f = a.maxHp ? a.hp / a.maxHp : 1; a.maxHp = CS.hpAt(char, a.lvl || 1); a.hp = Math.round(a.maxHp * f); } a.hero = makeCharacter(char, a.skin); a.hero.attach(scene); a.hero.setVisible(vis); if (!a.alive) a.hero.play('death'); }
const removeActor = id => { const a = actors.get(id); if (a) { a.dispose(); actors.delete(id); } };
/* grupo do lobby: colegas de grupo são aliados (não causam dano entre si e não entram em "inimigos" / mira) */
let _team = null, _teamT = -1e9;
function mates(a, b) {
  if (!PARTY || !a || !b || a === b) return false;
  const t = performance.now(); if (t - _teamT > 1000) { _teamT = t; try { const g = window.parent.__party && window.parent.__party.state.party; _team = g && g.id === PARTY ? new Set(g.members.map(m => m.id)) : null; } catch (_) { _team = null; } }
  return !!_team && _team.has(a.id) && _team.has(b.id);
}
const enemiesOf = a => [...actors.values()].filter(b => b !== a && b.alive && !b.drop && !mates(a, b));

/* ===================================================== estado da partida ===================================================== */
const G = { phase: 'loading', room: null, startAt: 0, endAt: 0, seed: 1, deadSet: new Set(), placement: 0, killer: null, specIdx: 0, spec: null, kits: [], orbs: [], zone: null, zoneDmgT: 0, started: false, ended: false, result: null, shake: 0, humansAtStart: [], adapt: 0, lastZonePhase: -1 };
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const now = () => net.serverNow();

/* ---------- zona segura (determinística pela semente) ---------- */
function makeZone(seed) {
  const r = mulberry32(seed ^ 0x9e3779b9), ph = [{ wait: 50, shrink: 34, r: 140 * ZS, dps: 3 }, { wait: 36, shrink: 28, r: 76 * ZS, dps: 5 }, { wait: 30, shrink: 22, r: 36 * ZS, dps: 8 }, { wait: 26, shrink: 18, r: 12 * ZS, dps: 12 }, { wait: 20, shrink: 20, r: 0, dps: 18 }];
  const ZS = WD.HX / 200; let c = [CW.LAYOUT.temple.x * .3, 0], R = 280 * ZS, t = 0; const steps = [{ t0: 0, t1: 0, c0: c, c1: c, r0: R, r1: R, dps: 2 }];
  for (const p of ph) {
    let nc = c; for (let k = 0; k < 40; k++) { const a = r() * TAU, d = Math.sqrt(r()) * Math.max(0, Math.min(R, 240 * ZS) - p.r) * .8, x = clamp(c[0] + Math.cos(a) * d, -WD.HX + p.r * .6 + 6, WD.HX - p.r * .6 - 6), z = clamp(c[1] + Math.sin(a) * d, -WD.HZ + p.r * .6 + 6, WD.HZ - p.r * .6 - 6); if (CW.heightAt(x, z) < 12 && world.waterDepth(x, z) < 0) { nc = [x, z]; break; } }
    steps.push({ t0: t + p.wait, t1: t + p.wait + p.shrink, c0: c, c1: nc, r0: R, r1: p.r, dps: p.dps, wait0: t }); t += p.wait + p.shrink; c = nc; R = p.r;
  }
  return { steps, total: t, at(sec) { let s = steps[0], i = 0; for (let k = 1; k < steps.length; k++) if (sec >= steps[k].wait0) { s = steps[k]; i = k; } const k = clamp((sec - s.t0) / Math.max(1e-3, s.t1 - s.t0), 0, 1); return { x: lerp(s.c0[0], s.c1[0], k), z: lerp(s.c0[1], s.c1[1], k), r: lerp(s.r0, s.r1, k), next: { x: s.c1[0], z: s.c1[1], r: s.r1 }, dps: s.dps, phase: i, shrinking: sec >= s.t0 && sec < s.t1, tNext: sec < s.t0 ? s.t0 - sec : sec < s.t1 ? s.t1 - sec : 0 }; } };
}
let zoneMesh = null;
function buildZoneMesh() {
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uTime: U.uTime },
    vertexShader: 'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'uniform float uTime;varying vec2 vUv;varying vec3 vW;void main(){float s=.5+.5*sin(vUv.x*600.+uTime*2.);float l=smoothstep(.0,.04,fract(vUv.y*8.-uTime*.25));float a=(.18+.22*s*l)*(1.-vUv.y)*smoothstep(0.,.05,vUv.y);gl_FragColor=vec4(vec3(.25,.6,1.)*1.6,a);}' });
  zoneMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 120, 128, 1, true), mat); zoneMesh.position.y = 20; zoneMesh.renderOrder = 8; zoneMesh.frustumCulled = false; zoneMesh.visible = false; scene.add(zoneMesh);
}
/* ---------- itens: kits médicos e orbes de energia ---------- */
const kitGeo = (() => { const a = new THREE.BoxGeometry(.75, .25, .25), b = new THREE.BoxGeometry(.25, .75, .25); return [a, b]; })();
function buildItems(seed) {
  for (const k of [...G.kits, ...G.orbs]) k.m.removeFromParent();
  G.kits = []; G.orbs = []; const r = mulberry32(seed ^ 0x51ed);
  const kmat = new THREE.MeshStandardMaterial({ color: 0x2ee07a, emissive: 0x16a050, emissiveIntensity: 1.2, roughness: .3 }), omat = new THREE.MeshStandardMaterial({ color: 0xc07bff, emissive: 0x8b3dff, emissiveIntensity: 1.8, roughness: .2 });
  for (let i = 0; i < 44; i++) { const [x, z] = world.randomSpot(r), g = new THREE.Group(); for (const geo of kitGeo) g.add(new THREE.Mesh(geo, kmat)); const base = new THREE.Mesh(new THREE.CylinderGeometry(.55, .65, .12, 24), new THREE.MeshStandardMaterial({ color: 0x2a3340, metalness: .6, roughness: .4 })); base.position.y = -.85; g.add(base); g.position.set(x, world.groundAt(x, z) + 1, z); scene.add(g); G.kits.push({ i, x, z, m: g, t: 0 }); }
  for (let i = 0; i < 28; i++) { const [x, z] = world.randomSpot(r), m = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 2), omat); m.position.set(x, world.groundAt(x, z) + 1.1, z); scene.add(m); G.orbs.push({ i, x, z, m, t: 0 }); }
}

/* ===================================================== entrada ===================================================== */
const input = { mx: 0, mz: 0, jump: false, keys: new Set(), joy: null, camDrag: null, wheel: 0 };
let solarFocus = null;
let novaFocus = null;
const flashShots = []; const flashClashes = new Set(); const velocityBursts = []; const velocityClashes = new Set();
function realityFracture(pos, dur = 10) {
  const fog0 = scene.fog ? scene.fog.color.clone() : null, hemi0 = hemi.intensity, sun0 = sun.intensity, dark = new THREE.Color(0x080511);
  powers.rift(() => pos.clone(), dur, 0x48dfff);
  let t = 0; const e = powers.add({ t: 0, update(dt) { t += dt; const pulse = Math.sin(Math.PI * clamp(t / dur, 0, 1)); if (fog0 && scene.fog) scene.fog.color.copy(fog0).lerp(dark, pulse * .88); hemi.intensity = hemi0 * (1 - pulse * .55); sun.intensity = sun0 * (1 - pulse * .72); return t < dur; }, dispose() { if (fog0 && scene.fog) scene.fog.color.copy(fog0); hemi.intensity = hemi0; sun.intensity = sun0; } });
  powers.cinemaLight(() => pos.clone(), dur, 0x48dfff, 18, { gain: .9, streak: 1.2 });
  return e;
}
function registerFlashShot(a, origin, direction) {
  const nowT = performance.now(); for (let i = flashShots.length - 1; i >= 0; i--) if (flashShots[i].until < nowT) flashShots.splice(i, 1);
  const shot = { a, origin: origin.clone(), dir: direction.clone().normalize(), until: nowT + 1450 }; flashShots.push(shot);
  for (const other of flashShots) { if (other === shot || other.a === a || other.a.char !== 'cyber' || a.char !== 'cyber') continue;
    const key = [a.id, other.a.id].sort().join(':'); if (flashClashes.has(key)) continue;
    if (shot.dir.dot(other.dir) > -.86) continue; const delta = other.origin.clone().sub(shot.origin), lateral = delta.clone().addScaledVector(shot.dir, -delta.dot(shot.dir)); if (lateral.length() > 8) continue;
    flashClashes.add(key); let clearT = 0; powers.add({ t: 0, update: dt => (clearT += dt) < 10, dispose: () => flashClashes.delete(key) }); const mid = shot.origin.clone().add(other.origin).multiplyScalar(.5).addScaledVector(shot.dir, Math.max(3, delta.dot(shot.dir) * .5));
    const axis = new THREE.Vector3().crossVectors(shot.dir, new THREE.Vector3(0, 1, 0)).normalize(); if (axis.lengthSq() < .1) axis.set(1, 0, 0);
    powers.megaBeam(mid, axis, 22, 8.5, 10, 0x8cefff); powers.megaBeam(mid, axis.clone().negate(), 22, 8.5, 10, 0xffffff);
    realityFracture(mid, 10); fx.ring(mid.x, mid.y, mid.z, 0x8cefff, 150, 1.4, .9); fx.ring(mid.x, mid.y, mid.z, 0xffffff, 240, 1.8, .8); fx.flash(mid, 0xffffff, 70, .75); fx.emit(mid.x, mid.y, mid.z, 180, { color: [.45, .8, 1], speed: 24, up: 4, life: 2.2, size: .28, grav: 0, spread: 1 });
    powers.screenFlash('rgba(225,250,255,.96)', .5, 1); G.shake = Math.max(G.shake, 1.8); G.slowUntil = performance.now() + 850;
    if (authOf(a)) for (const e of enemiesOf(a)) { const d = e.chest(new THREE.Vector3()).distanceTo(mid); if (d < 12) damage(e, 18, a, 'super', { kx: (e.x - mid.x) * 1.5, kz: (e.z - mid.z) * 1.5, up: 5 }); }
    if (a === me || other.a === me) banner('COLISÃO DE FLASH Ω · RUPTURA DA REALIDADE', 2200);
  }
}
const camS = { yaw: PI, pitch: .2, dist: 5.6, mode: SET.cam, x: 0, y: 8, z: 0, tx: 0, ty: 0, tz: 0, init: false };
{ // joystick (flutuante por padrão; fixo se o jogador escolher no editor de controles)
  const joy = $('joy'), base = $('joyB'), knob = $('joyK'); let id = null, cx = 0, cy = 0, R = 56;
  const home = () => { base.style.left = ''; base.style.top = ''; knob.style.transform = ''; };
  const drive = e => { let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px,${dy}px)`; input.joy = { x: dx / R, y: -dy / R }; };
  joy.addEventListener('pointerdown', e => { audio.unlock(); id = e.pointerId; joy.setPointerCapture(id); R = 56 * (parseFloat(getComputedStyle(joy).getPropertyValue('--js')) || 1);
    if (joy.dataset.fixed === '1') { const b = base.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; input.joy = { x: 0, y: 0 }; drive(e); }
    else { const r = joy.getBoundingClientRect(); cx = e.clientX; cy = e.clientY; base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px'; input.joy = { x: 0, y: 0 }; }
    e.preventDefault(); });
  joy.addEventListener('pointermove', e => { if (e.pointerId !== id) return; drive(e); });
  const up = e => { if (e.pointerId !== id) return; id = null; input.joy = null; home(); }; joy.addEventListener('pointerup', up); joy.addEventListener('pointercancel', up);
  window.__ctlInputReset = () => { id = null; input.joy = null; home(); };
}
const ctlEd = initCtl({ trainlike: TRAINLIKE, autoEdit: params.get('ctl') === '1', banner: (t, ms) => banner(t, ms) });   // editor de controles (treino)
{ // arrastar para girar a câmera (toque à direita / mouse)
  let id = null, lx = 0, ly = 0, moved = 0, t0 = 0, pinch = null; const touches = new Map();
  canvas.addEventListener('pointerdown', e => { audio.unlock(); canvas.focus(); touches.set(e.pointerId, [e.clientX, e.clientY]); if (touches.size === 2) { const p = [...touches.values()]; pinch = { d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]), dist: camS.dist }; } if (id === null) { id = e.pointerId; lx = e.clientX; ly = e.clientY; moved = 0; t0 = performance.now(); canvas.setPointerCapture(e.pointerId); } });
  canvas.addEventListener('pointermove', e => { if (touches.has(e.pointerId)) touches.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && touches.size === 2) { const p = [...touches.values()], d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); camS.dist = clamp(pinch.dist * pinch.d / d, camS.mode === 'tps' ? 3.2 : 14, camS.mode === 'tps' ? 10 : 36); return; }
    if (e.pointerId !== id) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
    const k = .0055 * SET.sens * (isTouch ? 1.1 : 1); camS.yaw -= dx * k; camS.pitch = clamp(camS.pitch + dy * k * .8, camS.mode === 'tps' ? -.45 : .5, camS.mode === 'tps' ? 1.15 : 1.35); });
  const up = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = null; if (e.pointerId !== id) return; id = null; if (!isTouch && moved < 6 && performance.now() - t0 < 350) { if (e.button === 2) act('laser'); else if (e.button === 0) act('punch'); } };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { camS.dist = clamp(camS.dist * (1 + Math.sign(e.deltaY) * .1), camS.mode === 'tps' ? 3.2 : 14, camS.mode === 'tps' ? 10 : 36); e.preventDefault(); }, { passive: false });
}
const hold = (el, fn) => { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); audio.unlock(); fn(); }); };
hold($('bAtk'), () => act('punch')); hold($('bLas'), () => act('laser')); hold($('bSup'), () => act('super')); hold($('bSolar'), () => act('solar')); hold($('bJmp'), () => { input.jump = true; }); hold($('bVel'), () => act('extra')); hold($('bSwap'), () => swapAbyss(me));
hold($('bKick'), () => act('kick')); hold($('bDodge'), () => act('dodge'));

addEventListener('keydown', e => {
  if (document.activeElement === $('chatIn')) { if (e.key === 'Enter') sendChat(); if (e.key === 'Escape') closeChat(); return; }
  audio.unlock(); const k = e.key.toLowerCase(); input.keys.add(k);
  if (k === ' ') { input.jump = true; e.preventDefault(); }
  if (k === 'g') act('sit'); if (k === 'h') act('kick'); if (k === 'x') act('dodge');
  if (k === 'j') act('punch'); if (k === 'k') act('laser'); if (k === 'l' || k === 'q') act('super');
  if (k === 'e' && MODE !== 'open') act('laser'); if (k === 'r' && MODE !== 'open') act('extra'); if (k === 'b') act('solar'); if (k === 'f' && me && me.abyss) swapAbyss(me);
  if (k === 'v') toggleView(); if (k === 'm') toggleMap(); if (k === 'enter') openChat(); if (k === 'escape') { if (!$('bigmap').classList.contains('hidden')) toggleMap(); }
});
addEventListener('keyup', e => input.keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => input.keys.clear());
function readMove() {
  let ix = 0, iy = 0; const K = input.keys;
  if (K.has('w') || K.has('arrowup')) iy += 1; if (K.has('s') || K.has('arrowdown')) iy -= 1; if (K.has('d') || K.has('arrowright')) ix += 1; if (K.has('a') || K.has('arrowleft')) ix -= 1;
  if (input.joy) { ix = input.joy.x; iy = input.joy.y; }
  let l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; l = 1; } if (l < .12) return [0, 0, 0];
  const fy = camS.yaw, fx = Math.sin(fy), fz = Math.cos(fy), rx = -Math.cos(fy), rz = Math.sin(fy);
  const walk = K.has('shift') ? .45 : 1;
  return [(fx * iy + rx * ix) * walk, (fz * iy + rz * ix) * walk, l * walk];
}

/* ===================================================== física ===================================================== */
const GRAV = 26, JUMP_V = 9.6, RAD = .46, RUN = 7.2;
let realm = null, soccer = null; const inRealm = a => !!realm && a.x > REALM_X - 600; const envOf = a => a.dim ? a.dim : inRealm(a) ? realm : world;
function tryVault(a, hit) {
  const E = envOf(a);
  if (!hit || !hit.o.vault || !a.grounded || a.vault) return false;
  const rise = hit.top - a.y; if (rise > 1.5 || rise < .2) return false;
  const nx = -hit.nx, nz = -hit.nz; let land = null;
  for (let d = .5; d <= 3.4; d += .2) { const x = a.x + nx * d, z = a.z + nz * d; if (E.blockers(x, z, a.y, RAD, .75).length) continue; const g = E.groundAt(x, z, a.y + .4, .4); if (Math.abs(g - a.y) > 1.3) continue; land = [a.x + nx * (d + .25), a.z + nz * (d + .25), g]; break; }
  if (!land) return false;
  a.vault = { t: 0, dur: .6, x0: a.x, z0: a.z, y0: a.y, x1: land[0], z1: land[1], y1: land[2], top: hit.top + .35 };
  a.yaw = Math.atan2(nx, nz); a.play('vault'); sfx('vault', a); return true;
}
/* escalar: empurrando contra uma parede/rocha mais alta que o passo, agarra a borda com as mãos e sobe com braços e pernas */
function tryClimb(a, hit) {
  const E = envOf(a); if (!hit || a.climb || a.vault || !a.grounded || !a.alive) return false;
  const rise = hit.top - a.y; if (rise < .9 || rise > 38) return false;
  const nx = -hit.nx, nz = -hit.nz; let land = null;
  for (let d = .6; d <= 1.7; d += .22) { const x = a.x + nx * d, z = a.z + nz * d, g = E.groundAt(x, z, hit.top + .25, .45); if (g < hit.top - .4) continue; if (E.blockers(x, z, g, RAD, .3).length) continue; land = [x, z, g]; break; }
  if (!land) return false;
  const dur = .45 + rise * (rise > 4 ? .34 : .3); a.climb = { t: 0, dur, y0: a.y, y1: land[2], xw: a.x, zw: a.z, x1: land[0], z1: land[1] };
  a.climb.n = Math.max(1, Math.round(rise / 1.15)); a.yaw = Math.atan2(nx, nz); a.hero.climbRate = a.climb.n / (dur * .72); a.play('climb', dur * .8); sfx('vault', a); return true;
}
function stepActor(a, dt, mx, mz, mag, wantJump) {
  const E = envOf(a);
  tickCombat(a, dt); if (a.slideT > 0) a.slideT -= dt; if (a.sitting && (mag > .15 || wantJump)) { a.sitting = false; a.hero.sitting = false; a.hero.atlasRig && a.hero.atlasRig.ctl.sit(false); wantJump = false; }
  if (a.grounded) { a.djump = false; a.airT = 0; } else a.airT = (a.airT || 0) + dt;
  if (a.crouch && wantJump) { setCrouch(a, false); wantJump = false; }
  if (a.held) { a.x = a.held.x; a.y = a.held.y; a.z = a.held.z; a.vx = a.vz = a.vy = 0; a.spd = 0; a.grounded = true; a.peakY = a.y; return; }
  if (a.dash) { const D = a.dash, sg = D.segs[D.i]; if (!sg || !a.alive) { a.dash = null; } else { D.t += dt; const k = clamp(D.t / sg.du, 0, 1);
      const ox = a.x, oz = a.z; a.x = lerp(sg.x0, sg.x1, k); a.z = lerp(sg.z0, sg.z1, k); a.y = E.groundAt(a.x, a.z, a.y + 3, 3); a.yaw = Math.atan2(sg.x1 - sg.x0, sg.z1 - sg.z0); a.vx = a.vz = a.vy = 0; a.grounded = true; a.spd = Math.hypot(a.x - ox, a.z - oz) / Math.max(dt, 1e-4); a.peakY = a.y;
      if (Math.random() < .8) fx.dustStep(a.x, a.y, a.z, 1.4);
      if (k >= 1) { D.h = (D.h || 0) + dt; if (D.h >= (sg.hold || 0)) { D.h = 0; D.i++; D.t = 0; if (D.i >= D.segs.length) a.dash = null; } } return; } }
  if (a.stunT > 0) { a.stunT -= dt; mx = mz = mag = 0; wantJump = false; }
  if (!a.alive) { a.vx *= .9; a.vz *= .9; a.y = lerp(a.y, E.groundAt(a.x, a.z, a.y + 1), .2); a.spd = 0; return; }
  if (a.vault) { const v = a.vault; v.t += dt; const k = clamp(v.t / v.dur, 0, 1), e = k * k * (3 - 2 * k); a.x = lerp(v.x0, v.x1, e); a.z = lerp(v.z0, v.z1, e); a.y = lerp(v.y0, v.y1, e) + Math.sin(PI * k) * Math.max(0, v.top - Math.max(v.y0, v.y1)); a.spd = 5; a.grounded = true; a.vy = 0; if (k >= 1) { a.vault = null; a.y = E.groundAt(a.x, a.z, a.y + .3); } return; }
  if (a.climb && wantJump && a.climb.t > .25 && a.climb.t / a.climb.dur < .72) { // salta para trás e solta da parede
    const c = a.climb; a.climb = null; a.yaw += PI; a.vx = Math.sin(a.yaw) * 6; a.vz = Math.cos(a.yaw) * 6; a.vy = JUMP_V * .8; a.grounded = false; a.peakY = a.y; a.hero.climbUntil = 0; a.hero.climbCycle = null; a.play('jump'); sfx('jump', a); return; }
  if (a.climb) { const c = a.climb; c.t += dt; const k = clamp(c.t / c.dur, 0, 1), k1 = clamp(k / .72, 0, 1), e1 = k1 * k1 * (3 - 2 * k1), k2 = clamp((k - .72) / .28, 0, 1);
    const nn = c.n || 1, rg = a.hero.atlasRig, ws = rg ? rg.wrap.scale.x : 1, hang = Math.min(.88 * ws, (c.y1 - c.y0) * .55), yTop = c.y1 + .05;
    a.y = k2 > 0 ? lerp(yTop - hang, yTop, k2 * k2 * (3 - 2 * k2)) : lerp(c.y0, yTop - hang, nn > 1 ? k1 : e1);
    const ncy = Math.max(1, Math.round((c.y1 - c.y0 - hang) / (.34 * ws)));   // passo de ~1/3 de altura do corpo por ciclo, em qualquer altura de parede
    a.hero.climbCycle = { phase: k1 * ncy, H: ((c.y1 - c.y0 - hang) / ncy) / ws, wall: .2, tilt: 0, over: k2 };
    if (nn > 1 && Math.floor(k1 * nn * 2) !== c.lastGrab && k1 < 1) { c.lastGrab = Math.floor(k1 * nn * 2); if (Math.random() < .5) fx.puff(a.x + Math.sin(a.yaw) * .4, a.y + 2.6, a.z + Math.cos(a.yaw) * .4, 3, { r: .1, speed: .6, up: -.3, size: .3, life: .6 }); sfx('step', a, .9); } a.x = lerp(c.xw, c.x1, k2 * k2 * (3 - 2 * k2)); a.z = lerp(c.zw, c.z1, k2 * k2 * (3 - 2 * k2));
    a.vx = a.vz = a.vy = 0; a.spd = k2 > 0 ? 2.5 : 0; a.grounded = true; a.peakY = a.y; a.scramble = 0;
    if (k >= 1) { a.climb = null; a.hero.climbCycle = null; a.y = E.groundAt(a.x, a.z, a.y + .3); fx.dustStep(a.x, a.y, a.z, .8); } return; }
  if (a.drop > 0) { // queda do céu no início da batalha (planando)
    a.peakY = a.y; a.vy = Math.max(a.vy - 6 * dt, -9); a.y += a.vy * dt; a.x += mx * 5 * dt; a.z += mz * 5 * dt; if (mag > .1) a.yaw += angDiff(Math.atan2(mx, mz), a.yaw) * Math.min(1, 6 * dt);
    const g = E.groundAt(a.x, a.z, a.y); if (a.y <= g) { a.y = g; a.drop = 0; a.grounded = true; a.play('land', 14); sfx('land', a, 1); fx.dustStep(a.x, a.y, a.z, 3); fx.ring(a.x, a.y, a.z, 0x38f2ff, 3, .5); }
    else { a.grounded = false; if (Math.random() < .5) fx.emit(a.x, a.y + 1.5, a.z, 1, { color: [.3, .9, 1], speed: .5, up: 1, life: .5, size: .2, grav: 0 }); }
    a.spd = 0; return;
  }
  const depth = E.waterDepth(a.x, a.z); a.inWater = a.y < WATER_Y + .2 ? clamp(depth / 1.1, 0, 1) : 0;
  // ladeiras: subida íngreme fica lenta e o personagem usa mãos e pés; descida acelera um pouco
  let slope = 0; if (mag > .1 && a.grounded) { const t0 = E.terrainAt(a.x, a.z), t1 = E.terrainAt(a.x + mx / mag * .7, a.z + mz / mag * .7); if (t0 > -100 && t1 > -100) slope = (t1 - t0) / .7; }
  a.slope = lerp(a.slope || 0, slope, Math.min(1, dt * 10)); a.scramble = lerp(a.scramble || 0, clamp((a.slope - .55) / .7, 0, 1) * (mag > .1 ? 1 : 0), Math.min(1, dt * 6));
  const busy = a.busyMove > 0 ? .35 : 1, sp = RUN * (a.crouch ? .42 : 1) * (a.simulated ? CS.spdAt(a.char, a.lvl || 1) / 720 : 1) * (1 - .42 * a.inWater) * busy * (1 - .5 * a.scramble) * (1 + clamp(-a.slope - .3, 0, .5) * .25), acc = a.grounded ? 46 : 14;
  const tx = mx * sp, tz = mz * sp; let dvx = tx - a.vx, dvz = tz - a.vz; const dl = Math.hypot(dvx, dvz), mxd = acc * dt; if (dl > mxd) { dvx *= mxd / dl; dvz *= mxd / dl; } a.vx += dvx; a.vz += dvz;
  if (wantJump && a.grounded && a.cd.jump <= 0) {
    // pular janelas/cercas: se há algo pulável à frente, faz o salto acrobático
    const fx2 = Math.sin(a.yaw), fz2 = Math.cos(a.yaw), probe = { x: a.x + fx2 * .5, y: a.y, z: a.z + fz2 * .5 }, h = E.collide(probe, RAD + .25, .75);
    if (!(h && (tryVault(a, h) || tryClimb(a, h)))) { a.vy = JUMP_V * (1 - .25 * a.inWater); a.grounded = false; a.play('jump'); sfx('jump', a); if (a.inWater > .1) fx.splash(a.x, WATER_Y, a.z, .8); }
    a.cd.jump = .25;
  } else if (wantJump && !a.grounded && !a.djump && !a.climb && !a.vault && (a.airT || 0) > .16 && a.cd.jump <= 0 && a.inWater < .3 && !a.down) {
    a.djump = true; a.vy = JUMP_V * .88; a.play('djump'); sfx('jump', a); a.cd.jump = .25; fx.splash && 0;
  }
  a.vy -= GRAV * dt; const ox = a.x, oz = a.z;
  a.x += a.vx * dt; a.z += a.vz * dt; a.y += a.vy * dt;
  const hit = E.collide(a, RAD, a.grounded ? .75 : .28);
  if (hit && a.grounded && mag > .5 && hit.o.vault && Math.hypot(a.vx, a.vz) > 3 && (mx * -hit.nx + mz * -hit.nz) > .7) tryVault(a, hit);
  if (hit && !a.vault && a.grounded && mag > .5 && (mx * -hit.nx + mz * -hit.nz) > .6 * mag) { a.pushT = (a.pushT || 0) + dt; if (a.pushT > .16) { a.pushT = 0; if (tryClimb(a, hit)) return; } } else a.pushT = 0;
  if (hit) { const vn = a.vx * hit.nx + a.vz * hit.nz; if (vn < 0) { a.vx -= vn * hit.nx; a.vz -= vn * hit.nz; } }
  if (!a.grounded) a.peakY = Math.max(a.peakY ?? a.y, a.y);
  const g = E.groundAt(a.x, a.z, a.y + (a.grounded ? .0 : 0), a.grounded ? .75 : .3);
  if (a.y <= g + .02 || (a.grounded && a.vy <= 0 && a.y - g < .65)) {
    if (!a.grounded) { const imp = -a.vy, fall = (a.peakY ?? a.y) - g, hs = Math.hypot(a.vx, a.vz);
      if (fall > 7.5 && hs > 3.2 && a.alive) { a.play('roll'); a.busyMove = .5; sfx('land', a, 1); fx.dustStep(a.x, g, a.z, 3); if (a === me) G.shake = Math.max(G.shake, .35); }
      else if ((fall > 3.8 || imp > 15) && a.alive) { a.play('landHard'); a.busyMove = .6; a.vx *= .25; a.vz *= .25; sfx('land', a, 1); fx.dustStep(a.x, g, a.z, 3.5); fx.ring(a.x, g + .05, a.z, 0xd8c8a8, 2.2, .45); if (a === me) { G.shake = Math.max(G.shake, Math.min(.8, .3 + fall * .04)); if (navigator.vibrate) try { navigator.vibrate(40); } catch (_) { } } }
      else if (imp > 4) { a.play('land', imp); sfx('land', a, Math.min(1, imp / 14)); fx.dustStep(a.x, g, a.z, 1.5); } }
    a.peakY = g;
    a.y = a.grounded ? lerp(a.y, g, Math.min(1, dt * 22)) : g; if (Math.abs(a.y - g) < .02 || a.y < g) a.y = g; a.vy = 0; a.grounded = true;
  } else if (a.y - g > .65) a.grounded = false;
  a.spd = Math.hypot(a.x - ox, a.z - oz) / Math.max(dt, 1e-4);
  if (mag > .1 && a.aimT <= 0) a.yaw += angDiff(Math.atan2(mx, mz), a.yaw) * Math.min(1, 14 * dt);
  // água: respingos, ondulações, sons
  if (a.inWater > .05) { if (!a.wasInWater) { fx.splash(a.x, WATER_Y, a.z, 1.4); sfx('splash', a); ripple(a.x, a.z, 1.4); } if (a.spd > 1 && Math.random() < dt * 8) { ripple(a.x, a.z, .8); if (Math.random() < .4) fx.splash(a.x, WATER_Y, a.z, .35); } }
  a.wasInWater = a.inWater > .05;
  if (inRealm(a) && a.y < -45 && a.simulated) { a.x = realm.spawn[0]; a.z = realm.spawn[1]; a.y = realm.groundAt(a.x, a.z) + 6; a.vx = a.vz = a.vy = 0; if (a === me) { banner('Você caiu no vazio… de volta à ilha', 1600); camS.init = false; } }
}
let ripK = 0; function ripple(x, z, s) { const r = U.uRip.value[ripK = (ripK + 1) % 8]; r.set(x, z, world.time, s); }

/* ===================================================== combate ===================================================== */
const DMG = { punch: [10, 12, 20], laser: 18, super: 42 };
/* nível do personagem (vem do lobby): HP, dano e velocidade crescem com a evolução — limites pensados p/ não quebrar o PvP */
const CS = globalThis.CYBER_STATS;   // mundo/js/charstats.js (carregado antes deste módulo)
const hpPct = a => a.maxHp ? a.hp / a.maxHp * 100 : a.hp;   // só para a IA/efeitos: vida como % da vida máxima
const ME_BUFF = (() => { try { const id = JSON.parse(localStorage.getItem('cyberarena.identity') || '{}'), c = JSON.parse(localStorage.getItem('cyberarena.chars.v1') || '{}'), ch = CS.idOf(id.char || 'nexus'); return { lvl: CS.clampL((c[ch] || {}).lvl) }; } catch (_) { return { lvl: 1 }; } })();

function canFight() { return (MODE === 'battle' && G.phase === 'live') || TRAINLIKE; }
function findTarget(a, range, cone, dir) {
  let best = null, bs = 1e9; const fx0 = dir ? dir[0] : Math.sin(a.yaw), fz0 = dir ? dir[1] : Math.cos(a.yaw);
  for (const b of enemiesOf(a)) { const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d > range || d < .01) continue; const ang = Math.acos(clamp((dx * fx0 + dz * fz0) / d, -1, 1)); if (ang > cone) continue; if (Math.abs(b.y - a.y) > 6) continue;
    if (d > 3 && envOf(a).rayBlocked(a.x, a.y + 1.8, a.z, b.x, b.y + 1.6, b.z)) continue; const s = d * (1 + ang * 1.5) * (hpPct(b) < 40 ? .8 : 1); if (s < bs) { bs = s; best = b; } }
  return best;
}
function faceTo(a, b) { a.yaw = Math.atan2(b.x - a.x, b.z - a.z); a.aimT = .45; }
function moveIntent(a) { if (a === me) { const m = readMove(); return m[2] > .1 ? [m[0] / m[2], m[1] / m[2]] : [Math.sin(camS.yaw), Math.cos(camS.yaw)]; } return null; }
function act(name) {
  if (!me || !me.alive || me.drop > 0 || G.phase === 'loading') return;
  if (soccer && soccer.act(name)) return;
  if (name === 'sit') { toggleSit(me); return; }
  if (name.startsWith('emote_')) { if (MODE === 'battle' && G.phase === 'live') return; if (name === 'emote_sit' && MODE !== 'open') return; if (MODE === 'open' && !OPEN_EMOTES.includes(name.slice(6))) return; if (!me.hero.isBusy() && !me.down) me.play(name); return; }
  if (name === 'wave' || name === 'dance') return; // emotes genéricos removidos
  if (name === 'crouch') { if (me.sitting) { toggleSit(me); return; } if (!me.crouch && me.grounded && me.spd > 4.6 && !me.climb && !me.down) { doSlide(me); return; } setCrouch(me, !me.crouch); return; }
  if (name === 'dodge') { doDodge(me); return; }
  if (!canFight()) { if (name === 'punch' || name === 'kick' || name === 'laser' || name === 'super' || name === 'extra' || name === 'solar') banner(MODE === 'open' ? 'Mundo aberto: sem combate' : 'Aguarde o início da partida', 1200); return; }
  if (TUT && tut && !tut.allow(name)) return;   // tutorial: só o botão da vez funciona
  if (name === 'punch') doPunch(me); else if (name === 'kick') doPunch(me, null, 'kick'); else if (name === 'laser') doSkill(me); else if (name === 'super') doSuper(me); else if (name === 'extra') doExtra(me); else if (name === 'solar') doSolar(me);
  if (TUT && tut) tut.afterAct(name);
}
/* ===================== v147 · COMBATE POR ZONAS =====================
   Cada golpe tem uma zona (cabeça / peito / barriga / pernas) e uma variação POR OPONENTE (fightdata.js): a distância e a altura
   de impacto vêm do corpo de quem apanha. O atingido reage SÓ na região acertada; golpe forte derruba e ele levanta sozinho. */
const MV = { punch0: 'Punch_L', punch1: 'Punch_R', punch2: 'Kick_R', kick: 'Kick_L', cpunch: 'CrouchPunch', sweep: 'Sweep' };
const MDMG = { Punch_L: 10, Punch_R: 12, Kick_R: 20, Kick_L: 15, CrouchPunch: 13, Sweep: 11 };
const DOWN_T = { sweep: 1.25, head: 1.4, back: 1.2 }, GETUP_T = 1.5;
const pairSg = (a, b, mv) => {
  const M = MOVES[mv], pl = a.hero && a.hero.atlasRig && a.hero.atlasRig.ctl.lastPlan; if (!pl) return M.Sg;
  const Ha = FIGHT.H[a.char] || 3, Hb = FIGHT.H[b.char] || 3, zz = FIGHT.zones[b.char] && FIGHT.zones[b.char][M.zone], zt = zz ? zz[2] : .09;
  return Math.max(1.3, (pl.reach * Ha + zt * Hb) * FIGHT.MATCH);          // alcance real do punho/pé do clipe + profundidade da zona do alvo
};
function setCrouch(a, on) {
  on = !!on; if (a.crouch === on || a.down || !a.alive || a.climb || a.vault) return; a.crouch = on; a.hero.crouch = on; a.play(on ? 'crouch_on' : 'crouch_off');
  if (a === me) { const el = $('bCrouch'); if (el) { el.classList.toggle('on', on); const sp = el.querySelector('span'); if (sp) sp.textContent = on ? 'LEVANTAR' : 'AGACHAR'; } }
}
function doSlide(a) {
  if (a.slideT > 0 || a.cd.slide > 0) return; a.slideT = .8; a.cd.slide = 1.2; a.busyMove = 0; a.play('slide'); const f = Math.hypot(a.vx, a.vz) || 1; a.vx += a.vx / f * 4.6; a.vz += a.vz / f * 4.6;
  if (a === me) sfx('dodge', a);
  setTimeout(() => { if (a.alive && !a.down && canFight()) { a.hero.atlasRig && a.hero.atlasRig.ctl.plan('sweep'); meleeHit(a, 'Sweep', null); } }, 260);
}
const OPEN_EMOTES = ['sit', 'flip']; // mundo aberto: só SENTAR (cadeira) e MORTAL
function buildEmotes() {
  const box = $('emotes'), ctl = me.hero.atlasRig.ctl; buildEmotes.char = me.char; if (!box) return; box.innerHTML = '';
  for (const e of ctl.emotes().filter(e => MODE === 'open' ? OPEN_EMOTES.includes(e.id) : e.id !== 'sit')) { const b = document.createElement('button'); b.className = 'em'; b.textContent = e.icon + ' ' + e.label; b.title = e.label; hold(b, () => act(e.id === 'sit' ? 'sit' : 'emote_' + e.id)); box.appendChild(b); }
}
function toggleSit(a) {
  const ctl = a.hero.atlasRig && a.hero.atlasRig.ctl; if (!ctl) return;
  if (a.sitting) { a.sitting = false; ctl.sit(false); a.hero.sitting = false; banner('Em pé', 700); return; }
  if (MODE !== 'open' || a.down || a.climb || !a.grounded || a.spd > 1.2 || !ctl.canSit()) return; // sentar: só no mundo aberto if (a.crouch) setCrouch(a, false);
  a.sitting = true; a.hero.sitting = true; a.play('emote_sit'); banner(ctl.seatMode() === 'chair' ? 'Sentado · mova-se para levantar' : 'Sentou · mova-se para levantar', 1100);
}
function doPunch(a, target, kind) {
  if (a.cd.punch > 0 || a.vault || a.climb || a.drop || a.dash || a.down || a.stunT > 0) return false;
  const t = target || findTarget(a, 5, 1.3, moveIntent(a)); if (t) faceTo(a, t);
  let key = null; if (a.crouch) key = kind === 'kick' ? 'sweep' : 'cpunch'; else if (kind === 'kick') key = 'kick';
  a.hero.fightTarget = t ? t.hero : null;
  let r; if (key) r = a.play(key); else { r = a.play('punch'); key = 'punch' + r.combo; }
  const mv = MV[key]; a.cd.punch = r.duration - .1; a.busyMove = r.duration * .8;
  // aproximação: fecha (ou abre) a distância até a distância de impacto DESTE par de personagens
  if (t) { const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz) || 1, Sg = pairSg(a, t, mv); a.lunge = { t: 0, dur: Math.max(.08, r.impact * .9), dist: clamp(d - Sg, -.9, 2.6), dx: dx / d, dz: dz / d }; }
  else { a.vx += Math.sin(a.yaw) * 2.4; a.vz += Math.cos(a.yaw) * 2.4; }
  a.pending.push({ t: r.impact, fn: () => meleeHit(a, mv) }); sendFx(a, 'punch', {});
  return true;
}
function meleeHit(a, mv) {
  if (!a.alive || a.down) return; const M = MOVES[mv], fx0 = Math.sin(a.yaw), fz0 = Math.cos(a.yaw); let any = false;
  for (const b of enemiesOf(a)) {
    if (!b.alive || b.down || Math.abs(b.y - a.y) > 1.8) continue;
    const dx = b.x - a.x, dz = b.z - a.z, dc = Math.hypot(dx, dz) || .01, Sg = pairSg(a, b, mv);
    if (dc > Sg + 1.05) continue;
    if (Math.acos(clamp((dx * fx0 + dz * fz0) / dc, -1, 1)) > 1.0) continue;
    if ((b.crouch && M.zone === 'head') || b.dodgeT > 0) continue;       // agachado/esquivando: o golpe alto passa
    any = true; const zone = M.zone, resist = b.busyMove > .25 && !M.knock;
    const hp = b.hero.atlasRig ? b.hero.atlasRig.ctl.zoneWorld(zone) : b.chest(); fx.hitSpark(hp);
    damage(b, MDMG[mv], a, 'punch', { kx: dx / dc * M.kb, kz: dz / dc * M.kb, zone, knock: M.knock || null, resist, stun: M.stun });
  }
  sfx(any ? 'punch' : 'whoosh', a, any ? 1 : .4); if (any && a === me) { G.shake = Math.max(G.shake, M.knock ? .35 : .15); hitMarker(); }
}
function doDodge(a) {
  if (!a.alive || a.down || a.stunT > 0 || a.dodgeCd > 0 || a.climb || a.vault || a.drop) return;
  let k = 'd'; if (a === me) { const m = readMove(), fy = Math.sin(a.yaw), fz = Math.cos(a.yaw), lat = m[0] * fz - m[1] * fy * 0 + 0; const lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw), l = m[0] * lx + m[1] * lz, f = m[0] * fy + m[1] * fz; if (m[2] > .1) { if (Math.abs(l) > .45) k = l > 0 ? 'l' : 'r'; else if (f < -.3) k = 'b'; } }
  a.dodgeT = .42; a.dodgeCd = .9; a.busyMove = 0; a.play({ l: 'dodge_l', r: 'dodge_r', b: 'dodge_b', d: 'duck' }[k]);
  const lx = Math.cos(a.yaw), lz = -Math.sin(a.yaw), sx = k === 'l' ? 1 : k === 'r' ? -1 : 0, bk = k === 'b' ? -1 : 0; a.vx += (lx * sx + Math.sin(a.yaw) * bk) * 6; a.vz += (lz * sx + Math.cos(a.yaw) * bk) * 6;
}
function reactTo(t, kb, yaw) {
  if (!t.alive || t.down) return;
  if (kb && kb.zone) {
    if (t.crouch && kb.zone !== 'shin') setCrouch(t, false);
    if (kb.knock) { startDown(t, kb.knock, yaw); return; }
    if (kb.resist) { t.play('rhit_' + kb.zone); return; }
    t.yaw = yaw; t.play('hit_' + kb.zone); t.stunT = Math.max(t.stunT || 0, kb.stun || .3); t.busyMove = 0; t.cd.punch = Math.max(t.cd.punch, .22); return;
  }
  if (!t.hero.isBusy()) t.play('hit', yaw);
}
function startDown(t, kind, yaw) {
  if (t.crouch) { t.crouch = false; t.hero.crouch = false; } t.yaw = yaw; t.down = true; t.downT = 0; t.downKind = kind; t.gettingUp = false; t.busyMove = 0; t.cd.punch = Math.max(t.cd.punch, 1);
  t.play(kind === 'sweep' ? 'fall_sweep' : kind === 'head' ? 'fall_head' : 'fall_back'); t.stunT = Math.max(t.stunT || 0, DOWN_T[kind] + GETUP_T * .85);
}
function tickCombat(a, dt) {
  if (a.dodgeT > 0) a.dodgeT -= dt; if (a.dodgeCd > 0) a.dodgeCd -= dt;
  if (a.lunge) { const L = a.lunge, st = Math.min(dt, L.dur - L.t); if (st > 0) { const f = L.dist * st / L.dur; a.x += L.dx * f; a.z += L.dz * f; } L.t += dt; if (L.t >= L.dur) a.lunge = null; }
  if (a.down) { a.downT += dt; if (!a.alive) { a.down = false; return; } const dn = DOWN_T[a.downKind] || 1.2; if (!a.gettingUp && a.downT >= dn) { a.gettingUp = true; a.play('getup'); } if (a.downT >= dn + GETUP_T) { a.down = false; a.gettingUp = false; } }
}
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
function doLaser(a, target, err = 0) {
  if (a.cd.laser > 0 || a.charges < 1 || a.vault || a.climb || a.drop) return false;
  const t = target || findTarget(a, 28, .62, moveIntent(a)); if (t) faceTo(a, t); else if (a === me) { a.yaw = Math.atan2(...moveIntent(a)); a.aimT = .45; }
  a.charges--; a.cd.laser = .42; a.busyMove = .3; const r = a.play('laser'); sfx('charge', a, .5);
  a.pending.push({ t: r.impact, fn: () => {
    if (!a.alive) return; const o = a.hero.getEmitter(new THREE.Vector3()); let dir;
    if (t && t.alive) { const tp = t.chest(_v1); const fl = tp.distanceTo(o) / 70; tp.x += (t.vx || 0) * fl * .8; tp.z += (t.vz || 0) * fl * .8; tp.y -= .15; dir = tp.sub(o).normalize(); }
    else dir = new THREE.Vector3(Math.sin(a.yaw), -.02, Math.cos(a.yaw));
    if (err) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - .5) * err * 2).add(new THREE.Vector3(0, (Math.random() - .5) * err * .5, 0)).normalize();
    fireLaser(a, o, dir, true); sendFx(a, 'laser', { o: [r2(o.x), r2(o.y), r2(o.z)], d: [r2(dir.x), r2(dir.y), r2(dir.z)] });
  } });
  return true;
}
function fireLaser(a, o, dir, authoritative) {
  const col = SKINS[a.skin].accent; sfx('laser', a); a.lastShotT = world.time;
  const b = fx.laser(o, dir, col, 70, 28); b.owner = a; b.auth = authoritative;
  b.collide = null; return b;
}
function laserCollide(prev, cur, b) {
  const blk = world.rayBlocked(prev.x, prev.y, prev.z, cur.x, cur.y, cur.z); const lim = blk ? blk.t : 1;
  for (const t of actors.values()) { if (t === b.owner || !t.alive || t.drop) continue;
    for (let k = 1; k <= 4; k++) { const s = Math.min(lim, k / 4); const x = lerp(prev.x, cur.x, s), y = lerp(prev.y, cur.y, s), z = lerp(prev.z, cur.z, s); const dh = Math.hypot(x - t.x, z - t.z), yy = y - t.y; if (dh < .6 && yy > .2 && yy < 3.1) {
      if (b.auth && canFight()) damage(t, DMG.laser, b.owner, 'laser', { kx: b.dir.x * 2.5, kz: b.dir.z * 2.5 }); if (b.owner === me) hitMarker(); return { point: new THREE.Vector3(x, y, z), actor: t }; } } }
  if (blk) return { point: new THREE.Vector3(blk.x, blk.y, blk.z) };
  return null;
}
function doSuper(a) {
  if (a.energy < 100 || a.vault || a.climb || a.drop || a.held || a.dash || a.abyss || a.hero.isBusy()) return false;
  if (a.char === 'nexus') return doAbyss(a); if (a.char === 'cyber') return doNova(a); if (a.char === 'atlas') return doAbyssFist(a);
  const t = findTarget(a, 8, 1.6, moveIntent(a)); if (t) faceTo(a, t);
  a.energy = 0; const r = a.play('super'); a.busyMove = r.duration; sfx('superCharge', a); a.hero.setGlow(1);
  a.pending.push({ t: r.impact, fn: () => superHit(a) }); sendFx(a, 'super', {}); return true;
}
function superHit(a, visualOnly) {
  if (!a.alive) return; const fwd = 1.2, x = a.x + Math.sin(a.yaw) * fwd, z = a.z + Math.cos(a.yaw) * fwd;
  fx.shock(x, a.y, z, SKINS[a.skin].accent); sfx('super', a); if (Math.hypot(camS.tx - x, camS.tz - z) < 20) G.shake = Math.max(G.shake, .7);
  ruin(a, x, z, x, z, 3.4);   // o golpe especial derruba o que estiver à frente
  if (visualOnly) return;
  for (const b of enemiesOf(a)) { const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz); if (d > 6.5 || Math.abs(b.y - a.y) > 2.5) continue; const k = 1 - d / 6.5 * .45; damage(b, Math.round(DMG.super * k), a, 'super', { kx: dx / (d || 1) * 13, kz: dz / (d || 1) * 13, up: 6 }); }
}

/* ===================================================== poderes novos ===================================================== */
const SKILL_CD = MODE === 'space' ? { nexus: 1.5, cyber: 2, vel: 2.5, velC: 4, solar: 7 } : { nexus: 6, cyber: 7, vel: 10, velC: 14, solar: 24 };
function doSkill(a, target) { return a.char === 'cyber' ? doFlash(a, target) : a.char === 'atlas' ? doAtlasGuard(a) : doSingularity(a, target); }
const authOf = a => a === me || (a.kind === 'bot' && a.simulated);
/* NEXUS · SINGULARIDADE: arremessa um buraco negro que suga, prende e implode */
function doSingularity(a, target, remote) {
  if (!remote && (a.cd.laser > 0 || a.vault || a.climb || a.drop || a.held)) return false;
  // persegue o inimigo mais próximo, não importa para onde você mira
  const nearest = () => { let best = null, bd = 40; for (const e of enemiesOf(a)) { const dd = Math.hypot(e.x - a.x, e.z - a.z); if (dd < bd && Math.abs(e.y - a.y) < 12) { bd = dd; best = e; } } return best; };
  const t = remote ? null : target || nearest(); if (t) faceTo(a, t); else if (a === me) { a.yaw = Math.atan2(...moveIntent(a)); a.aimT = .45; }
  if (!remote) { a.cd.laser = SKILL_CD.nexus; a.charges = 3; a.busyMove = .9; sendFx(a, 'sing', { tx: t ? r2(t.x) : null, tz: t ? r2(t.z) : null }); }
  const r = a.play('singularity'); sfx('charge', a, .8); a.hero.setGlow(1);
  powers.handOrb(() => a.alive ? a.hero.getEmitter(new THREE.Vector3()) : null, r.impact, .3);
  a.pending.push({ t: r.impact, fn: () => { if (!a.alive) return; const o = a.hero.getEmitter(new THREE.Vector3()); let dir;
    if (t && t.alive) dir = t.chest(_v1).sub(o).normalize(); else dir = new THREE.Vector3(Math.sin(a.yaw), -.05, Math.cos(a.yaw));
    const E = envOf(a), auth = authOf(a); sfx('void', a); let tick = 0; const hitT = new Set();
    let hT = t; const s = powers.singularity(o, dir, { speed: 24, range: 60, life: 2.4, radius: 8,
      home: () => { if (!hT || !hT.alive) hT = nearest(); return hT ? hT.chest(new THREE.Vector3()) : null; },
      collide: (p0, p1) => { if (!hT) { const b = E.rayBlocked(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); if (b) return new THREE.Vector3(b.x, b.y, b.z); } for (const e of enemiesOf(a)) if (Math.hypot(p1.x - e.x, p1.z - e.z) < 1 && p1.y - e.y > 0 && p1.y - e.y < 3.2) return p1.clone(); return null; },
      ground: (x, z) => E.groundAt(x, z, a.y + 6),
      onOpen: p => { if (Math.hypot(camS.tx - p.x, camS.tz - p.z) < 25) G.shake = Math.max(G.shake, .3); },
      onImplode: p => { ruin(a, p.x, p.z, p.x, p.z, 9); powers.cinemaLight(() => p, .6, 0xb07bff, 14, { gain: 1 }); sfx('implode', a); if (Math.hypot(camS.tx - p.x, camS.tz - p.z) < 30) { G.shake = Math.max(G.shake, .8); if (a === me || hitT.has(me)) powers.screenFlash('rgba(190,140,255,.8)', .5, .7); }
        if (!auth) return; for (const e of enemiesOf(a)) { const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz); if (d > 8) continue; damage(e, Math.round(45 * (1 - d / 16)), a, 'super', { kx: dx / (d || 1) * 11, kz: dz / (d || 1) * 11, up: 7 }); } } });
    // sucção: puxa os inimigos para o centro, gira em volta e causa dano contínuo
    const pull = { t: 0, update: dt => { if (s.dead) return false; if (!s.open) return true; const p = s.pos; tick -= dt; const doTick = tick <= 0; if (doTick) tick = .4;
      for (const e of enemiesOf(a)) { const dx = p.x - e.x, dz = p.z - e.z, d = Math.hypot(dx, dz); if (d > s.radius || !e.simulated) { if (d <= s.radius) hitT.add(e); continue; } hitT.add(e);
        const k = (1 - d / s.radius) * 18 + 4; e.vx += (dx / (d || 1) * k - dz / (d || 1) * 5) * dt * 4; e.vz += (dz / (d || 1) * k + dx / (d || 1) * 5) * dt * 4; e.stunT = Math.max(e.stunT || 0, .3);
        if (d < 1.6) { e.vx *= .6; e.vz *= .6; e.yaw += dt * 9; } if (doTick && auth) damage(e, 4, a, 'laser', null); } return true; } };
    powers.add(pull); } });
  return true;
}
/* NEXUS · ABISMO ESTELAR: puxa o inimigo para a dimensão dele por 30 s. Nos primeiros 15 s chovem estrelas, planetas e
   buracos negros gigantes teleguiados no alvo (o campo de força não deixa fugir). Um clone do NEXUS fica no mundo real:
   o botão TROCAR troca de lugar com o clone (vai ao mundo real e volta). No fim, o alvo morre ou volta ao mundo normal. */
const ABYSS_DUR = 30, ABYSS_RAIN = 15, ARENA_R = 20;
function makeDimEnv(cx, y, cz, R) {
  return { cx, cz, y, R, terrainAt: () => y, groundAt: () => y, waterDepth: () => -99, blockers: () => [], rayBlocked: () => null,
    collide(p, rad) { const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz) || 1e-6, m = R - rad - .3; if (d > m) { p.x = cx + dx / d * m; p.z = cz + dz / d * m; } return null; } };
}
function doAbyss(a, remoteTarget) {
  const remote = remoteTarget !== undefined; const t = remote ? remoteTarget : findTarget(a, 16, 1.6, moveIntent(a));
  if (a.abyss) return false;
  if (!remote && (!t || t.dim)) { if (a === me) banner('Nenhum inimigo perto para o ABISMO ESTELAR', 1100); return false; }
  if (t) faceTo(a, t); if (!remote) { a.energy = 0; sendFx(a, 'abyss', { tg: t.id }); }
  const r = a.play('abyssCast'); a.busyMove = 1.2; a.hero.setGlow(1); sfx('superCharge', a); const auth = authOf(a);
  const startP = { x: a.x, y: a.y, z: a.z }, tStart = t ? { x: t.x, y: t.y, z: t.z } : null, yaw0 = a.yaw;
  if (a === me || t === me) banner('ABISMO ESTELAR', 2200);
  powers.portal(new THREE.Vector3(a.x + Math.sin(a.yaw) * 2.2, a.y + 2, a.z + Math.cos(a.yaw) * 2.2), .4, r.impact + .3, 0x9a5cff);
  a.pending.push({ t: r.impact, fn: () => {
    if (!a.alive) return; sfx('kamui', a);
    if (t && t.alive) { const P = new THREE.Vector3(t.x, t.y + 1.6, t.z); powers.portal(P, 2.6, 1, 0x9a5cff); fx.emit(P.x, P.y, P.z, 90, { color: [.7, .5, 1], speed: 2, life: .7, size: .2, grav: 0, dir: [0, 0, 0], spread: 1 }); }
    if (a === me || t === me) powers.screenFlash('#0a0418', 1, 1);
    const C = new THREE.Vector3(startP.x, startP.y + 220, startP.z), DE = powers.dimension(C, 70, ABYSS_DUR + .6), D = DE.D; D.arena(ARENA_R);
    const env = makeDimEnv(C.x, C.y, C.z, ARENA_R), fx0 = Math.sin(yaw0), fz0 = Math.cos(yaw0);
    // clone do NEXUS no mundo real, brilhando em roxo
    const ch = makeCharacter(a.char, a.skin); ch.attach(scene); ch.setGlow(1);
    const cl = { x: startP.x, y: startP.y, z: startP.z, yaw: yaw0, inDim: false, hero: ch };
    const ab = a.abyss = { t: 0, env, clone: cl, C, target: t, D, swapCd: 0 }; if (t) t.abyssBy = a;
    if (a.simulated) { a.x = C.x - fx0 * 7; a.z = C.z - fz0 * 7; a.y = C.y; a.vx = a.vz = a.vy = 0; a.dim = env; a.yaw = yaw0; a.busyMove = 0; }
    if (t && t.simulated) { t.x = C.x + fx0 * 7; t.z = C.z + fz0 * 7; t.y = C.y; t.vx = t.vz = t.vy = 0; t.dim = env; t.stunT = 1.2; t.vault = t.climb = null; t.dash = null; }
    if (a === me) { camS.init = false; camS.cur = null; chatLine('', 'ABISMO: 30 s. Use TROCAR (F) para trocar de lugar com seu clone no mundo real.', true); }
    if (t === me) { camS.init = false; camS.cur = null; banner('PRESO NO ABISMO ESTELAR · não há saída', 2600); }
    const aim = new THREE.Vector3(); aim.live = true; let next = 1.4, n = 0, deadT = 0, done = false;
    const finish = () => { if (done) return; done = true; DE.kill = true;
      if (t && t.dim === env) { t.dim = null; if (t.simulated) { Object.assign(t, tStart); t.vx = t.vz = t.vy = 0; t.stunT = .6; } }
      if (a.dim === env) { a.dim = null; if (a.simulated) { a.x = cl.x; a.y = cl.y; a.z = cl.z; a.vx = a.vz = a.vy = 0; } }
      if (a === me || t === me) { camS.init = false; camS.cur = null; powers.screenFlash('#ffffff', .8, .9); banner(t && t.alive ? 'DE VOLTA DO ABISMO' : 'O ABISMO DEVOROU ' + (t ? t.name.toUpperCase() : ''), 1800); }
      if (tStart) fx.ring(tStart.x, tStart.y, tStart.z, 0x9a5cff, 6, .8); fx.ring(cl.x, cl.y, cl.z, 0x9a5cff, 4, .6); sfx('kamui', a, .7);
      if (t) t.abyssBy = null; a.abyss = null; };
    powers.add({ t: 0, update: dt => { const k = ab.t += dt; ab.swapCd -= dt;
      const h = cl.hero, cd = Math.hypot(cl.x - camS.tx, cl.z - camS.tz) + Math.abs(cl.y - camS.ty) * .5; h.setVisible(cd < 170);
      if (cd < 170) { h.object.position.set(cl.x, cl.y, cl.z); h.object.rotation.y = cl.yaw; h.setGlow(.7); h.update(dt, { speed: 0, localVel: { x: 0, z: 0 }, grounded: true, vy: 0, inWater: 0, wind: { x: 0, z: 0, strength: 0 }, slope: 0, scramble: 0 });
        if (Math.random() < .35) fx.emit(cl.x + (Math.random() - .5), cl.y + Math.random() * 3, cl.z + (Math.random() - .5), 1, { color: [.65, .4, 1], speed: .3, up: 1, life: .8, size: .12, grav: 0 }); }
      if (!a.alive || done) { finish(); return false; }
      if (t && !t.alive) { deadT += dt; if (deadT > 2.5) { finish(); return false; } }
      if (k >= ABYSS_DUR) { finish(); return false; }
      // chuva de estrelas, planetas e buracos negros gigantes (15 s), teleguiada no alvo
      if (t && t.alive && k >= next && k < 1.4 + ABYSS_RAIN && (t.dim === env || t.y > C.y - 30)) { const i = n++; next = k + .3;
        const last = k + .3 >= 1.4 + ABYSS_RAIN, bh = last || i % 10 === 9, pl = !bh && i % 4 === 3;
        aim.set(t.x, t.y + 1.6, t.z);
        const a0 = Math.random() * TAU, from = new THREE.Vector3(C.x + Math.cos(a0) * 58, C.y + 22 + Math.random() * 34, C.z + Math.sin(a0) * 58);
        const col = bh ? 0xb07bff : pl ? 0xff7a3c : [0xffffff, 0xffe08a, 0x9ad8ff, 0xff9ad8][i % 4];
        const size = last ? 9 : bh ? 4.5 : pl ? 2.6 + Math.random() : .6 + Math.random() * .5;
        const obj = bh ? makeBlackHole(size, { particles: 180 }) : pl ? D.planetObj(size, i) : null;
        D.meteor(from, aim, last ? 2.2 : bh ? 1.6 : pl ? 1.2 : .7 + Math.random() * .3, col, size, () => { sfx(bh ? 'implode' : pl ? 'meteor' : 'zap', t, 1);
          if (a === me || t === me) { G.shake = Math.max(G.shake, last ? 1.4 : bh ? 1 : pl ? .6 : .2); if (bh) powers.screenFlash(last ? '#ffffff' : 'rgba(176,123,255,.8)', .6, .9); }
          if (bh) fx.ring(aim.x, C.y + .1, aim.z, 0xffffff, last ? 16 : 8, .7);
          if (auth && t.alive) damage(t, last ? 14 : bh ? 6 : pl ? 4 : 1, a, 'super', bh || pl ? { kx: (Math.random() - .5) * 8, kz: (Math.random() - .5) * 8, up: last ? 9 : 5 } : null); }, obj);
        if (i % 5 === 0) sfx('meteor', a, .5); }
      return true; }, dispose: () => { finish(); ch.dispose(); } });
  } });
  return true;
}
/* NEXUS: troca de lugar com o clone (mundo real ↔ dimensão) */
function swapAbyss(a = me, remoteTo) {
  const ab = a && a.abyss; if (!ab || !a.alive) return false;
  const cl = ab.clone, old = { x: a.x, y: a.y, z: a.z, yaw: a.yaw, inDim: a.dim === ab.env || a.y > ab.C.y - 30 };
  if (remoteTo) { Object.assign(cl, remoteTo); }
  else { if (ab.swapCd > 0 || !a.simulated) return false; ab.swapCd = .8;
    fx.ring(a.x, a.y, a.z, 0x9a5cff, 3, .5); a.x = cl.x; a.y = cl.y; a.z = cl.z; a.yaw = cl.yaw; a.vx = a.vz = a.vy = 0; a.dim = cl.inDim ? ab.env : null; a.vault = a.climb = a.dash = null;
    Object.assign(cl, old); sendFx(a, 'swap', { x: r2(cl.x), y: r2(cl.y), z: r2(cl.z), r: r2(cl.yaw), d: cl.inDim ? 1 : 0 }); }
  sfx('swap', a); fx.flash(new THREE.Vector3(cl.x, cl.y + 1.5, cl.z), 0xb07bff, 4, .3); fx.emit(cl.x, cl.y + 1.5, cl.z, 50, { color: [.7, .5, 1], speed: 5, up: 1, life: .5, size: .16, grav: 0 });
  if (a === me) { camS.init = false; camS.cur = null; powers.screenFlash('rgba(120,60,255,.7)', .4, .8); banner(a.dim ? 'NO ABISMO · ataque!' : 'NO MUNDO REAL · seu clone segura o abismo', 1400); }
  return true;
}
/* CYBER · FLASH ÔMEGA: carrega nas mãos e dispara um feixe de laser gigante que atravessa tudo e destrói o cenário */
function doFlash(a, target, remote, rdir) {
  if (!remote && (a.cd.laser > 0 || a.vault || a.climb || a.drop || a.held || a.dash)) return false;
  const t = remote ? null : target || findTarget(a, 45, .55, moveIntent(a)); if (t) faceTo(a, t); else if (a === me) { a.yaw = Math.atan2(...moveIntent(a)); a.aimT = .45; }
  if (!remote) { a.cd.laser = SKILL_CD.cyber; a.busyMove = 1.9; a.aimT = 2; }
  const r = a.play('flash'), col = SKINS[a.skin].accent, auth = authOf(a); sfx('novaCharge', a, .8); a.hero.setGlow(1);
  const hands = () => { if (!a.alive) return null; const p = a.hero.getHand('r', new THREE.Vector3()), q = a.hero.getHand('l', new THREE.Vector3()); return p.add(q).multiplyScalar(.5); };
  powers.charge(hands, r.impact, col);
  if (!remote) { const d = t ? new THREE.Vector3(t.x - a.x, (t.y + 1.6) - (a.y + 2), t.z - a.z).normalize() : new THREE.Vector3(Math.sin(a.yaw), -.03, Math.cos(a.yaw)); rdir = [r2(d.x), r2(d.y), r2(d.z)]; sendFx(a, 'flash', { d: rdir }); }
  a.pending.push({ t: r.impact, fn: () => { if (!a.alive) return; const o = hands(); let dir = new THREE.Vector3(...rdir);
    if (t && t.alive) dir = t.chest(_v1).sub(o).normalize(); dir.y = clamp(dir.y, -.25, .25); dir.normalize();
    const LEN = 75, R = 2.6, DUR = 1.15; registerFlashShot(a, o, dir); powers.megaBeam(o, dir, LEN, R, DUR, col); powers.cinemaLight(() => o, DUR + .3, col, 13, { gain: 1 }); powers.cinemaLight(() => o.clone().addScaledVector(dir, 6), .5, 0xffffff, 18, { gain: 1 }); sfx('beam', a); sfx('super', a, .8);
    if (Math.hypot(camS.tx - o.x, camS.tz - o.z) < 45) { G.shake = Math.max(G.shake, a === me ? .9 : 1.1); powers.screenFlash('rgba(220,250,255,.85)', .35, a === me ? .55 : .8); }
    // destruição do cenário ao longo do feixe
    const end = o.clone().addScaledVector(dir, LEN);
    if (envOf(a) === world) { const gone = world.destroyAlong(o.x, o.z, end.x, end.z, R + .6);
      for (const v of gone) { const gy = world.terrainAt(v.x, v.z), s2 = v.kind === 'tree' ? 1 : .5; fx.emit(v.x, gy + 2, v.z, (24 * s2) | 0, { color: v.kind === 'rock' ? [.5, .48, .45] : [.45, .3, .15], speed: 10, up: 8, life: 1.4, size: .25, grav: 16 });
        if (v.kind !== 'rock') fx.emit(v.x, gy + 3, v.z, (16 * s2) | 0, { color: [1, .55, .15], speed: 5, up: 5, life: 1.2, size: .2, grav: -1 }); fx.puff(v.x, gy + 1, v.z, (8 * s2) | 0, { r: 1, speed: 3, up: 1.5, size: 2, life: 2, color: [.3, .28, .27] }); }
      const pts = []; for (let k = 4; k < LEN; k += 3.2) { const x = o.x + dir.x * k, z = o.z + dir.z * k, gy = world.terrainAt(x, z); if (o.y + dir.y * k - gy < R + 1.5) pts.push({ x, y: gy, z }); }
      if (pts.length) powers.scorch(pts, 2.4, 12); }
    if (!auth) return; const hitOnce = new Set(); let ticks = 0;
    const zap = () => { for (const e of enemiesOf(a)) { const rx = e.x - o.x, ry = e.y + 1.5 - o.y, rz = e.z - o.z, along = rx * dir.x + ry * dir.y + rz * dir.z; if (along < 0 || along > LEN) continue;
      const px = rx - dir.x * along, py = ry - dir.y * along, pz = rz - dir.z * along; if (Math.hypot(px, py, pz) > R + .7) continue;
      const first = !hitOnce.has(e); hitOnce.add(e); damage(e, first ? 42 : 6, a, first ? 'super' : 'laser', { kx: dir.x * (first ? 18 : 4), kz: dir.z * (first ? 18 : 4), up: first ? 6 : 0 }); if (a === me) hitMarker(); } };
    zap(); const iv = setInterval(() => { if (++ticks > 4 || !a.alive) return clearInterval(iv); zap(); }, 230); } });
  return true;
}
/* CYBER · SUPERNOVA: ascensão física ao espaço, descida contínua pelos três modos empilhados
   e projétil colossal atravessando as três realidades até o modo atual. */
function doNova(a, remote = false) {
  if (!a.alive || a.novaSequence || spaceSt || (!remote && a.hero.isBusy())) return false;
  if (!remote) { a.energy = 0; sendFx(a, 'nova', {}); }
  const E=envOf(a), start={x:a.x,y:a.y,z:a.z,yaw:a.yaw,dim:a.dim||null,grounded:a.grounded};
  const foe=enemiesOf(a).filter(e=>inRealm(e)===inRealm(a)&&e.dim===a.dim&&Math.hypot(e.x-a.x,e.z-a.z)<150).sort((p,q)=>Math.hypot(p.x-a.x,p.z-a.z)-Math.hypot(q.x-a.x,q.z-a.z))[0]||null;
  const dir=foe?new THREE.Vector3(foe.x-a.x,0,foe.z-a.z).normalize():new THREE.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw));
  const target=foe?new THREE.Vector3(foe.x,foe.y+1,foe.z):new THREE.Vector3(start.x+dir.x*68,E.groundAt(start.x+dir.x*68,start.z+dir.z*68,start.y+20,30)+1,start.z+dir.z*68);
  const launch=new THREE.Vector3(start.x,start.y+460,start.z), camera={yaw:camS.yaw,pitch:camS.pitch,dist:camS.dist,mode:camS.mode};
  const currentMode=MODE==='space'?'train':MODE;
  const order=['battle','open','train'].filter(m=>m!==currentMode).concat(currentMode);
  const s={t:0,duration:19.2,start,launch,target,dir,foe,env:E,camera,flags:{},stage:0,done:false,currentMode,order};
  a.novaSequence=s;a.busyMove=20;a.pending.length=0;a.dash=null;a.vx=a.vy=a.vz=0;a.spd=0;a.grounded=false;
  a.play('blitz');a.hero.setGlow(1);solarFocus=a;novaFocus=a;
  setSpace(true,new Set([a.id]),true);
  s.sky=makeSolarStarfield(launch.clone());
  s.stack=powers.modeWorldStack(new THREE.Vector3(start.x,start.y,start.z),target,order,130);
  s.stackPoints=s.stack.points;
  powers.warp(()=>new THREE.Vector3(a.x,a.y+1.6,a.z),()=>new THREE.Vector3(0,1,0),3.6,0xffa044,5.5);
  powers.cinemaLight(()=>new THREE.Vector3(a.x,a.y+2.2,a.z),4.2,0xffa044,34,{gain:2.0,streak:2.2});
  sfx('sonic',a,1.55);if(a===me)banner('SUPERNOVA · ASCENSÃO REAL AO ESPAÇO',2200);
  return true;
}
function finishNovaSequence(a,s,interrupted=false){
  if(!s||s.done)return;s.done=true;if(s.stack)s.stack.dispose();if(s.sky){s.sky.group.removeFromParent();s.sky.geometry.dispose();s.sky.shell.geometry.dispose();s.sky.shell.material.dispose();s.sky.stars.material.dispose();}
  if(spaceSt)setSpace(false);
  a.novaSequence=null;a.busyMove=0;a.dim=s.start.dim;Object.assign(a,{x:s.start.x,y:s.start.y,z:s.start.z,yaw:s.start.yaw,vx:0,vy:0,vz:0,spd:0,grounded:s.start.grounded});
  a.hero.setGlow(.65);novaFocus=null;solarFocus=null;
  camS.yaw=s.camera.yaw;camS.pitch=s.camera.mode==='moba'?.95:s.camera.pitch;camS.dist=s.camera.mode==='moba'?22:s.camera.dist;camS.mode=s.camera.mode;camS.init=false;camS.cur=null;
  document.body.classList.remove('speeding','timewarp');
}
function updateNovaSequence(a,dt){
  const s=a.novaSequence;if(!s)return;if(!a.alive){finishNovaSequence(a,s,true);return;}
  s.t=Math.min(s.duration,s.t+dt);const t=s.t,sm=solarEase;
  const put=(x,y,z,yaw=a.yaw)=>{a.x=x;a.y=y;a.z=z;a.yaw=yaw;a.vx=a.vy=a.vz=0;a.spd=0;a.grounded=false;};
  const setCam=(p,dist,pitch=.72)=>{s.cameraPoint=p.clone();camS.dist=dist;camS.pitch=pitch;camS.yaw=Math.atan2(s.dir.x,s.dir.z);camS.mode='tps';camS.init=true;};
  if(t<3.6){
    const k=sm(t/3.6);put(lerp(s.start.x,s.launch.x,k),lerp(s.start.y,s.launch.y,k),lerp(s.start.z,s.launch.z,k),Math.atan2(s.dir.x,s.dir.z));
    if(!s.flags.ascend){s.flags.ascend=true;a.play('blitz');document.body.classList.add('speeding','timewarp');}
    setCam(new THREE.Vector3(a.x,a.y+3,a.z),18,.2);
  } else if(t<6.6){
    put(s.launch.x,s.launch.y,s.launch.z,Math.atan2(s.dir.x,s.dir.z));
    if(!s.flags.charge){s.flags.charge=true;a.play('omega');sfx('novaCharge',a,1.5);const starPos=s.launch.clone().add(new THREE.Vector3(0,3,0));s.chargeStar=powers.solarStar(starPos,62,9.5,0xffa044);powers.charge(()=>a.hero.getHand('r',new THREE.Vector3()).add(a.hero.getHand('l',new THREE.Vector3())).multiplyScalar(.5),3.0,0xffa044);}
    setCam(new THREE.Vector3(a.x,a.y+3,a.z),150,.22);
  } else if(t<11.5){
    put(s.launch.x,s.launch.y,s.launch.z,Math.atan2(s.dir.x,s.dir.z));
    const k=clamp((t-6.6)/4.9,0,1),seg=k*(s.stackPoints.length-1),idx=Math.min(s.stackPoints.length-2,Math.floor(seg)),f=seg-idx;
    const p=s.stackPoints.length===1?s.stackPoints[0]:s.stackPoints[idx].clone().lerp(s.stackPoints[idx+1],f);
    s.stage=Math.min(2,Math.floor(k*3));setCam(p.clone().add(new THREE.Vector3(0,8,0)),58,.82);
    if(!s.flags.descend){s.flags.descend=true;a.play('channel');banner('TRÊS MODOS · CAMADAS DE REALIDADE',2200);}
  } else if(t<12.8){
    put(s.launch.x,s.launch.y,s.launch.z,Math.atan2(s.dir.x,s.dir.z));
    const k=sm((t-11.5)/1.3),p=s.stackPoints[2].clone().lerp(s.launch.clone().add(new THREE.Vector3(0,5,0)),k);setCam(p,lerp(58,16,k),lerp(.82,.18,k));
    if(!s.flags.returnView){s.flags.returnView=true;a.play('super');sfx('superCharge',a,1.4);}
  } else if(t<14.35){
    put(s.launch.x,s.launch.y,s.launch.z,Math.atan2(s.dir.x,s.dir.z));setCam(s.launch.clone().add(new THREE.Vector3(0,4,0)),14,.12);
    if(!s.flags.launch){s.flags.launch=true;
      if(spaceSt)setSpace(false);
      const from=s.launch.clone().add(new THREE.Vector3(0,1.5,0)),target=s.target.clone();s.projectileStart=from.clone();s.projectileEnd=target.clone();
      const travel=.92;s.projectileAt=12.8;
      powers.warp(()=>s.projectilePos?s.projectilePos.clone():from.clone(),()=>target.clone().sub(from).normalize(),travel,0xffb34a,7.5);
      powers.novaProjectile(from,()=>target.clone(),travel,0xffa044,()=>{
        powers.supernova(target,180,0xffa044,()=>{
          if(MODE==='battle')realityFracture(target,8.5);sfx('nova',a,1.65);
          fx.flash(target,0xffffff,230,.85);fx.ring(target.x,target.y,target.z,0xffe3a1,260,1.2,.9);fx.ring(target.x,target.y,target.z,0xff7b24,390,1.8,1.2);
          if(s.env===world){const gone=world.destroyAlong(target.x,target.z,target.x,target.z,145);debris(gone.slice(0,180));const pts=[{x:target.x,y:world.terrainAt(target.x,target.z),z:target.z}];for(let i=0;i<64;i++){const an=i/64*TAU,d=8+(i%8)*13,x=target.x+Math.cos(an)*d,z=target.z+Math.sin(an)*d;pts.push({x,y:world.terrainAt(x,z),z});}powers.scorch(pts,24,28);}
          if(authOf(a))for(const e of enemiesOf(a)){const dx=e.x-target.x,dz=e.z-target.z,d=Math.hypot(dx,dz);if(TUT||(d<145&&Math.abs(e.y-target.y)<95))damage(e,Math.max(1,Math.ceil(e.hp/CS.mulAt(a.char,a.lvl||1))),a,'super',{kx:dx/(d||1)*55,kz:dz/(d||1)*55,up:28});}
          G.shake=Math.max(G.shake,3.2);powers.screenFlash('rgba(255,246,224,1)',.9,1);
        });
      },18);
      sfx('beam',a,1.7);banner('SUPERNOVA · RUPTURA DAS TRÊS REALIDADES',2200);
    }
    const k=clamp((t-12.8)/.92,0,1),p=s.projectileStart.clone().lerp(s.projectileEnd,k);s.projectilePos=p;setCam(p,165,.16);
  } else {
    if(!s.flags.impactView){s.flags.impactView=true;const p=s.projectileEnd.clone();setCam(p.clone().add(new THREE.Vector3(0,28,0)),95,.92);G.shake=Math.max(G.shake,3.4);}
    const k=sm((t-14.35)/2.6);put(lerp(s.launch.x,s.start.x,k),lerp(s.launch.y,s.start.y,k),lerp(s.launch.z,s.start.z,k),s.start.yaw);
    const camK=sm((t-16.0)/2.0),p=s.projectileEnd.clone().lerp(new THREE.Vector3(s.start.x,s.start.y+2.2,s.start.z),camK);setCam(p,lerp(95,10,camK),lerp(.92,.2,camK));
    if(!s.flags.land&&t>16.5){s.flags.land=true;a.play('land',10);}
  }
  if(s.stack)s.stack.update(t);
  if(s.sky){s.sky.group.rotation.y+=dt*.12;s.sky.stars.material.opacity=t<12.8?.96:Math.max(0,.96-(t-12.8)*.8);}
  if(t>=s.duration)finishNovaSequence(a,s,false);
}

/* NEXUS · VELOCIDADE ABSOLUTA: corre tão rápido que rasga o tecido do universo, acelerando entre os inimigos e acertando raios de velocidade */
function blitzPath(a) {
  const lim = (x, z) => { if (a.dim) { const E = a.dim, dx = x - E.cx, dz = z - E.cz, d = Math.hypot(dx, dz), m = E.R - 1.5; return d > m ? [E.cx + dx / d * m, E.cz + dz / d * m] : [x, z]; } if (inRealm(a)) return [x, z]; return [clamp(x, -WD.HX + 4, WD.HX - 4), clamp(z, -WD.HZ + 4, WD.HZ - 4)]; };
  const rest = enemiesOf(a).filter(e => Math.hypot(e.x - a.x, e.z - a.z) < 40 && Math.abs(e.y - a.y) < 8), path = [[a.x, a.z, '']]; let cx = a.x, cz = a.z;
  while (rest.length && path.length < 4) { rest.sort((p, q) => Math.hypot(p.x - cx, p.z - cz) - Math.hypot(q.x - cx, q.z - cz)); const e = rest.shift(), dx = e.x - cx, dz = e.z - cz, d = Math.hypot(dx, dz) || 1; const q = lim(e.x + dx / d * 3.5, e.z + dz / d * 3.5); path.push([q[0], q[1], e.id]); cx = q[0]; cz = q[1]; }
  if (path.length === 1) { const f = moveIntent(a) || [Math.sin(a.yaw), Math.cos(a.yaw)], L = inRealm(a) ? 16 : 38, q = lim(a.x + f[0] * L, a.z + f[1] * L); path.push([q[0], q[1], '']); }
  return path;
}
/* DESTRUIÇÃO DO CENÁRIO: todo poder destrutivo derruba árvores, arbustos e pedras no caminho/área.
   defer=true devolve a lista sem criar os detritos (usado quando o mundo está escondido durante a viagem no espaço-tempo). */
function ruin(a, ax, az, bx, bz, R, defer) {
  if (envOf(a) !== world) return [];
  const gone = world.destroyAlong(ax, az, bx, bz, R); if (!defer) debris(gone); return gone;
}
function debris(gone) {
  for (const v of gone) { const gy = world.terrainAt(v.x, v.z), s2 = v.kind === 'tree' ? 1 : .5;
    fx.emit(v.x, gy + 2, v.z, (22 * s2) | 0, { color: v.kind === 'rock' ? [.5, .48, .45] : [.45, .3, .15], speed: 11, up: 8, life: 1.4, size: .25, grav: 16 });
    if (v.kind !== 'rock') fx.emit(v.x, gy + 3, v.z, (14 * s2) | 0, { color: [1, .55, .15], speed: 5, up: 5, life: 1.2, size: .2, grav: -1 });
    fx.puff(v.x, gy + 1, v.z, (7 * s2) | 0, { r: 1, speed: 3, up: 1.5, size: 2, life: 2, color: [.3, .28, .27] }); }
  if (gone.length && Math.hypot(camS.tx - gone[0].x, camS.tz - gone[0].z) < 70) G.shake = Math.max(G.shake, .3);
}
/* VIAGEM ESPAÇO-TEMPO: esconde o mundo real e troca a luz/névoa por um vazio violeta (reaproveita o mecanismo do Mundo Cristal) */
let spaceSt = null;
function setSpace(on, ids, hideRealm = false) {
  if (on === !!spaceSt) return;
  if (on) {
    // Guarda o estado EXATO do ambiente atual (incluindo Mundo Cristal/teste), não apenas o preset do Vale.
    spaceSt = { ids: ids || new Set(), hid: [], hideRealm, realmVisible: realm && realm.group ? realm.group.visible : null,
      cullHold: world.cullHold, hemiC: hemi.color.clone(), hemiG: hemi.groundColor.clone(), hemiI: hemi.intensity,
      sunC: sun.color.clone(), sunI: sun.intensity, fogC: scene.fog.color.clone(), fogN: scene.fog.near, fogF: scene.fog.far, exp: renderer.toneMappingExposure };
    ENV.spaceOn = true; world.cullHold = true;
    for (const o of worldObjs) { if (o.isLight || o === sun.target || o === realm?.group) continue; if (o.visible) { o.visible = false; spaceSt.hid.push(o); } }
    // realm.group é criado depois de worldObjs; ocultá-lo explicitamente é essencial no Mundo de Teste/Cristal.
    if (hideRealm && realm?.group) realm.group.visible = false;
    hemi.color.set(0xb89cff); hemi.groundColor.set(0x1a1038); hemi.intensity = 1.25; sun.color.set(0xc8d4ff); sun.intensity = 2.2; scene.fog.color.set(0x0a0620); scene.fog.near = 90; scene.fog.far = 520; renderer.toneMappingExposure = 1.2;
  } else {
    const prev = spaceSt;
    for (const o of prev.hid) o.visible = true;
    if (realm?.group && prev.realmVisible !== null) realm.group.visible = prev.realmVisible;
    world.cullHold = prev.cullHold; spaceSt = null; ENV.spaceOn = false;
    hemi.color.copy(prev.hemiC); hemi.groundColor.copy(prev.hemiG); hemi.intensity = prev.hemiI; sun.color.copy(prev.sunC); sun.intensity = prev.sunI; scene.fog.color.copy(prev.fogC); scene.fog.near = prev.fogN; scene.fog.far = prev.fogF; renderer.toneMappingExposure = prev.exp;
  }
}
function startVelocityDuel(a, b, mid) {
  if (spaceSt || !a.alive || !b.alive || a.velocityDuel || b.velocityDuel) return false;
  const start = { a: { x: a.x, y: a.y, z: a.z, yaw: a.yaw, dim: a.dim || null }, b: { x: b.x, y: b.y, z: b.z, yaw: b.yaw, dim: b.dim || null } };
  const c = new THREE.Vector3(mid.x, Math.max(a.y, b.y) + 70, mid.z), s = { t: 0, duration: 6.5, opponent: b, start, center: c, hits: 0, nextHit: .8, done: false };
  a.velocityDuel = s; b.velocityDuelBy = a.id; a.pending.length = b.pending.length = 0; a.dash = b.dash = null; a.busyMove = b.busyMove = 6.6;
  const ids = new Set([a.id, b.id]); setSpace(true, ids, true); const dim = powers.dimension(c, 56, 7); dim.D.plat.visible = false; s.dimension = dim;
  solarFocus = a; camS.mode = 'tps'; camS.pitch = .1; camS.dist = 10; camS.init = false; camS.cur = null;
  a.play('blitz'); b.play('blitz'); powers.rift(() => c.clone(), 6.5, 0xc7a6ff); fx.ring(c.x, c.y, c.z, 0xffffff, 18, .8, .45); sfx('sonic', a, 1.2);
  if (a === me || b === me) banner('COLISÃO DE VELOCIDADE · DUELO DIMENSIONAL', 2200);
  return true;
}
function updateVelocityDuel(a, dt) {
  const s = a.velocityDuel; if (!s) return; const b = s.opponent; if (!a.alive || !b || !b.alive) { finishVelocityDuel(a, s); return; }
  s.t = Math.min(s.duration, s.t + dt); const t = s.t, c = s.center;
  const put = (p, x, y, z, yaw) => { p.x = x; p.y = y; p.z = z; p.yaw = yaw; p.vx = p.vy = p.vz = 0; p.spd = 0; p.grounded = false; };
  put(a, c.x - 2.1, c.y + Math.sin(t * 5) * .18, c.z, Math.PI / 2); put(b, c.x + 2.1, c.y - Math.sin(t * 5) * .18, c.z, -Math.PI / 2);
  if (t >= s.nextHit && t < 5.8) { s.nextHit += .48; const left = s.hits++ % 2 === 0, hitter = left ? a : b, victim = left ? b : a; hitter.play('punch'); victim.play('hit', hitter.yaw); const p = victim.chest(new THREE.Vector3()); fx.impact(p, 0xd9caff, true); fx.ring(p.x, p.y, p.z, 0x9f79ff, 4.5, .35, .2); powers.cinemaLight(() => victim.chest(new THREE.Vector3()), .2, 0xffffff, 5, { gain: 1.1 }); sfx('punch', hitter, .8); if (a === me || b === me) G.shake = Math.max(G.shake, .3); }
  if (t >= s.duration) finishVelocityDuel(a, s);
}
function finishVelocityDuel(a, s) {
  if (!s || s.done) return; s.done = true; const b = s.opponent; if (s.dimension) s.dimension.kill = true; setSpace(false);
  a.velocityDuel = null; a.dim = s.start.a.dim; Object.assign(a, { x: s.start.a.x, y: s.start.a.y, z: s.start.a.z, yaw: s.start.a.yaw, vx: 0, vy: 0, vz: 0, spd: 0, grounded: true, busyMove: 0 });
  if (b) { b.velocityDuelBy = null; b.dim = s.start.b.dim; Object.assign(b, { x: s.start.b.x, y: s.start.b.y, z: s.start.b.z, yaw: s.start.b.yaw, vx: 0, vy: 0, vz: 0, spd: 0, grounded: true, busyMove: 0 }); }
  solarFocus = null; camS.init = false; camS.cur = null; if (MODE === 'battle') realityFracture(s.center, 3.5); powers.screenFlash('rgba(255,255,255,.75)', .25, .8);
}
function registerVelocityBurst(a, path) {
  const nowT = performance.now(); for (let i = velocityBursts.length - 1; i >= 0; i--) if (velocityBursts[i].until < nowT) velocityBursts.splice(i, 1);
  const p0 = path[0], p1 = path[1], dir = new THREE.Vector2(p1[0] - p0[0], p1[1] - p0[1]).normalize(), burst = { a, p0: new THREE.Vector2(p0[0], p0[1]), dir, until: nowT + 1600 }; velocityBursts.push(burst);
  for (const o of velocityBursts) { if (o === burst || o.a === a) continue; const key = [a.id, o.a.id].sort().join(':'); if (velocityClashes.has(key) || burst.dir.dot(o.dir) > -.72) continue; const delta = o.p0.clone().sub(burst.p0); if (delta.length() > 24) continue; velocityClashes.add(key); let clearT = 0; powers.add({ t: 0, update: dt => (clearT += dt) < 8, dispose: () => velocityClashes.delete(key) }); return startVelocityDuel(a, o.a, { x: (p0[0] + o.p0.x) * .5, z: (p0[1] + o.p0.y) * .5 }); }
  return false;
}

function doBlitz(a, remote, pathIn) {
  if (!remote && (a.cd.vel > 0 || a.vault || a.climb || a.drop || a.held || a.dash || a.hero.isBusy())) return false;
  const path = remote ? pathIn : blitzPath(a); if (!path || path.length < 2) return false;
  if (!remote) { a.cd.vel = SKILL_CD.vel; sendFx(a, 'blitz', { p: path.map(q => [r2(q[0]), r2(q[1]), q[2] || '']) }); }
  if (registerVelocityBurst(a, path)) return true;
  const auth = authOf(a), col = 0xc9a8ff, focusA = G.spec || me, imm = a === focusA;   // imm = quem assiste de dentro do espaço-tempo
  a.play('blitz'); sfx('superCharge', a, .8); a.hero.setGlow(1);
  if (imm) banner('EXPANSÃO · ESPAÇO-TEMPO', 1500);
  const chest = () => new THREE.Vector3(a.x, a.y + 1.6, a.z);
  fx.puff(a.x, a.y, a.z, 20, { r: .6, speed: 5, up: .3, size: 1, life: .8 }); fx.ring(a.x, a.y + .1, a.z, col, 7, .7, .3);
  // segmentos: aceleram a cada alvo; pausa curta no impacto para o golpe "pesar"
  const segs = []; let T = 0; for (let i = 1; i < path.length; i++) { const p = path[i - 1], q = path[i], L = Math.hypot(q[0] - p[0], q[1] - p[1]), v = 46 + i * 14, du = Math.max(.22, L / v), hold = q[2] ? .2 : 0; segs.push({ x0: p[0], z0: p[1], x1: q[0], z1: q[1], du, hold, id: q[2], t0: T }); T += du + hold; }
  const W = .5; a.busyMove = W + T + .7;
  const ids = new Set([a.id]); for (const q of path) if (q[2]) ids.add(q[2]);
  let t0 = 0, done = false; const held = [];
  const segAt = () => { const tt = (performance.now() - t0) / 1000; let g = segs[0]; for (const sg of segs) if (tt >= sg.t0) g = sg; return g; };
  const dirNow = () => { const g = segAt(), l = Math.hypot(g.x1 - g.x0, g.z1 - g.z0) || 1; return new THREE.Vector3((g.x1 - g.x0) / l, 0, (g.z1 - g.z0) / l); };
  const finish = () => { if (done) return; done = true;
    if (imm) { powers.screenFlash('rgba(255,255,255,.96)', .5, 1); setSpace(false); document.body.classList.remove('speeding', 'timewarp'); }
    debris(held); held.length = 0; };
  powers.cinemaLight(chest, W + .25, col, 8, { gain: .9 });
  // carga: a luz cresce e o tempo "rasga" antes de entrar no espaço
  a.pending.push({ t: W - .18, fn: () => { if (!a.alive) return; fx.flash(chest(), 0xffffff, 4, .25); fx.ring(a.x, a.y + 1, a.z, 0xffffff, 9, .35, .25); if (imm) powers.screenFlash('rgba(210,185,255,.95)', .32, 1); } });
  a.pending.push({ t: W, fn: () => { if (!a.alive) { finish(); return; } t0 = performance.now(); sfx('sonic', a); fx.shock(a.x, a.y, a.z, col);
    if (a.simulated) a.dash = { segs, i: 0, t: 0, h: 0 };
    if (!imm) powers.rift(() => a.alive ? new THREE.Vector3(a.x, a.y, a.z) : null, T + .12, 0x9a5cff);
    powers.cinemaLight(chest, T + .35, col, imm ? 5 : 9, { gain: imm ? .22 : .8, streak: imm ? .7 : 1 });           // luz de filme acompanhando o herói
    if (imm) {
      setSpace(true, ids); const c0 = camera.position.clone();
      const dm = powers.dimension(c0, 110, T + .8); dm.D.plat.visible = false;
      powers.add({ t: 0, update: () => { dm.D.group.position.lerpVectors(c0, camera.position, .65); return !dm.dead; } });
      powers.warp(chest, dirNow, T + .6, col);
      document.body.classList.add('speeding', 'timewarp');
      setTimeout(finish, (T + 1.6) * 1000);                                // garantia: sempre volta ao mundo real
    } else powers.warp(chest, dirNow, T + .3, col, .5); } });
  for (const sg of segs) {
    // tudo no caminho é destruído (com o mundo escondido, os detritos aparecem na volta)
    a.pending.push({ t: W + sg.t0, fn: () => { const g = ruin(a, sg.x0, sg.z0, sg.x1, sg.z1, 3.6, imm); if (imm) held.push(...g); } });
    a.pending.push({ t: W + sg.t0 + sg.du, fn: () => { if (!a.alive) return; const P = new THREE.Vector3(sg.x1, a.y + 1.5, sg.z1); sfx('sonic', a, .8);
      fx.ring(sg.x1, a.y + .1, sg.z1, col, 5, .45); fx.flash(P, 0xffffff, 3, .18);
      const e = sg.id ? actors.get(sg.id) : null;
      if (e && e.alive) { const c = e.chest(new THREE.Vector3()); powers.cinemaLight(() => c, .55, 0xffffff, 9, { gain: 1 });
        for (let k = 0; k < 5; k++) { const s0 = P.clone().add(new THREE.Vector3((Math.random() - .5) * 4, (Math.random() - .5) * 3, (Math.random() - .5) * 4)); powers.bolt(s0, c, k % 2 ? 0xffffff : col, .4, .24); }
        fx.impact(c, col, true); fx.ring(c.x, c.y, c.z, 0xffffff, 8, .4, .3); sfx('punch', e); if (a === me || e === me || imm) G.shake = Math.max(G.shake, .7);
        if (imm || e === me) G.slowUntil = performance.now() + 130;           // câmera lenta curta no impacto
        if (auth) { const dx = sg.x1 - sg.x0, dz = sg.z1 - sg.z0, l = Math.hypot(dx, dz) || 1; damage(e, 24, a, 'super', { kx: dx / l * 16, kz: dz / l * 16, up: 7 }); if (e.simulated) e.stunT = Math.max(e.stunT || 0, .7); if (a === me) hitMarker(); } } } });
  }
  a.pending.push({ t: W + T + .05, fn: () => { finish(); if (!a.alive) return; fx.shock(a.x, a.y, a.z, col); sfx('super', a, .7); powers.cinemaLight(chest, .7, 0xffffff, 15, { gain: 1 });
    if (Math.hypot(camS.tx - a.x, camS.tz - a.z) < 25) G.shake = Math.max(G.shake, .8);
    ruin(a, a.x, a.z, a.x, a.z, 5);
    if (auth) for (const e of enemiesOf(a)) { const dx = e.x - a.x, dz = e.z - a.z, d = Math.hypot(dx, dz); if (d < 5.5 && Math.abs(e.y - a.y) < 3) damage(e, 10, a, 'super', { kx: dx / (d || 1) * 12, kz: dz / (d || 1) * 12, up: 6 }); } } });
  return true;
}
/* ATLAS · poderes próprios: defesa de contra-impacto, pulso de pressão e ruptura sísmica. */
function doAtlasGuard(a, remote=false) {
  if (!remote && (a.cd.laser>0 || a.vault || a.climb || a.drop || a.held || a.hero.isBusy())) return false;
  if (!remote) { a.cd.laser=SKILL_CD.nexus; sendFx(a,'atlasGuard',{}); }
  a.atlasGuardUntil=world.time+1.15; a.play('laser'); a.busyMove=.42; a.hero.setGlow(1); sfx('charge',a,.75);
  if (a===me) banner('RESSONÂNCIA · CONTRA-IMPACTO',1250);
  const P=new THREE.Vector3(a.x,a.y+1.35,a.z); fx.ring(P.x,P.y,P.z,0xc45aff,4.2,.55,.35); powers.cinemaLight(()=>new THREE.Vector3(a.x,a.y+1.4,a.z),1.05,0xb34cff,5,{gain:.55});
  // Se ninguém atingir o escudo, a energia acumulada é liberada como pulso; se houver contra-impacto, a reflexão substitui o pulso.
  a.pending.push({t:1.0,fn:()=>{if(a.alive && a.atlasGuardUntil>world.time) doAtlasResonance(a,remote);}});
  return true;
}
function doAtlasResonance(a,remote=false) {
  if (!remote && (a.energy<100 || a.vault || a.climb || a.drop || a.held || a.dash || a.hero.isBusy())) return false;
  if (!remote) { a.energy=0; sendFx(a,'atlasResonance',{}); }
  const auth=authOf(a), origin=new THREE.Vector3(a.x,a.y,a.z), col=0xb638ff; a.play('super'); a.busyMove=1.25; a.hero.setGlow(1); sfx('superCharge',a,1);
  if(a===me) banner('RESSONÂNCIA ZERO',1700);
  powers.cinemaLight(()=>new THREE.Vector3(a.x,a.y+1.4,a.z),1.2,col,13,{gain:1.1,streak:1});
  a.pending.push({t:.48,fn:()=>{ if(!a.alive)return; const p=new THREE.Vector3(a.x,a.y+.12,a.z); fx.ring(p.x,p.y,p.z,0xffffff,16,.7,.45); fx.shock(p.x,p.y,p.z,col); fx.flash(new THREE.Vector3(p.x,p.y+1.2,p.z),col,8,.3); sfx('super',a,1.05); if(Math.hypot(camS.tx-p.x,camS.tz-p.z)<24)G.shake=Math.max(G.shake,.75);
    if(auth) for(const e of enemiesOf(a)){const dx=e.x-a.x,dz=e.z-a.z,d=Math.hypot(dx,dz); if(d>9||Math.abs(e.y-a.y)>3)continue; const k=1-d/12; damage(e,Math.round(27*k),a,'super',{kx:dx/(d||1)*(9+5*k),kz:dz/(d||1)*(9+5*k),up:4.5}); if(e.simulated)e.stunT=Math.max(e.stunT||0,.9);}
  }}); return true;
}
function doAtlasRift(a,remote=false) {
  if(!remote && (a.cd.vel>0||a.vault||a.climb||a.drop||a.held||a.hero.isBusy()))return false;
  if(!remote){a.cd.vel=SKILL_CD.velC;sendFx(a,'atlasRift',{});}
  const auth=authOf(a),dir=new THREE.Vector3(Math.sin(a.yaw),0,Math.cos(a.yaw)),side=new THREE.Vector3(dir.z,0,-dir.x),start=new THREE.Vector3(a.x,a.y+.12,a.z); a.play('super');a.busyMove=1.05;a.hero.setGlow(1);sfx('charge',a,.9);
  if(a===me)banner('FENDA SÍSMICA',1300);
  const hit=new Set(); for(let i=1;i<=3;i++){const dist=i*3.7,pt=start.clone().addScaledVector(dir,dist); a.pending.push({t:.12+i*.16,fn:()=>{if(!a.alive)return;fx.ring(pt.x,pt.y,pt.z,0xb638ff,5+i*1.2,.48,.3);fx.shock(pt.x,pt.y,pt.z,0x9b35e8);const crack=pt.clone();crack.y+=.35;fx.flash(crack,0xd9a2ff,5,.22);if(auth)for(const e of enemiesOf(a)){if(hit.has(e.id))continue;const dx=e.x-a.x,dz=e.z-a.z,along=dx*dir.x+dz*dir.z,across=Math.abs(dx*side.x+dz*side.z);if(along>dist-2.1&&along<dist+2.1&&across<2.5&&Math.abs(e.y-a.y)<2.4){hit.add(e.id);damage(e,18,a,'super',{kx:dir.x*9,kz:dir.z*9,up:2.5});if(e.simulated)e.stunT=Math.max(e.stunT||0,.45);}}}});}
  powers.cinemaLight(()=>new THREE.Vector3(a.x,a.y+1.2,a.z),.8,0xa82cff,7,{gain:.6});return true;
}

/* ATLAS · ABISMO ETERNO: sequência cinematográfica 3D de força física, sem efeitos gráficos. */
function doAbyssFist(a, target, remote = false) {
  if (!remote && (spaceSt || a.energy < 100 || a.atlasSequence || a.atlasVictim || a.vault || a.climb || a.drop || a.held || a.dash || a.hero.isBusy())) return false;
  const v = remote ? target : target || findTarget(a, 10, 1.5, moveIntent(a));
  if (!v || !v.alive || v === a || v.atlasVictim || v.atlasSequence || mates(a, v)) { if (!remote && a === me) banner('ABISMO ETERNO · aproxime-se de um adversário', 1500); return false; }
  if (!remote) { a.energy = 0; sendFx(a, 'atlasFist', { tg: v.id }); }
  faceTo(a, v); const yaw = a.yaw, dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const start = { a: { x: a.x, y: a.y, z: a.z, yaw: a.yaw, dim: a.dim || null }, v: { x: v.x, y: v.y, z: v.z, yaw: v.yaw, dim: v.dim || null } };
  const center = new THREE.Vector3((a.x + v.x) * .5, Math.max(a.y, v.y) + 92, (a.z + v.z) * .5);
  const ids = new Set([a.id, v.id]); const camera = { yaw: camS.yaw, pitch: camS.pitch, dist: camS.dist, mode: camS.mode };
  const s = { t: 0, duration: 30, victim: v, start, center, dir, yaw, ids, camera, flags: {}, hits: 0, nextHit: 5.65, startAt: performance.now(), owner: a, remote };
  a.atlasSequence = s; v.atlasVictim = a.id; a.busyMove = v.busyMove = 30.1;
  a.vx = a.vy = a.vz = v.vx = v.vy = v.vz = 0; a.dash = v.dash = null; a.vault = v.vault = null; a.climb = v.climb = null;
  a.play('super'); v.play('hit', yaw); a.hero.setGlow(1);
  solarFocus = a; camS.mode = 'tps'; camS.pitch = .12; camS.dist = 11; camS.init = false; camS.cur = null;
  setSpace(true, ids, true); const dim = powers.dimension(center, 82, 31); dim.D.plat.visible = false;
  s.dimension = dim; s.hole = makeBlackHole(12, { color: 0x8a4cff, color2: 0x25d9ff, particles: 340, speed: 1.35 });
  s.hole.group.position.copy(center).add(new THREE.Vector3(0, -7, -36)); scene.add(s.hole.group);
  powers.rift(() => center.clone().add(new THREE.Vector3(0, -4, 0)), 2.4, 0x8a4cff);
  powers.warp(() => a.alive ? new THREE.Vector3(a.x, a.y + 1.6, a.z) : null, () => dir, 3, 0x8a4cff, 2.6);
  sfx('superCharge', a, 1.1);
  if (a === me) banner('ATLAS · ABISMO ETERNO', 2200);
  if (a === me || v === me) powers.screenFlash('rgba(120,75,255,.72)', .4, .85);
  return true;
}
function atlasSequenceGrip(a, v, d) {
  if (!a?.hero || !v?.hero) return;
  // Mantém as mãos do alvo junto ao tronco, evitando a pose de braços abertos.
  v.hero.object.updateMatrixWorld(true);
  const chest = v.chest(new THREE.Vector3());
  const forward = new THREE.Vector3(Math.sin(v.yaw), 0, Math.cos(v.yaw));
  const side = new THREE.Vector3(Math.cos(v.yaw), 0, -Math.sin(v.yaw));
  const victimLeft = chest.clone().addScaledVector(side, .27).addScaledVector(forward, .24).add(new THREE.Vector3(0, -.34, 0));
  const victimRight = chest.clone().addScaledVector(side, -.27).addScaledVector(forward, .24).add(new THREE.Vector3(0, -.34, 0));
  v.hero.setContactGrip(victimLeft, victimRight);
  // Atlas mantém a mão esquerda presa ao ombro/collarinho; a direita fica livre para a coreografia.
  v.hero.object.updateMatrixWorld(true);
  const hold = v.hero.J.shL ? v.hero.J.shL.getWorldPosition(new THREE.Vector3()) : chest.clone();
  hold.addScaledVector(forward, .10).add(new THREE.Vector3(0, .07, 0));
  a.hero.setContactGrip(hold, null);
}
function atlasSequenceImpact(a, v, point, direction, strength = 1) {
  v.play('hit', a.yaw); v.hero.hitFlash();
  // Reação visual estilizada: compressão breve e recuo do tronco, sem deformação gráfica.
  v.hero.setSoftContact(point, .08 + .045 * strength);
  if (v.hero.soft) {
    v.hero.soft.chest.v += .62 * strength;
    v.hero.soft.abdomen.v += .42 * strength;
    v.hero.soft.shoulder.v += .30 * strength;
  }
  if (v.hero.inr) {
    v.hero.inr.x.v -= 2.4 * strength;
    v.hero.inr.head.v -= 3.1 * strength;
    v.hero.inr.arm.v += 1.8 * strength;
  }
  audio.playImpact(point, .58 + .12 * strength, v.char || 'atlas');
}
function finishAtlasFist(a, s, interrupted = false) {
  if (!s || s.done) return; s.done = true; const v = s.victim;
  if (s.hole) s.hole.dispose(); if (s.dimension) s.dimension.kill = true; a.hero.setContactElbow(null); a.hero.setContactGrip(null, null);
  if (s.camera) { camS.yaw = s.camera.yaw; camS.pitch = s.camera.mode === 'moba' ? .95 : s.camera.pitch; camS.dist = s.camera.mode === 'moba' ? 22 : s.camera.dist; camS.mode = s.camera.mode; SET.cam = camS.mode; saveSet(); $('bView').textContent = camS.mode === 'tps' ? 'CÂMERA · PERTO' : 'CÂMERA · ALTA'; camS.init = false; camS.cur = null; }
  setSpace(false); a.atlasSequence = null; a.busyMove = 0; a.hero.setGlow(.65);
  a.dim = s.start.a.dim; Object.assign(a, { x: s.start.a.x, y: s.start.a.y, z: s.start.a.z, yaw: s.start.a.yaw, vx: 0, vy: 0, vz: 0, spd: 0, grounded: true });
  if (v) { v.dim = s.start.v.dim; Object.assign(v, { x: s.start.v.x, y: s.start.v.y, z: s.start.v.z, yaw: s.start.v.yaw, vx: 0, vy: 0, vz: 0, spd: 0, grounded: true }); v.atlasVictim = null; v.busyMove = 0; v.hero.setContactGrip(null, null); v.hero.clearSoftContact?.(); if (!interrupted && authOf(a) && v.alive) damage(v, 8, a, 'super', { kx: s.dir.x * 5, kz: s.dir.z * 5, up: 2 }); }
  solarFocus = null; camS.init = false; camS.cur = null; document.body.classList.remove('speeding', 'timewarp');
  if (!interrupted && MODE === 'battle') realityFracture(new THREE.Vector3(s.center.x, s.center.y - 20, s.center.z), 3.5);
  if (a === me || v === me) powers.screenFlash('rgba(255,255,255,.9)', .35, .9);
}
function updateAtlasFist(a, dt) {
  const s = a.atlasSequence; if (!s) return; const v = s.victim;
  if (!a.alive || !v || !v.alive) { finishAtlasFist(a, s, true); return; }
  s.t = Math.min(30, s.t + dt); const t = s.t, c = s.center, d = s.dir; if (s.hole) s.hole.update(dt, camera);
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  // Durante a coreografia os dois corpos ficam em distância de contato, sem atravessar um ao outro.
  const put = (actor, x, y, z, yaw) => { actor.x = x; actor.y = y; actor.z = z; actor.yaw = yaw; actor.vx = actor.vy = actor.vz = 0; actor.spd = 0; actor.grounded = false; actor.hero.object.position.set(x, y, z); actor.hero.object.rotation.y = yaw; actor.hero.object.updateMatrixWorld(true); };
  if (t < 2.4) { const k = smooth(t / 2.4); put(a, lerp(s.start.a.x, s.start.v.x - d.x * 1.15, k), lerp(s.start.a.y, s.start.v.y, k), lerp(s.start.a.z, s.start.v.z - d.z * 1.15, k), s.yaw); put(v, s.start.v.x, s.start.v.y, s.start.v.z, s.yaw + Math.PI); atlasSequenceGrip(a, v, d); }
  else if (t < 5.55) { const k = smooth((t - 2.4) / 3.15); const ax = c.x - d.x * .8, az = c.z - d.z * .8; put(a, lerp(s.start.v.x - d.x * 1.15, ax, k), lerp(s.start.a.y + 1, c.y, k), lerp(s.start.v.z - d.z * 1.15, az, k), s.yaw); put(v, lerp(s.start.v.x, c.x + d.x * .8, k), lerp(s.start.v.y + 1.5, c.y, k), lerp(s.start.v.z, c.z + d.z * .8, k), s.yaw + Math.PI); atlasSequenceGrip(a, v, d); }
  else if (t < 25.6) {
    const phase = t - 5.55; const orbit = Math.sin(phase * 1.4) * .28;
    const elbowWindup = !!s.pendingElbow && t < s.pendingElbow.at;
    const gap = elbowWindup ? .415 : .8;
    put(a, c.x - d.x * gap, c.y + Math.sin(phase * 2.2) * .18, c.z - d.z * gap, s.yaw + orbit);
    put(v, c.x + d.x * gap, c.y + Math.cos(phase * 1.8) * .22, c.z + d.z * gap, s.yaw + Math.PI - orbit);
    atlasSequenceGrip(a, v, d);
    if (t > 13.5 && !s.flags.breathMid) { s.flags.breathMid = true; }
    if (s.pendingElbow && t < s.pendingElbow.at) {
      const side = new THREE.Vector3(-d.z,0,d.x), contact = v.chest(new THREE.Vector3()).addScaledVector(d,-.34).addScaledVector(side,.2); contact.y = v.y + 2.28;
      a.hero.setContactElbow(contact);
      v.hero.setSoftContact(contact,.13);
    }
    // A cotovelada só acerta se a junta do cotovelo realmente alcança a superfície do tórax.
    if (s.pendingElbow && t >= s.pendingElbow.at) {
      const elbow = a.hero.J.faR.getWorldPosition(new THREE.Vector3());
      const targetChest = v.chest(new THREE.Vector3()).addScaledVector(d,-.34).add(new THREE.Vector3(0,.43,0)).addScaledVector(new THREE.Vector3(-d.z,0,d.x),.2);
      const contactDist = elbow.distanceTo(targetChest);
      if (contactDist <= .42) {
        const p = elbow.clone().lerp(targetChest, .5);
        atlasSequenceImpact(a, v, p, d, 1.15);
        a.hero.soft.shoulder.v += .9; a.hero.soft.chest.v += .7;
        fx.impact(p, 0xc99aff, true); fx.ring(p.x, p.y, p.z, 0xc99aff, 5.4, .48, .3); fx.flash(p, 0xffffff, 4.8, .2);
        powers.cinemaLight(() => p.clone(), .24, 0xc99aff, 8, { gain: 1.15 });
        if (authOf(a)) damage(v, 5, a, 'super', { kx: d.x * 2.8, kz: d.z * 2.8, up: .8 });
        if (a === me || v === me) G.shake = Math.max(G.shake, .48);
      } else {
        // Sem contato geométrico, não inventa acerto: registra só o som de passagem e não aplica dano.
        sfx('whoosh', a, .72);
      }
      s.pendingElbow = null; a.hero.setContactElbow(null); v.hero.clearSoftContact?.();
    }
    if (t >= s.nextHit) {
      s.nextHit += .82; const n = s.hits++, kick = n % 5 === 4, elbowStrike = n % 4 === 2;
      if (elbowStrike) {
        a.play('elbow'); s.pendingElbow = { at: t + .245 };
      } else {
        a.play(kick ? 'super' : 'punch');
        const p = v.chest(new THREE.Vector3()); const col = kick ? 0x9e78ff : 0xffffff;
        atlasSequenceImpact(a, v, p, d, kick ? 1.35 : .85);
        fx.impact(p, col, true); fx.ring(p.x, p.y, p.z, col, kick ? 6.5 : 4.2, .42, .24); fx.flash(p, 0xffffff, kick ? 5.5 : 3.2, .16);
        powers.cinemaLight(() => v.chest(new THREE.Vector3()), .22, col, kick ? 9 : 5, { gain: 1.1 });
        if (a === me || v === me) G.shake = Math.max(G.shake, kick ? .55 : .28);
        if (authOf(a)) damage(v, kick ? 4 : 2, a, 'super', { kx: d.x * (kick ? 3 : 1.2), kz: d.z * (kick ? 3 : 1.2), up: kick ? 1.5 : .3 });
      }
    }
  } else if (t < 29.25) {
    a.hero.setContactGrip(null, null); v.hero.setContactGrip(null, null);
    const k = smooth((t - 25.6) / 3.65); put(a, c.x - d.x * 1.5, c.y + 1.5, c.z - d.z * 1.5, s.yaw);
    put(v, c.x + d.x * 1.2, lerp(c.y, c.y - 58, k), c.z + d.z * 1.2, s.yaw + Math.PI);
    if (!s.flags.fall) { s.flags.fall = true; powers.rift(() => c.clone().add(new THREE.Vector3(0, -20, 0)), 3.2, 0x6b35d9); fx.ring(c.x, c.y - 3, c.z, 0x8a4cff, 26, .9, .5); sfx('sonic', a, 1.2); }
  } else {
    if (!s.flags.boom) { s.flags.boom = true; fx.flash(c, 0xffffff, 34, .7); fx.ring(c.x, c.y - 28, c.z, 0x8a4cff, 95, 1.2, .8); powers.screenFlash('rgba(210,190,255,.95)', .4, 1); sfx('nova', a, 1.2); }
    if (t >= 30) finishAtlasFist(a, s, false);
  }
}

/* CYBER · EXTINÇÃO SOLAR: perseguição dimensional, captura pelas costas, arremesso ao Sol e FLASH Ω reforçado. */
function nearestSolarTarget(a) {
  let best = null, bd = 58;
  for (const e of enemiesOf(a)) { const d = Math.hypot(e.x - a.x, e.z - a.z); if (d < bd && Math.abs(e.y - a.y) < 14) { best = e; bd = d; } }
  return best;
}
function makeSolarStarfield(center) {
  const group = new THREE.Group(); group.position.copy(center);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(2100, 28, 20), new THREE.MeshBasicMaterial({ color: 0x02030b, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
  shell.renderOrder = -100; shell.frustumCulled = false; group.add(shell);
  const count = 2600, pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const y = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - y * y), d = 1050 + Math.random() * 850;
    pos[i * 3] = Math.cos(a) * r * d; pos[i * 3 + 1] = y * d; pos[i * 3 + 2] = Math.sin(a) * r * d;
    const c = Math.random(); col[i * 3] = .66 + c * .34; col[i * 3 + 1] = .72 + c * .27; col[i * 3 + 2] = .84 + c * .16;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.0, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: .94, depthWrite: false, fog: false })); stars.renderOrder = -90; group.add(stars);
  scene.add(group); return { group, stars, geometry: g, shell };
}
function solarEase(k) { k = clamp(k, 0, 1); return k * k * k * (k * (k * 6 - 15) + 10); }
function sampleSolarCamera(keys, t) {
  let i = 1; while (i < keys.length - 1 && keys[i].t < t) i++;
  const p = keys[i - 1], q = keys[i], k = solarEase((t - p.t) / Math.max(.001, q.t - p.t));
  return { yaw: lerp(p.yaw, q.yaw, k), pitch: lerp(p.pitch, q.pitch, k), dist: lerp(p.dist, q.dist, k) };
}
function finishSolarSequence(a, s, aborted = false) {
  if (!s || s.cleaned) return; s.cleaned = true;
  const v = s.victim;
  if (s.sky) { scene.remove(s.sky.group); s.sky.geometry.dispose(); s.sky.shell.geometry.dispose(); s.sky.shell.material.dispose(); s.sky.stars.material.dispose(); }
  if (s.spaceStarted && spaceSt) setSpace(false);
  if (!aborted && MODE === 'battle') realityFracture(new THREE.Vector3(s.spaceCenter.x, s.spaceCenter.y, s.spaceCenter.z), 4.2);
  if (s.camera) { camS.yaw = s.camera.yaw; camS.pitch = s.camera.mode === 'moba' ? .95 : s.camera.pitch; camS.dist = s.camera.mode === 'moba' ? 22 : s.camera.dist; camS.mode = s.camera.mode; camS.init = false; camS.cur = null; SET.cam = camS.mode; saveSet(); $('bView').textContent = camS.mode === 'tps' ? 'CÂMERA · PERTO' : 'CÂMERA · ALTA'; }
  solarFocus = null;
  a.dim = s.start.dim; a.x = s.start.x; a.y = s.start.y; a.z = s.start.z; a.yaw = s.start.yaw; a.vx = a.vz = a.vy = 0; a.spd = 0; a.grounded = s.start.grounded;
  a.solarSequence = null; a.hero.setContactGrip(null); a.hero.setContactElbow(null); a.hero.clearSoftContact?.(); if(v && v.hero) v.hero.clearSoftContact?.(); a.busyMove = 0; a.hero.setGlow(.65);
  if (a.alive && !aborted) a.play('land', 7);
  if (v) {
    v.dim = s.victimStart.dim; v.x = s.victimStart.x; v.y = s.victimStart.y; v.z = s.victimStart.z; v.yaw = s.victimStart.yaw;
    v.vx = v.vz = v.vy = 0; v.spd = 0; v.grounded = s.victimStart.grounded; v.solarVictim = null; v.solarOwner = null; v.solarHidden = false; v.busyMove = 0;
    if (v.alive) v.play('hit', s.yaw);
  }
  if (a === me || v === me) { const sf = $('solarFx'); if (sf) { sf.style.opacity = '0'; sf.classList.remove('active'); } }
}
function doSolar(a, target, remote = false) {
  if (a.char !== 'cyber' || !a.alive || a.solarSequence || a.solarVictim || spaceSt) return false;
  if (!remote && (a.cd.solar > 0 || a.vault || a.climb || a.drop || a.held || a.dash || a.hero.isBusy())) return false;
  const v = remote ? target : target || nearestSolarTarget(a);
  if (!v || !v.alive || v === a || v.solarVictim || v.solarSequence) { if (!remote && a === me) banner('EXTINÇÃO SOLAR · nenhum alvo próximo', 1300); return false; }
  const start = { x: a.x, y: a.y, z: a.z, yaw: a.yaw, grounded: a.grounded, dim: a.dim || null };
  const victimStart = { x: v.x, y: v.y, z: v.z, yaw: v.yaw, grounded: v.grounded, dim: v.dim || null };
  const dx = victimStart.x - start.x, dz = victimStart.z - start.z, len = Math.hypot(dx, dz) || 1;
  const dir = new THREE.Vector3(dx / len, 0, dz / len), side = new THREE.Vector3(-dir.z, 0, dir.x), yaw = Math.atan2(dir.x, dir.z);
  const grab = { x: victimStart.x - dir.x * 1.65, y: victimStart.y, z: victimStart.z - dir.z * 1.65 };
  const spaceCenter = { x: victimStart.x - dir.x * .15, y: Math.max(start.y, victimStart.y) + 72, z: victimStart.z - dir.z * .15 };
  const sun = { x: spaceCenter.x + dir.x * 145, y: spaceCenter.y + 24, z: spaceCenter.z + dir.z * 145 };
  const kickBase = { x: spaceCenter.x + dir.x * 1.4, y: spaceCenter.y + 13, z: spaceCenter.z + dir.z * 1.4 };
  const kickPoint = { x: kickBase.x + dir.x * 3, y: kickBase.y + 5, z: kickBase.z + dir.z * 3 };
  const preSun = { x: sun.x - dir.x * 31, y: sun.y, z: sun.z - dir.z * 31 };
  const E = envOf(a), col = SKINS[a.skin].accent;
  const ground = (x, z, hint) => E.groundAt(x, z, hint + 5, 5);
  const camera = { yaw: camS.yaw, pitch: camS.pitch, dist: camS.dist, mode: camS.mode };
  const camKeys = [
    { t: 0, yaw: 0, pitch: .16, dist: 10 }, { t: 3, yaw: -.32, pitch: .22, dist: 12 },
    { t: 6.8, yaw: .48, pitch: .42, dist: 17 }, { t: 9.5, yaw: .1, pitch: .16, dist: 24 },
    { t: 12.4, yaw: -.58, pitch: .58, dist: 17 }, { t: 15.2, yaw: .18, pitch: .48, dist: 18 },
    { t: 17.4, yaw: .4, pitch: .2, dist: 15 }, { t: 21.8, yaw: .18, pitch: .16, dist: 24 },
    { t: 24.2, yaw: .3, pitch: .17, dist: 29 }, { t: 26.5, yaw: .05, pitch: .1, dist: 22 },
    { t: 29.1, yaw: -.22, pitch: .12, dist: 30 }, { t: 30, yaw: 0, pitch: .15, dist: 36 }
  ];
  const s = { t: 0, duration: 30, start, victimStart, grab, spaceCenter, sun, kickBase, kickPoint, preSun, yaw, dir, side, victim: v, env: E, ground, col, flags: {}, camera, cameraMode: 'tps', camKeys, spaceStarted: true };
  s.finish = aborted => finishSolarSequence(a, s, !!aborted);
  a.solarSequence = s; v.solarVictim = a.id; v.solarOwner = a.id; v.solarHidden = false;
  a.vx = a.vz = a.vy = 0; a.spd = 0; a.grounded = false; a.aimT = 0;
  v.vx = v.vz = v.vy = 0; v.spd = 0; v.grounded = false;
  if (!remote) { a.cd.solar = SKILL_CD.solar; sendFx(a, 'solar', { tg: v.id }); }
  a.play('solar'); v.play('solarVictim'); a.busyMove = 30.2; v.busyMove = 30.2; a.hero.setGlow(1);
  solarFocus = a; camS.mode = 'tps'; camS.yaw = yaw; camS.pitch = .16; camS.dist = 10; camS.init = false; camS.cur = null;
  setSpace(true, new Set([a.id, v.id]), true);
  s.sky = makeSolarStarfield(new THREE.Vector3(spaceCenter.x, spaceCenter.y, spaceCenter.z));
  powers.warp(() => a.alive ? new THREE.Vector3(a.x, a.y + 1.7, a.z) : null, () => new THREE.Vector3(dir.x, .04, dir.z), 3.0, 0xffa94c, 2.7);
  powers.rift(() => a.alive ? new THREE.Vector3(a.x, a.y + 1.1, a.z) : null, 3.0, 0xff8b35);
  sfx('superCharge', a, 1.05); if (a === me) banner('EXTINÇÃO SOLAR', 2200);
  if (a === me || v === me) { const sf = $('solarFx'); if (sf) { sf.classList.add('active'); sf.style.opacity = '.55'; } }
  powers.cinemaLight(() => new THREE.Vector3(a.x, a.y + 1.8, a.z), 1.15, 0xffa94c, 13, { gain: 1.25 });
  return true;
}
function updateSolarSequence(a, dt) {
  const s = a.solarSequence; if (!s) return;
  if (!a.alive) { finishSolarSequence(a, s, true); return; }
  s.t = Math.min(30, s.t + dt); const t = s.t, v = s.victim, d = s.dir, side = s.side, sm = solarEase;
  const put = (actor, x, y, z, yaw, speed = 0, vy = 0, grounded = false) => {
    if (!actor) return; actor.x = x; actor.y = y; actor.z = z; actor.yaw = yaw; actor.vx = actor.vz = 0; actor.vy = vy; actor.spd = speed; actor.grounded = grounded;
  };
  const held = (x, y, z, wob = 0) => put(v, x + d.x * 1.35 + side.x * wob, y + 1.15 + .18 * Math.sin(t * 2.8), z + d.z * 1.35 + side.z * wob, s.yaw, 0, 0, false);
  if (t >= 1.15 && t < 12.2) {
    const gx=v.x-d.x*.28, gz=v.z-d.z*.28, gy=v.y+2.0;
    const leftGrip=new THREE.Vector3(gx+side.x*.25,gy,gz+side.z*.25), rightGrip=new THREE.Vector3(gx-side.x*.25,gy,gz-side.z*.25);
    a.hero.setContactGrip(leftGrip,rightGrip);
    // Pressão das mãos contra o tronco da vítima: a superfície cede sob o contato e recupera ao soltar.
    v.hero.setSoftContact(new THREE.Vector3(v.x-d.x*.22,v.y+2.0,v.z-d.z*.22),.105);
  } else { a.hero.setContactGrip(null); v.hero.clearSoftContact?.(); }
  if (t < 3) {
    const k = sm(t / 3), sway = Math.sin(t * 9) * .48;
    put(a, lerp(s.start.x, s.grab.x, k) + side.x * sway, lerp(s.start.y, s.grab.y, k), lerp(s.start.z, s.grab.z, k) + side.z * sway, s.yaw, 58 - k * 8, 0, true);
    put(v, s.victimStart.x, s.victimStart.y, s.victimStart.z, s.yaw, 0, 0, true);
  } else if (t < 7.2) {
    const k = sm((t - 3) / 4.2), x = lerp(s.grab.x, s.grab.x, k), z = lerp(s.grab.z, s.grab.z, k), y = lerp(s.grab.y, s.spaceCenter.y, k);
    put(a, x, y, z, s.yaw, 0, 18 * (1 - k), false); held(x, y, z, .08 * Math.sin(t * 4));
  } else if (t < 11) {
    const bob = Math.sin((t - 7.2) * 1.7) * .3, x = s.grab.x, y = s.spaceCenter.y + bob, z = s.grab.z;
    put(a, x, y, z, s.yaw, 0, 0, false); held(x, y, z, .12 * Math.sin(t * 2));
  } else if (t < 13.2) {
    const k = sm((t - 11) / 2.2), x = s.grab.x, y = s.spaceCenter.y, z = s.grab.z;
    put(a, x, y, z, s.yaw, 0, 0, false);
    put(v, x + d.x * (1.4 + k * .6) + side.x * k * 1.6, y + 1.15 + 10.5 * k, z + d.z * (1.4 + k * .6) + side.z * k * 1.6, s.yaw + k * 2.4, 0, 18 * (1 - k), false);
  } else if (t < 15.5) {
    const k = sm((t - 13.2) / 2.3), x = s.kickBase.x - d.x * 2, z = s.kickBase.z - d.z * 2, y = lerp(s.spaceCenter.y, s.kickBase.y - 1.5, k);
    put(a, x, y, z, s.yaw, 34 * (1 - k), 7 * (1 - k), false);
    put(v, s.kickBase.x + d.x * 1.8 + side.x * 1.2, s.spaceCenter.y + 11.5, s.kickBase.z + d.z * 1.8 + side.z * 1.2, s.yaw + .25, 0, 0, false);
  } else if (t < 17.1) {
    const k = sm((t - 15.5) / 1.6);
    put(a, s.kickBase.x, s.kickBase.y, s.kickBase.z, s.yaw, 0, 0, false);
    put(v, lerp(s.kickBase.x + d.x * 1.8 + side.x * 1.2, s.kickPoint.x, k), lerp(s.spaceCenter.y + 11.5, s.kickPoint.y, k), lerp(s.kickBase.z + d.z * 1.8 + side.z * 1.2, s.kickPoint.z, k), s.yaw + k * 1.4, 0, 0, false);
  } else if (t < 23.45) {
    const k = sm((t - 17.1) / 6.35), x = s.kickBase.x, y = s.kickBase.y, z = s.kickBase.z;
    put(a, x, y, z, s.yaw, 0, 0, false);
    put(v, lerp(s.kickPoint.x, s.preSun.x, k), lerp(s.kickPoint.y, s.preSun.y, k) + Math.sin(k * Math.PI) * 5, lerp(s.kickPoint.z, s.preSun.z, k), s.yaw + k * 5.2, 0, 0, false);
  } else if (t < 26.15) {
    put(a, s.kickBase.x, s.kickBase.y, s.kickBase.z, s.yaw, 0, 0, false);
    put(v, s.preSun.x, s.preSun.y, s.preSun.z, s.yaw + 5.2, 0, 0, false);
  } else {
    const k = sm((t - 26.15) / 3.85);
    put(a, lerp(s.kickBase.x, s.spaceCenter.x, k * .25), s.kickBase.y, lerp(s.kickBase.z, s.spaceCenter.z, k * .25), s.yaw + Math.PI, 0, 0, false);
    put(v, s.sun.x, s.sun.y, s.sun.z, s.yaw, 0, 0, false); v.solarHidden = t >= 26.3;
  }
  // Plano-sequência com cortes virtuais: aproximações, órbita, enquadramento do chute e close da pose final.
  const cam = sampleSolarCamera(s.camKeys, t);
  if (s.cameraMode === 'moba') { camS.yaw = s.yaw; camS.pitch = 1.02; camS.dist = 27; camS.mode = 'moba'; }
  else { camS.yaw = s.yaw + cam.yaw; camS.pitch = cam.pitch; camS.dist = cam.dist; camS.mode = 'tps'; }
  camS.init = true;
  if (s.sky) { s.sky.group.rotation.y += dt * (t > 29.1 ? 1.8 + (t - 29.1) * 5 : .003); if (t > 29) { const collapse = solarEase((t - 29) / 1); s.sky.stars.scale.setScalar(1 + (t - 29) * 5.5); s.sky.stars.material.opacity = 1 - collapse; s.sky.shell.scale.setScalar(1 + collapse * 2.2); } }
  if (a === me || v === me) { const sf = $('solarFx'); if (sf) sf.style.opacity = String(.55 * (1 - sm((t - 29.15) / .85))); }
  // Captura pelas costas e ruptura da barreira espacial.
  if (t >= 3.0 && !s.flags.grab) { s.flags.grab = true;
    // A segunda arrancada é vertical: a câmera acompanha Cyber pelo túnel até a barreira dimensional.
    powers.warp(() => a.alive ? new THREE.Vector3(a.x, a.y + 1.65, a.z) : null, () => new THREE.Vector3(0, 1, 0), 4.15, 0xffa94c, 3.1);
    fx.flash(v.chest(new THREE.Vector3()), 0xffffff, 4.2, .25); fx.ring(v.x, v.y + .3, v.z, s.col, 6.2, .55, .3); powers.cinemaLight(() => v.chest(new THREE.Vector3()), .8, 0xffe0a0, 11, { gain: 1.25 }); sfx('punch', a, 1.0); }
  if (t >= 6.7 && !s.flags.barrier) { s.flags.barrier = true; const p = new THREE.Vector3(s.spaceCenter.x, s.spaceCenter.y - 4, s.spaceCenter.z); powers.portal(p, 9, 2.4, 0xffa04a); fx.ring(p.x, p.y, p.z, 0xffffff, 18, .8, .35); fx.flash(p, 0xffc47a, 9, .5); sfx('sonic', a, 1.15); }
  // O Sol nasce no espaço separado do mapa original.
  if (t >= 8.1 && !s.flags.sun) { s.flags.sun = true; powers.solarStar(new THREE.Vector3(s.sun.x, s.sun.y, s.sun.z), 26, 21.3, 0xff8b2e); powers.cinemaLight(() => new THREE.Vector3(s.sun.x, s.sun.y, s.sun.z), 3.1, 0xffb04a, 34, { gain: 1.5 }); }
  if (t >= 11.0 && !s.flags.throw) { s.flags.throw = true; fx.ring(a.x, a.y + 2, a.z, 0xffffff, 7.5, .5, .25); fx.flash(v.chest(new THREE.Vector3()), 0xffffff, 4.8, .25); sfx('whoosh', a, 1.25); }
  if (t >= 15.5 && !s.flags.kickReady) { s.flags.kickReady = true; powers.cinemaLight(() => v.chest(new THREE.Vector3()), .85, 0xffd18a, 13, { gain: 1.35 }); }
  if (t >= 16.55 && !s.flags.kick) { s.flags.kick = true; const p = v.chest(new THREE.Vector3()); fx.flash(p, 0xffffff, 7.5, .24); fx.ring(p.x, p.y, p.z, s.col, 9, .55, .32); powers.cinemaLight(() => p, .65, 0xffffff, 15, { gain: 1.6 }); sfx('punch', a, 1.35); if (a === me || v === me) G.shake = Math.max(G.shake, 1.1); }
  // FLASH Ω: mesmo desenho do feixe original, agora com proporção colossal e carga muito mais intensa.
  if (t >= 23.55 && !s.flags.beam) {
    s.flags.beam = true; const o = a.hero.getHand('r', new THREE.Vector3()).add(a.hero.getHand('l', new THREE.Vector3())).multiplyScalar(.5);
    const end = new THREE.Vector3(s.sun.x, s.sun.y, s.sun.z), beamDir = end.clone().sub(o).normalize(), beamLen = o.distanceTo(end);
    powers.megaBeam(o, beamDir, beamLen, 15.5, 2.6, 0xffc16a);
    powers.cinemaLight(() => o, 1.6, 0xffffff, 32, { gain: 1.8 }); powers.cinemaLight(() => end, 1.8, 0xffffff, 42, { gain: 1.9 });
    fx.flash(v.chest(new THREE.Vector3()), 0xffffff, 15, .38); fx.ring(v.x, v.y, v.z, 0xffffff, 13, .75, .4);
    powers.screenFlash('rgba(239,248,255,.98)', .38, 1); sfx('beam', a, 1.35); sfx('super', a, 1.0); G.shake = Math.max(G.shake, 1.5);
  }
  // A estrela explode depois de o alvo quase alcançar a superfície.
  if (t >= 26.15 && !s.flags.nova) { s.flags.nova = true; powers.supernova(new THREE.Vector3(s.sun.x, s.sun.y, s.sun.z), 58, 0xffa23a, () => { fx.flash(new THREE.Vector3(s.sun.x, s.sun.y, s.sun.z), 0xffffff, 38, .72); }); sfx('nova', a, 1.3); G.shake = Math.max(G.shake, 1.4); }
  // O golpe final é resolvido no clarão; evita eliminar um oponente com pouca vida por um erro de sincronização.
  if (t >= 26.35 && !s.flags.damage && v && v.alive && authOf(a)) { s.flags.damage = true; const dmg = Math.max(0, Math.min(68, (v.hp - 1) / CS.mulAt(a.char, a.lvl || 1))); if (dmg > 0) damage(v, dmg, a, 'super', { kx: d.x * 16, kz: d.z * 16, up: 8 }); if (a === me) hitMarker(); }
  // O universo da técnica também colapsa; o mundo de origem permaneceu guardado e intacto.
  if (t >= 29.15 && !s.flags.dimensionBoom) { s.flags.dimensionBoom = true; const c = new THREE.Vector3(s.spaceCenter.x, s.spaceCenter.y, s.spaceCenter.z); fx.ring(c.x, c.y, c.z, 0xffffff, 150, .9, .65); fx.flash(c, 0xffffff, 55, .55); powers.screenFlash('rgba(255,255,255,.98)', .32, 1); sfx('super', a, 1.2); G.shake = Math.max(G.shake, 1.8); }
  if (t >= 30) finishSolarSequence(a, s, false);
}
function doExtra(a) { return a.char === 'cyber' ? doOmega(a) : a.char === 'atlas' ? doAtlasRift(a) : doBlitz(a); }
if (params.get('debug')) Object.assign(window.__ca, { doBlitz, doOmega, doFlash, doSolar, doSingularity, actors, getMe: () => me, getSpace: () => spaceSt, G });
/* CYBER · LÂMINA ÔMEGA: sequência aérea de três cortes de energia e ruptura final (substitui mísseis + canhão no chão). */
function doOmega(a, remote, target) {
  if (!remote && (a.cd.vel > 0 || a.vault || a.climb || a.drop || a.held || a.hero.isBusy())) return false;
  const t = target || findTarget(a, 28, 1.8, moveIntent(a)); if (t) faceTo(a, t);
  if (!remote) { a.cd.vel = SKILL_CD.velC; sendFx(a, 'omega', { tg: t ? t.id : '' }); }
  const auth = authOf(a), col = 0xff8a36, origin = new THREE.Vector3(a.x, a.y, a.z), dir = t ? new THREE.Vector3(t.x - a.x, 0, t.z - a.z).normalize() : new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)), side = new THREE.Vector3(dir.z, 0, -dir.x);
  const center = t ? new THREE.Vector3(t.x, t.y + 1.2, t.z) : origin.clone().addScaledVector(dir, 15);
  const spots = [center.clone().addScaledVector(dir, -4).addScaledVector(side, -3), center.clone().addScaledVector(dir, 2).addScaledVector(side, 4), center.clone().addScaledVector(dir, 4).addScaledVector(side, -3)];
  const r = a.play('omega'); a.busyMove = 4.6; a.hero.setGlow(1); sfx('superCharge', a); if (a === me) banner('LÂMINA ÔMEGA', 1800);
  powers.wings(a.hero, 4.4, col); fx.ring(a.x, a.y, a.z, col, 6, .6); powers.cinemaLight(() => new THREE.Vector3(a.x, a.y + 2, a.z), 4.1, col, 9, { gain: 1.1, streak: 1.1 });
  if (a.simulated) a.stunT = 0;
  a.pending.push({ t: .42, fn: () => { if (!a.alive) return; a.play('blitz'); powers.warp(() => a.alive ? new THREE.Vector3(a.x, a.y + 1.5, a.z) : null, () => dir, .75, col, 1.6); fx.flash(origin, 0xffffff, 5, .22); } });
  const strike = (i, at) => a.pending.push({ t: at, fn: () => { if (!a.alive) return; const p = spots[i], old = new THREE.Vector3(a.x, a.y, a.z); a.x = p.x; a.y = p.y + 1.5; a.z = p.z; a.yaw = Math.atan2(center.x - p.x, center.z - p.z); a.hero.object.position.set(a.x, a.y, a.z); a.hero.object.rotation.y = a.yaw; a.hero.object.updateMatrixWorld(true); a.play(i === 2 ? 'super' : 'punch');
      const aim = center.clone().sub(p).normalize(), hand = a.hero.getHand(i % 2 ? 'l' : 'r', new THREE.Vector3()); powers.megaBeam(hand, new THREE.Vector3(-aim.z, .05, aim.x).normalize(), 17, 1.55, .42, col);
      fx.ring(center.x, center.y, center.z, col, 5.5 + i, .42, .25); fx.impact(center, col, true); fx.flash(center, 0xffffff, 4.5 + i, .18); sfx('punch', a, .9 + i * .1);
      if (t && t.alive) { t.play('hit', a.yaw); t.hero.hitFlash(); if (auth) damage(t, i === 2 ? 17 : 13, a, 'super', { kx: aim.x * 5, kz: aim.z * 5, up: i === 2 ? 4 : 1.5 }); }
      if (a === me || t === me) G.shake = Math.max(G.shake, .45 + i * .12);
    } });
  strike(0, 1.05); strike(1, 1.95); strike(2, 2.85);
  a.pending.push({ t: 3.75, fn: () => { if (!a.alive) return; a.play('super'); const p = t && t.alive ? t.chest(new THREE.Vector3()) : center.clone();
    powers.rift(() => p.clone(), 1.5, col); powers.megaBeam(p.clone().add(new THREE.Vector3(0, 14, 0)), new THREE.Vector3(0, -1, 0), 24, 3.8, 1.1, col); fx.ring(p.x, p.y, p.z, 0xffffff, 15, .7, .4); fx.flash(p, 0xffffff, 12, .35); sfx('super', a, 1.1);
    if (MODE === 'battle') realityFracture(p, 3.4); if (auth && t && t.alive) damage(t, 12, a, 'super', { kx: dir.x * 8, kz: dir.z * 8, up: 6 });
    a.x = origin.x; a.y = origin.y; a.z = origin.z; a.hero.setGlow(.65);
  } });
  return true;
}
function damage(t, dmg, src, kind, kb) {
  const base = dmg;   // dano-base do ataque (unidade interna); o dano real depende do personagem e do nível de quem ataca
  if (src && dmg > 0 && (src === me || (src.kind === 'bot' && src.simulated))) dmg = CS.dmgOf(src.char, src.lvl || 1, dmg);
  if (TUT && tut) dmg = tut.dmg(t, dmg, src, kind);
  if (!t.alive || !canFight() || dmg <= 0 || mates(src, t)) return;
  if (t.atlasVictim && src && src.id !== t.atlasVictim) return; // o alvo fica preso na coreografia e não pode contra-atacar/interromper
  if (t.char==='atlas' && t.atlasGuardUntil>world.time && src && src.alive) {
    t.atlasGuardUntil=0; const reflected=Math.max(1,Math.round(dmg*.62));
    if(src===me || (src.kind==='bot'&&src.simulated)) applyDamage(src,reflected,t.id,'super',{kx:(src.x-t.x)*2.2,kz:(src.z-t.z)*2.2,up:1.8});
    else net.send('hit',{target:src.id,dmg:reflected,kind:'super',by:t.id,x:r2((src.x-t.x)*2.2),z:r2((src.z-t.z)*2.2)});
    fx.ring(t.x,t.y+1.1,t.z,0xd18aff,6,.55,.3);fx.flash(t.chest(),0xe6c7ff,5,.22);sfx('punch',t,.9);
    dmg=Math.max(1,Math.round(dmg*.28)); kb=kb?{...kb,kx:(kb.kx||0)*.25,kz:(kb.kz||0)*.25,up:(kb.up||0)*.25}:null;
  }
  if (src && (src === me || (src.kind === 'bot' && src.simulated))) src.energy = Math.min(100, src.energy + CS.powerOf(src.char, base));
  fx.number(t.chest(), dmg, t === me ? 'hurt' : src === me ? (kind === 'super' ? 'k-super' : kind === 'laser' ? 'k-skill' : 'k-punch') : 'other');
  t.hero.hitFlash();
  if (t === me || (t.kind === 'bot' && t.simulated)) applyDamage(t, dmg, src ? src.id : null, kind, kb);
  else net.send('hit', { target: t.id, dmg, kind, by: src ? src.id : '', x: r2(kb ? kb.kx : 0), z: r2(kb ? kb.kz : 0), zn: kb && kb.zone || 0, kn: kb && kb.knock || 0, rs: kb && kb.resist ? 1 : 0, st: kb && kb.stun || 0 });
}
const _hp = new THREE.Vector3(), _hd = new THREE.Vector3();
/* peso do golpe: força nas juntas, hit stop de 2–5 quadros, câmera direcional, aberração, suor/sangue/faíscas com física */
function hitPhysics(t, src, dmg, kind, kb) {
  let dx = t.x - src.x, dz = t.z - src.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const force = clamp(.35 + dmg / 26, .3, 2.2), kicking = !!(src.hero && src.hero.actions && src.hero.actions.some(r => r.name === 'kick' && r.t < r.a.dur));
  const hn = kicking ? .4 : Math.random() < .35 ? .9 : .7;
  t.hero.reactForce(dx, dz, force, hn, kind);
  const near = Math.hypot(camS.tx - t.x, camS.tz - t.z) < 45; if (!near) return;
  const dur = (dmg >= 26 ? 5 : dmg >= 16 ? 4 : dmg >= 8 ? 3 : 2) / 60; t._freeze = Math.max(t._freeze || 0, dur); src._freeze = Math.max(src._freeze || 0, dur);
  const up = kb && kb.up ? kb.up : 0, mine = t === me || src === me;
  shake.kick(dx, up > 3 ? 1.2 : kind === 'slam' ? -1.2 : .1, dz, (mine ? .07 : .03) + dmg * .004);
  if (post) post.kick(.004 + Math.min(.02, dmg * .0005));
  t.chest(_hp); _hd.set(dx, .25, dz); const atlas = src.char === 'atlas';
  phys.sparks(_hp, _hd, 5 + (dmg * .3 | 0), .6 + force * .4, atlas ? [2.4, .9, 3.2] : [3.2, 1.6, .5]);
  phys.blood(_hp, _hd, 3 + (dmg * .3 | 0), force);
  if (t.hero.J && t.hero.J.head) { t.hero.J.head.getWorldPosition(_hp); phys.sweat(_hp, _hd, 3 + (dmg * .2 | 0), force); }
}
function applyDamage(t, dmg, byId, kind, kb) {
  if (!t.alive) return; const dn = dmg / CS.NORM; /* dn: dano na escala dos efeitos (faíscas, tremor, impacto) */ t.hp -= dmg; t.lastHitT = world.time; t.lastBy = byId; t.healT = 0;
  if (kb) { t.vx += kb.kx || 0; t.vz += kb.kz || 0; if (kb.up && t.grounded) { t.vy = kb.up; t.grounded = false; } }
  const src = actors.get(byId);
  const impactYaw = src ? Math.atan2(src.x - t.x, src.z - t.z) : (t.yaw || 0);
  if (t.hero && t.hero.receiveImpact) t.hero.receiveImpact(impactYaw, Math.min(1.6, .35 + dn / 34));
  if (src && t.hero && t.hero.reactForce) hitPhysics(t, src, dn, kind, kb);
  reactTo(t, kb, impactYaw);
  if (t === me) { sfx('hurt', t); flashVig(); if (src) dmgDir(src); G.shake = Math.max(G.shake, .2); if (navigator.vibrate) try { navigator.vibrate(30); } catch (_) { } }
  else if (src === me || !src) sfx('hit', t);
  if (t.kind === 'bot' && t.brain && src) t.brain.onHurt(src);
  if (t.hp <= 0) kill(t, byId);
}
function kill(t, byId, remote) {
  if (!t.alive) return; if (t.solarSequence && t.solarSequence.finish) t.solarSequence.finish(true); if (t.atlasSequence) finishAtlasFist(t, t.atlasSequence, true); if (t.atlasVictim) { const owner = actors.get(t.atlasVictim); if (owner && owner.atlasSequence) finishAtlasFist(owner, owner.atlasSequence, true); } if (t.velocityDuel) finishVelocityDuel(t, t.velocityDuel); if (t.velocityDuelBy) { const owner = actors.get(t.velocityDuelBy); if (owner && owner.velocityDuel) finishVelocityDuel(owner, owner.velocityDuel); } t.alive = false; t.hp = 0; t.solarVictim = null; t.solarOwner = null; t.solarSequence = null; t.dash = null; t.play('death'); sfx('death', t); G.deadSet.add(t.id); t.vault = null; t.climb = null;
  const k = actors.get(byId); if (k && k !== t && !remote) { k.kills++; if (k === me) { sfx('kill', null); banner('ELIMINOU ' + t.name.toUpperCase(), 1500); } }
  feed(k ? k.name : 'Zona', t.name, k === me || t === me);
  if (TRAINLIKE) { setTimeout(() => { if (actors.has(t.id)) respawnDummy(t); }, 3500); return; }
  if (!remote && (t === me || (t.kind === 'bot' && t.simulated))) net.send('death', { victim: t.id, killer: byId || '', name: t.name, kname: k ? k.name : '' });
  if (k && k.kind === 'bot' && k.brain) k.brain.onKill(t);
  if (t.kind !== 'bot' && k && k.kind === 'bot') G.adapt = Math.max(-.15, G.adapt - .04);
  if (t.kind === 'bot' && k && k.kind !== 'bot') G.adapt = Math.min(.25, G.adapt + .03);
  if (t === me) onMyDeath(k);
  checkEnd();
}
function sendFx(a, kind, data) { if (a === me || (a.kind === 'bot' && a.simulated && !net.offline)) net.send('fx', Object.assign({ kind, a: a.id }, data)); }
/* ===================================================== ausência (o bot joga por você) ===================================================== */
let awayBrain = null;
function awayStart() { if (awayBrain || !me || MODE !== 'battle' || NOPROG || G.phase !== 'live') return; try { awayBrain = new Brain(me, .55, false); } catch (e) { console.warn('away', e); } }
document.addEventListener('visibilitychange', () => { if (document.hidden) awayStart(); });
// Para o som do jogo ao sair (minimizar, trocar de app/aba, fechar a partida) e retoma ao voltar.
const _audPause = () => { try { if (audio.ctx && audio.ctx.state === 'running') audio.ctx.suspend(); } catch (_) { } };
const _audResume = () => { try { if (audio.ctx && audio.ctx.state === 'suspended' && !document.hidden) audio.ctx.resume(); } catch (_) { } };
document.addEventListener('visibilitychange', () => { if (document.hidden) _audPause(); else _audResume(); });
addEventListener('pagehide', _audPause); addEventListener('pageshow', _audResume);
window.__away = { mode: MODE, noprog: NOPROG, start: awayStart, end() { awayBrain = null; }, ongoing: () => MODE === 'battle' && !NOPROG && !G.ended && G.phase !== 'over' && !G.result && !!me, get active() { return !!awayBrain; }, get brain() { return awayBrain; } };

/* ===================================================== bots ===================================================== */
class Brain {
  constructor(a, skill, passive) { this.a = a; this.skill = skill; this.passive = passive; this.think = Math.random() * .3; this.goal = null; this.target = null; this.strafe = Math.random() < .5 ? 1 : -1; this.strafeT = 1; this.stuckT = 0; this.lastPos = [a.x, a.z]; this.wander = null; this.hurtBy = null; this.react = 0; this.jump = false; this.mx = 0; this.mz = 0; this.dodgeT = 0; }
  onHurt(src) { this.hurtBy = src; if (!this.target || Math.random() < .6) this.target = src; this.react = Math.min(this.react, .15); }
  onKill() { this.target = null; this.goal = null; }
  sk() { return clamp(this.skill + G.adapt, .2, .98); }
  update(dt) {
    const a = this.a; if (!a.alive) return; this.think -= dt; this.react -= dt; this.strafeT -= dt; this.dodgeT -= dt; this.jump = false;
    if (a.drop > 0) { this.mx = this.goal ? Math.sign(this.goal[0] - a.x) * .3 : 0; this.mz = 0; return; }
    if (this.passive) { const t = world.time + a.id.length; this.mx = Math.sin(t * .5) * .3; this.mz = Math.cos(t * .4) * .3; if (Math.hypot(a.x - this.home[0], a.z - this.home[1]) > 4) { this.mx = this.home[0] - a.x; this.mz = this.home[1] - a.z; const l = Math.hypot(this.mx, this.mz); this.mx /= l; this.mz /= l; } return; }
    const S = this.sk();
    if (this.think <= 0) { this.think = .22 + Math.random() * .15; this.decide(S); }
    let gx = 0, gz = 0, run = 1;
    const t = this.target && this.target.alive ? this.target : null;
    if (this.mode === 'fight' && t) {
      const dx = t.x - a.x, dz = t.z - a.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const pref = this.pref; let fwd = d > pref + 3 ? 1 : d < pref - 3 ? -.7 : 0;
      if (this.melee) fwd = d > 1.7 ? 1 : -.2;
      if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = .7 + Math.random() * 1.2; if (Math.random() < S * .25) this.jump = true; }
      const sx = -uz * this.strafe, sz = ux * this.strafe, sw = this.melee ? .25 : .75;
      gx = ux * fwd + sx * sw; gz = uz * fwd + sz * sw;
      if (this.react <= 0) {
        if (this.melee && d < 2.9) { if (doPunch(a, t, Math.random() < .28 ? 'kick' : undefined)) this.react = .08; }
        else if (!TUT && d < (a.char === 'cyber' ? 15 : 20) && d > (this.melee ? 3.2 : 0) && a.cd.laser <= 0 && !(a.busyMove > 0) && Math.random() < .3 + S * .5) { const vis = !envOf(a).rayBlocked(a.x, a.y + 1.8, a.z, t.x, t.y + 1.6, t.z); if (vis) { if (doSkill(a, t)) this.react = .6 - S * .3 + Math.random() * .3; } else { gx = ux; gz = uz; } }
        if (!TUT && a.cd.vel <= 0 && d < 24 && Math.random() < .12 + S * .1) doExtra(a);
        if (!TUT && a.energy >= 100) { const near = enemiesOf(a).filter(b => Math.hypot(b.x - a.x, b.z - a.z) < 5.5).length; if ((near >= 2 || (near >= 1 && hpPct(t) < 50)) && Math.random() < .5 + S * .4) doSuper(a); }
      }
    } else if (this.goal) { gx = this.goal[0] - a.x; gz = this.goal[1] - a.z; const d = Math.hypot(gx, gz); if (d < 1.5) { this.goal = null; gx = gz = 0; } else { gx /= d; gz /= d; } if (this.mode === 'roam') run = .9; }
    // esquivar de lasers vindo na direção do bot
    if (this.dodgeT <= 0) for (const b of fx.beams) { if (b.dead || b.owner === a) continue; const rx = a.x - b.pos.x, rz = a.z - b.pos.z, rd = Math.hypot(rx, rz); if (rd > 9 || rd < .5) continue; if ((rx * b.dir.x + rz * b.dir.z) / rd > .92 && Math.random() < S * .55) { const sx = -b.dir.z, sz = b.dir.x, s = Math.random() < .5 ? 1 : -1; this.dodge = [sx * s, sz * s, .35]; this.dodgeT = 1.2 - S * .6; if (Math.random() < .5) this.jump = true; break; } }
    if (this.dodge) { gx = this.dodge[0]; gz = this.dodge[1]; this.dodge[2] -= dt; if (this.dodge[2] <= 0) this.dodge = null; }
    // evitar obstáculos e água funda
    const l = Math.hypot(gx, gz); if (l > .01) { gx /= l; gz /= l; const base = Math.atan2(gx, gz);
      for (const off of [0, .45, -.45, .9, -.9, 1.4, -1.4, 2.2, -2.2]) { const ang = base + off * (this.side || 1), dx = Math.sin(ang), dz = Math.cos(ang), px = a.x + dx * 1.7, pz = a.z + dz * 1.7, bl = world.blockers(px, pz, a.y, RAD);
        const deep = world.waterDepth(px, pz) > .95; const cliff = world.groundAt(px, pz, a.y + 1) - a.y > 1.2;
        if (!bl.length && !deep && !cliff) { gx = dx; gz = dz; break; } if (bl.length && bl.every(b => b[0].vault) && off === 0) { gx = dx; gz = dz; if (Math.random() < .3) this.jump = true; break; } } }
    this.stuckT += dt; if (this.stuckT > 1.2) { const m = Math.hypot(a.x - this.lastPos[0], a.z - this.lastPos[1]); if (m < .5 && l > .1) { this.side = -(this.side || 1); this.jump = true; this.goal = null; this.wander = null; } this.stuckT = 0; this.lastPos = [a.x, a.z]; }
    this.mx = gx * run; this.mz = gz * run;
  }
  decide(S) {
    const a = this.a, zone = G.zone && G.phase === 'live' ? G.zone.at(battleSec()) : null;
    const vis = enemiesOf(a).filter(b => { const d = Math.hypot(b.x - a.x, b.z - a.z); return d < 34 && (d < 7 || !envOf(a).rayBlocked(a.x, a.y + 1.8, a.z, b.x, b.y + 1.6, b.z)); });
    // não amontoar: no máximo 2 bots no mesmo humano
    const focus = new Map(); for (const b of actors.values()) if (b.brain && b !== a && b.brain.target) focus.set(b.brain.target.id, (focus.get(b.brain.target.id) || 0) + 1);
    let best = null, bs = 1e9; for (const b of vis) { const d = Math.hypot(b.x - a.x, b.z - a.z); let s = d + (hpPct(b) / 100) * 8 * S; if (b === this.hurtBy) s -= 8; if (b.kind !== 'bot' && (focus.get(b.id) || 0) >= 2 && b !== this.target) s += 25; if (b.kind !== 'bot' && hpPct(b) < 30 && G.adapt < 0) s += 10; if (s < bs) { bs = s; best = b; } }
    const outZone = zone && Math.hypot(a.x - zone.x, a.z - zone.z) > zone.r - 4;
    const lowHp = hpPct(a) < 38 + (1 - S) * 15;
    if (lowHp) { const kit = nearestItem(G.kits, a, 45); if (kit && (!best || Math.hypot(best.x - a.x, best.z - a.z) > 6)) { this.mode = 'heal'; this.goal = [kit.x, kit.z]; this.target = best; return; } }
    if (outZone && (!best || Math.hypot(best.x - a.x, best.z - a.z) > 9)) { this.mode = 'zone'; this.goal = [zone.x + (Math.random() - .5) * zone.r * .5, zone.z + (Math.random() - .5) * zone.r * .5]; return; }
    if (best) { this.mode = 'fight'; if (this.target !== best) this.react = .55 - S * .4; this.target = best; const d = Math.hypot(best.x - a.x, best.z - a.z);
      this.melee = (d < 5 && (S > .5 || a.charges < 1)) || (hpPct(best) < 30 && d < 8) || a.charges < 1 && d < 10; this.pref = 8 + (1 - S) * 6 + (hpPct(a) < 50 ? 4 : 0); return; }
    this.target = null;
    if (a.energy < 100 && Math.random() < .5) { const o = nearestItem(G.orbs, a, 30); if (o) { this.mode = 'loot'; this.goal = [o.x, o.z]; return; } }
    if (!this.goal || Math.random() < .05) { this.mode = 'roam'; const zc = zone || { x: 0, z: 0, r: 230 }; for (let k = 0; k < 10; k++) { const ang = Math.random() * TAU, dd = Math.random() * zc.r * .7, x = zc.x + Math.cos(ang) * dd, z = zc.z + Math.sin(ang) * dd; if (world.isFree(x, z, 1)) { this.goal = [clamp(x, -WD.HX + 4, WD.HX - 4), clamp(z, -WD.HZ + 4, WD.HZ - 4)]; break; } } }
  }
}
function nearestItem(list, a, r) { let best = null, bd = r; for (const k of list) { if (k.t > 0) continue; const d = Math.hypot(k.x - a.x, k.z - a.z); if (d < bd) { bd = d; best = k; } } return best; }
function makeBot(i, slot, sk, passive) {
  const r = mulberry32(G.seed + i * 977), name = BOT_NAMES[(r() * BOT_NAMES.length) | 0] + (r() < .6 ? Math.floor(r() * 99) : ''), skin = BOT_SKINS[(r() * BOT_SKINS.length) | 0], ch = (v => v < .34 ? 'cyber' : v < .67 ? 'nexus' : 'atlas')(r());
  const a = addActor('b' + i, name, skin, 'bot', ch); a.simulated = true; a.brain = new Brain(a, clamp(sk + (r() - .5) * .25, .25, .95), passive); a.lvl = clamp(Math.round(1 + sk * 9 + (r() - .5) * 2), 1, 12); a.maxHp = CS.hpAt(a.char, a.lvl); a.hp = a.maxHp; if (slot) placeAt(a, slot);
  return a;
}
function respawnDummy(a) { a.alive = true; a.hp = a.maxHp; if (a.brain && a.brain.home && MODE === 'space') { a.x = a.brain.home[0]; a.z = a.brain.home[1]; a.y = envOf(a).groundAt(a.x, a.z) + .1; a.vx = a.vz = a.vy = 0; } a.play('revive'); G.deadSet.delete(a.id); }

/* ===================================================== nascimento ===================================================== */
function slots(seed) {
  const r = mulberry32(seed ^ 0x1234), base = r() * TAU, out = [];
  for (let i = 0; i < 16; i++) { const a = base + i / 16 * TAU, cx = Math.sin(a) * WD.HX * .66, cz = Math.cos(a) * WD.HZ * .62; out.push(world.randomSpot(mulberry32(seed + i * 31), { cx, cz, r: 28 })); }
  return out;
}
function placeAt(a, p, drop) { a.x = p[0]; a.z = p[1]; a.y = world.groundAt(a.x, a.z) + (drop ? 30 + Math.random() * 6 : 0); a.vx = a.vz = a.vy = 0; a.drop = drop ? 1 : 0; a.grounded = !drop; a.yaw = Math.atan2(-a.x, -a.z); }
function plazaSpot(i) { const p = CW.PLAZA, a = (i * 2.399) % TAU, d = 2 + (i % 5) * 1.2; return [p.x + Math.cos(a) * d, p.z + 4 + Math.sin(a) * d]; }

/* ===================================================== HUD ===================================================== */
let bannerT = 0; function banner(text, ms = 2000) { const b = $('banner'); b.textContent = text; b.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), ms); }
function feed(k, v, mine) { const f = $('feed'), d = document.createElement('div'); d.className = mine ? 'me' : ''; d.innerHTML = `<b>${esc(k)}</b> ⚡ ${esc(v)}`; f.prepend(d); while (f.children.length > 5) f.lastChild.remove(); setTimeout(() => d.remove(), 6000); }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let vigT = 0; function flashVig() { $('vig').style.opacity = .9; clearTimeout(vigT); vigT = setTimeout(() => $('vig').style.opacity = me && hpPct(me) < 30 ? .55 : 0, 180); }
let hmT = 0; function hitMarker() { $('cross').classList.add('on'); clearTimeout(hmT); hmT = setTimeout(() => $('cross').classList.remove('on'), 120); }
function dmgDir(src) { const ang = Math.atan2(src.x - me.x, src.z - me.z) - camS.yaw; const i = $('dmgDir').firstChild; i.style.transform = `rotate(${-ang * 180 / PI}deg)`; i.style.opacity = 1; i.style.transition = 'none'; requestAnimationFrame(() => { i.style.transition = 'opacity .8s'; i.style.opacity = 0; }); }
function setCameraMode(mode, announce = true) {
  camS.mode = mode === 'moba' ? 'moba' : 'tps';
  camS.dist = camS.mode === 'tps' ? 5.6 : 22; camS.pitch = camS.mode === 'tps' ? .2 : .95;
  SET.cam = camS.mode; saveSet();
  const b = $('bView'); if (b) b.textContent = camS.mode === 'tps' ? 'CÂMERA · PERTO' : 'CÂMERA · ALTA';
  // Permite trocar o enquadramento também durante as supers, sem quebrar a coreografia nem o retorno.
  if (solarFocus?.solarSequence) { solarFocus.solarSequence.cameraMode = camS.mode; solarFocus.solarSequence.camera.mode = camS.mode; solarFocus.solarSequence.camera.pitch = camS.pitch; solarFocus.solarSequence.camera.dist = camS.dist; }
  if (solarFocus?.atlasSequence) { solarFocus.atlasSequence.cameraMode = camS.mode; solarFocus.atlasSequence.camera.mode = camS.mode; solarFocus.atlasSequence.camera.pitch = camS.pitch; solarFocus.atlasSequence.camera.dist = camS.dist; }
  if (announce) banner(camS.mode === 'tps' ? 'TERCEIRA PESSOA · PERTO' : 'VISÃO ALTA · MOBA', 1100);
}
function toggleView() { setCameraMode(camS.mode === 'tps' ? 'moba' : 'tps'); }
$('bView').onclick = toggleView;
function toggleMap() { $('bigmap').classList.toggle('hidden'); sfx('click'); }
$('mmWrap').addEventListener('pointerdown', e => { e.stopPropagation(); toggleMap(); }); $('bmX').onclick = toggleMap; $('bm').addEventListener('pointerdown', toggleMap);
// chat
const QUICK = MODE === 'open' ? ['Oi! 👋', 'Bora explorar!', 'Vem pra casona!', 'Que lugar lindo', 'Kkkkk', 'Até mais!'] : ['Boa sorte!', 'GG!', 'Cuidado!', 'Vou pro centro', 'Kkkkk', 'Bora!'];
$('quick').innerHTML = QUICK.map(q => `<button>${q}</button>`).join(''); [...$('quick').children].forEach(b => b.onclick = () => { net.chat(b.textContent); closeChat(); });
function openChat() { document.body.classList.add('chatOpen'); const cp = $('chatPanel'); cp.scrollTop = cp.scrollHeight; chUnread = 0; chBadge(); $('chatBar').classList.remove('hidden'); $('quick').classList.remove('hidden'); $('chatIn').focus(); }
function closeChat() { document.body.classList.remove('chatOpen'); $('chatBar').classList.add('hidden'); $('quick').classList.add('hidden'); $('chatIn').blur(); canvas.focus(); }
function sendChat() { const v = $('chatIn').value.trim(); if (v) net.chat(v); $('chatIn').value = ''; $('chatIn').focus(); }   // continua aberto: a conversa fica visível
$('bSetX').onclick = () => $('bSetOk').click();
$('bChat').onclick = () => $('chatBar').classList.contains('hidden') ? openChat() : closeChat(); $('chatSend').onclick = sendChat;
function chatLine(name, text, sys) { if (!sys && chatBarHidden()) { chUnread = Math.min(99, chUnread + 1); chBadge(); } const l = $('chatLog'), d = document.createElement('div'); d.innerHTML = sys ? `<span class="sys">${esc(text)}</span>` : `<b>${esc(name)}:</b> ${esc(text)}`; l.appendChild(d); { const cp = $('chatPanel'), e = document.createElement('div'); e.innerHTML = d.innerHTML; cp.appendChild(e); while (cp.children.length > 120) cp.firstChild.remove(); cp.scrollTop = cp.scrollHeight; } while (l.children.length > 7) l.firstChild.remove(); setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 1000); }, MODE === 'open' ? 20000 : 9000); }

/* ---------- chat de voz do grupo dentro da partida (a voz mora no lobby; aqui só controlamos) ---------- */
let chUnread = 0; const chatBarHidden = () => $('chatBar').classList.contains('hidden');
function chBadge() { const b = $('chBdg'); b.textContent = chUnread; b.classList.toggle('hidden', !chUnread); }
const PV = () => { try { return window.parent !== window && window.parent.__party && window.parent.__party.toggleVoice ? window.parent.__party : null; } catch (_) { return null; } };
let _vSig = '';
function renderVoice() {
  const pv = PV(), g = pv && pv.state.party && PARTY && pv.state.party.id === PARTY ? pv.state.party : null;
  $('bVoz').classList.toggle('hidden', !g); $('bMic').classList.toggle('hidden', !g || !pv.voice.joined);
  $('hud').classList.toggle('hasTeam', !!g);
  if (!g) { if ($('vTeam').innerHTML) $('vTeam').innerHTML = ''; return; }
  const on = pv.voice.joined; $('bVoz').classList.toggle('on', on); $('bMic').classList.toggle('off', pv.voice.muted); $('bMic').classList.toggle('talk', on && !pv.voice.muted && pv.speaking.has(myId));
  const rows = g.members.map(m => { const me2 = m.id === myId, sp = pv.speaking.has(m.id), inV = me2 ? on : m.voice; return `<div class="${sp ? 'sp' : ''}"><i></i><span>${esc(m.name || '')}</span>${inV ? '<span>🎧</span>' : ''}</div>`; }).join('');
  const sig = rows + on; if (sig !== _vSig) { _vSig = sig; $('vTeam').innerHTML = rows; $('hud').style.setProperty('--vt', $('vTeam').offsetHeight + 6 + 'px'); }
}
$('bVoz').onclick = async () => { const pv = PV(); if (!pv) return; await pv.toggleVoice(); if (pv.voice.joined) chatLine('', '🎧 Voz ligada! Fale com o grupo.', true); renderVoice(); };
$('bMic').onclick = () => { const pv = PV(); if (pv) { pv.toggleMic(); renderVoice(); } };
try { const pv0 = PV(); if (pv0) { pv0.hear.add(renderVoice); addEventListener('pagehide', () => { try { pv0.hear.delete(renderVoice); } catch (_) { } }); } } catch (_) { }
setInterval(renderVoice, 1000);
// configurações
$('bSet').onclick = () => { $('sQ').value = SET.quality; $('sTheme').value = SET.theme; $('sF').value = String(SET.fps); $('sShow').checked = SET.showFps; $('sSens').value = SET.sens; $('sVol').value = audio.vol; $('sCam').value = camS.mode; $('sPad').checked = SET.pad; $('sCine').value = String(SET.cine); $('sGore').checked = SET.gore !== false; $('settings').classList.remove('hidden'); };
$('bSetOk').onclick = () => { SET.quality = $('sQ').value; SET.theme = $('sTheme').value; SET.fps = +$('sF').value; SET.showFps = $('sShow').checked; SET.sens = +$('sSens').value; SET.pad = $('sPad').checked; SET.cine = $('sCine').value; SET.gore = $('sGore').checked; PBR_CFG.gore = SET.gore; phys.gore = SET.gore; if (post) post.setTier(SET.cine === 'auto' ? 4 : +SET.cine); post && (post.baseTier = post.tier); if (post) post.vivid = post.tier >= 4; audio.setVolume(+$('sVol').value); if ($('sCam').value !== camS.mode) setCameraMode($('sCam').value, false); saveSet(); $('fps').classList.toggle('hidden', !SET.showFps); document.body.classList.toggle('showpad', SET.pad); $('settings').classList.add('hidden'); };
// sair
$('bExit').onclick = () => { const live = MODE === 'battle' && G.phase === 'live' && me && me.alive; $('exT').textContent = live ? 'Sair da partida?' : MODE === 'open' ? 'Sair do mundo aberto?' : 'Voltar ao lobby?'; $('exP').textContent = live ? 'Você será eliminado e receberá o resultado atual.' : 'Você pode voltar quando quiser.'; $('ovExit').classList.remove('hidden'); };
$('bExNo').onclick = () => $('ovExit').classList.add('hidden');
$('bExYes').onclick = async () => { $('ovExit').classList.add('hidden'); if (MODE === 'battle' && (G.phase === 'live' || G.phase === 'dead' || G.phase === 'spectate') && G.started) { if (me.alive) { G.placement = aliveCount(); me.alive = false; net.send('death', { victim: myId, killer: '', name: me.name }); } await showResults(); } else exitToLobby(); };
$('bLobby').onclick = exitToLobby;
function exitToLobby() { net.leave(); if (embedded) parent.postMessage({ type: 'cyberarena:exit-world' }, '*'); else location.href = '../index.html'; }
$('bSpec').onclick = () => { $('ovDeath').classList.add('hidden'); G.phase = 'spectate'; nextSpec(); banner('ASSISTINDO · toque no mapa para sair', 2000); };
$('bDeathOut').onclick = () => showResults(); $('bWinOut').onclick = () => showResults();
function nextSpec() { const al = [...actors.values()].filter(a => a.alive && a !== me); if (!al.length) return; G.specIdx = (G.specIdx + 1) % al.length; G.spec = G.killer && G.killer.alive && !G.spec ? G.killer : al[G.specIdx]; }

/* ---------- etiquetas com nome e vida ---------- */
const tagLayer = $('tags');
function resolveActorBodyContacts(dt) {
  const list=[...actors.values()].filter(a=>a.alive && !a.drop && !a.solarSequence && !a.solarVictim && !a.atlasSequence && !a.atlasVictim && !a.velocityDuel && !a.velocityDuelBy);
  const minDist=.88, slop=.02, touching=resolveActorBodyContacts.touching||(resolveActorBodyContacts.touching=new Set()), now=new Set();
  for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++){
    const a=list[i], b=list[j]; if(Math.abs(a.y-b.y)>2.35) continue;
    const dx=b.x-a.x,dz=b.z-a.z,d2=dx*dx+dz*dz; if(d2>=minDist*minDist) continue;
    const movableA=(a===me || a.simulated), movableB=(b===me || b.simulated);
    if(!movableA&&!movableB) continue;
    const dist=Math.sqrt(Math.max(d2,1e-6)), nx=dx/dist,nz=dz/dist, penetration=minDist-dist;
    const wa=movableA?(movableB?.5:1):0, wb=movableB?(movableA?.5:1):0, key=a.id+'|'+b.id; now.add(key);
    // correção posicional suave: o corpo cede em poucos quadros em vez de "estalar" de volta (isso causava o tremor)
    const corr=Math.max(0,penetration-slop)*Math.min(1,dt*14);
    a.x-=nx*corr*wa; a.z-=nz*corr*wa; b.x+=nx*corr*wb; b.z+=nz*corr*wb;
    // contato inelástico: remove a velocidade de aproximação (com pequeno rebote) e preserva a tangente, então um desliza em volta do outro
    const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
    if(closing>0){ const jn=closing*1.15; a.vx-=nx*jn*wa; a.vz-=nz*jn*wa; b.vx+=nx*jn*wb; b.vz+=nz*jn*wb; }
    // o golpe de impacto dispara só no início do contato; durante o encosto a pressão na carne é contínua e proporcional
    if(!touching.has(key) && closing>.9){
      const k=Math.min(1.35,.35+closing*.07+penetration*.8);
      a.hero.receiveImpact(Math.atan2(nx,nz),k); b.hero.receiveImpact(Math.atan2(-nx,-nz),k);
    }
    if(movableA){a.hero.object.position.set(a.x,a.y,a.z);a.hero.object.rotation.y=a.yaw;a.hero.object.updateMatrixWorld(true);}
    if(movableB){b.hero.object.position.set(b.x,b.y,b.z);b.hero.object.rotation.y=b.yaw;b.hero.object.updateMatrixWorld(true);}
    const pa=new THREE.Vector3(a.x+nx*.34,a.y+1.82,a.z+nz*.34), pb=new THREE.Vector3(b.x-nx*.34,b.y+1.82,b.z-nz*.34);
    const press=clamp(.06+penetration*.45+Math.max(0,closing)*.012,.05,.3);
    a.hero.setSoftContact(pa,press); b.hero.setSoftContact(pb,press);
  }
  touching.clear(); for(const k of now) touching.add(k);
}

function updateTags() {
  const v = new THREE.Vector3(), W2 = innerWidth / 2, H2 = innerHeight / 2;
  for (const a of actors.values()) {
    const focusA = G.spec || me; const d = focusA ? Math.hypot(a.x - focusA.x, a.z - focusA.z) : 99; const show = a !== me && a.alive && d < 38 && a.hero.object.visible && (!spaceSt || spaceSt.ids.has(a.id));
    if (!show) { if (a.tag) a.tag.style.display = 'none'; continue; }
    if (!a.tag) { a.tag = document.createElement('div'); a.tag.className = 'tag' + (MODE !== 'battle' || a.kind === 'remote' && MODE !== 'battle' || mates(me, a) ? ' friend' : ''); a.tag.innerHTML = `<span></span><div class="tb"><i></i></div>`; tagLayer.appendChild(a.tag); a.tag.firstChild.textContent = a.name; }
    v.set(a.x, a.y + 3.45, a.z).project(camera); if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) { a.tag.style.display = 'none'; continue; }
    a.tag.style.display = ''; a.tag.classList.toggle('speak', !!a.speaking); a.tag.style.left = (v.x * W2 + W2) + 'px'; a.tag.style.top = (-v.y * H2 + H2) + 'px'; a.tag.style.opacity = clamp(1.4 - d / 30, .3, 1);
    a.tag.lastChild.style.display = MODE === 'open' || MODE === 'soccer' ? 'none' : ''; a.tag.lastChild.firstChild.style.width = clamp(hpPct(a), 0, 100) + '%';
  }
}
/* ---------- minimapa e mapa grande ---------- */
const mmc = $('mm').getContext('2d'), bmc = $('bm').getContext('2d');
function drawMap(ctx, w, h, big) {
  const M = world.minimap; if (!M) return; const f = G.spec || me; if (!f) return; const sc = world.mapScale;
  if (inRealm(f)) { ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#140c2a'; if (!big) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, TAU); ctx.fill(); } else ctx.fillRect(0, 0, w, h); const k = big ? 2.6 : w / 70, ox = big ? w / 2 : w / 2 - (f.x - REALM_X) * k, oz = big ? h / 2 : h / 2 - (f.z) * k;
    ctx.save(); if (!big) { ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, TAU); ctx.clip(); } ctx.fillStyle = '#2b3d6a'; for (const s2 of realm.islands) { ctx.beginPath(); ctx.arc(ox + (s2.x - REALM_X) * k, oz + s2.z * k, s2.r * k, 0, TAU); ctx.fill(); } ctx.strokeStyle = '#7ce8ff'; ctx.lineWidth = 2; for (const b of realm.bridges) { ctx.beginPath(); ctx.moveTo(ox + (b.ax - REALM_X) * k, oz + b.az * k); ctx.lineTo(ox + (b.bx - REALM_X) * k, oz + b.bz * k); ctx.stroke(); }
    ctx.fillStyle = '#b07bff'; ctx.beginPath(); ctx.arc(ox + (realm.portal.x - REALM_X) * k, oz + realm.portal.z * k, 4, 0, TAU); ctx.fill(); for (const a of actors.values()) { if (!inRealm(a)) continue; ctx.fillStyle = a === me ? '#38f2ff' : '#7cff9a'; ctx.beginPath(); ctx.arc(ox + (a.x - REALM_X) * k, oz + a.z * k, a === me ? 5 : 4, 0, TAU); ctx.fill(); } ctx.fillStyle = '#fff'; ctx.font = '800 ' + (big ? 18 : 10) + 'px system-ui'; ctx.textAlign = 'center'; ctx.fillText('MUNDO CRISTAL', w / 2, big ? 30 : h - 12); ctx.restore(); return; }
  ctx.clearRect(0, 0, w, h); ctx.save();
  let toPx;
  if (big) { ctx.drawImage(M, 0, 0, w, h); const kx = w / (WD.HX * 2), kz = h / (WD.HZ * 2); toPx = (x, z) => [(x + WD.HX) * kx, (z + WD.HZ) * kz]; }
  else { const span = 70, k = w / span; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, TAU); ctx.clip(); ctx.fillStyle = '#1d3a24'; ctx.fillRect(0, 0, w, h); ctx.drawImage(M, (f.x + WD.HX) * sc - span / 2 * sc, (f.z + WD.HZ) * sc - span / 2 * sc, span * sc, span * sc, 0, 0, w, h); toPx = (x, z) => [w / 2 + (x - f.x) * k, h / 2 + (z - f.z) * k]; }
  const unit = big ? w / (WD.HX * 2) : w / 70;
  if (G.zone && MODE === 'battle' && G.phase !== 'waiting') { const z = G.zone.at(battleSec()); const c = toPx(z.x, z.z), n = toPx(z.next.x, z.next.z);
    ctx.save(); ctx.fillStyle = 'rgba(40,90,255,.28)'; ctx.beginPath(); ctx.rect(-10, -10, w + 20, h + 20); ctx.arc(c[0], c[1], Math.max(0, z.r * unit), 0, TAU, true); ctx.fill('evenodd'); ctx.restore();
    ctx.strokeStyle = '#4aa3ff'; ctx.lineWidth = big ? 3 : 2; ctx.beginPath(); ctx.arc(c[0], c[1], Math.max(0, z.r * unit), 0, TAU); ctx.stroke();
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(n[0], n[1], Math.max(0, z.next.r * unit), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    if (f === me && Math.hypot(me.x - z.next.x, me.z - z.next.z) > z.next.r) { const p = toPx(me.x, me.z); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(n[0], n[1]); ctx.stroke(); ctx.setLineDash([]); } }
  for (const k of G.kits) if (k.t <= 0) { const p = toPx(k.x, k.z); ctx.fillStyle = '#2ee07a'; ctx.fillRect(p[0] - 1.5 * (big ? 2 : 1.4), p[1] - 4, 3 * (big ? 2 : 1.4) / 1.4, 8); ctx.fillRect(p[0] - 4, p[1] - 1.5, 8, 3); }
  for (const a of actors.values()) {
    if (a === me || !a.alive) continue; const d = Math.hypot(a.x - f.x, a.z - f.z);
    const enemy = MODE !== 'open'; const visible = !enemy || G.phase === 'waiting' || d < 40 || world.time - a.lastShotT < 3 || big && d < 60;
    if (!visible) continue; const p = toPx(a.x, a.z); ctx.fillStyle = enemy ? '#ff4a5a' : '#7cff9a'; ctx.beginPath(); ctx.arc(p[0], p[1], big ? 5 : 4, 0, TAU); ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
    if (big && !enemy) { ctx.fillStyle = '#fff'; ctx.font = '700 12px system-ui'; ctx.fillText(a.name, p[0] + 7, p[1] + 4); }
  }
  if (me) { const p = toPx(me.x, me.z); ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-me.yaw + PI); ctx.fillStyle = '#38f2ff'; ctx.strokeStyle = '#002'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    // cone de visão da câmera
    ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-camS.yaw + PI); const g = ctx.createRadialGradient(0, 0, 0, 0, 0, big ? 60 : 50); g.addColorStop(0, 'rgba(255,255,255,.28)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, big ? 60 : 50, -PI / 2 - .5, -PI / 2 + .5); ctx.closePath(); ctx.fill(); ctx.restore(); }
  ctx.restore();
}
function aliveCount() { return Math.max(1, 16 - G.deadSet.size); }
function battleSec() { return (now() - G.startAt) / 1000; }
const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
let hudT = 0;
const SVG = (b) => '<svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + b + '</svg>';
const ICONS = {
  sing: SVG('<circle cx="24" cy="24" r="6" fill="#000" stroke="#ffcf8a"/><path d="M24 8a16 16 0 0 1 16 16M40 24a16 16 0 0 1-16 16M24 40A16 16 0 0 1 8 24M8 24A16 16 0 0 1 24 8" stroke-dasharray="14 6"/><ellipse cx="24" cy="24" rx="20" ry="6" transform="rotate(-20 24 24)" stroke="#ff9a3c"/>'),
  abyss: SVG('<circle cx="24" cy="24" r="9" fill="rgba(80,40,200,.5)"/><ellipse cx="24" cy="24" rx="19" ry="7" transform="rotate(-25 24 24)"/><circle cx="38" cy="10" r="2.5" fill="currentColor"/><circle cx="9" cy="37" r="1.8" fill="currentColor"/><path d="M6 12l3 0M7.5 10.5v3M40 38h3M41.5 36.5v3"/>'),
  flash: SVG('<path d="M4 24h10"/><circle cx="14" cy="24" r="5" fill="#fff"/><path d="M18 18h26v12H18z" fill="rgba(160,250,255,.5)"/><path d="M18 24h28" stroke-width="4"/><path d="M8 12l4 5M8 36l4-5"/>'),
  nova: SVG('<circle cx="24" cy="24" r="7" fill="#fff3c0"/><path d="M24 2v9M24 37v9M2 24h9M37 24h9M8 8l7 7M33 33l7 7M40 8l-7 7M15 33l-7 7"/><circle cx="24" cy="24" r="14" stroke-dasharray="3 4"/>'),
  blitz: SVG('<path d="M30 6 18 24h9l-6 18 17-22h-9l6-14z" fill="rgba(200,170,255,.5)"/><path d="M2 16h12M4 24h9M2 32h11"/>'),
  swap: SVG('<path d="M10 16h26l-6-6M38 32H12l6 6"/><circle cx="8" cy="32" r="3" fill="currentColor"/><circle cx="40" cy="16" r="3" fill="currentColor"/>'),
  chain: SVG('<path d="M27 4 13 26h10l-4 18 16-24H25z" fill="rgba(120,240,255,.35)"/><path d="M6 18l5 3M42 30l-5-3"/>'),
  omega: SVG('<path d="M14 38h6v-4a11 11 0 1 1 8 0v4h6" /><path d="M24 2v6M24 40v6" stroke-dasharray="2 3"/><path d="M4 14l6 3M44 14l-6 3"/>'),
  punch: SVG('<path d="M14 22v-6a3 3 0 0 1 6 0v4-7a3 3 0 0 1 6 0v7-6a3 3 0 0 1 6 0v8a3 3 0 0 1 5 2v6c0 7-5 12-12 12h-2c-6 0-11-5-11-11v-6a3 3 0 0 1 6 0" fill="rgba(255,255,255,.15)"/>'),
  jump: SVG('<path d="M24 40V12M13 22l11-11 11 11"/><path d="M12 44h24"/>'),
};
const SKILL_UI = { nexus: { s: ['sing', 'SINGULARIDADE'], u: ['abyss', 'ABISMO ESTELAR'], x: ['blitz', 'VELOCIDADE'] }, cyber: { s: ['flash', 'FLASH Ω'], u: ['nova', 'SUPERNOVA'], x: ['omega', 'LÂMINA Ω'] }, atlas: { s: ['sing', 'RESSONÂNCIA'], u: ['abyss', 'ABISMO ETERNO'], x: ['blitz', 'FENDA SÍSMICA'] } };
let uiChar = null;
/* futebol: rótulos CHUTE/PASSE/CRUZAR/DRIBLE. skillButtons() repõe os botões de combate sempre que o personagem muda (ex.: online, depois do perfil chegar) — por isso reaplica o futebol por cima. */
function soccerButtons() { $('btns').querySelectorAll('#bKick,#bSolar,#bSwap').forEach(b => b.classList.add('hidden')); for (const [id, ic, tx] of [['bAtk', '⚽', 'CHUTE'], ['bLas', '➜', 'PASSE'], ['bSup', '⤴', 'CRUZAR'], ['bVel', '⚡', 'DRIBLE']]) { const I = $(id + 'I'), T = $(id + 'T'); if (I) { I.innerHTML = ic; I.style.fontSize = '30px'; I.style.fontWeight = 900; } if (T) T.textContent = tx; else { const sp = $(id).querySelector('span'); if (sp) sp.textContent = tx; } } }
function skillButtons() { const ch = uiChar; skillButtons0(); if (MODE === 'soccer' && uiChar !== ch) soccerButtons(); }
function skillButtons0() { if (!me || uiChar === me.char) return; uiChar = me.char; const u = SKILL_UI[me.char] || SKILL_UI.nexus;
  document.body.classList.remove('ch-nexus', 'ch-cyber', 'ch-atlas'); document.body.classList.add('ch-' + me.char);
  $('bLasI').innerHTML = ICONS[u.s[0]]; $('bLasT').textContent = u.s[1]; $('bSupI').innerHTML = ICONS[u.u[0]]; $('bSupT').textContent = u.u[1]; $('bAtkI').innerHTML = ICONS.punch; $('bJmpI').innerHTML = ICONS.jump; $('bVelI').innerHTML = ICONS[u.x[0]]; $('bVelT').textContent = u.x[1]; $('bSwapI').innerHTML = ICONS.swap; $('bSolar').classList.toggle('hidden', me.char !== 'cyber'); }
function updateHud(dt) {
  hudT -= dt; const f = G.spec || me; if (!me) return; skillButtons();
  $('bLasN').textContent = me.cd.laser > 0 ? Math.ceil(me.cd.laser) : '';
  const vMax = me.char === 'cyber' ? SKILL_CD.velC : SKILL_CD.vel; $('bVelN').textContent = me.cd.vel > 0 ? Math.ceil(me.cd.vel) : ''; $('bVel').firstChild.style.setProperty('--p', clamp(me.cd.vel / vMax, 0, 1) * 100 + '%'); $('bVel').classList.toggle('ready', me.cd.vel <= 0);
  $('bSolarN').textContent = me.cd.solar > 0 ? Math.ceil(me.cd.solar) : ''; $('bSolar').firstChild.style.setProperty('--p', clamp(me.cd.solar / SKILL_CD.solar, 0, 1) * 100 + '%'); $('bSolar').classList.toggle('ready', me.cd.solar <= 0 && me.char === 'cyber');
  { const ab = me.abyss || (me.abyssBy && me.abyssBy.abyss); $('bSwap').classList.toggle('hidden', !me.abyss); const el = $('abyssT');
    if (ab) { el.classList.remove('hidden'); const left = Math.max(0, ABYSS_DUR - ab.t), rain = Math.max(0, 1.4 + ABYSS_RAIN - ab.t); el.innerHTML = `<b>ABISMO ESTELAR</b> ${Math.ceil(left)}s` + (rain > 0 ? `<small>chuva cósmica · ${Math.ceil(rain)}s</small>` : '<small>a chuva acabou</small>') + (me.abyss ? `<small>${me.dim ? 'TROCAR (F): ir ao mundo real' : 'TROCAR (F): voltar ao abismo'}</small>` : '<small>não há saída</small>'); }
    else el.classList.add('hidden'); }
  $('hpNum').textContent = Math.max(0, Math.round(me.hp)); $('enNum').textContent = me.energy >= 100 ? 'PRONTO' : Math.round(me.energy) + '%'; $('hpFill').style.width = clamp(me.hp / (me.maxHp || 100) * 100, 0, 100) + '%'; $('hpLag').style.width = clamp(me.hp / (me.maxHp || 100) * 100, 0, 100) + '%'; $('hpFill').style.background = me.hp < 30 ? 'linear-gradient(90deg,#ff3b3b,#ff8a5a)' : '';
  $('enFill').style.width = me.energy + '%'; $('enBar').classList.toggle('full', me.energy >= 100); $('bSup').classList.toggle('ready', me.energy >= 100);
  $('bSup').firstChild.style.setProperty('--p', (100 - me.energy) + '%'); $('bAtk').firstChild.style.setProperty('--p', clamp(me.cd.punch / .5, 0, 1) * 100 + '%'); $('bLas').firstChild.style.setProperty('--p', clamp(me.cd.laser / (SKILL_CD[me.char] || 4), 0, 1) * 100 + '%'); $('bLas').classList.toggle('ready', me.cd.laser <= 0);
  [...$('lasCh').children].forEach((c, i) => c.classList.toggle('off', i >= me.charges));
  if (hpPct(me) < 30 && me.alive) $('vig').style.opacity = .45 + Math.sin(world.time * 6) * .1;
  if (hudT > 0) return; hudT = .1;
  $('tKills').textContent = me.kills;
  if (MODE === 'battle') {
    $('tAlive').textContent = G.phase === 'waiting' ? (G.room ? G.room.players.length : 1) : aliveCount();
    if (G.phase === 'waiting') { $('tTimeL').textContent = 'INÍCIO'; $('tTime').textContent = fmt((G.startAt - now()) / 1000); }
    else if (!G.zone) { const left = Math.max(0, (G.startAt + 360000 - now()) / 1000); $('tTimeL').textContent = 'TEMPO'; $('tTime').textContent = fmt(left); $('zoneVig').style.opacity = 0; $('zoneMsg').classList.add('hidden');
      if (left <= 0 && G.started && !G.ended) { G.ended = true; G.placement = me.alive ? aliveCount() : (G.placement || aliveCount()); G.phase = 'over'; showResults(); } }
    else if (G.zone) { const z = G.zone.at(battleSec()); $('tTimeL').textContent = z.shrinking ? 'ZONA FECHANDO' : 'PRÓX. ZONA'; $('tTime').textContent = z.r <= 0.01 ? '0:00' : fmt(z.tNext);
      const out = me.alive && Math.hypot(me.x - z.x, me.z - z.z) > z.r; $('zoneVig').style.opacity = out ? .8 : 0;
      const zm = $('zoneMsg'); if (out) { zm.textContent = '⚠ FORA DA ZONA SEGURA · volte para dentro!'; zm.classList.add('warn'); zm.classList.remove('hidden'); } else if (z.shrinking) { zm.textContent = 'A zona está se fechando'; zm.classList.remove('warn'); zm.classList.remove('hidden'); } else zm.classList.add('hidden');
      if (z.phase !== G.lastZonePhase && G.started) { G.lastZonePhase = z.phase; if (z.phase > 0) { sfx('zone'); banner('NOVA ZONA MARCADA NO MAPA', 2200); } } }
  } else if (MODE === 'open') { $('tAlive').textContent = actors.size; $('tTimeL').textContent = 'MUNDO'; $('tTime').textContent = 'ABERTO'; }
  else { $('tTimeL').textContent = 'TREINO'; $('tTime').textContent = '∞'; }
  if (MODE === 'open' || ((MODE === 'train' || MODE === 'soccer') && !net.offline)) { const hs = [...actors.values()].filter(a => (a.kind === 'me' || a.kind === 'remote') && !a.apart), list = hs.map(a => (a.speaking ? '🎧 ' : '') + esc(a.name) + (a === me ? ' (você)' : '')); $('players').innerHTML = `<b>${hs.length}/16 ONLINE</b><br>` + list.slice(0, 8).join('<br>') + (list.length > 8 ? '<br>…' : ''); }
  drawMap(mmc, 336, 336, false); if (!$('bigmap').classList.contains('hidden')) drawMap(bmc, 1000, 560, true);
}

/* ===================================================== som por ator ===================================================== */
function sfx(name, a, k = 1) { const ch = name === 'hit' || name === 'kill' ? (me && me.char) : (a ? a.char : me && me.char); if (!a) return audio.play(name, null, k, ch); const self = a === me; audio.play(name, self ? null : a, k * (self ? 1 : .9), ch); }
function footsteps(a, dt) {
  if (!a.grounded || a.spd < 1.2 || !a.alive || a.vault) return; const ph = a.hero.phase / PI; if (Math.floor(ph) === Math.floor(a.stepPh)) { a.stepPh = ph; return; } a.stepPh = ph;
  const d = Math.hypot(a.x - camS.tx, a.z - camS.tz); if (d > 30) return;
  const onStone = inRealm(a) || a.y > world.terrainAt(a.x, a.z) + .2 || (CW.roadInfo(a.x, a.z)?.d < 0 && CW.roadInfo(a.x, a.z)?.kind === 'cobble');
  const movingFast = a.spd > 5;
  const brushingBush = (world.bushes || []).some(([bx, bz, bs]) => Math.hypot(a.x - bx, a.z - bz) < .72 + (bs || 1) * .62);
  if (brushingBush && audio.ctx) audio.foliageBrush(a, movingFast ? .9 : .58);
  const stepSound = a.inWater > .05 ? 'stepWater'
    : a.char === 'nexus' ? (movingFast ? 'runRobot' : 'stepRobot')
    : (inRealm(a) || MODE === 'space') ? (movingFast ? 'runCrystal' : 'stepCrystal')
    : onStone ? (movingFast ? 'runStone' : 'stepStone')
    : (movingFast ? 'runGrass' : 'stepGrass');
  sfx(stepSound, a, movingFast ? 1.5 : 1);
  if (a.inWater > .05) fx.splash(a.x, WATER_Y, a.z, .3); else if (movingFast && !onStone && Math.random() < .5) fx.dustStep(a.x, a.y, a.z, .6);
}

/* ===================================================== rede ===================================================== */
function packState(a) { return { x: r2(a.x), y: r2(a.y), z: r2(a.z), r: r2(a.yaw), sp: r2(a.spd), g: a.grounded ? 1 : 0, vy: r2(a.vy), w: r2(a.inWater), hp: Math.round(a.hp), mh: Math.round(a.maxHp), e: Math.round(a.energy), d: a.alive ? 0 : 1, an: a.anim, cr: a.crouch ? 1 : 0, k: a.kills, dr: a.drop ? 1 : 0, sk: a.skin, ch: a.char, n: a.name.slice(0, 16), ts: Math.round(now()) }; }
function applyRemote(a, s, t) {
  if (!s || typeof s.x !== 'number') return;
  if (s.ch && s.ch !== a.char && CHARS[s.ch] && !(a.kind === 'bot' && BOTS_ATLAS)) swapChar(a, s.ch);
  // carimbo de tempo do remetente (relógio do servidor): ignora repetidos e mede o intervalo real entre pacotes
  const ts = typeof s.ts === 'number' ? s.ts : null, lastB = a.buf[a.buf.length - 1];
  if (s.mh > 0) a.maxHp = s.mh;
  if (ts != null && lastB && lastB.ts != null && ts <= lastB.ts) { a.hp = s.hp; return; }
  if (ts != null && lastB && lastB.ts != null) { const gap = ts - lastB.ts; a.gap = a.gap ? a.gap * .85 + gap * .15 : gap; }
  a.buf.push({ t: ts != null ? ts : now(), ts, s }); if (a.buf.length > 30) a.buf.shift();
  if (s.an && s.an[1] !== a.lastSeq) { const first = a.lastSeq === 0 && a.buf.length < 2; a.lastSeq = s.an[1]; if (!first && s.an[0] !== 'death' && s.an[0] !== 'idle') { const ft = findTarget(a, 7, 2, null); a.hero.fightTarget = ft ? ft.hero : null; a.hero.play(s.an[0]); } }
  a.crouch = !!s.cr; a.hero.crouch = a.crouch;
  a.hp = s.hp; a.energy = s.e || 0; a.kills = s.k || 0; a.drop = s.dr || 0;
  if (s.d && a.alive) { a.alive = false; a.hero.play('death'); G.deadSet.add(a.id); }
  if (!s.d && !a.alive && MODE !== 'battle') { a.alive = true; a.hero.play('revive'); }
}
function interp(a, dt) {
  // reprodução atrasada no relógio do servidor; o atraso se adapta ao intervalo entre pacotes (evita "teleporte")
  const B = a.buf; if (!B.length) return; const delay = clamp((a.gap || 200) * 1.7 + 60, 160, 700), rt = now() - delay;
  let i = B.length - 1; while (i > 0 && B[i - 1].t > rt) i--;
  const b = B[i], p = i > 0 ? B[i - 1] : b; let k = b === p ? 1 : clamp((rt - p.t) / Math.max(1, b.t - p.t), 0, 1);
  const s0 = p.s, s1 = b.s; let tx = lerp(s0.x, s1.x, k), ty = lerp(s0.y, s1.y, k), tz = lerp(s0.z, s1.z, k);
  if (rt > b.t && i === B.length - 1 && B.length > 1) { // sem pacote novo: extrapola um pouco (máx. 250 ms) na direção do movimento
    const q = B[B.length - 2], dtp = Math.max(1, b.t - q.t), ex = Math.min(250, rt - b.t) / dtp; tx = s1.x + (s1.x - q.s.x) * ex * .6; tz = s1.z + (s1.z - q.s.z) * ex * .6; }
  const ox = a.x, oz = a.z, far = Math.hypot(tx - a.x, tz - a.z); const snap = far > 25; const f = snap ? 1 : 1 - Math.exp(-dt * (far > 4 ? 10 : 16));
  a.x = lerp(a.x, tx, f); a.y = lerp(a.y, ty, f); a.z = lerp(a.z, tz, f); a.yaw += angDiff(lerp(s0.r, s0.r + angDiff(s1.r, s0.r), k), a.yaw) * Math.min(1, f * 1.2);
  a.vx = (a.x - ox) / Math.max(dt, 1e-3); a.vz = (a.z - oz) / Math.max(dt, 1e-3); a.spd = Math.min(s1.sp, Math.hypot(a.vx, a.vz) + 1); a.grounded = !!s1.g; a.vy = s1.vy; a.inWater = s1.w;
  if (snap) a.buf = [b];
}
function onSync(r) {
  if (r.local) { for (const e of r.events) if (e.type === 'chat') { chatLine(e.data.name, e.data.text); sfx('chat'); } return; }
  if (!r || !Array.isArray(r.players)) return; const t = performance.now(); G.serverAlive = r.alive;
  if (r.startAt && MODE === 'battle') { G.startAt = r.startAt; }
  if (G.room) G.room.players = r.players;
  if (soccer) { try { soccer.x1Recv(r.players); } catch (e) { console.error(e); } }
  const seen = new Set([myId]);
  for (const p of r.players) { if (p.id === myId) continue; seen.add(p.id); let a = actors.get(p.id); if (!a) { if (MODE === 'battle' && G.started && !G.humansAtStart.includes(p.id)) continue; a = addActor(p.id, p.name, p.skin, 'remote', p.s && p.s.ch); if (MODE !== 'battle') { chatLine('', p.name + (MODE === 'soccer' ? ' entrou no estádio' : ' entrou no mundo'), true); } if (p.s) { a.x = p.s.x; a.y = p.s.y; a.z = p.s.z; } } applyRemote(a, soccer ? soccer.rotS(p.s) : p.s, t); a.apart = soccer ? !soccer.x1Same(p) : false; }
  for (const a of [...actors.values()]) if (a.kind === 'remote' && !seen.has(a.id)) { if (MODE === 'battle' && G.started && a.alive) { G.deadSet.add(a.id); feed('Desconectou', a.name, false); checkEnd(); } if (MODE !== 'battle') chatLine('', a.name + (MODE === 'soccer' ? ' saiu do estádio' : ' saiu do mundo'), true); removeActor(a.id); }
  // bots: anfitrião simula; os outros interpolam
  const host = r.hostId === myId;
  if (MODE === 'battle' && G.started) {
    for (const b of r.bots || []) { let a = actors.get(b.id); if (!a) { a = addActor(b.id, b.name, b.skin, 'bot', b.s && b.s.ch); a.simulated = false; if (b.s) { a.x = b.s.x; a.y = b.s.y; a.z = b.s.z; } } if (!a.simulated) applyRemote(a, b.s, t); }
    if (host) for (const a of actors.values()) if (a.kind === 'bot' && !a.simulated) { a.simulated = true; a.brain = new Brain(a, botSkill(), false); a.buf = []; if (!a.alive) a.hp = 0; }
    if (!host) for (const a of actors.values()) if (a.kind === 'bot' && a.simulated) { a.simulated = false; a.brain = null; }
  }
  for (const e of r.events || []) {
    if (e.from === myId && e.type !== 'chat') continue; const d = e.data || {};
    if (e.type === 'chat') { chatLine(d.name, d.text); sfx('chat'); }
    else if (e.type === 'hit') { const tg = actors.get(d.target); const src = actors.get(d.by); if (!tg || mates(src, tg)) continue; if (tg === me || (tg.kind === 'bot' && tg.simulated)) applyDamage(tg, Math.min(20000, d.dmg), d.by, d.kind, { kx: d.x, kz: d.z, zone: d.zn || null, knock: d.kn || null, resist: !!d.rs, stun: d.st || 0 }); else tg.hero.hitFlash(); if (src && tg === me) { /* direção do dano já aplicada */ } }
    else if (e.type === 'death') { const v = actors.get(d.victim), k = actors.get(d.killer); if (d.killer === myId && !(v && v.kind === 'bot' && v.simulated)) { me.kills++; sfx('kill'); banner('ELIMINOU ' + String(d.name || 'inimigo').toUpperCase(), 1500); } if (v && v.alive) { v.alive = false; v.hp = 0; v.hero.play('death'); } if (!G.deadSet.has(d.victim)) { G.deadSet.add(d.victim); feed(d.kname || (k ? k.name : 'Zona'), d.name || (v ? v.name : '?'), d.killer === myId); } checkEnd(); }
    else if (e.type === 'fx') { const a = actors.get(d.a); if (!a || a === me || (a.kind === 'bot' && a.simulated)) continue;
      if (d.kind === 'laser' && d.o && d.d) fireLaser(a, new THREE.Vector3(...d.o), new THREE.Vector3(...d.d), false);
      else if (d.kind === 'super') a.pending.push({ t: .56, fn: () => superHit(a, true) });
      else if (d.kind === 'sing') doSingularity(a, null, true);
      else if (d.kind === 'flash' && d.d) doFlash(a, null, true, d.d);
      else if (d.kind === 'nova') doNova(a, true);
      else if (d.kind === 'blitz' && Array.isArray(d.p)) doBlitz(a, true, d.p);
      else if (d.kind === 'swap' && a.abyss) swapAbyss(a, { x: d.x, y: d.y, z: d.z, yaw: d.r, inDim: !!d.d });
      else if (d.kind === 'omega') doOmega(a, true, actors.get(d.tg) || null);
      else if (d.kind === 'atlasGuard') doAtlasGuard(a,true);
      else if (d.kind === 'atlasResonance') doAtlasResonance(a,true);
      else if (d.kind === 'atlasRift') doAtlasRift(a,true);
      else if (d.kind === 'solar') doSolar(a, actors.get(d.tg) || null, true);
      else if (d.kind === 'atlasFist') doAbyssFist(a, actors.get(d.tg) || null, true);
      else if (d.kind === 'abyss') doAbyss(a, actors.get(d.tg) || null);
      
      else if (d.kind === 'pick') { const list = d.orb ? G.orbs : G.kits, it = list[d.i]; if (it) { it.t = 40; it.m.visible = false; } } }
  }
  if (MODE === 'battle' && G.phase === 'waiting' && r.status === 'running') beginBattle(r.players);
}
function botSkill() { const hs = G.room && G.room.players ? G.room.players : []; const avg = hs.length ? hs.reduce((s, p) => s + (p.trophies || 0), 0) / hs.length : 0; return clamp(.42 + avg / 3200, .4, .9); }

/* ===================================================== fluxo da partida ===================================================== */
function beginBattle(players) {
  if (G.started) return; G.started = true; G.phase = 'live'; G.zone = null; buildItems(G.seed); /* zona segura removida da batalha de 16 */
  const humans = (players && players.length ? players.map(p => p.id) : [myId]); if (!humans.includes(myId)) humans.push(myId); humans.sort(); G.humansAtStart = humans;
  for (const a of [...actors.values()]) if (a.kind === 'remote' && !humans.includes(a.id)) removeActor(a.id);
  const S = slots(G.seed); placeAt(me, S[humans.indexOf(myId) % 16], true); me.lvl = ME_BUFF.lvl; me.maxHp = CS.hpAt(me.char, me.lvl); me.hp = me.maxHp; me.energy = 0; me.charges = 3;
  for (const a of actors.values()) if (a.kind === 'remote') { const i = humans.indexOf(a.id); if (i >= 0) a.drop = 1; }
  if (net.isHost()) { const nb = 16 - humans.length, sk = botSkill(); for (let i = 0; i < nb; i++) makeBot(i, null, sk); [...actors.values()].filter(a => a.kind === 'bot').forEach((a, i) => placeAt(a, S[(humans.length + i) % 16], true)); }
  $('mmk').classList.add('hidden'); $('count').classList.add('hidden'); $('emotes').classList.add('hidden'); sfx('go'); banner('A BATALHA COMEÇOU! · seja o último de pé', 2600);
  camS.yaw = Math.atan2(-me.x, -me.z); camS.pitch = .35;
  if (TUT) { tut = initTutMatch({ banner, sfx, getMe: () => me, actors, getCam: () => camS, placeAt, enemiesOf }); tut.begin(); }
}
function onMyDeath(k) { G.placement = aliveCount() + 0; G.killer = k; G.phase = 'dead'; $('dPlace').textContent = '#' + (G.placement); $('dBy').textContent = k && k !== me ? 'Eliminado por ' + k.name : 'Você foi eliminado'; setTimeout(() => { if (G.phase === 'dead') $('ovDeath').classList.remove('hidden'); }, 1800); }
function checkEnd() {
  if (MODE !== 'battle' || !G.started || G.ended) return; const al = aliveCount();
  if (al <= 1 && me.alive) { G.ended = true; G.placement = 1; G.phase = 'over'; sfx('victory'); me.play('dance'); $('wK').textContent = me.kills + (me.kills === 1 ? ' abate' : ' abates'); setTimeout(() => $('ovWin').classList.remove('hidden'), 1500); }
  else if (al <= 1 && !me.alive && G.phase === 'spectate') { G.ended = true; setTimeout(() => showResults(), 2500); }
}
async function showResults() {
  if (G.result) return; G.result = 'pending'; ['ovDeath', 'ovWin'].forEach(i => $(i).classList.add('hidden'));
  const placement = G.placement || aliveCount(); $('rTitle').textContent = placement === 1 ? 'VITÓRIA!' : 'Colocação #' + placement; $('rPl').textContent = '#' + placement; $('rK').textContent = me.kills; $('ovRes').classList.remove('hidden'); $('rNote').textContent = 'Calculando recompensas…';
  const res = await net.finish({ placement, kills: me.kills }); G.result = res;
  $('rPl').textContent = '#' + res.placement; $('rK').textContent = res.kills; $('rT').textContent = (res.trophiesDelta >= 0 ? '+' : '') + res.trophiesDelta + ' 🏆'; $('rT').style.color = res.trophiesDelta >= 0 ? '#7cff9a' : '#ff8a8a'; $('rX').textContent = '+' + res.xpGain;
  const p = res.profile || {}; $('rL').textContent = p.level || 1; $('rR').textContent = p.rank ? p.rank.name + ' ' + ['', 'I', 'II', 'III'][p.rank.tier || 1] : '—'; setTimeout(() => $('rXb').style.width = (p.levelNext ? p.levelXp / p.levelNext * 100 : 0) + '%', 100);
  if (NOPROG) { $('rT').textContent = '—'; $('rT').style.color = '#9bb4dc'; $('rX').textContent = '—'; }
  $('rNote').textContent = NOPROG ? 'Modo offline: sem troféus, XP ou recompensas. Nada é salvo na conta.' : res.offline ? 'Modo offline: progresso não é salvo.' : `Total: ${p.trophies} troféus · ${p.wins} vitórias`;
  if (embedded && !NOPROG) parent.postMessage({ type: 'cyberarena:match-result', result: Object.assign({}, res, { char: me.char, matchId: G.seed || Date.now(), lvl: ME_BUFF.lvl }) }, '*');
  net.leave();
}

/* ===================================================== itens (coleta) ===================================================== */
function updateItems(dt) {
  for (const list of [G.kits, G.orbs]) for (const k of list) {
    if (k.t > 0) { k.t -= dt; if (k.t <= 0) k.m.visible = true; continue; }
    k.m.rotation.y += dt * 1.6; k.m.position.y = world.groundAt(k.x, k.z) + 1 + Math.sin(world.time * 2 + k.i) * .15;
    for (const a of actors.values()) { if (!a.alive || !a.simulated || a.drop) continue; if (Math.hypot(a.x - k.x, a.z - k.z) > 1.5 || Math.abs(a.y + 1 - k.m.position.y) > 2) continue;
      const orb = list === G.orbs; if (orb ? a.energy >= 100 : a.hp >= a.maxHp) continue;
      if (orb) a.energy = Math.min(100, a.energy + 40); else a.healT = 1.6;
      k.t = 40; k.m.visible = false; fx.emit(k.x, k.m.position.y, k.z, 24, { color: orb ? [.8, .5, 1] : [.4, 1, .6], speed: 4, up: 2, life: .6 }); if (a === me) { sfx('pickup'); banner(orb ? '+40 ENERGIA' : 'CURANDO +' + Math.round(a.maxHp * CS.RULES.kitPct), 1000); }
      if (!net.offline) net.send('fx', { kind: 'pick', i: k.i, orb: orb ? 1 : 0, a: a.id }); break; }
  }
}

/* ===================================================== câmera ===================================================== */
function updateCamera(dt) {
  const f = solarFocus || G.spec || me; if (!f) return; const tps = camS.mode === 'tps';
  const ns = novaFocus && novaFocus.novaSequence, np = ns && ns.cameraPoint;
  const sh = tps ? .75 : 0, fy = camS.yaw, rx = -Math.cos(fy), rz = Math.sin(fy);
  const tx = np ? np.x : f.x + rx * sh, ty = np ? np.y : f.y + (tps ? 1.9 : 1.4), tz = np ? np.z : f.z + rz * sh;
  const k = camS.init ? 1 - Math.exp(-dt * 14) : 1; camS.tx = lerp(camS.tx, tx, k); camS.ty = lerp(camS.ty, ty, 1 - Math.exp(-dt * 9)); camS.tz = lerp(camS.tz, tz, k); if (!camS.init) { camS.tx = tx; camS.ty = ty; camS.tz = tz; }
  const special = !!(solarFocus || ns || f.busyMove > .85), zk = tps ? (special ? .5 : .72) : 1; camS.zk = camS.zk == null ? zk : lerp(camS.zk, zk, 1 - Math.exp(-dt * 3.5));
  const rawD = camS.dist * (f.drop ? 1.8 : 1), cdc = rawD > 30 ? 30 + (rawD - 30) * .35 : rawD;   // câmera de terceira pessoa mais perto; nas habilidades especiais ainda mais perto
  const p = camS.pitch, cd = tps ? Math.max(2.6, cdc * camS.zk) : rawD, dx = -Math.sin(fy) * Math.cos(p), dy = Math.sin(p), dz = -Math.cos(fy) * Math.cos(p);
  let ex = camS.tx + dx * cd, ey = camS.ty + dy * cd, ez = camS.tz + dz * cd;
  const spatialCamera = !!spaceSt || !!ns;
  const blk = spatialCamera ? null : envOf(f).rayBlocked(camS.tx, camS.ty, camS.tz, ex, ey, ez); let want = cd; if (blk) want = Math.max(1.4, cd * blk.t - .4);
  camS.cur = camS.cur == null ? want : (want < camS.cur ? want : lerp(camS.cur, want, 1 - Math.exp(-dt * 4))); ex = camS.tx + dx * camS.cur; ey = camS.ty + dy * camS.cur; ez = camS.tz + dz * camS.cur;
  // No espaço cinematográfico a câmera não pode ser empurrada de volta para cima do terreno invisível.
  if (!spatialCamera) ey = Math.max(ey, envOf(f).groundAt(ex, ez, ey + 2) + .5, inRealm(f) ? -1e9 : WATER_Y + .4);
  G.shake = Math.max(0, G.shake - dt * 2.2); const sk = shake.update(dtS, G.shake); camera.position.set(ex + sk.x, ey + sk.y, ez + sk.z);
  camera.lookAt(camS.tx, camS.ty, camS.tz); if (sk.roll) camera.rotateZ(sk.roll); camS.init = true;
  const fov = tps ? 60 + clamp(f.spd - 6, 0, 3) * 1.5 : 50; if (Math.abs(camera.fov - fov) > .05) { camera.fov = lerp(camera.fov, fov, 1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix(); world.camFov = camera.fov * PI / 180; }
  // sombra acompanha o foco (alinhada à grade para não tremer)
  // ancorada ao texel do mapa de sombra, no espaço da luz: a sombra não "nada" nem pisca ao andar (antes: grade de 2 m, que não casa com o texel)
  { const sd = U.uSun.value, texel = Q.shadows ? 84 / Q.shadowMap : 1, rl = Math.hypot(sd.x, sd.z) || 1, rx = sd.z / rl, rz = -sd.x / rl,   // eixo "direita" da câmera da luz
      fx_ = -sd.x, fy_ = -sd.y, fz_ = -sd.z, upx = -rz * fy_, upy = rz * fx_ - rx * fz_, upz = rx * fy_;                                      // eixo "cima" = direita × frente
    const a = f.x * rx + f.z * rz, b = f.x * upx + f.y * upy + f.z * upz, da = Math.round(a / texel) * texel - a, db = Math.round(b / texel) * texel - b;
    const sx = f.x + rx * da + upx * db, sy = f.y + upy * db, sz = f.z + rz * da + upz * db;
    sun.position.set(sx + sd.x * 90, sy + sd.y * 90, sz + sd.z * 90); sun.target.position.set(sx, sy, sz); }
  audio.listener = { x: camera.position.x, z: camera.position.z, yaw: camS.yaw };
}

/* ===================================================== laço principal ===================================================== */
let last = performance.now(), paceT = last, fpsN = 0, fpsT = 0, fpsAvg = 60, dtS = 1 / 60;

/* ---- taxa de atualização real da tela (60/90/120/144 Hz): só sobe, nunca desce (um aparelho lento não vira "tela de 30 Hz") ---- */
let refreshHz = 60, rawLast = last, rawI = 0, rawN = 0; const rawD = new Float32Array(48), HZ = [60, 72, 75, 90, 100, 120, 144, 165, 240];
function noteRaw(t) {
  const d = t - rawLast; rawLast = t; if (d < 2 || d > 60) return;
  rawD[rawI++ % 48] = d; rawN++;
  if (rawN >= 96 && rawN % 96 === 0) { const p10 = Array.from(rawD).sort((a, b) => a - b)[4], hz = 1000 / p10; let best = 60; for (const h of HZ) if (Math.abs(h - hz) < Math.abs(best - hz)) best = h; if (best > refreshHz) refreshHz = best; }
}
const targetFps = () => SET.fps > 0 ? Math.min(SET.fps, refreshHz) : refreshHz;

/* ---- qualidade adaptativa v2 ----
   Uma única "escada" de níveis, do melhor para o mais leve: resolução (até ~0,8×) → sombras a meia taxa → grama 60% → resolução até o piso →
   grama 30%/0% → sombras a 1/3 da taxa → sombras desligadas. Desce rápido quando perde quadros e sobe devagar, um degrau por vez.
   Se um degrau de subida falha, ele fica bloqueado por um tempo crescente (10 s → 120 s): acaba o vai-e-volta de resolução que
   realocava o framebuffer e engasgava. Tudo é reversível, inclusive grama e sombras. */
const FLOOR = IS_APK || isTouch ? .7 : .6, SOFT = IS_APK || isTouch ? .85 : .8;
const LADDER = (() => {
  const L = [], add = (pr, g, se, sh) => { const p = L[L.length - 1]; if (!p || p.pr !== pr || p.g !== g || p.se !== se || p.sh !== sh) L.push({ pr, g, se, sh }); };
  const prs = [basePR, ...[3, 2.5, 2, 1.75, 1.5, 1.25, 1.1, 1, .9, .8, .7, .6].filter(p => p < basePR - .04 && p >= FLOOR - .001)];
  const hi = prs.filter(p => p >= SOFT - .001), lo = prs.filter(p => p < SOFT - .001), sh = !!Q.shadows, gr = !!Q.grass, pS = hi.length ? hi[hi.length - 1] : prs[0], se2 = sh ? 2 : 1;
  hi.forEach(p => add(p, 1, 1, 1));
  if (sh) add(pS, 1, 2, 1);
  if (gr) add(pS, .6, se2, 1);
  lo.forEach(p => add(p, gr ? .6 : 1, se2, 1));
  const e = L[L.length - 1];
  if (gr) { add(e.pr, .3, se2, 1); add(e.pr, 0, se2, 1); }
  if (sh) { const f = L[L.length - 1]; add(f.pr, f.g, 3, 1); add(f.pr, f.g, 3, 0); }
  return L;
})();
let aqIdx = 0, shadowEvery = 1, shadowCtr = 0, shadowsOn = !!Q.shadows;
function setPR(v) { if (Math.abs(v - curPR) < .01) return; curPR = v; renderer.setPixelRatio(curPR); onResize(); }
const matsDirty = () => scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
function applyLevel(i) {
  const s = LADDER[i]; aqIdx = i; if (post) post.adapt(i / Math.max(1, LADDER.length - 1)); setPR(s.pr); world.setGrassScale(s.g); shadowEvery = s.se;
  if (!s.sh && shadowsOn) { shadowsOn = false; renderer.shadowMap.enabled = false; sun.castShadow = false; matsDirty(); }
  else if (s.sh && !shadowsOn && Q.shadows) { shadowsOn = true; renderer.shadowMap.enabled = true; sun.castShadow = true; matsDirty(); renderer.shadowMap.needsUpdate = true; }
}
const aq = { win: 0, n: 0, sum: 0, miss: 0, slow: 0, fast: 0, lastChange: 0, up: false, blocked: -1, blockedUntil: 0, wait: 10000, warm: 0 };
function aqFrame(ms, t) {
  if (G.phase === 'loading' || document.hidden) { aq.n = aq.sum = aq.miss = aq.slow = aq.fast = 0; aq.win = t; aq.warm = t + 2500; return; }
  if (t < aq.warm || ms > 250) { aq.win = Math.max(aq.win, aq.warm - 500); return; }   // ignora carregamento, troca de aba e o instante após realocar o framebuffer
  const budget = 1000 / targetFps(); aq.n++; aq.sum += ms; if (ms > budget * 1.4) aq.miss++;
  if (t - aq.win < 500) return;
  const n = aq.n, ratio = aq.sum / Math.max(1, n) / budget, missF = aq.miss / Math.max(1, n); aq.win = t; aq.n = aq.sum = aq.miss = 0;
  if (n < 3) return;
  const slow = ratio > 1.15 || missF > .08, fast = ratio < 1.06 && missF < .02;
  if (slow) { aq.slow++; aq.fast = 0; } else if (fast) { aq.fast++; aq.slow = 0; } else { aq.slow = 0; aq.fast = Math.max(0, aq.fast - 1); }
  if (aq.slow >= 2 || (ratio > 1.8 && aq.slow >= 1)) {
    aq.slow = 0; if (aqIdx >= LADDER.length - 1) return;
    if (aq.up && t - aq.lastChange < 8000) { aq.blocked = aqIdx; aq.wait = Math.min(120000, aq.wait * 2); aq.blockedUntil = t + aq.wait; }
    const cur = LADDER[aqIdx]; let j = aqIdx + 1;
    if (ratio > 1.35) { const want = cur.pr / Math.sqrt(ratio); while (j + 1 < LADDER.length && LADDER[j].g === cur.g && LADDER[j].se === cur.se && LADDER[j].sh === cur.sh && LADDER[j].pr > want) j++; }
    applyLevel(j); aq.up = false; aq.lastChange = t; aq.warm = t + 1200;
  } else if (aq.fast >= 8 && aqIdx > 0 && t - aq.lastChange > 4000 && !(aqIdx - 1 === aq.blocked && t < aq.blockedUntil)) {
    applyLevel(aqIdx - 1); aq.up = true; aq.lastChange = t; aq.warm = t + 1200; aq.fast = 0;
  }
  if (aq.up && t - aq.lastChange > 30000) { aq.wait = 10000; aq.up = false; }
}
if (params.get('debug') && window.__ca) Object.assign(window.__ca, { aq, LADDER, applyLevel, aqFrame, getIdx: () => aqIdx, refresh: () => refreshHz });
// app em segundo plano: não acumula tempo nem dispara a qualidade automática ao voltar
document.addEventListener('visibilitychange', () => { last = paceT = performance.now(); dtS = 1 / 60; fpsN = 0; fpsT = 0; aq.warm = last + 2500; });
function frame(t) {
  requestAnimationFrame(frame); noteRaw(t);
  // ritmo de quadros: guarda o resto da divisão para o limite de FPS não "bater" com a taxa da tela (causava quadros duplicados/pulados)
  const cap = SET.fps > 0 ? SET.fps : 0;
  if (cap) { const iv = 1000 / cap, pe = t - paceT; if (pe < iv - 1.5) return; paceT = pe >= iv ? t - (pe % iv) : t; } else paceT = t;
  const el = t - last; last = t; fpsN++; fpsT += el;
  // suaviza o jitter do relógio do navegador (±1–2 ms) sem esconder travadas reais: dá movimento mais "liso" a 60/120 Hz
  const raw = Math.min(.05, el / 1000); dtS = Math.abs(raw - dtS) < dtS * .4 ? dtS + (raw - dtS) * .3 : raw;
  const dt = dtS * (G.slowUntil > t ? .28 : 1);
  if (fpsT > 1000) { fpsAvg = fpsN * 1000 / fpsT; if (SET.showFps) $('fps').textContent = Math.round(fpsAvg) + ' FPS · ' + qName.toUpperCase() + ' · ' + curPR.toFixed(2) + '× · N' + aqIdx + ' · ' + renderer.info.render.triangles.toLocaleString('pt-BR') + ' tri'; fpsN = 0; fpsT = 0; }
  aqFrame(el, t);
  if (G.phase === 'loading') return;
  tick(dt);
  fx.setScale(renderer.domElement.height / 2 / Math.tan(camera.fov * PI / 360));
  const se = Math.max(shadowEvery, targetFps() >= 100 ? 2 : 1);
  if (se > 1 && renderer.shadowMap.enabled) { renderer.shadowMap.autoUpdate = false; if (shadowCtr++ % se === 0) renderer.shadowMap.needsUpdate = true; } else renderer.shadowMap.autoUpdate = true;
  syncPBR(sun, world.time || t / 1000); HERO_CAM.copy(camera.position); phys.update(dt);
  bounce.color.copy(hemi.groundColor).multiplyScalar(1.5); bounce.intensity = .5 * Math.min(1.5, sun.intensity / 2.9);
  bounce.position.copy(sun.position).sub(sun.target.position).multiplyScalar(-1); bounce.position.y = -Math.abs(bounce.position.y) - 30; bounce.position.add(bounce.target.position);
  if (post) { post.setGrade(ENV.realmOn ? 'realm' : 'arena'); post.render(scene, camera, dtS); } else renderer.render(scene, camera);
}
let pushList = [], pushCtr = 0;
const _frus = new THREE.Frustum(), _pvm = new THREE.Matrix4(), _cSph = new THREE.Sphere();
function tick(dt) {
  // jogador local
  if (me) {
    if (me.solarSequence) updateSolarSequence(me, dt);
    else if (me.novaSequence) updateNovaSequence(me, dt);
    else if (me.atlasSequence) updateAtlasFist(me, dt);
    else if (me.velocityDuel) updateVelocityDuel(me, dt);
    else if (!me.solarVictim && !me.atlasVictim && !me.velocityDuelBy) {
      if (awayBrain && me.alive && G.phase === 'live') { awayBrain.update(dt); const b = awayBrain; stepActor(me, fdt(me, dt), b.mx, b.mz, Math.hypot(b.mx, b.mz), b.jump); }
      else { const [mx, mz, mag] = me.alive && G.phase !== 'over' ? readMove() : [0, 0, 0]; stepActor(me, fdt(me, dt), mx, mz, mag, input.jump && me.alive); } }
    input.jump = false;
    if (me && me.hero.atlasRig && buildEmotes.char !== me.char) buildEmotes();
  }
  // countdown de matchmaking
  if (MODE === 'battle' && G.phase === 'waiting') {
    const left = (G.startAt - now()) / 1000; const n = G.room && G.room.players ? G.room.players.length : 1;
    const tTxt = left > 0 ? `Começa em ${Math.ceil(left)}s` : 'Iniciando…', sTxt = `${n} jogador${n > 1 ? 'es' : ''} online · ${16 - n} bots completam a sala` + (CODE ? ` · sala ${CODE}` : '');
    if (G._mk !== tTxt + sTxt) { G._mk = tTxt + sTxt; $('mmkT').textContent = tTxt; $('mmkS').textContent = sTxt; $('mmkP').innerHTML = Array.from({ length: 16 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join(''); }
    if (left <= 3.2 && left > 0) { const c = Math.ceil(left); if ($('count').textContent !== String(c)) { $('count').textContent = c; $('count').classList.remove('hidden'); sfx('count'); } }
    if (left <= 0 && (net.offline || left < -2.5)) beginBattle(G.room ? G.room.players : null);
  }
  // atores
  const focus = G.spec || me;
  _pvm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frus.setFromProjectionMatrix(_pvm);
  for (const a of actors.values()) {
    for (const k in a.cd) a.cd[k] = Math.max(0, a.cd[k] - dt); a.busyMove = Math.max(0, a.busyMove - dt); a.aimT -= dt;
    if (a.charges < 3) { a.chargeT += dt; if (a.chargeT > 1.3) { a.chargeT = 0; a.charges++; } } else a.chargeT = 0;
    if (a.pending.length) { const P = a.pending; let w = 0, due = null; for (let i = 0; i < P.length; i++) { const p = P[i]; p.t -= dt; if (p.t <= 0) (due || (due = [])).push(p); else P[w++] = p; } P.length = w; if (due) for (const p of due) p.fn(); }
    if (a !== me) {
      if (a.solarSequence) updateSolarSequence(a, dt);
      else if (a.novaSequence) updateNovaSequence(a, dt);
      else if (a.atlasSequence) updateAtlasFist(a, dt);
      else if (a.velocityDuel) updateVelocityDuel(a, dt);
      else if (a.solarVictim || a.atlasVictim || a.velocityDuelBy) { /* mantido pelo roteiro solar do atacante */ }
      else if (a.simulated) { if (a.brain && canFightBots()) a.brain.update(dt); const b = a.brain; stepActor(a, fdt(a, dt), b && canFightBots() ? b.mx : 0, b && canFightBots() ? b.mz : 0, b ? Math.hypot(b.mx, b.mz) : 0, b ? b.jump : false); }
      else interp(a, dt);
    }
    if (a.simulated && a.alive) { // regeneração e cura
      if (a.healT > 0) { a.healT -= dt; a.hp = Math.min(a.maxHp, a.hp + a.maxHp * CS.RULES.kitPct / CS.RULES.kitSecs * dt); if (Math.random() < .3) fx.emit(a.x, a.y + 1 + Math.random() * 1.5, a.z, 1, { color: [.4, 1, .6], speed: .5, up: 1.5, life: .6, grav: 0 }); }
      else if (world.time - a.lastHitT > 6) a.hp = Math.min(a.maxHp, a.hp + a.maxHp * CS.RULES.regenPct * dt);
      if (MODE === 'battle' && G.phase === 'live' && G.zone) { const z = G.zone.at(battleSec()); if (Math.hypot(a.x - z.x, a.z - z.z) > z.r) { a.zoneAcc = (a.zoneAcc || 0) + z.dps * (a.maxHp / 100) * dt; if (a.zoneAcc >= 1) { const dmg = Math.floor(a.zoneAcc); a.zoneAcc -= dmg; a.hp -= dmg; a.lastHitT = world.time; if (a === me) $('zoneVig').style.opacity = 1; if (a.hp <= 0) kill(a, null); } } }
      a.energy = Math.min(100, a.energy + dt * (MODE === 'space' ? 30 : MODE === 'train' ? 6 : 1.2));
    }
    // visual
    const d = focus ? Math.hypot(a.x - focus.x, a.z - focus.z) : 0;
    // fora do campo de visão (com folga para a sombra, que cai até ~6 m) não desenha, não faz skinning nem entra no passe de sombra
    _cSph.center.set(a.x, a.y + 1, a.z); _cSph.radius = 6 + d * .04;
    const solarPair = !!solarFocus && ((!!solarFocus.novaSequence && a === solarFocus) || (!!solarFocus.solarSequence && (a === solarFocus || (a === solarFocus.solarSequence.victim && !a.solarHidden))) || (!!solarFocus.atlasSequence && (a === solarFocus || a === solarFocus.atlasSequence.victim)) || (!!solarFocus.velocityDuel && (a === solarFocus || a === solarFocus.velocityDuel.opponent)));
    const vis = solarPair || (d < (TUT ? 62 : 170) && (!spaceSt || spaceSt.ids.has(a.id)) && !a.apart && (a === focus || _frus.intersectsSphere(_cSph))) ;   // tutorial: só desenha quem está perto (partida mais leve)
    a.hero.setVisible(vis); a.hero.cloth = d < 30;
    // LOD do personagem: malha completa só em ultra e a <12 m · padrão: malha média (≈1/3 dos triângulos) · 28–55 m malha leve · >55 m leve, sem sombra e animação a 1/3 da taxa
    const full = qName === 'ultra' || qName === 'ultra4k' || qName === 'max', lod = d < 12 && full ? 0 : d < (a.hero.lod >= 2 ? 25 : 28) ? 1 : d < 55 ? 2 : 3; a.hero.setLOD(lod);   // histerese de 3 m: sem troca de malha/material quando alguém está na fronteira
    a._hdt = (a._hdt || 0) + dt; const every = lod === 3 ? 3 : lod === 2 ? 2 : 1; a._hk = ((a._hk || 0) + 1) % every; const upd = vis && a._hk === 0; const hdt = Math.min(a._hdt, .12); if (upd) a._hdt = 0;
    if (vis) { a.hero.object.position.set(a.x, a.y, a.z); a.hero.object.rotation.y = a.yaw;
      const c = Math.cos(a.yaw), s = Math.sin(a.yaw); if (!a.gfn) a.gfn = (x, z) => envOf(a).groundAt(x, z, a.y + .9, .9);
      if (upd) a.hero.update(a._freeze > 0 ? hdt * .04 : hdt, { ground: a.hero.cloth ? a.gfn : null, slope: a.slope || 0, scramble: a.scramble || 0, speed: a.spd, localVel: { x: a.vx * c - a.vz * s, z: a.vx * s + a.vz * c }, grounded: a.grounded && !a.drop, vy: a.drop ? -2 : a.vy, inWater: a.inWater, wind: { x: U.uWind.value.x, z: U.uWind.value.y, strength: U.uWind.value.z }, aiming: a.aimT > 0 && a.cd.laser > 0 }); }
    if (a._freeze > 0) a._freeze -= dtS;
    a.hero.vital = a.maxHp ? a.hp / a.maxHp : 1; if (a.hero.brakeEvt) { fx.dustStep(a.x, a.y, a.z, 2.5); a.hero.brakeEvt = 0; }
    footsteps(a, dt);
  }
  // Contato corporal entre atores: cápsulas de tronco separam volumes, transferem impulso e pressionam a malha macia.
  resolveActorBodyContacts(dt);
  if (soccer) soccer.update(dt);
  // empurrões na vegetação (personagens próximos da câmera)
  const push = U.uPush.value; let pi = 0;
  if (pushCtr++ % 8 === 0) pushList = [...actors.values()].sort((p, q) => Math.hypot(p.x - camS.tx, p.z - camS.tz) - Math.hypot(q.x - camS.tx, q.z - camS.tz)).slice(0, 8);
  for (const a of pushList) { if (pi >= 8) break; if (actors.get(a.id) !== a) continue; push[pi++].set(a.x, a.y, a.z, .55 + Math.min(1, a.spd / 7) * .25); } for (; pi < 8; pi++) push[pi].set(0, -999, 0, 0);
  fx.update(dt, laserCollide); SOFTBODY.begin(); powers.update(dt); SOFTBODY.end();
  updateItems(dt);
  if (tut) tut.update(dt);
  if (zoneMesh && zoneMesh.visible && G.zone) { const z = G.zone.at(battleSec()); zoneMesh.position.set(z.x, 20, z.z); zoneMesh.scale.set(Math.max(.01, z.r), 1, Math.max(.01, z.r)); }
  const fr = focus && inRealm(focus); world.update(dt, camera.position, fr ? null : focus); if (realm) realm.update(world.time, camera.position); updateEnv(dt, focus);
  updateCamera(dt); updateTags(); updateHud(dt);
  // respiração do jogador (alta, por personagem)
  try { if (audio.ctx && me) { const ex = Math.max(0, Math.min(1, me.spd / 9 + (me.busyMove > 0 ? .45 : 0) + (hpPct(me) < 40 ? .25 : 0))); audio.breathe(dt, me.char, ex, me.alive && G.phase !== 'waiting' && !G.paused); } } catch (_) { }
  // ambiente sonoro
  if (focus && audio.ctx) { const spatial = inRealm(focus); const ri = spatial ? null : CW.riverInfo(focus.x, focus.z), wd = ri ? Math.max(0, ri.d - ri.hw) : 30; let fd = 99; if (!spatial) for (const f of world.fires || []) fd = Math.min(fd, Math.hypot(f[0] - focus.x, f[2] - focus.z)); audio.ambient(dt, U.uWind.value.z, wd, fd, spatial, spatial ? 0 : CW.forestDensity(focus.x, focus.z)); }
}
/* ===================================================== ambiente: interior escuro, Mundo Cristal, portal ===================================================== */
let worldObjs = [];
const ENV = { ins: 0, realmOn: false, hemiI: hemi.intensity, sunI: sun.intensity, exp: renderer.toneMappingExposure, fogC: scene.fog.color.clone(), fogN: scene.fog.near, fogF: scene.fog.far, hemiC: hemi.color.clone(), hemiG: hemi.groundColor.clone(), sunC: sun.color.clone() };
function setRealm(on) {
  ENV.realmOn = on; if (on) { realm.build(); applyCinematicToonScene(realm.group); } realm.group.visible = on;
  for (const o of worldObjs) { if (o.isLight || o === sun.target || o === realm.group) continue; if (on) { o.userData.wasVis = o.visible; o.visible = false; } else o.visible = o.userData.wasVis ?? true; }
  if (on && realm.light) { const L = realm.light; hemi.color.set(L.hemiC); hemi.groundColor.set(L.hemiG); hemi.intensity = L.hemiI; sun.color.set(L.sunC); sun.intensity = L.sunI; scene.fog.color.set(L.fogC); scene.fog.near = L.fogN; scene.fog.far = L.fogF; renderer.toneMappingExposure = L.exp; }
  else if (on) { hemi.color.set(0x9a8cff); hemi.groundColor.set(0x1a1030); hemi.intensity = 1.0; sun.color.set(0xb8c4ff); sun.intensity = 1.6; scene.fog.color.set(0x140b2c); scene.fog.near = 70; scene.fog.far = 330; renderer.toneMappingExposure = 1.15; }
  else { hemi.color.copy(ENV.hemiC); hemi.groundColor.copy(ENV.hemiG); sun.color.copy(ENV.sunC); scene.fog.color.copy(ENV.fogC); scene.fog.near = ENV.fogN; scene.fog.far = ENV.fogF; }
}
function updateEnv(dt, f) {
  if (!me || !realm || spaceSt) return; const want = inRealm(G.spec || me); if (want !== ENV.realmOn) setRealm(want);
  if (!ENV.realmOn && !ENV.spaceOn) {
    const I = world.interior, inside = I && f && Math.hypot(f.x - I.cx, f.z - I.cz) < I.R && f.y > I.y - .6 && f.y < I.top ? 1 : 0;
    ENV.ins = lerp(ENV.ins, inside, 1 - Math.exp(-dt * (inside ? 1.6 : 2.4))); const k = ENV.ins;  // adaptação do olho ao escuro
    hemi.intensity = lerp(ENV.hemiI, .1, k); sun.intensity = lerp(ENV.sunI, ENV.sunI * .5, k); renderer.toneMappingExposure = lerp(ENV.exp, 1.3, k);
    if (world.shaftMat) world.shaftMat.uniforms.uK.value = .7 + k * 1.8;
    if (world.coreLight) world.coreLight.shadow.autoUpdate = k > .02;
  }
  // portal (só no Mundo Aberto)
  let near = null;
  if (MODE === 'open' && me.alive && !TP.busy) {
    const P = ENV.realmOn ? realm.portal : world.portal;
    if (P && Math.hypot(me.x - P.x, me.z - P.z) < P.r + (ENV.realmOn ? .8 : 1.4) && Math.abs(me.y - P.y) < 3.5) near = P;
  }
  const show = !!near; if (show !== TP.shown) { TP.shown = show; $('bPortal').classList.toggle('hidden', !show); $('portalHint').classList.toggle('hidden', !show);
    $('portalHint').innerHTML = ENV.realmOn ? '✦ PORTAL DE VOLTA<br><small>Toque em VIAJAR (F) para voltar à Casona</small>' : '✦ CRISTAL DO NÚCLEO<br><small>Toque em VIAJAR (F) para ir ao Mundo Cristal</small>'; if (show) sfx('pickup'); }
}
const TP = { busy: false, shown: false };
function teleport() {
  if (TP.busy || MODE !== 'open' || !TP.shown || !me.alive) return; TP.busy = true; const toRealm = !ENV.realmOn;
  sfx('superCharge', me); me.hero.setGlow(1); fx.ring(me.x, me.y, me.z, 0xb07bff, 3.5, .8); fx.emit(me.x, me.y + 1.5, me.z, 60, { color: [.8, .6, 1], speed: 6, up: 3, life: .9 });
  $('tpFlash').classList.add('on'); me.play('jump');
  setTimeout(() => {
    if (toRealm) { me.x = realm.spawn[0] + (Math.random() - .5) * 3; me.z = realm.spawn[1]; me.y = realm.groundAt(me.x, me.z) + .1; }
    else { const P = world.portal; me.x = P.x + (Math.random() - .5) * 2; me.z = P.z + 4.6; me.y = world.groundAt(me.x, me.z, P.y + 2); }
    me.vx = me.vz = me.vy = 0; me.grounded = true; me.yaw = toRealm ? PI : 0; camS.yaw = me.yaw; camS.init = false; camS.cur = null;
    updateEnv(0, me); sfx('super', me);
    setTimeout(() => { $('tpFlash').classList.remove('on'); fx.ring(me.x, me.y, me.z, 0x7ce8ff, 4, .9); banner(toRealm ? 'MUNDO CRISTAL · ilhas flutuantes além do céu' : 'DE VOLTA AO VALE DA CASONA', 2600); TP.busy = false; }, 250);
    if (!net.offline) chatLine('', toRealm ? 'Você atravessou o cristal.' : 'Você voltou para o vale.', true);
  }, 700);
}
hold($('bPortal'), teleport);
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'f' && document.activeElement !== $('chatIn')) teleport(); });
function makeKeeper() {   // goleiro bot do futebol: um ator comum controlado pelo soccer.js
  const a = addActor('gk-' + Math.random().toString(36).slice(2, 6), 'GOLEIRO', 'cyber', 'bot', 'cyber'); a.simulated = true; a.lvl = 5; a.maxHp = CS.hpAt(a.char, a.lvl); a.hp = a.maxHp; a.team = 1;
  a.brain = { mx: 0, mz: 0, jump: false, passive: true, home: [0, 0], update() { } }; a.grounded = true; return a;
}
function canFightBots() { return TRAINLIKE || MODE === 'soccer' || (MODE === 'battle' && G.phase !== 'waiting'); }

/* ===================================================== início ===================================================== */
const HINTS = ['Dica: toque no minimapa para abrir o mapa completo.', 'Dica: corra até uma janela ou cerca e aperte PULO para saltar por cima.', 'Dica: a habilidade mira sozinha no inimigo mais próximo à sua frente.', 'Dica: cause dano para carregar o SUPER.', 'Dica: sem zona segura: use o mapa para caçar os últimos jogadores.', 'Dica: kits médicos verdes curam 45 de vida.'];
$('loadHint').textContent = HINTS[(Math.random() * HINTS.length) | 0];
/* v158: sobe texturas e blocos do mapa para a GPU durante a tela de carregamento (antes subiam na primeira vez que apareciam = picos de travada). */
async function warmTextures(setP) {
  if (!renderer.initTexture) return;
  const list = [], seen = new Set();
  scene.traverse(o => { for (const m of (o.material ? [].concat(o.material) : [])) for (const k in m) { const t = m[k]; if (t && t.isTexture && t.image && !seen.has(t) && !t.isRenderTargetTexture && !t.isDepthTexture && !t.isCubeTexture && !t.isData3DTexture && !t.isDataArrayTexture) { seen.add(t); list.push(t); } } });
  for (let i = 0; i < list.length; i++) {
    try { renderer.initTexture(list[i]); } catch (e) { }
    if (i % 4 === 3) { setP(.96, 'Preparando texturas…'); await new Promise(r => setTimeout(r, 0)); }
  }
  setP(.97, 'Preparando o mapa…'); await new Promise(r => setTimeout(r, 30));
  const saved = [];
  try {
    scene.traverse(o => { if (o.isMesh || o.isPoints || o.isLine) { saved.push([o, o.visible, o.frustumCulled]); o.visible = true; o.frustumCulled = false; } });
    renderer.render(scene, camera);
  } finally { for (const [o, v, f] of saved) { o.visible = v; o.frustumCulled = f; } }
}
async function start() {
  const setP = (p, t) => { $('loadFill').style.width = Math.round(p * 100) + '%'; if (t) $('loadTip').textContent = t; };
  const preWorld = new Set(scene.children);
  try { await world.build(setP); Object.assign(ENV, { hemiI: hemi.intensity, sunI: sun.intensity, fogC: scene.fog.color.clone(), fogN: scene.fog.near, fogF: scene.fog.far, hemiC: hemi.color.clone(), hemiG: hemi.groundColor.clone(), sunC: sun.color.clone() }); applyCinematicToonScene(scene); } catch (e) { console.error(e); $('loadTip').textContent = 'Erro ao montar o mundo: ' + e.message; return; }
  try { if (!(await ensurePacks([...new Set(['cyber', ident.char].filter(Boolean))]))) { exitToLobby(); return; } } catch (e) { console.warn('pacotes', e); }
  setP(.95, 'Carregando os personagens…'); try { await loadClassic(); } catch (e) { console.warn('Cyber indisponível', e); } try { await loadAtlasGLB(); } catch (e) { console.warn('Personagens indisponíveis', e); }
  try { // pré-compila os shaders (evita travadinha na primeira vez que um poder/efeito aparece)
    const warm = [new THREE.MeshBasicMaterial({ transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false }), new THREE.MeshBasicMaterial({ transparent: true, opacity: .5, side: THREE.DoubleSide })].map(m => { const o = new THREE.Mesh(new THREE.SphereGeometry(.01, 4, 3), m); o.position.copy(camera.position); scene.add(o); return o; });
    // pré-compila também os dois materiais do Cyber (completo e leve), para a troca por distância não engasgar (sem dispose: senão os programas seriam liberados)
    try { if (classicReady()) { const w = makeCharacter('cyber', 'cyber'); w.attach(scene); w.object.position.copy(camera.position); for (const l of [0, 2]) { w.setLOD(l); renderer.compile(scene, camera); } w.detach(); window.__warmHero = w; } } catch (e) { console.warn('pré-compilação do Cyber', e); }
    renderer.compile(scene, camera); warm.forEach(o => { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); });
  } catch (e) { console.warn('pré-compilação', e); }
  try { await warmTextures(setP); } catch (e) { console.warn('pré-carga de texturas', e); }
  worldObjs = scene.children.filter(o => !preWorld.has(o)); realm = MODE === 'soccer' ? new Stadium(scene, Q, VENUE, { qname: qBase }) : new Realm(scene, Q);
  /* zona removida */
  setP(.97, MODE === 'battle' ? 'Procurando partida…' : MODE === 'open' ? 'Entrando no mundo aberto…' : MODE === 'soccer' ? 'Entrando no estádio…' : 'Preparando treino…');
  let room;
  const QM = MODE === 'open' ? 'open' : MODE === 'space' ? 'space' : MODE === 'train' ? 'train' : MODE === 'soccer' ? 'soccer_' + VENUE : 'battle';   // futebol: sala própria de cada estádio, aberta como o mundo aberto
  try { room = await net.queue({ mode: QM, code: CODE, party: PARTY }); }
  catch (e) { net.online = false; room = await net.queue({ mode: QM }); }
  // servidor antigo que não conhece o treino online devolve uma sala de partida: sai dela e treina offline
  if ((MODE === 'train' || MODE === 'soccer') && !net.offline && room.mode !== QM) { try { await net.leave(); } catch (_) { } net.online = false; room = await net.queue({ mode: QM }); }   // servidor antigo (não conhece este modo): joga offline
  G.room = room; G.seed = room.seed || 1; G.startAt = room.startAt;
  me = addActor(myId, ident.name, ident.skin, 'me', ident.char); me.simulated = true; me.lvl = ME_BUFF.lvl; me.maxHp = CS.hpAt(me.char, me.lvl); me.hp = me.maxHp; $('meName').textContent = ident.name.toUpperCase(); $('meAv').textContent = ident.name.slice(0, 2).toUpperCase(); $('meCh').textContent = ident.char === 'nexus' ? 'NEXUS' : ident.char === 'atlas' ? 'ATLAS' : 'CYBER';
  const sp = plazaSpot((Math.random() * 12) | 0); placeAt(me, sp); me.yaw = PI; camS.yaw = PI; camS.mode = SET.cam; camS.dist = camS.mode === 'tps' ? 5.6 : 22; camS.pitch = camS.mode === 'tps' ? .2 : .95;
  if (MODE === 'open') { G.phase = 'open'; $('btns').querySelectorAll('#bAtk,#bLas,#bSup,#bVel,#bKick').forEach(b => b.classList.add('hidden')); $('emotes').classList.add('hidden'); $('players').classList.remove('hidden'); $('enBar').classList.add('hidden'); $('pKills').classList.add('hidden'); $('pAlive').querySelector('small').textContent = 'ONLINE'; chatLine('', net.offline ? 'Sem conexão: mundo aberto local.' : 'Bem-vindo ao mundo aberto! Converse, explore e divirta-se.', true); }
  else if (MODE === 'space') { G.phase = 'train'; G.started = true; $('pAlive').classList.add('hidden'); $('mmWrap').classList.add('hidden');
    realm.build(); applyCinematicToonScene(realm.group); me.x = realm.spawn[0]; me.z = realm.spawn[1]; me.y = realm.groundAt(me.x, me.z) + .1; me.yaw = PI; camS.yaw = PI; me.energy = 100;
    const C = realm.islands[0]; for (let i = 0; i < 4; i++) { const b = makeBot(i, null, .3, true), ang = PI * .5 + (i - 1.5) * .45, d = 12 + (i % 2) * 4; b.x = C.x + Math.cos(ang) * d * -1; b.z = C.z - Math.sin(ang) * d; b.y = realm.groundAt(b.x, b.z) + .1; b.drop = 0; b.grounded = true; b.yaw = Math.atan2(me.x - b.x, me.z - b.z); b.brain.home = [b.x, b.z]; b.maxHp = 400 * CS.NORM; b.hp = b.maxHp; }
    $('tTimeL').textContent = 'MODO'; $('tTime').textContent = 'TESTE'; chatLine('', net.offline ? 'Teste de Poderes: 4 bots que não atacam. Energia do super recarrega rápido.' : 'Teste de Poderes ONLINE: treine com amigos! Você tem 4 bots só seus e pode atacar os outros jogadores.', true); banner('TESTE DE PODERES · MUNDO ESPACIAL', 3000); }
  else if (MODE === 'soccer') { G.phase = 'train'; G.started = true; for (const id of ['top', 'mmWrap', 'vitals', 'enBar']) { const e = $(id); e && e.classList.add('hidden'); }
    $('btns').querySelectorAll('#bKick,#bSolar,#bSwap').forEach(b => b.classList.add('hidden'));
    realm.build(); me.x = realm.spawn[0] + (Math.random() - .5) * 12; me.z = realm.spawn[1] + 16 + (Math.random() - .5) * 6; me.y = .1; me.yaw = 0; camS.yaw = 0; me.energy = 100; camS.dist = camS.mode === 'tps' ? 7.4 : 26; if (camS.mode === 'tps') camS.pitch = .32;
    skillButtons(); for (const [id, ic, tx] of [['bAtk', '⚽', 'CHUTE'], ['bLas', '➜', 'PASSE'], ['bSup', '⤴', 'CRUZAR'], ['bVel', '⚡', 'DRIBLE']]) { const I = $(id + 'I'), T = $(id + 'T'); if (I) { I.innerHTML = ic; I.style.fontSize = '30px'; I.style.fontWeight = 900; } if (T) T.textContent = tx; else { const sp = $(id).querySelector('span'); if (sp) sp.textContent = tx; } }
    const kp = makeKeeper(), sapi = { scene, stadium: realm, audio, banner, fx, actors, touch: isTouch, camera, keysDown: input.keys, me: () => me, setCamYaw: y => { camS.yaw = y; }, doDodge, readMove, shake: k => { G.shake = Math.max(G.shake || 0, k); }, focusCam: () => { if (camS.mode === 'tps') camS.pitch = .32; } };
    sapi.serverNow = () => net.serverNow(); sapi.myId = () => myId; sapi.isOffline = () => net.offline;
    soccer = createSoccer(sapi); sapi.setKeeper(kp); sapi.setKeeper2(makeKeeper()); soccer.start('train'); window.__soccer = soccer;
    if (!net.offline) { $('players').classList.remove('hidden'); } chatLine('', 'Futebol · ' + realm.V.name + (net.offline ? ': treine chutes, passes, cruzamentos e pênaltis (offline).' : ': você entrou na sala com quem já está aqui. Veja os outros jogadores, converse e treine chutes, passes e pênaltis.'), true); banner(realm.V.name.toUpperCase() + ' · TREINO', 2200); }
  else if (MODE === 'train') { G.phase = 'train'; G.started = true; $('pAlive').classList.add('hidden'); for (let i = 0; i < 4; i++) { const b = makeBot(i, null, .3, true); placeAt(b, world.randomSpot(mulberry32(i * 7 + 3), { cx: sp[0] + (i - 1.5) * 6, cz: sp[1] + 10, r: 5 })); b.brain.home = [b.x, b.z]; b.maxHp = 150 * CS.NORM; b.hp = b.maxHp; } chatLine('', 'Treino: bonecos de treino nascem de novo após 3 s.', true); }
  else { G.phase = 'waiting'; $('mmk').classList.remove('hidden'); $('emotes').classList.remove('hidden'); if (net.offline) { G.startAt = now() + 4000; chatLine('', 'Sem conexão: partida offline contra 15 bots.', true); } }
  if (!net.offline) net.start({ getState: () => { const s0 = packState(me); if (soccer) soccer.x1Pack(s0); return s0; }, getBots: () => MODE === 'battle' && G.started ? [...actors.values()].filter(a => a.kind === 'bot' && a.simulated).map(a => ({ id: a.id, name: a.name, skin: a.skin, s: packState(a) })) : null, onSync, onOffline: () => { chatLine('', 'Conexão instável… tentando reconectar.', true); } });
  else net.h = { onSync };
  $('load').classList.add('hidden'); $('hud').classList.remove('hidden'); G.phase === 'loading' && (G.phase = 'open'); ctlEd.ready();
  if (!isTouch) banner('WASD mover · Espaço pular · clique soco · botão direito habilidade · Q super · V visão · M mapa', 4500);
  document.body.classList.add('mode-' + MODE);   // a HUD (hud.css) muda de posição conforme o modo
  if (MODE === 'train' && !net.offline) { $('players').classList.remove('hidden'); chatLine('', 'Treino online: outros jogadores podem entrar nesta sala.', true); }
  window.__g = { G, actors, me: () => me, world, camS, act, net };
}
requestAnimationFrame(frame); start();
/* depuração local (só com ?dbg=1): permite testar física e o Mundo Cristal sem andar até o portal */
if (params.get('dbg') === '1') window.__cy = { me: () => me, cam: () => camS, R: () => realm, scene, camera, renderer, realm: () => { TP.shown = true; teleport(); }, world: () => world };
