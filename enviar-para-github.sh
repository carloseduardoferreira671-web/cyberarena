#!/data/data/com.termux/files/usr/bin/bash
# Envia esta pasta inteira (incluindo .github) para um repositório do GitHub, direto do celular (Termux).
# Antes: crie um repositório VAZIO no GitHub e um token NOVO (veja PASSO_A_PASSO_CELULAR.md, passo 2).
# Uso:  cd ~/cyberarena && bash enviar-para-github.sh
set -e
cd "$(dirname "$0")"
[ -f preparar-envio.sh ] && bash preparar-envio.sh

command -v git >/dev/null 2>&1 || { echo "Instalando o git..."; pkg install -y git; }

read -r -p "Seu usuário do GitHub: " GH_USER
read -r -p "Nome do repositório (vazio, já criado): " GH_REPO
read -r -s -p "Token do GitHub (não aparece enquanto você cola): " GH_TOKEN
echo

[ -n "$GH_USER" ] && [ -n "$GH_REPO" ] && [ -n "$GH_TOKEN" ] || { echo "Faltou algum dado. Rode de novo."; exit 1; }

[ -d .git ] || git init -q -b main
git config user.name "$GH_USER"
git config user.email "${GH_USER}@users.noreply.github.com"
git add -A
git commit -q -m "Cyber Arena: primeira versão online" || echo "(nada novo para commitar)"

# O token só é usado neste comando; não fica gravado no projeto.
git -c credential.helper= push "https://${GH_USER}:${GH_TOKEN}@github.com/${GH_USER}/${GH_REPO}.git" HEAD:main
unset GH_TOKEN

echo
echo "Pronto! Abra https://github.com/${GH_USER}/${GH_REPO} para conferir."
echo "Depois siga o passo 3 do PASSO_A_PASSO_CELULAR.md (Render)."
