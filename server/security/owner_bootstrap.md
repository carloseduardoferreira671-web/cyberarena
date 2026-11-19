# Owner Bootstrap — CyberArena

## Objetivo

A primeira conta Owner é provisionada no servidor, não pelo navegador. Isso mantém a autorização do Owner no lado do servidor e evita que a primeira pessoa que abra a interface pública ganhe privilégios administrativos. OWASP recomenda negar por padrão e aplicar autorização no servidor.

## Primeira configuração

Depois que PostgreSQL e as migrações estiverem prontos, execute no servidor: 

`npm run owner:setup`

O procedimento:

1. verifica se já existe uma conta `is_owner=true`;
2. recusa criar um segundo Owner;
3. pede nome e senha do Owner;
4. exige senha com pelo menos 16 caracteres;
5. gera um Cyber ID aleatório `CA-OWNER-...`;
6. deriva a senha com scrypt + salt aleatório;
7. grava `is_owner=true` dentro da transação;
8. registra a criação no audit log.

## Regra importante

Não coloque a senha do Owner no frontend, no ZIP público, no Git ou em variáveis expostas ao navegador. O `OWNER_PASSWORD` do bootstrap legado continua aceito para implantação automatizada/one-shot, mas `npm run owner:setup` é o fluxo interativo recomendado para a primeira configuração manual.

## Depois da criação

O Owner entra como uma Cyber Account normal. Para abrir a Área do Dono, a conta precisa ser reconhecida pelo servidor como Owner e a senha da Cyber Account é confirmada novamente em `/api/admin/unlock`. A sessão administrativa é separada e expira após 10 minutos.

## Modo local

Sem backend, o jogo possui apenas uma simulação local de Owner vinculada à Cyber Account e à chave deste dispositivo. Isso não concede qualquer privilégio no futuro servidor.
