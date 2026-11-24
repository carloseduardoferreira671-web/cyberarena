/* CyberArena 3D · texturas procedurais (albedo + normal + rugosidade) geradas em canvas no carregamento.
   Evita arquivos pesados e mantém aparência realista e detalhada (sem cores chapadas). */
import * as THREE from 'three';
import { packURL } from '../packs.js';
import { detectDevice, texMaxTier } from '../perf.js';   // v155: orçamento de textura por aparelho

function rng(seed) { let a = seed | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function valueNoise(size, cells, r) {
  const g = new Float32Array((cells + 1) * (cells + 1)); for (let i = 0; i < g.length; i++) g[i] = r();
  for (let y = 0; y < cells; y++) g[y * (cells + 1) + cells] = g[y * (cells + 1)];
  for (let x = 0; x <= cells; x++) g[cells * (cells + 1) + x] = g[x];
  const out = new Float32Array(size * size), k = cells / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x * k, fy = y * k, ix = fx | 0, iy = fy | 0, u = fx - ix, v = fy - iy, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
    const a = g[iy * (cells + 1) + ix], b = g[iy * (cells + 1) + ix + 1], c = g[(iy + 1) * (cells + 1) + ix], d = g[(iy + 1) * (cells + 1) + ix + 1];
    out[y * size + x] = a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
  }
  return out;
}
function fbmTex(size, seed, oct = 5, base = 4) {
  const r = rng(seed), out = new Float32Array(size * size); let amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) { const n = valueNoise(size, base << o, r); for (let i = 0; i < out.length; i++) out[i] += n[i] * amp; tot += amp; amp *= 0.5; }
  for (let i = 0; i < out.length; i++) out[i] /= tot; return out;
}
/* monta albedo/normal/rough a partir de uma função por pixel que devolve [r,g,b,altura,rugosidade] */
function build(size, fn, { repeat = 1, normalStrength = 2 } = {}) {
  const H = new Float32Array(size * size), cA = document.createElement('canvas'), cN = document.createElement('canvas'), cR = document.createElement('canvas');
  cA.width = cA.height = cN.width = cN.height = cR.width = cR.height = size;
  const A = cA.getContext('2d').createImageData(size, size), N = cN.getContext('2d').createImageData(size, size), Rr = cR.getContext('2d').createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x, p = fn(x, y, i); H[i] = p[3];
    A.data[i * 4] = p[0]; A.data[i * 4 + 1] = p[1]; A.data[i * 4 + 2] = p[2]; A.data[i * 4 + 3] = 255;
    const rr = Math.max(0, Math.min(255, p[4] * 255)); Rr.data[i * 4] = Rr.data[i * 4 + 1] = Rr.data[i * 4 + 2] = rr; Rr.data[i * 4 + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const h = (xx, yy) => H[((yy + size) % size) * size + ((xx + size) % size)];
    const dx = (h(x + 1, y) - h(x - 1, y)) * normalStrength, dy = (h(x, y + 1) - h(x, y - 1)) * normalStrength;
    const l = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    N.data[i] = (-dx / l * 0.5 + 0.5) * 255; N.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; N.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; N.data[i + 3] = 255;
  }
  cA.getContext('2d').putImageData(A, 0, 0); cN.getContext('2d').putImageData(N, 0, 0); cR.getContext('2d').putImageData(Rr, 0, 0);
  const mk = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = globalThis.__ANISO || 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = true; return t; };
  return { map: mk(cA, true), normalMap: mk(cN, false), roughnessMap: mk(cR, false) };
}
const mix = (a, b, t) => a + (b - a) * t;

