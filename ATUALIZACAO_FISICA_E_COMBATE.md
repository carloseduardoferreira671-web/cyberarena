# CyberArena — atualização de física, combate e realidade

## Sistemas incluídos

- **ATLAS — O Titã do Abismo**: personagem selecionável, paleta bronze/grafite/violeta e suprema **ABISMO ETERNO**.
- **ABISMO ETERNO**: sequência sincronizada de 30 s, deslocamento ao espaço, coreografia de golpes estilizados por cerca de 20 s, queda no abismo e retorno às posições originais. O alvo fica bloqueado contra ações durante a coreografia; a sequência é encerrada com segurança se um dos participantes for derrotado.
- **Física humanoide procedural**: molas secundárias no tronco, abdômen e ombros somadas à inércia, IK dos pés, reação a impactos, dedos articulados e simulação Verlet de cachecol/cabos afetados pelo vento.
- **Escalada**: o limite de altura dos obstáculos escaláveis foi ampliado; ladeiras íngremes continuam usando a animação de escalada já existente.
- **LÂMINA ÔMEGA**: substitui a sequência antiga de mísseis e canhão orbital por três investidas/cortes de energia e uma ruptura final.
- **SUPERNOVA**: carga prolongada, três esferas representando camadas de realidade, portais em sequência com o mundo atual sempre por último e projétil que leva a estrela até o ponto de impacto.
- **Colisão de velocidade**: arrancadas opostas próximas podem iniciar um duelo dimensional de 6,5 s, com golpes alternados e retorno igual para os dois.
- **Colisão de FLASH Ω**: dois feixes opostos de Cyber podem gerar uma disputa visual de 10 s, ruptura espacial, escurecimento temporário do céu e onda luminosa de grande escala.
- **Dano de realidade**: supernovas e colisões de poderes em batalha alteram temporariamente a iluminação e a névoa, com restauração automática.
- **Combate básico**: o terceiro golpe do combo agora pode terminar em chute animado.

## Limites técnicos importantes

- O rig continua sendo esquelético e procedural. A camada nova de molas imita atraso e elasticidade de tecidos, mas **não é um solver físico completo de músculos, pele ou carne**. Para isso seria necessário um novo modelo humanoide esculpido, malha densa com pesos de deformação adequados e um solver de soft-body/FEM, com custo de desempenho considerável.
- ATLAS já é selecionável e tem identidade visual/poder próprios, mas ainda usa a base humanoide procedural do NEXUS; não é uma escultura anatômica inédita.
- As esferas da SUPERNOVA e os portais representam visualmente as camadas de realidade. A câmera não faz uma visita literal carregando e renderizando três mundos completos independentes.
- As colisões são detectadas por proximidade, direção e janela de tempo; não são um solver de colisão física de feixes em tempo real.
- A sequência foi validada por sintaxe JavaScript e integridade do pacote. A renderização completa em aparelho Android/WebGL ainda precisa de teste prático.
