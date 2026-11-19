# Recursos baixáveis (v141)

- **Barra DOWNLOADS (lobby)** (`ui2/boot.js` + `ui2/boot.css`): opcional. Abre a janela de recursos (fecha à vontade) para baixar um personagem ou tudo. **JOGAR** só pede Cyber + o personagem escolhido; se faltar, abre a barra. Não existe mais janela obrigatória nem "Recursos do jogo" nas Configurações.
- Baixa **todos os personagens** (Cyber, Atlas, Nexus), uma única vez; ficam guardados no aparelho (Cache API) e nas próximas aberturas a janela nem aparece.
- **Mapas e efeitos** são gerados por código dentro do jogo (não existe arquivo de mapa), por isso não há o que baixar deles. Quando houver arquivos de mapa/textura, basta incluí-los em `tools/make_packs.py` (campo `tipo='mapa'`) e rodar `python3 tools/make_packs.py`: eles entram sozinhos na mesma tela.
- Funciona no navegador (HTTPS ou localhost) e no app. Endereço HTTP comum (sem HTTPS) não tem Cache API: nesse caso o jogo carrega direto do site, como antes. `?packs=0` desliga e `?packs=1` força ligar.
- De onde baixa: o próprio site primeiro (no navegador) ou jsDelivr primeiro (no APK); cada arquivo é conferido por tamanho e SHA-256.
- A lista fica em `mundo/packs.json` (gerada por `python3 tools/make_packs.py`; rode de novo se trocar algum modelo).
- APK leve: `tools/android/build_apk.sh` já tira os `.glb` do APK. Para um APK com tudo dentro: `PACKS=0`.

- v141: o cache mudou para `cyberarena-packs-v2` (modelos novos). Os arquivos do Atlas ficam na PARTE 1; Cyber e Nexus na PARTE 2 (`mundo/models/`).
