# v142 · Mapa ampliado + texturas PBR reais (pack baixável)

## O que mudou (v145 — fecha as pendências da v144)
- **Árvores 3D em todas as distâncias**: 4 faixas — perto (completa), médio (até ~68 m), longe (até ~170 m, tronco simples + poucos cartões) e só depois a versão antiga.
  As faixas são conservadoras (nunca deixam buraco entre blocos). Ajuste fino em `BANDS` (world_veg.js).
- **Árvores reagem a quem passa**: as folhas (cartões) se afastam dos jogadores, como nos arbustos.
- **Poças**: ondas que respondem a quem está perto + respingos (gotas com gravidade) quando alguém corre dentro; sem grama dentro delas.
- **Chão com rugosidade e AO** (grama/terra/rocha/calçada empacotados em 2 texturas) — antes era só cor + normal.
## Mantido das versões anteriores
v144: troncos com casca PBR e galhos, copas de cartões (agulhas/folhas individuais), vitórias-régias que derivam e fogem de quem entra na água, poças refletivas.
v143: flores 3D, grama com vento forte, ~4 000 arbustos fotográficos, praça com piso circular, toras/tocos com física, ruínas, torres, céu real, cáusticas,
montanhas distantes, concreto rachado/mosaico/sujeira. v142: mapa 300×168 blocos com 4 rios, 8 acampamentos, 14 florestas etc.

## Packs no lobby
`mapa_1k` (20 MB, essencial) · `mapa_2k` (70 MB) · `mapa_4k` (397 MB). 4K em até 7 materiais (8 GB+, qualidade alta) ou 5 (média).

## Como publicar
Suba `mundo/assets/map/` e os arquivos abaixo no mesmo lugar de sempre. `packs.json` já vem gerado.

## Arquivos
`mundo/assets/map/**` · `mundo/packs.json` · `mundo/js/w2/world.js` · `world_tex.js` · `world_veg.js` · `layout.js` · `core_blocks.js` · `tools/make_packs.py`

## Medido aqui (Chromium com renderização por software; não é celular), mesmas vistas da v141
Vista do spawn: triângulos +28% e chamadas de desenho 130 → 314. Vista de floresta: triângulos +53% e chamadas 119 → 321.
Se pesar no celular, os botões são: `BANDS` (alcance de cada nível das árvores) e as contagens de cartões em `realPine/realOak` (world_veg.js).

## Decisões / limites
- Arbustos e poças **não têm colisão nem esconderijo novo** (o esconderijo continua só nos 585 originais, para não mudar o equilíbrio do jogo).
- Arbustos e folhagem são cartões com recorte, não folhas modeladas uma a uma. Não testado em celular de verdade.
