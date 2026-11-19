/* CyberArena · Passe 2.0 e Progressão 2.0 — quadro de temporada: recompensa grátis em cima, premium embaixo, nível no meio.
   Camada nova por cima: o HTML antigo fica escondido e as funções de coletar do main.js continuam as mesmas. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const snd=n=>{try{playUISound(n)}catch(_){}};
const IMG={mini:'assests/ui/mini_box.png',cyber:'assests/ui/cyber_box.png',mecha:'assests/ui/mecha_box.png',coin:'assests/ui/coin_logo.svg',token:'assests/ui/token_logo.svg',gem:'assests/ui/gem_logo.svg'};
const COL={coin:'#ffc83a',token:'#35d0ff',gem:'#c070ff',mini:'#35e0a1',cyber:'#3aa0ff',mecha:'#ff7a2a'};
/* descreve uma recompensa em texto: ícones, número grande e nome pequeno */
function describe(r){
  r=String(r);
  if(r.includes('+')){const p=r.split('+').map(x=>describe(x.trim()));return{imgs:p.flatMap(x=>x.imgs),big:p.map(x=>x.big).join('+'),small:p.map(x=>x.small).join(' + '),k:p[0].k,combo:true}}
  let m;
  if((m=r.match(/(\d+)\s*(?:CYBER\s+)?FICHAS/)))return{imgs:[IMG.token],big:m[1],small:'FICHAS',k:'token'};
  if((m=r.match(/(\d+)\s*GEMAS/)))return{imgs:[IMG.gem],big:m[1],small:'GEMAS',k:'gem'};
  if((m=r.match(/(\d+)\s*MOEDAS/)))return{imgs:[IMG.coin],big:m[1],small:'MOEDAS',k:'coin'};
  const t=/MECHA/.test(r)?'mecha':/CYBER/.test(r)?'cyber':'mini';
  m=r.match(/^(\d+)/);return{imgs:[IMG[t]],big:'×'+(m?m[1]:1),small:t.toUpperCase()+' CAIXA',k:t,box:true};
}
function card(level,reward,st,kind){ // st: 'locked' | 'ready' | 'done' | 'vip'
  const d=describe(reward),claim=kind==='free'?'claimPassReward':kind==='prem'?'claimPremiumReward':'claimAccountReward';
  const act=st==='ready'?`onclick="${claim}(${level})"`:'';
  return `<div class="p2c ${st} ${d.box?'box':''} ${d.combo?'combo':''}" style="--k:${COL[d.k]}" ${act}>
    <div class="p2c-i">${d.imgs.map(s=>`<img src="${s}" alt="">`).join('')}</div>
    <b>${esc(d.big)}</b><small>${esc(d.small)}</small>
    ${st==='ready'?'<span class="p2c-go">COLETAR</span>':st==='done'?'<i class="p2c-ok">✓</i>':st==='vip'?'<i class="p2c-lk">★</i>':'<i class="p2c-lk">🔒</i>'}</div>`;
}
const jump=(sc,lv,smooth)=>{const el=sc&&sc.querySelector(`[data-lv="${lv}"]`);if(el)sc.scrollTo({left:Math.max(0,el.offsetLeft-sc.clientWidth*.28),behavior:smooth?'smooth':'auto'})};

