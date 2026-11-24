/* CyberArena v153 · MODO OFFLINE = o jogo normal (lobby, personagens, loja, passe…) mas sem salvar NADA e sem abrir caixas, comprar ou coletar.
   As partidas abrem só contra bots (?offline=1&noprog=1). Mundo Aberto precisa de internet.
   Quando a internet volta aparece o aviso "Conexão restabelecida" (ui2/net.js): reconectar ao online ou continuar offline. */
import { armOffline, offToast } from './offguard.js';
import { PACKS_ON, status } from '../mundo/js/packs.js';
const $ = id => document.getElementById(id);
const curChar = () => { try { return (window.__curChar && window.__curChar()) || 'nexus'; } catch (_) { return 'nexus'; } };
async function resReady() {
  try { if (!PACKS_ON) return true; const l = await status(); return ['cyber', curChar()].every(id => (l.find(p => p.id === id) || {}).installed); } catch (_) { return false; }
}
function badge() {
  let b = $('offBadge'); if (b) return;
  b = document.createElement('button'); b.id = 'offBadge'; b.type = 'button'; b.innerHTML = '<i></i>MODO OFFLINE<small>progresso não é salvo</small>';
  b.onclick = async () => { let ok = false; try { ok = await window.cyberNet.check(true); } catch (_) { } if (ok) window.cyberNet.showBackNow(); else offToast('Ainda sem conexão com a internet.'); };
  document.body.appendChild(b);
}
export async function enterOffline() {
  window.cyberOfflineMode = true; window.cyberLoadingActive = false; window.__keepWorld = false;
  armOffline();
  document.body.classList.add('offline-mode');
  const ok = await resReady(); window.cyberResReady = ok;
  window.cyberBootReady = true; window.cyberInGame = true;
  try { window.cyberNet.clearForced(); } catch (_) { }
  const old = $('offMenu'); if (old) old.remove();
  const gate = $('startGate'); if (gate) { gate.dataset.started = '0'; gate.classList.remove('loading', 'choice', 'ready'); }
  if (ok) { try { window.__remountHero && window.__remountHero(); } catch (_) { } }
  badge();
  try { enterLobbyFromStart(); } catch (e) { console.warn('offline', e); }
  if (!ok) setTimeout(() => offToast('Falta baixar o personagem. Conecte-se à internet uma vez para baixar.'), 1500);
}
