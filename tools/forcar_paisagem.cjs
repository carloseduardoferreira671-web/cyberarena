// CyberArena · deixa o app Android SEMPRE deitado (paisagem), como um jogo.
// Use depois de `npx cap add android` (ou em qualquer projeto Android com AndroidManifest.xml):
//   node tools/forcar_paisagem.cjs            (procura android/app/src/main/AndroidManifest.xml)
//   node tools/forcar_paisagem.cjs caminho/AndroidManifest.xml
const fs = require('fs'), path = require('path');
const file = process.argv[2] || path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(file)) { console.error('Não achei ' + file + '. Rode antes: npx cap add android'); process.exit(1); }
let x = fs.readFileSync(file, 'utf8');
// todas as telas (activity) ficam deitadas; gira sozinho entre os dois lados deitados, nunca em pé
x = x.replace(/<activity\b([^>]*?)>/g, (m, attrs) => {
  attrs = attrs.replace(/\s+android:screenOrientation="[^"]*"/g, '');
  return `<activity${attrs} android:screenOrientation="sensorLandscape">`;
});
// marca o app como jogo (a Play Store e o Android tratam como jogo)
x = x.replace(/<application\b([^>]*?)>/, (m, attrs) => {
  attrs = attrs.replace(/\s+android:(appCategory|isGame)="[^"]*"/g, '');
  return `<application${attrs} android:appCategory="game" android:isGame="true">`;
});
if (!/android\.hardware\.screen\.landscape/.test(x)) x = x.replace(/<application\b/, '<uses-feature android:name="android.hardware.screen.landscape" android:required="false" />\n    <application');
fs.writeFileSync(file, x);
console.log('Pronto: ' + file + ' agora abre sempre em paisagem e é marcado como jogo.');