/* ================= PASSE ================= */
function buildPass(){
  const host=document.querySelector('#pass .screen-safe');if(!host)return null;let r=$('p2');
  if(!r){r=document.createElement('div');r.id='p2';r.className='p2';host.appendChild(r);host.classList.add('p2-host')}
  return r;
}
let passSig='';
function renderPass2(force){
  if(typeof player==='undefined'||!player||typeof PASS_LEVELS==='undefined')return;
  const r=buildPass();if(!r)return;
  const sig=[player.pass_level,player.pass_xp,player.pass_claimed.length,player.premium_claimed.length,player.premium_pass,player.gems>=(typeof PREMIUM_PRICE!=='undefined'?PREMIUM_PRICE:100)].join('|');
  if(!force&&sig===passSig)return;passSig=sig;
  const old=r.querySelector('.p2-sc'),keep=old?old.scrollLeft:null;
  const L=player.pass_level,prem=!!player.premium_pass,pct=Math.min(100,(player.pass_xp||0)/PASS_XP*100);
  let freeN=0,premN=0;for(let i=1;i<=L;i++){if(!player.pass_claimed.includes(i))freeN++;if(prem&&!player.premium_claimed.includes(i))premN++}
  let cols='';
  for(let i=1;i<=PASS_LEVELS;i++){
    const fs=player.pass_claimed.includes(i)?'done':i<=L?'ready':'locked';
    const ps=!prem?'vip':player.premium_claimed.includes(i)?'done':i<=L?'ready':'locked';
    const big=i%5===0;
    cols+=`<div class="p2col ${i<=L?'reach':''} ${i===L?'cur':''} ${big?'big':''}" data-lv="${i}">${card(i,passRewardFor(i),fs,'free')}<div class="p2n"><i>${i}</i></div>${card(i,passPremiumRewardFor(i),ps,'prem')}</div>`;
  }
  r.innerHTML=`<div class="p2-top"><div class="p2-lv"><div class="p2-hex"><span>NÍVEL</span><b>${L}</b></div></div>
    <div class="p2-xp"><small>TEMPORADA · TRIPLE XP</small><div class="p2-bar"><u style="width:${pct}%"></u><em>${player.pass_xp||0} / ${PASS_XP} XP</em></div></div>
    <button class="p2-b ghost" onclick="showPassTotals()">TOTAIS</button>
    <button class="p2-b gold" ${freeN+premN?'':'disabled'} onclick="mxPassAll()">COLETAR TUDO${freeN+premN?' ('+(freeN+premN)+')':''}</button>
    ${prem?'<span class="p2-vip on">★ PREMIUM ATIVO</span>':`<button class="p2-b vip" onclick="buyPremiumPass()">★ PREMIUM · ${typeof PREMIUM_PRICE!=='undefined'?PREMIUM_PRICE:100} <img src="${IMG.gem}" alt=""></button>`}</div>
   <div class="p2-board"><div class="p2-side"><div class="p2-lab free"><b>GRÁTIS</b><small>todos</small></div><button class="p2-lab mid p2-me" title="Ir para o meu nível">⌖ MEU NÍVEL</button><div class="p2-lab prem"><b>PREMIUM</b><small>${prem?'ativo':'★ bloqueado'}</small></div></div>
   <div class="p2-sc">${cols}</div><button class="p2-nav l" aria-label="Voltar">‹</button><button class="p2-nav r" aria-label="Avançar">›</button></div>`;
  const sc=r.querySelector('.p2-sc');
  const step=()=>sc.clientWidth*.75;
  r.querySelector('.p2-nav.l').onclick=()=>sc.scrollBy({left:-step(),behavior:'smooth'});r.querySelector('.p2-nav.r').onclick=()=>sc.scrollBy({left:step(),behavior:'smooth'});
  r.querySelector('.p2-me').onclick=()=>jump(sc,Math.max(1,L),true);
  if(keep===null)setTimeout(()=>jump(sc,Math.max(1,L),false),30);else sc.scrollLeft=keep;
}

