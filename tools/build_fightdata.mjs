// Gera mundo/js/fightdata.js: alturas dos personagens, zonas de impacto (na guarda) e parâmetros de cada golpe contra cada oponente (3x3).
// Rode de novo se mudar um GLB, as alturas (CHAR_H) ou as poses de guarda:   node tools/build_fightdata.mjs
import fs from 'fs';
import { loadGLB } from './anim_tests/nodeglb.mjs';
import { buildLib, zonesInGuard } from '../mundo/js/fightlib.js';
const CHAR_H = { nexus: 3.0, atlas: 2.9, cyber: 2.75 }, MATCH = 1.18;
const R = {}, zones = {}, SC = {};
for (const id in CHAR_H) { R[id] = loadGLB(`mundo/models/${id}_rig.glb`).rig; SC[id] = CHAR_H[id] * MATCH / R[id].M.H; zones[id] = zonesInGuard(R[id], SC[id]); }
const params = {};
for (const id in R) { params[id] = {}; const P = buildLib(R[id], { id, sc: SC[id], zones }); for (const m of P.attacks) params[id][`${m.move}@${m.vs}`] = { Sg: +m.Sg.toFixed(4), dz: +m.dz.toFixed(4), lift: +m.lift.toFixed(4), err: +m.err.toFixed(5) }; }
const r4 = o => JSON.parse(JSON.stringify(o, (k, v) => typeof v === 'number' ? +v.toFixed(4) : v));
fs.writeFileSync('mundo/js/fightdata.js', `/* GERADO por tools/build_fightdata.mjs — não edite à mão. */\nexport const FIGHT = ${JSON.stringify(r4({ H: CHAR_H, MATCH, sc: SC, zones, params }), null, 1)};\n`);
console.log('ok', Object.fromEntries(Object.entries(SC).map(([k, v]) => [k, +v.toFixed(3)])));
