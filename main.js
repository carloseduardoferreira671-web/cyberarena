/* CYBERARENA_LOCAL_CODE_TEST_V82
   Local-only QA helper: allows the community code to be tested again on this
   browser/account. It does not exist as a server bypass and never changes
   server-side one-use-per-account redemption. */
window.CyberArenaTest = window.CyberArenaTest || {};
window.CyberArenaTest.resetFirstCodeForLocalTest = function(){
  if(cyberRemoteMode) return false;
  if(accountMode!=='account'||!activeCyberAccountId||!player) return false;
  player=normalizePlayer(player);
  player.redeemed_codes=(player.redeemed_codes||[]).filter(c=>String(c).toUpperCase()!==COMMUNITY_CODE);
  if(Array.isArray(player.inbox)) player.inbox=player.inbox.filter(m=>!(m&&m.type==='code'&&String(m.code||'').toUpperCase()===COMMUNITY_CODE));
  saveGame(); renderAll();
  return true;
};

const $ = id => document.getElementById(id);
const screens = ['lobby','shop','missions','pass','progress','profile','characters','codes','inbox'];
const ACCOUNT_XP = 200;
const PASS_XP = 100;
const PREMIUM_PRICE = 100;   // v138: preço do Passe Premium (gemas)
const PASS_LEVELS = 100;
const PASS_DAYS = 20;
const BOX_DAILY_LIMIT = 5;
const OFFER_CYCLE_MS = 18000;
let premiumUnlockVisual = true;

// v79 — backend opcional/autoridade remota. Quando o jogo é servido pelo servidor
// oficial, contas, sessões, códigos, banimentos e estado passam a ser autoritativos no banco.
const CYBER_API_BASE = (location.protocol==='http:'||location.protocol==='https:') ? '/api' : '';
let cyberRemoteMode=false;
let cyberRemoteVersion=1;
let cyberRemoteOwner=false;
let cyberRemoteReady=null;
let cyberSeasonStartUTC=null;
let cyberServerDayKey='';
let cyberGemOfferAvailable=true;
let cyberGemOfferExpiresUTC=null;
const remotePending=new Set();
async function detectCyberServer(){
  if(!CYBER_API_BASE){cyberRemoteMode=false;return false;}
  if(cyberRemoteReady)return cyberRemoteReady;
  cyberRemoteReady=fetch(CYBER_API_BASE+'/health',{credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null).then(b=>!!(b&&b.ok&&b.db===true&&!b.gameApi)).catch(()=>false).then(ok=>{cyberRemoteMode=!!ok;return cyberRemoteMode;});
  return cyberRemoteReady;
}
async function cyberApi(path,options={}){
  const init={credentials:'include',headers:{'Content-Type':'application/json',...(options.headers||{})},...options};
  const r=await fetch(CYBER_API_BASE+path,init);let body={};try{body=await r.json();}catch(_){ }
  if(!r.ok){const e=new Error(body.error||`HTTP_${r.status}`);e.status=r.status;e.body=body;throw e;}
  return body;
}

function newIdempotencyKey(){return crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;}
async function remoteCommand(operation,payload={}){
  const key=operation+'|'+JSON.stringify(payload);if(remotePending.has(key))throw new Error('operation_pending');remotePending.add(key);
  try{const r=await cyberApi('/game/command',{method:'POST',headers:{'Idempotency-Key':newIdempotencyKey()},body:JSON.stringify({operation,payload})});player=normalizePlayer(r.state);cyberRemoteVersion=Number(r.version||cyberRemoteVersion+1);if(cyberAccounts[activeCyberAccountId])cyberAccounts[activeCyberAccountId].data=normalizePlayer(r.state);renderAll();return r.result||{};}finally{remotePending.delete(key);}
}
function remoteErrorMessage(e,fallback='Não foi possível concluir a operação.'){
  const map={already_claimed:'Esta recompensa já foi coletada.',insufficient_gems:'Gemas insuficientes.',insufficient_currency:'Saldo insuficiente.',daily_limit:'Limite diário atingido.',locked:'Este patamar ainda está bloqueado.',premium_required:'Você precisa do Passe Premium.',already_premium:'O Passe Premium já está ativo.',offer_expired:'O prazo de 180 dias para esta oferta terminou.',mission_not_complete:'Esta missão ainda não foi concluída.',same_name:'Esse já é o seu nome.',inbox_not_found:'Essa recompensa não está mais disponível.',reward_not_found:'Essa recompensa não está mais disponível.',idempotency_conflict:'A operação foi repetida com dados diferentes.',operation_pending:'A operação anterior ainda está sendo processada.',auth_required:'Entre em uma Cyber Account para continuar.'};
  return map[e?.body?.error||e?.message]||fallback;
}

async function bootstrapCyberServer(){
  if(!(await detectCyberServer()))return;
  try{
    const me=await cyberApi('/auth/me');
    try{const t=await cyberApi('/time');cyberSeasonStartUTC=t.seasonStart;cyberServerDayKey=t.dayKey;cyberGemOfferAvailable=t.gemOfferAvailable!==false;cyberGemOfferExpiresUTC=t.gemOfferExpires||null;}catch(_){}
    const a=me.account; cyberRemoteOwner=!!a.isOwner; cyberRemoteVersion=Number(a.version||1);
    activeCyberAccountId=a.id;accountMode='account';player=normalizePlayer(a.state);player.player_name=a.name||player.player_name;
    cyberAccounts={ [a.id]:{id:a.id,name:a.name,data:player,banned:false,isOwner:cyberRemoteOwner} };
    localStorage.setItem('cyberArenaAccountOnboardingDone','1');
    resetDaily();renderAll();updateAccountUI();
  }catch(e){
    // Em modo servidor, não confiamos em contas locais como autoridade. O convidado continua disponível.
    activeCyberAccountId='';accountMode='guest';player=legacyPlayerSnapshot();cyberAccounts={};
    localStorage.removeItem('cyberArenaActiveAccount');
    setTimeout(()=>{if(!accountGateShown)openAccountGate();},400);
  }
}

// v53 — feedback de interface: sons próprios + resposta tátil.
const UI_SOUNDS = {
  click: 'sounds/ui/ui_click.wav',
  open: 'sounds/ui/ui_open.wav',
  back: 'sounds/ui/ui_back.wav',
  play: 'sounds/ui/ui_play.wav',
  buy: 'sounds/ui/ui_buy.wav',
  settings: 'sounds/ui/ui_settings.wav',
  profile: 'sounds/ui/ui_profile.wav',
  account: 'sounds/ui/ui_account.wav'
};
const uiAudio = {};
function getAudioSetting(key){
  const n=Number(localStorage.getItem(key)||100);
  return Math.max(0,Math.min(200,Number.isFinite(n)?n:100));
}
// v71 — ganho de áudio ampliado: o controle continua 0–200, mas 100 já tem
// bastante presença e 200 pode chegar a 5x de ganho interno quando o navegador permitir.
let audioContext=null, audioMaster=null;
const audioNodes=new WeakMap();
function getSettingGain(key){ return (getAudioSetting(key)/200)*5; }
function getMusicGain(){ return getSettingGain('cyberArenaMusicVolume'); }
function getEffectsGain(){ return getSettingGain('cyberArenaEffectsVolume'); }
function ensureAudioGraph(){
  try{
    const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return null;
    if(!audioContext){
      audioContext=new AC();
      audioMaster=audioContext.createGain();
      audioMaster.gain.value=1;
      const comp=audioContext.createDynamicsCompressor();
      comp.threshold.value=-10; comp.knee.value=16; comp.ratio.value=5; comp.attack.value=0.003; comp.release.value=0.16;
      audioMaster.connect(comp); comp.connect(audioContext.destination);
    }
    if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
    return audioContext;
  }catch(_){return null;}
}
function routeAudio(a){
  const ctx=ensureAudioGraph(); if(!ctx||!audioMaster)return null;
  let node=audioNodes.get(a);
  if(!node){
    try{ const source=ctx.createMediaElementSource(a); const gain=ctx.createGain(); source.connect(gain); gain.connect(audioMaster); node={gain}; audioNodes.set(a,node); }catch(_){ return null; }
  }
  return node;
}
function setAudioGain(a,g){
  const node=routeAudio(a);
  if(node)node.gain.gain.value=Math.max(0,Math.min(5,g));
  a.volume=1;
}
function initUISounds(){
  ensureAudioGraph();
  Object.entries(UI_SOUNDS).forEach(([key,src])=>{
    if(!uiAudio[key]){ const a=new Audio(src); a.preload='auto'; uiAudio[key]=a; }
    const base=(key==='profile'||key==='account')?1.0:(key==='back'?1.05:0.92);
    setAudioGain(uiAudio[key],base*getEffectsGain());
  });
}
function playUISound(kind){
  const a=uiAudio[kind]||uiAudio.click; if(!a)return;
  const base=(kind==='profile'||kind==='account')?1.0:(kind==='back'?1.05:0.92);
  setAudioGain(a,base*getEffectsGain());
  try{ ensureAudioGraph(); a.pause(); a.currentTime=0; const p=a.play(); if(p&&p.catch)p.catch(()=>{}); }catch(_){}
}
const GAME_SOUNDS={
  coin:'sounds/ui/ui_coin.wav', gem:'sounds/ui/ui_gem.wav', token:'sounds/ui/ui_token.wav',
  mixed:'sounds/ui/ui_mixed.wav', boxMini:'sounds/ui/ui_box_mini.wav',
  boxCyber:'sounds/ui/ui_box_cyber.wav', boxMecha:'sounds/ui/ui_box_mecha.wav',
  premium:'sounds/ui/ui_premium.wav'
};
const gameAudio={};
function playGameSound(kind,mult=1){
  const src=GAME_SOUNDS[kind]; if(!src)return;
  let a=gameAudio[kind]; if(!a){a=new Audio(src);a.preload='auto';gameAudio[kind]=a;}
  setAudioGain(a,getEffectsGain()*Math.max(.2,Math.min(1.35,mult)));
  try{a.pause();a.currentTime=0;const p=a.play();if(p&&p.catch)p.catch(()=>{});}catch(_){}
}
function vibratePattern(pattern,scale=1){
  if(!navigator.vibrate || getAudioSetting('cyberArenaVibrationEnabled')===0)return;
  try{const p=Array.isArray(pattern)?pattern.map(v=>Math.max(1,Math.round(v*scale))):Math.max(1,Math.round(pattern*scale));navigator.vibrate(p);}catch(_){}
}
function vibrateUI(kind){
  if(localStorage.getItem('cyberArenaTactileEnabled')==='0')return;
  const patterns={click:25,open:30,back:30,play:42,buy:[32,48,64,48,32],settings:25,profile:28,account:28};
  vibratePattern(patterns[kind]||15,1);
}
function classifyUIButton(el){
  const text=(el.innerText||el.textContent||'').trim().toUpperCase();
  const aria=(el.getAttribute('aria-label')||'').toUpperCase();
  if(el.id==='startGate') return 'open';
  if(el.id==='profileCard') return 'profile';
  if(el.id==='accountXpButton') return 'account';
  if(text.includes('JOGAR')) return 'play';
  if(text.includes('COMPRAR')||text.includes('TROCAR')||text.includes('ADQUIRIR')||text.includes('PASSE PREMIUM')) return 'buy';
  if(text.includes('VOLTAR')||text==='‹'||text==='←') return 'back';
  if(aria.includes('CONFIG')||el.classList.contains('lobby-settings')||el.classList.contains('screen-settings')) return 'settings';
  return 'click';
}
function installUIFeedback(){
  initUISounds();
  document.addEventListener('pointerdown',e=>{
    const el=e.target.closest?.('button,[role=button],[onclick],a,input,select,textarea,summary');
    if(!el || el.disabled || el.classList.contains('hidden'))return;
    ensureAudioGraph(); const kind=classifyUIButton(el); playUISound(kind); vibrateUI(kind);
  },{capture:true,passive:true});
}


// v68 — painel de ÁUDIO + resposta tátil/vibração.
function openSettings(){const el=$('settingsOverlay');if(!el)return;syncSettingsUI();el.classList.remove('hidden');playUISound('settings');vibrateUI('settings');}
function closeSettings(){const el=$('settingsOverlay');if(el)el.classList.add('hidden');}
function syncSettingsUI(){
 syncGraphicsUI();
 const mv=getAudioSetting('cyberArenaMusicVolume'),ev=getAudioSetting('cyberArenaEffectsVolume');
 if($('musicVolume'))$('musicVolume').value=mv;if($('effectsVolume'))$('effectsVolume').value=ev;
 if($('musicVolumeValue'))$('musicVolumeValue').textContent=mv;if($('effectsVolumeValue'))$('effectsVolumeValue').textContent=ev;
 if($('tactileToggle'))$('tactileToggle').checked=localStorage.getItem('cyberArenaTactileEnabled')!=='0';
 if($('vibrationToggle'))$('vibrationToggle').checked=localStorage.getItem('cyberArenaVibrationEnabled')!=='0';if($('gameControlScale'))$('gameControlScale').value=Number(localStorage.getItem('cyberArenaGameControlScale')||100);if($('gameControlScaleValue'))$('gameControlScaleValue').textContent=Number(localStorage.getItem('cyberArenaGameControlScale')||100);
}
/* Gráficos: mesma chave usada dentro da partida (mundo/js/game.js) — vale na próxima partida */
function readGfxSettings(){try{return JSON.parse(localStorage.getItem('cyberarena.settings')||'{}')||{};}catch(_){return {};}}
function setGraphicsQuality(v){if(!['max','high','medium','low','ultra'].includes(v))return;const s=readGfxSettings();s.quality=v;try{localStorage.setItem('cyberarena.settings',JSON.stringify(s));}catch(_){}}
function syncGraphicsUI(){const el=$('gfxQuality');if(!el)return;let q=readGfxSettings().quality;const auto='low';const map={auto:auto,mid:'medium',ultra4k:'high',apk:'low'};if(map[q])q=map[q];if(!['max','high','medium','low','ultra'].includes(q))q=auto;if(!localStorage.getItem('cyberarena.defaults.v2')&&q!=='ultra')q='low';el.value=q;}
function setMusicVolume(v){v=Math.max(0,Math.min(200,Number(v)||0));localStorage.setItem('cyberArenaMusicVolume',v);if($('musicVolumeValue'))$('musicVolumeValue').textContent=v;[lobbyMusicA,lobbyMusicB].forEach(m=>{if(m){setAudioGain(m,getMusicGain());m.volume=lobbyMusicActive===m?1:0;}});}
function setEffectsVolume(v){v=Math.max(0,Math.min(200,Number(v)||0));localStorage.setItem('cyberArenaEffectsVolume',v);if($('effectsVolumeValue'))$('effectsVolumeValue').textContent=v;initUISounds();Object.values(gameAudio).forEach(a=>setAudioGain(a,getEffectsGain()));}
function setTactile(v){localStorage.setItem('cyberArenaTactileEnabled',v?'1':'0');}
function setVibration(v){localStorage.setItem('cyberArenaVibrationEnabled',v?'1':'0');}
function initSettingsDefaults(){if(localStorage.getItem('cyberArenaMusicVolume')===null)localStorage.setItem('cyberArenaMusicVolume','100');if(localStorage.getItem('cyberArenaEffectsVolume')===null)localStorage.setItem('cyberArenaEffectsVolume','100');if(localStorage.getItem('cyberArenaTactileEnabled')===null)localStorage.setItem('cyberArenaTactileEnabled','1');if(localStorage.getItem('cyberArenaVibrationEnabled')===null)localStorage.setItem('cyberArenaVibrationEnabled','1');}
initSettingsDefaults();

const DEFAULT_PLAYER = {
  player_name:'CYBER', coins:300, gems:20, cyber_fichas:0,
  level:1, xp:0, total_xp:0, pass_xp:0, pass_level:1,
  free_offer_claimed:false, gem_offer_claimed:false, gem_offer_start:null,
  name_changes:0, box_daily:{date:'',mini:0,cyber:0,mecha:0},
  pass_claimed:[], premium_pass:false, premium_claimed:[], account_claimed:[], inventory:{mini:0,cyber:0,mecha:0}, offer_seed:0, missions:{character_created:false,first_match:false,character_claimed:false,first_match_claimed:false,tutorial_v2:false}, inbox:[], redeemed_codes:[],
};
let player={...DEFAULT_PLAYER};
let cyberAccounts={};
let activeCyberAccountId='';
let accountMode='guest';
let accountGateTimer=null;
let accountGateShown=false;
let accountGateMode='create';
function legacyPlayerSnapshot(){ try{const raw=localStorage.getItem('cyberArenaPlayer');return raw?normalizePlayer(JSON.parse(raw)):normalizePlayer(DEFAULT_PLAYER);}catch(_){return normalizePlayer(DEFAULT_PLAYER);} }
function makeCyberId(){
 const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let id='CA-';
 do{ id='CA-'+Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); }while(cyberAccounts[id]);
 return id;
}
function updateAccountUI(){
 const label=$('activeCyberAccountLabel');
 if(label) label.textContent=accountMode==='account'&&cyberAccounts[activeCyberAccountId]?`${cyberAccounts[activeCyberAccountId].name} · ${activeCyberAccountId}`:'Convidado · salvo neste aparelho';
 const preview=$('cyberIdPreview'); if(preview && accountGateMode==='create')preview.textContent=makePreviewCyberId();
}
function makePreviewCyberId(){const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';return 'CA-'+Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join('');}
function setAccountMessage(msg){const el=$('accountMessage');if(el)el.textContent=msg||'';}
function showAccountCreate(){accountGateMode='create';$('accountCreateForm')?.classList.remove('hidden');$('accountLoginForm')?.classList.add('hidden');$('accountSwitchForm')?.classList.add('hidden');if($('accountGateTitle'))$('accountGateTitle').textContent='CRIE SUA CYBER ACCOUNT';if($('accountGateText'))$('accountGateText').textContent='Sua conta fica salva neste dispositivo. Crie um nome, uma senha e receba um identificador único.';setAccountMessage('');updateAccountUI();}
function showAccountLogin(){accountGateMode='login';$('accountCreateForm')?.classList.add('hidden');$('accountLoginForm')?.classList.remove('hidden');$('accountSwitchForm')?.classList.add('hidden');if($('accountGateTitle'))$('accountGateTitle').textContent='ENTRAR NA CYBER ACCOUNT';if($('accountGateText'))$('accountGateText').textContent='Use seu identificador Cyber Account e sua senha para carregar seu progresso.';setAccountMessage('');}
function openAccountGate(){accountGateShown=true;accountGateMode='create';$('accountGate')?.classList.remove('hidden');showAccountCreate();}
function hideAccountGate(){accountGateShown=false;$('accountGate')?.classList.add('hidden');}
async function hashSecret(value){
  const text=String(value||'');
  if(window.crypto?.subtle){ const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)); return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join(''); }
  let h=2166136261; for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);} return ('00000000'+(h>>>0).toString(16)).slice(-8);
}
async function createCyberAccount(){
 const name=($('accountNameInput')?.value||'').trim().toUpperCase(); const password=$('accountPasswordInput')?.value||'';
 if(name.length<2){setAccountMessage('Digite um nome com pelo menos 2 caracteres.');return;}
 if(password.length<6){setAccountMessage('A senha precisa ter pelo menos 6 caracteres.');return;}
 if(await detectCyberServer()){
   if(password.length<8){setAccountMessage('No servidor, use uma senha com pelo menos 8 caracteres.');return;}
   try{
     const r=await cyberApi('/auth/register',{method:'POST',body:JSON.stringify({name,password})});
     const a=r.account; activeCyberAccountId=a.id;accountMode='account';cyberRemoteOwner=!!a.isOwner;cyberRemoteVersion=Number(a.version||1);player=normalizePlayer(a.state);player.player_name=a.name;cyberAccounts={[a.id]:{id:a.id,name:a.name,data:player,banned:false,isOwner:cyberRemoteOwner}};
     localStorage.setItem('cyberArenaAccountOnboardingDone','1');saveGame();playUISound('open');vibrateUI('open');$('accountGate')?.classList.add('account-success');setAccountMessage(`CYBER ACCOUNT ${a.id} criada.`);setTimeout(()=>{$('accountGate')?.classList.remove('account-success');hideAccountGate();renderAll();updateAccountUI();},900);return;
   }catch(e){setAccountMessage(e.message==='account_exists'?'Essa Cyber Account já existe.':e.message==='server_error'?'Erro no servidor. Tente novamente.':'Não foi possível criar a conta.');return;}
 }
 const id=makeCyberId(); const data=legacyPlayerSnapshot(); data.player_name=name;
 const passwordHash=await hashSecret(password); cyberAccounts[id]={id,name,passwordHash,createdAt:Date.now(),data,banned:false}; delete cyberAccounts[id].password;
 localStorage.setItem('cyberArenaAccounts',JSON.stringify(cyberAccounts));localStorage.setItem('cyberArenaActiveAccount',id);localStorage.setItem('cyberArenaAccountOnboardingDone','1');localStorage.removeItem('cyberArenaPlayer');activeCyberAccountId=id;accountMode='account';player=normalizePlayer(data);saveGame();playUISound('open');vibrateUI('open');$('accountGate')?.classList.add('account-success');setAccountMessage(`CYBER ACCOUNT ${id} criada.`);setTimeout(()=>{$('accountGate')?.classList.remove('account-success');hideAccountGate();renderAll();updateAccountUI();},900);
}
async function loginCyberAccount(){
 const id=($('loginCyberIdInput')?.value||'').trim().toUpperCase(); const password=$('loginPasswordInput')?.value||'';
 if(await detectCyberServer()){
   try{const r=await cyberApi('/auth/login',{method:'POST',body:JSON.stringify({cyberId:id,password})});const a=r.account;activeCyberAccountId=a.id;accountMode='account';cyberRemoteOwner=!!a.isOwner;cyberRemoteVersion=Number(a.version||1);player=normalizePlayer(a.state);player.player_name=a.name;cyberAccounts={[a.id]:{id:a.id,name:a.name,data:player,banned:false,isOwner:cyberRemoteOwner}};localStorage.setItem('cyberArenaAccountOnboardingDone','1');resetDaily();renderAll();hideAccountGate();playUISound('open');vibrateUI('open');restartToStartGate();return;}catch(e){setAccountMessage(e.message==='account_banned'?'Esta Cyber Account está bloqueada.':e.message==='invalid_credentials'?'Cyber Account ou senha incorretos.':'Não foi possível entrar agora.');return;}
 }
 const acc=cyberAccounts[id];if(!acc){setAccountMessage('Cyber Account ou senha incorretos.');return;}if(acc.banned){setAccountMessage('Esta Cyber Account está bloqueada.');return;}const hash=await hashSecret(password);if(acc.passwordHash){if(hash!==acc.passwordHash){setAccountMessage('Cyber Account ou senha incorretos.');return;}}else if(acc.password){if(acc.password!==password){setAccountMessage('Cyber Account ou senha incorretos.');return;}acc.passwordHash=hash;delete acc.password;localStorage.setItem('cyberArenaAccounts',JSON.stringify(cyberAccounts));}activeCyberAccountId=id;accountMode='account';player=normalizePlayer(acc.data);localStorage.setItem('cyberArenaActiveAccount',id);resetDaily();saveGame();renderAll();hideAccountGate();playUISound('open');vibrateUI('open');
}
async function enterGuest(){
 if(cyberRemoteMode){try{await cyberApi('/auth/logout',{method:'POST',body:'{}'});}catch(_){} }
 activeCyberAccountId='';accountMode='guest';player=legacyPlayerSnapshot();resetDaily();localStorage.setItem('cyberArenaAccountOnboardingDone','1');localStorage.removeItem('cyberArenaActiveAccount');hideAccountGate();renderAll();playUISound('open');vibrateUI('open');
}

function openAccountSwitcher(){
 const overlay=$('accountGate');if(!overlay)return;overlay.classList.remove('hidden');accountGateShown=true;
 if(cyberRemoteMode){accountGateMode='login';$('accountCreateForm')?.classList.add('hidden');$('accountSwitchForm')?.classList.add('hidden');$('accountLoginForm')?.classList.remove('hidden');if($('accountGateTitle'))$('accountGateTitle').textContent='TROCAR CYBER ACCOUNT';if($('accountGateText'))$('accountGateText').textContent='Entre com outra Cyber Account para carregar o progresso salvo no servidor. Seu progresso não é compartilhado entre contas.';setAccountMessage('');return;}
 accountGateMode='switch';$('accountCreateForm')?.classList.add('hidden');$('accountLoginForm')?.classList.add('hidden');$('accountSwitchForm')?.classList.remove('hidden');if($('accountGateTitle'))$('accountGateTitle').textContent='TROCAR CYBER ACCOUNT';if($('accountGateText'))$('accountGateText').textContent='Escolha uma conta salva neste dispositivo ou crie outra. O jogo reinicia para carregar o perfil escolhido.';const list=$('accountList');if(list){const ids=Object.keys(cyberAccounts);list.innerHTML=ids.length?ids.map(id=>`<button class="account-choice" onclick="switchToAccount('${id}')"><span><b>${cyberAccounts[id].name}</b><small>${id}</small></span><strong>ENTRAR</strong></button>`).join(''):'<div class="account-empty">Nenhuma Cyber Account criada ainda.</div>';}setAccountMessage('');
}

function switchToAccount(id){
 const acc=cyberAccounts[id];if(!acc || acc.banned)return;activeCyberAccountId=id;accountMode='account';player=normalizePlayer(acc.data);localStorage.setItem('cyberArenaActiveAccount',id);resetDaily();saveGame();
 hideAccountGate();playUISound('open');vibratePattern([45,70,95,70,45],1.15);restartToStartGate();
}
function restartToStartGate(){
 screens.forEach(s=>$(s)?.classList.add('hidden'));canvas?.classList.add('hidden');const gate=$('startGate');if(gate){gate.dataset.started='0';gate.classList.remove('hidden','starting');}
 lobbyMusicUserStarted=false;[lobbyMusicA,lobbyMusicB].forEach(m=>{if(m){m.pause();m.currentTime=LOBBY_MUSIC_START;m.volume=0;}});lobbyMusicActive=null;
}
function showAccountAfterLobbyDelay(){
 if(accountGateShown || accountMode==='account' || localStorage.getItem('cyberArenaAccountOnboardingDone')==='1')return;
 clearTimeout(accountGateTimer); accountGateTimer=setTimeout(()=>openAccountGate(),400);
}