export function makeTextures(quality) {
  /* SUPREMO em aparelho com bastante memória (≥6 GB): texturas do mapa em 1024 (o dobro de detalhe por lado) */
  const S = quality === 'low' ? 256 : (quality === 'high' && !detectDevice().touch && (navigator.deviceMemory || 4) >= 6 ? 1024 : 512), T = {};   // v155: celular nunca passa de 512 nas texturas procedurais
  /* blocos de pedra (paredes da casona, pilares, plataforma) */
  {
    const n = fbmTex(S, 11, 5, 4), m = fbmTex(S, 12, 3, 16), r = rng(5), rows = 8, bw = S / 4, bh = S / rows, tint = [];
    for (let i = 0; i < 64; i++) tint.push(0.82 + r() * 0.3);
    T.stone = build(S, (x, y, i) => {
      const row = (y / bh) | 0, off = row % 2 ? bw / 2 : 0, col = (((x + off) / bw) | 0) % 4, lx = (x + off) % bw, ly = y % bh;
      const edge = Math.min(lx, bw - lx, ly, bh - ly), mortar = edge < 2.2 ? 1 - edge / 2.2 : 0, t = tint[(row * 4 + col) % 64];
      const bevel = Math.min(1, edge / 6), h = (bevel * 0.6 + n[i] * 0.4) * (1 - mortar * 0.9);
      const g = (150 + (n[i] - 0.5) * 70 + (m[i] - 0.5) * 30) * t, moss = Math.max(0, n[i] - 0.62) * 2.2;
      const c = mortar > 0 ? [96, 92, 86] : [g * 1.0, g * 0.97 - moss * 20, g * 0.92 - moss * 30];
      return [c[0], c[1] + moss * 18, c[2], h, mortar > 0 ? 0.95 : 0.7 + n[i] * 0.25];
    }, { normalStrength: 3 });
  }
  /* piso de lajotas (praça e interior) */
  {
    const n = fbmTex(S, 21, 5, 4), cells = 4, cw = S / cells, r = rng(7), tone = []; for (let i = 0; i < 64; i++) tone.push(0.85 + r() * 0.25);
    T.tiles = build(S, (x, y, i) => {
      const cx = (x / cw) | 0, cy = (y / cw) | 0, lx = x % cw, ly = y % cw, e = Math.min(lx, cw - lx, ly, cw - ly), grout = e < 2 ? 1 : 0, t = tone[(cy * cells + cx) % 64];
      const g = (168 + (n[i] - 0.5) * 50) * t;
      return grout ? [90, 86, 80, 0, 0.95] : [g, g * 0.96, g * 0.9, Math.min(1, e / 5) * 0.7 + n[i] * 0.3, 0.6 + n[i] * 0.3];
    }, { normalStrength: 2.5 });
  }
  /* madeira (caixotes, postes, pontes) */
  {
    const n = fbmTex(S, 31, 4, 2), g2 = fbmTex(S, 32, 3, 32), planks = 4, pw = S / planks;
    T.wood = build(S, (x, y, i) => {
      const p = (x / pw) | 0, lx = x % pw, e = Math.min(lx, pw - lx), seam = e < 1.6 ? 1 : 0;
      const grain = Math.sin((y * 0.06 + n[i] * 9 + p * 3.1)) * 0.5 + 0.5, v = 0.75 + grain * 0.2 + (g2[i] - 0.5) * 0.25 + (p % 2) * 0.06;
      return seam ? [52, 34, 22, 0, 1] : [150 * v, 104 * v, 64 * v, 0.5 + grain * 0.3, 0.78];
    }, { normalStrength: 2 });
  }
  /* lona das tendas (trama de tecido) */
  {
    const n = fbmTex(S, 41, 4, 4);
    T.fabric = build(S, (x, y, i) => {
      const w = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5, v = 0.86 + w * 0.08 + (n[i] - 0.5) * 0.18;
      return [255 * v, 255 * v, 255 * v, w * 0.5 + n[i] * 0.3, 0.9];
    }, { normalStrength: 1.2 });
  }
  /* rocha (pedras soltas) */
  {
    const n = fbmTex(S, 51, 6, 3), c = fbmTex(S, 52, 4, 8);
    T.rock = build(S, (x, y, i) => {
      const crack = Math.abs(c[i] - 0.5) < 0.02 ? 1 : 0, v = 0.7 + (n[i] - 0.5) * 0.7, lich = Math.max(0, c[i] - 0.66) * 3;
      return [(128 * v + lich * 30) * (1 - crack * 0.5), (120 * v + lich * 40) * (1 - crack * 0.5), (110 * v + lich * 10) * (1 - crack * 0.5), n[i] - crack * 0.3, 0.88];
    }, { normalStrength: 4 });
  }
  /* casca de árvore */
  {
    const n = fbmTex(S, 61, 4, 4);
    T.bark = build(S, (x, y, i) => {
      const ridge = Math.abs(Math.sin(x * 0.09 + n[i] * 6)), v = 0.55 + ridge * 0.35 + (n[i] - 0.5) * 0.2;
      return [110 * v, 80 * v, 58 * v, ridge * 0.8 + n[i] * 0.2, 0.92];
    }, { normalStrength: 3 });
  }
  return T;
}


/* ======================= v142 · MATERIAIS PBR REAIS (pack "mapa") =======================
   Arquivos em assets/map/<nível>/<material>/<mapa>.webp, baixados pela tela de recursos do lobby
   (mapa_1k = padrão, mapa_2k = HD, mapa_4k = ULTRA). Sem o pack instalado tudo continua procedural (o jogo nunca fica sem chão). */
