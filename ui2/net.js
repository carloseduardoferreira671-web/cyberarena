/* CyberArena v146 · Jogo online (estilo Free Fire / Brawl Stars).
   • Sem conexão no lobby/partida: "Conexão perdida" por cima de tudo. "Tentar de novo" volta para a tela de CARREGAMENTO,
     que oferece MODO ONLINE (repete até conectar) ou MODO OFFLINE (só bots, sem progresso).
   • Saiu do jogo (app em segundo plano) durante uma partida online: ao voltar, é preciso reconectar. Partida de 16: o bot joga por você
     enquanto está fora; Mundo Aberto e Treino: você sai.
   • No modo offline, quando a internet volta aparece o aviso "Conexão restabelecida" e o jogo reinicia para o modo online.
   Expõe window.cyberNet = { ok, check(force), forceLost(), clearForced() } e o evento 'cyber-net'. */
const isApk = location.hostname === 'appassets.androidplatform.net';
const SITE = 'https://whimsical-kataifi-2407ec.netlify.app/';
const PING = (isApk ? SITE : location.origin + '/') + 'api/health';
let ok = true, fails = 0, box = null, back = null, busy = false, timer = 0, forced = false, hiddenAt = 0, backT = 0, wasLost = false;

const guard = () => window.cyberInGame === true && !window.cyberOfflineMode && !window.cyberLoadingActive;
function ui() {
  if (box) return box;
  box = document.createElement('div'); box.id = 'netLost'; box.className = 'nl hidden'; box.setAttribute('role', 'alertdialog');
  box.innerHTML = '<div class="nl-card"><h2>Conexão perdida</h2><p>Tente conectar-se de novo.</p><button type="button" class="nl-b">Tentar de novo</button></div>';
  box.querySelector('.nl-b').onclick = () => { try { window.cyberReboot ? window.cyberReboot() : location.reload(); } catch (_) { } };
  ['touchstart', 'touchmove', 'pointerdown', 'click', 'keydown', 'wheel'].forEach(t => box.addEventListener(t, e => { if (!e.target.classList.contains('nl-b')) { e.stopPropagation(); e.preventDefault(); } }, { passive: false }));
  document.body.appendChild(box); return box;
}
function showLost() { ui().classList.remove('hidden'); document.body.classList.add('net-lost'); try { document.activeElement && document.activeElement.blur(); } catch (_) { } }
function hideLost() { if (box) box.classList.add('hidden'); document.body.classList.remove('net-lost'); }
function sync() {
  const lost = (!ok || forced) && guard();
  if (lost) showLost(); else hideLost();
  if (!ok && !window.cyberOfflineMode) wasLost = true;
  // modo offline e a internet voltou: avisa e reinicia
  if (ok && window.cyberOfflineMode) showBack(); else if (!ok || !window.cyberOfflineMode) hideBack();
}
function showBack() {
  if (back) return;
  back = document.createElement('div'); back.id = 'netBack'; back.className = 'nl';
  back.innerHTML = '<div class="nl-card"><h2>Conexão restabelecida</h2><p>A internet voltou. O jogo vai reiniciar para entrar no modo online.</p><button type="button" class="nl-b">Reiniciar agora (<span id="nbS">10</span>)</button></div>';
  document.body.appendChild(back); let n = 10;
  const go = () => { clearInterval(backT); try { window.cyberReboot(); } catch (_) { location.reload(); } };
  back.querySelector('.nl-b').onclick = go;
  backT = setInterval(() => { n--; const s = back && back.querySelector('#nbS'); if (s) s.textContent = n; if (n <= 0) go(); }, 1000);
}
function hideBack() { clearInterval(backT); if (back) { back.remove(); back = null; } }
function set(v) {
  if (v === ok) return; ok = v; fails = 0; sync();
  try { window.dispatchEvent(new CustomEvent('cyber-net', { detail: { ok } })); } catch (_) { }
}
async function ping() {
  if (navigator.onLine === false) return false;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 7000);
  try { await fetch(PING + (PING.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', mode: isApk ? 'no-cors' : 'same-origin', signal: c.signal }); return true; }   // qualquer resposta HTTP = o servidor foi alcançado
  catch (_) { return false; } finally { clearTimeout(t); }
}
async function check(force) {
  if (busy) { await new Promise(r => { const i = setInterval(() => { if (!busy) { clearInterval(i); r(); } }, 50); }); return ok; }
  busy = true;
  try { const r = await ping(); if (r) set(true); else { fails++; if (force || navigator.onLine === false || fails >= 2 || !ok) set(false); } } finally { busy = false; }
  return ok;
}
function loop() { clearTimeout(timer); check().finally(() => { sync(); timer = setTimeout(loop, ok ? 5000 : 2000); }); }
window.addEventListener('offline', () => set(false));
window.addEventListener('online', () => { fails = 9; check(); });
/* saiu do jogo (app em 2º plano) durante uma partida online: ao voltar precisa reconectar */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
  if (away > 2500 && guard() && document.body.classList.contains('world3d-open')) { forced = true; sync(); }
  else { fails = 9; check(); }
});
window.cyberNet = { get ok() { return ok; }, check, forceLost() { forced = true; sync(); }, clearForced() { forced = false; sync(); } };
setInterval(sync, 700);
const init = () => { ui(); if (navigator.onLine === false) set(false); loop(); };
document.body ? init() : document.addEventListener('DOMContentLoaded', init);