/* ================= PROGRESSÃO ================= */
let accStart=null,accSig='';
function buildProg(){
  const host=document.querySelector('#progress .screen-safe');if(!host)return null;let r=$('pg2');
  if(!r){r=document.createElement('div');r.id='pg2';r.className='p2 pg2';host.appendChild(r);host.classList.add('p2-host')}
  return r;
}
async function claimAllAcc(){const lv=player.level;for(let i=1;i<=lv;i++){if(!player.account_claimed.includes(i)){await claimAccountReward(i);await new Promise(r=>setTimeout(r,500))}}}
window.pg2All=claimAllAcc;
function renderProg2(force){
  if(typeof player==='undefined'||!player||typeof accountRewardFor!=='function')return;
  const r=buildProg();if(!r)return;
  const L=player.level||1;if(accStart===null)accStart=Math.max(1,Math.floor((L-1)/40)*40+1);
  const sig=[L,player.xp,player.account_claimed.length,accStart].join('|');
  if(!force&&sig===accSig)return;accSig=sig;
  const need=typeof ACCOUNT_XP!=='undefined'?ACCOUNT_XP:200,pct=Math.min(100,(player.xp||0)/need*100);
  let n=0;for(let i=1;i<=L;i++)if(!player.account_claimed.includes(i))n++;
  let next=null;for(let i=L+1;i<=1000;i++){const t=accountRewardFor(i);if(/CAIXA|MINI|CYBER\s*$|MECHA|GEMAS/.test(t)&&!/FICHAS|MOEDAS/.test(t)){next=[i,t];break}}
  const end=Math.min(1000,accStart+39);let cols='';
  for(let i=accStart;i<=end;i++){const st=player.account_claimed.includes(i)?'done':i<=L?'ready':'locked';
    cols+=`<div class="p2col one ${i<=L?'reach':''} ${i===L?'cur':''} ${i%10===0?'big':''}" data-lv="${i}">${card(i,accountRewardFor(i),st,'acc')}<div class="p2n"><i>${i}</i></div></div>`}
  r.innerHTML=`<div class="p2-top"><div class="p2-lv"><div class="p2-hex"><span>NÍVEL</span><b>${L}</b></div></div>
    <div class="p2-xp"><small>CONTA · ${need} XP POR NÍVEL · ATÉ O NÍVEL 1000</small><div class="p2-bar"><u style="width:${pct}%"></u><em>${player.xp||0} / ${need} XP</em></div>
    ${next?`<div class="p2-next">PRÓXIMA CAIXA: <b>nível ${next[0]}</b> · ${esc(next[1])}</div>`:''}</div>
    <button class="p2-b gold" ${n?'':'disabled'} onclick="pg2All()">COLETAR TUDO${n?' ('+n+')':''}</button></div>
   <div class="p2-board one"><div class="p2-side"><div class="p2-lab free"><b>RECOMPENSA</b><small>por nível</small></div><div class="p2-lab mid">NÍVEL</div></div>
   <div class="p2-sc">${cols}</div><button class="p2-nav l" aria-label="Voltar">‹</button><button class="p2-nav r" aria-label="Avançar">›</button>
   <div class="p2-pages"><button class="pgl" ${accStart<=1?'disabled':''}>◀ ${accStart>1?Math.max(1,accStart-40)+'–'+(accStart-1):'INÍCIO'}</button><button class="p2-me">MEU NÍVEL</button><button class="pgr" ${end>=1000?'disabled':''}>${end+1}–${Math.min(1000,end+40)} ▶</button></div></div>`;
  const sc=r.querySelector('.p2-sc'),step=()=>sc.clientWidth*.75;
  r.querySelector('.p2-nav.l').onclick=()=>sc.scrollBy({left:-step(),behavior:'smooth'});r.querySelector('.p2-nav.r').onclick=()=>sc.scrollBy({left:step(),behavior:'smooth'});
  r.querySelector('.pgl').onclick=()=>{accStart=Math.max(1,accStart-40);renderProg2(true)};r.querySelector('.pgr').onclick=()=>{accStart=Math.min(961,accStart+40);renderProg2(true)};
  r.querySelector('.p2-me').onclick=()=>{const ns=Math.max(1,Math.floor((L-1)/40)*40+1);if(ns!==accStart){accStart=ns;renderProg2(true);setTimeout(()=>jump($('pg2').querySelector('.p2-sc'),L,true),50)}else jump(sc,L,true)};
  setTimeout(()=>jump(sc,accStart<=L&&L<=end?L:accStart,false),30);
}
window.renderPass2=renderPass2;window.renderProg2=renderProg2;
const _ra=window.renderAll;window.renderAll=function(){const r=_ra.apply(this,arguments);try{renderPass2();renderProg2()}catch(e){console.warn('pass2',e)}return r};
setTimeout(()=>{try{renderPass2(true);renderProg2(true)}catch(e){console.warn(e)}},1000);
})();
