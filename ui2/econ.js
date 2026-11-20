/* CyberArena · economia 2.0
   Moedas  = comum (partidas, missões) → evoluir personagem, pacotes
   Fichas  = média (partidas, caixas, passe) → evoluir personagem, abrir Cyber/Mecha Caixa
   Gemas   = premium e raras (marcos de nível, caixas épicas) → Passe Premium, nome, câmbio, acelerar evolução
   Tudo que entra tem teto diário; tudo que sai tem preço crescente. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const E={MAXLV:20,DAY:{coins:600,fichas:35},SOFT:.2,GEM_COIN:25,GEM_FICHA:5,XCH_DAY:20,
  hp:.021,dmg:.016,spd:.005,MS:{5:{gems:3,coins:100},10:{gems:5,coins:250},15:{gems:8,coins:500},20:{gems:15,coins:1000}}};
const jget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(_){return d}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CH={nexus:'NEXUS',cyber:'CYBER',atlas:'ATLAS'};
const curChar=()=>{const c=(jget('cyberarena.identity',{})||{}).char;return CH[c]?c:'nexus'};
const remote=()=>typeof cyberRemoteMode!=='undefined'&&cyberRemoteMode;
/* ---- personagens ---- */
const chars=()=>{const c=jget('cyberarena.chars.v1',{});for(const k in CH)c[k]=Object.assign({lvl:1,xp:0,ms:[]},c[k]);return c};
const saveChars=c=>jset('cyberarena.chars.v1',c);
const costOf=L=>{const coins=Math.round(100*Math.pow(1.2,L-1)/10)*10;return{coins,fichas:Math.ceil(coins/12),xp:60+30*(L-1)}};
const statsOf=L=>({hp:Math.round(100*(1+E.hp*(L-1))),dmg:Math.round(100*(1+E.dmg*(L-1))),spd:Math.round(1000*(1+E.spd*(L-1)))/10});
const power=L=>Math.round(100+L*37+L*L*1.4);
function addCharXp(id,n){const c=chars();c[id].xp+=n;saveChars(c);}
/* ---- teto diário ---- */
const dayKey=()=>new Date(Date.now()-3*36e5).toISOString().slice(0,10);
const econ=()=>{const e=jget('cyberarena.econ.v1',{});if(e.day!==dayKey())return{day:dayKey(),coins:0,fichas:0};return e};
/* ---- recompensa por partida ---- */
const seen=new Set(jget('cyberarena.econseen',[]));
function matchReward(r){const pl=+r.placement||99,k=+r.kills||0;
  const pc=pl===1?70:pl===2?45:pl===3?35:pl<=8?20:8, pf=pl===1?6:pl<=3?3:0, px=pl===1?60:pl<=3?35:pl<=8?15:0;
  return{coins:20+pc+k*5,fichas:1+pf+Math.floor(k/2),xp:30+px+k*8,acc:pl===1?50:20};}
