# v145 · Personagens novos (Atlas, Nexus, Cyber) — rig refeito do zero

Os 3 GLB novos (malhas estáticas do Tripo, sem esqueleto) foram decodificados e riggados do zero. Nada dos rigs antigos foi reaproveitado
(esqueleto, pesos, física e animações são todos novos).

- **Quem é quem:** Atlas = dreads + correntes · Nexus = armadura azul + cachecol vermelho · Cyber = encapuzado.
- **Esqueleto:** 52 ossos Mixamo (quadril, coluna, pescoço, cabeça, clavículas, braços, 15 ossos de dedos por mão, pernas, pés e dedos do pé).
  O Atlas ganhou 2 correntes de ossos nos dreads (Tail_*, Tail2_*) com mola própria (amplitude reduzida).
- **Pesos de pele:** distância geodésica dentro do volume do corpo (não vaza braço→tronco); mãos/dedos com pesos separados.
- **Animações:** 115 clipes por personagem (Idle, andar/correr/sprint, pulo, agachar/rastejar, escalada, golpes, hits, etc.) com os nomes que o jogo já usa.
  Gerados por código (tools/rig_pipeline/catalog.py), pés sempre apoiados no chão, dedos fecham nos socos (o Nexus tem punhos modelados fechados, então os dedos dele mexem pouco).
- **Física:** _SOFT/_LOOSE/_HAIR desenhados no arquivo. **Cyber: capuz e pescoço com física ZERO** (resto do corpo com física normal).
  Atlas: dreads, correntes e carne · Nexus: cachecol, placas e carne.
- **Cache dos pacotes:** cyberarena-packs-v7 (força baixar os modelos novos). packs.json regenerado.
- Para refazer: tools/rig_pipeline/ (extract.py decodifica o GLB; runskin.py + make_char.py geram o rig).
