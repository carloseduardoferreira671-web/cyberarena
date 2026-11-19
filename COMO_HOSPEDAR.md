# Hospedar o Cyber Arena (site = jogo, APK conectado)
1. Crie um repositório privado no GitHub e envie esta pasta inteira.
2. Em https://render.com: New > Blueprint > escolha o repositório (usa o `render.yaml`). Ou New > Web Service com
   Start Command `node online-server/server.mjs`.
3. Quando terminar, o endereço `https://cyberarena-xxxx.onrender.com` já abre o jogo.
4. No GitHub: Settings > Secrets and variables > Actions > Variables > `SERVER_URL` = esse endereço.
   Rode Actions > "Gerar APK": o APK sai conectado ao mesmo matchmaking do site.
Obs.: no plano grátis o serviço dorme sem uso e perfis/troféus se perdem ao reiniciar (use disco + `DATA_DIR`).
Koyeb, Fly.io, Railway ou uma VPS funcionam do mesmo jeito (porta lida de `PORT`).