function applyMatch(r){
  if(remote())return; const id=String(r.matchId||'')+'|'+r.placement+'|'+r.kills; if(seen.has(id))return; seen.add(id);jset('cyberarena.econseen',[...seen].slice(-30));
  const raw=matchReward(r), e=econ(), f=(have,cap,n)=>{const room=Math.max(0,cap-have),full=Math.min(n,room);return full+Math.max(0,Math.round((n-full)*E.SOFT))};
  const coins=f(e.coins,E.DAY.coins,raw.coins), fichas=Math.max(1,f(e.fichas,E.DAY.fichas,raw.fichas));
  e.coins+=raw.coins;e.fichas+=raw.fichas;jset('cyberarena.econ.v1',e);
  const ch=CH[r.char]?r.char:curChar(); addCharXp(ch,raw.xp);
  player.coins+=coins;player.cyber_fichas+=fichas;addXP(raw.acc);saveGame();renderAll();
  const capped=e.coins>E.DAY.coins||e.fichas>E.DAY.fichas;
  setTimeout(()=>{try{startGenericRewardSequence([{kind:'coins',amount:coins},{kind:'tokens',amount:fichas},{kind:'xp',amount:raw.xp}],'PARTIDA · '+(r.placement===1?'VITÓRIA':'#'+r.placement)+(capped?' · LIMITE DIÁRIO (ganho reduzido)':''))}catch(_){}},1200);
}
addEventListener('message',ev=>{const d=ev.data;if(d&&d.type==='cyberarena:match-result'&&d.result&&!d.result.noprog&&!window.cyberOfflineMode)applyMatch(d.result)});
/* ---- evolução de personagem ---- */
function levelUp(id,useGems){
  if(remote()){showModal('EVOLUÇÃO','Indisponível','A evolução funciona no modo local por enquanto.');return}
  const c=chars(),L=c[id].lvl; if(L>=E.MAXLV)return; const k=costOf(L);
  if(c[id].xp<k.xp){showModal('EVOLUÇÃO','XP insuficiente','Jogue partidas com este personagem para encher a barra de XP.');return}
  let mc=Math.max(0,k.coins-player.coins),mf=Math.max(0,k.fichas-player.cyber_fichas),gems=0;
  if(mc||mf){ if(!useGems){showModal('EVOLUÇÃO','Recursos insuficientes','Faltam '+(mc?mc+' moedas ':'')+(mf?mf+' fichas':'')+'. Ganhe em partidas e missões, ou complete com gemas.');return}
    gems=Math.ceil(mc/E.GEM_COIN+mf/E.GEM_FICHA); if(player.gems<gems){showModal('EVOLUÇÃO','Gemas insuficientes','Você precisa de '+gems+' gemas para completar.');return} }
  player.coins-=Math.min(player.coins,k.coins);player.cyber_fichas-=Math.min(player.cyber_fichas,k.fichas);player.gems-=gems;
  c[id].xp-=k.xp;c[id].lvl=L+1;
  const ms=E.MS[L+1];let rw=[];if(ms&&!c[id].ms.includes(L+1)){c[id].ms.push(L+1);player.gems+=ms.gems;player.coins+=ms.coins;rw=[{kind:'gems',amount:ms.gems},{kind:'coins',amount:ms.coins}];}
  saveChars(c);saveGame();renderAll();celebrate(id,L,L+1,rw);
}
function celebrate(id,a,b,rw){
  let o=$('evoUp');if(!o){o=document.createElement('div');o.id='evoUp';document.body.appendChild(o);}
  const sa=statsOf(a),sb=statsOf(b);
  o.innerHTML=`<div class="eu-card"><i class="eu-ray"></i><small>${CH[id]} EVOLUIU</small><div class="eu-lv"><b>${a}</b><span>➜</span><b class="n">${b}</b></div>
   <div class="eu-st"><div><em>VIDA</em><b>${sa.hp}% ➜ ${sb.hp}%</b></div><div><em>DANO</em><b>${sa.dmg}% ➜ ${sb.dmg}%</b></div><div><em>VELOCIDADE</em><b>${sa.spd}% ➜ ${sb.spd}%</b></div></div>
   ${rw.length?`<p class="eu-ms">★ MARCO DO NÍVEL ${b}: ${rw.map(r=>'+'+r.amount+' '+(r.kind==='gems'?'GEMAS':'MOEDAS')).join(' · ')}</p>`:''}<button onclick="document.getElementById('evoUp').classList.remove('on')">CONTINUAR</button></div>`;
  o.classList.remove('on');void o.offsetWidth;o.classList.add('on');
  try{playGameSound(rw.length?'premium':'mixed',1.2);vibratePattern([40,60,90,60,40],1.3)}catch(_){}
}
window.econLevelUp=levelUp;
function renderEvo(){
  const page=document.querySelector('#characters .lc-side');if(!page)return;
  let b=$('evoBox');if(!b){b=document.createElement('div');b.id='evoBox';const ref=page.querySelector('.lc-chars');if(ref)ref.insertAdjacentElement('afterend',b);else page.appendChild(b);}
  const id=curChar(),c=chars()[id],L=c.lvl;
  const sig=[id,L,c.xp,player.coins,player.cyber_fichas,player.gems].join('|');if(b.dataset.sig===sig)return;b.dataset.sig=sig;
  const s=statsOf(L);
  if(L>=E.MAXLV){b.innerHTML=`<div class="ev-head"><b>NÍVEL ${L}</b><span class="ev-max">MÁXIMO</span></div><div class="ev-stats"><div><em>VIDA</em><b>${s.hp}%</b></div><div><em>DANO</em><b>${s.dmg}%</b></div><div><em>VELOCIDADE</em><b>${s.spd}%</b></div></div>`;return}
  const k=costOf(L),n=statsOf(L+1),okXp=c.xp>=k.xp,okC=player.coins>=k.coins,okF=player.cyber_fichas>=k.fichas;
  const mc=Math.max(0,k.coins-player.coins),mf=Math.max(0,k.fichas-player.cyber_fichas),gems=Math.ceil(mc/E.GEM_COIN+mf/E.GEM_FICHA);
  const nextMs=[5,10,15,20].find(x=>x>L);
  b.innerHTML=`<div class="ev-head"><b>NÍVEL ${L}</b><span>PODER ${power(L)}</span><em>próx. marco: nível ${nextMs} ★</em></div>
   <div class="ev-xp"><u style="width:${Math.min(100,c.xp/k.xp*100)}%"></u><i>${Math.min(c.xp,k.xp)} / ${k.xp} XP</i></div>
   <div class="ev-stats"><div><em>VIDA</em><b>${s.hp}%</b><s>➜ ${n.hp}%</s></div><div><em>DANO</em><b>${s.dmg}%</b><s>➜ ${n.dmg}%</s></div><div><em>VELOCIDADE</em><b>${s.spd}%</b><s>➜ ${n.spd}%</s></div></div>
   <div class="ev-cost"><span class="${okC?'ok':'no'}"><img src="assests/ui/coin_logo.svg" alt="">${k.coins}</span><span class="${okF?'ok':'no'}"><img src="assests/ui/token_logo.svg" alt="">${k.fichas}</span></div>
   <div class="ev-act"><button class="ev-btn" ${okXp?'':'disabled'} onclick="econLevelUp('${id}')">${okXp?'EVOLUIR':'FALTA XP'}</button>${okXp&&gems>0?`<button class="ev-gem" onclick="econLevelUp('${id}',1)"><img src="assests/ui/gem_logo.svg" alt="">COMPLETAR · ${gems}</button>`:''}</div>`;
}
/* ---- caixas ---- */
const BOX={
 mini:{name:'MINI CAIXA',coin:[8,18],fich:[1,2],bonus:2,w:[78,19,3,0],cost:null},
 cyber:{name:'CYBER CAIXA',coin:[60,110],fich:[12,22],bonus:6,w:[55,32,11,2],cost:60,pity:{epic:12}},
 mecha:{name:'MECHA CAIXA',coin:[150,250],fich:[40,60],bonus:12,w:[35,38,22,5],cost:150,pity:{epic:8,leg:30}}};
