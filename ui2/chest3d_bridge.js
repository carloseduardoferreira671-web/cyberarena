/* CyberArena · ponte das caixas 3D (v154)
   Troca a caixa/animação 2D de teste pela caixa 3D, SEM mexer na economia: openBox/econ.js continuam sorteando e salvando;
   aqui só mudamos COMO a abertura é mostrada. Se o WebGL ou o modelo falharem, o jogo cai sozinho no visual 2D antigo.
   Desligar manualmente:  localStorage.cyberArenaChest3D = '0'   ·   Trocar estilo da tampa:  window.CHEST3D = { styles:{ mini:'launch' } } */
import { ChestStage } from '../mundo/js/chest3d.js';
const $ = id => document.getElementById(id);
let stage = null, failed = false;
const enabled = () => !failed && localStorage.getItem('cyberArenaChest3D') !== '0';
const S = () => stage || (stage = new ChestStage());
const fail = e => { failed = true; console.warn('[chest3d] usando visual 2D:', e); document.querySelectorAll('#chestOpening.c3d,#chestAcquired.c3d').forEach(o => o.classList.remove('c3d')); };

/* pré-carrega o modelo quando o lobby está ocioso (a primeira abertura já sai instantânea) */
(window.requestIdleCallback || (f => setTimeout(f, 2500)))(() => { if (enabled()) S().init().catch(fail); }, { timeout: 6000 });

/* ---- tela de abertura ---- */
const _show = window.showChestOpening, _act = window.activateChestOpening, _close = window.closeChest;
window.showChestOpening = function (type, reward) {
  _show.apply(this, arguments);
  const ov = $('chestOpening'); if (!ov || !enabled()) return;
  ov._c3d = false; ov.classList.add('c3d'); const st = S();
  ov._c3dPromise = st.init().then(() => {
    if (ov.classList.contains('hidden')) return;
    st.attach(ov, $('chestMain'));
    st.present(type, { rarity: (reward && reward.rarity) | 0, instant: st.lastType === type && performance.now() - (st._leftAt || 0) < 2500 });
    ov._c3d = true;
  }).catch(fail);
};
window.activateChestOpening = function () {
  const ov = $('chestOpening'); if (!ov || ov.classList.contains('hidden')) return _act.apply(this, arguments);
  if (!ov.classList.contains('c3d')) return _act.apply(this, arguments);
  if (ov.dataset.ready === '2') { stage && stage.skip(); return; }
  if (ov.dataset.ready !== '1') return;
  ov.dataset.ready = '2';
  (ov._c3dPromise || Promise.resolve()).then(() => {
    if (!ov._c3d) { ov.classList.remove('c3d'); ov.dataset.ready = '1'; return _act.apply(null, []); }   // sem 3D: visual antigo
    const st = stage, reward = ov._rewardData || {}, cb = ov._afterComplete || null, ph = $('chestPhase');
    if (ph) ph.textContent = 'ABRINDO CAIXA...';
    const hint = ov.querySelector('.chest-skip'); if (hint) hint.style.opacity = 0;
    const ok = st.open({
      rarity: reward.rarity | 0, rewards: { coins: Number(reward.guaranteedCoins) > 0 ? 1 : 0, tokens: Number(reward.guaranteedTokens) > 0 ? 1 : 0, gems: /GEMA/i.test(reward.extraType || '') ? 1 : 0 },
      onBurst: () => { ov.dataset.go = '1'; if (ph) ph.textContent = 'RECOMPENSAS ENCONTRADAS!'; },
      onDone: () => { ov._rewardData = null; ov._afterComplete = null; st._leftAt = performance.now(); ov.classList.add('hidden'); ov.classList.remove('c3d'); st.hide(); if (hint) hint.style.opacity = ''; startBoxRewardSequence(reward, cb); },
    });
    if (!ok) { ov.classList.remove('c3d'); ov.dataset.ready = '1'; _act.apply(null, []); }
  });
};
window.closeChest = function () { const ov = $('chestOpening'); if (ov) ov.classList.remove('c3d'); if (stage) stage.hide(); return _close && _close.apply(this, arguments); };

/* ---- tela "você recebeu uma caixa" ---- */
const _acq = window.showChestAcquired, _cont = window.continueAcquiredChest;
window.showChestAcquired = function (type) {
  _acq.apply(this, arguments);
  const ov = $('chestAcquired'); if (!ov || !enabled()) return; ov.classList.add('c3d'); const st = S();
  st.init().then(() => { if (ov.classList.contains('hidden')) return; st.attach(ov, $('acquiredChest')); st.present(type, { fanfare: true }); }).catch(fail);
};
window.continueAcquiredChest = function () { if (stage) { stage._leftAt = performance.now(); } const ov = $('chestAcquired'); if (ov) ov.classList.remove('c3d'); return _cont.apply(this, arguments); };

/* toque na caixa antes de abrir: ela "sente" (squash) */
document.addEventListener('pointerdown', e => { if (stage && e.target.closest && e.target.closest('#chestMain,#acquiredChest')) stage.nudge(); }, true);
/* toque em qualquer lugar durante a revelação acelera para as recompensas */
document.addEventListener('click', e => { const ov = $('chestOpening'); if (ov && !ov.classList.contains('hidden') && ov.classList.contains('c3d') && ov.dataset.ready === '2') stage && stage.skip(); }, true);
