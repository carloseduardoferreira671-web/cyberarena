# CyberArena

## Current runtime

CyberArena is currently delivered as a browser game interface with an optional authoritative server:

- `Index.html` — interface and screens.
- `main.js` — interface behavior, local guest/account fallback, and server API client.
- `style.css` — visual layout and responsive behavior.
- `assests/` — active visual assets. The spelling `assests` is intentional for compatibility with the existing project.
- `sounds/` — active music and interface sounds.
- `data/` — supporting game data.
- `server/` — PostgreSQL-backed authentication, accounts, codes, security controls and authoritative economic commands.
- `legacy/original-godot/` — preserved older prototype files; not used by the current browser runtime.

## Important security boundary

When connected to the hosted server, the browser is not trusted with balances, rewards, inventory, XP, Pass claims, progression claims, purchases, box rolls, name changes or Inbox reward claims. These operations are validated and committed by the server.

Guest mode intentionally does not persist progress.

## Time rules

Daily cycles use UTC midnight. The server is the source of time for connected accounts.

## Cyber Account

A Cyber Account uses a unique Cyber Account identifier and a password. The owner/admin area is protected separately on the server.

## v82 — teste de caixas da Caixa de Entrada

No modo local, a tela CÓDIGOS possui o botão **REPETIR CÓDIGO · TESTE LOCAL**. Ele remove apenas a marcação local de `CYBERARENA001` e a mensagem local desse código para permitir repetir o teste. Não é um bypass do servidor: no modo remoto, a regra de uso único por Cyber Account permanece no servidor.

Quando uma recompensa da Caixa de Entrada for uma caixa, ela é entregue primeiro ao inventário e entra em uma fila de abertura: uma caixa por vez, com toque obrigatório para abrir e revelação das recompensas uma a uma antes de liberar a próxima caixa.

## Fluxo de caixas da Caixa de Entrada

Caixas resgatadas entram na coleção e são abertas individualmente. O jogador precisa iniciar e concluir cada caixa antes de a próxima da mesma recompensa ser apresentada.


## v88
Gameplay corrigido: JOGAR = 16 bots/27×; TESTAR = Bot 7/5× e Solo 4/5×; contador 2:30; controles redimensionáveis/reposicionáveis.
