# Correção de pose neutra dos personagens

- Os modelos GLB possuem animações Idle em loop. Em certos momentos do ciclo, os braços e as pernas se afastam da pose de repouso e podem parecer erguidos ou contorcidos.
- `riggedglb.js` agora congela o clip `Idle` no primeiro frame ao entrar em repouso. Animações de caminhada, corrida, salto, golpes e poderes continuam ativas.
- A rotação manual do retrato no lobby continua sendo controlada pelo arraste do dedo; não foi adicionada rotação automática.

Observação: a pose exata depende de o primeiro frame de `Idle` estar corretamente alinhado no GLB. O projeto precisa ser aberto/executado para validação visual final.
