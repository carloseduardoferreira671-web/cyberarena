/* CyberArena · pacotes baixáveis (estilo Free Fire): o app vem leve e os modelos pesados são baixados uma vez,
   guardados no aparelho (Cache API) e reaproveitados nas próximas vezes. Lista e tamanhos: ../packs.json
   (gerado por tools/make_packs.py). Os arquivos têm o MESMO caminho de sempre (models/...), só mudam de onde vêm. */
const DEFAULT_SITE = 'https://whimsical-kataifi-2407ec.netlify.app/';   // trocado pelo build do APK (SERVER_URL)
const CACHE = 'cyberarena-packs-v7', FAKE = 'https://packs.cyberarena.local/';
const q = new URLSearchParams(location.search);
const isApk = location.hostname === 'appassets.androidplatform.net';
const isWebView = /; wv\)|\bVersion\/[\d.]+ Chrome\/[\d.]+ Mobile/.test(navigator.userAgent) && /Android/.test(navigator.userAgent);
/* o sistema só liga no app (APK/WebView); no navegador comum tudo continua vindo direto do site. ?packs=1 força ligar, ?packs=0 desliga */
/* v138: também liga no navegador (HTTPS/localhost), para o download obrigatório da tela de entrada funcionar fora do app */
export const PACKS_ON = q.get('packs') === '1' ? true : q.get('packs') === '0' ? false : ((isApk || isWebView) || self.isSecureContext === true) && 'caches' in self;
const SITE = isApk ? DEFAULT_SITE : location.origin + '/';
const BASE = new URL('../', import.meta.url).href;            // .../mundo/

let manifest = null, memo = {};
const urls = {};                                               // path -> blob: url
export async function getManifest() {
  if (manifest) return manifest;
  try { manifest = await (await fetch(new URL('packs.json', BASE), { cache: 'no-cache' })).json(); } catch (e) { manifest = { versao: 0, fontes: [''], packs: [] }; }
  return manifest;
}
export class NotInstalled extends Error { constructor(path) { super('pacote não instalado: ' + path); this.path = path; this.notInstalled = true; } }
const key = p => FAKE + p;
async function cacheHas(path, bytes) {
  try {
    const r = await (await caches.open(CACHE)).match(key(path)); if (!r) return false;
    /* v146: modelos de personagem antigos com o MESMO caminho ficavam "instalados" para sempre. Agora o tamanho guardado precisa bater com o packs.json */
    if (path.startsWith('models/') && bytes) return r.headers.get('x-bytes') === String(bytes);
    return true;
  } catch (e) { return false; }
}

/* endereço de um arquivo de pacote. Desligado: caminho normal. Ligado: blob do aparelho, ou erro se ainda não baixou */
export async function packURL(path) {
  if (!PACKS_ON) return new URL(path, BASE).href;
  if (urls[path]) return urls[path];
  const r = await (await caches.open(CACHE)).match(key(path)); if (!r) throw new NotInstalled(path);
  return urls[path] = URL.createObjectURL(await r.blob());
}
export async function packBytes(path) { return (await fetch(await packURL(path))).arrayBuffer(); }

export async function isInstalled(id) {
  if (!PACKS_ON) return true; const m = await getManifest(), p = m.packs.find(x => x.id === id); if (!p) return true;
  for (const f of p.files) if (!(await cacheHas(f.path, f.bytes))) return false; return true;
}
/* v146: apaga do aparelho os caches de versões antigas (cyberarena-packs-v2…v6), que guardavam os personagens antigos */
async function limparAntigos() { try { for (const k of await caches.keys()) if (k.startsWith('cyberarena-packs-') && k !== CACHE) await caches.delete(k); } catch (e) { } }
export async function status() {
  await limparAntigos();
  const m = await getManifest(), out = [];
  for (const p of m.packs) out.push({ ...p, installed: await isInstalled(p.id) });
  return out;
}
export const online = () => navigator.onLine !== false;
export function netKind() { const c = navigator.connection; return c ? (c.type || c.effectiveType || '') : ''; }

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
async function fetchFile(f, fontes, onBytes, signal) {
  let lastErr = null; const erros = [];
  for (const src of fontes) {
    const url = src.replace('{SITE}', SITE) + f.path, abs = new URL(url, location.href).href; let got = 0;
    try {
      const res = await fetch(abs, { signal, cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status);
      const rd = res.body.getReader(), parts = [];
      for (; ;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onBytes(value.length); }
      const blob = new Blob(parts); if (blob.size !== f.bytes) throw new Error('tamanho ' + blob.size + ' ≠ ' + f.bytes);
      if (f.sha256 && crypto.subtle) { const h = hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())); if (h !== f.sha256) throw new Error('arquivo corrompido'); }
      return blob;
    } catch (e) { if (e.name === 'AbortError') throw e; lastErr = e; erros.push((src.includes('jsdelivr') ? 'jsDelivr' : src.includes('{SITE}') || src === '' ? 'site' : 'fonte') + ': ' + e.message); onBytes(-got); }   // tenta a próxima fonte
  }
  throw new Error(f.path.split('/').pop() + ' → ' + (erros.join(' · ') || 'sem fonte'));
}

/* baixa um pacote; onProgress(feito, total) em bytes. Retorna quando todos os arquivos estão guardados */
export async function install(id, onProgress = () => { }, signal) {
  const m = await getManifest(), p = m.packs.find(x => x.id === id); if (!p) throw new Error('pacote desconhecido: ' + id);
  if (await isInstalled(id)) { onProgress(p.bytes, p.bytes); return; }
  if (!online()) throw new Error('Sem internet');
  const c = await caches.open(CACHE); let done = 0; onProgress(0, p.bytes);
  for (const f of p.files) {
    if (await cacheHas(f.path, f.bytes)) { done += f.bytes; onProgress(done, p.bytes); continue; }
    const base = done; let fileGot = 0;
    const fontes = isApk ? m.fontes : [...m.fontes].sort((a, b) => b.includes('{SITE}') - a.includes('{SITE}'));   // fora do app, o próprio site primeiro
    const blob = await fetchFile(f, fontes, n => { fileGot += n; onProgress(base + Math.max(0, fileGot), p.bytes); }, signal);
    await c.put(key(f.path), new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'x-bytes': String(blob.size) } }));
    done += f.bytes; onProgress(done, p.bytes);
  }
}
export async function remove(id) {
  const m = await getManifest(), p = m.packs.find(x => x.id === id); if (!p) return; const c = await caches.open(CACHE);
  for (const f of p.files) { await c.delete(key(f.path)); if (urls[f.path]) { URL.revokeObjectURL(urls[f.path]); delete urls[f.path]; } }
}
export const fmtMB = b => (b / 1e6).toFixed(b < 1e7 ? 1 : 0).replace('.', ',') + ' MB';
