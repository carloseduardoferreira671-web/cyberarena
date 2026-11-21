# v148 · Status dos personagens (vida, dano e poder em números)

## O que mudou
- **Tela PERSONAGEM** refeita: nível, VIDA, VELOCIDADE, DANO DO COMBO, REGENERAÇÃO, CURA DO KIT, PODER POR COMBO e o **dano de cada ataque** (Combo, Habilidade, Super, Extra), tudo em número inteiro e com o valor do próximo nível ao lado (`4.380 ➜ 4.460`). Sem porcentagem.
- Saiu o que era antigo: botões Combo/Laser/Super/Acenar/Dançar, grade de troféus e barra de XP do perfil (continuam no Perfil). Cada ataque tem um ▶ para ver a animação.
- **Fonte única**: `mundo/js/charstats.js`. O lobby e o jogo usam a mesma conta, então o número da tela é o dano real.

## Vida e dano base (nível 1)
| | Vida | Velocidade | Soco 1/2/3 | Poder por golpe |
|---|---|---|---|---|
| NEXUS (controle) | 4.600 | 740 | 390 / 468 / 780 | 0,95 |
| CYBER (dano) | 4.000 | 720 | 420 / 504 / 840 | 0,90 |
| ATLAS (tanque) | 4.300 | 770 | 400 / 480 / 800 | 0,85 |

## Evolução (nível 1 a 20)
Ganho total no nível 20: vida +40%, dano +30%, velocidade +8% (igual ao que já existia). Antes era a mesma % para todos e a vida era 100. Agora os passos são inteiros e quase iguais entre si:
- Cyber: vida 4.000 → 5.600, passos de +70 a +100 por nível.
- Nexus: 3.800 → 5.320 (+70 a +90). Atlas: 4.600 → 6.440 (+80 a +110).
- Combo do Cyber sobe +23 a +30 por nível. Velocidade sobe +2 a +4 por nível.
Para conferir: `CYBER_STATS.table('cyber')` no console.

## No jogo (`mundo/js/game.js`)
- Vida máxima por personagem e nível (jogador, bots e bonecos de treino). Bots usam nível 1 a 12 conforme a habilidade.
- Dano = `round(dano-base do ataque × multiplicador do personagem/nível)`. Poder do super por golpe usa o dano-base × fator do personagem.
- Zona, kit de cura (45% da vida) e regeneração (4%/s) continuam proporcionais à vida máxima.
- Velocidade de corrida agora vem do status de cada personagem (antes igual para todos).
- Vida máxima viaja junto no pacote de rede (`mh`), e o servidor online aceita dano até 20.000 por golpe (antes 60).
- Golpe final do Atlas continua deixando 1 de vida; a Supernova do Cyber continua letal.

## Arquivos
`mundo/js/charstats.js` (novo), `mundo/js/game.js`, `mundo/js/fx.js`, `mundo/index.html`, `index.html`, `ui2/econ.js`, `ui2/ui2.css`, `lobby3d.js`, `online-server/server.mjs`, `sw.js` (regenerado).
Se o servidor online já estiver no ar, suba o novo `online-server/server.mjs`: sem isso o dano alto é cortado em 60 por golpe.
