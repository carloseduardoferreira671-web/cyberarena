# Servidor online próprio (sem Netlify)

Um único arquivo (`server.mjs`), **sem instalar nada e sem banco de dados**. Serve o site e a API de partidas.
Precisa só do Node 18+ (https://nodejs.org).

## Rodar no seu computador
```
node online-server/server.mjs
```
Abra http://localhost:3000 (mesma rede Wi-Fi: http://IP-DO-PC:3000 no celular).

## Deixar acessível pela internet (APK + site de qualquer lugar)
**A) Do seu PC, grátis, sem cadastro:** instale o `cloudflared` e rode, com o servidor ligado:
```
cloudflared tunnel --url http://localhost:3000
```
Ele mostra um endereço `https://algo.trycloudflare.com`. Quem abrir esse endereço entra no seu jogo.
O endereço muda toda vez que você reinicia o túnel, e o PC precisa ficar ligado.

**B) Em uma hospedagem que rode Node** (Render, Koyeb, Fly.io, Railway, uma VPS...):
comando de início `node online-server/server.mjs`, porta lida da variável `PORT`. Confira o plano gratuito atual de cada uma.
Em planos grátis o serviço pode "dormir" e o disco costuma ser apagado ao reiniciar: as salas só existem na memória de qualquer forma,
mas os perfis (troféus/XP) ficam em `online-server/data/players.json` e se perdem sem disco persistente (use `DATA_DIR` apontando para um volume).

## Fazer o APK usar o seu servidor
- **APK novo (gerado depois desta versão):** abra *Sala com amigos* e preencha o campo **Servidor** com o seu endereço, depois SALVAR.
  Ou, antes de gerar o APK, troque o endereço do Netlify na primeira linha de `mundo/js/net.js` pelo seu.
- **No navegador:** abra uma vez `https://seu-endereco/?api=https://seu-endereco/api/` para gravar. Se o site já vem do seu servidor, nem precisa.
- Para voltar ao padrão: `?api=reset`.

## Limites honestos
- Salas ficam na memória: se o servidor reiniciar, as partidas em andamento caem.
- Feito para poucas dezenas de jogadores simultâneos num servidor pequeno. A sincronização é por requisições HTTP (como já era), não WebSocket.
- Não tem a parte de contas/loja/economia segura do `server/`; é só partidas, mundo aberto, chat, ranking e troféus.

## Só tem celular? (Android + Termux)
1. Instale o **Termux pelo F-Droid** (a versão da Play Store está desatualizada).
2. Baixe e extraia o ZIP do jogo na pasta Downloads. No Termux:
   ```
   termux-setup-storage
   pkg install -y unzip
   cd ~ && unzip ~/storage/downloads/cyberarena_atualizado.zip -d cyberarena
   bash cyberarena/iniciar-no-celular.sh
   ```
3. Aparece um endereço `https://...trycloudflare.com`. Abra no Chrome e mande aos amigos.
Mantenha o Termux aberto e o celular carregando; o servidor para se o Android fechar o app.

## Novidades desta versão
- **O jogo é o site**: abrir o endereço do servidor já abre o jogo (`/`). A página de apresentação (online ao vivo, top 10, download do APK) fica em `/sobre`. Coloque `CyberArena.apk` na raiz para o botão de download funcionar.
- **Cross-play site ↔ APK**: o APK e o site usam a mesma API e as mesmas salas. Para o APK usar o seu servidor, gere-o com `SERVER_URL=https://seu-servidor` (no GitHub: Settings > Variables > Actions > `SERVER_URL`). `/api/stats` mostra quantos jogadores vêm do site e do APK.
- **Matchmaking por rank**: partidas públicas juntam jogadores de rank parecido; a tolerância aumenta com o tempo de espera da sala. Salas com código (amigos) ignoram o rank.
- Limite de 40 requisições/s por IP na API e novo endpoint `GET /api/stats`.

- **Vercel**: veja `COMO_HOSPEDAR_VERCEL.md` (função `api/index.mjs` + Redis).

## Sem reinício e sem perder dados (Render grátis)
- **Anti-sono:** o servidor chama o próprio `/api/health` a cada 10 min usando `KEEPALIVE_URL`, `RENDER_EXTERNAL_URL` (o Render cria sozinho) ou `RAILWAY_PUBLIC_DOMAIN`.
- **Perfis no Redis (Upstash, grátis):** defina `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` (ou `KV_REST_API_URL` e `KV_REST_API_TOKEN`). Ao ligar, o servidor carrega os perfis de lá; a cada mudança, grava de volta (até 10 s) e também ao receber SIGTERM. Se o Redis falhar na leitura, nada é gravado nele até a leitura funcionar. Chave: `REDIS_KEY` (padrão `cyberarena:players`).
- Salas de partidas continuam só na memória.

## Amigos, grupo, chat e voz (lobby)
Arquivos: `online-server/social.mjs` (servidor), `party.js` + `voice.js` + `party.css` (lobby).
- Botão **AMIGOS**: código de amigo de 6 caracteres, adicionar por código, pedidos, lista com status e CONVIDAR.
- Grupo de até 4. Personagens e nomes aparecem juntos no lobby. Só o **líder** aperta JOGAR; todos entram juntos na mesma sala (Batalha ou Mundo Aberto).
- Chat de texto do grupo (balão sobre o personagem) e chat de voz (WebRTC, áudio direto entre os jogadores).
- Só funciona com este servidor (`node online-server/server.mjs`). Em Vercel/Netlify serverless o botão avisa que não está disponível.
- Voz exige HTTPS (ou localhost). Para funcionar em qualquer rede de celular configure um servidor TURN:
  `TURN_URL=turn:seu-servidor:3478  TURN_USER=...  TURN_PASS=...` (ou `ICE_SERVERS` com JSON completo).
- No APK, a permissão de microfone é pedida na primeira vez que o jogador liga a voz. Reconstrua o APK (build_apk.sh já inclui os arquivos novos).

## Teste de Poderes online + interface da partida
- O **Teste de Poderes** (`mode=space`) agora é online: sala própria, amigos do grupo entram juntos, dá para acertar os outros jogadores (os 4 bots continuam só seus). Treino simples (`mode=train`) continua offline.
- Dentro da partida há botões de **CHAT**, **VOZ** e **MIC** (voz só aparece se você está em grupo; a voz é do grupo, não de estranhos).
- Visual da interface: `mundo/hud.css` (estilo battle royale mobile). Os ids do HTML não mudaram.
