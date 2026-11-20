# v142 · Mapa ampliado + texturas PBR reais (pack baixável)

## O que mudou (v144)
**Árvores reais (era o que ainda parecia 2D)**
- Troncos e galhos em 3D com **casca PBR** (UV real + normal + rugosidade), raiz alargada e limbos que se ramificam (carvalho).
- Copa feita de **muitos cartões de folhas/agulhas** (atlas de ramos de conífera e de folhas individuais, gerados por código), com normais de copa.
- **3 níveis de LOD**: perto (completo), médio (menos cartões, até ~70 m) e longe (versão antiga leve). Bloco de 36 m para a troca ser suave.
- Só ligam com o pack do mapa instalado e qualidade média ou alta; sem pack, tudo volta ao procedural.
**Água e chão**
- **Vitórias-régias** (~2 000) derivam com o vento, giram de leve e se afastam de quem entra na água.
- **Poças refletivas** (55–90) em terreno plano; a grama não cresce dentro delas (são só visuais: sem física).
- Arbustos: os procedurais antigos não são mais desenhados; iluminação mais uniforme nos planos.
## O que mudou (v143, mantido)
Flores 3D, grama mais ventada, ~4 000 arbustos fotográficos, praça com piso circular, toras/tocos com física, ruínas e torres, céu com nuvens reais,
cáusticas, montanhas distantes, concreto rachado/mosaico/decal de sujeira. 4K em até 7 materiais (8 GB+; 5 na qualidade média).
## Mapa ampliado (v142, mantido)
300×168 blocos, 4 rios, 8 acampamentos, 8 estradas, 6 plantações, 10 montanhas, 14 florestas, 8 prados, 7 ruínas e 4 torres com física.

## Packs no lobby
`mapa_1k` (20 MB, essencial) · `mapa_2k` (70 MB) · `mapa_4k` (397 MB). Sem pack baixado, o jogo usa o procedural de antes.

## Como publicar
Suba `mundo/assets/map/` e os arquivos abaixo no mesmo lugar de sempre. `packs.json` já vem gerado (`python3 tools/make_packs.py` se mudar textura).

## Arquivos
`mundo/assets/map/**` · `mundo/packs.json` · `mundo/js/w2/world.js` · `world_tex.js` · `world_veg.js` · `layout.js` · `core_blocks.js` · `tools/make_packs.py`

## Medido aqui (Chromium com renderização por software; não é celular)
Primeiro quadro do spawn: triângulos +6% e **chamadas de desenho 130 → 315** sobre a v141 (as árvores em 3 níveis e os arbustos por bloco).
**Teste no celular o desempenho com 16 jogadores.** Se pesar, o primeiro ajuste é reduzir `lodDist`/`lodDist2` em `world_veg.js` (cfg das árvores).

## Limites honestos
Arbustos e folhagem são cartões (planos com recorte), não malhas de folhas; árvores lá longe (> ~70 m) ainda são a versão antiga de poucos polígonos;
chão usa cor + normal (sem rugosidade/AO); poças e arbustos não têm colisão; árvores não se dobram quando alguém passa (só balançam com o vento).
