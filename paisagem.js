/* CyberArena · jogo sempre DEITADO (paisagem) no celular.
   - No app Android (APK) a própria tela do Android já fica travada em paisagem.
   - No navegador/app instalado: no primeiro toque o jogo entra em tela cheia e trava o aparelho
     em paisagem de verdade (o Android gira a tela inteira, mesmo com a rotação automática desligada).
   - Enquanto o aparelho estiver em pé e não for possível travar (ex.: iPhone), aparece um aviso
     para tocar/girar — o jogo nunca é mostrado em pé nem "girado por cima" da tela em pé. */
(function () {
  if (window.CyberLandscape) return;
  // dentro do APK o Android já trava a tela deitada
  if (location.hostname === 'appassets.androidplatform.net') { window.CyberLandscape = { lock: function () { }, locked: function () { return true; } }; return; }
  document.documentElement.classList.add('cy-web');
  var touch = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  var css = document.createElement('style');
  css.textContent =
    '#cyRot{position:fixed;inset:0;z-index:2147483000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px;' +
    'background:radial-gradient(circle at 50% 40%,#13284a,#070b16 70%);color:#e8f6ff;font:800 16px system-ui,sans-serif;text-align:center;padding:24px;touch-action:none}' +
    '#cyRot .ph{width:62px;height:104px;border:4px solid #38f2ff;border-radius:12px;box-shadow:0 0 22px rgba(56,242,255,.5);animation:cyRot 1.8s ease-in-out infinite}' +
    '#cyRot button{font:900 15px system-ui;letter-spacing:.06em;padding:14px 26px;border-radius:12px;border:0;background:linear-gradient(180deg,#ffd93a,#d99a08);color:#2a1a00;box-shadow:0 5px 0 #7d5500}' +
    '#cyRot small{opacity:.7;font-weight:600;max-width:300px}' +
    '@keyframes cyRot{0%,25%{transform:rotate(0)}55%,85%{transform:rotate(-90deg)}100%{transform:rotate(0)}}' +
    '@media (orientation:portrait){html.cy-touch #cyRot{display:flex}}';
  (document.head || document.documentElement).appendChild(css);
  if (touch) document.documentElement.classList.add('cy-touch');

  var busy = false;
  function locked() { return !!(screen.orientation && /landscape/.test(screen.orientation.type || '')); }
  function lock() {
    if (!touch || busy) return;
    var d = document.documentElement;
    var go = function () {
      busy = false;
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () { }); } catch (_) { }
    };
    if (!document.fullscreenElement && d.requestFullscreen) {
      busy = true;
      try { d.requestFullscreen({ navigationUI: 'hide' }).then(go, go); } catch (_) { go(); }
    } else go();
  }
  window.CyberLandscape = { lock: lock, locked: locked };

  function overlay() {
    if (!touch || document.getElementById('cyRot')) return;
    var o = document.createElement('div'); o.id = 'cyRot';
    o.innerHTML = '<div class="ph"></div><div>CYBER ARENA É JOGADO DEITADO</div>' +
      '<button type="button">TOQUE PARA DEITAR A TELA</button>' +
      '<small>Se a tela não girar sozinha, vire o celular para a horizontal.</small>';
    o.querySelector('button').addEventListener('click', lock);
    o.addEventListener('pointerup', lock);
    document.body.appendChild(o);
  }
  if (document.body) overlay(); else document.addEventListener('DOMContentLoaded', overlay);

  // qualquer toque no jogo (inclusive dentro do mundo 3D) mantém tela cheia + paisagem
  addEventListener('pointerup', lock, true);
  addEventListener('message', function (e) { if (e.data && e.data.type === 'cyberarena:gesture') lock(); });
  document.addEventListener('fullscreenchange', function () { if (document.fullscreenElement) lock(); });
})();
