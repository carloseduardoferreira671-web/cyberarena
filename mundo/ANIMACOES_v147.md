# v147 · Personagens novos + animações de luta (100% novas)

Os 3 personagens enviados (`.glb` com esqueleto Mixamo) substituíram Nexus, Atlas e Cyber:
- **Nexus** = armadura azul com cachecol · **Atlas** = dreadlocks e correntes · **Cyber** = encapuzado
- Nada dos corpos/animações antigos é usado. Os GLB que vieram **não tinham nenhuma animação** (nem a de escalar),
  então todas foram geradas do zero a partir do esqueleto e da malha de cada personagem.

## Como funciona
| arquivo | papel |
|---|---|
| `js/rigcore.js` | árvore de ossos, medidas do corpo (zonas cabeça/peito/barriga/canela), IK de braços e pernas, punho |
| `js/fightlib.js` | guarda, andar, correr, sprint, agachado, pulo/queda/pouso, **escalada ao vivo** |
| `js/fightatk.js` | 6 golpes × 3 oponentes = **18 variações por personagem** (54 no total) |
| `js/fightrx.js` | reações **só na região atingida**, quedas, nocaute, levantar, esquivas, poderes, emotes |
| `js/fightctl.js` | player em camadas + **IK de contato** no instante do impacto |
| `js/fightdata.js` | gerado: alturas, zonas e distâncias de impacto de cada par (rode `node tools/build_fightdata.mjs`) |

## Golpes (zona atingida → reação)
| golpe | tecla / botão | acerta | reação de quem apanha |
|---|---|---|---|
| soco esquerdo (jab) | J / SOCO (1º) | cabeça | cabeça vira de lado, tronco recua, guarda aguenta |
| soco direito | J / SOCO (2º) | peito | peito afunda, braços abrem, dobra e recompõe |
| chute direito alto | J / SOCO (3º) | cabeça | cabeça chicoteia, gira, cai de bruços, levanta sozinho |
| chute esquerdo frontal | H / CHUTE | barriga | dobra sobre as mãos na barriga, recua, mantém a guarda e só depois se recompõe |
| soco agachado | C (agachar) + SOCO | barriga | idem barriga |
| rasteira | C (agachar) + CHUTE | pernas | pernas varridas, cai de costas, levanta sozinho |
| esquiva | X / ESQUIVA | — | lateral, para trás ou abaixando; golpes altos erram |

Agachar (C / AGACHAR): anda a 42%, golpes altos passam por cima, não pula (pulo levanta). Atingido em pé "aguentando" um golpe (enquanto ele mesmo ataca) usa as variações `Resist_*`.

## As 3 variações
Cada golpe é gerado uma vez por oponente: o alvo é o ponto REAL da superfície do corpo dele (medido na guarda), então a altura e a
distância de impacto mudam por par (ex.: jab do Cyber no Nexus 1,93 · do Nexus no Atlas 2,29). O jogo escolhe a variação por `charId`
do alvo (`hero.fightTarget`) e aproxima o atacante até a distância certa; no impacto o IK puxa punho/pé ao ponto exato do corpo do outro.

## Escalada
Calculada a cada quadro (não gravada): a fase vem do progresso real da subida, o passo por ciclo se ajusta à altura da parede (~⅓ do corpo)
e cada mão/pé fica cravado na parede enquanto o corpo sobe. Serve para qualquer montanha/parede; o final puxa o corpo sobre a borda.

## Testes
`node tools/anim_tests/run_all.mjs` — alcance dos 54 golpes (< 8 mm), pés plantados na marcha, quedas no chão, dados em dia.
`tools/anim_tests/viewer.html` — visualizador para inspecionar poses (veja `tools/anim_tests/`).
