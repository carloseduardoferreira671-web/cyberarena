# Cyber Arena online: passo a passo pelo celular

Resultado no fim: um link do jogo (site) com matchmaking para você e seus amigos, e um APK que joga nas mesmas salas.

Como funciona: o GitHub guarda o código e gera o APK. O site e o matchmaking rodam no Render (um servidor Node ligado), porque o GitHub Pages não roda servidor.

---

## 1) Termux e o ZIP no celular
1. Instale o **Termux pelo F-Droid** (a versão da Play Store está desatualizada).
2. Salve o ZIP do jogo na pasta *Downloads* do celular.
3. Abra o Termux e rode, linha por linha:
```
termux-setup-storage
pkg install -y unzip git
cd ~ && unzip -o ~/storage/downloads/NOME-DO-ZIP.zip -d cyberarena
```
(troque `NOME-DO-ZIP.zip` pelo nome real do arquivo. Se o ZIP criar uma pasta dentro de `cyberarena`, entre nela com `cd`.)

## 2) Repositório e token no GitHub
1. Entre em github.com pelo Chrome (crie a conta se precisar).
2. Toque no **+** → **New repository**. Nome sugerido: `cyberarena`. Deixe **vazio** (sem README). Pode ser privado. Toque em **Create repository**.
3. Crie um token **novo** (nunca reaproveite um token que você já colou em algum chat):
   - Perfil → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
   - *Expiration*: 7 dias.
   - *Repository access*: **Only select repositories** → `cyberarena`.
   - *Permissions → Repository permissions*: **Contents: Read and write** e **Workflows: Read and write**.
   - Gere e copie o token (ele só aparece uma vez).
   - Dica: se o menu do GitHub ficar apertado no celular, use no Chrome a opção **Site para computador**.
4. No Termux:
```
cd ~/cyberarena
bash enviar-para-github.sh
```
Ele pergunta seu usuário, o nome do repositório e o token (cole o token; ele não aparece na tela). Ao terminar, abra o repositório no GitHub e confira se existe a pasta `.github/workflows`.
5. Quando acabar o teste, apague o token em *Settings → Developer settings*.

> O primeiro envio já dispara a criação de um APK na aba **Actions**. Ignore esse: ele ainda não conhece o seu servidor. O certo é gerar o APK no passo 4.

## 3) Site + matchmaking no Render (sem dormir e sem perder troféus)
O servidor já vem com duas proteções, que só precisam de uma configuração:
- **Anti-sono:** ele chama o próprio endereço a cada 10 minutos, então o Render não o coloca para dormir por falta de uso.
- **Perfis guardados fora do servidor:** troféus e XP ficam num Redis grátis (Upstash). Se o servidor reiniciar ou for atualizado, tudo volta sozinho. Se o Redis estiver fora do ar na hora de ligar, o servidor não grava nada por cima do que já está lá.

**3a) Crie o Redis grátis (Upstash)**
1. Acesse upstash.com e entre com a conta do GitHub.
2. **Create database** (tipo Redis). Nome: `cyberarena`. Região: a mais perto de você. Plano: **Free**.
3. Na página do banco, abra a aba **REST API** (ou *Details*) e copie dois valores: **UPSTASH_REDIS_REST_URL** e **UPSTASH_REDIS_REST_TOKEN**. Deixe a página aberta, vai precisar deles já.

**3b) Suba o servidor no Render**
1. Acesse render.com e entre com a conta do GitHub.
2. **New + → Blueprint** → escolha o repositório `cyberarena`.
3. O Render vai pedir os dois valores marcados no `render.yaml`: cole a URL e o token do Upstash. **Apply**.
4. Espere o deploy terminar. O Render mostra o endereço, algo como `https://cyberarena-xxxx.onrender.com`.
5. Teste: abra `SEU-ENDERECO/api/health`. Deve aparecer `{"ok":true,...}`. Depois abra o endereço principal: é o jogo.
6. Em **Logs** do Render devem aparecer as linhas `anti-sono ligado: https://...` e `Redis ligado` (ou `perfis carregados do Redis`). Se aparecer `AVISO: não consegui ler o Redis`, confira se a URL e o token foram colados inteiros, sem espaço.
7. Mande esse endereço aos amigos. Funciona direto no Chrome do celular.

**3c) Reforço opcional contra queda (UptimeRobot, grátis)**
Se um dia o servidor cair ou dormir mesmo assim, um monitor externo o acorda. Em uptimerobot.com crie um monitor **HTTP(s)** apontando para `SEU-ENDERECO/api/health`, com intervalo de 5 minutos. Ele também avisa por e-mail se o jogo sair do ar.

Limites que continuam valendo (confira os planos atuais no site do Render):
- O plano grátis tem um limite de horas por mês. Um serviço ligado 24 horas por dia cabe nele, mas as horas são somadas entre todos os serviços grátis da sua conta.
- O Render ainda pode reiniciar o servidor de vez em quando (manutenção, deploy). Troféus e XP não se perdem mais, mas uma **partida em andamento cai**, porque as salas ficam na memória.
- A sincronização é por HTTP (não WebSocket), feita para poucos jogadores. Para menos de 10 amigos está bom.

## 4) APK conectado ao seu servidor
1. No GitHub (repositório) → **Settings → Secrets and variables → Actions → aba Variables → New repository variable**.
   - Name: `SERVER_URL`
   - Value: o endereço do Render, **sem barra no fim** (ex.: `https://cyberarena-xxxx.onrender.com`).
2. Aba **Actions → Gerar APK → Run workflow**. Leva uns 3 a 6 minutos.
3. Abra a execução concluída, role até **Artifacts** e baixe **CyberArena-apk** (vem em ZIP com o `CyberArena.apk` dentro).
4. Extraia o ZIP (app Arquivos do Android ou o Termux) e instale o `.apk`. O Android vai pedir para permitir instalar de fonte desconhecida.
5. Para os amigos: mande o `.apk` pelo WhatsApp/Telegram, ou mande só o link do site.
6. Cada APK gerado sem a sua chave de assinatura usa uma chave de teste nova: **desinstale o APK antigo antes de instalar um novo**. Para manter a mesma chave, veja `COMO_GERAR_APK_NA_NUVEM.md`.

## 5) Testar o online
- Entre no jogo no site e no APK. Em **Sala com amigos**, use o mesmo código nos dois: vocês caem na mesma sala.
- Partida pública: o matchmaking junta jogadores de rank parecido. Sala quase vazia aceita qualquer um, para ninguém esperar sozinho.
- Ver quem está online: `SEU-ENDERECO/api/stats`.

## Se algo der errado
- **Página não abre / demora**: o servidor pode ter reiniciado. Espere 1 minuto e atualize. Veja os *Logs* no Render.
- **APK não acha partida**: confira se a variável `SERVER_URL` foi criada **antes** de rodar o "Gerar APK". Se não, crie e rode de novo. Ou, no APK, abra *Sala com amigos* e preencha o campo **Servidor**.
- **Push recusado no passo 2**: o token está sem a permissão *Workflows*, ou o repositório não estava vazio, ou o nome do repositório está errado.
- **Actions não aparece**: a pasta `.github` não subiu. Rode `bash enviar-para-github.sh` de novo dentro da pasta certa.

## Plano B (sem GitHub, sem Render, só para testar agora)
Com o Termux: `bash iniciar-no-celular.sh`. Ele liga o servidor no próprio celular e mostra um endereço `https://...trycloudflare.com` para os amigos. O Termux precisa ficar aberto e o celular carregando, e o endereço muda toda vez que você reinicia.
