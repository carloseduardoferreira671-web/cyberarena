import { loadGLB, MODELS } from './nodeglb.mjs';
import { buildLib, zonesInGuard } from '../../mundo/js/fightlib.js';
const SC = { A: 2.95, B: 2.85, C: 2.75 }, R = {}, zones = {};
for (const k in MODELS) { R[k] = loadGLB(MODELS[k]).rig; zones[k] = zonesInGuard(R[k], SC[k]); }
for (const k in zones) console.log(k, 'zones', JSON.stringify(Object.fromEntries(Object.entries(zones[k]).map(([a, b]) => [a, Array.isArray(b) ? b.map(x => +x.toFixed(3)) : b]))));
let bad = 0;
for (const k in R) { const t0 = performance.now(); const P = buildLib(R[k], { id: k, sc: SC[k], zones }); const ms = performance.now() - t0;
  console.log('==', k, 'bake ms', ms.toFixed(0), 'clips', Object.keys(P.clips).length);
  for (const m of P.attacks) { const flag = m.err > .008 ? '  <<< FORA' : ''; if (flag) bad++; console.log(`  ${m.move.padEnd(11)} vs ${m.vs}  zone=${m.zone.padEnd(5)} Sg=${m.Sg.toFixed(2)} err=${(m.err * 100).toFixed(2)}cm dz=${m.dz.toFixed(3)} lift=${m.lift.toFixed(3)}${flag}`); } }
console.log('FORA DE ALCANCE:', bad);
