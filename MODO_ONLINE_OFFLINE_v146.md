# v146 · Online / Offline
- Carregamento baixa tudo e confere a conexão. Sem conexão: MODO ONLINE (repete) ou MODO OFFLINE.
- Offline: só bots (Batalha) e Treino, via ?offline=1&noprog=1. Nada é salvo: sem troféus, XP, moedas, fichas, caixas, missões, passe, estatísticas.
- Conexão perdida (jogando): "Tentar de novo" volta ao carregamento. Internet volta no offline: aviso + reinício para o online.
- Saiu do app numa partida online: bot joga por você; ao voltar precisa reconectar. Mundo Aberto/Treino: sai.
- v147: sw.js (service worker) guarda o jogo no aparelho para abrir sem internet. Abra o jogo UMA vez com internet e espere carregar; depois funciona offline.
  A cada atualização do jogo rode: python3 tools/make_sw.py  (gera sw.js novo). Suba sw.js junto na raiz do site.
