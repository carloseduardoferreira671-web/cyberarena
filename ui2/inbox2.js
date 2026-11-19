/* CyberArena · Caixa de Entrada 2.0 — vários tipos de mensagem (prêmio, código, evento, novidade, amigos, sistema…), filtros e leitura.
   Quem quiser mandar uma mensagem para o jogador usa:  pushInbox({type:'event',title:'…',body:'…',rewards:[{kind:'coins',amount:100}]}) */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const T={
 welcome:{ic:'★',c:'#35d0ff',n:'BOAS-VINDAS'},reward:{ic:'🎁',c:'#ffc83a',n:'PRÊMIO'},code:{ic:'🎟',c:'#c070ff',n:'CÓDIGO'},
 event:{ic:'⚡',c:'#ff7a2a',n:'EVENTO'},news:{ic:'📢',c:'#3aa0ff',n:'NOVIDADE'},season:{ic:'🏆',c:'#ffd45a',n:'TEMPORADA'},
 friend:{ic:'👥',c:'#35e0a1',n:'AMIGOS'},gift:{ic:'💝',c:'#ff5cb0',n:'PRESENTE'},compensation:{ic:'🛠',c:'#9fb0c8',n:'COMPENSAÇÃO'},system:{ic:'⚙',c:'#9fb0c8',n:'SISTEMA'}};
const IC={coins:'assests/ui/coin_logo.svg',tokens:'assests/ui/token_logo.svg',gems:'assests/ui/gem_logo.svg'};
const typeOf=m=>T[m.type]||(m.rewards&&m.rewards.length?T.reward:T.system);
const chip=r=>{if(r.kind==='xp')return`<span class="ib-ch"><b>XP</b>+${+r.amount||0}</span>`;
  const src=r.kind==='box'?`assests/ui/${r.boxType||'mini'}_box.png`:(IC[r.kind]||IC.coins);
  return`<span class="ib-ch"><img src="${src}" alt=""><b>${r.kind==='box'?'×'+(r.amount||1):r.amount}</b></span>`};
const ago=t=>{const d=Math.floor((Date.now()-(t||Date.now()))/864e5);return d<=0?'hoje':d===1?'ontem':'há '+d+' dias'};
let filt='all';
window.inboxFilter=f=>{filt=f;render()};
window.inboxRead=i=>{const m=(player.inbox||[])[i];if(!m)return;if(m.rewards&&m.rewards.length)return startInboxReward(i);
  try{playUISound('tap')}catch(_){}player.inbox.splice(i,1);saveGame();renderAll()};
window.inboxClearNews=()=>{player.inbox=(player.inbox||[]).filter(m=>m.rewards&&m.rewards.length);try{playUISound('tap')}catch(_){}saveGame();renderAll()};
window.pushInbox=function(m){if(typeof player==='undefined'||!player)return;player.inbox=player.inbox||[];
  player.inbox.unshift(Object.assign({id:'m-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),type:'system',createdAt:Date.now(),rewards:[]},m));saveGame();renderAll()};
function render(){
  const el=$('inboxList');if(!el||typeof player==='undefined'||!player)return;
  const all=player.inbox||[];
  if(!all.length){el.innerHTML='<div class="inbox-empty">Sua Caixa de Entrada está vazia.<small>Prêmios, códigos, eventos e novidades chegam aqui.</small></div>';return}
  const nr=all.filter(m=>m.rewards&&m.rewards.length).length,nn=all.length-nr;
  const list=all.map((m,i)=>({m,i})).filter(x=>filt==='all'||(filt==='rw'?x.m.rewards&&x.m.rewards.length:!(x.m.rewards&&x.m.rewards.length)));
  el.innerHTML=`<div class="ib-bar"><div class="ib-tabs"><button class="${filt==='all'?'on':''}" onclick="inboxFilter('all')">TODAS <i>${all.length}</i></button><button class="${filt==='rw'?'on':''}" onclick="inboxFilter('rw')">PRÊMIOS <i>${nr}</i></button><button class="${filt==='nw'?'on':''}" onclick="inboxFilter('nw')">AVISOS <i>${nn}</i></button></div>${nn?'<button class="ib-clr" onclick="inboxClearNews()">LIMPAR AVISOS</button>':''}</div>
  <div class="ib-grid">${list.map(({m,i})=>{const t=typeOf(m),has=m.rewards&&m.rewards.length,fresh=Date.now()-(m.createdAt||0)<864e5;
    return`<article class="ib-card" style="--tc:${t.c}"><div class="ib-ic">${t.ic}</div><div class="ib-bd"><div class="ib-h"><em>${t.n}</em>${fresh?'<u>NOVO</u>':''}<time>${ago(m.createdAt)}</time></div>
      <h3>${esc(m.title||'MENSAGEM')}</h3>${m.body?`<p>${esc(m.body)}</p>`:''}${has?`<div class="ib-rw">${m.rewards.map(chip).join('')}</div>`:''}</div>
      <button class="ib-go ${has?'':'read'}" onclick="inboxRead(${i})">${has?'RESGATAR':'LER ✓'}</button></article>`}).join('')||'<div class="inbox-empty">Nada nesta aba.</div>'}</div>`;
}
window.renderInbox=render;
/* mensagem de novidades (uma vez por versão) */
setTimeout(()=>{try{const K='cyberarena.news.v137';if(localStorage.getItem(K)||typeof player==='undefined'||!player||(typeof cyberRemoteMode!=='undefined'&&cyberRemoteMode))return;
  pushInbox({type:'news',title:'LOBBY NOVO NA ÁREA',body:'Nova Loja, Passe de temporada, Progressão e Caixa de Entrada. Evolua seus personagens com moedas e fichas e abra caixas com garantia de raridade.'});localStorage.setItem(K,'1')}catch(_){}},5200);
const _ra=window.renderAll;window.renderAll=function(){const r=_ra.apply(this,arguments);try{render()}catch(e){console.warn('inbox2',e)}return r};
})();
