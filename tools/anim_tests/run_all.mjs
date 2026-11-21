// Teste de regressão das animações novas. Rode da raiz do projeto:  node tools/anim_tests/run_all.mjs
// Confere: (1) os 54 golpes (3 atacantes x 3 oponentes x 6 golpes) alcançam o ponto da zona do oponente (< 8 mm do modelo);
//          (2) pés plantados na marcha (a velocidade do pé de apoio bate com a velocidade do jogo → sem patinar);
//          (3) as poses de queda ficam no chão (quadril baixo, nenhum osso abaixo do chão);  (4) fightdata.js está em dia com os GLB.
import { loadGLB } from './nodeglb.mjs';
import { buildLib, zonesInGuard } from '../../mundo/js/fightlib.js';
import { FIGHT } from '../../mundo/js/fightdata.js';
import { V } from '../../mundo/js/rigcore.js';
const ids = Object.keys(FIGHT.H); let fail = 0; const ok = (c, m) => { if (!c) { fail++; console.log('  FALHOU:', m); } };
const R = {}; for (const id of ids) R[id] = loadGLB(`mundo/models/${id}_rig.glb`).rig;
for (const id of ids) {
  const P = buildLib(R[id], { id, sc: FIGHT.sc[id], zones: FIGHT.zones, params: FIGHT.params[id] }), rig = R[id], clips = P.clips; console.log('==', id, Object.keys(clips).length, 'clipes');
  // (1) alcance dos golpes
  for (const m of P.attacks) ok(m.err < .008, `${m.move}@${m.vs} erro ${(m.err * 100).toFixed(2)} cm`);
  // (2) pé de apoio: z do tornozelo no referencial do corpo muda a -v0 (unid. modelo/s) durante o apoio
  for (const g of ['Walk', 'Run', 'Sprint']) { const c = clips[g], bones = rig.bones, ankle = rig.by.LeftFoot; let worst = 0, n = 0, sum = 0;
    const zs = []; for (let i = 0; i <= 60; i++) { rig.reset(); c.sample(i / 60 * c.dur, bones, null, 1, null, rig.hips); rig.root.updateMatrixWorld(true); zs.push([i / 60 * c.dur, rig.wp(ankle, V()).z, rig.wp(ankle, V()).y]); }
    for (let i = 1; i < zs.length; i++) { const low = zs[i][2] < rig.M.ankleY + .008 && zs[i - 1][2] < rig.M.ankleY + .008, v = -(zs[i][1] - zs[i - 1][1]) / (zs[i][0] - zs[i - 1][0]); if (!low || v < c.meta.v0 * .5) continue; const dv = Math.abs(v - c.meta.v0) / c.meta.v0; worst = Math.max(worst, dv); sum += dv; n++; }
    ok(n > 6 && sum / n < .06 && worst < .2, `${g}: pé patina (média ${(sum / n * 100).toFixed(1)}%, máx ${(worst * 100).toFixed(1)}%)`); console.log(`  ${g}: v0=${c.meta.v0.toFixed(2)} mu/s · pé de apoio: desvio médio ${(sum / n * 100).toFixed(1)}%, máx ${(worst * 100).toFixed(1)}% (rolagem calcanhar→ponta)`); }
  // (3) quedas no chão
  for (const n of ['Fall_Sweep', 'Fall_Back', 'KO_Head']) { const c = clips[n]; rig.reset(); c.sample(c.dur, rig.bones, null, 1, null, rig.hips); rig.root.updateMatrixWorld(true);
    let minY = 9, hipY = rig.wp(rig.hips, V()).y; for (const b of rig.bones) minY = Math.min(minY, rig.wp(b, V()).y); ok(hipY < .2 && minY > -.03, `${n}: quadril ${hipY.toFixed(3)} min ${minY.toFixed(3)}`); }
  // (4) zonas conferem com fightdata
  const z = zonesInGuard(rig, FIGHT.sc[id]); ok(Math.abs(z.head[1] - FIGHT.zones[id].head[1]) < 1e-3, 'fightdata.js desatualizado (rode tools/build_fightdata.mjs)');
}
console.log(fail ? `\n${fail} FALHA(S)` : '\nTUDO OK'); process.exit(fail ? 1 : 0);
