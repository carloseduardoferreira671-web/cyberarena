/* Leitor mínimo de GLB (uma malha estática com PBR embutido): posição, normal, uv, índices e texturas baseColor / metalRoughness / normal. Sem dependências além do three. */
import * as THREE from '../lib/three.module.min.js';
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
export async function loadGLBMesh(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf); if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('GLB inválido');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) { const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), s = off + 8; if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, s, len))); else if (type === 0x004e4942) bin = buf.slice(s, s + len); off = s + len + ((4 - len % 4) % 4); }
  const acc = i => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = NUM[a.type]; const base = (bv.byteOffset || 0) + (a.byteOffset || 0); const stride = bv.byteStride; if (!stride || stride === n * T.BYTES_PER_ELEMENT) return new T(bin, base, a.count * n); const out = new T(a.count * n); const src = new DataView(bin); for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = T === Float32Array ? src.getFloat32(base + k * stride + c * 4, true) : src.getUint16(base + k * stride + c * 2, true); return out; };
  const prim = json.meshes[0].primitives[0], geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes.POSITION)), 3));
  if (prim.attributes.NORMAL) geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes.NORMAL)), 3)); else geo.computeVertexNormals();
  if (prim.attributes.TEXCOORD_0) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes.TEXCOORD_0)), 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(acc(prim.indices)), 1));
  const tex = async (ti, srgb) => { if (ti == null) return null; const t = json.textures[ti], im = json.images[t.source], bv = json.bufferViews[im.bufferView]; const blob = new Blob([new Uint8Array(bin, bv.byteOffset || 0, bv.byteLength)], { type: im.mimeType }); const bmp = await createImageBitmap(blob, { imageOrientation: 'none' }); const tx = new THREE.Texture(bmp); tx.flipY = false; tx.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.anisotropy = 4; tx.generateMipmaps = true; tx.minFilter = THREE.LinearMipmapLinearFilter; tx.needsUpdate = true; return tx; };
  if (prim.attributes.JOINTS_0) { geo.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(acc(prim.attributes.JOINTS_0)), 4)); geo.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes.WEIGHTS_0)), 4)); }
  /* atributos próprios (física desenhada no arquivo): _SOFT (vec2), _LOOSE, _HAIR */
  if (prim.attributes._LOOSE != null) { geo.setAttribute('aLoose', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes._LOOSE)), 1)); geo.setAttribute('aHair', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes._HAIR)), 1)); geo.setAttribute('aSoft', new THREE.BufferAttribute(new Float32Array(acc(prim.attributes._SOFT)), 2)); }
  const m = json.materials[0], pbr = m.pbrMetallicRoughness || {};
  const maps = { map: await tex(pbr.baseColorTexture?.index, true), mr: await tex(pbr.metallicRoughnessTexture?.index, false), normalMap: await tex(m.normalTexture?.index, false) };
  return { geo, maps, json, acc };
}
