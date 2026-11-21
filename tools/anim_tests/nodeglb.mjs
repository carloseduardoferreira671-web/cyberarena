// carrega um GLB no Node (sem DOM) e devolve { json, rig } para testes
import fs from 'fs';
import { buildTree, Rig } from '../../mundo/js/rigcore.js';
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export function loadGLB(path) {
  const d = fs.readFileSync(path), l = d.readUInt32LE(12), json = JSON.parse(d.slice(20, 20 + l).toString()), off = 20 + l, bl = d.readUInt32LE(off), bin = d.slice(off + 8, off + 8 + bl);
  const ab = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.length);
  const acc = i => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = NUM[a.type]; return new T(ab, (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n); };
  const pr = json.meshes[0].primitives[0];
  const mesh = { pos: new Float32Array(acc(pr.attributes.POSITION)), si: new Uint16Array(acc(pr.attributes.JOINTS_0)), sw: new Float32Array(acc(pr.attributes.WEIGHTS_0)) };
  const tree = buildTree(json);
  return { json, mesh, tree, rig: new Rig(tree, mesh), acc };
}
export const MODELS = { A: 'mundo/models/nexus_rig.glb', B: 'mundo/models/atlas_rig.glb', C: 'mundo/models/cyber_rig.glb' };
