/* CyberArena · editor de controles (estilo Brawl Stars / Free Fire)
   - arrastar cada botão e o joystick, tamanho por botão, opacidade, modo canhoto, joystick fixo/flutuante
   - o layout fica salvo em localStorage e vale em todos os modos
   - sem layout salvo, o jogo usa o layout original (nada muda para quem nunca editou) */
const KEY = 'cyberarena.controls.v1';
const BTN_IDS = ['bAtk', 'bLas', 'bSup', 'bVel', 'bKick', 'bDodge', 'bJmp', 'bSwap', 'bSolar', 'bPortal'];
const NAMES = { bAtk: 'SOCO', bLas: 'HABILIDADE', bSup: 'SUPER', bVel: 'PODER', bKick: 'CHUTE', bDodge: 'ESQUIVA', bJmp: 'PULO', bSwap: 'TROCAR', bSolar: 'SOLAR', bPortal: 'VIAJAR', joy: 'JOYSTICK' };
const S_MIN = .5, S_MAX = 2;
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initCtl({ trainlike = false, autoEdit = false, banner = () => { } } = {}) {
  let cfg = load(), editing = false, backup = null, sel = null, ui = null;

  function load() { try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); if (c && c.v === 1 && c.items) return c; } catch (_) { } return null; }
  function save(c) { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch (_) { } }
  const nominal = el => parseFloat(getComputedStyle(el).width) || el.offsetWidth || 60;

  /* ---------- aplicar layout ---------- */
  function placeBtn(id) {
    const el = $(id), it = cfg && cfg.items[id]; if (!el || !it) return;
    const W = innerWidth, H = innerHeight, n = nominal(el);
    el.style.position = 'absolute'; el.style.right = 'auto'; el.style.bottom = 'auto';
    el.style.left = (it.x * W - n / 2) + 'px'; el.style.top = (it.y * H - n / 2) + 'px'; el.style.scale = String(it.s);
  }
  function clearBtns() { for (const id of BTN_IDS) { const el = $(id); if (el) { for (const p of ['position', 'right', 'bottom', 'left', 'top', 'scale']) el.style[p] = ''; } } }
  function clearJoy() {
    const joy = $('joy'); if (!joy) return;
    for (const p of ['left', 'right', 'top', 'bottom', 'width', 'height']) joy.style[p] = '';
    for (const v of ['--jx', '--jy', '--js']) joy.style.removeProperty(v);
    delete joy.dataset.fixed;
  }
  function applyJoy() {
    const joy = $('joy'), it = cfg && cfg.items.joy; if (!joy) return;
    if (!it) { clearJoy(); return; }
    const W = innerWidth, H = innerHeight, s = it.s, d = 138 * s, cx = it.x * W, cy = it.y * H;
    let L, T, Wd, Hd;
    if (cfg.fixed) { const z = Math.min(d * 2.2, W, H); Wd = Hd = z; L = clamp(cx - z / 2, 0, W - z); T = clamp(cy - z / 2, 0, H - z); }
    else {
      const left = cx < W / 2;
      Wd = clamp(Math.max(.42 * W, (left ? cx : W - cx) + d * .7), 0, W); L = left ? 0 : W - Wd;
      T = clamp(Math.min(.38 * H, cy - d * .8), 0, H * .6); Hd = H - T;
    }
    Object.assign(joy.style, { left: L + 'px', right: 'auto', top: T + 'px', bottom: 'auto', width: Wd + 'px', height: Hd + 'px' });
    joy.style.setProperty('--jx', (cx - L) + 'px'); joy.style.setProperty('--jy', (cy - T) + 'px'); joy.style.setProperty('--js', String(s));
    joy.dataset.fixed = cfg.fixed ? '1' : '0';
  }
  function apply() {
    const b = document.body;
    if (!cfg) { b.classList.remove('ctl-on'); b.style.removeProperty('--ctl-op'); clearBtns(); clearJoy(); return; }
    b.classList.add('ctl-on'); b.style.setProperty('--ctl-op', String(cfg.op ?? 1));
    for (const id of BTN_IDS) placeBtn(id);
    applyJoy();
  }

  /* ---------- medir o layout original (para começar a editar a partir dele) ---------- */
  function legacyCfg() {
    document.body.classList.remove('ctl-on'); clearBtns(); clearJoy();
    const W = innerWidth, H = innerHeight, items = {};
    for (const id of BTN_IDS) {
      const el = $(id); if (!el) continue; const r = el.getBoundingClientRect(), n = nominal(el);
      items[id] = r.width ? { x: (r.left + r.width / 2) / W, y: (r.top + r.height / 2) / H, s: clamp(r.width / n, S_MIN, S_MAX) } : { x: .8, y: .6, s: 1 };
    }
    const jb = $('joyB');
    if (jb) { const r = jb.getBoundingClientRect(), n = parseFloat(getComputedStyle(jb).width) || 138; items.joy = { x: (r.left + r.width / 2) / W, y: (r.top + r.height / 2) / H, s: clamp(r.width / n, S_MIN, S_MAX) }; }
    return { v: 1, left: false, fixed: false, op: 1, items };
  }

  /* ---------- editor ---------- */
  function buildUI() {
    if (ui) return ui;
    ui = document.createElement('div'); ui.id = 'ctlEd'; ui.className = 'hidden';
    ui.innerHTML = `<div class="ce-bar">
      <div class="ce-row"><b>ALTERAR CONTROLES</b><span class="ce-hint">Arraste os botões · toque em um para mudar o tamanho</span>
        <span class="ce-acts"><button id="ceReset">RESTAURAR</button><button id="ceCancel">CANCELAR</button><button id="ceOk" class="prim">CONFIRMAR</button></span></div>
      <div class="ce-row"><span class="ce-sl"><em id="ceName">Toque em um botão</em><input id="ceSize" type="range" min="50" max="200" step="2" disabled><output id="ceSizeV">--</output></span>
        <span class="ce-sl"><em>OPACIDADE</em><input id="ceOp" type="range" min="30" max="100" step="5"><output id="ceOpV">100%</output></span>
        <label class="ce-t"><input id="ceLeft" type="checkbox"><i></i>CANHOTO</label>
        <label class="ce-t"><input id="ceFixed" type="checkbox"><i></i>JOYSTICK FIXO</label></div></div>`;
    document.body.appendChild(ui);
    const q = s => ui.querySelector(s);
    q('#ceSize').addEventListener('input', e => { if (!sel) return; cfg.items[sel].s = clamp(+e.target.value / 100, S_MIN, S_MAX); q('#ceSizeV').textContent = Math.round(cfg.items[sel].s * 100) + '%'; place(sel); });
    q('#ceOp').addEventListener('input', e => { cfg.op = clamp(+e.target.value / 100, .3, 1); q('#ceOpV').textContent = Math.round(cfg.op * 100) + '%'; document.body.style.setProperty('--ctl-op', String(cfg.op)); });
    q('#ceLeft').addEventListener('change', () => { for (const k in cfg.items) cfg.items[k].x = 1 - cfg.items[k].x; cfg.left = !cfg.left; q('#ceLeft').checked = cfg.left; apply(); });
    q('#ceFixed').addEventListener('change', e => { cfg.fixed = e.target.checked; applyJoy(); });
    q('#ceReset').addEventListener('click', () => { cfg = legacyCfg(); select(null); syncUI(); apply(); });
    q('#ceCancel').addEventListener('click', () => close(false));
    q('#ceOk').addEventListener('click', () => close(true));
    return ui;
  }
  function syncUI() {
    const q = s => ui.querySelector(s);
    q('#ceLeft').checked = !!cfg.left; q('#ceFixed').checked = !!cfg.fixed;
    q('#ceOp').value = Math.round((cfg.op ?? 1) * 100); q('#ceOpV').textContent = Math.round((cfg.op ?? 1) * 100) + '%';
  }
  function place(id) { if (id === 'joy') applyJoy(); else placeBtn(id); }
  function select(id) {
    sel = id;
    document.querySelectorAll('#btns .ab.sel, #joyB.sel').forEach(e => e.classList.remove('sel'));
    const q = s => ui.querySelector(s), size = q('#ceSize');
    if (!id) { q('#ceName').textContent = 'Toque em um botão'; size.disabled = true; q('#ceSizeV').textContent = '--'; return; }
    (id === 'joy' ? $('joyB') : $(id))?.classList.add('sel');
    q('#ceName').textContent = NAMES[id] || id; size.disabled = false; size.value = Math.round(cfg.items[id].s * 100); q('#ceSizeV').textContent = Math.round(cfg.items[id].s * 100) + '%';
  }

  function open() {
    if (editing) return; editing = true; buildUI();
    backup = cfg ? JSON.parse(JSON.stringify(cfg)) : null;
    document.body.classList.add('ctl-edit');
    if (!cfg) cfg = legacyCfg();
    for (const id of [...BTN_IDS, 'joy']) if (!cfg.items[id]) cfg.items[id] = { x: .5, y: .6, s: 1 };
    ui.classList.remove('hidden'); syncUI(); select(null); apply();
    try { window.__ctlInputReset?.(); } catch (_) { }
  }
  function close(ok) {
    if (!editing) return; editing = false;
    if (ok) { save(cfg); banner('CONTROLES SALVOS', 1400); } else { cfg = backup; apply(); }
    document.body.classList.remove('ctl-edit'); select(null); ui.classList.add('hidden');
  }

  /* arrastar (captura antes dos botões do jogo, para não disparar ataques enquanto edita) */
  document.addEventListener('pointerdown', e => {
    if (!editing) return;
    const t = e.target.closest && e.target.closest('#btns .ab, #joyB'); if (!t) return;
    e.preventDefault(); e.stopPropagation();
    const id = t.id === 'joyB' ? 'joy' : t.id; if (!cfg.items[id]) return; select(id);
    const it = cfg.items[id], W = innerWidth, H = innerHeight, sx = e.clientX - it.x * W, sy = e.clientY - it.y * H, pid = e.pointerId;
    const move = ev => {
      if (ev.pointerId !== pid) return;
      const bar = ui.querySelector('.ce-bar').getBoundingClientRect(), rad = (id === 'joy' ? 69 : nominal($(id)) / 2) * it.s;
      it.x = clamp((ev.clientX - sx) / innerWidth, rad / innerWidth, 1 - rad / innerWidth);
      it.y = clamp((ev.clientY - sy) / innerHeight, (bar.bottom + 6 + rad) / innerHeight, 1 - rad / innerHeight);
      place(id);
    };
    const up = ev => { if (ev.pointerId !== pid) return; removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }, true);

  addEventListener('resize', () => { apply(); });
  addEventListener('orientationchange', () => setTimeout(apply, 250));
  apply();

  const btn = $('bCtl');
  if (btn) { if (trainlike) { btn.classList.remove('hidden'); btn.addEventListener('click', open); } }

  return {
    open, close, get editing() { return editing; },
    /* chamado quando o mapa terminou de carregar */
    ready() { if (trainlike && autoEdit) setTimeout(open, 400); else if (trainlike) setTimeout(() => banner('Toque em CONTROLES para ajustar os botões', 2600), 3400); }
  };
}
