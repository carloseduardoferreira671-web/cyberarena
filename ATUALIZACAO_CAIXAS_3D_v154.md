# Caixas 3D + nova animação de abertura (v154)

## O que mudou
- **Mini / Cyber / Mecha agora são modelos 3D** (`mundo/models/chest_boxes.glb`, 3 MB). Tamanhos reais do modelo: Mini < Cyber < Mecha.
- **Animação 100% nova**, feita em código (nada da animação de teste foi reaproveitado). Sequência:
  1. **Entrada**: a caixa cai girando, amassa no chão (squash & stretch), solta poeira de energia e onda de choque.
  2. **Toque → carga**: agacha, treme cada vez mais, circuitos acendem, energia é sugada para dentro, a câmera avança (dolly).
  3. **Pulsos de raridade**: a cor sobe degrau a degrau — Comum 1 pulso (ciano) · Raro 2 (→azul) · Épico 3 (→roxo) · Lendário 4 (→dourado). Quanto mais rara, mais suspense.
  4. **Explosão**: hit-stop, flash, tampa solta, feixe de luz, raios giratórios, ondas de choque, estilhaços do casco, câmera com FOV‑punch + tremor, vibração e som.
  5. **Fonte de recompensas**: moedas, fichas e gemas jorram do poço; depois flash e passa para a tela de recompensas de sempre.
- Tocar durante a revelação acelera. A economia (sorteio, salvamento, limites) **não foi tocada**: `openBox`/`econ.js` seguem iguais.
- Ícones `mini_box.png`, `cyber_box.png`, `mecha_box.png` (loja, passe, caixa de entrada) foram **re-renderizados do modelo 3D**. Os antigos estão em `assests/ui/_caixas_2d_antigas/`.
- Tela "Você recebeu uma caixa!" também mostra a caixa 3D.
- Segurança: sem WebGL ou se o modelo falhar, o jogo volta sozinho ao visual 2D antigo. Para desligar: `localStorage.cyberArenaChest3D='0'`.

## Estilos de tampa (suas opções de animação)
Padrão: Mini = `hinge`, Cyber = `levitate`, Mecha = `launch`. Para trocar, edite `CFG.styles` em `mundo/js/chest3d.js` (ou `window.CHEST3D = { styles:{ mini:'launch' } }`).
| Estilo | Como abre | Inspiração |
|---|---|---|
| `hinge` | tampa gira na dobradiça de trás, com overshoot de mola | baús de Clash Royale / Brawl Stars |
| `levitate` | tampa levita, gira e some para cima/trás | Hextech de Wild Rift / LoL |
| `launch` | propulsor dispara a tampa para cima, rastro de fogo | loot boxes de Overwatch / Valorant |
Ajustes rápidos em `chest3d.js`: `CFG.reveal` (duração da revelação), `RARITY` (cores), número de pulsos (`P.n`), `FIT` (enquadramento).

## Testar sem abrir o jogo
Sirva a pasta (`python3 -m http.server`) e abra `tools/chest_pipeline/preview.html`: escolha caixa, raridade e estilo.

## Arquivos
Novos: `mundo/js/chest3d.js`, `mundo/js/chest3d_core.js`, `mundo/models/chest_boxes.glb`, `ui2/chest3d_bridge.js`, `ui2/chest3d.css`, `tools/chest_pipeline/*`.
Alterados: `index.html` (1 link CSS + 1 script), `sw.js` (cache offline), `tools/make_sw.py` (passa a incluir o GLB das caixas), 3 PNGs.
Regerar o GLB: `python3 tools/chest_pipeline/build_chest_glb.py ORIGINAL.glb mundo/models/chest_boxes.glb`.

## Observação
O modelo original é um bloco fechado por caixa (sem tampa). A tampa foi criada cortando cada caixa a ~70% da altura, com interior e núcleo de energia gerados. Se quiser uma tampa modelada à mão, basta exportar corpo e tampa separados e ajustar o pipeline.
