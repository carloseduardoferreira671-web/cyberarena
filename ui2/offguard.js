/* CyberArena v153 · MODO OFFLINE — proteção: o jogo abre normal, mas NADA de progresso.
   • nada vai para o aparelho: gravações de progresso no localStorage ficam só na memória desta sessão (somem ao recarregar);
   • nenhuma chamada à API do servidor (só o teste de conexão /api/health);
   • tudo que muda progresso (abrir caixas, comprar, coletar, evoluir, trocar nome, códigos, conta) fica bloqueado com aviso.
   Ao reconectar o jogo recarrega: o progresso de antes do offline continua exatamente como estava. */
const GUARDED = ['openBox', 'buyGemBundle', 'claimFreeOffer', 'claimGemOffer', 'buyOffer', 'saveName', 'pfSaveName', 'buyPremiumPass', 'claimPremiumReward',
  'claimPassReward', 'claimAccountReward', 'claimMission', 'mxClaim', 'mxClaimAll', 'mxPassAll', 'pg2All', 'redeemCommunityCode', 'inboxRead', 'inboxClearNews',
  'applyInboxReward', 'econLevelUp', 'createCyberAccount', 'loginCyberAccount', 'activateChestOpening'];
const SILENT = ['addXP', 'completeFirstMatchMission', 'completeCharacterCreationMission', 'saveGame', 'showAccountAfterLobbyDelay', 'openAccountGate'];
const KEEP = /Volume|Tactile|Vibration|ControlPositions|ControlScale|Quality|Graphics|Lang/i;   // ajustes do aparelho continuam sendo salvos
const MSG = 'Indisponível no modo offline. Conecte-se à internet para usar.';
let armed = false, toastT = 0;
export function offToast(t = MSG) {
  let el = document.getElementById('offToast');
  if (!el) { el = document.createElement('div'); el.id = 'offToast'; document.body.appendChild(el); }
  el.textContent = t; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2600);
}
export function armOffline() {
  if (armed) return; armed = true;
  // 1) armazenamento: progresso só na memória da sessão
  const mem = new Map(), prog = k => /^cyber[Aa]rena/.test(k) && !KEEP.test(k);
  const gi = Storage.prototype.getItem, si = Storage.prototype.setItem, ri = Storage.prototype.removeItem;
  Storage.prototype.getItem = function (k) { const s = String(k); if (this === localStorage && prog(s) && mem.has(s)) return mem.get(s); return gi.call(this, k); };
  Storage.prototype.setItem = function (k, v) { const s = String(k); if (this === localStorage && prog(s)) { mem.set(s, String(v)); return; } return si.call(this, k, v); };
  Storage.prototype.removeItem = function (k) { const s = String(k); if (this === localStorage && prog(s)) { mem.set(s, null); return; } return ri.call(this, k); };
  // 2) rede: nenhuma chamada à API do servidor (exceto o teste de conexão)
  const f0 = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const u = typeof input === 'string' ? input : (input && input.url) || '';
    if (/\/api\//.test(u) && !/\/api\/health(\?|$)/.test(u)) return Promise.reject(new TypeError('Modo offline: sem acesso ao servidor'));
    return f0(input, init);
  };
  const sb = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (sb) navigator.sendBeacon = (u, d) => (/\/api\//.test(String(u)) ? false : sb(u, d));
  // 3) ações que mudam progresso: bloqueadas com aviso (as globais são chamadas pelos botões na hora do toque)
  for (const n of GUARDED) if (typeof window[n] === 'function') window[n] = function () { offToast(); };
  for (const n of SILENT) if (typeof window[n] === 'function') window[n] = function () { };
}
