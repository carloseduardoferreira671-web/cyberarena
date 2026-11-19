# CyberArena v10 — punho fechado, colisão com deformação e cel-shading detalhado

## Punho
- Fechamento maior das três falanges, mola mais rápida e a mão inteira comprime em bloco (juntas `hdL/hdR`) durante socos, cotoveladas e supers.

## Colisão entre personagens
- Correção de penetração suave (sem "estalo" por quadro, que causava o tremor), contato inelástico que preserva a tangente (um desliza em volta do outro).
- O impacto dispara só no início do contato; durante o encosto a pressão na carne é contínua e proporcional à penetração/velocidade.
- Amplitudes de deformação (peito, costas, lados, cabeça) e impulsos de impacto aumentados; as molas seguem criticamente amortecidas.

## Cel-shading
- 5 faixas de luz com borda suave, sombra colorida (tom de pele/violeta), tinta mais grossa nos personagens, linhas de vinco por variação de normal e luz de contorno violeta.

## Limites
- Validação feita: sintaxe (`node --check`). Não foi executado em WebGL/Android. Valores (`1.5`, `.34`, `0.55`…) podem precisar de ajuste fino no aparelho.
- Não é solver FEM/ragdoll; o corpo segue rig procedural com deformação por juntas e vértices.