const MAT = {                       // chave do mundo → pasta do material (ordem = prioridade para receber 4K)
  grass: 'grama_flores', dirt: 'terra_raizes', plaza: 'piso_circular', tiles: 'piso_losango', stone: 'bloco_concreto',
  ruin: 'muro_pedra', bark: 'casca_arvore', leaf: 'folha', brick: 'tijolo_parquet', crack: 'concreto_rachado',
  mosaic: 'mosaico_seixos', cut: 'tronco_corte', rock: 'rocha'
};
/* níveis tentados do melhor para o pior, conforme a memória do aparelho */
function tierOrder(quality) {
  /* v155: antes só olhava navigator.deviceMemory (o navegador limita a 8), então um celular com "8 GB" carregava 4K/2K e estourava
     a memória de vídeo. Agora o teto vem do perfil do aparelho (perf.js): celular = no máximo 1K; PC = como antes. */
  const max = texMaxTier(quality);
  return max === '4k' ? ['4k', '2k', '1k'] : max === '2k' ? ['2k', '1k'] : ['1k'];
}
/* orçamento de memória de vídeo para 4K (cor + normal ≈ 180 MB por material): 8 GB+ → ~1,4 GB = até 7 materiais em 4K */
const COST_4K = 180, budget4k = (q) => (q === 'high' ? 1400 : 900);          // 'high' = até 7 materiais em 4K; 'medium' (padrão do APK) = até 5
const loader = new THREE.TextureLoader();
async function loadTex(path, srgb) {
  const url = await packURL(path);                                   // lança NotInstalled se o pack não foi baixado
  const t = await loader.loadAsync(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = globalThis.__ANISO || 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
async function pick(mat, map, tiers) {
  for (const tr of tiers) { try { return await loadTex(`assets/map/${tr}/${mat}/${map}.webp`, map === 'color'); } catch (e) { /* tenta o próximo nível */ } }
  return null;
}
async function loadSet(mat, tiers, allow4k) {
  const lo = tiers.filter(x => x !== '4k'), hi = allow4k ? tiers : lo;     // rugosidade e AO ficam em 2K mesmo no ULTRA
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([pick(mat, 'color', hi), pick(mat, 'normal', hi), pick(mat, 'rough', lo), pick(mat, 'ao', lo)]);
  if (!map) return null;
  const o = { map, normalMap: normalMap || undefined, roughnessMap: roughnessMap || undefined };
  if (aoMap && parseInt(THREE.REVISION) >= 152) o.aoMap = aoMap;
  return o;
}
/* troca/acrescenta materiais em T (o objeto de makeTextures). Devolve quantos materiais reais entraram. */
export async function upgradeWithPacks(T, quality, prog = () => { }) {
  const tiers = tierOrder(quality); let got = 0, n = 0, n4k = 0, budget = tiers.includes('4k') ? budget4k(quality) : 0; const keys = Object.keys(MAT);
  for (const k of keys) {
    prog(0.05 + 0.02 * n++ / (keys.length + 6), 'Carregando texturas do mapa');
    try {
      const set = await loadSet(MAT[k], tiers, budget >= COST_4K);
      if (set) { T[k] = set; got++; if (set.map.image && set.map.image.width >= 4096) { budget -= COST_4K; n4k++; } }
    } catch (e) { /* sem pack: fica o procedural */ }
  }
  /* extras de uma textura só: nuvens, cáustica, arbustos, vitórias-régias, montanhas distantes e sujeira (decal) */
  for (const [k, mat, map, srgb] of [['sky', 'ceu', 'color', true], ['caustic', 'caustica', 'color', false], ['bushes', 'arbustos', 'color', true],
    ['lily', 'vitoria', 'color', true], ['conifer', 'conifera', 'color', true], ['foliage', 'folhagem', 'color', true], ['mount', 'montanhas', 'color', true], ['decal', 'decal_sujeira', 'opacity', false]]) {
    prog(0.05 + 0.02 * n++ / (keys.length + 6), 'Carregando texturas do mapa');
    const t = await pick(mat, map, tiers.filter(x => x !== '4k'));
    if (t) { t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; if (k === 'sky') t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; if (k === 'bushes' || k === 'lily' || k === 'mount' || k === 'conifer' || k === 'foliage') { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4; } T[k] = { map: t }; }
  }
  try { console.info('[mapa] materiais PBR:', Object.keys(MAT).filter(k => T[k] && T[k].map && T[k].map.image).map(k => k + ':' + T[k].map.image.width).join(' '), '| 4K usados:', n4k, '| níveis:', tiers.join('>')); } catch (e) { }
  T.__packs = got; return got;
}