const RAR=['COMUM','RARO','ÉPICO','LENDÁRIO'];
const R=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
function roll(t){const B=BOX[t],p=jget('cyberarena.pity.v1',{});p[t]=p[t]||{e:0,l:0};
  let x=Math.random()*100,r=0,acc=0;for(let i=0;i<4;i++){acc+=B.w[i];if(x<acc){r=i;break}}
  p[t].e++;p[t].l++; if(B.pity){if(B.pity.leg&&p[t].l>=B.pity.leg&&r<3)r=3; else if(p[t].e>=B.pity.epic&&r<2)r=2;} if(r>=2)p[t].e=0; if(r>=3)p[t].l=0; jset('cyberarena.pity.v1',p); return r;}
const dayBox=()=>player.box_daily;
async function newOpenBox(type,afterComplete=null,options={}){
  const B=BOX[type];if(!B)return; if(remote())return window.__origOpenBox(type,afterComplete,options);
  resetDaily();const used=dayBox()[type]||0,inv=player.inventory?.[type]||0;let fromInv=false;
  if(inv>0){player.inventory[type]--;fromInv=true}
  else{ if(used>=BOX_DAILY_LIMIT){showModal(B.name,'Limite diário','Você já abriu '+BOX_DAILY_LIMIT+' caixas deste tipo hoje. Volte amanhã!');return}
       if(B.cost&&player.cyber_fichas<B.cost){showModal(B.name,'Fichas insuficientes','Custa '+B.cost+' Cyber Fichas. Você tem '+player.cyber_fichas+'.');return}
       if(B.cost)player.cyber_fichas-=B.cost; dayBox()[type]=used+1; }
  const r=roll(type),gc=R(...B.coin),gf=R(...B.fich);player.coins+=gc;player.cyber_fichas+=gf;
  let extraLabel='',extraType='',charXp=0;
  if(r===0){const v=Math.round(gc*.6);player.coins+=v;extraLabel='+'+v+' moedas';extraType='MOEDAS'}
  else if(r===1){const v=Math.round(gf*1.5)+B.bonus;player.cyber_fichas+=v;extraLabel='+'+v+' Cyber fichas';extraType='CYBER FICHAS';charXp=40}
  else if(r===2){const v=R(1,3);player.gems+=v;extraLabel='+'+v+' gemas';extraType='GEMAS';charXp=120}
  else{const v=R(5,10);player.gems+=v;extraLabel='+'+v+' gemas';extraType='GEMAS';charXp=300}
  if(charXp)addCharXp(curChar(),charXp);
  addXP(10);saveGame();renderAll();
  showChestOpening(type,{fromInventory:fromInv,guaranteedCoins:gc,guaranteedTokens:gf,extraLabel,extraType,extraChance:[60,30,10,2][r],charXp,rarity:r,sourceTitle:B.name+' · '+RAR[r]},afterComplete);
  const ov=$('chestOpening');ov.dataset.rarity=r;ov.dataset.go='0';let tag=$('chestRarity');if(!tag){tag=document.createElement('div');tag.id='chestRarity';ov.appendChild(tag)}tag.textContent=RAR[r];
  const ph=$('chestPhase');if(ph)ph.textContent='TOQUE NA CAIXA PARA ABRIR';
  if(options.autoStart)setTimeout(activateChestOpening,420);
}
function boxInfo(type){const B=BOX[type];if(!B)return;const d=boxData[type];
  const rows=B.w.map((w,i)=>w?`<div class="bi-r r${i}"><b>${RAR[i]}</b><i><u style="width:${w}%"></u></i><span>${w}%</span></div>`:'').join('');
  const extra=['+60% de moedas','+fichas e 40 XP de personagem','1–3 gemas e 120 XP','5–10 gemas e 300 XP'];
  showModal(B.name,B.name,`<div class="bi"><p>Sempre vem: <b>${B.coin[0]}–${B.coin[1]} moedas</b> + <b>${B.fich[0]}–${B.fich[1]} fichas</b>.</p>${rows}<p class="bi-s">${B.pity?(B.pity.epic?'Garantia: ÉPICO ou melhor a cada '+B.pity.epic+' caixas'+(B.pity.leg?'; LENDÁRIO a cada '+B.pity.leg:''):''):'Custo: grátis (5 por dia)'}</p><p class="bi-s">${B.cost?'Custo: '+B.cost+' Cyber Fichas · máx. 5 por dia':'Custo: grátis · máx. 5 por dia'}</p></div>`);
  const logo=$('modalBoxLogo'),img=$('modalBoxLogoImage');if(logo&&img&&d){img.src=d.image;logo.classList.remove('hidden')}}
