import { loadGLB, MODELS } from './nodeglb.mjs';
for (const k in MODELS) { const { rig } = loadGLB(MODELS[k]); const M = rig.M; console.log(k, 'H', M.H.toFixed(3), 'hipY', M.hipY.toFixed(3), 'leg', M.leg.toFixed(3), 'arm', M.arm.toFixed(3), 'hand', M.hand.toFixed(3), 'ankle', M.ankleY.toFixed(3));
  for (const z in M.zone) console.log('   ', z, JSON.stringify(Object.fromEntries(Object.entries(M.zone[z]).map(([a, b]) => [a, +b.toFixed(3)]))));
  console.log('   LeftHand', rig.P0.LeftHand.toArray().map(x => +x.toFixed(3)), 'Toe', rig.P0.LeftToeBase.toArray().map(x => +x.toFixed(3)), 'has ToeEnd', rig.has('LeftToe_End')); }
