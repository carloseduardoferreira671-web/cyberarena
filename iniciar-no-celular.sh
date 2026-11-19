#!/data/data/com.termux/files/usr/bin/bash
# CyberArena · liga o servidor online NO CELULAR (Termux) e gera um endereço público para os amigos.
cd "$(dirname "$0")" || exit 1
termux-wake-lock 2>/dev/null || true
command -v node >/dev/null        || pkg install -y nodejs
command -v cloudflared >/dev/null || pkg install -y cloudflared
pkill -f "online-server/server.mjs" 2>/dev/null
PORT=3000 nohup node online-server/server.mjs > servidor.log 2>&1 &
sleep 2
echo "=============================================================="
echo " Servidor ligado. Procure abaixo a linha com https://....trycloudflare.com"
echo " Esse é o endereço do seu jogo: abra no Chrome e mande aos amigos."
echo " Deixe o Termux aberto. Ctrl+C aqui desliga o endereço público."
echo "=============================================================="
cloudflared tunnel --url http://localhost:3000
