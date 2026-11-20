/* CyberArena · service worker (gerado por tools/make_sw.py). Guarda o jogo no aparelho para abrir SEM internet (modo offline).
   • Código (html/js/css): tenta a rede primeiro (pega atualizações) e cai para o guardado se estiver sem conexão.
   • Imagens/sons/fontes: guardados, atualizados em segundo plano.
   • /api nunca passa por aqui (a detecção de conexão precisa da rede de verdade). Modelos pesados ficam nos pacotes (Cache API). */
const VER = '39581d8048', CACHE = 'cyberarena-shell-' + VER, FILES = [".github/workflows/build-apk.yml", ".gitignore", ".vercelignore", "app.html", "assests/sprites/bot.png", "assests/sprites/button_attack.png", "assests/sprites/button_circle.png", "assests/sprites/button_circle_pressed.png", "assests/sprites/button_super.png", "assests/sprites/cyber_box.png", "assests/sprites/hp_bar.png", "assests/sprites/joystick.png", "assests/sprites/mecha_box.png", "assests/sprites/mini_box.png", "assests/sprites/player.png", "assests/sprites/shop_bg.png", "assests/sprites/splash.png", "assests/ui/back_cyber.png", "assests/ui/bot.png", "assests/ui/button_attack.png", "assests/ui/button_circle.png", "assests/ui/button_circle_pressed.png", "assests/ui/button_super.png", "assests/ui/character_unavailable.svg", "assests/ui/coin_logo.svg", "assests/ui/cyber_box.png", "assests/ui/gem_logo.svg", "assests/ui/hp_bar.png", "assests/ui/icon-192.png", "assests/ui/icon-512.png", "assests/ui/joystick.png", "assests/ui/lobby_bg.png", "assests/ui/mecha_box.png", "assests/ui/mini_box.png", "assests/ui/panel.png", "assests/ui/player.png", "assests/ui/portrait_atlas.jpg", "assests/ui/portrait_cyber.jpg", "assests/ui/portrait_nexus.jpg", "assests/ui/shop_bg.png", "assests/ui/splash.png", "assests/ui/token_logo.svg", "cyber_viewer/assets/cyber.bin", "cyber_viewer/assets/cyber.json", "cyber_viewer/assets/cyber_tex.webp", "cyber_viewer/cyber_rig.js", "cyber_viewer/index.html", "data/loot_table.json", "data/player_data.json", "index.html", "lobby3d.css", "lobby3d.js", "main.js", "manifest.webmanifest", "mundo/assets/audio/atlas_hit_contact.mp3", "mundo/assets/audio/atlas_panting_soft.mp3", "mundo/assets/audio/audiopapkin-big-robot-footstep-014-445104.mp3", "mundo/assets/audio/audiopapkin-big-robot-footstep-020-500843.mp3", "mundo/assets/audio/cyber_breath_soft.mp3", "mundo/assets/audio/cyber_hit_soft.mp3", "mundo/assets/audio/freeeverythingxx-walking-on-concrete-ver-2-268513.mp3", "mundo/assets/audio/freesound_community-jump-landing-30946.mp3", "mundo/assets/audio/freesound_community-robot-step-39326.mp3", "mundo/assets/audio/freesound_community-running-sounds-6003.mp3", "mundo/assets/audio/golpe_whoosh.mp3", "mundo/assets/audio/passos_espaco.mp3", "mundo/assets/audio/passos_terra.mp3", "mundo/assets/audio/sfx_guy01-robot-walkin-3-621498.mp3", "mundo/assets/audio/u_kgvh2pcoau-passos-461702.mp3", "mundo/assets/audio/universfield-boom-swoosh-impact-454860.mp3", "mundo/assets/audio/universfield-combat-impact-352458.mp3", "mundo/assets/audio/universfield-ground-impact-352053.mp3", "mundo/assets/audio/universfield-impact-cinematic-boom-02-487858.mp3", "mundo/assets/audio/universfield-punch-03-352040.mp3", "mundo/assets/audio/universfield-punch-140236.mp3", "mundo/hero_viewer.html", "mundo/hud.css", "mundo/index.html", "mundo/js/anatomy.js", "mundo/js/atlasglb.js", "mundo/js/audio.js", "mundo/js/classic.js", "mundo/js/combatfx.js", "mundo/js/crystals.js", "mundo/js/fx.js", "mundo/js/game.js", "mundo/js/glbmesh.js", "mundo/js/hero.js", "mundo/js/net.js", "mundo/js/packs.js", "mundo/js/packs_ui.js", "mundo/js/pbr.js", "mundo/js/post.js", "mundo/js/powers.js", "mundo/js/realm.js", "mundo/js/riggedglb.js", "mundo/js/softbody.js", "mundo/js/w2/core_blocks.js", "mundo/js/w2/layout.js", "mundo/js/w2/physics.js", "mundo/js/w2/world.js", "mundo/js/w2/world_shaders.js", "mundo/js/w2/world_tex.js", "mundo/js/w2/world_veg.js", "mundo/js/world.js", "mundo/js/world_old.js", "mundo/layout.js", "mundo/lib/addons/math/SimplexNoise.js", "mundo/lib/addons/utils/BufferGeometryUtils.js", "mundo/lib/three.module.min.js", "mundo/packs.json", "mundo/world_core.js", "paisagem.js", "party.css", "party.js", "sounds/hit_metal.wav", "sounds/lobby_theme.mp3", "sounds/magic_blast.wav", "sounds/ui/ui_account.wav", "sounds/ui/ui_back.wav", "sounds/ui/ui_box_cyber.wav", "sounds/ui/ui_box_mecha.wav", "sounds/ui/ui_box_mini.wav", "sounds/ui/ui_buy.wav", "sounds/ui/ui_card.wav", "sounds/ui/ui_click.wav", "sounds/ui/ui_coin.wav", "sounds/ui/ui_gem.wav", "sounds/ui/ui_mixed.wav", "sounds/ui/ui_open.wav", "sounds/ui/ui_play.wav", "sounds/ui/ui_premium.wav", "sounds/ui/ui_profile.wav", "sounds/ui/ui_settings.wav", "sounds/ui/ui_token.wav", "style.css", "ui2/boot.css", "ui2/boot.js", "ui2/econ.js", "ui2/fonts/BigShoulders-Bold.ttf", "ui2/fonts/Outfit-Bold.ttf", "ui2/fonts/Outfit-Regular.ttf", "ui2/icons.svg.html", "ui2/inbox2.css", "ui2/inbox2.js", "ui2/mech.js", "ui2/net.css", "ui2/net.js", "ui2/offline.js", "ui2/pass2.css", "ui2/pass2.js", "ui2/profile.js", "ui2/shop2.css", "ui2/shop2.js", "ui2/ui2.css", "ui2/ui2.js", "ui2/visual138.css", "voice.js"];
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    for (let i = 0; i < FILES.length; i += 8) await Promise.all(FILES.slice(i, i + 8).map(async f => { try { const r = await fetch(f, { cache: 'reload' }); if (r.ok) await c.put(new URL(f, self.registration.scope).href, r); } catch (_) { } }));
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
