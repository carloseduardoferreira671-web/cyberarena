# CyberArena v141 — tudo em um só

Base: linha v140 (lobby novo, economia balanceada, entrada única) + personagens novos da linha v15_2.

## O que mudou
1. **Personagens novos** no lugar dos antigos: Cyber (7,0 MB), Atlas (8,9 MB) e Nexus (13 MB), com `riggedglb.js` e `packs.json` da v15_2 (tamanhos e SHA-256 conferidos).
   O cache dos downloads foi renovado (`cyberarena-packs-v2`): quem já tinha baixado os modelos antigos baixa os novos.
2. **Skins removidas**: some a seleção "VISUAIS" da tela de personagens, não há mais desbloqueio por nível, os bots não sorteiam cores e quem tinha outra skin salva volta ao visual padrão.
3. **Downloads no lobby, sem forçar**: não abre mais janela obrigatória. Existe a **barra DOWNLOADS** (embaixo da barra de cima do lobby).
   - Toque nela: abre a janela de recursos (dá para fechar). Baixa **um personagem** ou **tudo**; o download continua se você fechar a janela.
   - Enquanto baixa, a barra mostra a porcentagem; quando acaba, mostra "✓ OK". Tem lixeira para apagar um personagem do aparelho.
   - Se o personagem escolhido não foi baixado, o lobby mostra "PERSONAGEM NÃO BAIXADO" no lugar do 3D (toque ali também abre os downloads).
   - **JOGAR** só pede os recursos de quem você vai usar: Cyber + o personagem escolhido. Se faltar, abre a barra de downloads em vez de entrar na partida.
4. Tudo do v137–v140 continua: Loja, Passe, Progressão, Caixa de Entrada, Amigos, Ranking, Configurações, perfil com personagem 3D, missões rolando.
5. Texto "ESCOLHER · VISUAIS" do botão de personagens virou "ESCOLHER".

## Testado (Chromium sem tela, 844×390)
- Barra de downloads: estados "precisa baixar", baixando com %, concluído; baixar só o Cyber e continuar faltando o Nexus; JOGAR bloqueado e abrindo a janela; aviso no lugar do personagem.
- Download dos 3 personagens novos com conferência de tamanho e SHA-256.
- Personagens novos no lobby (tela de personagens), no perfil e dentro de partida (Nexus, Cyber e Atlas), sem erro de JavaScript.
- Loja, caixa, câmbio, Passe, Progressão e Caixa de Entrada (mesmo teste da v137).

## Não testado
- Celular real (toque, desempenho, som), rede móvel, queda de internet no meio do download.
- Servidor online/ranking de verdade.
- Dentro do jogo todos usam o visual padrão; não houve teste de partida online com amigos.

## Correção v141b — personagens contorcidos / sem física
- Causa: o cálculo automático de "partes soltas" marcava punhos, joelhos, ombros e placas como tecido e os balançava (deformação). A versão anterior desligava tudo, então ficava sem física.
- Agora cada GLB traz a física desenhada à mão (atributos `_SOFT`/`_LOOSE`/`_HAIR`): Atlas = dreads e corrente; Nexus = cachecol; Cyber = barra do capuz. O resto é rígido.
- Revertidos: Idle congelado, correção de cabeça/tronco desligada, filtro de pescoço/cabeça do Cyber. Mantida a iluminação de estúdio.
- Cache dos downloads: `cyberarena-packs-v6`.
