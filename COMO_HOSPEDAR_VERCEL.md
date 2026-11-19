# Cyber Arena na Vercel (site = jogo, com online e matchmaking)

A Vercel não mantém um servidor ligado, então o estado das salas e dos perfis fica num **Redis (Upstash)**, que a Vercel cria em 1 clique.

1. Suba esta pasta para um repositório no GitHub (privado serve).
2. Vercel → **Add New → Project** → importe o repositório. Não mude nada (o `vercel.json` já define: sem build, pasta raiz, `/api/*` → `api/index.mjs`). Clique em **Deploy**.
3. No projeto: **Storage → Create Database → Upstash Redis** (plano grátis) → *Connect to Project*. Isso cria as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN` (ou `UPSTASH_REDIS_REST_*`). **Faça um novo deploy** (Deployments → ⋯ → Redeploy) para elas valerem.
4. Teste: abra `https://SEU-SITE.vercel.app/api/health` → deve mostrar `"redis": true`. Abra o site e jogue; `/api/stats` mostra quantos estão online (site e APK).
5. APK conectado ao mesmo servidor: no GitHub, Settings → Secrets and variables → Actions → **Variables** → `SERVER_URL` = `https://SEU-SITE.vercel.app`, depois Actions → "Gerar APK". Coloque o `CyberArena.apk` gerado na raiz do projeto e faça deploy para o botão de download do site funcionar.

## Custo e limites (importante)
- O jogo sincroniza ~6 vezes por segundo por jogador. Cada sincronização usa ~5 comandos do Redis. Uma sala cheia (16 humanos) gasta ~500 comandos/s ≈ 1,8 milhão/hora. O plano grátis do Upstash (cerca de 10 mil comandos/dia) acaba rápido; use o plano pago (pay-as-you-go, centavos por 100 mil comandos) se tiver jogadores de verdade.
- Salas de 1–3 humanos com bots saem baratas. Dá para reduzir o custo diminuindo a frequência de sincronização em `mundo/js/net.js`.
- Alternativa mais barata e mais rápida para muitos jogadores: manter o site na Vercel e rodar o `online-server` (Node, sempre ligado: Render, Fly.io, Railway ou VPS) e trocar a regra do `vercel.json` por
  `{ "source": "/api/:path*", "destination": "https://SEU-SERVIDOR/api/:path*" }`. O site continua sendo o da Vercel e o jogo não percebe a diferença.
- Perfis e troféus ficam no Redis (persistem). Salas expiram sozinhas em 1 h.
