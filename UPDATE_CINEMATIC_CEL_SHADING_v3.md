# CyberArena — atualização cinematográfica 3D / Cel Shading

## Implementado nesta versão

- **Cel Shading por iluminação em três faixas** nos materiais `MeshStandardMaterial` e `MeshPhysicalMaterial`, mantendo mapas de cor, emissivos, reflexos customizados e skinning.
- **Contorno de tinta escura** baseado no ângulo entre normal e câmera nos materiais dos personagens, com intensidade menor em detalhes para preservar leitura visual.
- **Cena principal estilizada** após a construção do mundo; o mesmo tratamento é aplicado ao Mundo Cristal quando ele é criado.
- **NEXUS e ATLAS:** volumes anatômicos 3D sobrepostos e ligados às juntas (peitoral, deltoide, bíceps/tríceps, quadríceps e panturrilha), acompanhando as animações.
- **CYBER original:** oito ossos auxiliares musculares (peitorais, bíceps, quadríceps e panturrilhas) com pesos de skinning calculados por proximidade na malha original. A deformação acompanha a pose, corrida e flexão do rig.
- **Retratos do lobby:** usam a mesma direção de material e iluminação toon.

## Limites técnicos importantes

O resultado é um pipeline 3D estilizado com deformação muscular procedural. Não é um simulador anatômico/FEM, nem substitui escultura de alta resolução, retopologia e mapas feitos em Blender/Maya/ZBrush. O shader afeta os materiais padrão/físicos; efeitos que já usam `ShaderMaterial` próprio preservam seus shaders. A aparência final depende do dispositivo, da iluminação e do nível de qualidade escolhido.

## Verificações

Arquivos JavaScript verificados com `node --check`. O teste em navegador e o comportamento visual em aparelhos Android devem ser conferidos no jogo publicado; não foram declarados como aprovados por esta atualização de código.
