/* CyberArena · tela de MODOS / MAPAS (estilo Brawl Stars / Free Fire).
   Para adicionar um mapa ou modo novo: acrescente UMA entrada em MODES (abaixo) e coloque a capa em assests/modes/.
   - id     : o modo que o jogo entende (battle | open | space | train | soccer_gold | soccer_blue). Vários mapas podem usar o mesmo id no futuro.
   - cover  : foto do próprio mapa (16:9, de preferência 1280×720 .webp).                                           */
export const MODES = [
  { id: 'battle', map: 'Vale da Casona', name: 'BATALHA', tag: 'ÚLTIMO DE PÉ', players: '16 JOGADORES', btn: 'ESCOLHER', cover: 'assests/modes/battle.webp', accent: '#ff3d5a',
    desc: 'Um vale de rios, florestas e acampamentos ao redor de uma casona de cúpula verde. 16 jogadores entram na arena e só um fica de pé.',
    chips: ['6 MIN', 'TROFÉUS + XP', 'BOTS COMPLETAM'] },
  { id: 'open', map: 'Vale da Casona', name: 'MUNDO ABERTO', tag: 'SOCIAL · SEM COMBATE', players: 'ATÉ 16 JOGADORES', btn: 'ESCOLHER', cover: 'assests/modes/open.webp', accent: '#35e0a1',
    desc: 'O mesmo vale, sem luta. Passeie pela casona, pelas pontes e pelos acampamentos e encontre outros jogadores com calma.',
    chips: ['CHAT', 'EMOTES', 'SEM PRESSA'] },
  { id: 'space', map: 'Espaço de Treino', name: 'TREINO', tag: 'TESTE DE PODERES', players: 'ONLINE · TREINO', btn: 'ESCOLHER', cover: 'assests/modes/space.webp', accent: '#58a6ff',
    desc: 'Uma plataforma flutuante entre estrelas, cristais e ilhas no espaço. Um lugar tranquilo para treinar, sem pressa e sem pontuação.',
    chips: ['4 ALVOS', 'ENERGIA RÁPIDA', 'SEM RISCO'] },
  { id: 'soccer_gold', map: 'Estádio Dourado', name: 'FUTEBOL', tag: 'PÔR DO SOL', players: 'ATÉ 16 JOGADORES', btn: 'ESCOLHER', cover: 'assests/modes/soccer_gold.webp', accent: '#ffb020',
    desc: 'Um estádio ao pôr do sol, com torcida, refletores e placar 3D. Entre numa sala com quem já está lá. Bola com física de verdade: carregue o chute, dê efeito e bata pênaltis contra o goleiro.',
    chips: ['ONLINE', 'FÍSICA DA BOLA', 'PÊNALTIS'] },
  { id: 'soccer_blue', map: 'Estádio Azul', name: 'FUTEBOL', tag: 'NOITE', players: 'ATÉ 16 JOGADORES', btn: 'ESCOLHER', cover: 'assests/modes/soccer_blue.webp', accent: '#38b6ff',
    desc: 'O mesmo campo numa noite fria sob luzes azuis. Entre numa sala com quem já está lá. Chute, passe, cruze e bata pênaltis com o goleiro bot.',
    chips: ['ONLINE', 'FÍSICA DA BOLA', 'PÊNALTIS'] },
];

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = S => MODES.find(m => m.id === S.mode) || MODES[0];

export function initModes({ S, renderMode }) {
  const card = $('modeCard'); if (!card || $('modesScreen')) return;
  /* botão do lobby: mostra o modo atual com a capa; toque abre a tela de modos */
  const btn = document.createElement('button'); btn.id = 'mcModeBtn'; btn.type = 'button'; btn.className = 'mm-btn';
  card.querySelector('.mc-tabs')?.after(btn);
  /* tela cheia de modos */
  const scr = document.createElement('div'); scr.id = 'modesScreen'; scr.className = 'mm-screen hidden'; scr.setAttribute('role', 'dialog'); scr.setAttribute('aria-label', 'Modos de jogo');
  document.body.appendChild(scr);
  const cardHTML = m => `<article class="mm-card" data-id="${m.id}" style="--ac:${m.accent}" tabindex="0">
      <div class="mm-cover"><img src="${esc(m.cover)}" alt="Mapa ${esc(m.map)}" loading="lazy" draggable="false"><i class="mm-fade"></i><span class="mm-players">${esc(m.players)}</span><span class="mm-on">ESCOLHIDO</span></div>
      <div class="mm-info"><small>${esc(m.map)} · ${esc(m.tag)}</small><h3>${esc(m.name)}</h3><p>${esc(m.desc)}</p>
      <div class="mm-chips">${m.chips.map(c => `<span>${esc(c)}</span>`).join('')}</div>
      <button class="mm-go" type="button">${esc(m.btn)}</button></div></article>`;
  scr.innerHTML = `<div class="mm-top"><div><small>ESCOLHA ONDE JOGAR</small><h2>MODOS</h2></div><button class="mm-x" type="button" aria-label="Fechar">✕</button></div>
    <div class="mm-row" id="mmRow">${MODES.map(cardHTML).join('')}<div class="mm-soon"><b>+</b><span>MAIS MAPAS EM BREVE</span></div></div>`;
  scr.querySelectorAll('img').forEach(i => i.addEventListener('error', () => i.remove()));   // sem capa: fica o degradê do modo
  const open = () => { scr.classList.remove('hidden'); refresh(); const on = scr.querySelector('.mm-card.on'); on?.scrollIntoView({ inline: 'center', block: 'nearest' }); try { window.playUISound?.('open'); } catch (_) { } };
  const close = () => scr.classList.add('hidden');
  const pick = id => { S.mode = id; localStorage.setItem('cyberarena.mode', id); renderMode(); refresh(); };
  function refresh() {
    const m = cur(S);
    btn.style.setProperty('--ac', m.accent);
    btn.innerHTML = `<span class="mm-th">${m.cover ? `<img src="${esc(m.cover)}" alt="" draggable="false">` : ''}</span><span class="mm-bt"><small>MODO · ${esc(m.map)}</small><b>${esc(m.name)}</b></span><span class="mm-chg">›</span>`;
    btn.querySelector('img')?.addEventListener('error', e => e.target.remove());
    scr.querySelectorAll('.mm-card').forEach(c => { const on = c.dataset.id === S.mode; c.classList.toggle('on', on); const g = c.querySelector('.mm-go'); if (g) g.textContent = on ? 'ESCOLHIDO ✓' : 'ESCOLHER'; });
  }
  btn.onclick = open; scr.querySelector('.mm-x').onclick = close;
  scr.addEventListener('pointerdown', e => { if (e.target === scr) close(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !scr.classList.contains('hidden')) close(); });
  scr.querySelectorAll('.mm-card').forEach(c => {
    c.addEventListener('click', e => {
      if (e.target.closest('.mm-go')) { pick(c.dataset.id); close(); return; }
      c.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });   // tocar no cartão só centraliza; quem escolhe é o botão ESCOLHER
    });
  });
  window.__modesRefresh = refresh; refresh();
}
