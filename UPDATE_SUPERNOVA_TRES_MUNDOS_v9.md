# CyberArena — SUPERNOVA: três mundos (v9)

## Sequência
- CYBER sobe fisicamente até uma posição orbital 460 unidades acima do ponto inicial; a posição do ator é atualizada no mundo, não apenas a câmera.
- A carga forma uma estrela colossal de energia.
- A câmera desce em um único movimento por três camadas verticais, sem retornar entre elas.
- As camadas representam os modos Batalha, Mundo Aberto e Treino. A ordem é ajustada para que o modo atual seja sempre o último e o destino.
- CYBER volta ao enquadramento orbital e lança um núcleo de escala colossal.
- O projétil atravessa as três camadas em um único trajeto até o cenário ativo.
- O impacto gera uma expansão de supernova de grande escala, efeitos de ruptura e destruição de vegetação/objetos destrutíveis e dano de área dentro do jogo.

## Limite visual importante
As três camadas são dioramas 3D cinematográficos que identificam visualmente os três modos. Não são três cópias completas e jogáveis dos mapas carregadas simultaneamente. O impacto final, porém, é resolvido no mundo real da partida ativa.

## Verificação
- Sintaxe de todos os arquivos JavaScript verificada com `node --check`.
- Seis páginas HTML analisadas.
- ZIP testado com `ZipFile.testzip()`.
- Não foi possível executar o jogo em WebGL/Android nesta etapa; a renderização, o desempenho e o enquadramento precisam de teste no dispositivo.
