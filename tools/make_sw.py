#!/usr/bin/env python3
"""Gera sw.js (service worker) com a lista de arquivos do jogo para funcionar sem internet (modo offline).
Rode na pasta do jogo:  python3 tools/make_sw.py   (de novo a cada atualização, para trocar a versão)"""
import os, sys, hashlib, json
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'server', 'node_modules', 'db', 'api', 'netlify', 'online-server', 'tools', 'site', '.git', 'android'}
SKIP_EXT = {'.md', '.sh', '.txt', '.ts', '.toml', '.yaml', '.json'}
KEEP_JSON = {'manifest.webmanifest', 'packs.json'}
files = []
for d, ds, fs in os.walk(root):
    rel = os.path.relpath(d, root)
    ds[:] = [x for x in ds if not (rel == '.' and x in SKIP_DIRS)]
    for f in fs:
        p = os.path.join(rel, f) if rel != '.' else f
        p = p.replace(os.sep, '/')
        if (p.endswith('.glb') or p.startswith('mundo/models/')) and not p.endswith('chest_boxes.glb'): continue
        if p == 'sw.js': continue   # modelos pesados: ficam nos pacotes (Cache API)
        ext = os.path.splitext(f)[1].lower()
        if ext in SKIP_EXT and f not in KEEP_JSON and not (ext == '.json' and p.startswith(('mundo/', 'assests/', 'data/', 'cyber_viewer/'))): continue
        if f.endswith('.zip') or f.endswith('.mjs') and 'server' in p: continue
        files.append(p)
files.sort()
h = hashlib.sha1()
for p in files:
    h.update(p.encode()); h.update(str(os.path.getsize(os.path.join(root, p))).encode())
    h.update(open(os.path.join(root, p), 'rb').read()) if os.path.getsize(os.path.join(root, p)) < 400000 else None
ver = h.hexdigest()[:10]
js = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sw_template.js')).read()
js = js.replace('__VERSION__', ver).replace('__FILES__', json.dumps(files, ensure_ascii=False))
open(os.path.join(root, 'sw.js'), 'w').write(js)
print('sw.js:', len(files), 'arquivos · versão', ver)
