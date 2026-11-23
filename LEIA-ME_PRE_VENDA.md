# Pré-venda do Cyber Arena — como ligar

## O que vem aqui
- `online-server/presale.mjs` → o "caixa": cria o Pix, confirma sozinho, gera o código, devolve em 7 dias.
- `pre-registro/` → a página de venda (`/pre-registro/`) e o painel (`/pre-registro/admin.html`).
- `acesso.js` → a tela que pede o código antes de entrar no jogo.
- `instalar-preregistro.sh` → liga tudo no seu projeto (pode rodar mais de uma vez).

## Passo 1 — Mercado Pago
1. Crie/entre na conta do Mercado Pago (pode usar o Sicredi como destino do dinheiro).
2. Em "Suas integrações" crie uma aplicação e copie o **Access Token de PRODUÇÃO**.
3. NUNCA cole esse token em arquivo do jogo, nem no GitHub, nem me mande. Só no Render.

## Passo 2 — Render (Environment)
Crie estas variáveis:
- `MP_ACCESS_TOKEN` = o token de produção
- `ADMIN_KEY` = uma senha grande inventada por você (entra no painel)
- `PUBLIC_URL` = o endereço do seu site no Render (https://...onrender.com)
- `PRESALE_GATE` = `1` (pede código no jogo) — use `0` para deixar o jogo livre
- `PRESALE_PRICE_CENTS` = `299` (R$ 2,99) e `PRESALE_TOTAL` = `500`
- `PRESALE_APK_URL` = link do seu APK (só quem tem código recebe o link pelo botão "Baixar o jogo")
- opcional: `MP_WEBHOOK_SECRET`

No Mercado Pago, em Webhooks, coloque a URL `https://SEU-SITE/api/presale/webhook` e marque "Pagamentos".

## Passo 3 — Instalar
No Termux, dentro da pasta do projeto: `bash instalar-preregistro.sh`
Se ele avisar que não achou um ponto do `server.mjs` ou do `index.html`, me mande esse arquivo.
Depois envie ao GitHub como de costume.

## Se o site estiver no Cloudflare e a API no Render
Em `pre-registro/config.js` coloque `api:'https://SEU-SITE.onrender.com'`.

## Teste de verdade (faça antes de divulgar)
1. Abra `/pre-registro/`, compre com Pix (R$ 7) com seu e-mail.
2. Veja se o código aparece sozinho depois de pagar.
3. Entre no jogo com o código.
4. Peça a devolução e confira no Mercado Pago.

## O que foi testado e o que NÃO foi
- Testado: o servidor e as telas, com um Mercado Pago de mentira (36 testes + navegador de teste em celular).
- NÃO testado: o Mercado Pago real (Pix, cartão, webhook, assinatura, devolução). Por isso o teste real acima é obrigatório.
- A trava do jogo é "leve": alguém técnico consegue burlar. Para travar de verdade, o servidor de partidas teria que exigir o código.
- Painel: `/pre-registro/admin.html` — gera código grátis (testadores), confirma/devolve, baixa lista em CSV.
- Direito de arrependimento de 7 dias (CDC): mantenha a devolução ativa.
