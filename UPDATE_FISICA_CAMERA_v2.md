# CyberArena — atualização de física e câmera

## Correções
- A transição espacial agora guarda e restaura o estado exato das luzes, neblina, exposição, visibilidade dos objetos e visibilidade do grupo do Mundo Cristal.
- `realm.group` é ocultado explicitamente durante as sequências dimensionais; ele é criado depois da lista `worldObjs` e não era incluído nela.
- A câmera deixa de colidir com o terreno invisível durante uma sequência espacial, evitando ser empurrada para uma visão alta/estranha.
- A EXTINÇÃO SOLAR salva e restaura a dimensão de origem dos dois personagens, além de suas posições e orientações.
- O botão de câmera identifica o modo atual e alterna entre terceira pessoa próxima e visão alta. A tecla V também alterna; a escolha fica salva.
- Durante a EXTINÇÃO SOLAR, o botão de câmera continua funcional: o jogador pode escolher enquadramento próximo ou alto durante a sequência.
- Migração única para iniciar em terceira pessoa próxima em instalações que ainda não registraram a nova preferência de câmera.

## Física compartilhada
- A base `Hero.update()` é compartilhada por NEXUS, ATLAS e Cyber Classic; portanto, as melhorias alcançam os três.
- Impactos e aterrissagens alimentam molas secundárias de tronco, abdômen e ombros.
- Vento passa a influenciar também postura do tronco e da cabeça, além do tecido/cabos já simulados.
- Pequena deformação procedural por escala nos ossos já ponderados da malha, em vez de adicionar ossos sem pesos de skinning.
- O sistema é uma aproximação procedural de tecidos moles, não simulação médica/FEM de carne nem reconstrução anatômica completa.

## Testes realizados
- `node --check` em todos os arquivos JavaScript do projeto.
- Verificação de estrutura HTML.
- Integridade do arquivo ZIP.
- Não substitui teste visual real no WebGL/Android.
