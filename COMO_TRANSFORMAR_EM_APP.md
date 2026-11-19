# CyberArena — app Android

## Instalar agora (teste)
O ZIP já traz **`CyberArena.apk`** pronto. Copie para o celular, abra e permita "instalar apps desconhecidos".
- O app abre **sempre deitado (paisagem)**: o próprio Android trava a tela, mesmo com o celular em pé ou
  com a rotação automática desligada. Ele só alterna entre os dois lados deitados.
- Tela cheia, sem barras do sistema, tela não apaga durante o jogo, marcado como **jogo** no Android.
- O jogo inteiro fica dentro do app (abre rápido e funciona offline contra bots). O online (partidas,
  mundo aberto, chat, ranking) usa o servidor publicado.
- Dentro do app não existe o selo "Powered by Netlify" (ele só é colocado pela hospedagem no site).

## Gerar de novo (depois de mudar o jogo)
`ANDROID_HOME=/caminho/do/sdk bash tools/android/build_apk.sh` → gera `CyberArena.apk` na raiz.
Precisa de Java 17+ e do Android SDK (`platforms;android-34` e `build-tools;35.0.0`).

## Google Play
A Play Store pede um **AAB** assinado com a sua chave de envio. O APK de teste foi assinado com uma chave
de teste; para publicar, crie a sua própria chave (o script cria `minha_chave.jks` e pede uma senha —
guarde-a, ela é necessária para todas as atualizações). Para gerar o AAB, abra a pasta `tools/android`
como projeto no Android Studio (ou use Capacitor com `node tools/forcar_paisagem.cjs`) e use
Build › Generate Signed Bundle. Categoria na Play Console: **Jogos**.

## Rodar no computador
`npx serve .` e abra `http://localhost:3000`. Com a API: `npm install` e `netlify dev`.