// v73 — relógio oficial do jogo: o dia vira às 00:00 UTC.
// O dia é baseado em UTC para que todas as contas do mesmo dispositivo sigam
// o mesmo ciclo, independentemente do fuso horário configurado no aparelho.
function gameDayKey(now=new Date()){
  const d=new Date(now);
  const y=d.getUTCFullYear();const m=String(d.getUTCMonth()+1).padStart(2,'0');const day=String(d.getUTCDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function resetDaily(){ const key=gameDayKey(); if(!player.box_daily || player.box_daily.date!==key) player.box_daily={date:key,mini:0,cyber:0,mecha:0}; }
function normalizePlayer(d){ const x={...DEFAULT_PLAYER,...(d||{})}; return {...x,box_daily:{...DEFAULT_PLAYER.box_daily,...((d&&d.box_daily)||{})},inventory:{...DEFAULT_PLAYER.inventory,...((d&&d.inventory)||{})},pass_claimed:Array.isArray(d?.pass_claimed)?d.pass_claimed:[],premium_claimed:Array.isArray(d?.premium_claimed)?d.premium_claimed:[],account_claimed:Array.isArray(d?.account_claimed)?d.account_claimed:[],missions:{...DEFAULT_PLAYER.missions,...((d&&d.missions)||{})},inbox:Array.isArray(d?.inbox)?d.inbox.filter(m=>m&&m.type==='code'):[],redeemed_codes:Array.isArray(d?.redeemed_codes)?d.redeemed_codes:[]}; }
function saveGame(){
 if(accountMode==='guest'){ try{localStorage.setItem('cyberArenaPlayer',JSON.stringify(player));}catch(_){} return; }   // convidado: salva só neste aparelho (nome, moedas, gemas...)
 if(cyberRemoteMode && activeCyberAccountId)return;
 if(activeCyberAccountId && cyberAccounts[activeCyberAccountId]){cyberAccounts[activeCyberAccountId].data=JSON.parse(JSON.stringify(player));localStorage.setItem('cyberArenaAccounts',JSON.stringify(cyberAccounts));localStorage.setItem('cyberArenaActiveAccount',activeCyberAccountId);} else localStorage.setItem('cyberArenaPlayer',JSON.stringify(player));
}
function loadGame(){
  try{
    cyberAccounts=JSON.parse(localStorage.getItem('cyberArenaAccounts')||'{}')||{};
    activeCyberAccountId=localStorage.getItem('cyberArenaActiveAccount')||'';
    if(activeCyberAccountId && cyberAccounts[activeCyberAccountId]){ accountMode='account'; player=normalizePlayer(cyberAccounts[activeCyberAccountId].data); }
    else if(localStorage.getItem('cyberArenaPlayer')){ player=normalizePlayer(JSON.parse(localStorage.getItem('cyberArenaPlayer'))); }
    else player=normalizePlayer(DEFAULT_PLAYER);
  }catch(e){ cyberAccounts={};activeCyberAccountId='';accountMode='guest';player=normalizePlayer(DEFAULT_PLAYER); }
  resetDaily(); renderAll(); updateAccountUI();
}
let lobbyMusicA=null, lobbyMusicB=null, lobbyMusicActive=null, lobbyMusicReady=false, lobbyMusicFading=false, lobbyMusicUserStarted=false, lobbyMusicPageHidden=false;
const LOBBY_MUSIC_START=7;
const LOBBY_MUSIC_FADE=5;
const LOBBY_MUSIC_VOLUME=1.0;

function initLobbyMusic(){
  if(lobbyMusicReady)return;
  lobbyMusicA=$('lobbyMusic');
  lobbyMusicB=$('lobbyMusicB');
  if(!lobbyMusicA || !lobbyMusicB)return;
  lobbyMusicA.loop=false; lobbyMusicB.loop=false;
  lobbyMusicA.volume=0; lobbyMusicB.volume=0;
  const prepare=m=>{
    if(m.dataset.prepared)return;
    m.dataset.prepared='1';
    m.addEventListener('loadedmetadata',()=>{ if(m.currentTime<LOBBY_MUSIC_START)m.currentTime=LOBBY_MUSIC_START; },{once:true});
    m.addEventListener('ended',()=>{
      if(lobbyMusicFading)return;
      // Segurança caso o navegador encerre a faixa antes do crossfade.
      m.currentTime=LOBBY_MUSIC_START;
      setAudioGain(m,getMusicGain()); m.volume=LOBBY_MUSIC_VOLUME;
      m.play().catch(()=>{});
    });
  };
  prepare(lobbyMusicA); prepare(lobbyMusicB);
  lobbyMusicReady=true;
}

function fadeLoopTick(){
  if(!lobbyMusicActive || lobbyMusicFading)return;
  const active=lobbyMusicActive;
  const next=active===lobbyMusicA?lobbyMusicB:lobbyMusicA;
  if(!isFinite(active.duration) || active.duration<=0)return;
  const remaining=active.duration-active.currentTime;
  if(remaining<=LOBBY_MUSIC_FADE+0.15){
    lobbyMusicFading=true;
    next.currentTime=LOBBY_MUSIC_START;
    setAudioGain(next,getMusicGain()); next.volume=0;
    const p=next.play();
    if(p&&p.catch)p.catch(()=>{ lobbyMusicFading=false; });
    const started=performance.now();
    const fade=()=>{
      const t=Math.min(1,(performance.now()-started)/(LOBBY_MUSIC_FADE*1000));
      setAudioGain(active,getMusicGain()); active.volume=LOBBY_MUSIC_VOLUME*(1-t);
      setAudioGain(next,getMusicGain()); next.volume=LOBBY_MUSIC_VOLUME*t;
      if(t<1 && !active.paused && !next.paused) requestAnimationFrame(fade);
      else {
        active.pause(); active.currentTime=LOBBY_MUSIC_START; active.volume=0;
        setAudioGain(next,getMusicGain());
        lobbyMusicActive=next; lobbyMusicFading=false;
      }
    };
    requestAnimationFrame(fade);
  }
}

function updateLobbyMusic(){
  initLobbyMusic();
  if(!lobbyMusicA || !lobbyMusicB)return;
  // A trilha do Lobby é fixa em toda a interface; só para durante a partida.
  const inMatch=!$('game')?.classList.contains('hidden');
  if(!inMatch){
    if(!lobbyMusicActive)lobbyMusicActive=lobbyMusicA;
    if(lobbyMusicActive.currentTime<LOBBY_MUSIC_START && lobbyMusicActive.readyState>=1)lobbyMusicActive.currentTime=LOBBY_MUSIC_START;
    setAudioGain(lobbyMusicActive,getMusicGain()); lobbyMusicActive.volume=LOBBY_MUSIC_VOLUME;
    const play=lobbyMusicActive.play();
    if(play&&play.catch)play.catch(()=>{});
    if(!lobbyMusicActive._fadeBound){
      lobbyMusicActive.addEventListener('timeupdate',fadeLoopTick);
      lobbyMusicActive._fadeBound=true;
    }
  }else{
    [lobbyMusicA,lobbyMusicB].forEach(m=>{m.pause();m.currentTime=LOBBY_MUSIC_START;m.volume=0;});
    lobbyMusicActive=null; lobbyMusicFading=false;
  }
}
function openScreen(id){ if(!screens.includes(id) || !$((id))) return; screens.forEach(s=>$(s).classList.add('hidden')); $(id).classList.remove('hidden'); renderAll(); window.scrollTo?.(0,0); updateLobbyMusic(); }

function addXP(amount){
  player.xp += amount; player.total_xp += amount;
  while(player.xp>=ACCOUNT_XP){player.xp-=ACCOUNT_XP;player.level++;}
  player.pass_xp += amount*3; // Triple XP is active for the season.
  while(player.pass_xp>=PASS_XP && player.pass_level<PASS_LEVELS){player.pass_xp-=PASS_XP;player.pass_level++;}
  saveGame(); renderAll();
}
function getSeasonStart(){
 if(cyberRemoteMode && cyberSeasonStartUTC)return new Date(cyberSeasonStartUTC).getTime();
 const key='cyberArenaSeasonStartUTC_v79'; const saved=Number(localStorage.getItem(key)||0); if(saved)return saved;
 const start=Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate(),0,0,0,0); localStorage.setItem(key,String(start)); localStorage.removeItem('cyberArenaSeasonStart'); return start;
}
function updateSeasonUI(){
 const start=getSeasonStart(); const now=Date.now(); const beforeStart=now<start; const elapsed=Math.max(0,now-start); const day=Math.floor(elapsed/86400000); const remaining=Math.max(0,PASS_DAYS-day-1);
 document.querySelectorAll('.season-days').forEach(el=>el.textContent=beforeStart?'COMEÇA ÀS 00:00 UTC':day>=PASS_DAYS?'TEMPORADA ENCERRADA':`${remaining} DIAS RESTANTES`);
}

function pct(v,max){return Math.max(0,Math.min(100,v/max*100))+'%';}
function renderAll(){
  resetDaily(); updateAccountUI(); updateSeasonUI();
  const name=(player.player_name||'CYBER').toUpperCase();
  ['playerName','playerName2'].forEach(id=>{if($(id))$(id).textContent=name});
  ['levelValue','progressLevel'].forEach(id=>{if($(id))$(id).textContent=player.level});
  ['coinsValue','statCoins','shopCoins'].forEach(id=>{if($(id))$(id).textContent=player.coins});
  ['gemsValue','statGems','shopGems'].forEach(id=>{if($(id))$(id).textContent=player.gems});
  ['tokensValue','statTokens','shopTokens'].forEach(id=>{if($(id))$(id).textContent=player.cyber_fichas});
  document.querySelectorAll('.screenCoins').forEach(el=>el.textContent=player.coins);
  document.querySelectorAll('.screenTokens').forEach(el=>el.textContent=player.cyber_fichas);
  document.querySelectorAll('.screenGems').forEach(el=>el.textContent=player.gems);
  if($('statXp'))$('statXp').textContent=player.total_xp;
  if($('xpText'))$('xpText').textContent=`${player.xp} / ${ACCOUNT_XP} XP`;
  if($('progressXpText'))$('progressXpText').textContent=`${player.xp} / ${ACCOUNT_XP} XP`;
  if($('passXpText'))$('passXpText').textContent=`${player.pass_xp} / ${PASS_XP} XP · TRIPLE XP`;
  if($('passLevel'))$('passLevel').textContent=player.pass_level;
  if($('nameInput'))$('nameInput').value=player.player_name==='CYBER'?'':player.player_name;
  ['xpBar','xpMini','progressXpBar'].forEach(id=>{if($(id))$(id).style.width=pct(player.xp,ACCOUNT_XP)});
  if($('passXpBar'))$('passXpBar').style.width=pct(player.pass_xp,PASS_XP);
  if($('dailyOffer')) $('dailyOffer').classList.toggle('hidden', player.free_offer_claimed);
  if($('freeOfferText'))$('freeOfferText').textContent='100 moedas + 10 XP';
  if($('freeOfferButton'))$('freeOfferButton').disabled=player.free_offer_claimed;
  if($('gemOfferStatus'))$('gemOfferStatus').textContent=player.gem_offer_claimed?'COLETADO':(cyberRemoteMode&&cyberGemOfferAvailable===false?'ENCERRADA':'DISPONÍVEL');
  if($('gemOfferButton')){$('gemOfferButton').textContent=player.gem_offer_claimed?'RECEBIDO':(cyberRemoteMode&&cyberGemOfferAvailable===false?'ENCERRADA':'COLETAR');$('gemOfferButton').disabled=player.gem_offer_claimed||(cyberRemoteMode&&cyberGemOfferAvailable===false);}
  if($('nameCost'))$('nameCost').textContent=player.name_changes===0?'10 GEMAS':'50 GEMAS';
  if($('profileLevel'))$('profileLevel').textContent=player.level;
  if($('profileXpText'))$('profileXpText').textContent=`${player.xp} / ${ACCOUNT_XP} XP`;
  if($('profileXpBar'))$('profileXpBar').style.width=pct(player.xp,ACCOUNT_XP);
  renderBoxCards(); renderPass(); renderAccountPath(); renderMissions(); renderOffers(); updateGemBundle(); if($('inboxBadge'))$('inboxBadge').textContent=String((player.inbox||[]).length); if($('inboxList'))renderInbox();
}

function infoCurrency(type){
 const data={
  coin:{title:'MOEDAS',text:'Moeda comum. Ganha em partidas e missões. Usada para evoluir personagens e comprar pacotes na Loja.',icon:'assests/ui/coin_logo.svg',cls:'coin'},
  token:{title:'CYBER FICHAS',text:'Ganha em partidas, caixas e no Passe. Usada para evoluir personagens e abrir Cyber e Mecha Caixas.',icon:'assests/ui/token_logo.svg',cls:'token'},
  gem:{title:'GEMAS',text:'Moeda premium e rara: Passe Premium, trocar o nome, ofertas da Loja, câmbio e acelerar evoluções. Ganha em marcos de nível dos personagens e caixas épicas.',icon:'assests/ui/gem_logo.svg',cls:'gem'}
 }[type];
 if(!data)return;
 showModal(data.title, data.text, `<div class=\"currency-info-big ${data.cls}\"><img src=\"${data.icon}\" alt=\"\"><b>${data.title}</b></div>`);
}
async function claimFreeOffer(){
 if(player.free_offer_claimed)return;
 if(cyberRemoteMode){try{const r=await remoteCommand('claim_free_offer');startGenericRewardSequence([{kind:'coins',amount:Number(r.coins||100)},{kind:'xp',amount:10}],'OFERTA DIÁRIA');}catch(e){showModal('OFERTA DIÁRIA','Não foi possível coletar',remoteErrorMessage(e));}return;}
 player.free_offer_claimed=true;player.coins+=100;addXP(10);saveGame();renderAll();startGenericRewardSequence([{kind:'coins',amount:100},{kind:'xp',amount:10}],'OFERTA DIÁRIA');
}
async function claimGemOffer(){
 if(player.gem_offer_claimed)return;if(cyberRemoteMode&&cyberGemOfferAvailable===false){showModal('OFERTA GRÁTIS','Oferta encerrada','O prazo de 180 dias para esta oferta terminou.');return;}
 if(cyberRemoteMode){try{await remoteCommand('claim_gem_offer');startGenericRewardSequence([{kind:'gems',amount:30}],'OFERTA GRÁTIS · 180 DIAS');}catch(e){showModal('OFERTA GRÁTIS','Não foi possível coletar',remoteErrorMessage(e));}return;}
 player.gem_offer_claimed=true;player.gems+=30;player.gem_offer_start=Date.now();saveGame();renderAll();startGenericRewardSequence([{kind:'gems',amount:30}],'OFERTA GRÁTIS · 180 DIAS');
}

const offerCatalog=[
 {id:'tokens500',tag:'PROMO',title:'100 CYBER FICHAS',desc:'Para evoluir personagens e abrir caixas.',price:15,reward:{tokens:100}},
 {id:'tokens1200',tag:'OFERTA',title:'250 CYBER FICHAS',desc:'Mais fichas por um preço reduzido.',price:35,reward:{tokens:250}},
 {id:'tokens2500',tag:'SUPER OFERTA',title:'550 CYBER FICHAS',desc:'Pacote grande de Cyber Fichas.',price:75,reward:{tokens:550}},
 {id:'bundle300',tag:'PROMOÇÃO',title:'300 + 60',desc:'300 moedas + 60 Cyber Fichas.',price:12,reward:{coins:300,tokens:60}},
 {id:'bundle600',tag:'OFERTA',title:'650 + 130',desc:'Conjunto de moedas e fichas.',price:26,reward:{coins:650,tokens:130}},
 {id:'bundle1000',tag:'MEGA PROMO',title:'1.100 + 230',desc:'O maior conjunto da rotação.',price:45,reward:{coins:1100,tokens:230}}
];
function shuffledOffers(){
 const arr=[...offerCatalog];
 let seed=(player.offer_seed||0)+1; player.offer_seed=seed;
 for(let i=arr.length-1;i>0;i--){seed=(seed*9301+49297)%233280;const j=Math.floor(seed/233280*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}
 return arr;
}
let currentOffers=[];
function renderOffers(){
 const track=$('offersTrack'); if(!track)return;
 if(!currentOffers.length) currentOffers=shuffledOffers();
 const icon=(kind)=>`<img src="assests/ui/${kind}_logo.svg" class="offer-currency-logo" alt="">`;
 track.innerHTML=currentOffers.map((o,idx)=>{
   const visual=o.reward.coins&&o.reward.tokens?`${icon('coin')}${icon('token')}`:o.reward.tokens?icon('token'):icon('coin');
   const reward=[o.reward.coins?`${o.reward.coins} MOEDAS`:'',o.reward.tokens?`${o.reward.tokens} CYBER FICHAS`:''].filter(Boolean).join(' + ');
   return `<article class="offer-tile panel offer-${idx%5}">
     <div class="offer-ribbon">${o.tag}</div>
     <div class="offer-visual">${visual}</div>
     <h3>${o.title}</h3>
     <p>${o.desc}</p>
     <div class="offer-price"><span>◆</span> ${o.price}</div>
     <small>oferta em rotação</small>
     <button onclick="buyOffer('${o.id}')">COMPRAR</button>
   </article>`;
 }).join('');
 if($('offerCycle'))$('offerCycle').textContent=`${currentOffers.length} OFERTAS · ROTACIONANDO`;
}
function rotateOffers(){ currentOffers=shuffledOffers(); saveGame(); renderOffers(); const v=$('offersViewport'); if(v)v.scrollTo({left:0,behavior:'smooth'}); }
async function buyOffer(id){
 const o=offerCatalog.find(x=>x.id===id);if(!o)return;
 if(cyberRemoteMode){try{const r=await remoteCommand('buy_offer',{id});playResourceSet({coins:r.reward?.coins||0,tokens:r.reward?.tokens||0});showOfferReward(o);}catch(e){showModal('OFERTAS','Não foi possível comprar',remoteErrorMessage(e));}return;}
 if(player.gems<o.price){showModal('OFERTAS','Gemas insuficientes',`Esta oferta custa ${o.price} gemas.`);return;}
 player.gems-=o.price;player.coins+=(o.reward.coins||0);player.cyber_fichas+=(o.reward.tokens||0);saveGame();renderAll();playResourceSet({coins:o.reward.coins||0,tokens:o.reward.tokens||0});showOfferReward(o);
}

function showOfferReward(o){
 const rewards=[]; if(o.reward?.coins)rewards.push({kind:'coins',amount:Number(o.reward.coins)}); if(o.reward?.tokens)rewards.push({kind:'tokens',amount:Number(o.reward.tokens)}); if(rewards.length)startGenericRewardSequence(rewards,o.tag||'OFERTA');
}
function closeOfferReward(){ $('offerReward').classList.add('hidden'); }
async function buyGemBundle(){
 const input=$('gemBundleAmount');const gems=Math.max(1,Math.min(100,Number(input?.value)||1));
 if(cyberRemoteMode){try{const r=await remoteCommand('buy_gem_bundle',{gems});playResourceSet({coins:r.coins||0,tokens:r.tokens||0});showOfferReward({tag:'TROCA',reward:{coins:r.coins||0,tokens:r.tokens||0}});}catch(e){showModal('TROCA','Não foi possível trocar',remoteErrorMessage(e));}return;}
 if(player.gems<gems){showModal('TROCA','Gemas insuficientes',`Você precisa de ${gems} gemas.`);return;}
 const amount=gems*100;player.gems-=gems;player.coins+=amount;player.cyber_fichas+=amount;saveGame();renderAll();playResourceSet({coins:amount,tokens:amount});showOfferReward({tag:'TROCA',reward:{coins:amount,tokens:amount}});updateGemBundle();
}

function updateGemBundle(){ const input=$('gemBundleAmount'); if(!input)return; const g=Math.max(1,Math.min(100,Number(input.value)||1)); const amount=Math.min(1000,g*100); $('gemBundleGems').textContent=g; $('gemBundleReward').textContent=`${amount} moedas + ${amount} Cyber Fichas`; }

const boxData={
 mini:{name:'MINI CAIXA',free:true,price:85,currency:'coins',image:'assests/ui/mini_box.png',base:'60% moedas atuais',luck:'30% · 100–300 Cyber fichas · 10% · 5–10 gemas'},
 cyber:{name:'CYBER CAIXA',price:15,currency:'gems',image:'assests/ui/cyber_box.png',base:'50% moedas atuais',luck:'30% · 200–600 Cyber fichas · 20% · 10–40 gemas'},
 mecha:{name:'MECHA CAIXA',price:40,currency:'gems',image:'assests/ui/mecha_box.png',base:'40% moedas atuais',luck:'30% · 400–900 Cyber fichas · 30% · 30–80 gemas'}
};
function rand(a,b){return Math.floor(Math.random()*(b-a+1))+a;}
function showBoxInfo(type){
 const d=boxData[type]; if(!d)return;
 const info={
  mini:{title:'MINI CAIXA', chances:'60% · Moedas\n30% · Cyber Fichas (100–300)\n10% · Gemas (5–10)'},
  cyber:{title:'CYBER CAIXA', chances:'50% · Moedas\n30% · Cyber Fichas (200–600)\n20% · Gemas (10–40)'},
  mecha:{title:'MECHA CAIXA', chances:'40% · Moedas\n30% · Cyber Fichas (400–900)\n30% · Gemas (30–80)'}
 }[type];
 const currencyIcon=(kind)=>`<img src="assests/ui/${kind}_logo.svg" alt="" class="currency-logo-img">`;
 const guaranteedHtml=`<div class="box-info-section"><div class="box-info-heading">GARANTIDO</div><div class="box-info-row"><span class="currency-logo coin-logo">${currencyIcon('coin')}</span><span>+10–100 MOEDAS</span></div><div class="box-info-row"><span class="currency-logo token-logo">${currencyIcon('token')}</span><span>+10–100 CYBER FICHAS</span></div></div><div class="box-info-section"><div class="box-info-heading">RECOMPENSA DE SORTE</div>${info.chances.split('\n').map(line=>{const [chance,...rest]=line.split(' · ');const txt=rest.join(' · ');const icon=txt.toLowerCase().includes('moedas')?'coin':txt.toLowerCase().includes('cyber fichas')?'token':'gem';return `<div class="box-info-row"><span class="chance">${chance}%</span><span class="currency-logo ${icon}-logo">${currencyIcon(icon)}</span><span>${txt.toUpperCase()}</span></div>`}).join('')}</div><small class="box-info-note">A recompensa de sorte vem junto do garantido.</small>`;
 showModal(d.name,info.title,guaranteedHtml);
 const logo=$('modalBoxLogo'), img=$('modalBoxLogoImage');
 if(logo&&img){ img.src=d.image; logo.classList.remove('hidden'); }
}


function playResourceSet({coins=0,tokens=0,gems=0}={}){
  const count=[coins,tokens,gems].filter(v=>Number(v)>0).length;
  if(count>1)playGameSound('mixed',1);
  else if(coins>0)playGameSound('coin',Math.min(1.25,.7+Number(coins)/500));
  else if(tokens>0)playGameSound('token',Math.min(1.25,.7+Number(tokens)/1000));
  else if(gems>0)playGameSound('gem',Math.min(1.25,.75+Number(gems)/100));
}
function playCollectedResources(reward){
 if(!reward)return;
 const coins=Number(reward.guaranteedCoins||0),tokens=Number(reward.guaranteedTokens||0),extraType=(reward.extraType||'').toUpperCase(),extraChance=Number(reward.extraChance||100);
 if(coins>0&&tokens>0)playGameSound('mixed',1);else if(coins>0)playGameSound('coin',Math.min(1.2,.65+coins/250));else if(tokens>0)playGameSound('token',Math.min(1.2,.65+tokens/700));
 if(extraType==='MOEDAS')playGameSound('coin',1);else if(extraType==='CYBER FICHAS')playGameSound('token',1);else if(extraType==='GEMAS')playGameSound('gem',1);
 if(extraChance<40){const intensity=extraChance<=20?1.75:extraChance<=30?1.4:1.15;vibratePattern(extraChance<=20?[35,45,55,45,35]:extraChance<=30?[30,40,35]:[28,32],intensity);}
}
function playBoxCollectionSound(type,count=1){
 const key=type==='mini'?'boxMini':type==='cyber'?'boxCyber':'boxMecha';
 const mult=type==='mini'?Math.min(1.15,.75+count*.04):type==='cyber'?Math.min(1.25,.9+count*.05):Math.min(1.35,1+count*.06);
 playGameSound(key,mult);
}

async function openBox(type, afterComplete=null, options={}){
 resetDaily();const d=boxData[type];if(!d)return;
  const autoStart=!!options.autoStart;
 if(cyberRemoteMode){try{const r=await remoteCommand('open_box',{type});const x=r;showChestOpening(type,{fromInventory:!!x.fromInventory,guaranteedCoins:x.guaranteedCoins,guaranteedTokens:x.guaranteedTokens,extraLabel:x.lucky?`+${x.lucky.amount} ${x.lucky.kind==='coins'?'moedas':x.lucky.kind==='tokens'?'Cyber fichas':'gemas'}`:'',extraType:x.lucky?x.lucky.kind==='coins'?'MOEDAS':x.lucky.kind==='tokens'?'CYBER FICHAS':'GEMAS':'',extraChance:x.lucky?.chance||100}, afterComplete);if(autoStart)setTimeout(activateChestOpening,420);return;}catch(e){showModal(d.name,'Não foi possível abrir',remoteErrorMessage(e));return;}}
 const used=player.box_daily[type]||0;const inventoryCount=player.inventory?.[type]||0;let fromInventory=false;
 if(inventoryCount>0){player.inventory[type]--;fromInventory=true;}else if(type==='mini'){if(used<BOX_DAILY_LIMIT){player.box_daily[type]=used+1;}else{const price=d.price;if(player.coins<price){showModal(d.name,'Saldo insuficiente',`Custa ${price} moedas.`);return;}player.coins-=price;}}else{if(used>=BOX_DAILY_LIMIT){showModal(d.name,'Limite diário atingido',`Você já coletou ${BOX_DAILY_LIMIT}/${BOX_DAILY_LIMIT} hoje.\nO limite reinicia à 00:00 UTC.`);return;}const price=d.price,balance=player[d.currency];if(balance<price){showModal(d.name,'Saldo insuficiente',`Custa ${price} gemas.`);return;}player[d.currency]-=price;player.box_daily[type]=used+1;}
 const guaranteedCoins=rand(10,100),guaranteedTokens=rand(10,100);player.coins+=guaranteedCoins;player.cyber_fichas+=guaranteedTokens;let extraLabel='',extraType='',extraChance=100;const r=Math.random()*100;
 if(type==='mini'){if(r<60){const reward=rand(50,100);player.coins+=reward;extraLabel=`+${reward} moedas`;extraType='MOEDAS';extraChance=60;}else if(r<90){const reward=rand(100,300);player.cyber_fichas+=reward;extraLabel=`+${reward} Cyber fichas`;extraType='CYBER FICHAS';extraChance=30;}else{const reward=rand(5,10);player.gems+=reward;extraLabel=`+${reward} gemas`;extraType='GEMAS';extraChance=10;}}
 else if(type==='cyber'){if(r<50){const reward=rand(100,160);player.coins+=reward;extraLabel=`+${reward} moedas`;extraType='MOEDAS';extraChance=50;}else if(r<80){const reward=rand(200,600);player.cyber_fichas+=reward;extraLabel=`+${reward} Cyber fichas`;extraType='CYBER FICHAS';extraChance=30;}else{const reward=rand(10,40);player.gems+=reward;extraLabel=`+${reward} gemas`;extraType='GEMAS';extraChance=20;}}
 else {if(r<40){const reward=rand(500,800);player.coins+=reward;extraLabel=`+${reward} moedas`;extraType='MOEDAS';extraChance=40;}else if(r<70){const reward=rand(400,900);player.cyber_fichas+=reward;extraLabel=`+${reward} Cyber fichas`;extraType='CYBER FICHAS';extraChance=30;}else{const reward=rand(30,80);player.gems+=reward;extraLabel=`+${reward} gemas`;extraType='GEMAS';extraChance=30;}}
 addXP(10);saveGame();renderAll();showChestOpening(type,{fromInventory,guaranteedCoins,guaranteedTokens,extraLabel,extraType,extraChance},afterComplete);if(autoStart)setTimeout(activateChestOpening,420);
}

function showChestOpening(type,reward,afterComplete=null){
 const d=boxData[type], overlay=$('chestOpening'); if(!overlay)return;
 $('chestGlowImage').src=d.image; $('chestMainImage').src=d.image; $('chestName').textContent=d.name;
 $('chestPhase').textContent='TOQUE NA CAIXA PARA ABRIR'; $('chestSource').textContent=reward.fromInventory?'CAIXA DA SUA COLEÇÃO':'CAIXA DA LOJA';
 $('chestRewardReveal').classList.add('hidden'); $('chestContinue').classList.add('hidden');
 $('chestGuaranteed').innerHTML=`<div><b>+${reward.guaranteedCoins}</b><span>MOEDAS</span></div><div><b>+${reward.guaranteedTokens}</b><span>CYBER FICHAS</span></div>`;
 $('chestLuckyReward').textContent=reward.extraLabel; $('chestLuckyType').textContent=reward.extraType;
 overlay.classList.remove('hidden');
 const chest=$('chestMain'); chest.classList.remove('chest-open-anim','chest-ready'); void chest.offsetWidth; chest.classList.add('chest-ready');
 reward={...reward,type,sourceTitle:reward.sourceTitle||($('chestSource')?.textContent||'CAIXA')}; overlay._rewardData=reward; overlay._afterComplete=afterComplete; overlay.dataset.ready='1';
}
function activateChestOpening(){
 const overlay=$('chestOpening'); if(!overlay||overlay.classList.contains('hidden')||overlay.dataset.ready!=='1')return;
 overlay.dataset.ready='2'; const chest=$('chestMain'); chest.classList.remove('chest-ready'); void chest.offsetWidth; chest.classList.add('chest-open-anim');
 $('chestPhase').textContent='ABRINDO CAIXA...';
 setTimeout(()=>{ const reward=overlay._rewardData||{}; const cb=overlay._afterComplete||null; overlay._rewardData=null; overlay._afterComplete=null; $('chestPhase').textContent='RECOMPENSAS ENCONTRADAS!'; overlay.classList.add('hidden'); startBoxRewardSequence(reward, cb); },1050);
}
function closeChest(){ $('chestOpening').classList.add('hidden'); }

function startBoxRewardSequence(reward, onComplete=null){
 const items=[];
 if(Number(reward.guaranteedCoins)>0)items.push({kind:'coins',amount:Number(reward.guaranteedCoins),label:`+${Number(reward.guaranteedCoins)} MOEDAS`});
 if(Number(reward.guaranteedTokens)>0)items.push({kind:'tokens',amount:Number(reward.guaranteedTokens),label:`+${Number(reward.guaranteedTokens)} CYBER FICHAS`});
 if(reward.extraType){
   const t=String(reward.extraType).toUpperCase();
   const kind=t==='MOEDAS'?'coins':t==='CYBER FICHAS'?'tokens':t==='XP'?'xp':'gems';
   const amount=Number(String(reward.extraLabel||'').match(/[0-9]+/)?.[0]||0);
   if(amount>0)items.push({kind,amount,label:reward.extraLabel});
 }
 if(Number(reward.charXp)>0)items.push({kind:'xp',amount:Number(reward.charXp),label:`+${Number(reward.charXp)} XP DE PERSONAGEM`});
 startRewardSequence(items, reward.sourceTitle || 'RECOMPENSA DA CAIXA', {alreadyApplied:true, boxType:reward.type, onComplete, boxRewardData:reward});
}
let acquiredChestContinueCallback=null;
function showChestAcquired(type,count,source,onContinue=null){
 const d=boxData[type], overlay=$('chestAcquired'); if(!overlay)return;
 $('acquiredGlowImage').src=d.image; $('acquiredMainImage').src=d.image; $('acquiredName').textContent=count>1?`${count}× ${d.name}`:d.name; $('acquiredSource').textContent=source||'RECOMPENSA';
 overlay.dataset.type=type; overlay.dataset.count=String(count||1); acquiredChestContinueCallback=onContinue; overlay.classList.remove('hidden'); playBoxCollectionSound(type,count||1); vibratePattern(type==='mecha'?[28,35,42]:type==='cyber'?[24,30]:18,type==='mecha'?1.3:1);
 const chest=$('acquiredChest'); chest.classList.remove('chest-acquire-anim'); void chest.offsetWidth; chest.classList.add('chest-acquire-anim');
}
function continueAcquiredChest(){
 const overlay=$('chestAcquired'); const type=overlay.dataset.type; if(!type)return; overlay.classList.add('hidden');
 const cb=acquiredChestContinueCallback; acquiredChestContinueCallback=null; openBox(type,cb);
}
function renderBoxCards(){
 Object.entries(boxData).forEach(([type,d])=>{const count=player.box_daily[type]||0;const card=$('box_'+type);if(!card)return;const hasInventory=(player.inventory?.[type]||0)>0;card.querySelector('.box-count').textContent=type==='mini'?`${Math.min(count,BOX_DAILY_LIMIT)}/${BOX_DAILY_LIMIT} grátis hoje`: `${count}/${BOX_DAILY_LIMIT} hoje`;card.querySelector('.box-action').textContent=`COMPRAR · ${d.price}`;card.querySelector('.box-action').disabled=type!=='mini' && count>=BOX_DAILY_LIMIT && !hasInventory;});
}

async function saveName(){
 const name=$('nameInput').value.trim().toUpperCase();if(!name||name===player.player_name)return;const cost=player.name_changes===0?10:50;
 if(cyberRemoteMode){try{const r=await remoteCommand('change_name',{name});showModal('PERFIL','Nome alterado!',`Novo nome: ${r.name}\n-${r.cost} gemas`);}catch(e){showModal('PERFIL','Não foi possível alterar',remoteErrorMessage(e));}return;}
 if(player.gems<cost){showModal('PERFIL','Gemas insuficientes',`Trocar o nome custa ${cost} gemas.`);return;}player.gems-=cost;player.player_name=name;player.name_changes++;saveGame();renderAll();showModal('PERFIL','Nome alterado!',`Novo nome: ${name}\n-${cost} gemas`);
}

function parseRewardString(reward){
 const text=String(reward||'').toUpperCase();const out=[];
 const gem=text.match(/([0-9]+)\s*GEMAS/); if(gem)out.push({kind:'gems',amount:Number(gem[1])});
 const token=text.match(/([0-9]+)\s*(?:CYBER\s+)?FICHAS/); if(token)out.push({kind:'tokens',amount:Number(token[1])});
 const coin=text.match(/([0-9]+)\s*MOEDAS/); if(coin)out.push({kind:'coins',amount:Number(coin[1])});
 return out;
}

function passRewardFor(level){
  // v138: passe grátis enxuto (100 níveis ≈ 2.000 moedas, 120 fichas, 20 gemas e 15 caixas na temporada)
  const L=Math.max(1,Math.floor(Number(level)||1));
  if(L===100)return 'MECHA CAIXA';
  if(L%20===0)return 'CYBER CAIXA';
  if(L%10===5)return 'MINI CAIXA';
  if(L%10===0)return '4 GEMAS';
  if(L%2===0)return '3 FICHAS';
  return '50 MOEDAS';
}
function passPremiumRewardFor(level){
  // v138: trilha premium ≈ 3.000 moedas, 200 fichas, 50 gemas (devolve metade do preço) e 20 caixas
  const L=Math.max(1,Math.floor(Number(level)||1));
  if(L===100)return 'MECHA CAIXA';
  if(L%10===0)return 'CYBER CAIXA';
  if(L%10===5)return 'MINI CAIXA';
  if(L%10===7)return '5 GEMAS';
  if(L%2===0)return '5 FICHAS';
  return '100 MOEDAS';
}
function rewardVisual(reward){
 if(reward.includes('+')){
   return reward.split('+').map(part=>rewardVisual(part.trim())).join('<span class="reward-plus">+</span>');
 }
 if(reward.includes('MINI'))return `<img src="assests/ui/mini_box.png" class="reward-visual-icon">`;
 if(reward === 'CYBER CAIXA' || reward === '1 CYBER')return reward === '1 CYBER' ? `<img src="assests/ui/cyber_box.png" class="reward-visual-icon">` : `<img src="assests/ui/cyber_box.png" class="reward-visual-icon">`;
 if(reward.includes('MECHA'))return `<img src="assests/ui/mecha_box.png" class="reward-visual-icon">`;
 if(reward.includes('GEMAS'))return `<span class="reward-resource-icon gem"><img src="assests/ui/gem_logo.svg" alt="Gemas"></span>`;
 if(reward.includes('FICHAS'))return `<span class="reward-resource-icon token"><img src="assests/ui/token_logo.svg" alt="Cyber Fichas"></span>`;
 return `<span class="reward-resource-icon coin"><img src="assests/ui/coin_logo.svg" alt="Moedas"></span>`;
}
function summarizePassRewards(fn){
 const out={coins:0,tokens:0,gems:0,boxes:0};
 for(let level=1;level<=PASS_LEVELS;level++){
   String(fn(level)).split('+').forEach(part=>{
     const t=part.trim().toUpperCase();let q;
     if((q=t.match(/(\d+)\s*GEMAS/)))out.gems+=+q[1];
     else if((q=t.match(/(\d+)\s*(?:CYBER\s+)?FICHAS/)))out.tokens+=+q[1];
     else if((q=t.match(/(\d+)\s*MOEDAS/)))out.coins+=+q[1];
     else if(/CAIXA/.test(t)){q=t.match(/^(\d+)/);out.boxes+=q?+q[1]:1;}
   });
 }
 return out;
}
function updatePassTotals(){
 const f=summarizePassRewards(passRewardFor), pr=summarizePassRewards(passPremiumRewardFor);
 const vals={passFreeCoins:`${f.coins.toLocaleString('pt-BR')} MOEDAS`,passFreeTokens:`${f.tokens.toLocaleString('pt-BR')} CYBER FICHAS`,passFreeGems:`${f.gems} GEMAS`,passFreeBoxes:`${f.boxes} CAIXAS`,passPremiumCoins:`${pr.coins.toLocaleString('pt-BR')} MOEDAS`,passPremiumTokens:`${pr.tokens.toLocaleString('pt-BR')} CYBER FICHAS`,passPremiumGems:`${pr.gems} GEMAS`,passPremiumBoxes:`${pr.boxes} CAIXAS`};
 Object.entries(vals).forEach(([id,v])=>{if($(id))$(id).textContent=v});
 const map={modalFreeCoins:vals.passFreeCoins,modalFreeTokens:vals.passFreeTokens,modalFreeGems:vals.passFreeGems,modalFreeBoxes:vals.passFreeBoxes,modalPremiumCoins:vals.passPremiumCoins,modalPremiumTokens:vals.passPremiumTokens,modalPremiumGems:vals.passPremiumGems,modalPremiumBoxes:vals.passPremiumBoxes};
 Object.entries(map).forEach(([id,v])=>{if($(id))$(id).textContent=v});
}
function showPassTotals(){ updatePassTotals(); $('passTotalsModal')?.classList.remove('hidden'); }
function closePassTotals(){ $('passTotalsModal')?.classList.add('hidden'); }
function renderPass(){
 const el=$('rewardTrack');if(!el)return; updatePassTotals();
 const start=Math.max(1,Number($('passStart')?.value)||1);const end=Math.min(PASS_LEVELS,start+19); const html=[];
 for(let i=start;i<=end;i++){ const reward=passRewardFor(i), unlocked=i<=player.pass_level, claimed=player.pass_claimed.includes(i); const icon=rewardVisual(reward); html.push(`<div class="reward-node ${unlocked?'unlocked':''} ${claimed?'claimed':''}"><small>${i}</small>${icon}<b>${reward}</b><span>${claimed?'COLETADO':unlocked?'LIBERADO':'BLOQUEADO'}</span>${unlocked&&!claimed?`<button class="claim-reward" onclick="claimPassReward(${i})">COLETAR</button>`:''}</div>`); }
 el.innerHTML=html.join(''); if($('passRange'))$('passRange').textContent=`PATAMARES ${start}–${end} / ${PASS_LEVELS}`;
 const pr=$('premiumRewardTrack'); if(pr){ const ph=[]; for(let i=start;i<=end;i++){const reward=passPremiumRewardFor(i), unlocked=i<=player.pass_level, claimed=player.premium_claimed.includes(i); const premiumOpen=player.premium_pass&&premiumUnlockVisual; ph.push(`<div class="reward-node premium-node ${unlocked?'unlocked':''} ${claimed?'claimed':''}"><small>${i}</small>${rewardVisual(reward)}<b>${reward}</b><span>${!premiumOpen?'🔒 PREMIUM':claimed?'COLETADO':unlocked?'LIBERADO':'BLOQUEADO'}</span>${premiumOpen&&unlocked&&!claimed?`<button class="claim-reward" onclick="claimPremiumReward(${i})">COLETAR</button>`:''}</div>`)} pr.innerHTML=ph.join(''); }
 if($('premiumRange'))$('premiumRange').textContent=`PATAMARES ${start}–${end} / ${PASS_LEVELS}`;
 if($('premiumBuyButton')){ $('premiumBuyButton').textContent=player.premium_pass?'PREMIUM ATIVO':'COMPRAR · '+PREMIUM_PRICE+' GEMAS'; $('premiumBuyButton').disabled=player.premium_pass; }
}
async function buyPremiumPass(){
 if(player.premium_pass)return;
 if(cyberRemoteMode){try{await remoteCommand('buy_premium');playGameSound('premium',1.35);playUISound('buy');vibratePattern([55,75,95,75,55],1.45);const el=$('premiumAcquired');if(el){el.classList.remove('hidden');void el.offsetWidth;el.classList.add('premium-acquired-anim');setTimeout(()=>{el.classList.add('hidden');premiumUnlockVisual=true;renderAll();},2500);}else{premiumUnlockVisual=true;renderAll();}return;}catch(e){showModal('CYBER PASS','Não foi possível adquirir',remoteErrorMessage(e));return;}}
 if(player.gems<PREMIUM_PRICE){showModal('CYBER PASS','Gemas insuficientes','O Premium custa '+PREMIUM_PRICE+' gemas.');return;}player.gems-=PREMIUM_PRICE;player.premium_pass=true;premiumUnlockVisual=false;saveGame();renderAll();playGameSound('premium',1.35);playUISound('buy');vibratePattern([55,75,95,75,55],1.45);const el=$('premiumAcquired');if(el){el.classList.remove('hidden');void el.offsetWidth;el.classList.add('premium-acquired-anim');setTimeout(()=>{el.classList.add('hidden');premiumUnlockVisual=true;renderAll();},2500);}else{premiumUnlockVisual=true;renderAll();}
}

async function claimPremiumReward(level){
 if(!player.premium_pass||level>player.pass_level||player.premium_claimed.includes(level))return;
 if(cyberRemoteMode){try{const r=await remoteCommand('claim_premium_reward',{level});const reward=r.reward;const chest=grantRewardLocalVisual(reward);if(chest)showChestAcquired(chest.type,chest.count,'CYBER PASS PREMIUM');else startGenericRewardSequence(parseRewardString(reward),`CYBER PASS PREMIUM · PATAMAR ${level}`);}catch(e){showModal('PREMIUM','Não foi possível coletar',remoteErrorMessage(e));}return;}
 const reward=passPremiumRewardFor(level);player.premium_claimed.push(level);const chest=grantReward(reward);saveGame();renderAll();if(chest)showChestAcquired(chest.type,chest.count,'CYBER PASS PREMIUM');else startGenericRewardSequence(parseRewardString(reward),`CYBER PASS PREMIUM · PATAMAR ${level}`);
}
function grantRewardLocalVisual(reward){
 const t=String(reward||'').toUpperCase();
 if(/(FICHAS|GEMAS|MOEDAS)/.test(t)&&!/CAIXA/.test(t))return null;
 const q=t.match(/^(\d+)/),n=q?+q[1]:1;
 if(/MECHA/.test(t))return {type:'mecha',count:n};
 if(/CYBER/.test(t))return {type:'cyber',count:n};
 if(/MINI/.test(t))return {type:'mini',count:n};
 return null;
}

function shiftPass(dir){const input=$('passStart');let v=Number(input.value)||1;v=Math.max(1,Math.min(PASS_LEVELS-19,v+dir*19));input.value=v;renderPass();}
function grantReward(reward){
 // v138: lê qualquer texto de recompensa ("50 MOEDAS", "3 FICHAS", "5 GEMAS", "CYBER CAIXA", "1 MINI + 1 CYBER"...)
 let box=null;
 String(reward||'').split('+').forEach(part=>{
   const t=part.trim().toUpperCase();let q;
   if((q=t.match(/(\d+)\s*GEMAS/)))player.gems+=+q[1];
   else if((q=t.match(/(\d+)\s*(?:CYBER\s+)?FICHAS/)))player.cyber_fichas+=+q[1];
   else if((q=t.match(/(\d+)\s*MOEDAS/)))player.coins+=+q[1];
   else if(/CAIXA/.test(t)||/^\d+\s*(MINI|CYBER|MECHA)/.test(t)){
     const ty=/MECHA/.test(t)?'mecha':/CYBER/.test(t)?'cyber':'mini',n=(q=t.match(/^(\d+)/))?+q[1]:1;
     player.inventory[ty]=(player.inventory[ty]||0)+n;if(!box)box={type:ty,count:n};
   }
 });
 return box;
}


async function claimPassReward(level){
 if(level>player.pass_level||player.pass_claimed.includes(level))return;
 if(cyberRemoteMode){try{const r=await remoteCommand('claim_pass_reward',{level});const reward=r.reward;const chest=grantRewardLocalVisual(reward);if(chest)showChestAcquired(chest.type,chest.count,'CYBER PASS');else startGenericRewardSequence(parseRewardString(reward),`CYBER PASS · PATAMAR ${level}`);}catch(e){showModal('CYBER PASS','Não foi possível coletar',remoteErrorMessage(e));}return;}
 const reward=passRewardFor(level);player.pass_claimed.push(level);const chest=grantReward(reward);saveGame();renderAll();if(chest)showChestAcquired(chest.type,chest.count,'CYBER PASS');else startGenericRewardSequence(parseRewardString(reward),`CYBER PASS · PATAMAR ${level}`);
}

function accountRewardFor(level){
  // v138: progressão da conta (1 a 1000) com recompensas pequenas por nível e caixas só nos marcos
  const L=Math.max(1,Math.floor(Number(level)||1));
  if(L%100===0)return 'MECHA CAIXA';
  if(L%50===0)return 'MECHA CAIXA';
  if(L%10===0)return 'CYBER CAIXA';
  if(L%25===0)return '5 GEMAS';
  if(L%5===0)return 'MINI CAIXA';
  if(L%2===0)return '3 FICHAS';
  return '40 MOEDAS';
}
function renderAccountPath(){
 const el=$('accountTrack');if(!el)return; const start=Math.max(1,Number($('accountStart')?.value)||1);const end=Math.min(1000,start+19);let html='';
 for(let i=start;i<=end;i++){ const reward=accountRewardFor(i), unlocked=i<=player.level, claimed=player.account_claimed.includes(i); html+=`<div class="reward-node account-node ${unlocked?'unlocked':''} ${claimed?'claimed':''}"><small>${i}</small>${rewardVisual(reward)}<b>${reward}</b><span>${claimed?'COLETADO':unlocked?'ALCANÇADO':'BLOQUEADO'}</span>${unlocked&&!claimed?`<button class="claim-reward" onclick="claimAccountReward(${i})">COLETAR</button>`:''}</div>`; }
 el.innerHTML=html; if($('accountRange'))$('accountRange').textContent=`PATAMARES ${start}–${end} / 1000`;
}
function shiftAccount(dir){const input=$('accountStart');let v=Number(input.value)||1;v=Math.max(1,Math.min(981,v+dir*19));input.value=v;renderAccountPath();}
async function claimAccountReward(level){
 if(level>player.level||player.account_claimed.includes(level))return;
 if(cyberRemoteMode){try{const r=await remoteCommand('claim_account_reward',{level});const chest=grantRewardLocalVisual(r.reward);if(chest)showChestAcquired(chest.type,chest.count,'PROGRESSÃO');else startGenericRewardSequence(parseRewardString(r.reward),`PROGRESSÃO · PATAMAR ${level}`);}catch(e){showModal('PROGRESSÃO','Não foi possível coletar',remoteErrorMessage(e));}return;}
 const reward=accountRewardFor(level);player.account_claimed.push(level);const chest=grantReward(reward);saveGame();renderAll();if(chest)showChestAcquired(chest.type,chest.count,'PROGRESSÃO');else startGenericRewardSequence(parseRewardString(reward),`PROGRESSÃO · PATAMAR ${level}`);
}

const MISSION_XP = 100;
function renderMissions(){
 const el=$('missionsList'); if(!el)return;
 const m=player.missions||{};
 const missions=[
  {id:'character',title:'COLETAR O PERSONAGEM',desc:'Crie o personagem e depois volte aqui para coletar esta missão.',reward:'+100 XP  ·  +20 GEMAS',done:!!m.character_created,claimed:!!m.character_claimed},
  {id:'first_match',title:'COMPLETAR A PRIMEIRA PARTIDA',desc:'A missão será concluída assim que a primeira partida terminar.',reward:'+100 XP',done:!!m.first_match,claimed:!!m.first_match_claimed}
 ];
 el.innerHTML=missions.map(x=>`<div class="mission-card panel ${x.done?'mission-done':''} ${x.claimed?'mission-claimed':''}">
   <div class="mission-icon">${x.id==='character'?'★':'⚔'}</div><div class="mission-copy"><small>MISSÃO</small><h2>${x.title}</h2><p>${x.desc}</p><b>${x.reward}</b></div><div class="mission-action">${x.claimed?'<span class="mission-status">COLETADA</span>':x.done?`<button onclick="claimMission('${x.id}')">COLETAR</button>`:'<span class="mission-status">EM ANDAMENTO</span>'}</div></div>`).join('');
}
async function completeCharacterCreationMission(){
 if(cyberRemoteMode){try{await remoteCommand('mark_character_created');}catch(e){showModal('MISSÃO','Não foi possível atualizar',remoteErrorMessage(e));}return;}
 if(!player.missions)player.missions={...DEFAULT_PLAYER.missions};player.missions.character_created=true;saveGame();renderAll();
}
/* tutorial: o "concluído" fica salvo na CONTA (conta online = servidor; conta local/convidado = neste aparelho) */
function tutorialIsDone(){ return !!(player&&player.missions&&player.missions.tutorial_v2); }
async function markTutorialDone(){
 if(tutorialIsDone())return true;
 if(cyberRemoteMode){try{await remoteCommand('mark_tutorial_done');return true;}catch(e){return false;}}
 if(!player.missions)player.missions={...DEFAULT_PLAYER.missions};player.missions.tutorial_v2=true;saveGame();return true;
}
window.tutorialIsDone=tutorialIsDone;window.markTutorialDone=markTutorialDone;window.tutorialAccountId=()=>activeCyberAccountId||'guest';
async function completeFirstMatchMission(){
 if(cyberRemoteMode){try{await remoteCommand('mark_first_match');}catch(e){showModal('MISSÃO','Não foi possível atualizar',remoteErrorMessage(e));}return;}
 if(!player.missions)player.missions={...DEFAULT_PLAYER.missions};player.missions.first_match=true;saveGame();renderAll();
}
async function claimMission(id){
 if(cyberRemoteMode){try{const r=await remoteCommand('claim_mission',{id});const rewards=id==='character'?[{kind:'xp',amount:100},{kind:'gems',amount:Number(r.gems||20)}]:[{kind:'xp',amount:100}];startGenericRewardSequence(rewards,id==='character'?'MISSÃO · PERSONAGEM':'MISSÃO · PRIMEIRA PARTIDA');}catch(e){showModal('MISSÃO','Não foi possível coletar',remoteErrorMessage(e));}return;}
 const m=player.missions||{};if(id==='character'&&!m.character_created)return;if(id==='first_match'&&!m.first_match)return;if(id==='character'&&m.character_claimed)return;if(id==='first_match'&&m.first_match_claimed)return;if(id==='character'){m.character_claimed=true;player.gems+=20;addXP(MISSION_XP);}if(id==='first_match'){m.first_match_claimed=true;addXP(MISSION_XP);}player.missions=m;saveGame();renderAll();startGenericRewardSequence(id==='character'?[{kind:'xp',amount:100},{kind:'gems',amount:20}]:[{kind:'xp',amount:100}],id==='character'?'MISSÃO · PERSONAGEM':'MISSÃO · PRIMEIRA PARTIDA');
}

function showModal(type,title,text){$('modalType').textContent=type;$('modalTitle').textContent=title;const modalText=$('modalText');if(modalText){if(typeof text==='string' && /<\/?[a-z][\s\S]*>/i.test(text)){modalText.innerHTML=text;}else{modalText.textContent=text;}}$('rewardModal').classList.remove('hidden');}
function closeModal(){ $('rewardModal').classList.add('hidden'); const logo=$('modalBoxLogo'); if(logo)logo.classList.add('hidden'); }

let canvas=$('game');
function enableDragScroll(trackId){
 const viewport=$(trackId)?.parentElement; if(!viewport) return;
 let dragging=false,moved=false,startX=0,startScroll=0;
 viewport.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('button,a,input'))return;dragging=true;moved=false;startX=e.clientX;startScroll=viewport.scrollLeft;});
 viewport.addEventListener('pointermove',e=>{if(!dragging)return;if(!moved&&Math.abs(e.clientX-startX)<8)return;if(!moved){moved=true;viewport.setPointerCapture?.(e.pointerId);viewport.classList.add('dragging');}viewport.scrollLeft=startScroll-(e.clientX-startX);});
 const stop=e=>{dragging=false;viewport.classList.remove('dragging');try{viewport.releasePointerCapture?.(e.pointerId)}catch(_){} };
 viewport.addEventListener('pointerup',stop);viewport.addEventListener('pointercancel',stop);viewport.addEventListener('pointerleave',()=>{if(dragging)dragging=false;});
}
enableDragScroll('rewardTrack');
enableDragScroll('accountTrack');
function enableMissionDrag(){
 const v=$('missionsList'); if(!v)return; let dragging=false,moved=false,startX=0,startScroll=0;
 v.addEventListener('pointerdown',e=>{if(e.target.closest&&e.target.closest('button,a,input'))return;dragging=true;moved=false;startX=e.clientX;startScroll=v.scrollLeft;});
 v.addEventListener('pointermove',e=>{if(!dragging)return;if(!moved&&Math.abs(e.clientX-startX)<8)return;if(!moved){moved=true;v.setPointerCapture?.(e.pointerId);v.classList.add('dragging');}v.scrollLeft=startScroll-(e.clientX-startX);});
 const stop=e=>{dragging=false;v.classList.remove('dragging');try{v.releasePointerCapture?.(e.pointerId)}catch(_){} };
 v.addEventListener('pointerup',stop);v.addEventListener('pointercancel',stop);
}

