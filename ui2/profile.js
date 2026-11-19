/* CyberArena · Perfil 2.0 — personagem, ID copiável, troca de nome com recarga de 15 dias */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const jget=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))||d}catch(_){return d}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CHN={nexus:'NEXUS',cyber:'CYBER',atlas:'ATLAS'},ROLE={nexus:'AGENTE CIBORGUE',cyber:'O ORIGINAL · APRIMORADO',atlas:'O TITÃ DO ABISMO'};
const DAY=864e5,CD=15*DAY;
const remote=()=>typeof cyberRemoteMode!=='undefined'&&cyberRemoteMode;
const uid=()=>{let u=localStorage.getItem('cyberarena.uid');if(!/^\d{9}$/.test(u||'')){u=String(100000000+Math.floor(Math.random()*899999999));try{localStorage.setItem('cyberarena.uid',u)}catch(_){}}return u};
const fmtId=u=>u.replace(/(\d{3})(?=\d)/g,'$1 ');
const curChar=()=>{const c=(jget('cyberarena.identity',{})||{}).char;return CHN[c]?c:'nexus'};
const nameCost=()=>{const n=player.name_changes||0;return n===0?0:n===1?10:25};
const nextAt=()=>{const n=player.name_changes||0;const t=player.name_changed_at||jget('cyberarena.namechg',{}).t||0;return n===0?0:t+CD};
function toast(t){let e=$('pfToast');if(!e){e=document.createElement('div');e.id='pfToast';document.body.appendChild(e)}e.textContent=t;e.classList.remove('on');void e.offsetWidth;e.classList.add('on');}
window.pfCopy=async function(){const u=uid();let ok=false;try{await navigator.clipboard.writeText(u);ok=true}catch(_){try{const t=document.createElement('textarea');t.value=u;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();ok=document.execCommand('copy');t.remove()}catch(_){}}
  toast(ok?'ID copiado: '+u:'Não deu para copiar. Seu ID: '+u);try{vibrateUI&&vibrateUI('tap')}catch(_){}};
