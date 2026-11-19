# CyberArena v87 — Personagem + Treino 2D perspectiva

Esta versão usa os arquivos enviados do personagem como fonte de referência e adiciona uma camada jogável 2D em perspectiva sobre a interface v86.

## Personagem
- Visão padrão de costas, corpo inteiro.
- Revelação da frente durante golpes/super.
- Tamanho base de 3 blocos (bloco = 32 unidades).
- Vida 7.500 / ataque 500 / super 3.100 / nível 1.
- Ataque: combo de 3 socos (direita, esquerda, direita), 2 munições, recarga 0,8 s, alcance 1,5 bloco.
- Laser: 2 disparos alternados, usa a mesma munição.
- Super: 5 acertos carregam; salto/impacto e 6 disparos alternados contra alvo único; em múltiplos alvos, até 6 blocos e 4 mísseis rápidos por alvo.
- Atordoamento de 4 s.
- +25% de velocidade por 13 s após o super.
- Regeneração: 300 HP a cada 0,5 s depois de 4 s sem dano.
- Roubo de vida: 600 HP por inimigo derrotado.

## Modos de teste
- Treino Solo: mapa 5x a tela, 4 bots parados, respawn após 4 s em posição separada.
- Partida com Bot: mapa 27x a tela, 7 bots, nomes BOT 1–17 sem repetição por partida, 3 personalidades e comportamento de perseguição/recuo/ataque.
- Paredes, obstáculos, vegetação, paredes destrutíveis, bombas de 800 de dano e zonas de cura de 600.
- Câmera acompanha o personagem; não existe scroll manual do mapa.
- Entrada com visão do mapa e contagem de 3 segundos.
- SAIR executa animação e retorna ao Lobby.

## Controles
- Teclado: WASD/setas, espaço = ataque, E = laser, Q = super.
- Touch: joystick à esquerda; ataque, laser e super à direita.
- A interface já possui a base de configurações de resposta tátil/vibração.

## Arquivos enviados preservados
`character_sources/` contém cópias dos arquivos enviados nesta etapa:
- Cyber_3d.png
- ciborgly.gd
- modelo.zip
- cyber.tscn
- cyber.animtree

O jogo continua sendo a versão web do CyberArena; esses arquivos são mantidos como referência/fonte do personagem e não substituem a interface atual.
