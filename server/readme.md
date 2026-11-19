# CyberArena — backend seguro (v79)

Esta pasta contém o backend opcional do CyberArena. Em modo conectado, o servidor é a autoridade final sobre autenticação, contas, economia, inventário, XP, Pass, Progressão, códigos e administração.

## O que fica protegido no servidor

- PostgreSQL como fonte de verdade.
- Senhas com `scrypt` + salt aleatório; nunca em texto puro.
- Sessões com tokens aleatórios armazenados somente em hash no banco.
- Cookies `HttpOnly` + `SameSite=Strict`; produção usa cookies `__Host-` com `Secure`.
- Rate limiting para autenticação e administração sensível.
- Validação de `Origin` em métodos de alteração quando `PUBLIC_ORIGIN` está configurado.
- Sessões revogáveis e banimento com revogação imediata das sessões do alvo.
- Código comunitário atômico e único por Cyber Account.
- Caixa de Entrada criada pelo servidor para recompensas de código.
- Comandos econômicos explícitos com transação, bloqueio da conta, idempotência, ledger e auditoria.
- Sorteios de caixas com aleatoriedade criptográfica no servidor.
- Relógio de jogo e reset diário baseados em UTC no servidor.
- Painel do dono protegido por reautenticação e sessão administrativa curta.

## Limite do modo local

O ZIP continua funcionando localmente como protótipo/guest. Nesse modo, o navegador é controlado pelo próprio jogador e não existe segurança global contra alteração do cliente.

Para contas globais, banimento global, códigos globais e economia protegida, use o backend hospedado por HTTPS.

## Desenvolvimento local

1. Copie `.env.example` para `.env` e substitua todos os valores de exemplo.
2. Defina `POSTGRES_PASSWORD` no `server/docker-compose.yml` ou no ambiente usado pelo Compose.
3. Execute `docker compose -f server/docker-compose.yml up -d`.
4. Rode `npm run audit` e `npm run security:audit` antes de testar uma alteração sensível.
5. Para criar o dono em ambiente local, use `server/scripts/create-owner.mjs` com uma senha forte; o script de bootstrap deve ser executado somente pelo operador autorizado.

## Produção

Use `server/docker-compose.prod.yml` como base. A arquitetura separa o usuário administrador do PostgreSQL do usuário de runtime da aplicação:

- `cyberarena_admin` é usado somente pelo job de migração/bootstrap.
- `cyberarena_app` é usado pelo servidor em execução e não recebe privilégios administrativos do PostgreSQL.
- PostgreSQL fica somente na rede privada `backend`.
- Caddy termina HTTPS e publica apenas as portas 80/443.
- O app espera a conclusão bem-sucedida do serviço de migração.
- Segredos são montados como Docker Secrets.

Antes de abrir para jogadores, configure `PUBLIC_ORIGIN` e `CADDY_DOMAIN`, crie `db_password.txt` e `app_db_password.txt` usando um gerenciador de segredos, execute o bootstrap do dono uma única vez e remova do ambiente qualquer senha temporária usada no comando.

## Backups

`server/scripts/backup-db.sh` cria dumps PostgreSQL em UTC e aplica retenção local de 14 dias. Em produção, esses dumps devem ser criptografados, enviados para armazenamento externo/versionado e submetidos a testes periódicos de restauração. A única cópia não deve permanecer no mesmo servidor do banco.

## Auditoria

- `npm run audit` — revisão ampla do projeto, incluindo HTML/JS/CSS, referências de assets, regras do Pass, arquivos legados e verificações de mídia.
- `npm run security:audit` — verificações focadas nos controles de segurança e produção.

A especificação detalhada está em `server_tmp.txt` e em `server/security/`.

## Dono e MFA

O backend já exige reautenticação da senha da Cyber Account e cria uma sessão administrativa separada com expiração curta. Isso não é MFA resistente a phishing. Antes de administração pública, habilite WebAuthn/passkeys ou outro MFA gerenciado resistente a phishing.
