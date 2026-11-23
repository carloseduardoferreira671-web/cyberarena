/* CyberArena · PORTA DE ENTRADA do acesso antecipado.
   Só aparece se o servidor estiver com PRESALE_GATE=1. Pede o código, confere no servidor e guarda neste aparelho.
   - Quem já entrou uma vez continua entrando mesmo se o servidor estiver dormindo/offline (confirmado de novo em segundo plano).
   - Código devolvido/cancelado volta a pedir o código.
   Observação honesta: é uma tranca simples no navegador (suficiente para centenas de amigos/compradores);
   quem entende de programação consegue contornar. Se um dia precisar de tranca forte, o servidor das partidas deve exigir o código também. */
(() => {
  'use strict';
  const CFG = window.PRESALE || {}, API = (CFG.api || '').replace(/\/$/, '') + '/api/presale';
  const KEY = 'cyberarena.access', DEV = 'cyberarena.dev';
  const rd = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let dev = rd(DEV); if (!dev) { dev = 'd' + Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); wr(DEV, dev); }
  const get = async (p, ms = 70000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(API + '/' + p, { signal: c.signal }); return await r.json(); } finally { clearTimeout(t); } };
  const MSG = { invalido: 'Esse código não existe. Confira as letras.', cancelado: 'Esse código foi cancelado (devolução).', aparelhos: 'Esse código já está em aparelhos demais.', formato: 'O código tem 8 letras/números, ex.: ABCD-2345.' };
  let box = null;

  function ui() {
    if (box) return box;
    box = document.createElement('div'); box.id = 'accessGate';
    box.innerHTML = `<style>
#accessGate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:radial-gradient(120% 90% at 50% 0,#12306b 0,#050913 70%);color:#eef7ff;font-family:'Outfit',system-ui,sans-serif;-webkit-user-select:none;user-select:none}
#accessGate .c{width:min(100%,430px);padding:24px 22px;background:linear-gradient(180deg,#14224a,#0a1226);border:1px solid #2b4f8f;clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px);text-align:center}
#accessGate h2{font-family:'BigShoulders','Arial Narrow',sans-serif;font-size:36px;letter-spacing:.04em;text-transform:uppercase;font-weight:900;margin:0 0 4px}
#accessGate h2 b{color:#1be5ff}
#accessGate p{margin:6px 0 14px;color:#8fa6cf;font-size:15px;line-height:1.4}
#accessGate input{width:100%;min-height:58px;text-align:center;font:900 30px 'BigShoulders','Arial Narrow',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#1be5ff;background:#06101f;border:1px solid #2b4f8f;border-radius:0;outline:0;-webkit-user-select:text;user-select:text}
#accessGate input:focus{border-color:#1be5ff;box-shadow:0 0 0 3px rgba(27,229,255,.2)}
#accessGate button,#accessGate a.b{display:grid;place-items:center;width:100%;min-height:54px;margin-top:10px;border:0;cursor:pointer;text-decoration:none;font:900 22px 'BigShoulders','Arial Narrow',sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#1a1000;background:linear-gradient(180deg,#ffe36e,#ff9a14);clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
#accessGate a.b.s,#accessGate button.s{color:#eef7ff;background:transparent;border:1px solid #2b4f8f;clip-path:none;font-size:17px;min-height:46px}
#accessGate button[disabled]{filter:grayscale(1) brightness(.6)}
#accessGate .e{min-height:20px;margin-top:10px;color:#ff8da1;font-size:14px}
#accessGate .w{color:#ffd23f}
</style><div class="c"><h2>CYBER<b>ARENA</b></h2><p id="agMsg">Acesso antecipado. Digite o código que você recebeu na compra.</p>
<input id="agCode" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-2345" aria-label="Código de acesso">
<button id="agGo">ENTRAR</button><div class="e" id="agErr" role="alert"></div>
<a class="b s" id="agBuy" href="pre-registro/">AINDA NÃO TENHO CÓDIGO</a></div>`;
    (document.body || document.documentElement).appendChild(box);
    const inp = box.querySelector('#agCode');
    inp.addEventListener('input', () => { let v = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); inp.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
    box.querySelector('#agGo').onclick = submit;
    return box;
  }
  function say(t, warn) { const e = ui().querySelector('#agErr'); e.textContent = t || ''; e.className = 'e' + (warn ? ' w' : ''); }
  function hide() { if (box) { box.remove(); box = null; } }
  async function submit() {
    const b = ui(), inp = b.querySelector('#agCode'), go = b.querySelector('#agGo'), code = inp.value.trim();
    if (code.replace('-', '').length !== 8) return say(MSG.formato);
    go.disabled = true; say('Conferindo… (se o servidor estava dormindo, pode levar até 1 minuto)', true);
    try {
      const r = await get('check?code=' + encodeURIComponent(code) + '&dev=' + encodeURIComponent(dev));
      if (r.ok) { wr(KEY, { code, ts: Date.now() }); hide(); } else say(MSG[r.reason] || 'Código não aceito.');
    } catch { say('Sem conexão com o servidor. Tente de novo em instantes.'); }
    go.disabled = false;
  }
  const GK = 'cyberarena.gate';   // última resposta conhecida: true/false (evita piscar a tela se o acesso antecipado estiver desligado)
  async function start() {
    const saved = rd(KEY), known = rd(GK);
    if (!(saved && saved.code) && known !== false) { ui(); say('Verificando acesso… (se o servidor estava dormindo, pode levar até 1 minuto)', true); }   // jogador novo: tranca já, até o servidor responder
    let st = null;
    try { st = await get('status', saved ? 8000 : 75000); } catch { /* servidor dormindo ou offline */ }
    if (st) wr(GK, !!st.gate);
    if (st && !st.gate) return hide();                            // acesso antecipado desligado: jogo aberto
    if (saved && saved.code) {                                    // já entrou antes: passa e confere em segundo plano
      get('check?code=' + encodeURIComponent(saved.code) + '&dev=' + encodeURIComponent(dev), 20000)
        .then(r => { if (r && r.ok === false && ['cancelado', 'invalido'].includes(r.reason)) { try { localStorage.removeItem(KEY); } catch {} ui(); say(MSG[r.reason]); } else if (r && r.ok) wr(KEY, { code: saved.code, ts: Date.now() }); })
        .catch(() => {});
      return;
    }
    if (st) say('');
    else if (box) say('Servidor indisponível agora. Verifique a internet e abra de novo.', true);
  }
  start();
})();
