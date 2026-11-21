# v153 · União de tudo (base = pacote "novos personagens" v147)

Os personagens são SÓ os do v147 (Nexus armadura azul, Atlas dreads/correntes, Cyber encapuzado). Nada dos corpos antigos veio dos outros zips.

## O que foi unido por cima
- **Modo offline / online (v146 + v152)**: ui2/net.js, ui2/offline.js, ui2/net.css, ui2/boot.js, main.js, mundo/js/net.js, "bot joga por você" ao sair do app, resultado offline sem troféus/XP, sw.js (service worker com progresso da v152).
- **Modos de jogo**: modes.js, modes.css, assests/modes/*.webp e o gancho no lobby3d.js (a v152 tinha tirado o link do modes.css; aqui ele continua).
- **Mapa v145** (árvores 3D, poças, chão PBR): world.js, world_veg.js, texturas 4K, packs.js/packs.json (regerado com os personagens novos).
- **Status dos personagens (v148)**: charstats.js, tela PERSONAGEM, vida/dano/velocidade por nível, server.mjs (aceita dano até 20.000).

## Ajustes que fiz ao unir
1. **Bug da v148 corrigido**: em `damage()` um comentário `//` engolia o resto da linha e a vida nunca descia. Agora é `/* */`.
2. **Dano pela rede**: o cliente cortava o dano recebido em 60; agora aceita até 20.000 (igual ao servidor).
3. **Dano do combo = tela de status**: golpes 1/2/3 usam base 10/12/20 (antes 9/12/22 no v147).
4. **Bots aleatórios** entre os 3 personagens (BOTS_ATLAS=false); o v147 deixava só Atlas/Nexus/Cyber de teste.
5. **normal.webp do mapa 4K** veio cortado num dos zips; usei o íntegro.
6. Cache dos pacotes de modelos: `cyberarena-packs-v9` (força baixar os personagens novos).

## Ao subir
- Suba tudo, inclusive `sw.js` e `online-server/server.mjs` (sem o servidor novo o dano alto é cortado).
- Se mexer em arquivos do jogo: `python3 tools/make_packs.py` e depois `python3 tools/make_sw.py`.
- Testes dos personagens: `node tools/anim_tests/run_all.mjs` (passou: TUDO OK).
- Não testei em celular/navegador de verdade; conferi sintaxe de todos os .js e os testes de animação.

## v153b · Pés assentados (calcanhar)
- **Causa**: no corpo em repouso a ponta do pé fica 35–41° ABAIXO do tornozelo (Nexus 35°, Cyber 38°, Atlas 41°), mas o IK (`rigcore.js`, `applyPose`) tratava "pitch 0" como pé horizontal. Isso girava o pé para cima e só o calcanhar apoiava.
- **Correção**: `M.footDrop` (medido do esqueleto de cada personagem) é somado ao pitch do pé. Pitch 0 agora é o pé inteiro assentado. A escalada em parede mantém o mesmo ângulo absoluto de antes (`fightlib.js`).
- **Medido** (todos os clipes, 3 personagens): quadros com o pé apoiado só no calcanhar caíram de 93,9% para 5,5%. O que sobra é intencional (ponta do pé na corrida/sprint, rasteira).
- `fightdata.js` regenerado e `node tools/anim_tests/run_all.mjs` continua TUDO OK. Rode `python3 tools/make_sw.py` depois de qualquer mudança.
