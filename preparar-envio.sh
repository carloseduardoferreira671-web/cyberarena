#!/usr/bin/env bash
# Prepara a pasta do projeto para enviar ao GitHub/Cloudflare/Render. Pode rodar quantas vezes quiser.
#  1) mundo/js/net.js: site no Cloudflare (pages.dev) fala com o servidor do Render
#  2) online-server/server.mjs: compressão da API + redirecionamento (SITE_URL)
#  3) recomprime texturas .webp acima de 24 MB (originais em ~/originais_4k)
#  4) mundo/packs.json: atualiza tamanhos e códigos
# Uso (dentro da pasta do projeto):  bash preparar-envio.sh
RENDER_API='https://cyberarena-jr3i.onrender.com/api/'
NET=mundo/js/net.js; SRV=online-server/server.mjs; PK=mundo/packs.json
for f in "$NET" "$SRV" "$PK"; do [ -f "$f" ] || { echo "Não achei $f. Rode dentro da pasta do projeto."; exit 1; }; done
command -v node >/dev/null || { echo "Falta o node."; exit 1; }
mkdir -p .antes-preparo; for f in "$NET" "$SRV" "$PK"; do cp -n "$f" ".antes-preparo/$(basename $f)" 2>/dev/null; done
FALHA=0
echo "1/4 net.js"
node - "$NET" "$RENDER_API" <<'JS' || FALHA=1
const fs=require('fs'),[f,api]=[process.argv[2],process.argv[3]];let s=fs.readFileSync(f,'utf8');
if(/pages\\?\.dev/.test(s)&&s.includes('onrender.com')){console.log('  ✓ já estava certo');process.exit(0)}
const a="return inApp ? DEFAULT_API : '/api/';";
if(!s.includes(a)){console.log("  ✗ não achei o ponto no net.js (me mande a foto: sed -n 9,12p mundo/js/net.js)");process.exit(2)}
s=s.replace(a,()=>"return inApp ? DEFAULT_API : (/\\.pages\\.dev$/.test(location.hostname) ? '"+api+"' : '/api/');");
fs.writeFileSync(f,s);console.log('  ✓ ajustado');
JS
echo "2/4 servidor"
node - "$SRV" <<'JS' || FALHA=1
const fs=require('fs'),f=process.argv[2];let s=fs.readFileSync(f,'utf8'),ok=true,ch=false;const say=m=>console.log('  '+m);
if(s.includes('/*gz-api*/'))say('✓ compressão: já estava ligada');else{
 const a="const send = (res, status, data) => { const b = JSON.stringify(data); res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS }); res.end(b); };";
 const n="const send = (res, status, data) => { /*gz-api*/ const b = JSON.stringify(data), h = { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS }; if (b.length > 300 && /\\bgzip\\b/.test(res._ae || '')) { const z = zlib.gzipSync(b, { level: 4 }); h['content-encoding'] = 'gzip'; h.vary = 'accept-encoding'; res.writeHead(status, h); return res.end(z); } res.writeHead(status, h); res.end(b); };";
 const b="  const url = new URL(req.url, 'http://x');\n";
 if(s.includes(a)&&s.includes(b)){s=s.replace(a,()=>n).replace(b,()=>b+"  res._ae = req.headers['accept-encoding'] || '';\n");say('✓ compressão: ligada');ch=true}else{say('✗ compressão: não achei o ponto');ok=false}}
if(s.includes('/*site-redirect*/'))say('✓ redirecionamento: já estava ligado');else{
 const a="  serveStatic(req, res, url.pathname);\n}).listen";
 const n="  /*site-redirect*/ const SITE = (process.env.SITE_URL || '').replace(/\\/$/, ''); if (SITE) { let h = ''; try { h = new URL(SITE).host; } catch {} if (h && (req.headers.host || '') !== h) { res.writeHead(302, { location: SITE + req.url, 'cache-control': 'no-store' }); return res.end(); } }\n  serveStatic(req, res, url.pathname);\n}).listen";
 if(s.includes(a)){s=s.replace(a,()=>n);say('✓ redirecionamento: ligado');ch=true}else{say('✗ redirecionamento: não achei o ponto');ok=false}}
if(ok&&ch)fs.writeFileSync(f,s);process.exit(ok?0:2)
JS
node --check "$SRV" || { echo "  ✗ erro de sintaxe no server.mjs! Restaure: cp .antes-preparo/server.mjs $SRV"; FALHA=1; }
echo "3/4 texturas grandes"
if command -v cwebp >/dev/null && command -v dwebp >/dev/null; then
  mkdir -p ~/teste_webp; N=0
  while IFS= read -r f; do
    mkdir -p ~/originais_4k/"$(dirname "$f")"; cp -n "$f" ~/originais_4k/"$f"
    if dwebp -quiet "$f" -o ~/teste_webp/t.png && cwebp -quiet -near_lossless 50 -m 4 ~/teste_webp/t.png -o "$f"; then N=$((N+1)); echo "  recomprimido: $f"; else echo "  ✗ falhou: $f"; cp ~/originais_4k/"$f" "$f"; FALHA=1; fi
  done < <(find mundo -name '*.webp' -size +24M)
  echo "  recomprimidos agora: $N"
else echo "  ! sem cwebp/dwebp (instale: pkg install libwebp)"; fi
echo "4/4 packs.json"
node - "$PK" <<'JS' || FALHA=1
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const f=process.argv[2],base=path.dirname(f);const raw=fs.readFileSync(f,'utf8');const j=JSON.parse(raw);
let changed=0,missing=0,total=0,sums=0;
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const isFile=x=>x&&typeof x==='object'&&typeof x.path==='string'&&typeof x.bytes==='number';
const sumOf=a=>a.reduce((s,x)=>s+x.bytes,0);
function walk(o){
 if(Array.isArray(o)){o.forEach(walk);return}
 if(!o||typeof o!=='object')return;
 const lists=['files','items','entries'].map(k=>o[k]).filter(a=>Array.isArray(a)&&a.length&&a.every(isFile));
 const olds=lists.map(sumOf);
 if(isFile(o)){total++;const p=path.join(base,o.path);
  if(!fs.existsSync(p)){missing++;if(missing<=5)console.log('  ! não existe:',o.path)}
  else{const sz=fs.statSync(p).size;
   if(sz!==o.bytes||(typeof o.sha256==='string'&&sha(p)!==o.sha256)){console.log('  atualizado:',o.path,o.bytes,'->',sz);o.bytes=sz;if('sha256' in o)o.sha256=sha(p);changed++}}}
 for(const k of Object.keys(o))walk(o[k]);
 lists.forEach((a,i)=>{const nw=sumOf(a);if(nw!==olds[i])for(const fk of ['bytes','size','total','totalBytes'])if(typeof o[fk]==='number'&&o[fk]===olds[i]){console.log('  total do pacote',o.id||o.name||'','->',nw);o[fk]=nw;sums++}});
}
walk(j);
if(changed)fs.writeFileSync(f,JSON.stringify(j,null,raw.includes('\n  ')?2:0));
console.log(`  conferidos: ${total} · atualizados: ${changed} · totais: ${sums} · faltando: ${missing}`);
JS
echo "Arquivos ainda acima de 24 MB (limite do Cloudflare):"
find . -path ./.git -prune -o -type f -size +24M -exec ls -lh {} \; | head
[ $FALHA -eq 0 ] && echo "PRONTO. Pode enviar ao GitHub." || echo "ATENÇÃO: algum passo falhou (veja acima). Me mande a foto."
