/* CyberArena · UI 2.0 — sons sintetizados (sem arquivos), vibração por tipo de toque, feedback de pressionar e transições de tela.
   Carrega DEPOIS do main.js: troca playUISound / vibrateUI / classifyUIButton por versões mais completas (as funções do main.js são globais). */
(() => {
  'use strict';
  const LS = k => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const gainFx = () => { try { return typeof getEffectsGain === 'function' ? getEffectsGain() : 1; } catch (_) { return 1; } };
  let ctx = null, bus = null, noiseBuf = null, last = {};
  function ac() {
    try { ctx = (typeof ensureAudioGraph === 'function' && ensureAudioGraph()) || ctx; } catch (_) { }
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });
    if (!bus || bus.context !== ctx) { bus = ctx.createGain(); bus.gain.value = 1; const dest = (typeof audioMaster !== 'undefined' && audioMaster && audioMaster.context === ctx) ? audioMaster : ctx.destination; bus.connect(dest); }
    return ctx;
  }
  function noise() { if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf; const n = ctx.sampleRate * .5 | 0; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return noiseBuf; }
  /* nota: freq (f→f2 em glissando), tipo, ataque/queda, ganho */
  function tone(o) {
    const t0 = ctx.currentTime + (o.at || 0), osc = ctx.createOscillator(), g = ctx.createGain(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0); if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    const a = o.attack ?? .004, v = (o.gain ?? .3) * gainFx(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let n = osc; if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); n = f; }
    n.connect(g); g.connect(bus); osc.start(t0); osc.stop(t0 + o.dur + .03);
  }
  function hiss(o) {
    const t0 = ctx.currentTime + (o.at || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); src.buffer = noise(); src.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f, t0); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t0 + o.dur); f.Q.value = o.q ?? 1.2;
    const v = (o.gain ?? .2) * gainFx(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + (o.attack ?? .005)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(bus); src.start(t0, Math.random() * .3); src.stop(t0 + o.dur + .03);
  }
  /* biblioteca de sons de interface */
  const SFX = {
    tap() { tone({ f: 1250, f2: 700, dur: .05, type: 'triangle', gain: .22, lp: 5000 }); tone({ f: 170, f2: 95, dur: .07, type: 'sine', gain: .32 }); hiss({ f: 4200, dur: .02, gain: .07, q: .7 }); },
    soft() { tone({ f: 900, f2: 620, dur: .04, type: 'triangle', gain: .14, lp: 4000 }); tone({ f: 140, f2: 90, dur: .05, gain: .18 }); },
    nav() { tone({ f: 520, f2: 780, dur: .09, type: 'triangle', gain: .2, lp: 4200 }); tone({ f: 780, f2: 1040, dur: .1, type: 'sine', gain: .12, at: .04 }); hiss({ f: 1200, f2: 3200, dur: .1, gain: .07 }); tone({ f: 150, f2: 90, dur: .08, gain: .22 }); },
    tab() { tone({ f: 640, f2: 900, dur: .07, type: 'triangle', gain: .17, lp: 4200 }); tone({ f: 160, f2: 100, dur: .06, gain: .2 }); },
    open() { hiss({ f: 600, f2: 3600, dur: .22, q: .9, gain: .1, attack: .03 }); tone({ f: 330, f2: 660, dur: .2, type: 'triangle', gain: .14, lp: 3000 }); tone({ f: 990, dur: .26, type: 'sine', gain: .08, at: .09 }); tone({ f: 120, f2: 70, dur: .14, gain: .26 }); },
    close() { hiss({ f: 3200, f2: 500, dur: .16, q: .9, gain: .08 }); tone({ f: 600, f2: 280, dur: .14, type: 'triangle', gain: .13, lp: 3000 }); tone({ f: 100, f2: 60, dur: .1, gain: .22 }); },
    back() { tone({ f: 760, f2: 420, dur: .1, type: 'triangle', gain: .2, lp: 3800 }); tone({ f: 130, f2: 75, dur: .09, gain: .26 }); hiss({ f: 2600, f2: 900, dur: .06, gain: .05 }); },
    confirm() { tone({ f: 392, dur: .12, type: 'sawtooth', gain: .1, lp: 2400 }); tone({ f: 523, dur: .14, type: 'sawtooth', gain: .1, lp: 2800, at: .05 }); tone({ f: 784, dur: .26, type: 'triangle', gain: .17, at: .1, lp: 5000 }); hiss({ f: 500, f2: 5000, dur: .3, q: .7, gain: .09, attack: .04 }); tone({ f: 90, f2: 45, dur: .26, gain: .4 }); },
    play() { SFX.confirm(); tone({ f: 1046, dur: .34, type: 'sine', gain: .09, at: .16 }); hiss({ f: 800, f2: 7000, dur: .4, q: .6, gain: .06, at: .05 }); },
    buy() { tone({ f: 1568, dur: .4, type: 'sine', gain: .15 }); tone({ f: 2093, dur: .34, type: 'sine', gain: .12, at: .06 }); tone({ f: 3136, dur: .22, type: 'sine', gain: .06, at: .06 }); hiss({ f: 7000, dur: .05, gain: .1, q: 3 }); tone({ f: 200, f2: 110, dur: .1, gain: .3 }); },
    error() { tone({ f: 170, dur: .11, type: 'square', gain: .13, lp: 900 }); tone({ f: 140, dur: .16, type: 'square', gain: .13, lp: 800, at: .12 }); },
    on() { tone({ f: 640, f2: 960, dur: .08, type: 'triangle', gain: .17, lp: 4000 }); tone({ f: 150, f2: 95, dur: .06, gain: .2 }); },
    off() { tone({ f: 600, f2: 380, dur: .08, type: 'triangle', gain: .15, lp: 3500 }); tone({ f: 120, f2: 80, dur: .06, gain: .2 }); },
    tick() { tone({ f: 1500, f2: 1200, dur: .018, type: 'triangle', gain: .09, lp: 5000 }); },
    reward() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone({ f, dur: .32, type: 'triangle', gain: .13, at: i * .06, lp: 6000 })); tone({ f: 2093, dur: .5, type: 'sine', gain: .06, at: .3 }); hiss({ f: 5000, f2: 9000, dur: .5, q: 2, gain: .05, at: .1 }); },
    claim() { tone({ f: 880, f2: 1320, dur: .12, type: 'triangle', gain: .17, lp: 5000 }); tone({ f: 1760, dur: .22, type: 'sine', gain: .1, at: .07 }); tone({ f: 130, f2: 80, dur: .1, gain: .26 }); },
    locked() { tone({ f: 220, f2: 180, dur: .09, type: 'square', gain: .1, lp: 700 }); tone({ f: 110, dur: .08, gain: .2, at: .05 }); },
  };
  /* vibração: curta e seca para toque, mais longa para confirmar */
  const BUZZ = { tap: 8, soft: 5, nav: 12, tab: 8, open: 16, close: 10, back: 10, confirm: [14, 26, 22], play: [18, 30, 24, 30, 38], buy: [12, 34, 18, 34, 30], error: [26, 36, 26], on: 10, off: 7, tick: 3, reward: [14, 30, 18, 30, 26, 30, 40], claim: [12, 28, 22], locked: [12, 30, 12] };
  function buzz(kind) {
    if (!navigator.vibrate) return;
    if (LS('cyberArenaTactileEnabled') === '0') return;
    if (LS('cyberArenaVibrationEnabled') === '0') return;
    try { navigator.vibrate(BUZZ[kind] || 8); } catch (_) { }
  }
  /* toca (com limite de repetição para não "metralhar") */
  function sfx(kind, opt) {
    const now = performance.now(); if (last[kind] && now - last[kind] < (opt && opt.gap || 45)) return; last[kind] = now;
    if (!ac()) return; try { (SFX[kind] || SFX.tap)(); } catch (_) { }
    if (!opt || opt.haptic !== false) buzz(kind);
  }
  window.U2 = { sfx, buzz, SFX };

  /* troca as funções do main.js: mesmos nomes, agora com sons novos (os sons de caixa/moeda/gema continuam os de arquivo) */
  const MAP = { click: 'tap', open: 'open', back: 'back', play: 'play', buy: 'buy', settings: 'open', profile: 'nav', account: 'nav', card: 'soft' };
  window.playUISound = kind => { if (kind === 'none') return; sfx(MAP[kind] || kind || 'tap', { haptic: false }); };
  window.vibrateUI = kind => { if (kind === 'none') return; buzz(MAP[kind] || kind || 'tap'); };

  /* qual som cada elemento faz */
  function kindOf(el) {
    if (el.matches('input[type=range],input[type=checkbox]')) return null;
    if (el.closest('.ca-nav')) return 'nav';
    if (el.matches('.l2-rail button,.l2-rail2 button')) return 'nav';
    if (el.matches('.l2-mode,.mc-tabs button,.shop-sidebar button,.lc-chars button,.char-pick button,.l2-seg button,.sk')) return 'tab';
    if (el.matches('.l2-play,.play-button')) return 'play';
    if (el.matches('.l2-close,.back-button,.settings-close,[data-back]')) return 'back';
    if (el.matches('.l2-buy,.box-action,.offer-buy,[onclick*="buy"],[onclick*="openBox"],[onclick*="exchange"]')) return 'buy';
    if (el.matches('.claim-reward,.mission-action button,#freeOfferButton,[onclick*="claim"],.l2-claim')) return 'claim';
    if (el.matches('.l2-card:not(button),.box,.offer-card,.pass-tile,.reward-tile')) return 'soft';
    if (el.classList.contains('locked') || el.classList.contains('lock') || el.dataset.locked) return 'locked';
    if (el.id === 'settingsBtn' || el.matches('.screen-settings,.l2-gear')) return 'open';
    return 'tap';
  }
  const PRESS = 'button,[role=button],.box,.offer-card,.pass-tile,.l2-card,.inbox-item,.sk,a[href],summary,[onclick]';
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest && e.target.closest(PRESS); if (!el || el.disabled || el.closest('.hidden')) return;
    const k = kindOf(el); if (!k) return;
    el.classList.add('u2-down'); const up = () => { el.classList.remove('u2-down'); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
    /* onda de toque */
    try { const r = el.getBoundingClientRect(); if (r.width > 24 && r.height > 18 && !el.matches('input,select,textarea')) { const s = document.createElement('i'); s.className = 'u2-rip'; const d = Math.max(r.width, r.height) * 1.6; s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`; if (getComputedStyle(el).position === 'static') el.style.position = 'relative'; el.appendChild(s); setTimeout(() => s.remove(), 520); } } catch (_) { }
  }, { capture: true, passive: true });
  /* o main.js já escuta o toque e chama classifyUIButton → playUISound/vibrateUI: aqui só trocamos a classificação (os sons já são os novos) */
  window.classifyUIButton = el => (el && el.matches && kindOf(el)) || 'none';
  /* interruptores e controles deslizantes */
  document.addEventListener('change', e => { const t = e.target; if (t.matches && t.matches('input[type=checkbox]')) sfx(t.checked ? 'on' : 'off'); }, true);
  let lastTick = 0, lastVal = {};
  document.addEventListener('input', e => { const t = e.target; if (!(t.matches && t.matches('input[type=range]'))) return; const v = Math.round(t.value / Math.max(1, (t.max - t.min) / 20)); if (lastVal[t.id] === v) return; lastVal[t.id] = v; const n = performance.now(); if (n - lastTick > 55) { lastTick = n; sfx('tick', { gap: 0 }); } }, true);

  /* troca de tela: animação de entrada + som de abertura quando é um painel/modal que aparece */
  const _open = window.openScreen;
  if (typeof _open === 'function') window.openScreen = function (id) { const r = _open.apply(this, arguments); try { const el = document.getElementById(id); if (el) { el.classList.remove('u2-enter'); void el.offsetWidth; el.classList.add('u2-enter'); } } catch (_) { } return r; };
  /* modais e janelas: som ao aparecer */
  const seen = new WeakMap();
  new MutationObserver(ms => { for (const m of ms) { const el = m.target; if (m.attributeName !== 'class' || !el.classList) continue; const was = seen.get(el), now = !el.classList.contains('hidden'); seen.set(el, now); if (was === undefined || was === now) continue; if (el.matches('.modal,.settings-overlay,.account-overlay,.owner-overlay,.l3d-modal')) { if (now) { el.classList.add('u2-pop'); sfx('open', { haptic: false }); } else sfx('close', { haptic: false }); } } })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  /* primeiro toque libera o áudio no celular */
  addEventListener('pointerdown', () => ac(), { once: true, capture: true });
})();
