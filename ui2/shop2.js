/* CyberArena · Loja 2.0 — cartões de caixa, tela de chances, aba Recursos / câmbio.
   Carrega DEPOIS do econ.js. Os elementos originais ficam escondidos (main.js ainda os atualiza); aqui só se adiciona uma camada nova. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const jget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(_){return d}};
const E=()=>window.ECON||{},X=()=>window.__econ||{};
const TIER={mini:{c:'#35e0a1',tag:'GRÁTIS'},cyber:{c:'#3aa0ff',tag:'RARA'},mecha:{c:'#ff7a2a',tag:'ÉPICA'}};
const RC=['#9fb0c8','#3aa0ff','#b05cff','#ffb020'];
const IMG={mini:'assests/ui/mini_box.png',cyber:'assests/ui/cyber_box.png',mecha:'assests/ui/mecha_box.png'};
const LIM=()=>typeof BOX_DAILY_LIMIT!=='undefined'?BOX_DAILY_LIMIT:5;
const snd=n=>{try{playUISound(n)}catch(_){}};

/* ---------- aba CAIXAS ---------- */
function boxCards(){
  const B=X().BOX,RAR=X().RAR;if(!B||typeof player==='undefined'||!player)return;
  const pity=jget('cyberarena.pity.v1',{});
  for(const t in B){
    const card=$('box_'+t);if(!card)continue;const b=B[t];
    const used=(player.box_daily&&player.box_daily[t])||0,inv=(player.inventory&&player.inventory[t])||0,left=Math.max(0,LIM()-used);
    const p=pity[t]||{e:0,l:0};
    const sig=[used,inv,player.cyber_fichas,p.e,p.l].join('|');
    let L=card.querySelector('.bx2');if(L&&L.dataset.sig===sig)continue;
    if(!L){L=document.createElement('div');L.className='bx2';card.appendChild(L);card.classList.add('bx2c');card.style.setProperty('--tc',TIER[t].c)}
    L.dataset.sig=sig;
    const pips=Array.from({length:LIM()},(_,i)=>`<i class="${i<left?'on':''}"></i>`).join('');
    const rar=b.w.map((w,i)=>w?`<span style="--rc:${RC[i]}"><b>${w}%</b>${RAR[i].slice(0,3)}</span>`:`<span class="off" style="--rc:${RC[i]}"><b>—</b>${RAR[i].slice(0,3)}</span>`).join('');
    let pt='';
    if(b.pity){const pe=Math.min(100,p.e/b.pity.epic*100);pt=`<div class="bx-pity"><label>GARANTIA ÉPICO</label><i><u style="width:${pe}%;--rc:${RC[2]}"></u></i><em>${Math.min(p.e,b.pity.epic)}/${b.pity.epic}</em></div>`;
      if(b.pity.leg){const pl=Math.min(100,p.l/b.pity.leg*100);pt+=`<div class="bx-pity"><label>GARANTIA LENDÁRIO</label><i><u style="width:${pl}%;--rc:${RC[3]}"></u></i><em>${Math.min(p.l,b.pity.leg)}/${b.pity.leg}</em></div>`}}
    else pt=`<div class="bx-pity free"><label>SEMPRE GRÁTIS</label><em>renova todo dia</em></div>`;
    const poor=t!=='mini'&&inv<=0&&player.cyber_fichas<b.cost,out=left<=0&&inv<=0;
    const price=inv>0?`<span class="bx-inv">USAR 1 DO ESTOQUE (${inv})</span>`:t==='mini'?'ABRIR · GRÁTIS':`<img src="assests/ui/token_logo.svg" alt="">${b.cost}`;
    L.innerHTML=`<div class="bx-top"><em class="bx-tag">${TIER[t].tag}</em><button class="bx-q" aria-label="Chances" onclick="event.stopPropagation();showBoxInfo('${t}')">?</button></div>
      <div class="bx-art"><i class="bx-glow"></i><img src="${IMG[t]}" alt=""></div>
      <h3>${b.name}</h3>
      <div class="bx-rar">${rar}</div>
      <div class="bx-pips"><span>HOJE</span>${pips}<em>${left}/${LIM()}</em></div>${pt}
      <button class="bx-go ${poor?'poor':''}" ${out?'disabled':''} onclick="event.stopPropagation();openBox('${t}')">${out?'VOLTE AMANHÃ':price}</button>`;
  }
  /* banner de gemas grátis vai para a linha do título */
  const head=document.querySelector('.shop-page-boxes .shop-page-title'),g=$('gem_free_offer');
  if(head&&g&&g.parentNode!==head){head.appendChild(g);g.classList.add('gf-inline')}
}

