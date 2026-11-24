# Otimização de desempenho (anti-travamento)
Técnicas dos jogos grandes aplicadas ao Cyber Arena (`mundo/js/`):
- **LOD de personagens** (`classic.js`): o Cyber tinha ~60 mil triângulos por boneco. Agora há versões de ~23 mil e ~3,4 mil (agrupamento de vértices preservando o esqueleto). Perto = média, longe = leve; a malha completa só é usada nas qualidades ULTRA/ULTRA 4K a menos de 12 m.
- **Longe = barato**: acima de 55 m o boneco não projeta sombra e anima a 1/3 da taxa (`game.js`).
- **LOD de árvores, pedras e arbustos** (`world.js`): cada bloco de ~45 m troca para malha leve (10–25% dos triângulos) à distância.
- **Culling por bloco e distância**: campos e flores (22 mil instâncias, antes desenhadas sempre) viram blocos de 36 m com raio de visibilidade; vegetação em blocos pequenos também sai do passe de sombra quando está fora da câmera de sombra.
- **Sombras a 60 Hz** quando o limite é 120 FPS; o ajuste automático reduz a taxa das sombras antes de desligá-las (desligar recompila shaders e engasga).
- **Resolução dinâmica proporcional**: cai o necessário em ~1 s (antes: 0,15 por vez).
- **Pré-compilação de shaders** ao carregar (evita engasgo na primeira vez que um efeito aparece).
- **HUD**: a sala de espera só mexe no DOM quando o texto muda.
Diagnóstico: abra `mundo/index.html?mode=train&debug=1` e use `window.__ca` (renderer, scene) no console; `renderer.info.render` mostra chamadas e triângulos.
Medido (renderização por software, só vale como comparação): modo treino 1,95 M → 0,9 M triângulos por quadro; cena de batalha 4,7 M → ~1,3 M.

# Poderes (novidades)
- **Velocidade Absoluta** virou viagem pelo espaço-tempo: o mundo some, entra um túnel cósmico (nebulosa, planetas, riscos de estrelas, portais-relógio), o herói atravessa até **3 oponentes** (pausa curta e câmera lenta em cada golpe) e volta ao mundo real com um flash. Quem assiste de fora vê o rastro e a luz.
- **Destruição**: golpe especial, Flash, Singularidade, Ômega (mísseis e canhão orbital), Supernova e a corrida derrubam árvores, arbustos e pedras no caminho/área.
- **Luz de cinema** (`powers.cinemaLight`): flare anamórfico, raios e halo no Flash, na corrida, nos impactos e nas explosões.

# Fluidez v2 (renderização)
- **Ritmo de quadros** (`game.js › frame`): o limite de FPS guarda o resto da divisão (antes o relógio era zerado e batia com a taxa da tela, gerando quadros duplicados/pulados); o `dt` é suavizado contra o jitter de ±1–2 ms do navegador sem esconder travadas reais; a taxa real da tela (60/90/120/144 Hz) é detectada e usada como meta.
- **Qualidade adaptativa em escada** (`LADDER`, `aqFrame`): resolução (até ~0,8×) → sombras a meia taxa → grama 60% → resolução até o piso → grama 30%/0% → sombras a 1/3 → sombras desligadas. Reage em ~1 s (0,5 s se for grave), sobe um degrau por vez e **tudo é reversível** (antes grama e sombras, uma vez cortadas, nunca voltavam). Um degrau de subida que falha fica bloqueado por 10 s → 20 s → … → 120 s, o que acaba com o vai-e-volta de resolução (cada troca realoca o framebuffer e engasga). O primeiro 1,2 s após cada troca e picos > 250 ms (carregamento, troca de aba) não contam.
- **Grama sem travadinha** (`world.js › updateGrass`): a reconstrução de ~12 mil instâncias (feita num quadro só a cada 5 m andados) agora é fatiada em ~1,2 ms por quadro num buffer de espera e trocada de uma vez; a borda some a zero, sem "pipocar".
- **Sombra estável**: a câmera da luz é ancorada ao texel do mapa no espaço da luz (antes, grade de 2 m que não casa com o texel → a sombra "nadava" ao andar).
- **Culling de personagens**: quem está fora do campo de visão (com folga para a sombra) não é desenhado, não faz skinning e não entra no passe de sombra.
- **Menos lixo por quadro**: lista de empurrões da vegetação reordenada a cada 8 quadros; fila `pending` dos atores filtrada no lugar.
- Diagnóstico: com `?debug=1`, `window.__ca.aq / LADDER / getIdx()`; com "Mostrar FPS" ligado aparece `FPS · QUALIDADE · resolução× · Nível · triângulos`.
- **Material leve do Cyber à distância** (`classic.js`): a partir de ~28 m o Cyber troca o material físico (verniz + sheen + especular extra) por um `MeshStandardMaterial` com os mesmos mapas, cor, emissão, brilho de borda e flash de dano (inclui skins cósmicas). Histerese de 3 m (volta ao completo em < 25 m). Os dois materiais são pré-compilados no carregamento, então a troca não engasga.

# v155 · orçamento por aparelho (`mundo/js/perf.js`)
- **Causa do travamento no celular**: texturas 2K/4K e SSAO escolhidos só por `navigator.deviceMemory` (teto 8). Celular "8 GB" carregava até ~1,4 GB de texturas na GPU.
- `detectDevice()` mede GPU (Adreno/Mali), RAM e núcleos → perfil `low | mid | high | desktop`; o pior sinal manda.
- Celular: textura do mapa no máximo 1K, resolução limitada por megapixels, sombra ≤ 1024/2048, sem AA/SSAO no automático. PC: igual a antes.
- Texturas sobem para a GPU na tela de carregamento (`warmTextures`), sem travada no primeiro quadro.
- Teste: `?perf=low|mid|high|desktop` na URL.
