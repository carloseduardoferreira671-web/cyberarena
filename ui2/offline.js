/* CyberArena v146 · MODO OFFLINE: só bots, nada de progresso.
   Sem troféus, XP, moedas, fichas, caixas, missões, passe ou estatísticas — nada é salvo na conta.
   A partida abre com ?offline=1&noprog=1 (o jogo e a rede ignoram qualquer recompensa nesse modo). */
const $ = id => document.getElementById(id);
const NAMES = { cyber: 'Cyber', nexus: 'Nexus', atlas: 'Atlas' };
let msgT = 0;
function open(mode) {
  const ch = (window.__curChar && window.__curChar()) || 'nexus';
  if (window.cyberNeedRes && !window.cyberNeedRes()) { say('Falta baixar o personagem. Conecte-se à internet uma vez para baixar.'); return; }
  const f = window.openWorldRaw; if (!f) { say('Jogo ainda carregando. Tente de novo.'); return; }
  f(mode, '&offline=1&noprog=1', '');
}
function say(t) { const m = $('offMsg'); if (!m) return; m.textContent = t; clearTimeout(msgT); msgT = setTimeout(() => { m.textContent = ''; }, 4000); }
export function enterOffline() {
  window.cyberOfflineMode = true; window.cyberInGame = true; window.cyberLoadingActive = false; window.__keepWorld = false;
  const w = $('world3d'); if (w) { w.src = 'about:blank'; w.classList.add('hidden'); w.style.cssText = ''; }
  const gate = $('startGate'); if (gate) { gate.classList.add('hidden'); gate.dataset.started = '1'; }
  document.body.classList.remove('world3d-open'); document.body.classList.add('offline-mode');
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  try { window.cyberNet.clearForced(); } catch (_) { }
  let m = $('offMenu'); if (m) m.remove();
  m = document.createElement('div'); m.id = 'offMenu'; m.className = 'off';
  const ch = (window.__curChar && window.__curChar()) || 'nexus';
  m.innerHTML = `<img class="off-bg" src="assests/ui/lobby_bg.png" alt=""><div class="off-vig"></div>
  <div class="off-c"><small>SEM CONEXÃO</small><h1>MODO <b>OFFLINE</b></h1>
    <div class="off-warn">Só contra bots. <b>Nada é salvo na conta</b>: sem troféus, XP, moedas, fichas, caixas, missões ou passe.</div>
    <div class="off-g"><button type="button" id="offBat" class="off-card"><b>BATALHA</b><span>Você contra 15 bots · ${NAMES[ch] || ch}</span></button>
      <button type="button" id="offTr" class="off-card"><b>TREINO</b><span>Treine golpes contra bonecos</span></button></div>
    <button type="button" id="offOn" class="off-on">TENTAR MODO ONLINE</button><div id="offMsg" class="off-msg"></div></div>`;
  document.body.appendChild(m);
  $('offBat').onclick = () => open('battle'); $('offTr').onclick = () => open('train');
  $('offOn').onclick = () => { try { window.cyberReboot(); } catch (_) { location.reload(); } };
  const bar = $('dlBar'); if (bar) bar.style.display = 'none';
}
