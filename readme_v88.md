# CyberArena v88 — revisão profunda de Personagem, HUD e arenas

## Modos corrigidos
- **TESTAR → Treino Solo:** 4 bots parados, arena 5× a tela, respawn de 4 s.
- **TESTAR → Partida com Bot:** 7 bots, arena 5× a tela, 3 personalidades e ondas que podem crescer +3 quando a onda inteira é derrotada (até 16).
- **JOGAR:** partida normal todos-contra-todos, 16 bots, arena 27× a tela.
- Contador: 2:30.
- Câmera acompanha Cyber; não existe rolagem manual.

## Cyber
- 7.500 HP, 500 ataque, 3.100 Super, nível 1.
- Ataque = combo direita → esquerda → direita; dano total de 500; 2 munições; recarga 0,8 s; alcance 1,5 bloco.
- 5 acertos de ataques carregam o Super.
- Laser alternado dos dois braços, usando a mesma munição.
- Super: salto/impacto; 6 disparos alternados em alvo único, ou 4 mísseis rápidos por alvo no modo multi-alvo; atordoamento de 4 s; alvo único até 4 blocos; multi-alvo até 6 blocos.
- Após o Super: +25% velocidade por 13 s.
- Regeneração: 300 HP a cada 0,5 s após 4 s sem receber dano, com brilho/partículas.
- Ao derrotar inimigos: rouba 600 HP com efeito visual de laser.

## Arena
- Perspectiva 2D com Cyber de costas por padrão e frente revelada nas ações.
- Corpo inteiro, sombras, terreno em camadas, vegetação, paredes, obstáculos, cobertura destrutível, bombas de 800 dano e pontos de cura de 600.
- Spawns procuram áreas de mato e mantêm distância de segurança.
- Bots usam ataque, laser, Super, recuo para regenerar e três personalidades.

## Controles
- Joystick à esquerda; laser, ataque e Super à direita.
- Configurações → Controles da partida permite ajustar tamanho e arrastar posição dos controles; posição fica salva no dispositivo.
