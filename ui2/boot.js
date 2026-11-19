/* CyberArena v142 · Entrada (toque + carregamento) e barra de downloads no lobby.
   Entrada: título → "TOQUE PARA COMEÇAR" → carregamento → lobby.
   Lobby: barra DOWNLOADS (opcional) abre a janela de recursos; JOGAR só pede os recursos do personagem escolhido.
   Lista de pacotes: mundo/packs.json (tools/make_packs.py). Mapas e efeitos são gerados por código: não têm arquivo para baixar. */
import { PACKS_ON, status, install, remove, online, netKind, fmtMB } from '../mundo/js/packs.js';
const $ = id => document.getElementById(id);
const ICON = { personagem: '☻', mapa: '▦', audio: '♪' };
let gate = null, panel = null, loading = false;
window.cyberResReady = PACKS_ON ? false : true;   // personagens baixados? (lobby3d espera isto para montar o personagem)

/* ---------------- entrada ---------------- */
function build() {
  gate = $('startGate'); if (!gate) return false;
  gate.className = 'start-gate sg2'; gate.setAttribute('aria-label', 'Entrada do jogo');
  gate.innerHTML = `<img class="sg2-bg" src="assests/ui/lobby_bg.png" alt=""><div class="sg2-vig"></div>
  <div class="sg2-c"><div class="sg2-logo"><small>BEM-VINDO À</small><h1>CYBER <b>ARENA</b></h1></div>
    <div class="sg2-panel hidden" id="sgPanel"></div>
    <div class="sg2-tap hidden" id="sgTap"><i></i><strong>TOQUE PARA COMEÇAR</strong><i></i></div></div>
  <div class="sg2-foot">v142</div>`;
  panel = $('sgPanel'); return true;
}
function show(st, pct, sub, opts = {}) {
  panel.innerHTML = `<div class="sg2-st">${st}</div><div class="sg2-bar ${pct == null ? 'idle' : ''}"><u style="width:${pct == null ? 38 : Math.max(0, Math.min(100, pct))}%"></u></div><div class="sg2-sub ${opts.warn ? 'sg2-warn' : ''}">${sub || ''}</div>`;
}
const TIPS = ['Dica: jogue partidas para ganhar moedas, fichas e XP.', 'Dica: o Passe da temporada rende mais XP que a conta.', 'Dica: evolua seu personagem para ganhar vida e dano.', 'Dica: abra a Mini Caixa grátis todos os dias.'];
function startLoading() {
  if (loading) return; loading = true;
  gate.classList.add('loading'); $('sgTap').classList.add('hidden'); panel.classList.remove('hidden');
  const t0 = performance.now(), tip = TIPS[Math.floor(Math.random() * TIPS.length)]; let pct = 4, done = false;
  const stage = p => p < 35 ? 'PREPARANDO A ARENA…' : p < 75 ? 'CARREGANDO PERSONAGEM…' : p < 100 ? 'QUASE LÁ…' : 'PRONTO!';
  const tick = setInterval(() => {
    const el = performance.now() - t0;
    // personagem 3D só existe se os recursos já estão baixados; senão o lobby abre e pede o download
    const hero = window.__heroMounted === true || window.cyberResReady !== true;
    const target = done ? 100 : hero ? Math.max(pct, 92) : Math.min(88, 4 + el / 55);
    pct += (target - pct) * 0.18; if (target - pct < .6) pct = target;
    show(stage(pct), pct, tip);
    if (!done && (hero || el > 9000) && el > 1900) done = true;
    if (done && pct >= 99.5) { clearInterval(tick); show(stage(100), 100, tip); setTimeout(() => { try { enterLobbyFromStart(); } catch (e) { console.warn(e); } afterLobby(); }, 350); }
  }, 60);
}
function ready() {
  window.cyberBootReady = true; gate.classList.add('ready');
  const go = e => { if (!gate.classList.contains('ready')) return; e.stopImmediatePropagation(); e.preventDefault(); startLoading(); };
  gate.addEventListener('click', go, true); gate.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(e); }, true);
  $('sgTap').classList.remove('hidden');
}

