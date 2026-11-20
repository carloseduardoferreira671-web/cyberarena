/* CyberArena v145 · Jogo 100% online (estilo Free Fire / Brawl Stars).
   Sem internet (ou sem alcançar o servidor) aparece "Conexão perdida" por cima de TUDO (lobby, loja, partida) e
   bloqueia os toques até a conexão voltar. Expõe window.cyberNet = { ok, check(), waitOnline() } e o evento 'cyber-net'. */
const isApk = location.hostname === 'appassets.androidplatform.net';
const SITE = 'https://whimsical-kataifi-2407ec.netlify.app/';
const PING = (isApk ? SITE : location.origin + '/') + 'api/health';
let ok = true, fails = 0, box = null, busy = false, timer = 0;
const waiters = [];

function ui() {
  if (box) return box;
  box = document.createElement('div'); box.id = 'netLost'; box.className = 'nl hidden'; box.setAttribute('role', 'alertdialog');
  box.innerHTML = '<div class="nl-card"><h2>Conexão perdida</h2><p>Tente conectar-se de novo.</p><button type="button" class="nl-b">Tentar de novo</button></div>';
  box.querySelector('.nl-b').onclick = () => manual();
  ['touchstart', 'touchmove', 'pointerdown', 'click', 'keydown', 'wheel'].forEach(t => box.addEventListener(t, e => { if (!e.target.classList.contains('nl-b')) { e.stopPropagation(); e.preventDefault(); } }, { passive: false }));
  document.body.appendChild(box); return box;
}
function set(v) {
  if (v === ok) return; ok = v; fails = 0;
  if (!ok) { ui().classList.remove('hidden'); document.body.classList.add('net-lost'); try { document.activeElement && document.activeElement.blur(); } catch (_) { } }
  else { if (box) box.classList.add('hidden'); document.body.classList.remove('net-lost'); waiters.splice(0).forEach(r => r()); }
  try { window.dispatchEvent(new CustomEvent('cyber-net', { detail: { ok } })); } catch (_) { }
  clearTimeout(timer); timer = setTimeout(loop, ok ? 5000 : 2000);
}
async function ping() {
  if (navigator.onLine === false) return false;
  const c = new AbortController(), t = setTimeout(() => c.abort(), 6000);
  try { await fetch(PING + (PING.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store', mode: isApk ? 'no-cors' : 'same-origin', signal: c.signal }); return true; }   // qualquer resposta HTTP = o servidor foi alcançado
  catch (_) { return false; } finally { clearTimeout(t); }
}
async function check() {
  if (busy) return ok; busy = true;
  try { const r = await ping(); if (r) set(true); else { fails++; if (navigator.onLine === false || fails >= 2 || !ok) set(false); } } finally { busy = false; }
  return ok;
}
async function manual() {
  const b = box && box.querySelector('.nl-b'); if (b) { b.textContent = 'Conectando…'; b.disabled = true; }
  await new Promise(r => setTimeout(r, 500)); fails = 9; await check();
  if (b) { b.textContent = 'Tentar de novo'; b.disabled = false; }
}
function loop() { clearTimeout(timer); check().finally(() => { timer = setTimeout(loop, ok ? 5000 : 2000); }); }
window.addEventListener('offline', () => set(false));
window.addEventListener('online', () => { fails = 9; check(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { fails = 9; check(); } });
window.cyberNet = { get ok() { return ok; }, check, waitOnline: () => ok ? Promise.resolve() : new Promise(r => waiters.push(r)) };
const init = () => { ui(); if (navigator.onLine === false) set(false); loop(); };
document.body ? init() : document.addEventListener('DOMContentLoaded', init);
