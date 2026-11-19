# CyberArena v135 — Personagem Cyber (rig + animações)

Base: **v134**. Nenhum arquivo da v134 foi alterado (conferido por checksum). Foram adicionadas apenas:
- `cyber_viewer/` — Cyber 3D articulado + página de teste (`cyber_viewer/index.html`, precisa de servidor HTTP)
- `tools/cyber_pipeline/` — scripts que geraram os pesos de skinning (referência; têm caminhos absolutos a ajustar)

## O que existe
- Esqueleto de 21 ossos sobre o modelo original (30 mil vértices), pesos calculados pela distância ao longo da superfície.
- Skinning no shader (WebGL), textura 2048² em WebP (276 KB, antes 4 MB PNG), malha 2,6 MB.
- Animações: parado, correr, soco D/E/D forte, laser (D depois E), Super 1 alvo (avança, soco que lança, 4 lasers alternados),
  Super vários (avança, salta, golpe no chão com área de 3 blocos, 6 lasers alternados), golpe recebido, morte.
- Eventos nos quadros certos: `hit`, `uppercut`, `slam`, `laser_R`, `laser_L`, `dash`, `jump`, `step`, `land`.
  O dano e os efeitos do jogo devem ser disparados por esses eventos (não por temporizadores soltos).
- `Rig.muzzle('R'|'L')` devolve posição e direção da boca do laser.

## Estado (não confundir)
- Testado em execução (Chromium headless, WebGL por software): carregamento sem erros, todas as animações inspecionadas
  quadro a quadro, mira dos lasers medida (desvio <= 5 graus), arquivo único abre via file:// sem rede.
- NÃO testado: dispositivo real; desempenho em celular.
- Ainda NÃO feito: integrar na arena, câmera livre (planejada v136), mapa/terreno, bots 3D, LOD
  (cada Cyber tem 60 mil triângulos; 17 personagens exigem versões reduzidas, ainda não medido).


## Aparência dos personagens (correção 2026-11-17)
Os três GLBs enviados como referência foram conferidos: as texturas Color/ORM/Normal estão byte a byte iguais às incorporadas aos modelos rigged correspondentes (Cyber=photo-model-0fb030, Atlas=photo-model-3671c8, Nexus=photo-model-7e19a4). Portanto, o desvio visual era do renderizador: somente Cyber recebia um ambiente de reflexão; Atlas e Nexus eram renderizados sem esse ambiente e ficavam muito escuros. Agora os três compartilham um ambiente de estúdio e ajustes PBR mais próximos das referências. O cache de pacotes foi atualizado para v4.
