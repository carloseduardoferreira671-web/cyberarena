# CyberArena v89 — revisão de Personagem, Arena, HUD e IA

## Correções motivadas pelo teste visual

A captura de tela enviada pelo usuário mostrava quatro problemas principais: arena praticamente preta/sem leitura de terreno, controles grandes e genéricos com aparência de protótipo, personagem visualmente diferente do arquivo fornecido e ausência de uma apresentação convincente da arena.

## Regras de mapa confirmadas

- Treino Solo: 4 bots estacionários, mapa 5× a tela.
- Partida com Bot: 7 bots iniciais, mapa 5× a tela.
- Partida Normal/JOGAR: 16 bots, mapa 27× a tela.
- A câmera acompanha o personagem; não há rolagem manual do mapa.
- O mundo usa obstáculos, paredes, vegetação, bombas e áreas de cura.
- Spawns tentam usar vegetação e respeitam uma distância mínima entre entidades.
- Respawn usa novamente uma posição segura e separada.

## Personagem

- O arquivo `assests/ui/Player.png` continua sendo a fonte exata da frente do Cyber.
- O gameplay usa um novo `assests/ui/back_cyber.png`, construído a partir da silhueta e proporções do próprio Player.png para manter identidade visual e uma leitura de costas coerente.
- O Cyber aparece de corpo inteiro, com sombra, barra de vida acima, animação de idle/movimento e efeitos de ataque/regeneração.
- Durante ataque/Super, a frente do Cyber é revelada usando o Player.png.
- O tamanho de referência continua baseado em aproximadamente 3 blocos de jogo.

## HUD / controles

- Joystick esquerdo com estética metálica azul-cinza e centro móvel.
- Ataque, Laser e Super em botões circulares separados, com acabamento, brilho, borda e ícones vetoriais em vez dos emojis da versão anterior.
- Ataque e Super ficam na região inferior direita; Super é maior e mais baixo.
- Laser fica próximo aos outros dois, mas separado visualmente.
- Munição fica junto aos botões de ataque.
- Super mostra 0/5 e estado PRONTO.
- Vida fica no canto superior esquerdo e também é desenhada sobre o personagem.
- Cronômetro começa em 2:30 quando a partida realmente começa.
- A configuração de escala e posição dos controles continua disponível.

## Entrada da partida

Antes do combate, o jogo mostra uma visão simplificada do mapa inteiro:

- 5× nos modos de teste.
- 27× na Partida Normal.

Depois retorna à câmera do personagem e executa a contagem 3 → 2 → 1 → COMEÇAR.
O combate fica congelado durante a apresentação/contagem.

## Combate

- Ataque físico em combo de três golpes, totalizando 500 de dano por ataque completo.
- 2 munições.
- Recarga de 0,8 s.
- 5 ataques acertados carregam o Super.
- Laser usa a mesma munição e conta como acerto para o carregamento.
- Super de 3.100 de dano.
- Alvo único: até 4 blocos, 6 disparos alternados.
- Multi-alvo: ativa quando há mais de um alvo dentro da janela, usa até 6 blocos e 4 mísseis por alvo, com cadência mais rápida.
- Atordoamento de 4 s.
- Após o Super, +25% de velocidade por 13 s.
- Regeneração de 300 HP a cada 0,5 s após 4 s sem receber dano.
- Eliminação concede roubo de 600 HP com efeito visual.
- Bombas causam 800 de dano.
- Coberturas destrutíveis recebem dano e apresentam rachaduras/efeitos de destruição.

## IA adaptativa

Cada bot possui uma das três personalidades:

1. Impulsivo
2. Cauteloso
3. Caçador

Cada bot mantém memória local do comportamento do jogador e atualiza:

- precisão;
- consciência de perigo;
- distância preferida;
- agressividade;
- esquiva/strafe;
- confiança;
- taxa de adaptação.

O aprimoramento é progressivo e aumenta após o tempo de jogo e respawns. Bots mais conscientes recuam quando a ameaça é alta, procuram distância para regeneração e voltam ao combate. Bots com menor consciência cometem mais decisões ruins, preservando as três personalidades em vez de transformar todos em máquinas idênticas.

## Referências de design

A composição dos controles segue princípios de jogos mobile de ação/MOBA: joystick de movimento à esquerda, habilidades separadas à direita, mira/seleção de alvo e controles personalizáveis. Wild Rift documenta explicitamente controles móveis reformulados e opções de personalização dos controles, incluindo ajustes de joystick e controles de habilidades. A referência de ambiente de Arcane foi usada apenas para buscar uma leitura mais rica de iluminação, textura, materiais, contraste e composição; o visual do CyberArena permanece original. 

## Validação

- JavaScript: `node --check` PASS.
- `Index.html`: HUD com uma única instância de `gameHud`.
- Handlers `gameUseAttack` / `gameUseSuper`: presentes.
- Player.png: 719×893 RGBA.
- back_cyber.png: 719×893 RGBA e baseado na silhueta do Player.png.
- Bot.png: 719×893 RGBA.
- Pasta principal do ZIP: `CyberArena`.
- Servidor, contas, economia e interface anterior preservados.
