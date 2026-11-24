# v146 · Online / Offline
- Carregamento baixa tudo e confere a conexão. Sem conexão: MODO ONLINE (repete) ou MODO OFFLINE.
- Offline: só bots (Batalha) e Treino, via ?offline=1&noprog=1. Nada é salvo: sem troféus, XP, moedas, fichas, caixas, missões, passe, estatísticas.
- Conexão perdida (jogando): "Tentar de novo" volta ao carregamento. Internet volta no offline: aviso + reinício para o online.
- Saiu do app numa partida online: bot joga por você; ao voltar precisa reconectar. Mundo Aberto/Treino: sai.
- v147: sw.js (service worker) guarda o jogo no aparelho para abrir sem internet. Abra o jogo UMA vez com internet e espere carregar; depois funciona offline.
  A cada atualização do jogo rode: python3 tools/make_sw.py  (gera sw.js novo). Suba sw.js junto na raiz do site.

## v153 · Modo offline = jogo normal, sem progresso
- Tela de abertura: no canto fica só **V1.0** (a frase de status do modo offline foi removida).
- **MODO OFFLINE** agora abre o jogo normal (lobby, personagens, loja, passe, progressão…). As partidas são só contra bots (`?offline=1&noprog=1`); Mundo Aberto avisa que precisa de internet.
- Enquanto offline **nada é salvo**: gravações de progresso no `localStorage` ficam só na memória da sessão (ajustes de volume/vibração/controles continuam sendo salvos), nenhuma chamada à API é feita (só `/api/health`), e abrir caixas, comprar, coletar recompensas/missões/passe, evoluir personagem, trocar nome, códigos e conta mostram "Indisponível no modo offline". Código: `ui2/offguard.js`, `ui2/offline.js`.
- Um selo "MODO OFFLINE · progresso não é salvo" aparece embaixo no centro do lobby; tocar nele testa a conexão.
- Quando a internet volta no modo offline aparece o aviso **CONEXÃO RESTABELECIDA** (mesma tela do "SEM CONEXÃO") com **MODO ONLINE** (recarrega o jogo e reconecta; o progresso de antes do offline continua intacto) e **MODO OFFLINE** (continua; só avisa de novo se a conexão cair e voltar). Durante uma partida o aviso espera a volta ao lobby (`ui2/net.js`).
- Depois desta atualização rode `python3 tools/make_sw.py` (já rodado neste pacote: `sw.js` v0e92e5d78e).
