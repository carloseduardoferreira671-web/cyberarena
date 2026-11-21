#!/usr/bin/env python3
"""Confere se todos os arquivos do packs.json existem e têm o tamanho certo (pega arquivo cortado ANTES de subir).
Rode na pasta do jogo:  python3 tools/verificar_pacotes.py"""
import os, json, sys
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def walk(o):
    if isinstance(o, dict):
        if 'path' in o and 'bytes' in o: yield o
        for v in o.values(): yield from walk(v)
    elif isinstance(o, list):
        for v in o: yield from walk(v)
bad = 0; n = 0
for e in walk(json.load(open(os.path.join(root, 'mundo', 'packs.json')))):
    n += 1; f = os.path.join(root, 'mundo', e['path'])
    s = os.path.getsize(f) if os.path.exists(f) else None
    if s != e['bytes']:
        bad += 1; print('ERRO', e['path'], 'esperado', e['bytes'], 'encontrado', s)
print(n, 'arquivos conferidos,', bad, 'com problema')
sys.exit(1 if bad else 0)
