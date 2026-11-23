#!/usr/bin/env bash
# Liga o site no Cloudflare Pages falando com o servidor em outro endereço.
# Uso (na pasta do projeto):  bash instalar-nuvem.sh https://SEU-SERVIDOR.onrender.com
set -u
URL="${1:-}"; URL="${URL%/}"
if ! echo "$URL" | grep -qE '^https://[A-Za-z0-9.-]+'; then echo "Faltou o endereço. Exemplo: bash instalar-nuvem.sh https://cyberarena.onrender.com"; exit 1; fi
N=mundo/js/net.js; C=pre-registro/config.js
[ -f "$N" ] || { echo "Não achei $N (rode dentro da pasta do projeto)"; exit 1; }
[ -f "$C" ] || { echo "Não achei $C (rode antes: bash instalar-preregistro.sh)"; exit 1; }
mkdir -p .antes-nuvem; cp -n "$N" .antes-nuvem/net.js.bak 2>/dev/null; cp -n "$C" .antes-nuvem/config.js.bak 2>/dev/null
if grep -q "window.PRESALE && window.PRESALE.api" "$N"; then echo "  ✓ jogo: já lê o servidor do config.js"
elif grep -qF "return inApp ? DEFAULT_API : '/api/';" "$N"; then
  node -e "
const fs=require('fs');let s=fs.readFileSync('$N','utf8');
s=s.replace(\"return inApp ? DEFAULT_API : '/api/';\",\"const cfgApi = (window.PRESALE && window.PRESALE.api) || ''; if (/^https?:\\\\/\\\\//.test(cfgApi)) return cfgApi.replace(/\\\\/*\$/, '') + '/api/';\\n  return inApp ? DEFAULT_API : '/api/';\");
fs.writeFileSync('$N',s)" && echo "  ✓ jogo: agora lê o servidor do config.js"
else echo "  ✗ não achei o ponto no net.js. Me mande a foto: sed -n 9,12p mundo/js/net.js"; exit 1; fi
node -e "
const fs=require('fs');let s=fs.readFileSync('$C','utf8');
s=s.replace(/api:\s*'[^']*'/,\"api: '$URL'\");fs.writeFileSync('$C',s)" && echo "  ✓ servidor definido: $URL"
grep -n "api:" "$C"
grep -q "window.PRESALE" index.html || echo "  ! aviso: o index.html ainda não carrega o config.js (rode bash instalar-preregistro.sh)"
if command -v node >/dev/null; then node --input-type=module --check < "$N" 2>/dev/null && echo "  ✓ net.js: sintaxe conferida" || echo "  ✗ net.js com erro de sintaxe! restaure: cp .antes-nuvem/net.js.bak $N"; fi
echo "PRONTO."
