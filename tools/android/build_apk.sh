#!/usr/bin/env bash
# CyberArena · gera o APK Android (sempre deitado, tela cheia, marcado como jogo) sem Android Studio.
# Precisa: Java (JDK 17+) e o Android SDK com "platforms;android-34" e "build-tools;35.0.0".
#   ANDROID_HOME=/caminho/do/sdk bash tools/android/build_apk.sh
set -e
cd "$(dirname "$0")"; ROOT=../..; BT=$ANDROID_HOME/build-tools/35.0.0; JAR=$ANDROID_HOME/platforms/android-34/android.jar
rm -rf build && mkdir -p build/assets/www build/classes res/mipmap-xxxhdpi res/mipmap-xhdpi
cp $ROOT/assests/ui/icon-512.png res/mipmap-xxxhdpi/ic_launcher.png; cp $ROOT/assests/ui/icon-192.png res/mipmap-xhdpi/ic_launcher.png
for f in index.html app.html paisagem.js main.js lobby3d.js party.js voice.js style.css lobby3d.css party.css manifest.webmanifest assests cyber_viewer mundo sounds data; do cp -r $ROOT/$f build/assets/www/; done
# os modelos pesados NÃO vão dentro do APK: o jogo baixa na primeira vez (tela "Recursos do jogo"). PACKS=0 inclui tudo no APK.
if [ "${PACKS:-1}" != "0" ]; then rm -f build/assets/www/mundo/models/*.glb; echo "APK leve: modelos serão baixados no app"; fi
# SERVER_URL=https://seu-servidor  -> o APK entra no MESMO matchmaking do site (cross-play)
if [ -n "$SERVER_URL" ]; then sed -i "s#const DEFAULT_API = '[^']*'#const DEFAULT_API = '${SERVER_URL%/}/api/'#" build/assets/www/mundo/js/net.js; echo "APK usa o servidor: ${SERVER_URL%/}/api/";   sed -i "s#const DEFAULT_SITE = '[^']*'#const DEFAULT_SITE = '${SERVER_URL%/}/'#" build/assets/www/mundo/js/packs.js
fi
$BT/aapt2 compile --dir res -o build/res.zip
$BT/aapt2 link -o build/base.apk -I $JAR --manifest AndroidManifest.xml -A build/assets build/res.zip --java build/gen -0 mp3 -0 wav -0 webp -0 png -0 bin
javac --release 8 -classpath $JAR -d build/classes $(find src build/gen -name '*.java')
(cd build/classes && jar cf ../classes.jar .)
java -cp $BT/lib/d8.jar com.android.tools.r8.D8 --release --min-api 24 --lib $JAR --output build build/classes.jar
cp build/base.apk build/unsigned.apk && (cd build && zip -q -j unsigned.apk classes.dex)
$BT/zipalign -f -p 4 build/unsigned.apk build/aligned.apk
# a chave fica FORA do projeto (o projeto é publicado inteiro no site): KS=/caminho/minha_chave.jks
KS=${KS:-$HOME/minha_chave.jks}
if [ -n "$KS_PASS" ]; then PW="--ks-pass env:KS_PASS"; KT="-storepass $KS_PASS -keypass $KS_PASS"; else PW=""; KT=""; fi
[ -f "$KS" ] || keytool -genkeypair -keystore "$KS" -alias cyberarena -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=CyberArena" $KT
$BT/apksigner sign --ks "$KS" $PW --out ../../CyberArena.apk build/aligned.apk
rm -rf build
echo "Pronto: CyberArena.apk"