const _act=window.activateChestOpening;window.activateChestOpening=function(){const o=$('chestOpening');if(o&&o.dataset.ready==='1')o.dataset.go='1';return _act.apply(this,arguments)};
window.__origOpenBox=window.openBox;window.openBox=newOpenBox;window.showBoxInfo=boxInfo;
function patchBoxCards(){
  const lab={mini:['5 grátis por dia','Comum a Épico · sempre vem moedas e fichas','GRÁTIS'],cyber:['5 por dia · 60 fichas','Raro 32% · Épico 11% · Lendário 2%','60'],mecha:['5 por dia · 150 fichas','Raro 38% · Épico 22% · Lendário 5%','150']};
  for(const t in lab){const c=$('box_'+t);if(!c)continue;const s=c.querySelector('small'),l=c.querySelector('.box-luck'),a=c.querySelector('.box-action');if(s)s.textContent=lab[t][0];if(l)l.textContent=lab[t][1];
    if(a){const left=BOX_DAILY_LIMIT-(player.box_daily[t]||0);const inv=(player.inventory?.[t]||0)>0;a.innerHTML=t==='mini'?'ABRIR · GRÁTIS':`<img src="assests/ui/token_logo.svg" class="bx-ic" alt="">${lab[t][2]}`;a.disabled=left<=0&&!inv;a.classList.toggle('poor',t!=='mini'&&player.cyber_fichas<BOX[t].cost)}}
  const n=document.querySelector('.shop-page-boxes .shop-note');if(n)n.innerHTML='<b>SEMPRE VEM EM TODAS</b><span>Moedas + Cyber fichas. Raridade maior = gemas e XP de personagem.</span>';
  const h=document.querySelector('.shop-page-boxes .shop-page-title small');if(h)h.textContent='5 por dia em cada tipo · garantia de raridade';
}
/* ---- câmbio de gemas ---- */
window.updateGemBundle=function(){const i=$('gemBundleAmount');if(!i)return;i.max=E.XCH_DAY;const g=Math.max(1,Math.min(E.XCH_DAY,+i.value||1));$('gemBundleGems').textContent=g;$('gemBundleReward').textContent=g*E.GEM_COIN+' moedas + '+g*E.GEM_FICHA+' Cyber Fichas'};
window.buyGemBundle=function(){
  const i=$('gemBundleAmount'),g=Math.max(1,Math.min(E.XCH_DAY,+i.value||1));if(remote())return;
  const x=jget('cyberarena.xch.v1',{});const used=x.day===dayKey()?x.n:0;
  if(used+g>E.XCH_DAY){showModal('CÂMBIO','Limite diário','Você pode trocar até '+E.XCH_DAY+' gemas por dia. Já trocou '+used+'.');return}
  if(player.gems<g){showModal('CÂMBIO','Gemas insuficientes','Você precisa de '+g+' gemas.');return}
  jset('cyberarena.xch.v1',{day:dayKey(),n:used+g});
  player.gems-=g;const c=g*E.GEM_COIN,f=g*E.GEM_FICHA;player.coins+=c;player.cyber_fichas+=f;saveGame();renderAll();
  startGenericRewardSequence([{kind:'coins',amount:c},{kind:'tokens',amount:f}],'CÂMBIO');window.updateGemBundle();
};
function patchExchange(){const p=document.querySelector('.shop-page-exchange');if(!p||p.dataset.v2)return;p.dataset.v2=1;
  const t=p.querySelector('.exchange-title h2');if(t)t.textContent='CÂMBIO DE GEMAS';const q=p.querySelector('.exchange-title p');if(q)q.textContent='Gemas são raras: troque só o que precisar. Limite de '+E.XCH_DAY+' por dia.';
  const c=p.querySelector('.exchange-copy p');if(c)c.textContent='1 gema = '+E.GEM_COIN+' moedas + '+E.GEM_FICHA+' Cyber Fichas.';const e=p.querySelector('.exchange-info span');if(e)e.textContent='Para evoluir mais rápido, prefira jogar: partidas dão moedas, fichas e XP.';
  const r=$('gemBundleAmount');if(r){r.max=E.XCH_DAY;r.value=1}window.updateGemBundle()}
