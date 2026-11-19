# CyberArena — resposta corporal a impactos v6

- O dano agora aciona estados elásticos por região (frente, costas, lado esquerdo/direito e cabeça).
- A resposta altera pose, escala local de juntas e transmite o impulso para tronco, coluna, ombros e cabeça.
- Marcas superficiais temporárias são escoriações estilizadas em Cel Shading, sem feridas abertas ou gore.
- A intensidade visual acompanha a intensidade do dano e desaparece gradualmente.
- A chamada ocorre em `applyDamage`, portanto também cobre danos recebidos pela rede.

Limitação técnica: é deformação procedural de juntas/ossos e volumes ligados ao rig, não um solver FEM de tecido mole nem uma reconstrução de malha por vértice. A aparência e a colisão visual ainda precisam de teste em runtime WebGL/Android.
