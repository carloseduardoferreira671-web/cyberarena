#!/usr/bin/env python3
"""Gera mundo/packs.json (tamanho + sha256 de cada arquivo baixável). Rode depois de mudar qualquer modelo:  python3 tools/make_packs.py"""
import hashlib, json, os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'mundo')
PACKS = [
  dict(id='cyber', nome='Cyber', desc='Personagem Cyber (humanoide encapuzado)', essencial=True, tipo='personagem', files=['models/cyber_rig.glb']),
  dict(id='atlas', nome='Atlas', desc='Personagem Atlas (lutador)', essencial=False, tipo='personagem', files=['models/atlas_rig.glb']),
  dict(id='nexus', nome='Nexus', desc='Personagem Nexus (robô)', essencial=False, tipo='personagem', files=['models/nexus_rig.glb']),
  # v142 · texturas PBR reais do mapa (cor, normal, rugosidade e AO). O jogo usa o melhor nível instalado e cai para o procedural se nenhum estiver.
  dict(id='mapa_1k', nome='Mapa · Padrão (1K)', desc='Texturas PBR do mapa em 1K + nuvens do céu, brilho da água e arbustos', essencial=True, tipo='mapa', glob='assets/map/1k'),
  dict(id='mapa_2k', nome='Mapa · HD (2K)', desc='Texturas PBR do mapa em 2K + nuvens, água e arbustos (celulares com 6 GB ou mais de RAM)', essencial=False, tipo='mapa', glob='assets/map/2k'),
  dict(id='mapa_4k', nome='Mapa · ULTRA (4K)', desc='Grama, terra, calçada, pedra, ruínas, piso, tijolo e casca do mapa em 4K sem perda (celulares com 8 GB ou mais; precisa do HD 2K também)', essencial=False, tipo='mapa', glob='assets/map/4k'),
]
def expand(p):
    if 'glob' in p:
        base = os.path.join(ROOT, p['glob']); p['files'] = sorted(os.path.relpath(os.path.join(d, f), ROOT).replace(os.sep, '/') for d, _, fs in os.walk(base) for f in fs if f.endswith('.webp'))
        del p['glob']
for _p in PACKS: expand(_p)
out = dict(versao=1,
  # de onde baixar (tenta na ordem). {SITE} = endereço do servidor do jogo. Caminho = mundo/<arquivo>
  fontes=['https://cdn.jsdelivr.net/gh/carloseduardoferreira671-web/cyberarena@main/mundo/', '{SITE}mundo/', ''],
  packs=[])
for p in PACKS:
    fl = []
    for f in p['files']:
        b = open(os.path.join(ROOT, f), 'rb').read(); fl.append(dict(path=f, bytes=len(b), sha256=hashlib.sha256(b).hexdigest()))
    q = dict(p); q['files'] = fl; q['bytes'] = sum(x['bytes'] for x in fl); out['packs'].append(q)
json.dump(out, open(os.path.join(ROOT, 'packs.json'), 'w'), indent=1, ensure_ascii=False)
print('packs.json:', [(p['id'], round(p['bytes'] / 1e6, 1)) for p in out['packs']])