/* ---- painel diário (no Perfil) ---- */
function renderDaily(){const host=document.querySelector('#profile .screen-safe');if(!host)return;let b=$('ecoDay');if(!b){b=document.createElement('section');b.id='ecoDay';const ref=$('mxHist');host.insertBefore(b,ref||null)}
  const e=econ(),pc=Math.min(100,e.coins/E.DAY.coins*100),pf=Math.min(100,e.fichas/E.DAY.fichas*100);
  b.innerHTML=`<h3>GANHOS DE HOJE</h3><div class="ed-row"><span><img src="assests/ui/coin_logo.svg" alt="">Moedas de partidas</span><i><u style="width:${pc}%"></u></i><b>${Math.min(e.coins,E.DAY.coins)}/${E.DAY.coins}</b></div><div class="ed-row"><span><img src="assests/ui/token_logo.svg" alt="">Fichas de partidas</span><i><u style="width:${pf}%"></u></i><b>${Math.min(e.fichas,E.DAY.fichas)}/${E.DAY.fichas}</b></div><small>Depois do limite você ainda ganha 20% do valor. Renova todo dia às 03:00.</small>`;}
const _ra=window.renderAll;window.renderAll=function(){const r=_ra.apply(this,arguments);try{patchBoxCards();patchExchange();renderDaily();if(document.querySelector('#characters:not(.hidden)')){const b=$('evoBox');if(b)b.dataset.sig='';renderEvo()}}catch(_){}return r};
setInterval(()=>{if(document.querySelector('#characters:not(.hidden)'))try{renderEvo()}catch(_){}},500);
document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('.lc-chars button')){const b=$('evoBox');if(b)b.dataset.sig='';setTimeout(renderEvo,60)}},true);
/* e-mail de boas-vindas (uma vez) */
setTimeout(()=>{try{if(remote()||localStorage.getItem('cyberarena.welcome.v1'))return;if(typeof player==='undefined'||!player)return;player.inbox=player.inbox||[];player.inbox.push({id:'welcome-'+Date.now(),type:'welcome',title:'BEM-VINDO À CYBER ARENA',createdAt:Date.now(),rewards:[{kind:'coins',amount:150},{kind:'tokens',amount:10}]});localStorage.setItem('cyberarena.welcome.v1','1');saveGame();renderAll();}catch(_){}},4000);
window.ECON=E;window.__econ={BOX,RAR,chars,costOf,statsOf,matchReward,applyMatch,roll,levelUp,curChar};
})();
