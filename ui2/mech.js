/* CyberArena · mecânicas 2.0 — missões de verdade, histórico de partidas, estatísticas e "coletar tudo" */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const K_ST='cyberarena.stats.v1', K_MC='cyberarena.mclaim.v1';
const jget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(_){return d}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const stats=()=>Object.assign({matches:0,wins:0,kills:0,top3:0,best:0,history:[]},jget(K_ST,{}));

/* ---- registra cada partida terminada ---- */
addEventListener('message',e=>{
  const d=e.data; if(!d||d.type!=='cyberarena:match-result'||!d.result||d.result.noprog||window.cyberOfflineMode)return;
  const r=d.result, s=stats(), id=(r.matchId||'')+'|'+(r.placement)+'|'+(r.kills);
  const last=s.history[0]; if(last&&last.id===id&&Date.now()-last.t<8000)return;
  const pl=Number(r.placement)||0, k=Number(r.kills)||0;
  s.matches++; s.kills+=k; if(pl===1)s.wins++; if(pl>0&&pl<=3)s.top3++; if(!s.best||(pl>0&&pl<s.best))s.best=pl;
  s.history.unshift({id,t:Date.now(),pl,k,tr:Number(r.trophiesDelta)||0,xp:Number(r.xp)||0});
  s.history=s.history.slice(0,40); jset(K_ST,s);
  try{ if(typeof completeFirstMatchMission==='function'&&!(player.missions&&player.missions.first_match))completeFirstMatchMission(); }catch(_){}
  setTimeout(()=>{try{renderAll()}catch(_){}},300);
});

/* ---- missões ---- */
function defs(){
  const s=stats(), m=(typeof player!=='undefined'&&player.missions)||{}, mc=jget(K_MC,{}), remote=!!(typeof cyberRemoteMode!=='undefined'&&cyberRemoteMode);
  const L=[
   {id:'character',grp:'INICIAIS',ic:'i-hero',t:'Crie seu personagem',d:'Entre no jogo e escolha seu lutador.',cur:m.character_created?1:0,max:1,rw:'+100 XP · +100 gemas',claimed:!!m.character_claimed,srv:1},
   {id:'first_match',grp:'INICIAIS',ic:'i-sword',t:'Primeira partida',d:'Jogue uma Batalha até o fim.',cur:m.first_match?1:0,max:1,rw:'+100 XP',claimed:!!m.first_match_claimed,srv:1}
  ];
  if(!remote){
   L.push(
   {id:'p3',grp:'DESAFIOS',ic:'i-target',t:'Veterano',d:'Jogue 3 partidas.',cur:Math.min(3,s.matches),max:3,rw:'+150 moedas',coins:150,claimed:!!mc.p3},
   {id:'k5',grp:'DESAFIOS',ic:'i-sword',t:'Caçador',d:'Elimine 5 jogadores no total.',cur:Math.min(5,s.kills),max:5,rw:'+200 moedas · +50 XP',coins:200,xp:50,claimed:!!mc.k5},
   {id:'w1',grp:'DESAFIOS',ic:'i-trophy',t:'Campeão',d:'Vença uma Batalha (1º lugar).',cur:Math.min(1,s.wins),max:1,rw:'+10 gemas · +100 XP',gems:10,xp:100,claimed:!!mc.w1},
   {id:'t3',grp:'DESAFIOS',ic:'i-trophy',t:'Pódio',d:'Termine no Top 3 cinco vezes.',cur:Math.min(5,s.top3),max:5,rw:'+300 moedas',coins:300,claimed:!!mc.t3},
   {id:'k25',grp:'DESAFIOS',ic:'i-sword',t:'Exterminador',d:'Elimine 25 jogadores no total.',cur:Math.min(25,s.kills),max:25,rw:'+20 gemas · +150 XP',gems:20,xp:150,claimed:!!mc.k25});
  }
  L.forEach(x=>{x.done=x.cur>=x.max});
  return L;
}
async function claim(id){
  const x=defs().find(q=>q.id===id); if(!x||!x.done||x.claimed)return;
  if(x.srv){ await claimMission(id); return; }
  const mc=jget(K_MC,{}); if(mc[id])return; mc[id]=1; jset(K_MC,mc);
  const rw=[]; if(x.coins){player.coins+=x.coins;rw.push({kind:'coins',amount:x.coins});} if(x.gems){player.gems+=x.gems;rw.push({kind:'gems',amount:x.gems});}
  if(x.xp){rw.push({kind:'xp',amount:x.xp});addXP(x.xp);} saveGame(); renderAll(); startGenericRewardSequence(rw,'MISSÃO · '+x.t.toUpperCase());
}
window.mxClaim=claim;
window.mxClaimAll=async function(){ for(const x of defs()){ if(x.done&&!x.claimed){ await claim(x.id); await new Promise(r=>setTimeout(r,x.srv?700:150)); } } };
window.renderMissions=function(){
  const el=$('missionsList'); if(!el)return; const L=defs();
  const pend=L.filter(x=>x.done&&!x.claimed).length, tot=L.length, got=L.filter(x=>x.claimed).length;
  let html=`<div class="mx-top"><div class="mx-sum"><b>${got}/${tot}</b><span>MISSÕES COLETADAS</span><i><u style="width:${tot?got/tot*100:0}%"></u></i></div><button class="mx-all" ${pend?'':'disabled'} onclick="mxClaimAll()">COLETAR TUDO${pend?` (${pend})`:''}</button></div>`;
  ['INICIAIS','DESAFIOS'].forEach(g=>{ const part=L.filter(x=>x.grp===g); if(!part.length)return;
    html+=`<div class="mx-grp">${g}</div><div class="mx-grid">`+part.map(x=>{
      const st=x.claimed?'claimed':x.done?'ready':'prog', pct=Math.round(x.cur/x.max*100);
      return `<div class="mx-card ${st}"><div class="mx-ic"><svg class="ic"><use href="#${x.ic}"/></svg></div><div class="mx-body"><b>${esc(x.t)}</b><span>${esc(x.d)}</span><div class="mx-bar"><u style="width:${pct}%"></u><em>${x.cur}/${x.max}</em></div><small>${esc(x.rw)}</small></div>
      <div class="mx-act">${x.claimed?'<span class="mx-st ok">✓ COLETADA</span>':x.done?`<button class="mx-btn" onclick="mxClaim('${x.id}')">COLETAR</button>`:'<span class="mx-st">EM ANDAMENTO</span>'}</div></div>`;}).join('')+`</div>`; });
  el.innerHTML=html;
};