function modal(){let o=$('pfRename');if(!o){o=document.createElement('div');o.id='pfRename';document.body.appendChild(o)}return o}
window.pfOpenRename=function(){
  if(remote()){$('nameInput').value=player.player_name||'';return showModal('PERFIL','Trocar nome','Use a tela de conta online para trocar o nome.')}
  const o=modal(),cost=nameCost(),wait=nextAt()-Date.now(),days=Math.ceil(wait/DAY),locked=wait>0;
  o.innerHTML=`<div class="pr-card"><h3>TROCAR NOME</h3><input id="pfNameIn" maxlength="16" placeholder="Novo nome" value="${esc(player.player_name||'')}" autocomplete="off">
  <p class="pr-rule">3 a 16 letras, números, espaço ou _ · Pode trocar a cada <b>15 dias</b>.</p>
  <div class="pr-cost ${locked?'lock':''}">${locked?`🔒 Próxima troca em <b>${days} dia${days>1?'s':''}</b>`:cost===0?'<b>1ª troca GRÁTIS</b>':`Custo: <img src="assests/ui/gem_logo.svg" alt=""><b>${cost}</b> gemas${cost>10?' (valor fixo das próximas trocas)':''}`}</div>
  <div class="pr-act"><button class="pr-cancel" onclick="document.getElementById('pfRename').classList.remove('on')">CANCELAR</button><button class="pr-ok" ${locked?'disabled':''} onclick="pfSaveName()">CONFIRMAR</button></div></div>`;
  o.classList.add('on');setTimeout(()=>{try{$('pfNameIn').focus()}catch(_){}},60);
};
window.pfSaveName=function(){
  const name=($('pfNameIn').value||'').trim().replace(/\s+/g,' ').toUpperCase();
  if(!/^[A-Z0-9À-Ü_ ]{3,16}$/.test(name))return showModal('PERFIL','Nome inválido','Use de 3 a 16 letras, números, espaço ou _.');
  if(name===player.player_name)return showModal('PERFIL','Mesmo nome','Esse já é o seu nome.');
  if(nextAt()>Date.now())return;const cost=nameCost();
  if(player.gems<cost)return showModal('PERFIL','Gemas insuficientes','Trocar o nome custa '+cost+' gemas.');
  player.gems-=cost;player.player_name=name;player.name_changes=(player.name_changes||0)+1;player.name_changed_at=Date.now();
  try{localStorage.setItem('cyberarena.namechg',JSON.stringify({t:Date.now()}));const id=jget('cyberarena.identity',{});id.name=name;localStorage.setItem('cyberarena.identity',JSON.stringify(id))}catch(_){}
  saveGame();renderAll();$('pfRename').classList.remove('on');toast('Nome alterado para '+name+(cost?' · −'+cost+' gemas':''));
};
function build(){
  const host=document.querySelector('#profile .screen-safe');if(!host)return null;let r=$('pfRoot');
  if(!r){r=document.createElement('div');r.id='pfRoot';r.innerHTML='<aside id="pfLeft"></aside><div id="pfRight"><div id="pfId"></div><div id="pfSlot"></div></div>';host.appendChild(r);
    const slot=r.querySelector('#pfSlot');['ecoDay','mxHist'].forEach(i=>{const e=$(i);if(e)slot.appendChild(e)});}
  return r;
}
function render(){
  const r=build();if(!r)return;const slot=r.querySelector('#pfSlot');['ecoDay','mxHist'].forEach(i=>{const e=$(i);if(e&&e.parentNode!==slot)slot.appendChild(e)});
  const ch=curChar(),lv=(window.__econ?window.__econ.chars()[ch].lvl:1),pw=window.ECON?'':'',u=uid();
  const need=typeof ACCOUNT_XP!=='undefined'?ACCOUNT_XP:200,pct=Math.min(100,(player.xp||0)/need*100);
  const wait=nextAt()-Date.now(),days=Math.ceil(wait/DAY);
  const av=document.querySelector('.l2-avatar');if(av){av.textContent='';av.style.backgroundImage='url(assests/ui/portrait_'+ch+'.jpg)'}
  const ib=$('inboxBadge');if(ib)ib.style.display=(+ib.textContent>0)?'':'none';
  const L=r.querySelector('#pfLeft');
  if(!L.querySelector('#pfHero')){L.innerHTML=`<div class="pf-por"><div id="pfHero" class="hero3d pf-hero"><span class="hero3d-ld">CARREGANDO…</span></div><i class="pf-lv"></i></div><b class="pf-cn"></b><small class="pf-role"></small><button class="pf-chg" onclick="openScreen('characters')">TROCAR PERSONAGEM</button>`;}
  L.querySelector('.pf-lv').textContent='NV '+lv;L.querySelector('.pf-cn').textContent=CHN[ch];L.querySelector('.pf-role').textContent=ROLE[ch];
  r.querySelector('#pfId').innerHTML=`<div class="pf-top"><div class="pf-nm"><small>JOGADOR</small><h2>${esc(player.player_name||'JOGADOR')}</h2></div>
   <button class="pf-edit" onclick="pfOpenRename()"><svg class="ic"><use href="#i-gear"/></svg>${wait>0?days+' d':'EDITAR'}</button></div>
   <div class="pf-idrow"><span class="pf-idl">ID</span><b class="pf-id">${fmtId(u)}</b><button class="pf-copy" onclick="pfCopy()">COPIAR</button></div>
   <div class="pf-lvl"><div class="pf-lvb">${player.level||1}</div><div class="pf-xpw"><small>NÍVEL DA CONTA</small><div class="pf-xp"><u style="width:${pct}%"></u></div><em>${player.xp||0} / ${need} XP</em></div></div>`;
}
/* personagem 3D igual ao do lobby: só liga enquanto a tela de perfil está aberta (poupa bateria) */
setInterval(()=>{const el=$('pfHero'),scr=$('profile');if(!el||!scr||typeof window.__mountHero!=='function')return;
  const vis=!scr.classList.contains('hidden');
  if(vis){el._paused=false;if(el._need&&el._needChar!==curChar())el._need=false;if(el._p&&el._char!==curChar()){try{el._p.dispose()}catch(_){}el._p=null;el.innerHTML='<span class="hero3d-ld">CARREGANDO…</span>'}
    if(!el._p&&!el._busy)window.__mountHero(el)}
  else if(el._p){el._paused=true;try{el._p.dispose()}catch(_){}el._p=null;el.innerHTML='<span class="hero3d-ld">CARREGANDO…</span>'}},500);
const _ra=window.renderAll;window.renderAll=function(){const r=_ra.apply(this,arguments);try{render()}catch(e){}return r};
document.addEventListener('click',e=>{const o=$('pfRename');if(o&&o.classList.contains('on')&&e.target===o)o.classList.remove('on')});
setTimeout(()=>{try{render()}catch(_){}},800);
})();
