# v146 · Só os personagens novos (limpeza)

Ficam no jogo apenas **Atlas, Nexus e Cyber** da v145 (`mundo/models/*_rig.glb`: esqueleto de 52 ossos (o Atlas tem 62, com dreads e correntes), 115 animações, física própria), baixados pelo lobby.

## Apagado
- `cyber_viewer/` inteiro (malha e textura do Cyber antigo, que o APK levava sempre dentro).
- `tools/cyber_pipeline/` e `mundo/tools/` (ferramentas e cópia velha do pipeline; o pipeline novo está em `tools/rig_pipeline/`).
- `mundo/js/atlasglb.js` (Atlas estático antigo, `models/atlas.glb`) e `mundo/js/anatomy.js` (dreads e rosto procedurais antigos).
- `assests/ui/portrait_cyber|atlas|nexus.jpg` (retratos antigos, sem uso).
- Documentos dos personagens antigos: `readme_v135_cyber.md`, `ATLAS_REDESIGN_v4/v5.md`, `CORPO_CONTATO_ANIMACAO_v5.md`, `CORRECAO_PERSONAGENS_v144.md`.

## Mudou
- `mundo/js/classic.js`: reescrito. `makeCharacter()` só monta os GLB novos. Se o pedido ainda não carregou, usa outro dos 3 novos (nunca um modelo antigo); se nenhum carregou, dá erro "personagem não carregado" e o lobby mostra "PERSONAGEM NÃO BAIXADO".
- `mundo/js/hero.js`: tirou o import do Atlas antigo e os ramos que só o corpo antigo usava; descrições dos 3 personagens atualizadas.
- `mundo/js/packs.js`: o app confere o tamanho do modelo guardado (cabeçalho `x-bytes`) e baixa de novo se for diferente; apaga os caches `cyberarena-packs-*` de versões antigas.
- `mundo/packs.json`: Cyber 8.888.028 · Atlas 8.629.108 · Nexus 8.626.820 bytes, com SHA-256 conferido. Entradas dos mapas conferidas arquivo a arquivo (1K, 2K e 4K).
- `tools/android/build_apk.sh`: não copia mais `cyber_viewer`.

## Continua (e por quê)
- `mundo/js/hero.js` (classe `Hero`): é o motor que guarda estado, ações, física de contato e poderes; os modelos novos são presos a ele (`buildRigged`). O corpo desenhado por ele fica oculto e nunca aparece.
- `assests/ui/player.png`, `bot.png`, `assests/sprites/`: sprites 2D usados pelo `main.js`, não são os personagens 3D.

## Depois de subir no GitHub
Limpar o cache do jsDelivr de `mundo/packs.json` e dos 3 `.glb` (`https://purge.jsdelivr.net/gh/carloseduardoferreira671-web/cyberarena@main/mundo/...`).

## Correção: cabeça do Atlas torta quando o personagem gira
`mundo/js/riggedglb.js`: a correção de inclinação da cabeça e do pescoço convertia a pose de descanso usando o giro atual do personagem, então o ângulo da cabeça dependia para onde ele estava virado (o Atlas de costas ficava com a cabeça torcida e o cabelo atravessando o corpo). Agora a pose de descanso é guardada uma vez, já no espaço do objeto. Medido em 5 giros diferentes: a cabeça fica no mesmo ângulo em qualquer direção, nos 3 personagens.