/* ---------- tela de chances ---------- */
window.showBoxInfo=function(t){
  const B=X().BOX,RAR=X().RAR;if(!B||!B[t])return;const b=B[t];
  const gain=[`+60% de moedas`,`+fichas · 40 XP de personagem`,`1–3 gemas · 120 XP`,`5–10 gemas · 300 XP`];
  let o=$('bxInfo');if(!o){o=document.createElement('div');o.id='bxInfo';document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('on')})}
  const rows=b.w.map((w,i)=>`<div class="bi2-r ${w?'':'off'}" style="--rc:${RC[i]}"><b>${RAR[i]}</b><i><u style="width:${w}%"></u></i><span>${w?w+'%':'—'}</span><small>${gain[i]}</small></div>`).join('');
  const g=b.pity?`Garantia: <b>ÉPICO ou melhor a cada ${b.pity.epic} caixas</b>${b.pity.leg?` · <b>LENDÁRIO a cada ${b.pity.leg}</b>`:''}. O contador só zera quando sai.`:`Grátis: ${LIM()} por dia. Quanto mais você joga, mais fichas ganha para abrir as outras caixas.`;
  o.style.setProperty('--tc',TIER[t].c);
  o.innerHTML=`<div class="bi2"><button class="bi2-x" onclick="document.getElementById('bxInfo').classList.remove('on')">✕</button>
    <div class="bi2-l"><div class="bx-art big"><i class="bx-glow"></i><img src="${IMG[t]}" alt=""></div><h3>${b.name}</h3>
      <p>Sempre vem<br><b>${b.coin[0]}–${b.coin[1]}</b> <img src="assests/ui/coin_logo.svg" alt=""> + <b>${b.fich[0]}–${b.fich[1]}</b> <img src="assests/ui/token_logo.svg" alt=""></p></div>
    <div class="bi2-r0"><h4>CHANCES POR RARIDADE</h4>${rows}<p class="bi2-g">${g}</p>
      <div class="bi2-act"><button class="bi2-c" onclick="document.getElementById('bxInfo').classList.remove('on')">FECHAR</button><button class="bi2-o" onclick="document.getElementById('bxInfo').classList.remove('on');openBox('${t}')">${t==='mini'?'ABRIR · GRÁTIS':'ABRIR · '+b.cost+' FICHAS'}</button></div></div></div>`;
  o.classList.remove('on');void o.offsetWidth;o.classList.add('on');snd('open');
};

/* ---------- aba RECURSOS ---------- */
function resources(){
  const p=document.querySelector('.shop-page-exchange');if(!p||typeof player==='undefined'||!player)return;
  const e=E();if(!e.XCH_DAY)return;
  const x=jget('cyberarena.xch.v1',{}),dk=(()=>{try{return new Date(Date.now()-3*36e5).toISOString().slice(0,10)}catch(_){return ''}})();
  const used=x.day===dk?(x.n||0):0,rest=Math.max(0,e.XCH_DAY-used);
  const sig=[player.coins,player.cyber_fichas,player.gems,used].join('|');
  let r=p.querySelector('.rs2');if(r&&r.dataset.sig===sig)return;
  const keep=r&&$('gemBundleAmount')?+$('gemBundleAmount').value:1;
  if(!r){[...p.children].forEach(c=>c.style.display='none');r=document.createElement('div');r.className='rs2';p.appendChild(r)}
  r.dataset.sig=sig;
  const T=(cls,ic,nm,val,use)=>`<div class="rs-t ${cls}"><img src="assests/ui/${ic}" alt=""><div><small>${nm}</small><b>${val}</b><em>${use}</em></div></div>`;
  r.innerHTML=`<div class="rs-l"><h2>RECURSOS</h2>
    ${T('c','coin_logo.svg','MOEDAS',player.coins,'Evoluir personagens e Passe')}
    ${T('f','token_logo.svg','CYBER FICHAS',player.cyber_fichas,'Abrir caixas e evoluir')}
    ${T('g','gem_logo.svg','GEMAS',player.gems,'Passe Premium, nome e câmbio')}
    <p>Para crescer mais rápido, <b>jogue partidas</b>: elas dão moedas, fichas e XP.</p></div>
  <div class="rs-r"><div class="rs-h"><div><h2>CÂMBIO DE GEMAS</h2><small>1 gema = ${e.GEM_COIN} moedas + ${e.GEM_FICHA} fichas</small></div><span class="rs-lim ${rest?'':'no'}">HOJE: <b>${rest}</b>/${e.XCH_DAY}</span></div>
    <div class="rs-chips">${[1,5,10,20].map(n=>`<button onclick="rsSet(${n})">${n}</button>`).join('')}<button onclick="rsSet(${Math.max(1,Math.min(rest,player.gems))})">MÁX</button></div>
    <div class="range-row rs-sl"><input id="gemBundleAmount" type="range" min="1" max="${e.XCH_DAY}" value="${Math.min(e.XCH_DAY,Math.max(1,keep))}" oninput="updateGemBundle()"><b><span id="gemBundleGems">1</span> <img src="assests/ui/gem_logo.svg" alt=""></b></div>
    <div class="rs-flow"><div class="rs-g"><img src="assests/ui/gem_logo.svg" alt=""><b id="rsG">1</b></div><i>➜</i><div class="rs-o"><span><img src="assests/ui/coin_logo.svg" alt=""><b id="rsC">25</b></span><span><img src="assests/ui/token_logo.svg" alt=""><b id="rsF">5</b></span></div></div>
    <strong id="gemBundleReward" style="display:none"></strong>
    <button class="rs-go" ${rest&&player.gems?'':'disabled'} onclick="buyGemBundle()">${rest?(player.gems?'TROCAR':'SEM GEMAS'):'LIMITE DO DIA ATINGIDO'}</button></div>`;
  window.updateGemBundle();
}
window.rsSet=n=>{const i=$('gemBundleAmount');if(i){i.value=n;window.updateGemBundle();snd('tap')}};
const _ug=window.updateGemBundle;
window.updateGemBundle=function(){_ug&&_ug.apply(this,arguments);const i=$('gemBundleAmount'),e=E();if(!i||!e.GEM_COIN)return;const g=Math.max(1,Math.min(e.XCH_DAY,+i.value||1));
  const s=(id,v)=>{const el=$(id);if(el)el.textContent=v};s('rsG',g);s('rsC',g*e.GEM_COIN);s('rsF',g*e.GEM_FICHA);s('gemBundleGems',g)};

const _ra=window.renderAll;window.renderAll=function(){const r=_ra.apply(this,arguments);try{boxCards();resources()}catch(e){console.warn('shop2',e)}return r};
setTimeout(()=>{try{boxCards();resources()}catch(_){}},900);
})();
