/* Tela "RECURSOS DO JOGO": lista os pacotes, mostra o tamanho e baixa com barra de progresso (estilo Free Fire). */
import { PACKS_ON, status, install, remove, online, netKind, fmtMB } from './packs.js';

const CSS = `
#pkOv{position:fixed;inset:0;z-index:99999;background:rgba(3,6,14,.92);display:flex;align-items:center;justify-content:center;font-family:inherit;color:#e8f4ff;padding:12px;-webkit-user-select:none;user-select:none}
#pkOv.hidden{display:none}
#pkOv .pk{width:min(560px,100%);max-height:100%;overflow:auto;background:linear-gradient(180deg,#0c1424,#070b16);border:1px solid #1f6f86;border-radius:14px;box-shadow:0 0 40px rgba(56,242,255,.18);padding:16px 18px}
#pkOv h2{margin:0 0 2px;font-size:20px;letter-spacing:2px;color:#38f2ff}
#pkOv .sub{font-size:12px;opacity:.75;margin-bottom:10px;line-height:1.35}
#pkOv .row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid rgba(255,255,255,.08)}
#pkOv .info{flex:1;min-width:0}
#pkOv .nm{font-weight:700;font-size:14px}
#pkOv .ds{font-size:11px;opacity:.7}
#pkOv .bar{height:7px;border-radius:5px;background:rgba(255,255,255,.1);margin-top:6px;overflow:hidden}
#pkOv .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#1ec8ff,#7cffb2);transition:width .15s}
#pkOv button{font:inherit;font-weight:700;font-size:12px;letter-spacing:1px;border:0;border-radius:8px;padding:9px 13px;cursor:pointer;color:#03101a;background:#38f2ff;white-space:nowrap}
#pkOv button.sec{background:rgba(255,255,255,.12);color:#e8f4ff}
#pkOv button:disabled{opacity:.45}
#pkOv .ok{color:#7cffb2;font-weight:700;font-size:12px;white-space:nowrap}
#pkOv .foot{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}
#pkOv .msg{font-size:12px;margin-top:8px;color:#ffd27c;min-height:16px}
`;
let ov = null, busy = false, ctl = null;

function build() {
  if (ov) return ov;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  ov = document.createElement('div'); ov.id = 'pkOv'; ov.className = 'hidden';
  ov.innerHTML = '<div class="pk"><h2>RECURSOS DO JOGO</h2><div class="sub" id="pkSub"></div><div id="pkList"></div><div class="msg" id="pkMsg"></div><div class="foot" id="pkFoot"></div></div>';
  document.body.appendChild(ov); return ov;
}
const $ = id => document.getElementById(id);

async function render(opts) {
  const list = await status(), need = new Set(opts.need || []), total = list.filter(p => !p.installed).reduce((t, p) => t + p.bytes, 0);
  const net = netKind(); $('pkSub').innerHTML = (opts.blocking ? 'Para jogar, baixe os recursos abaixo. ' : 'Baixe personagens e outros recursos. ') + 'Use <b>Wi‑Fi ou 5G</b> (são necessários dados da internet). ' + (net === 'cellular' ? '<br>⚠ Você está usando dados móveis.' : '') + (total ? '<br>Falta baixar: <b>' + fmtMB(total) + '</b>' : '<br>✔ Tudo baixado.');
  $('pkList').innerHTML = list.map(p => `<div class="row" data-id="${p.id}"><div class="info"><div class="nm">${p.nome}${p.essencial ? ' · essencial' : ''} <small style="opacity:.6">${fmtMB(p.bytes)}</small></div><div class="ds">${p.desc}</div><div class="bar" style="display:none"><i></i></div></div>` +
    (p.installed ? `<span class="ok">✔ BAIXADO</span>${p.essencial ? '' : '<button class="sec" data-del="' + p.id + '">APAGAR</button>'}` : `<button data-get="${p.id}">BAIXAR</button>`) + '</div>').join('');
  const missing = list.filter(p => !p.installed);
  $('pkFoot').innerHTML = (missing.length > 1 ? '<button id="pkAll">BAIXAR TUDO</button>' : '') + (opts.blocking && !opts.noBack ? '<button class="sec" id="pkBack">VOLTAR</button>' : '') + (!opts.blocking || !list.some(p => need.has(p.id) && !p.installed) ? '<button class="sec" id="pkClose">' + (opts.blocking ? 'CONTINUAR' : 'FECHAR') + '</button>' : '');
  return list;
}

