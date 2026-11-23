#!/usr/bin/env bash
# CyberArena · instala a PRÉ-VENDA no projeto (rode dentro da pasta do projeto, onde fica o index.html)
# Seguro de rodar mais de uma vez: só faz o que ainda não foi feito, e guarda cópia do que mudou na pasta .antes-pre-venda.
set -u
ok(){ printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad(){ printf '  \033[31m✗\033[0m %s\n' "$1"; FAIL=1; }
FAIL=0
bk(){ mkdir -p .antes-pre-venda; [ -f ".antes-pre-venda/$(basename "$1")" ] || cp "$1" ".antes-pre-venda/$(basename "$1")"; }
S=online-server/server.mjs; I=index.html
[ -f "$S" ] && [ -f "$I" ] || { echo "Rode este comando dentro da pasta do projeto (onde está o index.html e a pasta online-server)."; exit 1; }
[ -f online-server/presale.mjs ] && [ -f acesso.js ] && [ -f pre-registro/index.html ] || { echo "Faltam os arquivos novos (presale.mjs, acesso.js, pre-registro). Extraia o ZIP da pré-venda aqui primeiro."; exit 1; }
echo "Instalando a pré-venda..."

# 1) servidor: importar o módulo
if grep -q "presale.mjs" "$S"; then ok "servidor: módulo já estava ligado"; else
  if [ "$(grep -c "^import { createSocial } from './social.mjs';" "$S")" = 1 ]; then
    bk "$S"
    sed -i "/^import { createSocial } from '.\/social.mjs';/a import { handlePresale } from './presale.mjs';" "$S" && ok "servidor: import adicionado"
  else bad "servidor: não achei a linha do import (seu server.mjs é diferente do que eu conheço). Me mande o arquivo."; fi
fi
# 2) servidor: rota /api/presale e página /pre-registro/
if grep -q "handlePresale(req, res, url)" "$S"; then ok "servidor: rota já estava ligada"; else
  if [ "$(grep -c "^  const url = new URL(req.url, 'http://x');" "$S")" = 1 ]; then
    bk "$S"
    sed -i "/^  const url = new URL(req.url, 'http:\/\/x');/a\\
  if (url.pathname.startsWith('/api/presale')) return handlePresale(req, res, url);   // pré-venda (Mercado Pago)\\
  if (url.pathname === '/pre-registro') { res.writeHead(301, { location: '/pre-registro/' }); return res.end(); }" "$S" && ok "servidor: rotas adicionadas"
  else bad "servidor: não achei o lugar das rotas. Me mande o server.mjs."; fi
fi
# 3) servidor: abrir pasta/ como pasta/index.html
if grep -q "rel.endsWith('/')" "$S"; then ok "servidor: pastas já abrem o index.html"; else
  if [ "$(grep -c "^  if (rel === '/') rel = '/index.html';" "$S")" = 1 ]; then
    bk "$S"
    sed -i "/^  if (rel === '\/') rel = '\/index.html';/a\\
  if (rel.endsWith('/')) rel += 'index.html';" "$S" && ok "servidor: pastas abrem o index.html"
  else bad "servidor: não achei onde abrir pastas. Me mande o server.mjs."; fi
fi
# 4) jogo: porta de entrada com código
if grep -q "acesso.js" "$I"; then ok "jogo: tela de código já estava ligada"; else
  if [ "$(grep -o '</body>' "$I" | wc -l)" = 1 ]; then
    bk "$I"
    sed -i 's#</body>#<script src="pre-registro/config.js"></script><script src="acesso.js"></script></body>#' "$I" && ok "jogo: tela de código ligada"
  else bad "jogo: não achei o fim do index.html"; fi
fi
command -v node >/dev/null 2>&1 && { node --check "$S" 2>/dev/null && ok "servidor: sintaxe conferida" || bad "servidor: erro de sintaxe (restaure o .antes-pre-venda)"; }
if [ "$FAIL" = 0 ]; then echo; echo "PRONTO. Agora siga o LEIA-ME_PRE_VENDA.md (variáveis no Render)."; else echo; echo "Algo não encaixou. Me mande a foto desta tela."; exit 1; fi
