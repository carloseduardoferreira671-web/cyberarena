/* CyberArena v149 · Entrada (toque + carregamento) e barra de downloads no lobby.
   Entrada: título → "TOQUE PARA COMEÇAR" → carregamento → lobby.
   Lobby: barra DOWNLOADS (opcional) abre a janela de recursos; JOGAR só pede os recursos do personagem escolhido.
   Lista de pacotes: mundo/packs.json (tools/make_packs.py). Mapas e efeitos são gerados por código: não têm arquivo para baixar. */
import './net.js';
import { enterOffline } from './offline.js';
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
  <div class="sg2-foot">v149</div>`;
  panel = $('sgPanel'); return true;
}
function show(st, pct, sub, opts = {}) {
  panel.innerHTML = `<div class="sg2-st">${st}</div><div class="sg2-bar ${pct == null ? 'idle' : ''}"><u style="width:${pct == null ? 38 : Math.max(0, Math.min(100, pct))}%"></u></div><div class="sg2-sub ${opts.warn ? 'sg2-warn' : ''}">${sub || ''}</div>`;
}
const TIPS = ['Dica: jogue partidas para ganhar moedas, fichas e XP.', 'Dica: o Passe da temporada rende mais XP que a conta.', 'Dica: evolua seu personagem para ganhar vida e dano.', 'Dica: abra a Mini Caixa grátis todos os dias.'];
/* v149: carregamento DE VERDADE — confere a conexão, baixa/atualiza TODOS os recursos (personagens, etc.) para o aparelho e só então abre o lobby.
   Os arquivos ficam guardados no celular (o jogo "cresce" a cada recurso/atualização nova). Da 2ª vez em diante só confere.
   Sem conexão: aparece a escolha MODO ONLINE (repete o carregamento até conectar) ou MODO OFFLINE (só bots, sem progresso). */
class NoNet extends Error { }
const wait = ms => new Promise(r => setTimeout(r, ms));
async function startLoading() {
  if (loading) return; loading = true; window.cyberLoadingActive = true; window.cyberInGame = false;
  gate.classList.remove('ready', 'choice'); gate.classList.add('loading'); $('sgTap') && $('sgTap').classList.add('hidden'); panel.classList.remove('hidden');
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)]; let pct = 2;
  const set = (st, p, sub, o) => { pct = Math.max(pct, p); show(st, pct, sub || tip, o); };
  try {
    set('CONECTANDO AO SERVIDOR…', 3); await wait(900);
    // Servidor dormindo (Render): espera em silêncio, sem aviso. Só vira escolha online/offline se o aparelho estiver SEM internet
    // ou o servidor não responder depois de ~1 minuto.
    { let up = false;
      for (let i = 0; i < 40 && !up; i++) {
        if (navigator.onLine === false) break;
        up = window.cyberNet ? await window.cyberNet.check(true) : false;
        if (!up) await wait(1500);
      }
      if (!up) throw new NoNet(); }
    try { navigator.storage && navigator.storage.persist && (await navigator.storage.persist()); } catch (_) { }   // pede ao celular para NÃO apagar os recursos baixados
    if (PACKS_ON) {
      set('VERIFICANDO RECURSOS…', 6); await refresh();
      const todo = packs.filter(p => !p.installed), total = todo.reduce((a, p) => a + p.bytes, 0); let base = 0;
      for (const p of todo) {
        for (let tries = 0; ; tries++) {
          try {
            await install(p.id, (d, t) => { const got = base + d; set('BAIXANDO RECURSOS…', 8 + 80 * got / total, `${p.nome} · ${fmtMB(got)} de ${fmtMB(total)} — só na primeira vez e nas atualizações`); }); break;
          } catch (e) {
            console.warn('carregamento', e);
            if (!online() || !(await window.cyberNet.check(true))) throw new NoNet();
            if (tries >= 4) { set('FALHA AO BAIXAR', pct, String(e.message || e).slice(0, 160) + ' — toque para tentar de novo', { warn: true }); await new Promise(r => { gate.addEventListener('click', r, { once: true, capture: true }); }); tries = 0; }
            else await wait(1500);
          }
        }
        base += p.bytes; p.installed = true;
      }
      await refresh();
    }
    if (window.__keepWorld) { set('VOLTANDO PARA A PARTIDA…', 96); }
    else {
      set('PREPARANDO PERSONAGEM…', 90); window.cyberResReady = true; try { window.__remountHero && window.__remountHero(); } catch (_) { }
      for (let i = 0; i < 200 && window.__heroMounted !== true; i++) await wait(100);   // espera o 3D montar (máx. 20 s)
    }
  } catch (e) { if (e instanceof NoNet) return choose(); console.warn('carregamento', e); }
  set('PRONTO!', 100); await wait(400);
  loading = false; window.cyberLoadingActive = false; window.cyberInGame = true;
  if (window.__keepWorld) {   // havia partida de 16 em andamento: volta para ela (o bot jogava por você)
    window.__keepWorld = false; const w = $('world3d'); gate.classList.add('hidden'); gate.dataset.started = '1';
    if (w) { w.style.cssText = ''; document.body.classList.add('world3d-open'); try { w.contentWindow.__away.end(); } catch (_) { } }
    return;
  }
  try { enterLobbyFromStart(); } catch (e) { console.warn(e); } afterLobby();
}
/* sem conexão: escolha entre repetir o carregamento (online) ou jogar offline */
function choose() {
  loading = false; window.cyberLoadingActive = true; window.cyberInGame = false;
  gate.classList.remove('ready'); gate.classList.add('loading', 'choice'); $('sgTap') && $('sgTap').classList.add('hidden'); panel.classList.remove('hidden');
  panel.innerHTML = `<div class="sg2-st">SEM CONEXÃO</div><div class="sg2-sub sg2-warn">Não foi possível conectar ao servidor. Escolha como jogar.</div>
    <div class="sg2-ch"><button type="button" id="sgOn" class="sg2-b on">MODO ONLINE<small>Tentar conectar de novo</small></button><button type="button" id="sgOff" class="sg2-b off">MODO OFFLINE<small>Só contra bots · sem progresso</small></button></div>`;
  $('sgOn').onclick = () => startLoading(); $('sgOff').onclick = () => { window.cyberLoadingActive = false; enterOffline(); };
}
/* volta para a tela de carregamento (usado pelo "Tentar de novo" e pelo aviso de conexão restabelecida) */
window.cyberReboot = function (opt = {}) {
  if (!gate) return; const w = $('world3d'); let keep = false;
  if (opt.resume !== false && w && document.body.classList.contains('world3d-open') && !window.cyberOfflineMode) {
    try { const A = w.contentWindow.__away; keep = !!(A && A.mode === 'battle' && !A.noprog && A.ongoing()); if (keep) A.start(); } catch (_) { }
  }
  if (w) { if (keep) { w.style.cssText = 'visibility:hidden;pointer-events:none;z-index:1'; window.__keepWorld = true; } else { w.src = 'about:blank'; w.classList.add('hidden'); w.style.cssText = ''; window.__keepWorld = false; } }
  document.body.classList.remove('world3d-open', 'offline-mode'); window.cyberOfflineMode = false; window.cyberInGame = false; window.cyberLoadingActive = true;
  const om = $('offMenu'); if (om) om.remove(); try { window.cyberNet.clearForced(); } catch (_) { } try { closeSheet(); } catch (_) { }
  document.querySelectorAll('.screen').forEach(sc => sc.classList.add('hidden'));
  gate.dataset.started = '0'; gate.classList.remove('hidden', 'starting', 'ready', 'loading'); build(); loading = false; startLoading();
};
function ready() {
  window.cyberBootReady = true; gate.classList.add('ready');
  const go = e => { if (!gate.classList.contains('ready') || e.target.closest && e.target.closest('.sg2-ch')) return; e.stopImmediatePropagation(); e.preventDefault(); startLoading(); };
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