/* ---- histórico + estatísticas no Perfil ---- */
function renderHistory(){
  const host=document.querySelector('#profile .screen-safe'); if(!host)return;
  let box=$('mxHist'); if(!box){box=document.createElement('section');box.id='mxHist';host.appendChild(box);}
  const s=stats(), wr=s.matches?Math.round(s.wins/s.matches*100):0, kd=s.matches?(s.kills/s.matches).toFixed(1):'0.0';
  const ago=t=>{const m=Math.round((Date.now()-t)/60000);return m<1?'agora':m<60?m+' min':m<1440?Math.round(m/60)+' h':Math.round(m/1440)+' d'};
  box.innerHTML=`<h3>HISTÓRICO DE PARTIDAS</h3><div class="mx-stats"><div><b>${s.matches}</b><span>PARTIDAS</span></div><div><b>${s.wins}</b><span>VITÓRIAS</span></div><div><b>${wr}%</b><span>TAXA DE VITÓRIA</span></div><div><b>${s.kills}</b><span>ABATES</span></div><div><b>${kd}</b><span>ABATES/PARTIDA</span></div><div><b>${s.best?'#'+s.best:'—'}</b><span>MELHOR POSIÇÃO</span></div></div>`+
   (s.history.length?`<div class="mx-hist">`+s.history.slice(0,12).map(h=>`<div class="mx-row ${h.pl===1?'win':h.pl<=3?'top':''}"><b class="pl">#${h.pl}</b><span>${h.pl===1?'Vitória':h.pl<=3?'Top 3':'Batalha'}</span><span>${h.k} abates</span><span class="tr ${h.tr>=0?'up':'dn'}">${h.tr>=0?'+':''}${h.tr} 🏆</span><em>${ago(h.t)}</em></div>`).join('')+`</div>`:`<p class="mx-empty">Nenhuma partida ainda. Jogue uma Batalha e ela aparece aqui.</p>`);
}

/* ---- passe: coletar tudo ---- */
async function passAll(){
  const lv=player.pass_level; for(let i=1;i<=lv;i++){ if(!player.pass_claimed.includes(i)){ await claimPassReward(i); await new Promise(r=>setTimeout(r,500)); } if(player.premium_pass&&!player.premium_claimed.includes(i)){ await claimPremiumReward(i); await new Promise(r=>setTimeout(r,500)); } }
}
window.mxPassAll=passAll;
function passBtn(){
  const head=document.querySelector('#pass .pass-head'); if(!head)return; let b=$('mxPassAll');
  if(!b){b=document.createElement('button');b.id='mxPassAll';b.className='mx-all';b.textContent='COLETAR TUDO';b.onclick=()=>passAll();document.body.contains(head)&&head.appendChild(b);}
  let n=0; try{for(let i=1;i<=player.pass_level;i++){ if(!player.pass_claimed.includes(i))n++; if(player.premium_pass&&!player.premium_claimed.includes(i))n++; }}catch(_){}
  b.disabled=!n; b.textContent=n?`COLETAR TUDO (${n})`:'COLETAR TUDO';
}

/* ---- selo de novidade nos botões laterais ---- */
function badges(){
  const n=defs().filter(x=>x.done&&!x.claimed).length;
  document.querySelectorAll('.l2-rail button').forEach(b=>{ if(/openScreen\('missions'\)/.test(b.getAttribute('onclick')||'')){ let q=b.querySelector('.mx-dot'); if(!q){q=document.createElement('i');q.className='mx-dot';b.appendChild(q);} q.textContent=n||''; q.style.display=n?'grid':'none'; } });
}
function autoChar(){ try{ if(typeof player!=='undefined'&&player&&!(player.missions&&player.missions.character_created)&&typeof completeCharacterCreationMission==='function'&&document.querySelector('#lobby:not(.hidden)')) completeCharacterCreationMission(); }catch(_){} }

const _ra=window.renderAll;
window.renderAll=function(){ const r=_ra.apply(this,arguments); try{renderHistory();passBtn();badges();}catch(_){} return r; };
setTimeout(()=>{autoChar();try{window.renderAll()}catch(_){}},1500);
setInterval(autoChar,6000);
})();
