# CyberArena v136 — HUD estilo Free Fire + treino online + chat de voz no mundo

Base: ZIP "cyberarena_com_grupo (2)" (último readme encontrado: v135). Backup dos originais alterados em `_backup_v135_antes/`.

## O que mudou (e só isso)
| Arquivo | Mudança |
|---|---|
| `mundo/hud.css` (novo) | HUD nova: botões de vidro escuro com anel e ícone branco, botão de ataque grande com anel laranja, cartão do jogador angular, vida segmentada + super no centro embaixo, ferramentas em ícones, placas dos jogadores, chat/jogadores/emotes no mesmo estilo |
| `mundo/index.html` | cartão do jogador, barras (`#vitals`) e ferramentas em ícones SVG; botões novos `#bVoice` e `#bMic`; link para `hud.css` |
| `mundo/js/worldvoice.js` (novo) | chat de voz do mundo (reaproveita `voice.js` do grupo) |
| `mundo/js/game.js` | treino deixa de ser forçado offline (cai para offline sozinho se o servidor não responder ou for antigo); liga voz; lista de jogadores também no treino online; números de vida/super; classe `mode-*` no body |
| `online-server/server.mjs`, `online-server/social.mjs` | modo `train` (sala livre separada do mundo aberto), golpes aceitos na sala de treino, eventos de voz (`vstate`, `voice`) |
| `api/index.mjs` (Vercel) | as mesmas mudanças do servidor próprio |

Não foi mexido: efeitos de poderes (a base já traz espaço-tempo/destruição/luz de cinema), partida de 16, grupo/lobby, câmera, mundo, personagens.

## Status de cada item
**Testado em execução** (Chromium headless + `online-server` local, dois jogadores, microfone falso):
- treino online: os dois entram na mesma sala `train`; chat nos dois sentidos pelo botão CHAT; o mesmo no mundo aberto.
- voz: ligar pelo botão 🎧 nos dois, conexão WebRTC "connected", faixa de áudio remota ativa nos dois lados; quando um sai, o outro solta a conexão.
- servidor antigo (sem `train`): o jogo entra em treino offline sem cair em fila de partida.
- HUD: capturas de tela 844×390 no treino (Cyber e Nexus), mundo aberto e partida de 16 (offline), sem erros no console.

**Verificado só no código (não rodou):**
- `api/index.mjs` (Vercel + Redis): mesma lógica do servidor próprio, só checagem de sintaxe; não há Redis aqui.
- permissão de microfone no APK: o `AndroidManifest.xml` e o `MainActivity.java` já pedem `RECORD_AUDIO`; não testei no aparelho.

**Ainda não confirmado:**
- teste em celular real (tamanho/posição dos botões, toque, 120 Hz, aparelho Xiaomi).
- voz com 3+ pessoas (limite de 6 no código; só testei 2), voz audível de verdade (microfone falso gera tom), voz em 4G/redes restritas (só STUN; sem TURN algumas redes não conectam).
- golpes entre dois jogadores no treino online (o servidor aceita; não testei) e como os bonecos de treino se comportam com 2 jogadores (cada um cria os seus localmente).
- função Netlify (`netlify/functions/api.mts`) e `server/` não foram alterados: com eles o treino cai para offline e a voz não existe.
- ícone do botão de soco continua o mesmo (mão aberta).

## Como ligar a voz com TURN (opcional)
No navegador: `localStorage.setItem('cyberarena.ice', JSON.stringify([{urls:'turn:SEU_SERVIDOR',username:'u',credential:'p'}]))`.
