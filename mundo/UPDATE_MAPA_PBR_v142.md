# v142 · Mapa ampliado + texturas PBR reais (pack baixável)

## O que mudou (v143 sobre a v142)
**Correções do seu teste**
1. **Grama que não mexia / flores "de imagem"**: as flores pintadas foram removidas da textura do chão; agora há **flores 3D** (haste + pétalas, 6 cores)
   que balançam e dobram quando alguém passa. O vento da grama 3D ficou ~2,5× mais forte (medi: 39% dos pixels da grama mudam em 1,3 s).
2. **Arbustos**: o lado escuro e a "sombra estranha" eram a normal invertida no verso do plano. Agora cada plano tem frente e verso com normal de copa,
   a sombra vem de um proxy invisível, e eles balançam/dobram. **De 585 para ~8 000 arbustos fotográficos** (sub-bosque, margens de rio, prados e clareiras).
3. **Chão do spawn (praça)**: agora piso circular de pedra (ground_0045), no lugar do mosaico colorido.
4. **Árvores**: casca real (wood_0064) nos troncos e folha real (plants_0007) nas copas, em triplanar (não depende de UV). **Toras caídas e tocos** com casca +
   corte de tronco (wood_0065), com física (dá para pular nas toras; tocos são sólidos).
**Tudo que faltava usar**
5. concreto rachado → piso das ruínas · mosaico de seixos → base das torres · vitórias-régias → ~1 000 folhas flutuando nas águas rasas ·
   decal de sujeira → manchas no chão · folha → copas · fotos de montanha → cordilheira distante (8 painéis, acompanha a câmera).
6. Ruínas e torres agora limpam a grama e as árvores em volta.
**4K**: aparelhos com 8 GB+ carregam 4K nos 7 primeiros materiais (qualidade alta) ou 5 (média, padrão do APK); o resto fica em 2K. Console mostra `[mapa] materiais PBR: ...`.

## Mapa ampliado (v142, mantido)
300×168 blocos (~2,2× a área), 4 rios, 8 acampamentos, 8 estradas, 6 plantações, 10 montanhas, 14 florestas, 8 prados, 7 ruínas e 4 torres com física.

## Packs no lobby
`mapa_1k` (19 MB, essencial) · `mapa_2k` (69 MB) · `mapa_4k` (397 MB, 4K sem perda). Sem pack baixado, o jogo usa o procedural de antes.

## Como publicar
Suba `mundo/assets/map/` e os arquivos abaixo no mesmo lugar de sempre. `packs.json` já vem gerado (`python3 tools/make_packs.py` se mudar textura).

## Arquivos
`mundo/assets/map/**` · `mundo/packs.json` · `mundo/js/w2/world.js` · `world_tex.js` · `world_veg.js` · `layout.js` · `core_blocks.js` · `tools/make_packs.py`

## Medido aqui (Chromium com renderização por software; não é um celular)
Triângulos por quadro ≈ +15–25% sobre a v141; construção do mundo ≈ 2,3× mais longa (mapa 2,2× maior). **Teste no celular o desempenho com 16 jogadores.**