function enableOfferDrag(){ enableDragScroll('offersTrack'); }
let shopPage=0;
const SHOP_PAGE_COUNT=3;
function shiftShop(dir){ const v=$('shopViewport'); if(!v)return; shopPage=Math.max(0,Math.min(SHOP_PAGE_COUNT-1,shopPage+dir)); const page=v.querySelectorAll('.shop-page')[shopPage]; v.scrollTo({left:page?page.offsetLeft:shopPage*v.clientWidth,behavior:'smooth'}); updateShopRange(); }
function updateShopRange(){ if($('shopRange'))$('shopRange').textContent=`LOJA · ${shopPage+1} / ${SHOP_PAGE_COUNT}`; }
function enableShopDrag(){
 const v=$('shopViewport'); if(!v)return;
 let dragging=false,moved=false,startX=0,startScroll=0;
 const isInner=e=>e.target && !!e.target.closest('#offersViewport');
 v.addEventListener('pointerdown',e=>{if(isInner(e)||(e.target.closest&&e.target.closest('button,a,input')))return;dragging=true;moved=false;startX=e.clientX;startScroll=v.scrollLeft;});
 v.addEventListener('pointermove',e=>{if(!dragging)return;if(!moved&&Math.abs(e.clientX-startX)<8)return;if(!moved){moved=true;v.setPointerCapture?.(e.pointerId);v.classList.add('dragging');}v.scrollLeft=startScroll-(e.clientX-startX);});
 const stop=e=>{if(!dragging)return;dragging=false;v.classList.remove('dragging');const w=v.clientWidth;if(w){shopPage=Math.max(0,Math.min(SHOP_PAGE_COUNT-1,Math.round(v.scrollLeft/w)));v.scrollTo({left:shopPage*w,behavior:'smooth'});updateShopRange();}try{v.releasePointerCapture?.(e.pointerId)}catch(_){} };
 v.addEventListener('pointerup',stop);v.addEventListener('pointercancel',stop);
 v.addEventListener('scroll',()=>{if(!dragging){const pages=[...v.querySelectorAll('.shop-page')]; if(pages.length){let best=0,bestDist=Infinity;pages.forEach((pg,i)=>{const d=Math.abs(pg.offsetLeft-v.scrollLeft);if(d<bestDist){bestDist=d;best=i;}});shopPage=best;updateShopRange();document.querySelectorAll('#shop .shop-sidebar button').forEach((b,i)=>b.classList.toggle('active',i===shopPage));}}},{passive:true});
}
initLobbyMusic(); updateLobbyMusic();
installUIFeedback();
setTimeout(()=>{ renderOffers(); updateGemBundle(); enableOfferDrag(); enableShopDrag(); enableMissionDrag(); updateShopRange(); },50);
setInterval(rotateOffers,OFFER_CYCLE_MS);
setInterval(async()=>{if(!cyberRemoteMode)return;try{const t=await cyberApi('/time');cyberSeasonStartUTC=t.seasonStart;cyberServerDayKey=t.dayKey;cyberGemOfferAvailable=t.gemOfferAvailable!==false;cyberGemOfferExpiresUTC=t.gemOfferExpires||null;renderAll();}catch(_){}},60000);

function enterLobbyFromStart(){
  if(window.cyberBootReady===false||window.cyberLoadingActive===true)return;   // v138: só entra depois de verificar/baixar os recursos
  const gate=$('startGate'); if(!gate || gate.dataset.started==='1')return;
  gate.dataset.started='1'; gate.classList.add('starting');
  // O clique libera o áudio e inicia direto no ponto musical, sem os ~7s de silêncio.
  lobbyMusicUserStarted=true;
  initLobbyMusic();
  if(lobbyMusicA){ lobbyMusicA.currentTime=LOBBY_MUSIC_START; lobbyMusicA.volume=0; }
  const play=lobbyMusicA?.play(); if(play&&play.catch)play.catch(()=>{});
  lobbyMusicActive=lobbyMusicA;
  setTimeout(()=>{
    gate.classList.add('hidden');
    $('lobby').classList.remove('hidden');
    renderAll();
    updateLobbyMusic();
    showAccountAfterLobbyDelay();
  },700);
}
function showStartGate(){
  const gate=$('startGate'); if(!gate)return;
  gate.classList.remove('hidden','starting'); gate.dataset.started='0';
}
$('startGate')?.addEventListener('click',enterLobbyFromStart);
$('startGate')?.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();enterLobbyFromStart();}});
(function bootGo(n){if(window.cyberBoot&&window.cyberBoot()!==false)return;if(n>0)return setTimeout(()=>bootGo(n-1),80);$('splash').classList.add('hidden');window.cyberBootReady=true;showStartGate();})(60);loadGame();bootstrapCyberServer();

// v52 — pausa a trilha quando a página sai de primeiro plano (troca de app/aba, navegador minimizado ou navegação).
function pauseLobbyMusicForBackground(){
  lobbyMusicPageHidden=true;
  [lobbyMusicA,lobbyMusicB].forEach(m=>{if(m){m.pause();m.volume=0;}});
}
function resumeLobbyMusicFromBackground(){
  if(!lobbyMusicPageHidden)return;
  lobbyMusicPageHidden=false;
  if(lobbyMusicUserStarted && !$('game')?.classList.contains('hidden')){
    initLobbyMusic();
    const active=lobbyMusicActive||lobbyMusicA;
    if(active){
      if(active.readyState>=1 && active.currentTime<LOBBY_MUSIC_START)active.currentTime=LOBBY_MUSIC_START;
      setAudioGain(active,getMusicGain()); active.volume=LOBBY_MUSIC_VOLUME;
      const play=active.play(); if(play&&play.catch)play.catch(()=>{});
    }
  }
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden')pauseLobbyMusicForBackground();
  else resumeLobbyMusicFromBackground();
});
window.addEventListener('pagehide',pauseLobbyMusicForBackground);
window.addEventListener('pageshow',resumeLobbyMusicFromBackground);

['pointerdown','touchstart','keydown'].forEach(evt=>document.addEventListener(evt,()=>{if(!$('lobby')?.classList.contains('hidden'))updateLobbyMusic();},{once:false,passive:true}));

// v13: garante a leitura da descrição da Loja sem alterar a navegação.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#shop .shop-info, #shop .store-info").forEach(el => {
    el.style.fontSize = "clamp(13px, 1.9vw, 18px)";
    el.style.lineHeight = "1.3";
  });
});

// v24 — navegação visual da Loja e dados auxiliares do painel do Pass.
function setShopPage(page){
  shopPage=Math.max(0,Math.min(SHOP_PAGE_COUNT-1,Number(page)||0));
  const v=$('shopViewport');
  const target=v?.querySelectorAll('.shop-page')[shopPage];
  if(v) v.scrollTo({left:target?target.offsetLeft:shopPage*v.clientWidth,behavior:'smooth'});
  updateShopRange();
  document.querySelectorAll('#shop .shop-sidebar button').forEach((b,i)=>b.classList.toggle('active',i===shopPage));
}


// v25 — loja abre em OFERTAS e os carrosséis internos não puxam a página de volta.
setTimeout(()=>{
  shopPage=0;
  const v=$('shopViewport'); if(v) v.scrollLeft=0;
  document.querySelectorAll('.shop-sidebar button').forEach((b,i)=>b.classList.toggle('active',i===0));
  const offers=$('offersViewport');
  if(offers){
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(ev=>offers.addEventListener(ev,e=>e.stopPropagation(),true));
  }
},120);


// v72 — Cyber Accounts e fluxo inicial obrigatório após o Lobby.
document.addEventListener('DOMContentLoaded',()=>{
  updateAccountUI();
  $('accountNameInput')?.addEventListener('input',()=>{if(accountGateMode==='create')updateAccountUI();});
  ['accountNameInput','accountPasswordInput','loginCyberIdInput','loginPasswordInput'].forEach(id=>$(id)?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();accountGateMode==='login'?loginCyberAccount():createCyberAccount();}}));
});

// v69 — abre as configurações tanto pela engrenagem do Lobby quanto pelas telas.
document.addEventListener('click', e=>{
  const el=e.target.closest?.('.lobby-settings,.screen-settings');
  if(!el)return;
  e.preventDefault();
  e.stopPropagation();
  openSettings();
}, {capture:true});


// v74 — códigos comunitários, Caixa de Entrada, coletas sequenciais e painel local do dono.
const COMMUNITY_CODE='CYBERARENA001';
function enqueueCodeReward(code){
  if(!player||!code)return;
  const rewards=[{kind:'gems',amount:30},{kind:'box',boxType:'mini'},{kind:'box',boxType:'mini'},{kind:'box',boxType:'cyber'},{kind:'box',boxType:'mecha'}];
  player.inbox=Array.isArray(player.inbox)?player.inbox.filter(m=>m&&m.type==='code'):[];
  player.inbox.push({id:'code-'+Date.now()+'-'+Math.random().toString(36).slice(2,8),type:'code',code,title:'CÓDIGO '+code,createdAt:Date.now(),rewards});
}

