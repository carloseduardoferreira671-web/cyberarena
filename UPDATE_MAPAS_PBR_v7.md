# Atualização v7 — vegetação PBR e ambiente vivo

Aplicada sobre a versão Atlas Abismo v6, preservando os sistemas existentes.

## Mundo aberto e Batalha 16
Os dois modos usam a mesma cena 3D `World`, portanto compartilham a atualização ambiental.

- Folhagem com materiais `MeshPhysicalMaterial`, roughness map e normal map procedural compartilhados.
- Camada PBR existente (`pbr.js`) conectada aos materiais de árvores, arbustos e folhas.
- Galhos/folhagem com balanço e flutter um pouco mais perceptíveis.
- Empurrão local da vegetação quando personagens passam perto, usando o sistema de `uPush` que já existia.
- Folhas caindo/voando continuam instanciadas e agora usam superfície PBR.
- Ruído ambiente de folhagem muito discreto, mais presente em áreas arborizadas.
- Som curto de folhas/arbusto ao atravessar arbustos, com atenuação espacial e limite de repetição.

## Arquivos alterados
- `mundo/js/world.js`
- `mundo/js/audio.js`
- `mundo/js/game.js`

## Preservação e limitações
- Não altera mapa, rotas, spawn, colisões de combate, personagens, dano, habilidades, câmera ou interface.
- Não adiciona dependências externas nem baixa texturas.
- A vegetação continua instanciada e com LOD/culling para manter o custo controlado em celulares.
- O efeito é PBR em tempo real do Three.js; o resultado final deve ser conferido no navegador e no aparelho-alvo.