/* ---------------- downloads: barra no lobby (opcional; só é preciso para jogar) ---------------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let bar = null, sheet = null, packs = [], busy = false, cur = null, errMsg = '', note = '';
const prog = {};                                   // id -> 0..1 enquanto baixa
const curChar = () => { try { return (window.__curChar && window.__curChar()) || 'nexus'; } catch (_) { return 'nexus'; } };
const needIds = () => ['cyber', curChar()].filter((v, i, a) => a.indexOf(v) === i);
const missing = () => packs.filter(p => !p.installed);
const missingNeeded = () => packs.filter(p => !p.installed && needIds().includes(p.id));
const sumMB = l => fmtMB(l.reduce((t, p) => t + p.bytes, 0));

async function refresh() {
  try { packs = PACKS_ON ? await status() : []; } catch (_) { packs = []; }
  window.cyberResReady = !missing().length; paint(); return packs;
}
function buildBar() {
  if (bar || !PACKS_ON) return;
  bar = document.createElement('button'); bar.id = 'dlBar'; bar.type = 'button'; bar.setAttribute('aria-label', 'Downloads');
  bar.innerHTML = '<i class="dl-ic">⬇</i><span class="dl-t">DOWNLOADS</span><em class="dl-s"></em><u class="dl-p"></u>';
  bar.onclick = () => openSheet(); document.body.appendChild(bar);
  setInterval(() => { const l = $('lobby'); const show = l && !l.classList.contains('hidden') && !document.body.classList.contains('world3d-open') && !($('startGate') && !$('startGate').classList.contains('hidden')); bar.classList.toggle('on', !!show); }, 400);
}
function paint() {
  if (bar) {
    const m = missing(), mn = missingNeeded(), t = bar.querySelector('.dl-t'), s = bar.querySelector('.dl-s'), p = bar.querySelector('.dl-p');
    bar.classList.toggle('need', !busy && mn.length > 0); bar.classList.toggle('busy', busy); bar.classList.toggle('done', !busy && !m.length);
    if (busy) { const tot = packs.reduce((a, x) => a + (x.installed ? 0 : x.bytes), 0) || 1, got = packs.reduce((a, x) => a + (prog[x.id] || 0) * (x.installed ? 0 : x.bytes), 0); const pc = Math.min(100, Math.round(got / tot * 100)); t.textContent = 'BAIXANDO'; s.textContent = pc + '%'; p.style.width = pc + '%'; }
    else if (!m.length) { t.textContent = 'RECURSOS'; s.textContent = '✓ OK'; p.style.width = '0'; }
    else { t.textContent = 'DOWNLOADS'; s.textContent = sumMB(m); p.style.width = '0'; }
  }
  if (sheet && !sheet.classList.contains('hidden')) paintSheet();
}
function openSheet(why) {
  if (!PACKS_ON) return;
  if (!sheet) {
    sheet = document.createElement('div'); sheet.id = 'dlSheet'; sheet.className = 'dl-sheet hidden';
    sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); }); document.body.appendChild(sheet);
  }
  note = why || ''; sheet.classList.remove('hidden'); paintSheet(); refresh();
}
function closeSheet() { if (sheet) sheet.classList.add('hidden'); note = ''; }
function paintSheet() {
  if (!sheet) return; const m = missing(), off = !online(), net = netKind(), need = needIds();
  const rows = packs.map(p => {
    const pct = Math.round((prog[p.id] || 0) * 100), here = busy && cur === p.id, req = need.includes(p.id);
    const right = p.installed ? '<span class="dl-ok">✓ BAIXADO</span>' : here ? `<span class="dl-pc">${pct}%</span>` : `<button class="dl-one" data-id="${p.id}" ${busy ? 'disabled' : ''}>BAIXAR</button>`;
    return `<div class="dl-row ${p.installed ? 'ok' : ''} ${req && !p.installed ? 'req' : ''}"><i>${p.installed ? '✓' : (ICON[p.tipo] || '↓')}</i><div class="dl-i"><b>${esc(p.nome)}${req ? '<em>PARA JOGAR</em>' : ''}</b><small>${esc(p.desc || '')} · ${fmtMB(p.bytes)}</small>${here ? `<div class="dl-pb"><u style="width:${pct}%"></u></div>` : ''}</div>${right}${p.installed && !busy ? `<button class="dl-rm" data-rm="${p.id}" title="Apagar do aparelho">🗑</button>` : ''}</div>`;
  }).join('');
  sheet.innerHTML = `<div class="dl-card"><div class="dl-h"><div><small>BARRA DE DOWNLOADS</small><h2>Recursos do jogo</h2></div><button class="dl-x" id="dlX" aria-label="Fechar">✕</button></div>
    ${note && missingNeeded().length ? `<div class="dl-warn">${esc(note)}</div>` : ''}
    <div class="dl-list">${rows || '<p class="dl-empty">Nada para baixar.</p>'}</div>
    <div class="dl-foot">${m.length ? `<button class="dl-all" id="dlAll" ${busy ? 'disabled' : ''}>${busy ? 'BAIXANDO…' : off ? 'TENTAR DE NOVO' : 'BAIXAR TUDO · ' + sumMB(m)}</button>` : '<div class="dl-done">Tudo baixado. Pode jogar!</div>'}
      <div class="dl-note ${errMsg || off || net === 'cellular' ? 'warn' : ''}">${errMsg ? esc(errMsg) : off ? 'Sem internet. Conecte-se ao Wi‑Fi ou 5G.' : net === 'cellular' ? '⚠ Você está usando dados móveis. Prefira Wi‑Fi.' : 'Baixa uma vez e fica guardado no aparelho. Pode fechar esta janela: o download continua.'}</div></div></div>`;
  $('dlX').onclick = closeSheet; const all = $('dlAll'); if (all) all.onclick = () => download(missing().map(p => p.id));
  sheet.querySelectorAll('.dl-one').forEach(b => b.onclick = () => download([b.dataset.id]));
  sheet.querySelectorAll('.dl-rm').forEach(b => b.onclick = async () => { if (!confirm('Apagar este personagem do aparelho? Dá para baixar de novo depois.')) return; try { await remove(b.dataset.rm); } catch (_) { } await refresh(); try { window.__remountHero && window.__remountHero(); } catch (_) { } });
}
async function download(ids) {
  if (busy) return; busy = true; errMsg = ''; if (!online()) { busy = false; errMsg = 'Sem internet. Conecte-se ao Wi‑Fi ou 5G e tente de novo.'; paint(); return; }
  try {
    for (const id of ids) {
      const p = packs.find(x => x.id === id); if (!p || p.installed) continue; cur = id; prog[id] = 0; paint();
      let tries = 0;
      for (; ;) {
        try { await install(id, (d, t) => { prog[id] = t ? d / t : 0; paint(); }); break; }
        catch (e) { if (++tries >= 3 || !online()) throw e; errMsg = 'Falha, tentando de novo…'; paint(); await new Promise(r => setTimeout(r, 1200)); errMsg = ''; }
      }
      p.installed = true; prog[id] = 1; window.cyberResReady = !missing().length; try { window.__remountHero && window.__remountHero(); } catch (_) { }
    }
  } catch (e) { console.warn('download de recursos', e); errMsg = !online() ? 'Sem internet. Conecte-se ao Wi‑Fi ou 5G e tente de novo.' : 'Falha ao baixar: ' + String(e.message || e).slice(0, 220); }
  busy = false; cur = null; await refresh();
}
/* usado pelo lobby antes de entrar numa partida: sem os recursos, abre a barra de downloads em vez de entrar */
window.cyberNeedRes = function () {
  if (!PACKS_ON) return true; const mn = missingNeeded(); if (!mn.length) return true;
  openSheet('Para jogar, baixe: ' + mn.map(p => p.nome).join(' e ') + ' (' + sumMB(mn) + ').'); return false;
};
window.cyberOpenDownloads = openSheet;
function afterLobby() { buildBar(); refresh(); }

window.cyberBoot = function () {
  if (window.__bootStarted) return; window.__bootStarted = true; window.cyberBootReady = false;
  if (!build()) { window.cyberBootReady = true; return false; }
  gate.classList.remove('hidden', 'starting'); gate.dataset.started = '0';
  $('splash')?.classList.add('hidden');
  (PACKS_ON ? status().catch(() => []) : Promise.resolve([])).then(l => { window.cyberResReady = !PACKS_ON || !l.some(p => !p.installed); });
  setTimeout(ready, 400); return true;
};
