# Atualização de áudio do CyberArena X

## Alterações
- Adicionada pasta `mundo/assets/audio/` com 14 MP3 enviados pelo usuário.
- `mundo/js/audio.js` agora carrega as amostras após o primeiro toque/clique que desbloqueia o WebAudio.
- Socos, impactos, golpes no ar e aterrissagens usam os novos MP3 quando carregados.
- Passos variam por superfície e personagem:
  - Vale/terra: passos leves.
  - Pedra/concreto: passos duros.
  - Mundo Cristal: passos pesados e ressonantes.
  - Nexus: passos mecânicos próprios.
  - Corrida: amostra de corrida ou passos pesados acelerados.
- O sistema sintetizado anterior permanece como fallback se a rede/arquivo de áudio falhar.
- A seleção de passos respeita o sistema de água já existente.

## Observações
- Os arquivos são carregados do próprio site (`mundo/assets/audio`), não de serviços externos.
- O carregamento começa após a primeira interação do jogador e pode levar alguns instantes.
- Os sons precisam ser testados no aparelho para ajustar volume e sincronização fina.
- Não foram usados os dois arquivos com efeitos explicitamente gráficos; os impactos usam efeitos cinematográficos não explícitos.
