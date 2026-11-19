# ATLAS — reconstrução orgânica v5

- O corpo do Atlas não usa mais as peças rígidas herdadas do Nexus.
- A anatomia principal é gerada como uma única isosuperfície orgânica, com transições suaves entre tronco, pescoço, cabeça, ombros, braços, mãos, quadris e pernas.
- A nova malha recebe skinning próprio ligado às juntas do personagem para acompanhar a animação procedural existente.
- Rosto humano descoberto, pele não metálica, dreadlocks, olhos violetas, marca dourada, núcleo peitoral, veios de energia e casaco foram preservados.
- A geometria é procedural e estilizada; não é uma escultura manual de alto polígono nem simulação anatômica muscular real.

## Verificações
- Verificação sintática dos arquivos JavaScript com `node --check`.
- Integridade do arquivo ZIP com `unzip -t`.
- Não foi executado teste visual em navegador/WebGL ou Android nesta entrega.
