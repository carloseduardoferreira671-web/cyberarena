# UPDATE v11 · Realismo PBR, física de combate e Atlas de referência

Baseado nas 17 capturas (PBR, AO, GI, pós-processamento, SSS, detail maps, suor/sangue, hit stop, física de reação, tecido/cabelo, rosto, partículas, motion blur, camera shake) e na arte de referência do Atlas.

## Arquivos novos (mundo/js)
| arquivo | o que faz |
|---|---|
| `pbr.js` | camada PBR injetada em todo material Standard/Physical: micro-detalhe (bump + rugosidade que só aparece de perto), SSS aproximado, AO de cavidade/ambiente, suor/sujeira/sangue dinâmicos com escorrimento vertical |
| `post.js` | pós-processamento: HDR, SSAO, bloom (filtro duplo), motion blur de câmera por reprojeção, color grading, vinheta, grão, aberração cromática de impacto |
| `combatfx.js` | `CamShake` (tremor direcional em mola), `PhysParticles` (faíscas/gotas/lascas com gravidade, quique, escorrimento em encosta e acúmulo de manchas no chão), `LimbTrail` (rastro de punhos/pés) |
| `anatomy.js` | `FaceRig` (expressões dor/raiva/cansaço), `DreadHair` (42 dreads × 4 ossos numa SkinnedMesh, mola por segmento) |

## O que mudou, item por item das imagens
- **PBR em tudo**: o cel-shading/contorno saiu. `applyCinematicToon()` continua existindo (compatibilidade) mas agora aplica PBR. Nexus/Cyber: armadura metálica com verniz, tecido com *sheen*, metais reais.
- **AO**: SSAO em meia resolução (níveis Alto/Máximo) + AO de vincos e de céu/solo no material.
- **GI**: IBL fraco do céu + luz de rebatimento (cor do solo) vinda de baixo. *Lightmaps pré-calculados não foram feitos*: o terreno é procedural/dinâmico.
- **Pós-processamento**: bloom, grading (frio nas sombras/quente nas luzes), vinheta, grão, motion blur; fog já existia.
- **SSS**: luz embrulhada + transmitância + borda fina, arroxeado na pele do Atlas.
- **Detail maps**: bump/rugosidade procedurais em escala de poros, esmaecem com a distância.
- **Suor/sangue/sujeira**: máscaras no shader. Suor sobe correndo/lutando e seca devagar; sangue e sujeira sobem com golpes. Interruptor em Ajustes → "Sangue e ferimentos".
- **Hit stop**: 2–5 quadros (por dano) congelando só atacante e vítima.
- **Reação física**: `Hero.reactForce(dx,dz,força,altura)` – cabeça, pescoço, tronco, quadril, braços e joelhos são molas subamortecidas; golpes fortes "soltam" o corpo (limp). A altura do golpe (cabeça/tronco/chute) escolhe quais juntas recebem mais.
- **Freada com passos**: ao largar a corrida a passada continua ~1–2 passos, tronco vai para trás, poeira.
- **Tecido e cabelo**: o tecido/cabos agora recebem a aceleração do corpo; dreads do Atlas têm física própria.
- **Rosto (Atlas)**: sobrancelhas, olhos, mandíbula e boca dirigidos por dor/raiva/cansaço + piscar + respiração.
- **Partículas com física**: faíscas, gotas de sangue/suor e lascas colidem com o chão, quicam, grudam e escorrem em encostas e deixam manchas persistentes (220 decalques em anel).
- **Motion blur**: câmera (reprojeção de profundidade) + rastro borrado nos punhos e pés rápidos.
- **Camera shake**: direcional – o golpe empurra a câmera na direção do impacto (golpe vertical treme na vertical), com mola amortecida + ruído no mesmo eixo.

## Atlas (referência)
Pele quase preta com contorno violeta (*sheen*), SSS arroxeado e suor brilhante; olhos violeta em HDR (brilham no bloom); linha dourada; dreads longos e soltos com física; manoplas violeta com espinhos e luvas; colar de corrente dourada com pingente; correntes soltas no cinto que balançam; casaco rasgado com *sheen*; núcleo e veios de energia em HDR.

## Ajustes
Ajustes → **Efeitos cinematográficos**: Automático / Desligado / Médio / Alto / Máximo. A qualidade adaptativa reduz o pós sozinha se o FPS cair.
Diagnóstico: abra com `?pbr=0` para desligar só a camada de materiais.

## Limitações honestas
- Não foi possível rodar numa GPU/navegador neste ambiente: a lógica (física, partículas, dreads, rosto, hit stop) foi simulada em Node sem erros e os pontos de injeção do GLSL foram conferidos contra o three r187, mas **o visual final precisa ser conferido no aparelho**.
- Rosto articulado só no Atlas (Nexus/Cyber não têm geometria de rosto; o visor/olhos apenas pulsam).
- "Partículas de GPU" são simuladas na CPU (640 partículas) com consulta de altura do terreno; escorrer em *paredes* só funciona em encostas do terreno, não em prédios.
