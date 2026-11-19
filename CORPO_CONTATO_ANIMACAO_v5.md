# CyberArena · Corpo, mãos e contato v5

## Mãos e socos
- As mãos procedurais (NEXUS/ATLAS) e as mãos adicionais do CYBER agora têm três segmentos articulados por dedo.
- O controlador de dedos agora fecha as falanges na direção da palma; a pose de punho fechado é acionada explicitamente durante socos, cotoveladas e golpes fortes.
- A flexão usa molas mais firmes para chegar ao fechamento no tempo do golpe, com uma pequena abertura natural em repouso/corrida.
- Os dedos extras do CYBER usam acabamento grafite integrado à manopla, em vez do metal claro anterior.
- A esfera luminosa na palma do CYBER foi ocultada; o ponto de emissão continua sendo apenas um ponto de ancoragem invisível para efeitos.

## ATLAS · Abismo Eterno
- A habilidade voltou ao botão de super do ATLAS e o rótulo da interface voltou a ser ABISMO ETERNO.
- A sequência de combate agora inclui uma animação exclusiva de cotovelada, com antebraço recolhido, avanço do cotovelo e rotação do tronco.
- O dano e o efeito da cotovelada são resolvidos no momento do golpe e dependem da distância entre a junta real do cotovelo e o peito do alvo. Se não houver contato, não aplica dano.
- O combate aproximado mantém os personagens em distância de contato durante a sequência, e a transformação de posição atualiza os objetos 3D no mesmo frame.
- A habilidade Ressonância mantém o contra-impacto; se o escudo não for atingido, libera o pulso de pressão como alternativa.

## Limites conhecidos
Esta versão melhora a articulação e a sincronização de ações sobre o rig existente. Não é um solver físico completo de músculos/pele nem um sistema de captura de movimento. A validação feita aqui é estática (sintaxe e integridade do pacote); a aparência, o encaixe exato das mãos e a colisão em movimento ainda precisam ser conferidos no WebGL/Android.
