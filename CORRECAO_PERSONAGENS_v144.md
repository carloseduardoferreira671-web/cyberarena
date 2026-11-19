# Correção dos personagens (sobre o CyberArena Update, mapa v142)

Base: os arquivos de personagem do próprio Update (modelos, `glbmesh.js`, `lobby3d.js`, `packs.js`, `packs.json`), com a física feita à mão e a iluminação de estúdio.
Das PARTES 1 e 2 (v144) foi trazida só a pose reta de retrato:

- `mundo/js/riggedglb.js`: pose reta de retrato (corpo reto, braços para baixo) para Nexus e Cyber, com os pés mantidos na altura da animação. O Atlas continua com a pose do Update.
- `mundo/js/hero.js`: os retratos do lobby/perfil ligam essa pose (`hh.neutral = true`). Continuam parados no chão, sem queda, pulo ou ações automáticas.

Não usado das partes: modelos antigos (sem a física à mão), materiais escuros, queda/pulo/ações no retrato.
