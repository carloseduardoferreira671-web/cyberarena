# Gerar o APK na nuvem (GitHub Actions)

1. Crie um repositório **privado** no GitHub e envie esta pasta inteira (o ZIP extraído).
   - Pelo site: *New repository* > *uploading an existing file* (arraste os arquivos, incluindo a pasta `.github`).
   - Se o upload pelo navegador ignorar a pasta `.github`, use o GitHub Desktop ou `git push`.
2. Abra a aba **Actions** > **Gerar APK** > **Run workflow**. Leva uns 3 a 6 minutos.
3. Quando terminar, abra a execução e baixe **CyberArena-apk** em *Artifacts* (vem num ZIP com o `CyberArena.apk`).
4. Todo novo envio para a branch `main` gera um APK novo automaticamente.

## Assinatura (importante)
- Sem configuração, cada build cria uma chave de teste nova. Aí o Android **não deixa instalar por cima** do APK anterior: desinstale o antigo antes.
- Para manter sempre a mesma chave: gere um `.jks` no seu computador, converta com `base64 -w0 minha_chave.jks` e salve em
  *Settings > Secrets and variables > Actions*: `KEYSTORE_BASE64` (o texto em base64) e `KEYSTORE_PASSWORD` (a senha; o alias deve ser `cyberarena`).
- Para a Google Play será preciso AAB com a sua chave própria (veja `COMO_TRANSFORMAR_EM_APP.md`).