async function downloadIds(ids, opts) {
  if (busy) return; busy = true; const msg = $('pkMsg'); msg.textContent = '';
  ov.querySelectorAll('button').forEach(b => b.disabled = true);
  ctl = new AbortController();
  try {
    for (const id of ids) {
      const row = ov.querySelector(`.row[data-id="${id}"]`), bar = row && row.querySelector('.bar'), fill = bar && bar.firstElementChild; if (bar) bar.style.display = '';
      let tries = 0;
      for (; ;) {
        try { await install(id, (d, t) => { if (fill) fill.style.width = (t ? d / t * 100 : 0).toFixed(1) + '%'; row && (row.querySelector('.ds').textContent = Math.round(t ? d / t * 100 : 0) + '% · ' + fmtMB(d) + ' / ' + fmtMB(t)); }, ctl.signal); break; }
        catch (e) { if (e.name === 'AbortError') throw e; if (++tries >= 3 || !online()) throw e; msg.textContent = 'Falha, tentando de novo…'; await new Promise(r => setTimeout(r, 1200)); }
      }
    }
  } catch (e) { msg.textContent = e.name === 'AbortError' ? 'Download cancelado.' : (!online() || /Sem internet/.test(e.message) ? 'Sem internet. Conecte-se ao Wi‑Fi ou 5G e tente de novo.' : 'Não consegui baixar (' + e.message + '). Verifique a internet e tente de novo.'); }
  busy = false; ctl = null; await render(opts); bind(opts);
  if (opts.blocking && opts.autoClose !== false && !ov.querySelector('#pkClose')?.disabled && !(await status()).some(p => (opts.need || []).includes(p.id) && !p.installed)) setTimeout(() => close(true), 700);
}

function bind(opts) {
  ov.querySelectorAll('[data-get]').forEach(b => b.onclick = () => downloadIds([b.dataset.get], opts));
  ov.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { await remove(b.dataset.del); await render(opts); bind(opts); });
  const all = $('pkAll'); if (all) all.onclick = async () => downloadIds((await status()).filter(p => !p.installed).map(p => p.id), opts);
  const c = $('pkClose'); if (c) c.onclick = () => close(true);
  const bk = $('pkBack'); if (bk) bk.onclick = () => close(false);
}
let resolver = null;
function close(ok) { if (ctl) ctl.abort(); ov.classList.add('hidden'); const r = resolver; resolver = null; r && r(ok); }

/* abre a tela. need = ids obrigatórios (modo bloqueante: só libera depois de baixar). Resolve true quando o jogador segue, false se voltar. */
export async function openPacks(opts = {}) {
  if (!PACKS_ON) return true; build();
  const list = await status(); if (opts.blocking && !list.some(p => (opts.need || []).includes(p.id) && !p.installed)) return true;
  ov.classList.remove('hidden'); await render(opts); bind(opts);
  const first = list.filter(p => (opts.need || []).includes(p.id) && !p.installed).map(p => p.id);
  if (opts.blocking && opts.auto !== false && first.length && online()) setTimeout(() => downloadIds(first, opts), 300);
  else if (opts.blocking && first.length && !online()) $('pkMsg').textContent = 'Sem internet. Conecte-se ao Wi‑Fi ou 5G.';
  return new Promise(res => { resolver = res; });
}
/* garante que estes pacotes estão baixados antes de seguir (abre a tela se faltar algum) */
export async function ensurePacks(ids, opts = {}) { return openPacks({ blocking: true, need: ids, ...opts }); }
