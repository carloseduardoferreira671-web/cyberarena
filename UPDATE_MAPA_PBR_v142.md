# v142 · Mapa ampliado + texturas PBR reais (pack baixável)

## O que mudou
1. **Mapa maior**: de 200×112 para **300×168 blocos** (~2,2× a área). O vale com a casona continua igual no centro; ao redor entraram
   4 rios, 8 acampamentos (C7–C14), 8 estradas, 6 plantações, 10 montanhas, 14 florestas, 8 prados,
   **7 ruínas antigas** (pilares quebrados, muros, colunas caídas, altar com braseiro) e **4 torres de vigia** (escada em espiral pisável).
   Tudo vem de `mundo/js/w2/layout.js`; o tamanho do mundo agora vem de `LAYOUT.world.hx/hz` (core_blocks.js).
2. **Física**: ruínas e torres têm colisores (pilares sólidos, muros que dá para pular, degraus pisáveis, plataforma no topo).
3. **Texturas PBR reais** (cor + normal + rugosidade + AO): chão (grama, terra, calçada, rocha) com relevo, paredes de pedra, piso, ruínas (muro medieval),
   degraus (tijolo) e postes das torres (casca de árvore). Rocha gerada da sua foto cinza (repetível, com normal/AO/rugosidade).
4. **Céu** com nuvens da foto de cúmulos (mistura com as nuvens procedurais), **cáusticas** da foto da piscina no fundo dos rios,
   **arbustos fotográficos** (9 modelos recortados, 3 planos cruzados, com vento).
5. **4K com orçamento de memória**: aparelhos com ≥ 8 GB e qualidade alta carregam 4K em até 7 materiais (≈ 1,4 GB de vídeo), na ordem
   grama → terra → calçada → pedra → ruínas → piso → tijolo → casca; o resto fica em 2K. ≥ 6 GB usa 2K; abaixo disso 1K.
6. **Packs no lobby**: `mapa_1k` (13 MB, essencial), `mapa_2k` (52 MB), `mapa_4k` (269 MB, 4K sem perda). Sem pack, o jogo usa o procedural de antes.

## Como publicar
1. Suba a pasta `mundo/assets/map/` e os arquivos alterados (lista abaixo) no mesmo lugar de sempre.
2. `mundo/packs.json` já vem gerado. Se mudar qualquer textura: `python3 tools/make_packs.py`.

## Arquivos
`mundo/assets/map/**` (novo) · `mundo/packs.json` · `mundo/js/w2/world.js` · `world_tex.js` · `world_veg.js` · `layout.js` · `core_blocks.js` · `tools/make_packs.py`

## Ainda não usado (você mandou, falta uma função no jogo)
Cracked concrete, vitórias-régias (lago), folha, decal de sujeira, fotos de montanha (fundo distante). **Não foi testado em celular real.**