// Código secreto: é o único lugar onde aparece a barra/selo "criado com…" que a hospedagem coloca no site.
const SECRET_BADGE_CODE='K7QXV9ZR2M48WP';
function openSecretBadgeScreen(){
 let ov=$('secretBadgeScreen');
 if(!ov){ov=document.createElement('div');ov.id='secretBadgeScreen';ov.dataset.cyber='1';ov.className='secret-badge-screen';
  ov.innerHTML='<div class="secret-badge-card panel"><small>ÁREA SECRETA</small><h2>CRÉDITOS DA CRIAÇÃO</h2><p>Esta tela só abre com o código secreto. A barra de criação e de alterações fica guardada aqui e não aparece em nenhum outro lugar do jogo.</p><div id="cyberSecretBadge" class="secret-badge-slot"></div><button id="secretBadgeClose">FECHAR</button></div>';
  document.body.appendChild(ov);$('secretBadgeClose').onclick=closeSecretBadgeScreen;}
 ov.classList.remove('hidden');
 if(window.top!==window.self){try{parent.postMessage({type:'cyberarena:secret-badge',open:true},'*');}catch(_){}}
 const n=window.CyberBadge?window.CyberBadge.show($('cyberSecretBadge')):0;
 if(!n)$('cyberSecretBadge').innerHTML='<em>Nenhuma barra foi colocada pela hospedagem nesta página agora.</em>';
 try{playUISound('open');}catch(_){}
}
function closeSecretBadgeScreen(){if(window.top!==window.self){try{parent.postMessage({type:'cyberarena:secret-badge',open:false},'*');}catch(_){}}window.CyberBadge?.hide();const slot=$('cyberSecretBadge');if(slot)slot.innerHTML='';$('secretBadgeScreen')?.classList.add('hidden');try{playUISound('back');}catch(_){}}
function getCommunityCodeState(){try{return JSON.parse(localStorage.getItem('cyberArenaCommunityCodes')||'{}')||{};}catch(_){return {};}}
function saveCommunityCodeState(s){localStorage.setItem('cyberArenaCommunityCodes',JSON.stringify(s));}
function codeIsActive(){const s=getCommunityCodeState();return s[COMMUNITY_CODE]!==false;}
function redeemCommunityCode(){
 const input=$('redeemCodeInput'); const code=(input?.value||'').trim().toUpperCase(); const status=$('codeStatus');
 if(code.replace(/[^A-Z0-9]/g,'')===SECRET_BADGE_CODE){if(input)input.value='';if(status)status.textContent='';openSecretBadgeScreen();return;}
 if(cyberRemoteMode){ cyberApi('/codes/redeem',{method:'POST',headers:{'Idempotency-Key':newIdempotencyKey()},body:JSON.stringify({code})}).then(r=>{player=normalizePlayer(r.state);cyberRemoteVersion=Number(r.version||cyberRemoteVersion+1);renderAll();playUISound('open');vibratePattern([45,70,95],1.1);if(status)status.textContent='Código resgatado! As recompensas estão na Caixa de Entrada.';if(input)input.value='';openScreen('inbox');}).catch(e=>{if(status)status.textContent=e.message==='already_redeemed'?'Você já resgatou este código nesta conta.':e.message==='code_inactive'?'Este código não está ativo no momento.':e.message==='auth_required'?'Entre em uma Cyber Account para resgatar códigos.':'Não foi possível resgatar o código.';});return;}
 if(!code){if(status)status.textContent='Digite um código.';return;}
 if(code!==COMMUNITY_CODE){if(status)status.textContent='Código inválido.';return;}
 if(!codeIsActive()){if(status)status.textContent='Este código não está ativo no momento.';return;}
 if(accountMode!=='account'||!activeCyberAccountId){if(status)status.textContent='Entre em uma Cyber Account para resgatar códigos.';return;}
 player=normalizePlayer(player); if(player.redeemed_codes.includes(code)){if(status)status.textContent='Você já resgatou este código nesta conta.';return;}
 player.redeemed_codes.push(code); enqueueCodeReward(code);
 saveGame();renderAll();playUISound('open');vibratePattern([45,70,95],1.1);if(status)status.textContent='Código resgatado! As recompensas estão na Caixa de Entrada.';if(input)input.value='';openScreen('inbox');
}
function rewardKindLabel(r){if(r.kind==='gems')return `${r.amount} GEMAS`;if(r.kind==='coins')return `${r.amount} MOEDAS`;if(r.kind==='tokens')return `${r.amount} CYBER FICHAS`;return `${r.boxType==='mini'?'MINI':r.boxType==='cyber'?'CYBER':'MECHA'} CAIXA`;}
function rewardIconHtml(r){if(r.kind==='box'){const src=r.boxType==='mini'?'assests/ui/mini_box.png':r.boxType==='cyber'?'assests/ui/cyber_box.png':'assests/ui/mecha_box.png';return `<img src="${src}" alt="">`;}const src=r.kind==='coins'?'assests/ui/coin_logo.svg':r.kind==='tokens'?'assests/ui/token_logo.svg':'assests/ui/gem_logo.svg';const label=r.kind==='coins'?'Moedas':r.kind==='tokens'?'Cyber Fichas':'Gemas';return `<span class="resource-symbol ${r.kind}"><img src="${src}" alt="${label}"></span>`;}
function renderInbox(){
 const el=$('inboxList');if(!el)return;const list=player.inbox||[];
 if(!list.length){el.innerHTML='<div class="inbox-empty">Sua Caixa de Entrada está vazia.</div>';return;}
 el.innerHTML=list.map((m,i)=>`<div class="inbox-item"><div class="mail-icon">✉</div><div><strong>${m.title||'RECOMPENSA'}</strong><small>${m.rewards?.length||0} recompensas pendentes · ${new Date(m.createdAt||Date.now()).toLocaleDateString('pt-BR')}</small></div><button onclick="startInboxReward(${i})">RESGATAR</button></div>`).join('');
}
let rewardSequenceState=null;
function rewardSequenceIconHtml(r){
 if(r.kind==='xp')return '<span class="reward-xp-icon">XP</span>';
 return rewardIconHtml(r);
}
function rewardSequenceLabel(r){
 if(r.kind==='xp')return `+${Number(r.amount)||0} XP`;
 return rewardKindLabel(r);
}
function startRewardSequence(rewards,title='RECOMPENSA',{alreadyApplied=false,onComplete=null,boxType=null,boxRewardData=null}={}){
 const list=(Array.isArray(rewards)?rewards:[]).filter(Boolean).map(x=>({...x}));
 if(!list.length){ if(onComplete)onComplete(); return; }
 rewardSequenceState={messageId:null,rewards:list,pos:0,collected:[],total:list.length,title,alreadyApplied,onComplete,boxType,boxRewardData,busy:false,summary:false};
 showRewardSequenceStep();
}
function startInboxReward(index){
 const msg=player.inbox?.[index];if(!msg)return;
 rewardSequenceState={inboxIndex:index,messageId:msg.id,rewards:Array.isArray(msg.rewards)?msg.rewards.map(x=>({...x})):[],pos:0,collected:[],total:Array.isArray(msg.rewards)?msg.rewards.length:0,title:msg.title||'CAIXA DE ENTRADA',alreadyApplied:false,onComplete:null,boxType:null,busy:false,summary:false};
 inboxBoxFlowState=null;
 showRewardSequenceStep();
}
function playRewardSequenceFeedback(r){
 if(r.kind==='box'){
   const key=r.boxType==='mini'?'boxMini':r.boxType==='cyber'?'boxCyber':'boxMecha';
   playGameSound(key,r.boxType==='mini'?.85:r.boxType==='cyber'?1:1.2);
   vibratePattern(r.boxType==='mecha'?[30,40,55]:r.boxType==='cyber'?[24,32]:[20,26],r.boxType==='mecha'?1.3:1.05);
 }else if(r.kind==='coins')playGameSound('coin',Math.min(1.25,.75+Number(r.amount||0)/500));
 else if(r.kind==='tokens')playGameSound('token',Math.min(1.25,.75+Number(r.amount||0)/1000));
 else if(r.kind==='gems')playGameSound('gem',Math.min(1.3,.8+Number(r.amount||0)/100));
 else if(r.kind==='xp')playUISound('account');
}

function showRewardSequenceStep(){
 const st=rewardSequenceState;if(!st)return;
 const ov=$('rewardSequence');if(!ov)return;
 if(st.summary){
   $('rewardSeqKicker').textContent='TUDO RESGATADO';
   $('rewardSeqIcon').innerHTML='<span class="reward-ready-icon">✓</span>';
   $('rewardSeqTitle').textContent='PRONTO';
   $('rewardSeqText').textContent=`Você resgatou ${st.collected.length} recompensa${st.collected.length===1?'':'s'}.`;
   const summary=st.collected.map(r=>`<span class="reward-summary-item">${rewardSequenceIconHtml(r)}<b>${rewardSequenceLabel(r)}</b></span>`).join('');
   $('rewardSeqButton').textContent='PRONTO';
   $('rewardSeqCount').innerHTML=`<div class="reward-summary-list">${summary}</div>`;
   ov.classList.remove('hidden');
   return;
 }
 const r=st.rewards[0];
 if(!r){st.summary=true;showRewardSequenceStep();return;}
 $('rewardSeqKicker').textContent=st.title||'RECOMPENSA';
 $('rewardSeqIcon').innerHTML=rewardSequenceIconHtml(r);
 $('rewardSeqTitle').textContent=rewardSequenceLabel(r);
 $('rewardSeqText').textContent=st.alreadyApplied?'RECOMPENSA REVELADA. TOQUE PARA LIBERAR A PRÓXIMA.':'TOQUE PARA RESGATAR ESTA RECOMPENSA.';
 $('rewardSeqCount').textContent=`${st.collected.length+1} / ${st.total}`;
 $('rewardSeqButton').textContent=st.rewards.length===1?'RESGATAR':'PRÓXIMA';
 playRewardSequenceFeedback(r);
 ov.classList.remove('hidden');void ov.offsetWidth;
 ov.querySelector('.reward-sequence-card')?.animate?.([{transform:'scale(.94)',opacity:.55},{transform:'scale(1)',opacity:1}],{duration:260,easing:'ease-out'});
 vibratePattern(r.kind==='box'?[24,32,42]:[22],r.kind==='box'?1.1:1);
}
async function applyInboxReward(r,index){
 if(cyberRemoteMode){const st=rewardSequenceState;if(!st)return false;try{const result=await remoteCommand('claim_inbox_reward',{messageId:st.messageId,rewardIndex:0});const reward=result.reward;if(reward.kind==='box')playGameSound(reward.boxType==='mini'?'boxMini':reward.boxType==='cyber'?'boxCyber':'boxMecha',reward.boxType==='mini'?.8:reward.boxType==='cyber'?1:1.2);else playGameSound(reward.kind==='coins'?'coin':reward.kind==='tokens'?'token':'gem',1.15);vibratePattern(reward.kind==='box'?[20,24]:[28],reward.kind==='box'?1.05:1);return true;}catch(e){showModal('CAIXA DE ENTRADA','Não foi possível coletar',remoteErrorMessage(e));return false;}}
 if(r.kind==='gems')player.gems+=Number(r.amount)||0;else if(r.kind==='coins')player.coins+=Number(r.amount)||0;else if(r.kind==='tokens')player.cyber_fichas+=Number(r.amount)||0;else if(r.kind==='box'){const key=r.boxType==='mini'?'mini':r.boxType==='cyber'?'cyber':'mecha';player.inventory[key]=(player.inventory[key]||0)+1;}
 saveGame();renderAll();if(r.kind==='box')playGameSound(r.boxType==='mini'?'boxMini':r.boxType==='cyber'?'boxCyber':'boxMecha',r.boxType==='mini'?.8:r.boxType==='cyber'?1:1.2);else playGameSound(r.kind==='coins'?'coin':r.kind==='tokens'?'token':'gem',1.15);vibratePattern(r.kind==='box'?[20,24]:[28],r.kind==='box'?1.05:1);return true;
}
async function advanceRewardSequence(){
 const st=rewardSequenceState;if(!st||st.busy)return;
 if(st.summary){
   const cb=st.onComplete;const inboxIndex=st.inboxIndex;
   if(st.messageId&&st.inboxIndex!=null){if(!cyberRemoteMode)player.inbox.splice(inboxIndex,1);saveGame();renderAll();}
   $('rewardSequence').classList.add('hidden');rewardSequenceState=null;playUISound('open');vibratePattern([28,40,55],1.15);if(cb)cb(st.boxRewardData||null);return;
 }
 const r=st.rewards[0];if(!r)return;st.busy=true;
 let ok=true;
 if(!st.alreadyApplied){ok=await applyInboxReward(r,0);}
 if(!ok){st.busy=false;return;}
 st.collected.push(r);st.rewards.shift();st.busy=false;

 // Na Caixa de Entrada, todas as recompensas são primeiro coletadas. As caixas
 // entram na fila e só começam a abrir depois que a mensagem inteira foi resgatada.
 if(r.kind==='box' && st.messageId)st.boxQueue=(st.boxQueue||[]).concat(r.boxType);
 if(st.rewards.length){setTimeout(showRewardSequenceStep,220);return;}

 // A mensagem foi totalmente coletada. No servidor o último claim já a removeu;
 // no modo local removemos agora. Em seguida, a fila de caixas começa automaticamente.
 if(st.messageId&&st.inboxIndex!=null){
   if(!cyberRemoteMode && player.inbox[st.inboxIndex]?.id===st.messageId)player.inbox.splice(st.inboxIndex,1);
   saveGame();renderAll();
 }
 if(st.boxQueue&&st.boxQueue.length){
   inboxBoxFlowState={title:st.title,boxQueue:st.boxQueue.slice(),boxPos:0,inboxCollected:st.collected.slice(),openedBoxRewards:[]};
   setTimeout(startNextInboxBox,360);
 }else{
   st.summary=true;setTimeout(showRewardSequenceStep,260);
 }
}

let inboxBoxFlowState=null;
function boxRewardItemsFromResult(reward){
 const items=[];
 if(Number(reward.guaranteedCoins)>0)items.push({kind:'coins',amount:Number(reward.guaranteedCoins),label:`+${Number(reward.guaranteedCoins)} MOEDAS`});
 if(Number(reward.guaranteedTokens)>0)items.push({kind:'tokens',amount:Number(reward.guaranteedTokens),label:`+${Number(reward.guaranteedTokens)} CYBER FICHAS`});
 if(reward.extraType){const t=String(reward.extraType).toUpperCase();const kind=t==='MOEDAS'?'coins':t==='CYBER FICHAS'?'tokens':'gems';const amount=Number(String(reward.extraLabel||'').match(/[0-9]+/)?.[0]||0);if(amount>0)items.push({kind,amount,label:reward.extraLabel});}
 return items;
}
function startNextInboxBox(){
 const flow=inboxBoxFlowState;if(!flow)return;
 if(flow.boxPos>=flow.boxQueue.length){showInboxBoxFinalSummary(flow);return;}
 const type=flow.boxQueue[flow.boxPos++];
 openBox(type,(boxReward)=>{
   if(!inboxBoxFlowState)return;
   flow.openedBoxRewards.push(...boxRewardItemsFromResult(boxReward));
   if(flow.boxPos<flow.boxQueue.length)setTimeout(startNextInboxBox,260);
   else setTimeout(()=>showInboxBoxFinalSummary(flow),260);
 },{autoStart:true});
}
function showInboxBoxFinalSummary(flow){
 if(!flow)return;
 const all=[...(flow.inboxCollected||[]),...(flow.openedBoxRewards||[])];
 rewardSequenceState={messageId:null,inboxIndex:null,rewards:[],pos:0,collected:all,total:all.length,title:flow.title||'CAIXA DE ENTRADA',alreadyApplied:true,onComplete:null,boxType:null,busy:false,summary:true};
 inboxBoxFlowState=null;
 showRewardSequenceStep();
}

function closeRewardSequence(){
 const st=rewardSequenceState;if(st?.summary){advanceRewardSequence();return;}
 $('rewardSequence')?.classList.add('hidden');rewardSequenceState=null;
}

function startGenericRewardSequence(rewards,title,onComplete=null){startRewardSequence(rewards,title,{alreadyApplied:true,onComplete});}

async function getOwnerHash(){return localStorage.getItem('cyberArenaOwnerKeyHash')||'';}
async function openOwnerPanel(){const ov=$('ownerOverlay');if(!ov)return;const changeKey=$('ownerChangeKeyButton');if(changeKey)changeKey.classList.toggle('hidden',cyberRemoteMode&&cyberRemoteOwner);ov.classList.remove('hidden');$('ownerPanelBody')?.classList.add('hidden');$('ownerLockArea')?.classList.remove('hidden');$('ownerLockStatus').textContent='';if(cyberRemoteMode&&cyberRemoteOwner){$('ownerLockArea').querySelector('.owner-status').textContent='Confirme a senha da Cyber Account do dono. O acesso administrativo expira automaticamente.';if($('ownerKeyInput')){$('ownerKeyInput').value='';$('ownerKeyInput').placeholder='Senha da Cyber Account';}playUISound('settings');vibrateUI('settings');return;}const existing=await getOwnerHash();if(!existing)$('ownerLockArea').querySelector('.owner-status').textContent='Primeiro uso: defina uma chave forte do dono neste dispositivo. Depois ela será exigida para acessar este painel.';else $('ownerLockArea').querySelector('.owner-status').textContent='Digite a chave do dono para liberar as funções administrativas.';playUISound('settings');vibrateUI('settings');}
async function closeOwnerPanel(){if(cyberRemoteMode&&cyberRemoteOwner){try{await cyberApi('/admin/lock',{method:'POST',body:'{}'});}catch(_){}}$('ownerOverlay')?.classList.add('hidden');}
async function unlockOwnerPanel(){const input=$('ownerKeyInput');const key=input?.value||'';const status=$('ownerLockStatus');if(accountMode!=='account'||!activeCyberAccountId){if(status)status.textContent='Entre na sua Cyber Account de dono para continuar.';return;}if(cyberRemoteMode&&cyberRemoteOwner){if(key.length<8){if(status)status.textContent='Digite a senha da Cyber Account.';return;}try{await cyberApi('/admin/unlock',{method:'POST',body:JSON.stringify({password:key})});showOwnerBody();if(status)status.textContent='Acesso administrativo liberado por 10 minutos.';}catch(e){if(status)status.textContent=e.message==='invalid_owner_credentials'?'Senha incorreta.':'Não foi possível liberar o painel.';vibratePattern([45,25,45],1.2);}return;}if(key.length<8){if(status)status.textContent='Use pelo menos 8 caracteres.';return;}const existing=await getOwnerHash();const hash=await hashSecret(key);const bound=localStorage.getItem('cyberArenaOwnerAccountId')||'';if(!existing){localStorage.setItem('cyberArenaOwnerKeyHash',hash);localStorage.setItem('cyberArenaOwnerAccountId',activeCyberAccountId);if(cyberAccounts[activeCyberAccountId]){cyberAccounts[activeCyberAccountId].isOwner=true;localStorage.setItem('cyberArenaAccounts',JSON.stringify(cyberAccounts));}showOwnerBody();if(status)status.textContent='Você definiu esta Cyber Account como DONO deste dispositivo. Isso é apenas o modo local; no servidor, o Owner é definido pelo bootstrap seguro.';return;}if(bound!==activeCyberAccountId){if(status)status.textContent='Esta área pertence a outra Cyber Account.';return;}if(hash!==existing){if(status)status.textContent='Chave incorreta.';vibratePattern([35,25,35],1);return;}showOwnerBody();}
function showOwnerBody(){$('ownerLockArea')?.classList.add('hidden');$('ownerPanelBody')?.classList.remove('hidden');renderOwnerPanel();}
async function renderOwnerPanel(){
 const el=$('ownerAccountList');if(!el)return;
 if(cyberRemoteMode){try{const r=await cyberApi('/admin/accounts');el.innerHTML=r.accounts.length?r.accounts.map(a=>`<div class="owner-row"><span><b>${a.name||'SEM NOME'}</b><small>${a.cyber_id} · Nível ${a.level||1} · ${a.coins||0} moedas · ${a.gems||0} gemas · ${a.cyber_fichas||0} fichas · ${a.banned?'BANIDA':'ATIVA'}</small></span><button ${a.is_owner?'disabled':''} onclick="toggleAccountBan('${a.cyber_id}')">${a.banned?'DESBANIR':'BANIR'}</button></div>`).join(''):'<div class="account-empty">Nenhuma conta registrada.</div>';}catch(e){el.innerHTML='<div class="account-empty">Não foi possível carregar as contas do servidor.</div>';}const cs=$('ownerCodeStatus');if(cs)cs.textContent='CYBERARENA001 · controle protegido pelo servidor · uso único por conta';return;}
 const ids=Object.keys(cyberAccounts);el.innerHTML=ids.length?ids.map(id=>{const a=cyberAccounts[id],d=normalizePlayer(a.data);return `<div class="owner-row"><span><b>${a.name||'SEM NOME'}</b><small>${id} · Nível ${d.level} · ${d.coins} moedas · ${d.gems} gemas · ${d.cyber_fichas} fichas · ${a.banned?'BANIDA':'ATIVA'}</small></span><button onclick="toggleAccountBan('${id}')">${a.banned?'DESBANIR':'BANIR'}</button></div>`}).join(''):'<div class="account-empty">Nenhuma conta salva neste dispositivo.</div>';const cs=$('ownerCodeStatus');if(cs)cs.textContent=`CYBERARENA001 · ${codeIsActive()?'ATIVO':'DESATIVADO'} · uso único por conta`;
}
async function toggleAccountBan(id){if(cyberRemoteMode){try{const list=await cyberApi('/admin/accounts');const target=list.accounts.find(a=>a.cyber_id===id);if(!target)return;await cyberApi('/admin/accounts/'+encodeURIComponent(id)+'/ban',{method:'POST',headers:{'Idempotency-Key':newIdempotencyKey()},body:JSON.stringify({banned:!target.banned})});await renderOwnerPanel();playUISound('buy');vibratePattern([35,55,35],1);return;}catch(e){if(e.status===403&&e.body?.error==='owner_protected'){}return;}}const a=cyberAccounts[id];if(!a)return;if(id===localStorage.getItem('cyberArenaOwnerAccountId')){const cs=$('ownerCodeStatus');if(cs)cs.textContent='A Cyber Account do dono não pode ser banida.';return;}a.banned=!a.banned;localStorage.setItem('cyberArenaAccounts',JSON.stringify(cyberAccounts));if(a.banned&&activeCyberAccountId===id){activeCyberAccountId='';accountMode='guest';player=normalizePlayer(DEFAULT_PLAYER);localStorage.removeItem('cyberArenaActiveAccount');restartToStartGate();}renderOwnerPanel();playUISound('buy');vibratePattern([35,55,35],1);}
async function toggleCommunityCode(){if(cyberRemoteMode){try{const cur=await cyberApi('/admin/codes/'+encodeURIComponent(COMMUNITY_CODE));await cyberApi('/admin/codes/'+encodeURIComponent(COMMUNITY_CODE)+'/active',{method:'POST',headers:{'Idempotency-Key':newIdempotencyKey()},body:JSON.stringify({active:!cur.active})});await renderOwnerPanel();playUISound('settings');vibratePattern([25,40,25],1);}catch(_){ }return;}const s=getCommunityCodeState();s[COMMUNITY_CODE]=!codeIsActive();saveCommunityCodeState(s);renderOwnerPanel();playUISound('settings');vibratePattern([25,40,25],1);}
async function setOwnerKeyAgain(){localStorage.removeItem('cyberArenaOwnerKeyHash');$('ownerLockArea')?.classList.remove('hidden');$('ownerPanelBody')?.classList.add('hidden');$('ownerKeyInput').value='';$('ownerLockStatus').textContent='Defina a nova chave.';}

// Adiciona os novos atalhos de tela sem alterar a navegação principal existente.
(function wireV74(){
 const originalOpenScreen=openScreen;
 window.openScreen=originalOpenScreen;
 document.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&(e.target.id==='redeemCodeInput')){e.preventDefault();redeemCommunityCode();}});
})();

