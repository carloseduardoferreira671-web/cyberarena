/* CyberArena · orçamento de desempenho por aparelho (v155)
   Problema que isto resolve: o jogo escolhia textura 2K/4K e pós-processamento com SSAO só pela RAM que o navegador declara
   (navigator.deviceMemory, limitado a 8). Um celular com "8 GB" recebia até ~1,5 GB de texturas na GPU e um passe de SSAO em tela
   cheia: estoura a memória de vídeo e o jogo trava. Jogos como Free Fire nunca confiam só nisso: medem o aparelho e trabalham
   dentro de um ORÇAMENTO fixo (pixels, memória de textura, sombras, efeitos).
   Aqui: detectDevice() → perfil (low | mid | high | desktop) → LIMITS[perfil]. O resto do jogo só consulta os limites.
   Teste em qualquer tela: ?perf=low | mid | high | desktop na URL (ex.: mundo/index.html?mode=train&perf=low). */

const URLQ = new URLSearchParams(location.search);
const PROFILES = ['low', 'mid', 'high'];

/* limites por perfil.  pr = teto da resolução (pixelRatio) · mpx = teto de megapixels renderizados · shadowMap = teto do mapa de sombra
   cine = teto do pós-processamento (0 off · 1 bloom+grading · 2 +SSAO · 3 +motion blur) · aa = antialias do canvas
   tex = maior textura do mapa ('1k' | '2k' | '4k') · maxTexPx = lado máximo das texturas extras (rugosidade/AO) */
export const LIMITS = {
  low:     { pr: 1.0,      mpx: 0.45,     shadowMap: 1024, cine: 0, aa: false, tex: '1k' },
  mid:     { pr: 1.25,     mpx: 0.75,     shadowMap: 1024, cine: 1, aa: false, tex: '1k' },
  high:    { pr: 1.5,      mpx: 1.1,      shadowMap: 2048, cine: 1, aa: false, tex: '1k' },
  desktop: { pr: Infinity, mpx: Infinity, shadowMap: 4096, cine: 3, aa: true,  tex: '4k' },
};

/* classifica a GPU pelo nome (WEBGL_debug_renderer_info). 0 = fraca · 1 = média/desconhecida · 2 = forte */
export function gpuClass(name) {
  const n = String(name || '').toLowerCase(); let m;
  if (!n) return 1;
  if (/swiftshader|llvmpipe|software/.test(n)) return 0;                        // renderização por software
  if ((m = /adreno[^0-9]*(\d{3})/.exec(n))) { const v = +m[1]; return v < 620 ? 0 : v < 700 ? 1 : 2; }
  if ((m = /mali-?g(\d+)/.exec(n))) { const v = +m[1]; return [31, 51, 52].includes(v) ? 0 : [57, 68, 71, 72, 76].includes(v) ? 1 : 2; }
  if (/mali-?t|powervr|videocore|vivante/.test(n)) return 0;
  if (/apple/.test(n)) return 1;                                                // iPhone/iPad: o Safari limita a memória da aba, então 1K sempre
  return 1;
}

function probeGL() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { gpu: '', maxTex: 4096 };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const out = { gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '', maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096 };
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { }
    return out;
  } catch (e) { return { gpu: '', maxTex: 4096 }; }
}

/* perfil a partir dos sinais já medidos (função pura: testável sem navegador) */
export function classify({ touch, gpu, mem, cores }) {
  if (!touch) return 'desktop';
  const memT = !mem ? 1 : mem <= 3 ? 0 : mem >= 6 ? 2 : 1;                     // mem = 0 → desconhecido (Safari não expõe)
  const coreT = !cores ? 1 : cores <= 4 ? 0 : cores <= 6 ? 1 : 2;
  return PROFILES[Math.min(gpuClass(gpu), memT, coreT)];                         // o pior sinal manda: um gargalo basta para travar
}

let cache = null;
export function detectDevice() {
  if (cache) return cache;
  const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || location.hostname === 'appassets.androidplatform.net';
  const gl = probeGL(), mem = navigator.deviceMemory || 0, cores = navigator.hardwareConcurrency || 0;
  let profile = classify({ touch, gpu: gl.gpu, mem, cores });
  const force = URLQ.get('perf');
  if (force && (PROFILES.includes(force) || force === 'desktop')) profile = force;
  cache = { touch, gpu: gl.gpu, maxTex: gl.maxTex, mem, cores, profile, limits: LIMITS[profile], forced: !!force };
  try { console.info('[perf] perfil:', profile, '| GPU:', gl.gpu || '?', '| RAM:', mem || '?', '| núcleos:', cores || '?', '| textura máx.:', gl.maxTex); } catch (e) { }
  return cache;
}

/* aplica o orçamento a um preset de qualidade (devolve uma cópia; o preset original não muda) */
export function clampPreset(Q, dev = detectDevice(), w = innerWidth, h = innerHeight) {
  const L = dev.limits, o = { ...Q };
  const byPixels = Math.sqrt(L.mpx * 1e6 / Math.max(1, w * h));                 // resolução máxima para caber no orçamento de megapixels
  o.pr = Math.max(.6, Math.min(Q.pr, L.pr, byPixels));
  if (Q.shadows && Q.shadowMap) o.shadowMap = Math.min(Q.shadowMap, L.shadowMap);
  o.aa = Q.aa && L.aa;
  /* v156: GPU fraca (ex.: Mali-G52 do Redmi 15C) — menos grama e folhas, e sombra menor */
  if (dev.profile === 'low') {
    o.grass = Math.min(Q.grass, 2500); o.grassR = Math.min(Q.grassR, 16); o.leaves = Math.min(Q.leaves, 80);
    if (Q.shadows && Q.shadowMap) o.shadowMap = Math.min(o.shadowMap, 768);
  }
  return o;
}

/* teto do pós-processamento no modo automático (quem escolheu um nível manualmente nas Configurações não é afetado) */
export function capCine(tier, dev = detectDevice()) { return Math.min(tier, dev.limits.cine); }

/* maior nível de textura permitido: celular = no máximo 1K · PC = como antes (pela RAM), sem passar do que a GPU aceita */
export function texMaxTier(quality, dev = detectDevice()) {
  const order = ['1k', '2k', '4k'], cap = order.indexOf(dev.limits.tex);
  let want = 0;
  if (dev.profile === 'desktop' && quality !== 'low') { const mem = navigator.deviceMemory || 4; want = mem >= 8 ? 2 : mem >= 6 ? 1 : 0; }
  if (dev.maxTex < 4096) want = Math.min(want, 1);
  return order[Math.min(want, cap)];
}
