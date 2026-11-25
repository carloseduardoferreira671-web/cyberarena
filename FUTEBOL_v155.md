# FUTEBOL · v155 · Fase 1 (offline)

Modos novos na tela de MODOS: **Estádio Dourado** (`?mode=soccer_gold`) e **Estádio Azul** (`?mode=soccer_blue`).
Hoje: **Treino** livre e **Pênaltis**, os dois offline, com goleiro bot. O hub de 24 jogadores, matchmaking, times e bots de linha vêm nas próximas fases.

## Arquivos
- `mundo/js/ballphys.js` — física pura da bola (sem THREE). Gravidade, arrasto, efeito (Magnus), quique, atrito e rolagem com rotação real, traves/travessão/rede. Dá para testar no Node.
- `mundo/js/stadium.js` — o estádio (campo com listras e linhas, arquibancadas, torcida, treliças, refletores com feixes, placas de LED, gols com rede, placar 3D, céu). Tem a mesma interface de colisão do Mundo/Realm, então os personagens andam nele normalmente. Fica em x = REALM_X.
- `mundo/js/soccerrig.js` — animações de futebol feitas por código, em camada por cima do clipe que estiver tocando: chute, passe, lançamento, cruzamento, voleio, cabeceio, domínio, toque de condução, lateral; e do goleiro: posição de espera, mergulho (baixo, meio, alto), encaixe, soco, arremesso e levantar. O jogo escolhe a animação sozinho pela situação da bola.
- `mundo/js/soccer.js` — jogo: chute/passe/cruzamento/cabeceio/drible, contato corpo×bola, regras (gol, lateral, escanteio, tiro de meta), goleiro bot, treino com alvos, pênaltis, HUD e sons (sintetizados, sem arquivos).
- `game.js` — só os ganchos: `MODE === 'soccer'`, `Stadium` no lugar do `Realm`, `soccer.update(dt)` e `soccer.act(nome)`.
- `modes.js` + `assests/modes/soccer_*.webp` — os dois cartões de modo (capas feitas das fotos de vista de cima).

## Condução (bola quase no pé)
Com a bola perto, ela acompanha o pé em toques curtos a cada passada (mais longe quando você corre, mais perto no drible), mas não gruda: em curva fechada ou com sprint ela se afasta um pouco. Bola vindo na sua direção é amortecida (domínio) e assenta no pé.

## Controles
| Ação | Celular | Teclado |
|---|---|---|
| Chute | segurar e soltar o botão ⚽ (carrega a força) | J ou H |
| Passe | ➜ | K |
| Cruzamento | ⤴ | L ou Q |
| Drible | ⚡ | R |
| Efeito e altura | arrastar o dedo no botão enquanto carrega | U/O efeito · I/N altura |
| Cabeceio | pular e chutar com a bola alta | — |

## Ajustes rápidos (números)
- Bola: `BALL` no topo de `ballphys.js` (gravidade, quique, arrasto, efeito, rolagem).
- Força dos chutes: `KICK` no topo de `soccer.js`.
- Dificuldade do goleiro: `skill` em `brainUpdate()` (treino .6 · pênaltis .5).
- Tamanho do campo e do gol: `FIELD` no topo de `stadium.js` (96 × 60 m, gol 8 × 2,6 m).

## Texturas reais (quando chegarem)
`stadium.js` hoje desenha tudo por código. As texturas reais entram em `mundo/assets/estadio/<nome>/{color,normal,rough,ao}.webp`:
`grama`, `grama_gasta`, `concreto`, `metal`, `piso`, mais `rede.png` (alfa), `torcida.png` (atlas com alfa) e céus `ceu_dourado.jpg` / `ceu_azul.jpg`.
Depois é só registrar o pacote `estadio` em `tools/make_packs.py` e rodar `make_packs.py` + `make_sw.py`.

## Próximas fases
1. Hub de 24 jogadores com totens (1x1, 2x2, 3x3, 4x4, 6x6, pênaltis, treino) e matchmaking de 15 s.
2. Servidor simulando a bola (autoritativo), times, placar de partida, tempos, gol de ouro.
3. Bots de linha profissionais (técnico por time, papéis, cooperação com jogadores reais) e goleiro trocável.
4. Papéis automáticos com rodízio justo e o modo com poderes.