/* ================= CYBERARENA v88 — GAMEPLAY FOUNDATION / 2D PERSPECTIVE =================
   v88 corrects the arena/mode specification and deepens the playable prototype:
   - TESTAR: Solo 4 bots / 5x; Bot 7 bots / 5x.
   - JOGAR: normal FFA / 16 bots / 27x.
   - 2:30 timer in every playable mode.
   - Cyber: back-view 2D perspective, full body, animated actions/front reveal.
   - Punch combo, laser, Super, regeneration, life steal, hazards, destructible cover.
   - Bots use the same combat family and have three behavioral personalities.
   - Bot training waves can grow +3 when the current wave is fully defeated.
   - Customizable match controls: scale + drag placement, persisted locally.
*/
(function(){
'use strict';

const CA_GAME={
 active:false,mode:null,raf:0,last:0,elapsed:0,matchElapsed:0,exit:false,started:false,
 world:{w:1280*5,h:720*5},tile:32,
 player:null,bots:[],walls:[],obstacles:[],bushes:[],bombs:[],heals:[],
 particles:[],texts:[],camera:{x:0,y:0},keys:{},
 joystick:{active:false,x:0,y:0,pid:null},
 pointerAim:{x:0,y:0,active:false},
 wave:1,waveBotCount:7,editControls:false,intro:0,adaptive:{playerDamage:0,playerShots:0,playerDodges:0,playerHits:0,window:0}
};
const CA_SPEC={
 hp:7500,attackDamage:500,superDamage:3100,speed:220,
 block:32,attackRange:32*1.5,superRange:32*4,superMultiRange:32*6,
 ammoMax:2,reload:.8,hitsToSuper:5,regenDelay:4,regenTick:.5,
 regenAmount:300,lifeSteal:600,superSpeed:1.25,superSpeedTime:13,stun:4,
 bombDamage:800,botHp:7500
};
const CA_COL={grass:'#182b2c',grass2:'#213a39',grass3:'#294642',path:'#3a4b4b',wall:'#4b5b60',wall2:'#77878a',metal:'#81949a',danger:'#d87945',heal:'#65e1c3',blue:'#78c9e8'};
const playerImage=new Image();playerImage.src='assests/ui/player.png';
const backCyberImage=new Image();backCyberImage.src='assests/ui/back_cyber.png';
const botImage=new Image();botImage.src='assests/ui/bot.png';

function caEl(id){return document.getElementById(id);}
function caClamp(v,a,b){return Math.max(a,Math.min(b,v));}
function caDist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
function caRand(a,b){return a+Math.random()*(b-a);}
function caFmt(n){return Math.max(0,Math.round(n)).toLocaleString('pt-BR');}
function caPick(a){return a[(Math.random()*a.length)|0];}
function caModeWorld(mode){const mul=(mode==='normal')?27:5;return {w:1280*mul,h:720*mul,scale:mul};}
function caBotCount(mode){return mode==='solo'?4:(mode==='bot'?7:16);}
function caModeLabel(mode){return mode==='solo'?'TREINO SOLO · 4 ALVOS':mode==='bot'?'PARTIDA COM BOT · 7 BOTS':'PARTIDA NORMAL · 16 BOTS';}
function caResizeCanvas(){const c=caEl('game');if(c){c.width=1280;c.height=720;}}
function caShowStatus(t,ms=850){const el=caEl('gameStatus');if(!el)return;el.textContent=t;el.style.opacity='1';clearTimeout(caShowStatus.t);caShowStatus.t=setTimeout(()=>el.style.opacity='0',ms);}
function caVibe(pattern=[18,30,18]){try{if(typeof vibratePattern==='function')vibratePattern(pattern,1);else navigator.vibrate?.(pattern);}catch(_){} }
function caPlay(kind){try{if(typeof playUISound==='function')playUISound(kind);}catch(_){} }
function caUnlockGamePointer(v=true){const hud=caEl('gameHud');if(hud)hud.style.pointerEvents=v?'auto':'none';}

function caControlScale(){const n=Number(localStorage.getItem('cyberArenaGameControlScale')||100);return caClamp(Number.isFinite(n)?n:100,70,140)/100;}
function caLoadControlPositions(){try{return JSON.parse(localStorage.getItem('cyberArenaGameControlPositions')||'{}')||{};}catch(_){return {};}}
function caSaveControlPositions(p){localStorage.setItem('cyberArenaGameControlPositions',JSON.stringify(p));}
function caApplyControlLayout(){
 const scale=caControlScale();document.documentElement.style.setProperty('--game-control-scale',String(scale));
 const pos=caLoadControlPositions();
 const ids=['gameJoystick','gameLaser','gameAttack','gameSuper'];
 for(const id of ids){const el=caEl(id),v=pos[id];if(!el)continue;el.style.left=el.style.right=el.style.top=el.style.bottom='';if(v){if(v.left!=null)el.style.left=v.left+'px';if(v.right!=null)el.style.right=v.right+'px';if(v.top!=null)el.style.top=v.top+'px';if(v.bottom!=null)el.style.bottom=v.bottom+'px';}}
}
window.setGameControlScale=function(v){localStorage.setItem('cyberArenaGameControlScale',String(caClamp(Number(v)||100,70,140)));caApplyControlLayout();if($('gameControlScaleValue'))$('gameControlScaleValue').textContent=Math.round(caControlScale()*100);};
window.beginGameControlEdit=function(){
 /* leva ao mapa de treino já com o editor de controles aberto (arrastar, tamanho, canhoto...) */
 closeSettings?.();
 if(window.openWorldRaw)window.openWorldRaw('space','&offline=1&noprog=1&ctl=1');
 else window.openWorld3D?.('solo');
};
window.finishGameControlEdit=function(){CA_GAME.editControls=false;document.body.classList.remove('game-control-editing');caShowStatus('CONTROLES SALVOS',700);};
function caBindControlEditor(){
 const ids=['gameJoystick','gameLaser','gameAttack','gameSuper'];const pos=caLoadControlPositions();
 for(const id of ids){const el=caEl(id);if(!el||el.dataset.editorBound==='1')continue;el.dataset.editorBound='1';el.addEventListener('pointerdown',e=>{
   if(!CA_GAME.editControls)return;e.preventDefault();el.setPointerCapture?.(e.pointerId);
   const r=el.getBoundingClientRect(),parent=caEl('gameHud').getBoundingClientRect(),sx=e.clientX-r.left,sy=e.clientY-r.top;
   const move=ev=>{if(!CA_GAME.editControls)return;const x=caClamp(ev.clientX-parent.left-sx,4,parent.width-r.width-4),y=caClamp(ev.clientY-parent.top-sy,4,parent.height-r.height-4);el.style.left=x+'px';el.style.top=y+'px';el.style.right='';el.style.bottom='';pos[id]={left:x,top:y};};
   const stop=()=>{caSaveControlPositions(pos);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',stop);};
   el.addEventListener('pointermove',move);el.addEventListener('pointerup',stop,{once:true});
 });}
}

window.openCharacterTestMenu=function(){caEl('characterTestMenu')?.classList.remove('hidden');caPlay('open');caVibe([25,35]);};
window.closeCharacterTestMenu=function(){caEl('characterTestMenu')?.classList.add('hidden');caPlay('back');caVibe([18]);};
/* Lobby JOGAR is the real 16-bot match. TESTAR remains the isolated training menu. */
window.startGame=function(){openArenaPreview();};

function caSpawnPoint(existing,w,h,bushes){
 const candidates=(bushes||[]).slice().sort(()=>Math.random()-.5);
 for(const b of candidates){const p={x:b.x+caRand(-b.w*.18,b.w*.18),y:b.y+caRand(-b.h*.18,b.h*.18)};if(existing.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>Math.max(260,CA_SPEC.block*8))&&!caCollides(p.x,p.y,28))return p;}
 for(let tries=0;tries<900;tries++){const p={x:caRand(100,w-100),y:caRand(100,h-100)};if(existing.every(q=>Math.hypot(p.x-q.x,p.y-q.y)>260)&&!caCollides(p.x,p.y,28))return p;}
 return {x:w/2,y:h/2};
}
function caBuildWorld(mode){
 CA_GAME.mode=mode;CA_GAME.world=caModeWorld(mode);CA_GAME.wave=1;CA_GAME.matchElapsed=0;CA_GAME.waveBotCount=7;
 CA_GAME.walls=[];CA_GAME.obstacles=[];CA_GAME.bushes=[];CA_GAME.bombs=[];CA_GAME.heals=[];CA_GAME.bots=[];CA_GAME.particles=[];CA_GAME.texts=[];CA_GAME.adaptive={playerDamage:0,playerShots:0,playerDodges:0,playerHits:0,window:0};
 const W=CA_GAME.world.w,H=CA_GAME.world.h;CA_GAME.walls.push({x:0,y:0,w:W,h:34},{x:0,y:H-34,w:W,h:34},{x:0,y:0,w:34,h:H},{x:W-34,y:0,w:34,h:H});
 const density=mode==='solo'?38:mode==='bot'?76:255;for(let i=0;i<density;i++){const w=caRand(70,230),h=caRand(42,125),p=caSpawnPoint([],W,H,[]);CA_GAME.obstacles.push({x:p.x-w/2,y:p.y-h/2,w,h,destructible:Math.random()<.62,hp:900,maxHp:900,kind:Math.random()<.58?'stone':'metal',seed:Math.random()*99});}
 const bushCount=mode==='solo'?42:mode==='bot'?78:260;for(let i=0;i<bushCount;i++){const p=caSpawnPoint([],W,H,[]);CA_GAME.bushes.push({x:p.x,y:p.y,w:caRand(58,118),h:caRand(38,82),hidden:false,seed:Math.random()*99});}
 const bombCount=mode==='solo'?8:mode==='bot'?16:58;for(let i=0;i<bombCount;i++){const p=caSpawnPoint([],W,H,[]);CA_GAME.bombs.push({x:p.x,y:p.y,r:14,active:true,arm:caRand(0,1),seed:Math.random()*99});}
 const healCount=mode==='solo'?8:mode==='bot'?13:38;for(let i=0;i<healCount;i++){const p=caSpawnPoint([],W,H,[]);CA_GAME.heals.push({x:p.x,y:p.y,r:31,amount:CA_SPEC.lifeSteal,respawn:0});}
 const spawnPoints=[];const pspawn=caSpawnPoint(spawnPoints,W,H,CA_GAME.bushes);spawnPoints.push(pspawn);
 CA_GAME.player={x:pspawn.x,y:pspawn.y,hp:CA_SPEC.hp,maxHp:CA_SPEC.hp,dir:{x:0,y:-1},speed:CA_SPEC.speed,ammo:2,reloadTimers:[],superHits:0,superReady:false,regenPulse:0,lastDamageTime:-99,attacking:false,attackTimer:0,attackStage:0,attackHitDone:[false,false,false],attackSuperCounted:false,supering:false,superTimer:0,superShots:0,superTarget:null,superTargets:[],stun:0,flash:0,frontReveal:0,afterSuper:0,kills:0,airborne:0,airY:0,visibleTurn:0,walkPhase:0};
 CA_GAME.camera.x=caClamp(pspawn.x-640,0,W-1280);CA_GAME.camera.y=caClamp(pspawn.y-360,0,H-720);CA_GAME.intro=.95;
 if(mode==='solo'){const angles=[-.45,.35,2.5,3.75],distances=[250,340,285,360];for(let i=0;i<4;i++){const a=angles[i],d=distances[i];let p=null;for(let k=0;k<40;k++){const dd=d+k*12;const q={x:caClamp(pspawn.x+Math.cos(a)*dd,90,W-90),y:caClamp(pspawn.y+Math.sin(a)*dd,90,H-90)};if(spawnPoints.every(z=>Math.hypot(q.x-z.x,q.y-z.y)>260)&&!caCollides(q.x,q.y,28)){p=q;break;}}if(!p)p=caSpawnPoint(spawnPoints,W,H,CA_GAME.bushes);spawnPoints.push(p);}}
 caSpawnBots(mode,caBotCount(mode),spawnPoints);caApplyControlLayout();
}
function caNewBot(i,num,p,stationary,personality){
 const profileBases=[{name:'IMPULSIVO',aim:.64,awareness:.58,aggression:1.05,dodge:.34,adapt:.42},{name:'CAUTELOSO',aim:.76,awareness:.9,aggression:.72,dodge:.7,adapt:.55},{name:'CAÇADOR',aim:.86,awareness:.82,aggression:1.16,dodge:.58,adapt:.72}];const profiles={...profileBases[personality%3]};
 return {id:i,name:'BOT '+num,x:p.x,y:p.y,hp:CA_SPEC.botHp,maxHp:CA_SPEC.botHp,dir:{x:0,y:1},speed:caRand(165,195),baseSpeed:180,personality,profile:profiles,stationary,state:'patrol',stun:0,attackCd:caRand(.3,1),ammo:2,reloadTimers:[],regenPulse:0,lastDamageTime:-99,flash:0,respawn:0,dead:false,adapt:0,target:null,decision:caRand(.2,1),danger:0,shots:0,superHits:0,superReady:false,attacking:false,attackTimer:0,attackStage:0,attackHitDone:[false,false,false],attackSuperCounted:false,supering:false,superTimer:0,superShots:0,superTarget:null,superTargets:[],frontReveal:0,afterSuper:0,airborne:0,airY:0,visibleTurn:0,walkPhase:0,memory:{playerLastX:p.x,playerLastY:p.y,lastSeen:0,preferredRange:85,strafe:personality===0?1:personality===1?-1:.6,goodSense:profiles.awareness,badSense:1-profiles.awareness,confidence:.5,success:0,failures:0,threat:0}};
}
function caSpawnBots(mode,count,spawnPoints){const W=CA_GAME.world.w,H=CA_GAME.world.h;const used=new Set(CA_GAME.bots.map(b=>b.name.replace('BOT ','')));const nums=[...Array(17)].map((_,i)=>i+1).filter(n=>!used.has(String(n))).sort(()=>Math.random()-.5).slice(0,count);for(let i=0;i<count;i++){const p=caSpawnPoint(spawnPoints,W,H,CA_GAME.bushes);spawnPoints.push(p);CA_GAME.bots.push(caNewBot(CA_GAME.bots.length+1,nums[i],p,mode==='solo',i%3));}}
function caRectHitCircle(o,p,r){const cx=caClamp(p.x,o.x,o.x+o.w),cy=caClamp(p.y,o.y,o.y+o.h);return Math.hypot(p.x-cx,p.y-cy)<r;}
function caCollides(x,y,r){if(x<32+r||y<32+r||x>CA_GAME.world.w-32-r||y>CA_GAME.world.h-32-r)return true;for(const o of CA_GAME.obstacles)if(o.hp>0&&caRectHitCircle(o,{x,y},r))return true;for(const w of CA_GAME.walls)if(caRectHitCircle(w,{x,y},r))return true;return false;}
function caMove(e,dx,dy,dt){const len=Math.hypot(dx,dy)||1;dx/=len;dy/=len;const nx=e.x+dx*e.speed*dt,ny=e.y+dy*e.speed*dt,r=e===CA_GAME.player?25:23;if(!caCollides(nx,e.y,r))e.x=nx;if(!caCollides(e.x,ny,r))e.y=ny;if(Math.hypot(dx,dy)>.08)e.dir={x:dx,y:dy};}
function caNearestTarget(entity,maxRange=Infinity){const list=[CA_GAME.player,...CA_GAME.bots].filter(x=>x!==entity&&!x.dead&&x.hp>0&&!x.airborne);let best=null,bd=maxRange;for(const x of list){const d=caDist(entity,x);if(d<bd){bd=d;best=x;}}return best;}
function caLineClear(a,b){const steps=Math.ceil(caDist(a,b)/22);for(let i=1;i<steps;i++){const t=i/steps,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;if(caCollides(x,y,6))return false;}return true;}
function caObstacleInLine(a,b,range){let best=null,bd=range;for(const o of CA_GAME.obstacles)if(o.hp>0&&o.destructible){const cx=o.x+o.w/2,cy=o.y+o.h/2,d=Math.hypot(cx-a.x,cy-a.y);if(d<bd){const dot=((cx-a.x)*(b.x-a.x)+(cy-a.y)*(b.y-a.y))/((Math.hypot(b.x-a.x,b.y-a.y)**2)||1);if(dot>0&&dot<1){best=o;bd=d;}}}return best;}
function caDamage(target,amount,source,opts={}){if(!target||target.dead||target.hp<=0)return;target.hp-=amount;target.flash=.16;target.regenPulse=0;target.lastDamageTime=CA_GAME.elapsed;CA_GAME.texts.push({x:target.x,y:target.y-55,text:'-'+caFmt(amount),life:.8,vy:-22,kind:opts.kind||'damage'});if(opts.stun)target.stun=Math.max(target.stun,opts.stun);if(opts.knockup)target.airborne=Math.max(target.airborne,opts.knockup);if(source===CA_GAME.player){source.lastDamageTime=CA_GAME.elapsed;CA_GAME.adaptive.playerDamage+=amount;CA_GAME.adaptive.playerHits++;}if(target.hp<=0){target.hp=0;target.dead=true;target.respawn=4;if(source===CA_GAME.player){source.kills++;source.hp=caClamp(source.hp+CA_SPEC.lifeSteal,0,source.maxHp);CA_GAME.texts.push({x:source.x,y:source.y-78,text:'+'+caFmt(CA_SPEC.lifeSteal)+' VIDA',life:1,vy:-30,kind:'heal'});CA_GAME.particles.push({x:source.x,y:source.y-20,tx:target.x,ty:target.y,life:.65,kind:'drain'});caVibe([18,35,18]);caPlay('token');}}}
function caDamageObstacle(o,amount){if(!o||o.hp<=0||!o.destructible)return;o.hp-=amount;CA_GAME.texts.push({x:o.x+o.w/2,y:o.y-5,text:'-'+amount,life:.45,vy:-12,kind:'damage'});if(o.hp<=0){o.hp=0;for(let i=0;i<10;i++)CA_GAME.particles.push({x:o.x+o.w/2,y:o.y+o.h/2,vx:caRand(-80,80),vy:caRand(-80,80),life:.45,kind:'debris'});}}
function caRegisterHit(p){p.superHits++;if(p.superHits>=CA_SPEC.hitsToSuper)p.superReady=true;}
function caPunchHit(e,stage,bot=false){const range=CA_SPEC.attackRange;const target=caNearestTarget(e,range);if(!target)return;if(!caLineClear(e,target))return;const dmg=[167,166,166][stage];caDamage(target,dmg,e,{kind:'punch'});if(!e.attackSuperCounted){e.attackSuperCounted=true;caRegisterHit(e);}const o=caObstacleInLine(e,target,range);if(o)caDamageObstacle(o,170);for(let i=0;i<6;i++)CA_GAME.particles.push({x:e.x+e.dir.x*30,y:e.y+e.dir.y*30,vx:caRand(-45,45),vy:caRand(-45,45),life:.25,kind:'hit'});}
function caTryPunch(){const p=CA_GAME.player;if(!p||p.stun>0||p.supering||p.attacking||p.ammo<=0||!CA_GAME.started)return;p.ammo--;CA_GAME.adaptive.playerShots++;CA_GAME.adaptive.playerStyle=CA_GAME.adaptive.playerStyle||'mixed';p.attacking=true;p.attackTimer=0;p.attackStage=0;p.attackHitDone=[false,false,false];p.attackSuperCounted=false;p.frontReveal=.62;p.reloadTimers.push(CA_SPEC.reload);caPlay('click');caVibe([16,18]);}
function caTryLaser(){const p=CA_GAME.player;if(!p||p.stun>0||p.supering||p.attacking||p.ammo<=0||!CA_GAME.started)return;p.ammo--;CA_GAME.adaptive.playerShots++;CA_GAME.adaptive.playerStyle='ranged';p.attacking=true;p.attackTimer=0;p.attackStage=3;p.attackHitDone=[false,false,false];p.attackSuperCounted=false;p.frontReveal=.55;p.reloadTimers.push(CA_SPEC.reload);caPlay('click');caVibe([16]);}
function caLaserHit(e){const target=caNearestTarget(e,CA_SPEC.attackRange);if(!target||!caLineClear(e,target))return;caDamage(target,250,e,{kind:'laser'});if(!e.attackSuperCounted){e.attackSuperCounted=true;caRegisterHit(e);}CA_GAME.particles.push({x:e.x+e.dir.x*30,y:e.y+e.dir.y*30,tx:target.x,ty:target.y,life:.18,kind:'laser'});}
window.gameUseAttack=function(kind){if(kind==='laser')caTryLaser();else caTryPunch();};window.gameUseSuper=function(){caTrySuper();};
function caTrySuper(){const p=CA_GAME.player;if(!p||!p.superReady||p.supering||p.stun>0||!CA_GAME.started)return;const all=[...CA_GAME.bots].filter(b=>!b.dead&&b.hp>0);const multi=all.filter(b=>caDist(p,b)<=CA_SPEC.superMultiRange);const near=all.filter(b=>caDist(p,b)<=CA_SPEC.superRange);if(multi.length>=2){caStartSuper(p,multi,true);}else if(near.length>=1){caStartSuper(p,[near[0]],false);} }
function caStartSuper(p,targets,isMulti){p.supering=true;p.superTimer=0;p.superShots=0;p.superTarget=targets[0];p.superTargets=targets;p.superReady=false;p.superHits=0;p.afterSuper=0;p.frontReveal=1.55;p.superMulti=isMulti;p.superEnd=CA_GAME.elapsed+1.55;caPlay('premium');caVibe([35,45,35,70]);caShowStatus(isMulti?'SUPER · MULTIALVO':'SUPER · SALTO',700);}
function caSuperUpdate(e,dt){e.superTimer+=dt;const target=e.superTarget&&!e.superTarget.dead?e.superTarget:caNearestTarget(e,CA_SPEC.superMultiRange);if(!target){e.supering=false;return;}if(e.superTimer<.42){const dx=target.x-e.x,dy=target.y-e.y,l=Math.hypot(dx,dy)||1;const travel=Math.min(e.superMulti?CA_SPEC.superMultiRange:CA_SPEC.superRange,l);e.x+=dx/l*travel*dt/.42;e.y+=dy/l*travel*dt/.42;e.dir={x:dx/l,y:dy/l};e.airY=Math.sin((e.superTimer/.42)*Math.PI)*36;}
 else {const isMulti=!!e.superMulti,maxShots=isMulti?4:6,interval=isMulti?.105:.16;const expected=Math.floor((e.superTimer-.42)/interval);while(e.superShots<Math.min(maxShots,expected+1)){e.superShots++;const arm=e.superShots%2?'DIREITA':'ESQUERDA';const victims=isMulti?(e.superTargets||[]).filter(v=>v&&!v.dead&&caDist(e,v)<=CA_SPEC.superMultiRange):[target];for(const v of victims){const maxRange=isMulti?CA_SPEC.superMultiRange:CA_SPEC.superRange;if(caDist(e,v)>maxRange)continue;const base=Math.floor(CA_SPEC.superDamage/(isMulti?4:6)),rem=CA_SPEC.superDamage%(isMulti?4:6);const idx=e.superShots-1;const dmg=base+(idx<rem?1:0);caDamage(v,dmg,e,{kind:isMulti?'missile':'superLaser',stun:e.superShots===1?CA_SPEC.stun:0,knockup:isMulti?.9:0});CA_GAME.particles.push({x:e.x+e.dir.x*25,y:e.y+e.dir.y*25,tx:v.x,ty:v.y,life:.32,kind:isMulti?'missile':'superLaser',arm});}}}
 if(e.superTimer>=1.55){e.supering=false;e.airY=0;e.afterSuper=CA_SPEC.superSpeedTime;caShowStatus('VELOCIDADE +25%',850);}}
function caUpdateRegen(e,dt){if(e.dead)return;const now=CA_GAME.elapsed;if((e.lastDamageTime??-99)>now-CA_SPEC.regenDelay){e.regenPulse=0;return;}if(e.hp>=e.maxHp){e.regenPulse=0;return;}e.regenPulse=(e.regenPulse||0)+dt;if(e.regenPulse>=CA_SPEC.regenTick){e.regenPulse-=CA_SPEC.regenTick;e.hp=caClamp(e.hp+CA_SPEC.regenAmount,0,e.maxHp);CA_GAME.texts.push({x:e.x,y:e.y-50,text:'+'+CA_SPEC.regenAmount,life:.45,vy:-12,kind:'regen'});for(let i=0;i<7;i++)CA_GAME.particles.push({x:e.x+caRand(-25,25),y:e.y+caRand(-35,20),vx:caRand(-12,12),vy:caRand(-35,-8),life:.65,kind:'regen'});}}
function caBotUsePunch(b){if(b.dead||b.stun>0||b.supering||b.attacking||b.ammo<=0)return;b.ammo--;b.attacking=true;b.attackTimer=0;b.attackStage=0;b.attackHitDone=[false,false,false];b.attackSuperCounted=false;b.frontReveal=.62;b.reloadTimers.push(CA_SPEC.reload);}
function caBotUseLaser(b){if(b.dead||b.stun>0||b.supering||b.attacking||b.ammo<=0)return;b.ammo--;b.attacking=true;b.attackTimer=0;b.attackStage=3;b.attackHitDone=[false,false,false];b.attackSuperCounted=false;b.frontReveal=.55;b.reloadTimers.push(CA_SPEC.reload);}
function caBotUseSuper(b){if(!b.superReady||b.supering||b.stun>0)return;const p=CA_GAME.player;if(!p||p.dead)return;const all=[p,...CA_GAME.bots].filter(v=>v!==b&&!v.dead&&v.hp>0);const multi=all.filter(v=>caDist(b,v)<=CA_SPEC.superMultiRange),near=all.filter(v=>caDist(b,v)<=CA_SPEC.superRange);if(multi.length>=2)caStartSuper(b,multi,true);else if(near.length)caStartSuper(b,[near[0]],false);}
function caBotCombatUpdate(b,dt){if(b.attacking){b.attackTimer+=dt;if(b.attackStage===3){if(!b.attackHitDone[0]&&b.attackTimer>=.16){b.attackHitDone[0]=true;caLaserHit(b);}if(!b.attackHitDone[1]&&b.attackTimer>=.31){b.attackHitDone[1]=true;caLaserHit(b);}if(b.attackTimer>=.52)b.attacking=false;}else{const times=[.08,.20,.32];for(let i=0;i<3;i++)if(!b.attackHitDone[i]&&b.attackTimer>=times[i]){b.attackHitDone[i]=true;caPunchHit(b,i,true);}if(b.attackTimer>=.47)b.attacking=false;}}if(b.supering)caSuperUpdate(b,dt);}
function caRespawnBot(b){const others=[CA_GAME.player,...CA_GAME.bots.filter(x=>x!==b&&!x.dead)];const p=caSpawnPoint(others.map(x=>({x:x.x,y:x.y})),CA_GAME.world.w,CA_GAME.world.h,CA_GAME.bushes);b.x=p.x;b.y=p.y;b.hp=b.maxHp;b.dead=false;b.ammo=2;b.reloadTimers=[];b.stun=0;b.superHits=0;b.superReady=false;b.adapt+=.16;b.profile.aim=caClamp(b.profile.aim+.025,0,.98);b.profile.awareness=caClamp(b.profile.awareness+.03,0,.98);b.lastDamageTime=CA_GAME.elapsed;b.airborne=0;b.state='patrol';b.memory.success+=1;}
function caMaybeWave(){if(CA_GAME.mode!=='bot')return;const live=CA_GAME.bots.filter(b=>!b.dead&&b.hp>0).length;if(live===0&&!CA_GAME.waveClearing){CA_GAME.waveClearing=true;const next=Math.min(16,CA_GAME.waveBotCount+3);CA_GAME.wave++;CA_GAME.waveBotCount=next;caShowStatus(`ONDA ${CA_GAME.wave} · ${next} BOTS`,1200);setTimeout(()=>{if(!CA_GAME.active)return;const spawn=[];const p=caSpawnPoint(spawn,CA_GAME.world.w,CA_GAME.world.h,CA_GAME.bushes);spawn.push(p);CA_GAME.bots=[];caSpawnBots('bot',next,spawn);CA_GAME.waveClearing=false;},1000);}}
function caUpdateBot(b,dt){
 if(b.dead){b.respawn-=dt;if(b.respawn<=0)caRespawnBot(b);return;}
 if(b.airborne>0){b.airborne-=dt;b.airY=Math.sin((1-b.airborne/.9)*Math.PI)*70;if(b.airborne<=0)b.airY=0;}
 if(b.stun>0){b.stun-=dt;return;}
 b.reloadTimers=b.reloadTimers.map(x=>x-dt).filter(x=>x>0);b.ammo=caClamp(2-b.reloadTimers.length,0,2);
 caUpdateRegen(b,dt);caBotCombatUpdate(b,dt);if(b.attacking||b.supering||b.stationary)return;
 const p=CA_GAME.player;if(!p||p.dead)return;
 const d=caDist(b,p),m=b.memory;
 b.decision-=dt;m.lastSeen+=dt;
 const playerPressure=caClamp((CA_GAME.adaptive.playerDamage/2200)+((p.superReady)?0.35:0)+(p.hp<2200?0.22:0),0,1);
 const playerAccuracy=CA_GAME.adaptive.playerShots>0?CA_GAME.adaptive.playerHits/CA_GAME.adaptive.playerShots:0;
 const playerStyle=CA_GAME.adaptive.playerStyle||'mixed';
 m.threat=caClamp((p.hp<2500?.3:0)+(p.superReady?.45:0)+(d<170?.25:0)+playerPressure*.18,0,1);
 // Aprendizado contínuo: cada segundo compara o comportamento do jogador e ajusta a resposta.
 if((m.learnClock??0)<=0){
   m.learnClock=1.0;
   const targetRange=playerStyle==='close'?72:playerStyle==='ranged'?145:105;
   m.preferredRange+=(targetRange-m.preferredRange)*.16;
   m.goodSense=caClamp(m.goodSense+(m.threat>.55?.012:.004)*b.profile.adapt,0,1);
   m.badSense=caClamp(1-m.goodSense,0,1);
   const pressureGain=(playerAccuracy>.62?.026:playerAccuracy<.35?.012:.019)*b.profile.adapt;
   b.adapt+=pressureGain*(1+playerPressure*.8);
   const mastery=Math.min(8,b.adapt);
   b.profile.aim=caClamp(b.profile.aim+(.006+mastery*.0015)*b.profile.adapt,0,.985);
   b.profile.awareness=caClamp(b.profile.awareness+(.007+mastery*.0012)*b.profile.adapt,0,.985);
   b.profile.dodge=caClamp(b.profile.dodge+(.004+mastery*.001)*b.profile.adapt,0,.96);
   m.confidence=caClamp(m.confidence+(b.hp>p.hp?.012:-.009)+(playerPressure<.35?.004:-.004),.12,.96);
   m.lastPlayerAccuracy=playerAccuracy;
 } else m.learnClock-=dt;
 if(b.decision<=0){
   b.decision=caRand(.12,.34)*(1+b.profile.badSense*.45);
   m.playerLastX=p.x;m.playerLastY=p.y;m.lastSeen=0;
   const danger=b.hp<1900||d<125||m.threat>.72;
   const canPunish=playerAccuracy<.48&&m.confidence>.58;
   if(danger&&b.profile.awareness>.5)b.state='retreat';
   else if(canPunish&&d<300)b.state='attack';
   else if(d<95*b.profile.aggression)b.state='attack';
   else if(d<620)b.state='chase';
   else b.state='patrol';
   const mastery=Math.min(8,b.adapt);
   b.speed=caClamp(b.baseSpeed+mastery*9+(playerPressure>0.55?14:0),150,265);
   m.preferredRange=caClamp(m.preferredRange+(b.personality===1?12:0)-(playerPressure>0.65?10:0),58,175);
 }
 let dx=0,dy=0;
 if(b.state==='retreat'){
   dx=b.x-p.x;dy=b.y-p.y;
   // Bom senso: busca uma área de cura/cobertura antes de voltar a pressionar.
   let healTarget=null,hd=Infinity;for(const h of CA_GAME.heals)if(h.respawn<=0){const q=caDist(b,h);if(q<hd){hd=q;healTarget=h;}}
   if(healTarget&&b.hp<b.maxHp*.58&&hd<520){dx=healTarget.x-b.x;dy=healTarget.y-b.y;}
   if(d>360&&b.hp>b.maxHp*.68)b.state='chase';
 } else if(b.state==='chase'){
   dx=p.x-b.x;dy=p.y-b.y;
   if(d<m.preferredRange)b.state='attack';
 } else if(b.state==='attack'){
   const strafe=m.strafe*(1+Math.min(5,b.adapt)*.10);
   dx=-(p.y-b.y)*strafe;dy=(p.x-b.x)*strafe;
   if(d>m.preferredRange+55){dx=p.x-b.x;dy=p.y-b.y;}
   else if(d<48){dx=b.x-p.x;dy=b.y-p.y;}
   if(b.superReady&&d<=CA_SPEC.superMultiRange){caBotUseSuper(b);return;}
   const mastery=Math.min(8,b.adapt),aimChance=caClamp(b.profile.aim+mastery*.018,0,.985);
   if(b.ammo>0&&b.attackCd<=0&&d<=CA_SPEC.attackRange){
     if(Math.random()<aimChance){
       if((b.personality===2||playerStyle==='ranged')&&d>CA_SPEC.attackRange*1.25)caBotUseLaser(b);else caBotUsePunch(b);
       m.success+=1;
     }else{m.failures+=1;b.dir={x:p.x-b.x,y:p.y-b.y};}
     b.attackCd=caRand(.43,.78)*(1-Math.min(.22,b.adapt*.018));
   }
 } else {
   dx=Math.cos(CA_GAME.elapsed*.28+b.id)*.25;dy=Math.sin(CA_GAME.elapsed*.23+b.id)*.25;
   if(m.threat>.5&&b.profile.awareness>.66)b.state='chase';
 }
 if(b.attackCd>0)b.attackCd-=dt;
 if(Math.hypot(dx,dy)>.05)caMove(b,dx,dy,dt);
 b.walkPhase=(b.walkPhase||0)+dt*(Math.hypot(dx,dy)>0.1?8:2);
}
function caUpdateBots(dt){for(const b of CA_GAME.bots)caUpdateBot(b,dt);caMaybeWave();}
function caBombs(){const entities=[CA_GAME.player,...CA_GAME.bots];for(const bomb of CA_GAME.bombs){if(!bomb.active)continue;for(const e of entities){if(e.dead)continue;if(Math.hypot(e.x-bomb.x,e.y-bomb.y)<bomb.r+24){bomb.active=false;caDamage(e,CA_SPEC.bombDamage,null,{kind:'bomb'});if(e===CA_GAME.player)caShowStatus('BOMBA · -800',600);for(let i=0;i<18;i++)CA_GAME.particles.push({x:bomb.x,y:bomb.y,vx:caRand(-160,160),vy:caRand(-160,160),life:.7,kind:'explosion'});setTimeout(()=>bomb.active=true,4500);break;}}}}
function caHeals(dt){for(const h of CA_GAME.heals){if(h.respawn>0){h.respawn-=dt;continue;}for(const e of [CA_GAME.player,...CA_GAME.bots]){if(e.dead||e.hp>=e.maxHp)continue;if(Math.hypot(e.x-h.x,e.y-h.y)<h.r+25){e.hp=caClamp(e.hp+h.amount,0,e.maxHp);e.lastDamageTime=CA_GAME.elapsed;h.respawn=5;CA_GAME.texts.push({x:e.x,y:e.y-60,text:'+'+h.amount+' CURA',life:.65,vy:-16,kind:'heal'});for(let i=0;i<5;i++)CA_GAME.particles.push({x:e.x,y:e.y-20,vx:caRand(-25,25),vy:caRand(-55,-15),life:.55,kind:'regen'});break;}}}}
function caUpdate(dt){const p=CA_GAME.player;if(!p)return;CA_GAME.elapsed+=dt;if(CA_GAME.started)CA_GAME.matchElapsed+=dt;if(CA_GAME.intro>0)CA_GAME.intro=Math.max(0,CA_GAME.intro-dt);p.lastDamageTime=p.lastDamageTime??-99;p.reloadTimers=p.reloadTimers.map(x=>x-dt).filter(x=>x>0);p.ammo=caClamp(2-p.reloadTimers.length,0,2);if(p.stun>0)p.stun-=dt;if(p.airborne>0){p.airborne-=dt;p.airY=Math.sin((1-p.airborne/.9)*Math.PI)*70;if(p.airborne<=0)p.airY=0;}if(p.flash>0)p.flash-=dt;if(p.frontReveal>0)p.frontReveal-=dt;if(p.afterSuper>0)p.afterSuper-=dt;p.speed=CA_SPEC.speed*(p.afterSuper>0?CA_SPEC.superSpeed:1);
 if(!CA_GAME.started){const tx0=caClamp(p.x-640,0,CA_GAME.world.w-1280),ty0=caClamp(p.y-360,0,CA_GAME.world.h-720);CA_GAME.camera.x+=(tx0-CA_GAME.camera.x)*Math.min(1,dt*8);CA_GAME.camera.y+=(ty0-CA_GAME.camera.y)*Math.min(1,dt*8);caRenderHUD();return;}
 let ix=0,iy=0;if(CA_GAME.keys.ArrowLeft||CA_GAME.keys.a)ix--;if(CA_GAME.keys.ArrowRight||CA_GAME.keys.d)ix++;if(CA_GAME.keys.ArrowUp||CA_GAME.keys.w)iy--;if(CA_GAME.keys.ArrowDown||CA_GAME.keys.s)iy++;if(CA_GAME.joystick.active){ix=CA_GAME.joystick.x;iy=CA_GAME.joystick.y;}if(p.stun<=0&&!p.supering&&Math.hypot(ix,iy)>.08)caMove(p,ix,iy,dt);
 if(p.attacking){p.attackTimer+=dt;if(p.attackStage===3){if(!p.attackHitDone[0]&&p.attackTimer>=.16){p.attackHitDone[0]=true;caLaserHit(p);}if(!p.attackHitDone[1]&&p.attackTimer>=.31){p.attackHitDone[1]=true;caLaserHit(p);}if(p.attackTimer>=.52)p.attacking=false;}else{const times=[.08,.20,.32];for(let i=0;i<3;i++)if(!p.attackHitDone[i]&&p.attackTimer>=times[i]){p.attackHitDone[i]=true;caPunchHit(p,i);}if(p.attackTimer>=.47)p.attacking=false;}}
 if(p.supering)caSuperUpdate(p,dt);caUpdateRegen(p,dt);caUpdateBots(dt);caBombs();caHeals(dt);for(const x of CA_GAME.particles){x.life-=dt;x.x+=x.vx?x.vx*dt:0;x.y+=x.vy?x.vy*dt:0;}CA_GAME.particles=CA_GAME.particles.filter(x=>x.life>0);for(const x of CA_GAME.texts){x.life-=dt;x.y+=x.vy*dt;}CA_GAME.texts=CA_GAME.texts.filter(x=>x.life>0);const tx=caClamp(p.x-640,0,CA_GAME.world.w-1280),ty=caClamp(p.y-360,0,CA_GAME.world.h-720);CA_GAME.camera.x+=(tx-CA_GAME.camera.x)*Math.min(1,dt*8);CA_GAME.camera.y+=(ty-CA_GAME.camera.y)*Math.min(1,dt*8);caRenderHUD();}
function caTerrainHash(x,y){const n=Math.sin(x*12.9898+y*78.233)*43758.5453;return n-Math.floor(n);}
function caDrawTerrain(c,cx,cy,W,H){
 const x0=Math.floor(cx/96)*96,y0=Math.floor(cy/96)*96;
 c.fillStyle='#203b36';c.fillRect(cx,cy,W,H);
 // Base material: large irregular ground plates, no visible debug grid.
 for(let x=x0;x<cx+W+96;x+=96)for(let y=y0;y<cy+H+96;y+=96){
   const n=caTerrainHash(x/96,y/96),n2=caTerrainHash(x/47,y/61);
   c.fillStyle=n<.32?'#1f3934':n<.66?'#24433a':'#29493d';
   c.globalAlpha=.82;c.fillRect(x,y,97,97);c.globalAlpha=1;
   if(n2>.56){c.globalAlpha=.18;c.fillStyle=n2>.78?'#9a8664':'#6e9a78';c.beginPath();c.ellipse(x+24+n2*35,y+55,22+n2*28,10+n2*15,n2*3,0,Math.PI*2);c.fill();c.globalAlpha=1;}
   if(n2<.28){c.fillStyle='rgba(180,205,183,.12)';for(let k=0;k<3;k++){const sx=x+12+caTerrainHash(x+k,y)*70,sy=y+15+caTerrainHash(x,y+k)*70;c.fillRect(sx,sy,2,7);c.fillRect(sx+4,sy-3,2,10);}}
   if(n>.72){c.fillStyle='rgba(15,27,25,.28)';c.beginPath();c.arc(x+71,y+23,5+n*4,0,Math.PI*2);c.fill();}
 }
 // Worn paths: broad, irregular bands that help orient the player.
 c.save();c.lineCap='round';c.lineJoin='round';
 const pathBase=Math.floor((cy-900)/1180)*1180;
 for(let y=pathBase-1180;y<cy+H+1400;y+=1180){c.strokeStyle='rgba(154,132,98,.20)';c.lineWidth=118;c.beginPath();for(let i=-1;i<9;i++){const px=cx-180+i*250,py=y+Math.sin((px+y)*.0017)*125;c.lineTo(px,py);}c.stroke();c.strokeStyle='rgba(201,174,129,.12)';c.lineWidth=58;c.stroke();}
 const pathX=Math.floor((cx-800)/1480)*1480;
 for(let x=pathX-1480;x<cx+W+1600;x+=1480){c.strokeStyle='rgba(135,155,129,.14)';c.lineWidth=82;c.beginPath();for(let i=-1;i<9;i++){const py=cy-180+i*230,px=x+Math.sin((py+x)*.0014)*150;c.lineTo(px,py);}c.stroke();}
 c.restore();
 // Sci-fi environmental traces and broken panels, deliberately sparse.
 for(let x=Math.floor(cx/480)*480;x<cx+W+480;x+=480)for(let y=Math.floor(cy/480)*480;y<cy+H+480;y+=480){
   const n=caTerrainHash(x/480,y/480);if(n>.47&&n<.63){c.save();c.translate(x+70,y+80);c.globalAlpha=.2;c.strokeStyle='#77c7c4';c.lineWidth=3;c.beginPath();c.roundRect(-38,-18,76,36,8);c.stroke();c.beginPath();c.moveTo(-26,0);c.lineTo(26,0);c.moveTo(0,-11);c.lineTo(0,11);c.stroke();c.restore();}
 }
 // Perimeter rails / arena boundary.
 c.save();c.strokeStyle='rgba(98,208,205,.34)';c.lineWidth=8;c.strokeRect(36,36,CA_GAME.world.w-72,CA_GAME.world.h-72);c.strokeStyle='rgba(232,178,105,.15)';c.lineWidth=26;c.strokeRect(22,22,CA_GAME.world.w-44,CA_GAME.world.h-44);c.restore();
}
function caRender(ctx){const c=ctx,W=c.canvas.width,H=c.canvas.height,cx=CA_GAME.camera.x,cy=CA_GAME.camera.y;c.clearRect(0,0,W,H);if(CA_GAME.intro>0){c.save();c.fillStyle='#142824';c.fillRect(0,0,W,H);const pad=42,scale=Math.min((W-pad*2)/CA_GAME.world.w,(H-pad*2)/CA_GAME.world.h);const mw=CA_GAME.world.w*scale,mh=CA_GAME.world.h*scale,mx=(W-mw)/2,my=(H-mh)/2;c.fillStyle='#2a5145';c.fillRect(mx,my,mw,mh);c.strokeStyle='rgba(205,239,225,.45)';c.lineWidth=2;c.strokeRect(mx,my,mw,mh);for(const o of CA_GAME.obstacles){if(o.hp<=0)continue;c.fillStyle=o.destructible?'rgba(203,167,111,.75)':'rgba(111,136,143,.75)';c.fillRect(mx+o.x*scale,my+o.y*scale,Math.max(2,o.w*scale),Math.max(2,o.h*scale));}for(const b of CA_GAME.bushes){c.fillStyle='rgba(92,159,94,.65)';c.beginPath();c.arc(mx+b.x*scale,my+b.y*scale,Math.max(1.5,5*scale*2),0,Math.PI*2);c.fill();}for(const h of CA_GAME.heals){if(h.respawn<=0){c.fillStyle='rgba(93,225,194,.72)';c.beginPath();c.arc(mx+h.x*scale,my+h.y*scale,Math.max(1.5,4*scale*2),0,Math.PI*2);c.fill();}}for(const z of CA_GAME.bombs){if(z.active){c.fillStyle='rgba(229,137,76,.8)';c.beginPath();c.arc(mx+z.x*scale,my+z.y*scale,Math.max(1.5,3*scale*2),0,Math.PI*2);c.fill();}}for(const b of CA_GAME.bots){if(!b.dead){c.fillStyle='#e7776d';c.beginPath();c.arc(mx+b.x*scale,my+b.y*scale,Math.max(2,7*scale*2),0,Math.PI*2);c.fill();}}c.fillStyle='#78e6c0';c.beginPath();c.arc(mx+CA_GAME.player.x*scale,my+CA_GAME.player.y*scale,Math.max(3,9*scale*2),0,Math.PI*2);c.fill();c.font='1000 16px system-ui';c.textAlign='center';c.fillStyle='#fff';c.fillText(CA_GAME.mode==='normal'?'MAPA COMPLETO · 27×':'MAPA COMPLETO · 5×',W/2,28);c.restore();return;}c.save();c.translate(-cx,-cy);caDrawTerrain(c,cx,cy,W,H);
 // Estruturas de limite: grandes placas com profundidade, para a arena não parecer um canvas vazio.
 for(const w of CA_GAME.walls){
   if(w.w>CA_GAME.world.w*.8||w.h>CA_GAME.world.h*.8){c.save();c.translate(w.x,w.y);c.fillStyle='#15262a';c.fillRect(0,0,w.w,w.h);c.strokeStyle='rgba(104,214,218,.32)';c.lineWidth=5;c.strokeRect(3,3,w.w-6,w.h-6);c.restore();}
 }
 for(const o of CA_GAME.obstacles)if(o.hp>0){c.save();c.translate(o.x,o.y);const g=c.createLinearGradient(0,0,0,o.h);g.addColorStop(0,o.kind==='metal'?'#667b83':'#6b756c');g.addColorStop(1,o.kind==='metal'?'#2d3e45':'#39473f');c.fillStyle=g;c.shadowColor='rgba(0,0,0,.34)';c.shadowBlur=12;c.shadowOffsetY=8;c.beginPath();c.roundRect(0,0,o.w,o.h,10);c.fill();c.shadowColor='transparent';c.strokeStyle='rgba(230,245,245,.16)';c.stroke();c.fillStyle='rgba(255,255,255,.07)';c.fillRect(8,8,o.w-16,5);if(o.destructible){c.strokeStyle='rgba(240,178,103,.7)';c.lineWidth=2;c.beginPath();c.moveTo(o.w*.22,o.h*.2);c.lineTo(o.w*.48,o.h*.58);c.lineTo(o.w*.38,o.h*.88);c.moveTo(o.w*.48,o.h*.58);c.lineTo(o.w*.72,o.h*.33);c.stroke();}c.restore();}
 for(const b of CA_GAME.bushes){c.save();c.translate(b.x,b.y);c.shadowColor='rgba(0,0,0,.25)';c.shadowBlur=10;c.shadowOffsetY=5;const g=c.createRadialGradient(-b.w*.15,-b.h*.2,5,0,0,b.w*.65);g.addColorStop(0,'#78ad68');g.addColorStop(.5,'#3f8150');g.addColorStop(1,'#1d543d');c.fillStyle=g;c.beginPath();c.ellipse(0,0,b.w/2,b.h/2,0,0,Math.PI*2);c.fill();c.shadowColor='transparent';c.fillStyle='rgba(196,235,157,.18)';for(let i=0;i<5;i++){const a=i*1.2+b.seed;c.beginPath();c.ellipse(Math.cos(a)*b.w*.18,Math.sin(a)*b.h*.18,5,12,a,0,Math.PI*2);c.fill();}c.restore();}
 for(const h of CA_GAME.heals)if(h.respawn<=0){c.strokeStyle='rgba(100,225,194,.65)';c.lineWidth=2;c.beginPath();c.arc(h.x,h.y,h.r+5+Math.sin(CA_GAME.elapsed*3)*2,0,Math.PI*2);c.stroke();c.fillStyle='rgba(80,210,170,.24)';c.beginPath();c.arc(h.x,h.y,h.r,0,Math.PI*2);c.fill();c.fillStyle='#c2fff2';c.fillRect(h.x-3,h.y-12,6,24);c.fillRect(h.x-12,h.y-3,24,6);}
 for(const bomb of CA_GAME.bombs)if(bomb.active){c.fillStyle='#2b3034';c.beginPath();c.arc(bomb.x,bomb.y,13,0,Math.PI*2);c.fill();c.strokeStyle='#e38a52';c.lineWidth=3;c.beginPath();c.arc(bomb.x,bomb.y,18+Math.sin(CA_GAME.elapsed*5)*2,0,Math.PI*2);c.stroke();c.fillStyle='#ffcf73';c.beginPath();c.arc(bomb.x+5,bomb.y-8,3,0,Math.PI*2);c.fill();}
 for(const b of CA_GAME.bots)if(!b.dead)caDrawEntity(c,b,false);if(CA_GAME.player&&!CA_GAME.player.dead)caDrawEntity(c,CA_GAME.player,true);
 for(const x of CA_GAME.particles){if(x.kind==='laser'||x.kind==='superLaser'||x.kind==='missile'||x.kind==='drain'){c.save();c.globalAlpha=caClamp(x.life*4,0,1);c.strokeStyle=x.kind==='missile'?'#ffb15c':x.kind==='drain'?'#b879ff':'#9de8ff';c.lineWidth=x.kind==='missile'?7:x.kind==='drain'?5:4;c.beginPath();c.moveTo(x.x,x.y);c.lineTo(x.tx??x.x,x.ty??x.y);c.stroke();c.restore();}else if(x.kind==='explosion'){c.fillStyle='rgba(255,150,70,.55)';c.beginPath();c.arc(x.x,x.y,8+x.life*18,0,Math.PI*2);c.fill();}}
 c.font='900 16px system-ui';c.textAlign='center';for(const t of CA_GAME.texts){c.globalAlpha=caClamp(t.life*2,0,1);c.fillStyle=t.kind==='heal'||t.kind==='regen'?'#79f0c3':'#fff';c.strokeStyle='rgba(0,0,0,.75)';c.lineWidth=4;c.strokeText(t.text,t.x,t.y);c.fillText(t.text,t.x,t.y);}c.globalAlpha=1;c.restore();}
function caDrawEntity(c,e,isPlayer){
 const size=isPlayer?92:78;c.save();c.translate(e.x,e.y-e.airY);const moving=!e.attacking&&!e.supering&&((e===CA_GAME.player&&Math.hypot(CA_GAME.joystick.x,CA_GAME.joystick.y)>.08)||e.state==='chase'||e.state==='retreat');const bob=moving?Math.sin(CA_GAME.elapsed*11+(e.id||0))*2.2:Math.sin(CA_GAME.elapsed*3+(e.id||0))*1.2;c.translate(0,bob);c.fillStyle='rgba(0,0,0,.42)';c.beginPath();c.ellipse(0,size*.39,size*.40*(1+e.airY/90),size*.11,0,0,Math.PI*2);c.fill();
 if(isPlayer){const front=e.frontReveal>0||e.attacking||e.supering;const img=front?playerImage:backCyberImage;if(img.complete&&img.naturalWidth){const ratio=img.naturalWidth/img.naturalHeight;let h=size*1.68,w=h*ratio;let rot=0;if(e.attacking&&e.attackStage!==3)rot=Math.sin(e.attackTimer*32)*.045;if(e.supering)rot=Math.sin(e.superTimer*17)*.08;c.rotate(rot);c.globalAlpha=e.flash>0?.65:1;c.drawImage(img,-w/2,-h*.82,w,h);}else caDrawFallback(c,e,isPlayer,size);
   if(e.attacking&&e.attackStage!==3){const phase=Math.min(1,e.attackTimer/.14),side=e.attackHitDone[0]&&!e.attackHitDone[1]?-1:(e.attackHitDone[1]&&!e.attackHitDone[2]?1:0);const reach=size*(.25+.45*phase);c.strokeStyle='#e9fbff';c.shadowColor='#8fe7ff';c.shadowBlur=12;c.lineWidth=9;c.lineCap='round';c.beginPath();c.moveTo(side*size*.12,-size*.30);c.lineTo(side*(size*.36+reach),-size*.28);c.stroke();c.shadowBlur=0;}
   if(e.attacking&&e.attackStage===3){const beamSide=e.attackHitDone[0]&&!e.attackHitDone[1]?-1:1;c.strokeStyle='#d5f9ff';c.shadowColor='#66dfff';c.shadowBlur=20;c.lineWidth=7;c.beginPath();c.moveTo(beamSide*size*.18,-size*.34);c.lineTo(beamSide*size*1.55,-size*.45);c.stroke();c.shadowBlur=0;}
   if(e.supering){c.strokeStyle='rgba(126,229,255,.9)';c.shadowColor='#63dfff';c.shadowBlur=24;c.lineWidth=6;c.beginPath();c.arc(0,-size*.3,size*.8+Math.sin(CA_GAME.elapsed*18)*6,0,Math.PI*2);c.stroke();c.shadowBlur=0;}
   if(e.regenPulse>0){c.strokeStyle='rgba(102,255,205,.78)';c.shadowColor='#65ffc9';c.shadowBlur=18;c.lineWidth=5;c.beginPath();c.arc(0,-size*.28,size*.66+Math.sin(CA_GAME.elapsed*14)*5,0,Math.PI*2);c.stroke();c.shadowBlur=0;}
 }else if(botImage.complete&&botImage.naturalWidth){const h=size*1.55,w=h*(botImage.naturalWidth/botImage.naturalHeight);c.globalAlpha=e.flash>0?.65:1;c.drawImage(botImage,-w/2,-h*.76,w,h);}else caDrawFallback(c,e,false,size);
 if(e.stun>0){c.fillStyle='#ffe26e';c.shadowColor='#ffe26e';c.shadowBlur=8;for(let i=0;i<3;i++){const a=CA_GAME.elapsed*7+i*2.1;c.beginPath();c.arc(Math.cos(a)*30,-size*.95+Math.sin(a)*7,5,0,Math.PI*2);c.fill();}c.shadowBlur=0;}c.restore();caDrawBars(c,e,isPlayer);
}
function caDrawFallback(c,e,isPlayer,size){c.fillStyle=isPlayer?'#8fa6b4':'#b76c59';c.beginPath();c.roundRect(-size*.32,-size*.65,size*.64,size*.9,18);c.fill();c.fillStyle='#1a242a';c.beginPath();c.arc(0,-size*.42,size*.24,0,Math.PI*2);c.fill();}
function caDrawBars(c,e,isPlayer){const x=e.x-48,y=e.y-e.airY-(isPlayer?140:118),w=isPlayer?96:86;c.save();c.fillStyle='rgba(0,0,0,.72)';c.beginPath();c.roundRect(x,y,w,8,4);c.fill();c.fillStyle=isPlayer?'#63e2b8':'#ef796f';c.beginPath();c.roundRect(x,y,w*caClamp(e.hp/e.maxHp,0,1),8,4);c.fill();c.font=isPlayer?'900 12px system-ui':'850 10px system-ui';c.textAlign='center';c.fillStyle='#fff';c.strokeStyle='rgba(0,0,0,.85)';c.lineWidth=4;c.strokeText(isPlayer?'CYBER':e.name,e.x,y-7);c.fillText(isPlayer?'CYBER':e.name,e.x,y-7);c.restore();}
function caRenderHUD(){const p=CA_GAME.player;if(!p)return;const fill=caEl('gameHpFill');if(fill)fill.style.width=(100*p.hp/p.maxHp)+'%';if(caEl('gameHpText'))caEl('gameHpText').textContent=caFmt(p.hp);if(caEl('superChargeText'))caEl('superChargeText').textContent=p.superReady?'PRONTO':`${Math.min(5,p.superHits)}/5`;const ammo=caEl('gameAmmo');if(ammo)[...ammo.children].forEach((s,i)=>s.classList.toggle('empty',i>=p.ammo));caEl('gameSuper')?.classList.toggle('ready',p.superReady);const sec=Math.max(0,150-Math.floor(CA_GAME.matchElapsed)),m=Math.floor(sec/60),ss=sec%60;if(caEl('gameTimer'))caEl('gameTimer').textContent=`${m}:${String(ss).padStart(2,'0')}`;if(caEl('gameWave'))caEl('gameWave').textContent=CA_GAME.mode==='bot'?`ONDA ${CA_GAME.wave}`:'';}
function caRenderLoop(){if(!CA_GAME.active)return;const now=performance.now(),dt=Math.min(.033,Math.max(.001,(now-CA_GAME.last)/1000));CA_GAME.last=now;caUpdate(dt);caRender(caEl('game').getContext('2d'));CA_GAME.raf=requestAnimationFrame(caRenderLoop);}
function caStart(mode){closeCharacterTestMenu();caResizeCanvas();const canvas=caEl('game'),hud=caEl('gameHud');CA_GAME.active=true;CA_GAME.exit=false;CA_GAME.started=false;CA_GAME.elapsed=0;CA_GAME.last=performance.now();caBuildWorld(mode);canvas.classList.remove('hidden');hud.classList.remove('hidden');hud.classList.add('training-enter');caUnlockGamePointer(true);if(caEl('gameModeLabel'))caEl('gameModeLabel').textContent=caModeLabel(mode);caShowStatus('MAPA REVELADO',850);caPlay('play');caVibe([25,35,25]);setTimeout(()=>{if(!CA_GAME.active)return;caShowStatus('3',550);setTimeout(()=>{if(!CA_GAME.active)return;caShowStatus('2',550);setTimeout(()=>{if(!CA_GAME.active)return;caShowStatus('1',550);setTimeout(()=>{if(!CA_GAME.active)return;CA_GAME.started=true;caShowStatus('COMEÇAR!',800);},550)},550)},550)},650);document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));caApplyControlLayout();caRenderLoop();}
window.startTraining=caStart;
window.exitTraining=function(){if(!CA_GAME.active)return;CA_GAME.exit=true;CA_GAME.active=false;CA_GAME.started=false;cancelAnimationFrame(CA_GAME.raf);const hud=caEl('gameHud');hud?.classList.add('training-exit');caPlay('back');caVibe([30,45,70]);setTimeout(()=>{caEl('game')?.classList.add('hidden');hud?.classList.add('hidden');hud?.classList.remove('training-exit','training-enter');document.body.classList.remove('game-control-editing');openScreen('lobby');},720);};
function caAimFromClient(x,y){const rect=caEl('game').getBoundingClientRect(),sx=1280/rect.width,sy=720/rect.height,wx=x*sx+CA_GAME.camera.x,wy=y*sy+CA_GAME.camera.y,p=CA_GAME.player;if(!p)return;const dx=wx-p.x,dy=wy-p.y,l=Math.hypot(dx,dy)||1;p.dir={x:dx/l,y:dy/l};const cross=caEl('gameCrosshair');if(cross){cross.style.left=(x/rect.width*100)+'%';cross.style.top=(y/rect.height*100)+'%';cross.classList.remove('hidden');}}
function caBindControls(){const joy=caEl('gameJoystick'),knob=caEl('joystickKnob');if(joy){const move=e=>{if(!CA_GAME.joystick.active||e.pointerId!==CA_GAME.joystick.pid)return;const r=joy.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,dx=e.clientX-cx,dy=e.clientY-cy,max=r.width*.34,l=Math.hypot(dx,dy)||1,q=Math.min(1,l/max);CA_GAME.joystick.x=dx/l*q;CA_GAME.joystick.y=dy/l*q;if(knob)knob.style.transform=`translate(${CA_GAME.joystick.x*36}px,${CA_GAME.joystick.y*36}px)`;};joy.addEventListener('pointerdown',e=>{if(CA_GAME.editControls)return;CA_GAME.joystick.active=true;CA_GAME.joystick.pid=e.pointerId;joy.setPointerCapture?.(e.pointerId);move(e);});joy.addEventListener('pointermove',move);const stop=e=>{if(e.pointerId!==CA_GAME.joystick.pid)return;CA_GAME.joystick.active=false;CA_GAME.joystick.x=CA_GAME.joystick.y=0;if(knob)knob.style.transform='translate(0,0)';};joy.addEventListener('pointerup',stop);joy.addEventListener('pointercancel',stop);}
 const game=caEl('game');game?.addEventListener('pointermove',e=>{if(!CA_GAME.editControls)caAimFromClient(e.clientX-game.getBoundingClientRect().left,e.clientY-game.getBoundingClientRect().top);});game?.addEventListener('pointerdown',e=>{if(e.target===game&&!CA_GAME.editControls)caAimFromClient(e.clientX-game.getBoundingClientRect().left,e.clientY-game.getBoundingClientRect().top);});document.addEventListener('keydown',e=>{CA_GAME.keys[e.key]=true;if(e.key===' '){e.preventDefault();caTryPunch();}if(e.key.toLowerCase()==='q')caTrySuper();if(e.key.toLowerCase()==='e')caTryLaser();if(e.key==='Escape'&&CA_GAME.active)window.exitTraining();});document.addEventListener('keyup',e=>{CA_GAME.keys[e.key]=false;});caEl('gameAttack')?.addEventListener('pointerdown',e=>{e.preventDefault();caTryPunch();});caEl('gameLaser')?.addEventListener('pointerdown',e=>{e.preventDefault();caTryLaser();});caEl('gameSuper')?.addEventListener('pointerdown',e=>{e.preventDefault();caTrySuper();});caEl('gameExitButton')?.addEventListener('click',()=>window.exitTraining());caEl('gameControlDone')?.addEventListener('click',window.finishGameControlEdit);}
