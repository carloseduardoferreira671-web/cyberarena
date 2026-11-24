# v154 · Personagens novos com ESQUELETO + ANIMAÇÕES GRAVADAS

## O que mudou
- **Nexus, Atlas e Cyber** foram trocados pelos modelos novos riggados (os do `rigged-model_*.glb`). O Atlas junta os dois arquivos (`__6_` + `__7_`, mesma malha).
- Cada GLB (`mundo/models/<id>_rig.glb`) traz as animações dentro: **Nexus 72 · Atlas 76 · Cyber 79** clipes (inclui versões espelhadas: esquiva para a direita e variações dos golpes).
- O corpo agora é tocado por `mundo/js/clipctl.js` (mistura suave entre clipes). Saíram `fightctl/fightlib/fightrx/fightatk` (animação por código).
- Clipes "Root Motion" e os que andavam metros sozinhos ficaram **no lugar** (o jogo é quem move o personagem); os aéreos (`Sword Aerial`) foram ajustados para o ar.

## Golpes (cada personagem usa o que tem)
- **Soco (3 golpes)**: sorteia uma de 5 correntes por combo (jab→cruzado→chute, gancho→uppercut→chute, espelhadas…). Cyber não tem jab: usa gancho/uppercut/joelhada.
- **Chute (H)**: joelhada (e espelhada). **Agachado + soco**: uppercut. **Agachado + chute**: chute deslizando.
- **No ar + soco/chute**: golpe de espada aéreo (Atlas/Cyber) com lâmina de energia.
- **Alcance real**: o quanto o personagem se aproxima vem do alcance medido do clipe (`fightdata.js → ANIM`).
- **Super**: Nexus = `Melee Combo`; Atlas/Cyber = `Sword Heavy Combo` (com espada). **Habilidade (laser)**: Nexus/Cyber = arremesso; Atlas = **arco** (aparece o arco de energia).
- Poderes de impacto (omega, abismo, singularidade) usam o golpe de espada pesado / pancada no chão; solar e canalizar usam levitação (`Lift Air Idle`).

## Reações
- Acerto na **cabeça / peito / barriga / ombro** → clipes diferentes (`Hit Head`, `Hit Chest`, `Hit Stomach`, `Hit Shoulder L/R` + espelhados). No ar → `Lift Air Hit`.
- Derrubado → `Hit Knockback` e fica no chão; levantar → `Kip Up` / `Lay To Idle` (Cyber levanta com a queda ao contrário).

## Movimento novo
- **Pulo duplo** (apertar pulo no ar) · **Deslizar** (correndo + AGACHAR) · **Mortal** (esquiva para trás) · **Rolamento** na queda forte · **Virar no lugar** (Cyber) · **Inclinar ao correr em curva** (Nexus) · **Início/fim de corrida** · **Nadar** (Cyber) · **Escalar** (sobe com `Climb Up`, desce com `Climb Down`, borda com `Climb Ledge`).
- **Sentar (tecla G ou botão SENTAR)**: Nexus senta numa cadeira (aparece um banquinho de luz) e alterna entre as poses; Atlas senta no chão; Cyber ajoelha. Mover-se levanta.
- **Emotes por personagem** (painel no mundo aberto): conversar, concordar, pegar, plantar (Atlas), mortal, levantar, arco, mirar, ninja, rastejar (Cyber), guarda, espada, levitar, nadar — só aparecem os que o personagem tem.

## Botões
- **AGACHAR** agora tem ícone de pessoa agachada, vira **LEVANTAR** quando ligado e **funciona em todos os modos** (antes só em partida). ESQUIVA também.
- Saíram ACENAR/DANÇAR (não havia clipe). CHUTE some no mundo aberto (sem combate).

## Ferramentas
- Para refazer os arquivos: `tools/make_packs.py` e `tools/make_sw.py`.
