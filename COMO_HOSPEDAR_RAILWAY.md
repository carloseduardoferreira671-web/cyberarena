# Cyber Arena na Railway (site = jogo + online + matchmaking, tudo no mesmo endereço)

A Railway deixa o servidor Node ligado o tempo todo, então usa o `online-server` direto: ele serve o jogo E a API. Sem Redis.

1. Crie um repositório no GitHub e suba esta pasta inteira (privado serve).
2. Em https://railway.com → **New Project → Deploy from GitHub repo** → escolha o repositório. O `railway.json` já define o comando de início (`node online-server/server.mjs`) e o teste de saúde.
3. No serviço: **Settings → Networking → Generate Domain**. Seu jogo fica em `https://algo.up.railway.app`.
4. **Guardar troféus/XP entre reinícios**: no serviço, **Settings → Volumes → Add Volume** com *Mount path* `/data`, e em **Variables** crie `DATA_DIR` = `/data`. (Sem isso os perfis zeram a cada novo deploy.)
5. Teste: abra `https://algo.up.railway.app/api/health` → `{"ok":true,...}`. Depois abra o endereço principal e jogue; `/api/stats` mostra quem está online (site e APK).
6. APK no mesmo servidor: no GitHub, Settings → Secrets and variables → Actions → **Variables** → `SERVER_URL` = `https://algo.up.railway.app` → Actions → "Gerar APK". Ponha o `CyberArena.apk` na raiz do projeto e faça novo deploy: o botão de download aparece em `/sobre`.

Custo: a Railway cobra por uso (há um crédito de teste). Um servidor assim consome pouco; o jogo inteiro (30 MB) é servido por ele.
Se quiser um domínio seu (ex.: cyberarena.com.br): Settings → Networking → Custom Domain.
