/* CyberArena · service worker (gerado por tools/make_sw.py). Guarda o jogo no aparelho para abrir SEM internet (modo offline).
   • Código (html/js/css): tenta a rede primeiro (pega atualizações) e cai para o guardado se estiver sem conexão.
   • Imagens/sons/fontes: guardados, atualizados em segundo plano.
   • /api nunca passa por aqui (a detecção de conexão precisa da rede de verdade). Modelos pesados ficam nos pacotes (Cache API). */
const VER = '__VERSION__', CACHE = 'cyberarena-shell-' + VER, FILES = __FILES__;
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const say = async m => { try { for (const cl of await self.clients.matchAll({ includeUncontrolled: true })) cl.postMessage(m); } catch (_) { } };
    let ok = 0;
    for (let i = 0; i < FILES.length; i += 8) { await Promise.all(FILES.slice(i, i + 8).map(async f => { try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) { await c.put(new URL(f, self.registration.scope).href, r); ok++; } } catch (_) { } })); say({ sw: 'progress', n: Math.min(i + 8, FILES.length), total: FILES.length }); }
    if (ok >= FILES.length * 0.95) await c.put(new URL('__sw_ready', self.registration.scope).href, new Response('ok'));
    say({ sw: ok >= FILES.length * 0.95 ? 'ready' : 'partial', n: ok, total: FILES.length });
    self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => { for (const k of await caches.keys()) if (k.startsWith('cyberarena-shell-') && k !== CACHE) await caches.delete(k); await self.clients.claim(); })());
});
const isCode = u => /\.(html|js|mjs|css|json|webmanifest)$/.test(u.pathname) || u.pathname.endsWith('/');
async function fromNet(req, c, ms) {
  const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; });
  if (!ms) return net;
  return Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('lento')), ms))]);
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url); if (u.origin !== location.origin || u.pathname.startsWith('/api/') || u.pathname.includes('/api/')) return;
  if (u.pathname.endsWith('.glb')) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE), key = req.mode === 'navigate' ? req : req;
    const hit = await c.match(req, { ignoreSearch: true });
    if (isCode(u) || req.mode === 'navigate') {
      try { return await fromNet(req, c, hit ? 3500 : 0); } catch (_) { if (hit) return hit; return Response.error(); }
    }
    if (hit) { fromNet(req, c, 0).catch(() => { }); return hit; }
    try { return await fromNet(req, c, 0); } catch (_) { return Response.error(); }
  })());
});
