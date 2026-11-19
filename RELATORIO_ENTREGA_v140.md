# CyberArena · entrega v140 (v138 + v139 + download no lobby)

Base: somente os ZIPs enviados nesta conversa (jogo v15 partes 1 e 2 + ATUALIZACAO_v137). Nada de outro chat.
Backups: `_backup_v15_antes/` (antes da v137), `_backup_v137_antes/` (antes da v138) e `_backup_v138_antes/` (antes da v139) e `_backup_v139_antes/` (antes da v140).

## 1. Balanceamento (passe, progressão, caixas, missões, ofertas)
Antes → depois (totais):
| | antes | depois |
|---|---|---|
| Passe grátis (100 níveis) | 9.000 moedas, 9.700 fichas, 5 gemas, 20 caixas | 2.000 moedas, 120 fichas, 20 gemas, 15 caixas |
| Passe premium | 19.000 moedas, 11.200 fichas, 100 gemas, 24 caixas | 3.000 moedas, 200 fichas, 50 gemas, 20 caixas |
| Progressão 1–1000 | 100.200 moedas, 34.200 fichas, 499 caixas | 16.000 moedas, 1.200 fichas, 180 caixas, 100 gemas |
| Preço do Passe Premium | 140 gemas | 100 gemas |
| Saldo inicial | 500 moedas, 50 gemas | 300 moedas, 20 gemas |
| Missão do personagem | 100 gemas | 20 gemas |
| Oferta grátis de gemas | 100 (e o recibo mostrava 400) | 30 |
| Código comunitário | 200 gemas + 7 caixas | 30 gemas + 4 caixas |
| Marcos de nível do personagem (por personagem) | 60 gemas + 5.600 moedas | 31 gemas + 1.850 moedas |
| Ganho por partida | teto 800 moedas / 50 fichas por dia | teto 600 moedas / 35 fichas por dia (depois do teto ganha 20%) |
| Caixas | conteúdo e gemas bem maiores | menores; Cyber/Mecha custam fichas e rendem menos que o preço em média |
| Ofertas pagas com gemas | preço por gema variava bastante | preço alinhado ao câmbio (1 gema ≈ 25 moedas + 5 fichas) |
Regra usada: o que entra por dia/temporada fica abaixo do que o jogo gasta (evoluir os 3 personagens custa ~46.000 moedas e ~3.900 fichas).
O servidor próprio (`server/server.mjs`) recebeu as mesmas tabelas, preços e valores; ele também tinha números inflados (câmbio 1 gema = 100 moedas + 100 fichas, oferta de 400 gemas, caixas com até 80 gemas).

## 2. Visual
- Caixas: cartões com brilho e moldura da raridade, arte maior, chances só com cor e porcentagem, botão de preço maior.
- Recursos: cartões maiores com brilho nos ícones.
- Arquivo novo: `ui2/visual138.css`.

## 3. Entrada do jogo
- As duas telas de abertura (splash + "clique para começar") viraram **uma só** (`ui2/boot.js`, `ui2/boot.css`): título, verificação dos recursos e TOQUE PARA COMEÇAR.
- A escolha de conta (criar / convidado / já tenho) abre logo depois do toque (antes demorava 2 s sobre o lobby).

## 4. Downloads
- Saíram das Configurações. Agora são **obrigatórios na entrada** e baixam todos os personagens (28 MB). O sistema passou a ligar também no navegador (antes só no app, por isso "GERENCIAR" não fazia nada).
- Mapas: são gerados por código, não há arquivo para baixar (ver `RECURSOS_BAIXAVEIS.md`).

## Status
- Implementado: tudo acima.
- Verificado no código: sintaxe de todos os .js alterados; tabelas do cliente e do servidor idênticas nos 1.000 níveis.
- Testado em execução (Chromium sem tela, 844x390): entrada bloqueada até baixar; download dos 3 personagens; segunda abertura direto no toque; lobby com personagem 3D; coletar passe grátis/premium/progressão, abrir caixas, missão, ofertas — valores batem com as tabelas; sem erro de JavaScript.
- Não testado: celular real, toque, som, rede móvel/queda de internet no meio do download, servidor online (só checagem de sintaxe; sem banco aqui), a tela de entrada em outros tamanhos de tela.
- Limite conhecido: no servidor próprio o câmbio de gemas não tem limite diário (só 20 gemas por pedido).

## Ajuste v139 (entrada)
- "TOQUE PARA COMEÇAR" ficou no rodapé da tela.
- Depois do toque aparece a **tela de carregamento** (mesma arte): barra com etapas e uma dica. Ela termina quando o personagem 3D do lobby está montado (mínimo ~2 s, limite de 9 s) e só então abre o lobby.
- Arquivos: `ui2/boot.js`, `ui2/boot.css`, `lobby3d.js` (uma linha que avisa que o personagem ficou pronto).
- Testado em execução (Chromium sem tela): tela do toque, barra de carregamento, abertura do lobby, sem erro de JavaScript. Não testado em celular real (o tempo real de carregamento no seu aparelho ainda não foi medido).

## Ajuste v140 (download no lobby)
- A tela de entrada voltou a ter só o título, o TOQUE PARA COMEÇAR e o carregamento. Não tem mais download nela.
- O download obrigatório agora é uma janela **RECURSOS DO JOGO dentro do lobby** (abre ~0,5 s depois que o lobby aparece, se faltar algo). Não dá para fechar: só some quando os personagens estão baixados; aí o personagem 3D aparece.
- Falha de download: a janela agora mostra o motivo real por fonte (ex.: `cyber_rig.glb → site: HTTP 404 · jsDelivr: HTTP 404`) e o botão TENTAR DE NOVO. **A falha que você teve no aparelho eu não consegui reproduzir aqui**; com essa mensagem dá para ver a causa.
- Arquivos: `ui2/boot.js`, `ui2/boot.css`, `lobby3d.js` (espera `cyberResReady`), `mundo/js/packs.js` (mensagem de erro), `RECURSOS_BAIXAVEIS.md`.
- Testado em execução (Chromium sem tela): entrada sem download, janela no lobby, falha simulada (404) com mensagem, recuperação e personagem montando depois do download, sem erro de JavaScript. Não testado em celular real nem com a internet caindo no meio.