function arenaPreviewResize(){const c=caEl('arenaPreviewCanvas');if(!c)return;const dpr=Math.min(2,window.devicePixelRatio||1);c.width=Math.max(1,Math.floor(innerWidth*dpr));c.height=Math.max(1,Math.floor(innerHeight*dpr));c.style.width='100%';c.style.height='100%';}
function arenaHash(n){const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);}
function arenaPreviewBuild(){
  // Foundation map: the full 27x world is authored as a coherent arena, not a single decorated screen.
  caBuildWorld('normal');
  CA_GAME.player=null; CA_GAME.bots=[]; CA_GAME.intro=0; CA_GAME.elapsed=0;
  const W=CA_GAME.world.w,H=CA_GAME.world.h,cx=W/2,cy=H/2;
  const obstacles=[],bushes=[],heals=[],bombs=[],decor=[],landmarks=[];
  const addBlock=(x,y,w,h,kind='stone',destructible=true,seed=0,rot=0)=>obstacles.push({x:x-w/2,y:y-h/2,w,h,kind,destructible,hp:900,maxHp:900,seed,rot});
  const addBush=(x,y,w,h,seed=0)=>bushes.push({x,y,w,h,hidden:false,seed});
  const addDecor=(x,y,type,seed,scale=1)=>decor.push({x,y,type,seed,scale});
  const addLandmark=(x,y,type,seed)=>landmarks.push({x,y,type,seed});

  // Nine districts keep the entire 27x world visually occupied while preserving one visual language.
  const sectors=[];
  for(let sy=-1;sy<=1;sy++)for(let sx=-1;sx<=1;sx++)sectors.push({x:cx+sx*9600,y:cy+sy*6000,sx,sy});

  // Main avenues and secondary lanes are represented as geometry in the renderer.
  const avenues=[];
  for(let a=0;a<8;a++){const ang=a*Math.PI/4;avenues.push({x:cx,y:cy,tx:cx+Math.cos(ang)*W*.62,ty:cy+Math.sin(ang)*H*.62,w:a%2?150:210});}
  const ringR=1850;

  // Central combat core: multiple layers of cover rather than a single ring.
  addLandmark(cx,cy,'core',101);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;const r=i%2?480:680;addBlock(cx+Math.cos(a)*r,cy+Math.sin(a)*r,120+(i%3)*38,62+(i%2)*28,i%3?'stone':'metal',i%3!==1,200+i,a+.18);}
  for(let i=0;i<24;i++){const a=i*Math.PI/12,r=940+(i%3)*95;addBush(cx+Math.cos(a)*r,cy+Math.sin(a)*r,62+(i%4)*13,42+(i%3)*11,500+i);}

  // District landmarks: each sector has a distinct arrangement instead of duplicated templates.
  const landmarkTypes=['ruin','garden','platform','quarry','relay','grove','foundry','vault'];
  let li=0;
  for(const sec of sectors){
    if(sec.sx===0&&sec.sy===0)continue;
    const jitterX=sec.sx*420+(sec.sy*137),jitterY=sec.sy*330-(sec.sx*101);
    const lx=sec.x+jitterX,ly=sec.y+jitterY;
    addLandmark(lx,ly,landmarkTypes[li%landmarkTypes.length],800+li);li++;
    const n=22+(li%5)*3;
    for(let i=0;i<n;i++){
      const a=(i*2.399+li*.73),r=260+(i%7)*115;
      const x=lx+Math.cos(a)*r*(.7+((i+li)%4)*.12),y=ly+Math.sin(a)*r*(.62+((i+2*li)%3)*.16);
      const kind=((i+li)%4===0)?'metal':'stone';
      addBlock(x,y,70+(i%5)*28,42+(i%4)*19,kind,(i+li)%3!==1,1000+li*100+i,a*.17);
    }
    for(let i=0;i<42;i++){
      const a=i*2.51+li,r=330+(i%9)*75;
      addBush(lx+Math.cos(a)*r,ly+Math.sin(a)*r*.78,52+(i%5)*11,35+(i%4)*9,2000+li*100+i);
    }
  }

  // Wide map-wide cover fields. Deterministic placement means every region remains stable between launches.
  let seed=17391;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<560;i++){
    const x=180+rand()*(W-360),y=180+rand()*(H-360);
    const dc=Math.hypot(x-cx,y-cy);
    if(dc<1250)continue;
    const w=56+rand()*150,h=34+rand()*76;
    addBlock(x,y,w,h,rand()<.58?'stone':'metal',rand()<.68,3000+i,rand()*Math.PI);
  }
  // Vegetation is distributed across the full world in irregular patches, with no single copied bush cluster.
  for(let i=0;i<780;i++){
    const x=140+rand()*(W-280),y=140+rand()*(H-280);
    const dc=Math.hypot(x-cx,y-cy);
    if(dc<1050 && rand()<.58)continue;
    addBush(x,y,46+rand()*82,30+rand()*58,6000+i);
    if(rand()<.28)addDecor(x+rand()*70-35,y+rand()*55-27,'leaf',7000+i,.65+rand()*.55);
  }
  // Fine environmental particles: pebbles, grass blades, broken tech markers and tiny debris.
  for(let i=0;i<2600;i++){
    const x=70+rand()*(W-140),y=70+rand()*(H-140);
    const type=i%9===0?'tech':i%5===0?'grass':i%3===0?'pebble':'fleck';
    addDecor(x,y,type,9000+i,.55+rand()*.9);
  }

  // Utilities follow the designed lane network and are repeated throughout the map, not just at the center.
  for(const sec of sectors){
    if(sec.sx===0&&sec.sy===0)continue;
    heals.push({x:sec.x+sec.sx*320,y:sec.y+sec.sy*240,r:31,amount:CA_SPEC.lifeSteal,respawn:0});
    bombs.push({x:sec.x-sec.sx*260,y:sec.y-sec.sy*190,r:14,active:true,arm:.2,seed:sec.sx*17+sec.sy*31});
  }
  heals.push({x:cx-330,y:cy},{x:cx+330,y:cy},{x:cx,y:cy-330},{x:cx,y:cy+330});
  for(const [dx,dy] of [[-520,-520],[520,-520],[-520,520],[520,520]])bombs.push({x:cx+dx,y:cy+dy,r:14,active:true,arm:.2,seed:dx+dy});

  CA_GAME.obstacles=obstacles;CA_GAME.bushes=bushes;CA_GAME.heals=heals;CA_GAME.bombs=bombs;
  window.CA_ARENA_MAP={W,H,cx,cy,avenues,decor,landmarks,ringR};
  CA_GAME.camera.x=caClamp(cx-640,0,W-1280); CA_GAME.camera.y=caClamp(cy-360,0,H-720);
}
function arenaVisible(o,cx,cy,W,H,pad=180){return o.x>cx-pad&&o.x<cx+W+pad&&o.y>cy-pad&&o.y<cy+H+pad;}
function arenaNoise2(x,y){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
  const h=(a,b)=>arenaHash(a*127.1+b*311.7);
  const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
  const a=h(ix,iy),b=h(ix+1,iy),c=h(ix,iy+1),d=h(ix+1,iy+1);
  return (a+(b-a)*sx)+((c-a)+(a-b-c+d)*sx)*sy;
}
function arenaPoly(ctx,pts){ctx.beginPath();for(let i=0;i<pts.length;i++){const p=pts[i];i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}ctx.closePath();}
function arenaDrawStructure(ctx,l){
  const x=l.x,y=l.y,n=l.seed||0,t=l.type;ctx.save();
  const ang=arenaHash(n*.73)*Math.PI*2, scale=.86+arenaHash(n*1.19)*.34;
  ctx.translate(x,y);ctx.rotate((arenaHash(n*2.17)-.5)*.12);ctx.scale(scale,scale);
  if(t==='core'){
    ctx.shadowColor='rgba(7,18,14,.42)';ctx.shadowBlur=34;ctx.shadowOffsetY=20;
    ctx.fillStyle='#243d34';ctx.beginPath();ctx.ellipse(0,20,300,210,0,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
    for(let r=250;r>90;r-=42){ctx.strokeStyle=r>170?'rgba(91,173,131,.26)':'rgba(203,172,104,.28)';ctx.lineWidth=r>170?18:8;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}
    for(let i=0;i<18;i++){const a=i*Math.PI/9,rr=175+(i%3)*35,w=52+(i%4)*12,h=34+(i%3)*8;ctx.save();ctx.translate(Math.cos(a)*rr,Math.sin(a)*rr);ctx.rotate(a+.4);const g=ctx.createLinearGradient(0,-h/2,0,h/2);g.addColorStop(0,'#7b8b83');g.addColorStop(1,'#3d5047');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,10);ctx.fill();ctx.strokeStyle='rgba(225,210,167,.24)';ctx.stroke();ctx.restore();}
    ctx.fillStyle='rgba(19,47,39,.9)';ctx.beginPath();ctx.ellipse(0,0,112,78,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(99,225,196,.7)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,72,0,Math.PI*2);ctx.stroke();
  } else {
    const w=(t==='platform'?430:t==='quarry'?360:t==='foundry'?340:300),h=(t==='grove'||t==='garden'?235:190);
    // Broken foundation / low wall first, with a visible side face.
    ctx.shadowColor='rgba(5,16,12,.40)';ctx.shadowBlur=26;ctx.shadowOffsetY=18;
    const base=[[-w*.52,-h*.28],[-w*.18,-h*.48],[w*.46,-h*.39],[w*.52,h*.08],[w*.27,h*.46],[-w*.38,h*.39],[-w*.55,h*.05]];
    const side=base.map(p=>[p[0],p[1]+18]);ctx.fillStyle='#263a34';arenaPoly(ctx,side);ctx.fill();ctx.shadowColor='transparent';
    const g=ctx.createLinearGradient(-w*.4,-h*.5,w*.45,h*.45);g.addColorStop(0,'#7d8d80');g.addColorStop(.35,'#58695f');g.addColorStop(.72,'#3d5048');g.addColorStop(1,'#263a35');ctx.fillStyle=g;arenaPoly(ctx,base);ctx.fill();
    ctx.strokeStyle='rgba(226,230,207,.20)';ctx.lineWidth=3;ctx.stroke();
    // Individual slabs / broken stones keep the landmark from reading as a single rectangle.
    for(let i=0;i<7;i++){
      const px=-w*.34+i*w*.105+Math.sin(n+i)*12,py=-h*.12+Math.cos(n*.4+i)*h*.24;
      const sw=45+(i%4)*18,sh=28+(i%3)*12;ctx.save();ctx.translate(px,py);ctx.rotate((i-3)*.11);ctx.fillStyle=i%2?'#66766b':'#718075';ctx.beginPath();ctx.roundRect(-sw/2,-sh/2,sw,sh,8);ctx.fill();ctx.strokeStyle='rgba(228,228,204,.16)';ctx.stroke();ctx.restore();
    }
    if(t==='garden'||t==='grove'){
      for(let i=0;i<14;i++){const a=i*2.17+n*.013,rr=55+(i%5)*22;const bx=Math.cos(a)*rr,by=Math.sin(a)*rr*.55;const bw=26+(i%4)*7,bh=19+(i%3)*6;ctx.fillStyle=i%3?'#4e8d51':'#78ad64';ctx.beginPath();ctx.ellipse(bx,by,bw,bh,a,0,Math.PI*2);ctx.fill();}
    }
    if(t==='relay'||t==='vault'||t==='foundry'){
      ctx.fillStyle='#263f3b';ctx.beginPath();ctx.ellipse(0,-2,65,48,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(105,235,215,.62)';ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,-2,46,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#79dfc6';ctx.fillRect(-7,-43,14,86);ctx.fillRect(-42,-7,84,14);
    }
    if(t==='ruin'||t==='quarry'){
      for(let i=0;i<5;i++){const px=-w*.38+i*w*.18,py=h*.18+Math.sin(i+n)*18;ctx.fillStyle=i%2?'#5b695f':'#707d70';ctx.beginPath();ctx.roundRect(px-18,py-34,36,68,7);ctx.fill();ctx.fillStyle='rgba(25,39,33,.34)';ctx.fillRect(px-18,py+8,36,20);}
    }
  }
  // Loose debris and grasses make the landmark sit in the ground rather than float above it.
  ctx.strokeStyle='rgba(41,87,51,.62)';ctx.lineWidth=2;for(let i=0;i<10;i++){const a=i*2.1+n*.01,rr=170+(i%4)*24;ctx.beginPath();ctx.moveTo(Math.cos(a)*rr,Math.sin(a)*rr*.55+8);ctx.lineTo(Math.cos(a)*rr+Math.sin(a)*7,Math.sin(a)*rr*.55-12);ctx.stroke();}
  ctx.restore();
}
function arenaDrawDecor(ctx,d){
  const {x,y,seed,scale}=d,n=seed;ctx.save();
  if(d.type==='pebble'){
    const r=2.2+arenaHash(n*.37)*3.6;ctx.translate(x,y);ctx.rotate(arenaHash(n*.91)*Math.PI);ctx.fillStyle=arenaHash(n)<.5?'rgba(190,193,171,.58)':'rgba(82,104,91,.58)';ctx.beginPath();ctx.ellipse(0,0,r*1.35,r*.72,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(242,235,205,.20)';ctx.beginPath();ctx.ellipse(-r*.25,-r*.18,r*.55,r*.18,0,0,Math.PI*2);ctx.fill();
  } else if(d.type==='fleck'){
    ctx.strokeStyle=arenaHash(n)<.5?'rgba(214,198,153,.40)':'rgba(102,156,129,.40)';ctx.lineWidth=1.4;const a=arenaHash(n*1.3)*Math.PI;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.cos(a)*7*scale,y+Math.sin(a)*4*scale);ctx.stroke();
  } else if(d.type==='grass'){
    const count=4+(n%4);ctx.strokeStyle='rgba(119,171,103,.46)';ctx.lineWidth=1.3;for(let i=0;i<count;i++){const dx=(i-count/2)*2.5*scale;ctx.beginPath();ctx.moveTo(x+dx,y+5*scale);ctx.quadraticCurveTo(x+dx+(i%2?3:-3),y-1*scale,x+dx+(i%2?6:-5),y-9*scale);ctx.stroke();}
  } else {
    ctx.strokeStyle='rgba(91,194,176,.23)';ctx.lineWidth=1.5;ctx.beginPath();ctx.roundRect(x-8*scale,y-5*scale,16*scale,10*scale,3);ctx.stroke();ctx.beginPath();ctx.moveTo(x-5*scale,y);ctx.lineTo(x+5*scale,y);ctx.moveTo(x,y-4*scale);ctx.lineTo(x,y+4*scale);ctx.stroke();
  }
  ctx.restore();
}
function arenaRock(ctx,o){
  const cx=o.x+o.w/2,cy=o.y+o.h/2,rx=o.w*.5,ry=o.h*.5,n=o.seed||0,organic=o.kind!=='metal';ctx.save();ctx.translate(cx,cy);ctx.rotate(o.rot||0);
  // A formation is built from a contact shadow + lower side + irregular top mass, rather than a flat icon.
  ctx.fillStyle='rgba(5,14,11,.40)';ctx.beginPath();ctx.ellipse(0,ry*.48,rx*.98,ry*.42,0,0,Math.PI*2);ctx.fill();
  const pts=[];const count=9+(n%5);for(let i=0;i<count;i++){const a=-Math.PI/2+i*Math.PI*2/count;const wob=.82+.26*arenaHash(n+i*13.7);pts.push([Math.cos(a)*rx*wob,Math.sin(a)*ry*wob]);}
  const lower=pts.map(p=>[p[0],p[1]+Math.max(8,ry*.18)]);ctx.fillStyle=organic?'#34443b':'#34464a';arenaPoly(ctx,lower);ctx.fill();
  const g=ctx.createLinearGradient(-rx,-ry,rx,ry);if(organic){g.addColorStop(0,'#9aa28d');g.addColorStop(.25,'#777e6e');g.addColorStop(.62,'#555e52');g.addColorStop(1,'#323f37');}else{g.addColorStop(0,'#a7b8b8');g.addColorStop(.30,'#75898c');g.addColorStop(.65,'#4a6064');g.addColorStop(1,'#2d3d42');}ctx.fillStyle=g;arenaPoly(ctx,pts);ctx.fill();
  // Top planes / erosion shelves.
  for(let f=0;f<5;f++){const a=f*1.31+n*.017,rr=.16+.11*(f%3);ctx.save();ctx.translate(Math.cos(a)*rx*.25,-ry*.16+Math.sin(a)*ry*.14);ctx.rotate(a);ctx.fillStyle=f%2?'rgba(216,220,199,.13)':'rgba(25,42,35,.16)';ctx.beginPath();ctx.ellipse(0,0,rx*rr,ry*(.08+.02*(f%2)),0,0,Math.PI*2);ctx.fill();ctx.restore();}
  // Cracks, seams, lichen and chips are deterministic per formation.
  ctx.strokeStyle=organic?'rgba(42,57,47,.72)':'rgba(231,183,107,.72)';ctx.lineWidth=organic?2.1:2;for(let k=0;k<2+(n%3);k++){const sx=-rx*.42+k*rx*.31,sy=-ry*.12+(n%5)*ry*.06;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+rx*.15,sy+ry*(.10+(k%2)*.14));ctx.lineTo(sx+rx*.30,sy-ry*.04);if(k%2===0)ctx.lineTo(sx+rx*.43,sy+ry*.10);ctx.stroke();}
  if(organic){for(let m=0;m<3;m++){const a=m*2.1+n*.01;ctx.fillStyle='rgba(83,132,72,.48)';ctx.beginPath();ctx.ellipse(Math.cos(a)*rx*.34,-ry*.35+Math.sin(a)*ry*.10,rx*.14,ry*.055,a,0,Math.PI*2);ctx.fill();}}
  for(let i=0;i<4;i++){const a=i*1.7+n*.02,rr=1.05+(i%3)*.14;ctx.fillStyle='rgba(73,83,70,.78)';ctx.beginPath();ctx.ellipse(Math.cos(a)*rx*rr,Math.sin(a)*ry*.56+ry*.43,3+i%2*2,2+i%3,a,0,Math.PI*2);ctx.fill();}
  if(o.destructible){ctx.strokeStyle='rgba(241,180,104,.72)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-rx*.46,-ry*.24);ctx.lineTo(-rx*.05,ry*.18);ctx.lineTo(rx*.42,-ry*.22);ctx.moveTo(-rx*.05,ry*.18);ctx.lineTo(rx*.08,ry*.55);ctx.stroke();}
  ctx.restore();
}
function arenaBush(ctx,b){
  const x=b.x,y=b.y,w=b.w,h=b.h,n=b.seed||0;ctx.save();
  // Dense layered foliage with a real ground contact shadow and individual leaves.
  ctx.fillStyle='rgba(5,24,14,.42)';ctx.beginPath();ctx.ellipse(x,y+h*.30,w*.66,h*.30,0,0,Math.PI*2);ctx.fill();
  const count=8+(n%8), leaves=[];for(let i=0;i<count;i++){const a=i*2.399+n*.017,rr=.22+arenaHash(n+i*17)*.72;leaves.push([x+Math.cos(a)*w*.36*rr,y+Math.sin(a)*h*.38*rr-h*.10,w*(.18+.16*arenaHash(n+i*3)),h*(.22+.18*arenaHash(n+i*5)),a]);}leaves.sort((a,b)=>a[1]-b[1]);
  for(let i=0;i<leaves.length;i++){const [lx,ly,lw,lh,a]=leaves[i];const g=ctx.createRadialGradient(lx-lw*.18,ly-lh*.28,2,lx,ly,lw*.68);g.addColorStop(0,i%4===0?'#c3df8e':'#98ca72');g.addColorStop(.34,'#65a85c');g.addColorStop(.72,'#34764a');g.addColorStop(1,'#174d37');ctx.fillStyle=g;ctx.shadowColor='rgba(4,25,15,.25)';ctx.shadowBlur=7;ctx.shadowOffsetY=4;ctx.beginPath();ctx.ellipse(lx,ly,lw*.52,lh*.48,a,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';ctx.strokeStyle='rgba(216,239,164,.20)';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(lx-lw*.16,ly+lh*.06);ctx.quadraticCurveTo(lx,ly-lh*.23,lx+lw*.19,ly-lh*.08);ctx.stroke();}
  ctx.strokeStyle='rgba(34,87,48,.72)';ctx.lineWidth=1.8;for(let i=0;i<6;i++){const dx=(i-2.5)*w*.11;ctx.beginPath();ctx.moveTo(x+dx,y+h*.30);ctx.quadraticCurveTo(x+dx+(i-2.5)*4,y-h*.02,x+dx+(i-2.5)*7,y-h*.24);ctx.stroke();}
  ctx.restore();
}
function arenaGround(ctx,map,cx,cy,viewW,viewH){
  // Continuous natural surface. Large material regions are irregular, soft and layered; there is deliberately no tile/grid look.
  ctx.fillStyle='#3d6549';ctx.fillRect(cx-100,cy-100,viewW+200,viewH+200);
  const step=360,gx0=Math.floor((cx-140)/step)*step,gy0=Math.floor((cy-140)/step)*step;
  for(let gx=gx0;gx<cx+viewW+step;gx+=step)for(let gy=gy0;gy<cy+viewH+step;gy+=step){
    const n=arenaNoise2(gx/1100,gy/1100),n2=arenaNoise2(gx/540+7,gy/540-3);ctx.save();ctx.translate(gx+step*.5,gy+step*.5);ctx.rotate((arenaHash(gx*.013+gy*.021)-.5)*.9);
    ctx.fillStyle=n<.30?'rgba(24,63,42,.25)':n<.58?'rgba(76,115,67,.17)':n<.78?'rgba(143,130,84,.12)':'rgba(171,151,101,.09)';
    ctx.beginPath();ctx.ellipse(0,0,150+n2*110,95+n*.45*90,0,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  // Soil patches / worn areas are broad enough to feel like terrain material, not decoration.
  for(let i=Math.floor(cx/240)*240;i<cx+viewW+300;i+=240)for(let j=Math.floor(cy/240)*240;j<cy+viewH+300;j+=240){const n=arenaHash(i*.09+j*.13);if(n<.72)continue;ctx.save();ctx.translate(i,j);ctx.rotate(n*2);ctx.fillStyle='rgba(116,101,67,.11)';ctx.beginPath();ctx.ellipse(0,0,70+n*80,28+n*32,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  // Living grass texture, clustered rather than uniformly tiled.
  const sx=Math.floor(cx/58)*58,sy=Math.floor(cy/58)*58;for(let x=sx;x<cx+viewW+70;x+=58)for(let y=sy;y<cy+viewH+70;y+=58){const n=arenaHash(x*.17+y*.11);if(n>.48)continue;const k=2+(n*7|0),a=arenaHash(x*.07-y*.09)*2-1;ctx.strokeStyle=n<.20?'rgba(192,218,139,.34)':'rgba(115,170,102,.25)';ctx.lineWidth=1.1;for(let q=0;q<k;q++){const dx=(q-k/2)*3;ctx.beginPath();ctx.moveTo(x+dx,y+4);ctx.lineTo(x+dx+a*5,y-5-q);ctx.stroke();}}
  // Tiny soil cracks and dry marks, sparse and deterministic.
  ctx.strokeStyle='rgba(73,76,54,.24)';ctx.lineWidth=1.1;for(let x=Math.floor(cx/180)*180;x<cx+viewW+200;x+=180)for(let y=Math.floor(cy/180)*180;y<cy+viewH+200;y+=180){const n=arenaHash(x*.03+y*.07);if(n<.65)continue;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+16+n*22,y+4);ctx.lineTo(x+28+n*18,y-9);ctx.stroke();}
}
function arenaDrawPaths(ctx,map,cx,cy,viewW,viewH){
  // Paths are made from many irregular stone slabs with dirt seams and soft contact shadows, rather than a single painted band.
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  const drawLane=(a,idx)=>{
    const dx=a.tx-a.x,dy=a.ty-a.y,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,steps=Math.ceil(len/(a.w*.62));
    for(let i=0;i<=steps;i++){
      const t=i/steps,q=Math.sin(t*Math.PI);const bend=Math.sin(t*Math.PI*2+idx*.83)*170;const px=a.x+dx*t+nx*bend,py=a.y+dy*t+ny*bend;
      if(px<cx-400||px>cx+viewW+400||py<cy-400||py>cy+viewH+400)continue;
      const seed=idx*10000+i*71,ww=a.w*(.72+.25*arenaHash(seed)),hh=a.w*(.30+.18*arenaHash(seed+3));ctx.save();ctx.translate(px,py);ctx.rotate(Math.atan2(dy,dx)+(.5-arenaHash(seed+5))*.42);
      ctx.fillStyle='rgba(24,32,27,.26)';ctx.beginPath();ctx.ellipse(0,7,ww*.52,hh*.62,0,0,Math.PI*2);ctx.fill();
      const g=ctx.createLinearGradient(0,-hh,0,hh);g.addColorStop(0,'#b0b19b');g.addColorStop(.45,'#8b8d79');g.addColorStop(1,'#656b5b');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(-ww/2,-hh/2,ww,hh,Math.min(14,hh*.25));ctx.fill();
      ctx.strokeStyle='rgba(235,231,204,.20)';ctx.lineWidth=2;ctx.stroke();ctx.strokeStyle='rgba(72,77,64,.35)';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-ww*.18,-hh*.08);ctx.lineTo(ww*.18,hh*.10);ctx.stroke();ctx.restore();
    }
  };
  for(let i=0;i<map.avenues.length;i++)drawLane(map.avenues[i],i);
  // Central ring becomes a circular stone plaza with broken slabs and vegetation gaps.
  const count=44,R=map.ringR;for(let i=0;i<count;i++){const a=i*Math.PI*2/count,seed=30000+i,rr=R*(.95+.08*arenaHash(seed)),ww=255*(.72+.25*arenaHash(seed+1)),hh=150*(.72+.22*arenaHash(seed+2));const px=map.cx+Math.cos(a)*rr,py=map.cy+Math.sin(a)*rr*.86;ctx.save();ctx.translate(px,py);ctx.rotate(a+.5*(arenaHash(seed+3)-.5));ctx.fillStyle='rgba(24,31,27,.24)';ctx.beginPath();ctx.ellipse(0,8,ww*.52,hh*.62,0,0,Math.PI*2);ctx.fill();const g=ctx.createLinearGradient(0,-hh,0,hh);g.addColorStop(0,'#b3b39a');g.addColorStop(1,'#666c5b');ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(-ww/2,-hh/2,ww,hh,18);ctx.fill();ctx.strokeStyle='rgba(235,231,204,.18)';ctx.stroke();ctx.restore();}
  ctx.restore();
}
function arenaPreviewDraw(){
  const c=caEl('arenaPreviewCanvas');if(!c||!window.CA_ARENA_MAP)return;const ctx=c.getContext('2d');
  const sx=c.width/innerWidth,sy=c.height/innerHeight;ctx.setTransform(sx,0,0,sy,0,0);const VW=innerWidth,VH=innerHeight,viewW=1280,viewH=720;
  const map=CA_ARENA_MAP;CA_GAME.camera.x=caClamp(CA_GAME.camera.x,0,map.W-viewW);CA_GAME.camera.y=caClamp(CA_GAME.camera.y,0,map.H-viewH);
  ctx.clearRect(0,0,VW,VH);ctx.save();ctx.scale(VW/viewW,VH/viewH);ctx.translate(-CA_GAME.camera.x,-CA_GAME.camera.y);
  const cx=CA_GAME.camera.x,cy=CA_GAME.camera.y;
  arenaGround(ctx,map,cx,cy,viewW,viewH);arenaDrawPaths(ctx,map,cx,cy,viewW,viewH);
  // Environmental structures are rendered with depth-aware shadows before foliage, like a real 3D arena seen from above.
  for(const l of map.landmarks){if(Math.hypot(l.x-cx,l.y-cy)<1900)arenaDrawStructure(ctx,l);}
  for(const o of CA_GAME.obstacles)if(o.hp>0&&arenaVisible(o,cx,cy,viewW,viewH,260))arenaRock(ctx,o);
  for(const b of CA_GAME.bushes)if(arenaVisible({x:b.x-b.w*.55,y:b.y-b.h*.55,w:b.w*1.1,h:b.h*1.1},cx,cy,viewW,viewH,180))arenaBush(ctx,b);
  for(const d of map.decor)if(d.x>cx-100&&d.x<cx+viewW+100&&d.y>cy-100&&d.y<cy+viewH+100)arenaDrawDecor(ctx,d);
  for(const h of CA_GAME.heals)if(h.x>cx-80&&h.x<cx+viewW+80&&h.y>cy-80&&h.y<cy+viewH+80){ctx.save();ctx.translate(h.x,h.y);ctx.shadowColor='rgba(90,238,207,.55)';ctx.shadowBlur=18;ctx.strokeStyle='rgba(113,244,216,.82)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,h.r+7+Math.sin(performance.now()/500)*2,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(91,229,194,.16)';ctx.beginPath();ctx.arc(0,0,h.r,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d6fff5';ctx.fillRect(-4,-14,8,28);ctx.fillRect(-14,-4,28,8);ctx.restore();}
  for(const b of CA_GAME.bombs)if(b.x>cx-80&&b.x<cx+viewW+80&&b.y>cy-80&&b.y<cy+viewH+80){ctx.save();ctx.translate(b.x,b.y);ctx.fillStyle='#1b2527';ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e59a60';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,21,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#f0c078';ctx.beginPath();ctx.moveTo(8,-13);ctx.quadraticCurveTo(20,-24,17,-32);ctx.stroke();ctx.restore();}
  if(Math.abs(map.cx-cx)<viewW+300&&Math.abs(map.cy-cy)<viewH+300){ctx.save();ctx.translate(map.cx,map.cy);ctx.strokeStyle='rgba(103,225,207,.36)';ctx.lineWidth=6;ctx.beginPath();ctx.arc(0,0,118,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='rgba(222,183,105,.18)';ctx.lineWidth=20;ctx.beginPath();ctx.arc(0,0,148,0,Math.PI*2);ctx.stroke();ctx.fillStyle='rgba(31,66,58,.78)';ctx.beginPath();ctx.arc(0,0,78,0,Math.PI*2);ctx.fill();ctx.restore();}
  ctx.restore();
}
function closeArenaPreview(){
  const a=caEl('arenaPreview');if(!a)return;CA_ARENA_PREVIEW.active=false;cancelAnimationFrame(CA_ARENA_PREVIEW.raf);
  a.classList.add('hidden');caEl('arenaPreviewUI')?.classList.add('hidden');caEl('arenaLoading')?.classList.remove('hidden');document.body.classList.remove('arena-preview-open');
  // Return directly to the lobby; do not route through the battle/game state machine.
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));caEl('lobby')?.classList.remove('hidden');updateLobbyMusic();
}
function openArenaPreview(){
  const a=caEl('arenaPreview');if(!a)return;closeCharacterTestMenu?.();
  const loading=caEl('arenaLoading'),ui=caEl('arenaPreviewUI'),fill=caEl('arenaLoadingFill'),pct=caEl('arenaLoadingPercent'),tip=caEl('arenaLoadingTip');
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));a.classList.remove('hidden');document.body.classList.add('arena-preview-open');loading.classList.remove('hidden');ui.classList.add('hidden');arenaPreviewResize();
  CA_ARENA_PREVIEW={active:true,raf:0,drag:false,lastX:0,lastY:0,yaw:0.55,pitch:0.50,distance:285,pointers:new Map(),gesture:null};arenaPreviewBuild();try{arena3DInit();arena3DResize();}catch(e){console.error('Arena3D init',e);}
  const tips=['Carregando o mundo 27×...','Montando terreno e relevo...','Construindo rochas e cobertura...','Distribuindo vegetação e microdetalhes...','Preparando materiais e iluminação...','Verificando todo o perímetro...','Finalizando o mundo...'];let start=performance.now(),last=0,stableFrames=0;
  const tick=()=>{if(!CA_ARENA_PREVIEW.active)return;const t=performance.now()-start;let p=Math.min(99,Math.floor(t/55));if(t-last>70||p===99){last=t;if(fill)fill.style.width=p+'%';if(pct)pct.textContent=p+'%';if(tip)tip.textContent=tips[Math.min(tips.length-1,Math.floor(p/15))];}
    if(t<7000){requestAnimationFrame(tick);return;}
    // Never reveal the world at 100% until the WebGL scene has a valid frame. Keep 99% while retrying.
    const ok=arena3DProbeFrame(); if(ok)stableFrames++; else stableFrames=0;
    if(stableFrames<2){if(fill)fill.style.width='99%';if(pct)pct.textContent='99%';if(tip)tip.textContent='Verificando renderização 3D...';requestAnimationFrame(tick);return;}
    if(fill)fill.style.width='100%';if(pct)pct.textContent='100%';if(tip)tip.textContent='Mundo pronto.';loading.classList.add('hidden');ui.classList.remove('hidden');arenaPreviewFrame();
  };requestAnimationFrame(tick);
}
window.closeArenaPreview=closeArenaPreview;window.startGame=openArenaPreview;
/* ===== Mundo 3D · Vale da Casona (terceira pessoa / câmera MOBA) ===== */
function openWorld3D(mode){
  closeCharacterTestMenu?.();let w=document.getElementById('world3d');
  if(!w){w=document.createElement('iframe');w.id='world3d';w.className='world3d-frame';w.setAttribute('allow','fullscreen; autoplay');w.title='CyberArena · Mundo 3D';document.body.appendChild(w);}
  w.src='mundo/index.html?mode='+(mode==='solo'?'solo':'bot');w.classList.remove('hidden');
  document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden'));document.body.classList.add('world3d-open');
  try{if(typeof lobbyMusic!=='undefined'&&lobbyMusic&&!lobbyMusic.paused)lobbyMusic.pause();}catch(_){}
  try{playUISound?.('play');}catch(_){}setTimeout(()=>{try{w.focus();}catch(_){}},300);
}
function closeWorld3D(){const w=document.getElementById('world3d');if(w){w.src='about:blank';w.classList.add('hidden');}document.body.classList.remove('world3d-open');openScreen('lobby');}
window.addEventListener('message',e=>{if(e.data&&e.data.type==='cyberarena:exit-world')closeWorld3D();});
window.openWorld3D=openWorld3D;window.closeWorld3D=closeWorld3D;
window.startGame=function(){openWorld3D('bot');};
window.startTraining=function(mode){openWorld3D(mode);};

/* ================= ARENA 3D WORLD RENDERER v125 =================
   Real WebGL geometry: terrain, raised paths, rocks, foliage, walls and props.
   No external engine/CDN is required, so the archive remains self-contained/offline.
*/
function a3dV3(a,b,c){return [a,b,c];}
function a3dPush(arr,x,y,z,nx,ny,nz,r,g,b){arr.p.push(x,y,z);arr.n.push(nx,ny,nz);arr.c.push(r,g,b);}
function a3dTri(arr,a,b,c,na,nb,nc,col){a3dPush(arr,...a,...na,...col);a3dPush(arr,...b,...nb,...col);a3dPush(arr,...c,...nc,...col);}
function a3dBox(arr,x,y,z,w,h,d,col,bevel=0){
  const x0=x-w/2,x1=x+w/2,y0=y,y1=y+h,z0=z-d/2,z1=z+d/2;
  const faces=[[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1]],[[x1,y0,z1],[x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[0,0,1]],[[x0,y0,z1],[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[-1,0,0]],[[x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0],[1,0,0]],[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],[0,1,0]],[[x0,y0,z1],[x1,y0,z1],[x1,y0,z0],[x0,y0,z0],[0,-1,0]]];
  for(const f of faces){const q=f[4];a3dTri(arr,f[0],f[1],f[2],q,q,q,col);a3dTri(arr,f[0],f[2],f[3],q,q,q,col);}
}
function a3dRock(arr,x,z,sx,sy,sz,seed,col,baseY=0){
  const rings=6,sides=12+(seed%7),vs=[];
  for(let r=0;r<=rings;r++){
    const t=r/rings;
    for(let i=0;i<sides;i++){
      const a=i*Math.PI*2/sides;
      const wob=.78+.34*arenaHash(seed*1.71+i*2.13+r*17.3);
      const taper=r===rings?.70:(1-t*.50);
      const asymX=1.0+.18*Math.sin(seed*1.7+i*2.1+r*.9), asymZ=1.0+.16*Math.cos(seed*.9+i*1.6-r*.7);
      const y=baseY+sy*(r===0?.04:Math.pow(t,.78))*(.88+.18*arenaHash(seed+i*4+r*9));
      vs.push([x+Math.cos(a)*sx*wob*taper,y,z+Math.sin(a)*sz*wob*taper]);
    }
  }
  // Bottom, side rings, and a slightly faceted cap create a proper grounded rock silhouette.
  for(let r=0;r<rings;r++)for(let i=0;i<sides;i++){
    const j=(i+1)%sides,a=vs[r*sides+i],b=vs[r*sides+j],c=vs[(r+1)*sides+j],d=vs[(r+1)*sides+i];
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2];
    let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,ln=Math.hypot(nx,ny,nz)||1;nx/=ln;ny/=ln;nz/=ln;
    const shade=.78+.22*Math.max(0,ny);
    const cc=[col[0]*shade,col[1]*shade,col[2]*shade];
    a3dTri(arr,a,b,c,[nx,ny,nz],[nx,ny,nz],[nx,ny,nz],cc);a3dTri(arr,a,c,d,[nx,ny,nz],[nx,ny,nz],[nx,ny,nz],cc);
  }
  const top=vs.slice(rings*sides,(rings+1)*sides),center=[x,baseY+sy*.99,z];
  for(let i=0;i<sides;i++){const j=(i+1)%sides,a=top[i],b=top[j];a3dTri(arr,a,b,center,[0,1,0],[0,1,0],[0,1,0],[col[0]*.92,col[1]*.92,col[2]*.92]);}
}
function a3dLeaf(arr,x,y,z,sx,sy,sz,seed){
  const sides=9,vs=[];
  for(let r=0;r<=4;r++){
    const t=r/4,rr=(1-t)*.9+.16;
    for(let i=0;i<sides;i++){
      const a=i*Math.PI*2/sides,wob=.84+.22*arenaHash(seed+i*7+r*13);
      const yy=y+sy*t*(.92+.12*arenaHash(seed+r*5));
      vs.push([x+Math.cos(a)*sx*rr*wob,yy,z+Math.sin(a)*sz*rr*wob]);
    }
  }
  for(let r=0;r<4;r++)for(let i=0;i<sides;i++){
    const j=(i+1)%sides,a=vs[r*sides+i],b=vs[r*sides+j],c=vs[(r+1)*sides+j],d=vs[(r+1)*sides+i];
    let ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,ln=Math.hypot(nx,ny,nz)||1;nx/=ln;ny/=ln;nz/=ln;
    const col=[.14+.08*(seed%4),.34+.07*((seed+1)%5),.13+.05*((seed+2)%4)];
    a3dTri(arr,a,b,c,[nx,ny,nz],[nx,ny,nz],[nx,ny,nz],col);a3dTri(arr,a,c,d,[nx,ny,nz],[nx,ny,nz],[nx,ny,nz],col);
  }
}
function a3dBoxRot(arr,x,y,z,w,h,d,col,ang=0){
  const ca=Math.cos(ang),sa=Math.sin(ang),pts=[];
  const tr=(lx,ly,lz)=>[x+lx*ca-lz*sa,y+ly,z+lx*sa+lz*ca];
  const x0=-w/2,x1=w/2,z0=-d/2,z1=d/2;
  pts.push(tr(x0,0,z0),tr(x1,0,z0),tr(x1,h,z0),tr(x0,h,z0),tr(x1,0,z1),tr(x0,0,z1),tr(x0,h,z1),tr(x1,h,z1));
  const faces=[[[0,1,2,3],[0,0,-1]],[[4,5,6,7],[0,0,1]],[[5,0,3,6],[-1,0,0]],[[1,4,7,2],[1,0,0]],[[3,2,7,6],[0,1,0]],[[5,4,1,0],[0,-1,0]]];
  for(const f of faces){const q=f[1],a=f[0].map(i=>pts[i]);a3dTri(arr,a[0],a[1],a[2],q,q,q,col);a3dTri(arr,a[0],a[2],a[3],q,q,q,col);}
}
function a3dMat4Perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);return [f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,(2*far*near)*nf,0];}
function a3dLook(eye,target,up){let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2],zl=Math.hypot(zx,zy,zz)||1;zx/=zl;zy/=zl;zz/=zl;let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx,xl=Math.hypot(xx,xy,xz)||1;xx/=xl;xy/=xl;xz/=xl;let yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;return [xx,yx,zx,0,xy,yy,zy,0,xz,yz,zz,0,-(xx*eye[0]+xy*eye[1]+xz*eye[2]),-(yx*eye[0]+yy*eye[1]+yz*eye[2]),-(zx*eye[0]+zy*eye[1]+zz*eye[2]),1];}
function a3dMul(a,b){const o=new Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];return o;}
function a3dCompile(gl,type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)||'shader');return sh;}
function a3dEllipsoid(arr,x,y,z,sx,sy,sz,seed,col){
  const rings=5,sides=10,vs=[];
  for(let r=0;r<=rings;r++){
    const v=r/rings,ph=(v-.5)*Math.PI;
    for(let i=0;i<sides;i++){
      const a=i*Math.PI*2/sides, wob=.88+.18*arenaHash(seed+i*3+r*17);
      const cp=Math.cos(ph),sp=Math.sin(ph);
      vs.push([x+Math.cos(a)*cp*sx*wob,y+sp*sy*(.94+.12*arenaHash(seed+r*7)),z+Math.sin(a)*cp*sz*wob]);
    }
  }
  for(let r=0;r<rings;r++)for(let i=0;i<sides;i++){
    const j=(i+1)%sides,a=vs[r*sides+i],b=vs[r*sides+j],c=vs[(r+1)*sides+j],d=vs[(r+1)*sides+i];
    const na=[(a[0]-x)/(sx*sx),(a[1]-y)/(sy*sy),(a[2]-z)/(sz*sz)],nb=[(b[0]-x)/(sx*sx),(b[1]-y)/(sy*sy),(b[2]-z)/(sz*sz)],nc=[(c[0]-x)/(sx*sx),(c[1]-y)/(sy*sy),(c[2]-z)/(sz*sz)],nd=[(d[0]-x)/(sx*sx),(d[1]-y)/(sy*sy),(d[2]-z)/(sz*sz)];
    for(const n of [na,nb,nc,nd]){const l=Math.hypot(...n)||1;n[0]/=l;n[1]/=l;n[2]/=l;}
    a3dTri(arr,a,b,c,na,nb,nc,col);a3dTri(arr,a,c,d,na,nc,nd,col);
  }
}
function a3dCylinder(arr,x,y,z,r,h,sides,col){
  const top=[],bot=[];
  for(let i=0;i<sides;i++){const a=i*Math.PI*2/sides;bot.push([x+Math.cos(a)*r,y,z+Math.sin(a)*r]);top.push([x+Math.cos(a)*r,y+h,z+Math.sin(a)*r]);}
  for(let i=0;i<sides;i++){const j=(i+1)%sides,nn=[Math.cos((i+.5)*Math.PI*2/sides),0,Math.sin((i+.5)*Math.PI*2/sides)];a3dTri(arr,bot[i],bot[j],top[j],nn,nn,nn,col);a3dTri(arr,bot[i],top[j],top[i],nn,nn,nn,col);}
  for(let i=1;i<sides-1;i++)a3dTri(arr,top[0],top[i],top[i+1],[0,1,0],[0,1,0],[0,1,0],col);
}
function a3dLeafBlade(arr,x,y,z,w,h,ang,seed,col){
  const ca=Math.cos(ang),sa=Math.sin(ang),bend=(arenaHash(seed)-.5)*w*.9;
  const base=[x,y,z], left=[x+(-w*.5)*ca,y+h*.18,z+(-w*.5)*sa], right=[x+(w*.5)*ca,y+h*.18,z+(w*.5)*sa], tip=[x+bend*ca,y+h,z+bend*sa];
  const n=[-sa,.62,ca];
  a3dTri(arr,base,left,tip,n,n,n,col); a3dTri(arr,base,tip,right,n,n,n,col);
  const col2=[col[0]*.78,col[1]*.82,col[2]*.78];
  a3dTri(arr,base,tip,left,[-n[0],n[1],-n[2]],[-n[0],n[1],-n[2]],[-n[0],n[1],-n[2]],col2);
}
function a3dFoliageCone(arr,x,y,z,r,h,seed,col){
  const rings=3,sides=8,vs=[];
  for(let rr=0;rr<=rings;rr++){
    const t=rr/rings,rad=r*(1-t)*(.88+.22*arenaHash(seed+rr*13));
    for(let i=0;i<sides;i++){
      const a=i*Math.PI*2/sides, wob=.88+.18*arenaHash(seed+i*5+rr*17);
      vs.push([x+Math.cos(a)*rad*wob,y+t*h*(.96+.06*arenaHash(seed+i)),z+Math.sin(a)*rad*wob]);
    }
  }
  for(let rr=0;rr<rings;rr++)for(let i=0;i<sides;i++){
    const j=(i+1)%sides,a=vs[rr*sides+i],b=vs[rr*sides+j],c=vs[(rr+1)*sides+j],d=vs[(rr+1)*sides+i];
    let ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=d[0]-a[0],vy=d[1]-a[1],vz=d[2]-a[2],nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    const shade=.82+.18*Math.max(0,ny);const cc=[col[0]*shade,col[1]*shade,col[2]*shade];
    a3dTri(arr,a,b,c,[nx,ny,nz],[nx,ny,nz],[nx,ny,nz],cc);a3dTri(arr,a,c,d,[nx,ny,nz],[nx,ny,nz],[nx,ny,nz],cc);
  }
}
function a3dFoliagePetal(arr,x,y,z,w,h,ang,seed,col){
  const ca=Math.cos(ang),sa=Math.sin(ang),bend=(arenaHash(seed)-.5)*w*.55;
  const base=[x,y,z],l=[x-ca*w*.52,y+h*.10,z-sa*w*.52],r=[x+ca*w*.52,y+h*.10,z+sa*w*.52],tip=[x+ca*bend,y+h,z+sa*bend];
  const n=[-sa,.72,ca],n2=[sa,.72,-ca];
  a3dTri(arr,base,l,tip,n,n,n,col);a3dTri(arr,base,tip,r,n,n,n,col);
  const c2=[col[0]*.62,col[1]*.70,col[2]*.64];a3dTri(arr,base,tip,l,n2,n2,n2,c2);a3dTri(arr,base,r,tip,n2,n2,n2,c2);
  // central vein and tip split give the blade a readable, non-spherical silhouette
  const hi=[Math.min(1,col[0]*1.18),Math.min(1,col[1]*1.14),Math.min(1,col[2]*1.16)];
  a3dTri(arr,[x,y+.02,z], [x+ca*w*.06,y+h*.18,z+sa*w*.06], tip,n,n,n,hi);
}
function a3dBushCluster(arr,x,base,z,seed,scale=1){
  // Dense ground-rooted foliage mass built from dozens of tapered leaf blades, not spheres/cones.
  const trunkH=(7+arenaHash(seed)*9)*scale;
  a3dCylinder(arr,x,base,z,(2.0+arenaHash(seed+3)*2.2)*scale,trunkH,7,[.11,.085,.045]);
  const layers=[
    {r:10,h:28,n:11,c:[.035,.18,.055]},
    {r:15,h:34,n:13,c:[.045,.235,.065]},
    {r:12,h:25,n:10,c:[.075,.31,.085]}
  ];
  for(let li=0;li<layers.length;li++){
    const L=layers[li];
    for(let i=0;i<L.n;i++){
      const a=i*Math.PI*2/L.n+arenaHash(seed+li*41+i*7)*.55;
      const rr=(.35+arenaHash(seed+li*71+i*13)*.72)*L.r*scale;
      const px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr;
      const py=base+trunkH*(.45+li*.25)+arenaHash(seed+i*17+li)*7*scale;
      const w=(6+arenaHash(seed+i*19+li)*10)*scale,h=(18+arenaHash(seed+i*23+li)*22)*scale;
      const c=[L.c[0]*(.82+.22*arenaHash(seed+i)),L.c[1]*(.84+.18*arenaHash(seed+i+2)),L.c[2]*(.82+.24*arenaHash(seed+i+4))];
      a3dFoliagePetal(arr,px,py,pz,w,h,a+Math.PI*.5+(.5-arenaHash(seed+i))*0.45,seed+i*97,c);
      if(i%3===0)a3dFoliagePetal(arr,px,py+h*.08,pz,w*.72,h*.72,a+Math.PI*.5+.9,seed+i*131,[c[0]*.8,c[1]*.88,c[2]*.82]);
    }
  }
  // Low undergrowth spreads horizontally and hides the geometric center.
  for(let i=0;i<9;i++){
    const a=i*2.399+seed*.013,rr=(7+arenaHash(seed+i*33)*16)*scale;
    const px=x+Math.cos(a)*rr,pz=z+Math.sin(a)*rr,py=base+3*scale+arenaHash(seed+i)*4*scale;
    a3dFoliagePetal(arr,px,py,pz,(10+arenaHash(seed+i)*8)*scale,(12+arenaHash(seed+i+7)*10)*scale,a,seed+i+900,[.035,.17,.05]);
  }
}
function a3dTree(arr,x,base,z,seed,scale=1){
  // A branching tree silhouette: trunk + secondary branches + layered irregular leaf sprays.
  const trunkR=4.6*scale;
  a3dCylinder(arr,x,base,z,trunkR,30*scale,8,[.17,.105,.052]);
  for(let b=0;b<4;b++){
    const a=b*Math.PI*.5+arenaHash(seed+b)*.45,len=(18+arenaHash(seed+b*5)*16)*scale;
    const bx=x+Math.cos(a)*len*.55,bz=z+Math.sin(a)*len*.55,by=base+(22+b%2*10)*scale;
    a3dCylinder(arr,(x+bx)/2,by*.98+(base+by)*.02,(z+bz)/2,2.2*scale,len,6,[.16,.095,.045]);
  }
  const crowns=[
    [0,54,29,40],[1.1,68,25,36],[-1.0,64,24,34],[2.5,57,27,37]
  ];
  for(let ci=0;ci<crowns.length;ci++){
    const [ox,yy,rr,hh]=crowns[ci],cx=x+ox*scale,cy=base+yy*scale,cz=z+(arenaHash(seed+ci*13)-.5)*18*scale;
    const count=13+ci*2;
    for(let j=0;j<count;j++){
      const a=j*Math.PI*2/count+arenaHash(seed+ci*31+j)*.35,rad=(rr*.45+arenaHash(seed+ci*17+j)*rr*.7)*scale;
      const px=cx+Math.cos(a)*rad,pz=cz+Math.sin(a)*rad,py=cy+arenaHash(seed+j*9)*8*scale;
      const w=(8+arenaHash(seed+j*11)*12)*scale,h=(24+arenaHash(seed+j*7)*26)*scale;
      const c=ci%3===0?[.035,.19,.055]:ci%3===1?[.045,.245,.065]:[.065,.30,.08];
      a3dFoliagePetal(arr,px,py,pz,w,h,a+.25,seed+ci*100+j*7,c);
    }
  }
}
function a3dGroundPatch(arr,x,z,sx,sz,seed,col,terrainFn){
  const base=terrainFn(x,z),y=base+.08;
  const p=[];const n=[0,1,0];const pts=8;
  for(let i=0;i<pts;i++){const a=i*Math.PI*2/pts,rr=.82+.26*arenaHash(seed+i*7);p.push([x+Math.cos(a)*sx*rr,y,z+Math.sin(a)*sz*rr]);}
  const c=[x,y+.02,z];for(let i=0;i<pts;i++)a3dTri(arr,c,p[i],p[(i+1)%pts],n,n,n,col);
}
function arena3DInit(){
  const c=caEl('arenaPreviewCanvas');if(!c)return false;const gl=c.getContext('webgl2',{antialias:true,alpha:false,preserveDrawingBuffer:false})||c.getContext('webgl',{antialias:true,alpha:false});if(!gl)return false;
  const vs=`attribute vec3 aP;attribute vec3 aN;attribute vec3 aC;uniform mat4 uVP;varying vec3 vN;varying vec3 vC;varying vec3 vP;void main(){vN=aN;vC=aC;vP=aP;gl_Position=uVP*vec4(aP,1.0);}`;
  const fs=`precision mediump float;varying vec3 vN;varying vec3 vC;varying vec3 vP;uniform vec3 uEye;void main(){vec3 N=normalize(vN);vec3 L=normalize(vec3(-.48,1.0,.32));vec3 L2=normalize(vec3(.55,.42,-.35));float d=max(dot(N,L),0.0);float fill=max(dot(N,L2),0.0);float hemi=.35+.45*max(N.y,0.0);vec3 col=vC*(hemi+.55*d+.16*fill);float rim=pow(1.0-max(dot(N,normalize(uEye-vP)),0.0),3.0);col+=vec3(.035,.055,.045)*rim;float fog=clamp(length(uEye-vP)/23500.0,0.0,.34);col=mix(col,vec3(.10,.17,.14),fog);gl_FragColor=vec4(col,1.0);}`;
  const prog=gl.createProgram();gl.attachShader(prog,a3dCompile(gl,gl.VERTEX_SHADER,vs));gl.attachShader(prog,a3dCompile(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('program');
  const loc={p:gl.getAttribLocation(prog,'aP'),n:gl.getAttribLocation(prog,'aN'),c:gl.getAttribLocation(prog,'aC'),vp:gl.getUniformLocation(prog,'uVP'),eye:gl.getUniformLocation(prog,'uEye')};
  const makeMesh=(arr)=>{const b={p:gl.createBuffer(),n:gl.createBuffer(),c:gl.createBuffer(),count:arr.p.length/3};gl.bindBuffer(gl.ARRAY_BUFFER,b.p);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr.p),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,b.n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr.n),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,b.c);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(arr.c),gl.STATIC_DRAW);return b;};
  const ground={p:[],n:[],c:[]},rocks={p:[],n:[],c:[]},fol={p:[],n:[],c:[]},props={p:[],n:[],c:[]},water={p:[],n:[],c:[]};
  const map=CA_ARENA_MAP,W=map.W,H=map.H;
  const terrainY129=(x,z)=>-5+arenaNoise2(x/1550,z/1550)*7+arenaNoise2(x/540+8,z/540-3)*2.2+arenaNoise2(x/190-4,z/210+5)*.55;
  // smooth continuous terrain with enough tessellation to read as a real ground surface.
  const gx=88,gz=64;
  const th=[];for(let iz=0;iz<=gz;iz++){th[iz]=[];for(let ix=0;ix<=gx;ix++){const x=ix*W/gx-W/2,z=iz*H/gz-H/2;th[iz][ix]=terrainY129(x,z);}}
  for(let iz=0;iz<gz;iz++)for(let ix=0;ix<gx;ix++){
    const x0=ix*W/gx-W/2,x1=(ix+1)*W/gx-W/2,z0=iz*H/gz-H/2,z1=(iz+1)*H/gz-H/2;
    const A=[x0,th[iz][ix],z0],B=[x1,th[iz][ix+1],z0],C=[x1,th[iz+1][ix+1],z1],D=[x0,th[iz+1][ix],z1];
    const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=D[0]-A[0],vy=D[1]-A[1],vz=D[2]-A[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx,nl=Math.hypot(nx,ny,nz)||1;const n=[nx/nl,ny/nl,nz/nl];
    const variation=arenaNoise2(ix*.32+2,iz*.41-4),fine=arenaNoise2(ix*1.17-8,iz*.93+5);const base=.145+.055*variation;const warm=Math.max(0,fine-.15)*.045;const col=[base+.035*fine+warm,.285+.095*variation+.035*fine,.135+.055*variation+.018*fine];a3dTri(ground,A,B,C,n,n,n,col);a3dTri(ground,A,C,D,n,n,n,col);
  }
  // Natural soil/grass patches break the sterile uniform plane without becoming 2D decals.
  for(let i=0;i<260;i++){const x=(arenaHash(i*7.1)-.5)*W*.94,z=(arenaHash(i*9.3+2)-.5)*H*.94,s=25+arenaHash(i*11.7)*75;const col=i%3===0?[.17,.30,.17]:i%3===1?[.23,.36,.20]:[.20,.33,.18];a3dGroundPatch(ground,x,z,s,s*(.55+.7*arenaHash(i+4)),i,col,terrainY129);}
  // Stone avenues: individually shaped slabs with smaller border stones, but now seated on the relief.
  for(const av of map.avenues){const dx=av.tx-av.x,dz=av.ty-av.y,len=Math.hypot(dx,dz),ang=Math.atan2(dz,dx);for(let t=0;t<len;t+=105){const px=av.x+dx*(t/len)-W/2,pz=av.y+dz*(t/len)-H/2;const yy=terrainY129(px,pz)+.22;const ww=86+arenaHash(t*.013+av.tx)*52,dd=78+arenaHash(t*.021+av.ty)*42;a3dBoxRot(props,px,yy,pz,ww,5.8,dd,[.255+.045*arenaHash(t),.30+.045*arenaHash(t+3),.275+.038*arenaHash(t+7)],ang+.055*arenaHash(t+9));a3dGroundPatch(ground,px+Math.cos(ang+Math.PI/2)*(dd*.62),pz+Math.sin(ang+Math.PI/2)*(dd*.62),dd*.52,18,Math.floor(t)+av.tx,[.18,.255,.13],terrainY129);if((Math.floor(t/105)+Math.round(av.tx))%2===0){for(const side of [-1,1]){const bx=px+Math.cos(ang+Math.PI/2)*side*(dd*.54),bz=pz+Math.sin(ang+Math.PI/2)*side*(dd*.54);a3dEllipsoid(props,bx,yy+.4,bz,10+arenaHash(t+side)*7,5+arenaHash(t+side*2)*3,8+arenaHash(t+side*3)*6,Math.floor(t)+side+7,[.24,.29,.25]);}}}}
  // Existing authored rocks become more organic and grounded.
  for(let i=0;i<CA_GAME.obstacles.length;i++){const o=CA_GAME.obstacles[i],x=o.x+o.w/2-W/2,z=o.y+o.h/2-H/2;if(Math.hypot(x,z)>Math.max(W,H)*.78)continue;const s=Math.max(o.w,o.h)*.55,organic=o.kind!=='metal',base=terrainY129(x,z),seed=o.seed||i; a3dRock(rocks,x,z,s*(.72+.55*arenaHash(seed)),s*(.48+.35*arenaHash(seed+4)),s*(.62+.52*arenaHash(seed+8)),seed,organic?[.28,.37,.28]:[.31,.40,.43],base);if(i%3===0)a3dEllipsoid(rocks,x+18*arenaHash(seed+2)-9,base+s*.08,z+20*arenaHash(seed+3)-10,s*.20,s*.15,s*.24,seed+91,organic?[.23,.31,.24]:[.27,.34,.36]);}
  // Dense, rooted vegetation: layered leaves, fronds and trunks. Avoid spherical “balls”.
  for(let i=0;i<CA_GAME.bushes.length;i++){
    const b=CA_GAME.bushes[i],x=b.x-W/2,z=b.y-H/2,n=b.seed||i,base=terrainY129(x,z);
    const sc=.72+(Math.abs(Math.sin(n*1.71))*.62);
    if(i%7===0) a3dTree(fol,x,base,z,n,sc*.78);
    else a3dBushCluster(fol,x,base,z,n,sc);
  }
  // Extra undergrowth pockets: small leaves and stems bind bushes into the terrain.
  for(let i=0;i<620;i++){
    const x=(arenaHash(i*4.3+71)-.5)*W*.92,z=(arenaHash(i*6.1+91)-.5)*H*.92,base=terrainY129(x,z),sc=.45+arenaHash(i*2.2)*.7;
    const c=i%3===0?[.045,.20,.065]:i%3===1?[.06,.25,.075]:[.08,.29,.09];
    a3dLeafBlade(fol,x,base+.5,z,5*sc,14*sc,arenaHash(i)*Math.PI*2,i,c);
    if(i%4===0)a3dLeafBlade(fol,x+4*sc,base+.4,z-3*sc,4*sc,11*sc,arenaHash(i+8)*Math.PI*2,i+3000,c);
  }
  // Fine vegetation: upright blades and tiny stones give the ground a lived-in scale.
  let seed=918273;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<2600;i++){const x=(rnd()-.5)*W*.96,z=(rnd()-.5)*H*.96,base=terrainY129(x,z),hh=5+rnd()*17,w=1+rnd()*3;const c=[.13+rnd()*.07,.27+rnd()*.15,.10+rnd()*.07];a3dTri(fol,[x,base+.03,z],[x+w,base+.03,z],[x+w*.48,base+hh,z],[0,1,0],[0,1,0],[0,1,0],c);if(i%9===0)a3dEllipsoid(rocks,x,base+.7,z,2+rnd()*4,1.5+rnd()*1.4,2+rnd()*4,i,[.24,.28,.22]);}
  // Environmental landmarks / central core.
  for(const l of map.landmarks){const x=l.x-W/2,z=l.y-H/2,base=terrainY129(x,z);if(l.type==='core'){for(let j=0;j<12;j++){const a=j*Math.PI/6;const px=x+Math.cos(a)*235,pz=z+Math.sin(a)*235;a3dBoxRot(props,px,terrainY129(px,pz)+.1,pz,132,34,88,[.20,.29,.27],a+.2);}a3dBoxRot(props,x,base-.2,z,430,15,430,[.15,.23,.21],.08);a3dEllipsoid(props,x,base+24,z,120,20,120,7001,[.22,.32,.29]);}else{for(let j=0;j<8;j++){const a=j*Math.PI/4,r=125+(j%3)*48,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,by=terrainY129(px,pz),ss=34+(j%3)*12;a3dRock(rocks,px,pz,ss*(.78+.18*arenaHash(j+17)),ss*(.48+.16*arenaHash(j+31)),ss*(.74+.22*arenaHash(j+47)),j+901,[.24,.32,.27],by);if(j%2===0)a3dEllipsoid(rocks,px+Math.cos(a+.8)*26,by+3,pz+Math.sin(a+.8)*26,10,5,8,j+1201,[.20,.28,.24]);}}}
  // No large dead zones: clusters are placed with deliberate spacing and mixed composition.
  let cs=48391;const cr=()=>{cs=(cs*1103515245+12345)>>>0;return cs/4294967296;};
  for(let k=0;k<190;k++){const x=(cr()-.5)*W*.9,z=(cr()-.5)*H*.9,base=terrainY129(x,z),s=17+cr()*31,seed2=12000+k;a3dRock(rocks,x,z,s*1.30,s*.78,s*1.05,seed2,[.25,.34,.27],base);const pieces=3+(k%4);for(let j=0;j<pieces;j++){const a=cr()*Math.PI*2,r=22+cr()*62,px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,pb=terrainY129(px,pz);a3dFoliagePetal(fol,px,pb+2,pz,7+cr()*9,12+cr()*16,a,seed2+j*17,[.055,.22,.065]);if(j%2===0)a3dEllipsoid(rocks,px,pb+2,pz,3+cr()*5,2+cr()*3,4+cr()*6,seed2+j*29,[.20,.28,.22]);}if(k%3===0)a3dFoliagePetal(fol,x+(cr()-.5)*40,base+2,z+(cr()-.5)*40,9+cr()*8,14+cr()*14,cr()*6.28,seed2+91,[.06,.26,.07]);}
  // A few shallow water features create material contrast and visual depth in open areas.
  const waterSpots=[[-W*.27,-H*.18,210,150],[W*.30,H*.20,230,160],[-W*.22,H*.32,170,120]];
  for(let i=0;i<waterSpots.length;i++){const [x,z,sx,sz]=waterSpots[i],base=terrainY129(x,z)-1.4,p=[];for(let j=0;j<9;j++){const a=j*Math.PI*2/9,rr=.86+.12*arenaHash(i*31+j);p.push([x+Math.cos(a)*sx*rr,base,z+Math.sin(a)*sz*rr]);}const cc=[.12,.28,.27];for(let j=1;j<8;j++)a3dTri(water,p[0],p[j],p[j+1],[0,1,0],[0,1,0],[0,1,0],cc);}
  const meshes=[makeMesh(ground),makeMesh(props),makeMesh(rocks),makeMesh(fol),makeMesh(water)];
  window.CA_ARENA_3D={gl,prog,loc,meshes,ground,props,rocks,fol,water};gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.065,.12,.10,1);return true;
}
function arena3DHasContent(){
  const r=window.CA_ARENA_3D;
  return !!(r&&r.gl&&r.prog&&r.meshes&&r.meshes.length===5&&r.meshes.every(m=>m&&m.count>0));
}
function arena3DProbeFrame(){
  if(!arena3DHasContent())return false;
  try{
    arena3DDraw();
    const gl=window.CA_ARENA_3D.gl, px=new Uint8Array(4), w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
    const spots=[[.5,.5],[.25,.5],[.75,.5],[.5,.25],[.5,.75]];
    let nonClear=0;
    for(const [sx,sy] of spots){gl.readPixels(Math.floor(w*sx),Math.floor(h*sy),1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);if(px[0]+px[1]+px[2]>18)nonClear++;}
    return nonClear>=2 && gl.getError()===gl.NO_ERROR;
  }catch(e){console.warn('Arena3D probe',e);return false;}
}
function arena3DResize(){const c=caEl('arenaPreviewCanvas');const r=window.CA_ARENA_3D;if(!c)return;if(r?.gl){const dpr=Math.min(1.35,devicePixelRatio||1);c.width=Math.max(1,innerWidth*dpr);c.height=Math.max(1,innerHeight*dpr);c.style.width='100%';c.style.height='100%';r.gl.viewport(0,0,c.width,c.height);}else arenaPreviewResize();}
function arena3DDraw(){const r=window.CA_ARENA_3D,c=caEl('arenaPreviewCanvas');if(!r||!c)return;const gl=r.gl;gl.viewport(0,0,c.width,c.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(r.prog);const W=CA_GAME.world.w,H=CA_GAME.world.h;const cam=window.CA_ARENA_PREVIEW||{};const target=[CA_GAME.camera.x+640-W/2,0,CA_GAME.camera.y+360-H/2];const dist=cam.distance||285,pitch=cam.pitch??0.50,yaw=cam.yaw??0.55;const cp=Math.cos(pitch),eye=[target[0]+Math.cos(yaw)*cp*dist,target[1]+Math.sin(pitch)*dist,target[2]+Math.sin(yaw)*cp*dist];const P=a3dMat4Perspective(Math.PI/3.72,c.width/c.height,1,18000),V=a3dLook(eye,target,[0,1,0]),VP=a3dMul(P,V);gl.uniformMatrix4fv(r.loc.vp,false,new Float32Array(VP));gl.uniform3fv(r.loc.eye,new Float32Array(eye));for(const m of r.meshes){gl.bindBuffer(gl.ARRAY_BUFFER,m.p);gl.enableVertexAttribArray(r.loc.p);gl.vertexAttribPointer(r.loc.p,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.enableVertexAttribArray(r.loc.n);gl.vertexAttribPointer(r.loc.n,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,m.c);gl.enableVertexAttribArray(r.loc.c);gl.vertexAttribPointer(r.loc.c,3,gl.FLOAT,false,0,0);gl.drawArrays(gl.TRIANGLES,0,m.count);}}


function arenaPreviewFrame(){if(!window.CA_ARENA_PREVIEW?.active)return;arena3DDraw();CA_ARENA_PREVIEW.raf=requestAnimationFrame(arenaPreviewFrame);}
function bindArenaExit(){const exit=caEl('arenaExit');if(exit&&!exit.dataset.bound){exit.dataset.bound='1';const go=e=>{e.preventDefault();e.stopPropagation();closeArenaPreview();};exit.addEventListener('pointerdown',go,{passive:false});exit.addEventListener('click',go,{passive:false});exit.addEventListener('touchend',go,{passive:false});}}
bindArenaExit();
document.addEventListener('DOMContentLoaded',bindArenaExit);
window.CA_ARENA_PREVIEW={active:false,raf:0,drag:false,lastX:0,lastY:0,yaw:0.55,pitch:0.50,distance:285,pointers:new Map(),gesture:null};
window.addEventListener('resize',()=>{if(CA_ARENA_PREVIEW.active)arena3DResize();});
function arenaGestureState(){const a=CA_ARENA_PREVIEW;if(!a?.pointers?.size)return null;const pts=[...a.pointers.values()];if(pts.length===1)return {type:'look',x:pts[0].x,y:pts[0].y};const A=pts[0],B=pts[1];return {type:'panzoom',cx:(A.x+B.x)/2,cy:(A.y+B.y)/2,dist:Math.hypot(A.x-B.x,A.y-B.y)};}
window.addEventListener('pointerdown',e=>{if(!CA_ARENA_PREVIEW.active)return;const c=caEl('arenaPreviewCanvas');if(e.target!==c)return;const a=CA_ARENA_PREVIEW;a.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});c.setPointerCapture?.(e.pointerId);a.gesture=arenaGestureState();});
window.addEventListener('pointermove',e=>{const a=CA_ARENA_PREVIEW;if(!a?.active||!a.pointers?.has(e.pointerId))return;const prev=arenaGestureState();a.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const cur=arenaGestureState();if(!prev||!cur)return;
  const W=CA_GAME.world.w,H=CA_GAME.world.h;
  if(cur.type==='look'&&prev.type==='look'){const dx=cur.x-prev.x,dy=cur.y-prev.y;a.yaw-=dx*0.0085;a.pitch=caClamp(a.pitch-dy*0.0065,0.28,0.88);}
  else if(cur.type==='panzoom'&&prev.type==='panzoom'){const dx=cur.cx-prev.cx,dy=cur.cy-prev.cy;const pan=2.15;CA_GAME.camera.x-=dx*pan;CA_GAME.camera.y-=dy*pan;CA_GAME.camera.x=caClamp(CA_GAME.camera.x,0,Math.max(0,W-1280));CA_GAME.camera.y=caClamp(CA_GAME.camera.y,0,Math.max(0,H-720));if(prev.dist>20&&cur.dist>20){const ratio=prev.dist/cur.dist;a.distance=caClamp(a.distance*ratio,185,520);}}
});
function arenaPointerEnd(e){const a=CA_ARENA_PREVIEW;if(!a?.pointers)return;a.pointers.delete(e.pointerId);a.gesture=arenaGestureState();}
window.addEventListener('pointerup',arenaPointerEnd);window.addEventListener('pointercancel',arenaPointerEnd);
window.addEventListener('wheel',e=>{if(!CA_ARENA_PREVIEW.active)return;e.preventDefault();CA_ARENA_PREVIEW.distance=caClamp(CA_ARENA_PREVIEW.distance*Math.exp(e.deltaY*.001),185,520);},{passive:false});
window.addEventListener('keydown',e=>{if(!CA_ARENA_PREVIEW.active)return;const step=110;if(e.key==='ArrowLeft'||e.key.toLowerCase()==='a')CA_GAME.camera.x-=step;if(e.key==='ArrowRight'||e.key.toLowerCase()==='d')CA_GAME.camera.x+=step;if(e.key==='ArrowUp'||e.key.toLowerCase()==='w')CA_GAME.camera.y-=step;if(e.key==='ArrowDown'||e.key.toLowerCase()==='s')CA_GAME.camera.y+=step;if(e.key==='Escape')closeArenaPreview();});

caBindControls();caApplyControlLayout();
})();
