# CyberArena v90 — revisão visual e gameplay

## Correções verificadas
- Pasta raiz interna do ZIP: `CyberArena`.
- JOGAR = Partida Normal: 16 bots, mapa 27x a tela.
- TESTAR > Partida com Bot: 7 bots iniciais, mapa 5x.
- TESTAR > Treino Solo: 4 bots estacionários, mapa 5x.
- Cronômetro: 2:30 e só avança após a contagem de entrada terminar.
- Entrada: revelação do mapa inteiro + 3/2/1 + COMEÇAR.
- Saída: encerra o loop e retorna ao Lobby após animação.
- Cyber usa `Player.png` original para frente e uma visão traseira derivada da mesma silhueta/proporção para manter identidade visual.
- Cyber renderizado em corpo inteiro e menor que a escala exagerada anterior.
- Ataque: 2 munições; combo direita/esquerda/direita; dano total 500; recarga 0,8 s; alcance 1,5 bloco.
- Cada ataque consumido/acertado conta como uma carga; 5 acertos carregam o Super.
- Laser separado; usa a mesma munição e o mesmo alcance de ataque.
- Super: 3.100; alvo único até 4 blocos; 6 disparos alternados.
- Super multi-alvo: detecção automática a até 6 blocos; 4 mísseis por alvo; alvo lançado ao ar.
- Stun: 4 s.
- Pós-Super: +25% velocidade por 13 s.
- Regeneração: 300 HP/0,5 s após 4 s sem dano, com brilho e partículas.
- Roubo de vida: 600 HP por eliminação do jogador.
- Bombas: 800 dano.
- Cura de mapa: 600, equivalente ao roubo de vida.
- Spawns priorizam moitas e respeitam distância mínima de outros participantes; treino evita spawns dentro de obstáculos.
- Paredes, obstáculos e paredes destrutíveis têm representação visual e colisão; ataques podem danificar cobertura destrutível.
- Controles mobile foram reduzidos e redesenhados sem emojis, com joystick cinza/azulado e três botões de habilidade separados.
- Controles continuam redimensionáveis e reposicionáveis e persistem no dispositivo.
- IA possui três personalidades, avaliação de perigo, recuo, cura, mira, ataque, strafe e memória de comportamento.
- IA aumenta adaptação continuamente em resposta a precisão, pressão, padrão de distância e sucesso/fracasso do jogador; a adaptação não para em um limite de três níveis.
- Ondas de Partida com Bot: 7 -> +3 ao eliminar toda a onda, limitando a 16.
- Personagem foi refeito para uma apresentação própria: palco, status EM BREVE, atributos, habilidades, função, visão 2D e botão TESTAR.
- Seletor de teste recebeu apresentação própria em vez de aparência de modal genérico.

## Verificações técnicas
- `node --check main.js`: PASS.
- IDs HTML: verificados sem duplicações novas.
- Assets `Player.png`, `Bot.png`, `back_cyber.png`: presentes em `assests/ui/`.
- `back_cyber.png`: 719x893 RGBA.
- ZIP final será validado com `unzip -t`.

## Limitação explícita
A execução gráfica completa do Chromium no ambiente de build não foi confiável nesta revisão devido ao bloqueio/timeout do navegador headless neste ambiente. Portanto, não é declarado um PASS de renderização automática nesta versão. A lógica e os arquivos foram revisados, mas a validação visual final deve ser feita no navegador do dispositivo, onde Web Audio, Pointer Events e viewport móvel também existem.
