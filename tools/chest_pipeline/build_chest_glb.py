#!/usr/bin/env python3
"""CyberArena · pipeline das caixas 3D.
Entrada : photo-model-660c4d.glb (3 caixas num só mesh, EXT_meshopt_compression)
Saída   : mundo/models/chest_boxes.glb  (mini / cyber / mecha, cada uma com tampa, corpo, interior, núcleo e fenda)
Uso     : python3 build_chest_glb.py ENTRADA.glb SAIDA.glb      (precisa de numpy, scipy, pillow)
"""
import sys, os, json, struct, io, math
import numpy as np
from PIL import Image
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'rig_pipeline'))
import meshopt

SRC = sys.argv[1] if len(sys.argv) > 1 else 'photo-model-660c4d.glb'
DST = sys.argv[2] if len(sys.argv) > 2 else 'chest_boxes.glb'
SCALE = 4.5                      # mini ≈ 1.04 de altura
CUT = {'mini': .70, 'cyber': .70, 'mecha': .68}   # fração da altura onde a tampa é cortada
TEX = 1024

# ---------- 1) decodifica o GLB original ----------
d = open(SRC, 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]; J = json.loads(d[20:20 + jl]); o = 20 + jl
bl = struct.unpack('<I', d[o:o + 4])[0]; BIN = d[o + 8:o + 8 + bl]; BV = J['bufferViews']
def mo(i):
    e = BV[i]['extensions']['EXT_meshopt_compression']; return e, BIN[e['byteOffset']:e['byteOffset'] + e['byteLength']]
e, b = mo(3); pos = meshopt.exp_filter(meshopt.decode_vertex(b, e['count'], e['byteStride']), e['count'], e['byteStride']).reshape(-1, 3).astype(np.float64)
e, b = mo(4); nrm = np.array(meshopt.decode_vertex(b, e['count'], e['byteStride']), dtype=np.uint8).view(np.int8).reshape(-1, 4)[:, :3].astype(np.float64) / 127
e, b = mo(5); uv = meshopt.exp_filter(meshopt.decode_vertex(b, e['count'], e['byteStride']), e['count'], e['byteStride']).reshape(-1, 2).astype(np.float64)
e, b = mo(6); idx = meshopt.decode_index(b, e['count']).reshape(-1, 3).astype(np.int64)
nrm /= np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-9
def img(i): v = BV[i]; return Image.open(io.BytesIO(BIN[v['byteOffset']:v['byteOffset'] + v['byteLength']]))

# ---------- 2) separa as 3 caixas (ilhas conectadas) ----------
q = np.round(pos * 1e5).astype(np.int64); _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.ravel()
ed = np.concatenate([idx[:, [0, 1]], idx[:, [1, 2]]]); a, bb = inv[ed[:, 0]], inv[ed[:, 1]]
nc, lab = connected_components(coo_matrix((np.ones(len(a)), (a, bb)), shape=(inv.max() + 1,) * 2), directed=False); vl = lab[inv]
assert nc == 3, nc
order = sorted(range(3), key=lambda c: -pos[vl == c][:, 2].mean())   # menor→maior ao longo de Z
comp = dict(zip(['mini', 'cyber', 'mecha'], order))

# ---------- 3) helpers de geometria ----------
class Mesh:
    def __init__(s): s.v = []; s.i = []
    def tri(s, p0, p1, p2, hint=None, uv0=(0, 0)):
        p0, p1, p2 = map(np.asarray, (p0, p1, p2)); n = np.cross(p1 - p0, p2 - p0); L = np.linalg.norm(n)
        if L < 1e-12: return
        n /= L
        if hint is not None and np.dot(n, hint) < 0: p1, p2 = p2, p1; n = -n
        k = len(s.v)
        for p in (p0, p1, p2): s.v.append([*p, *n, *uv0])
        s.i += [k, k + 1, k + 2]
    def arrays(s):
        v = np.array(s.v, np.float32).reshape(-1, 8); return v[:, :3], v[:, 3:6], v[:, 6:8], np.array(s.i, np.uint32)

def clip_mesh(V, T, yc):
    """V: (n,8) [pos, nrm, uv]; separa triângulos em acima/abaixo de yc. Retorna (V_up,T_up),(V_dn,T_dn),pontos_de_corte"""
    d_ = V[T][:, :, 1] - yc; up_idx = []; dn_idx = []; extra_up = []; extra_dn = []; cutpts = []
    nv = len(V)
    def lerp(p, q_, t):
        r = p + (q_ - p) * t; n = r[3:6]; r[3:6] = n / (np.linalg.norm(n) + 1e-9); return r
    def clip(poly, dv, keep_up):
        out = []
        for k in range(len(poly)):
            p, q_ = poly[k], poly[(k + 1) % len(poly)]; dp, dq = dv[k], dv[(k + 1) % len(poly)]
            ip, iq = (dp >= 0) == keep_up, (dq >= 0) == keep_up
            if ip and iq: out.append(q_)
            elif ip and not iq: t = dp / (dp - dq); r = lerp(p, q_, t); r[1] = yc; out.append(r)
            elif (not ip) and iq: t = dp / (dp - dq); r = lerp(p, q_, t); r[1] = yc; out += [r, q_]
        return out
    for t, dv in zip(T, d_):
        if (dv >= 0).all(): up_idx.append(t)
        elif (dv < 0).all(): dn_idx.append(t)
        else:
            poly = [V[t[0]], V[t[1]], V[t[2]]]
            for keep, lst in ((True, extra_up), (False, extra_dn)):
                pl = clip(poly, list(dv), keep)
                for k in range(1, len(pl) - 1): lst.append((pl[0], pl[k], pl[k + 1]))
            for k in range(3):
                p, q_ = poly[k], poly[(k + 1) % 3]; dp, dq = dv[k], dv[(k + 1) % 3]
                if (dp >= 0) != (dq >= 0): r = lerp(p, q_, dp / (dp - dq)); cutpts.append((r[0], r[2]))
    def build(keep_idx, extra):
        parts = [V[np.array(keep_idx).reshape(-1, 3)].reshape(-1, 8)] if len(keep_idx) else []
        if extra: parts.append(np.array([x for tri in extra for x in tri]))
        verts = np.concatenate(parts)
        verts_u, ii = np.unique(np.round(verts, 6), axis=0, return_inverse=True)
        return verts_u.astype(np.float32), ii.ravel().reshape(-1, 3).astype(np.uint32)
    return build(up_idx, extra_up), build(dn_idx, extra_dn), np.array(cutpts)

def ring(c, ang_pts, s, y):
    return [np.array([c[0] + (p[0] - c[0]) * s, y, c[1] + (p[1] - c[1]) * s]) for p in ang_pts]

# ---------- 4) monta cada caixa ----------
RY = np.array([[0, 0, -1], [0, 1, 0], [1, 0, 0]], float)   # +X antigo → +Z (a face com o emblema olha para a câmera)
boxes = {}
for name, c in comp.items():
    vm = np.where(vl == c)[0]; remap = -np.ones(len(pos), np.int64); remap[vm] = np.arange(len(vm))
    P = pos[vm].copy(); N = nrm[vm].copy(); U = uv[vm]
    tsel = idx[vl[idx[:, 0]] == c]; T = remap[tsel]
    mn, mx = P.min(0), P.max(0); ctr = np.array([(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2])
    P = (P - ctr) @ RY.T * SCALE; N = N @ RY.T
    V = np.hstack([P, N, U]); H = P[:, 1].max(); yc = H * CUT[name] + 1e-5
    (Vu, Tu), (Vd, Td), cut = clip_mesh(V, T, yc)
    cen = cut.mean(0); ang = np.arctan2(cut[:, 1] - cen[1], cut[:, 0] - cen[0])
    cut = cut[np.argsort(ang)]; _, keep = np.unique(np.round(cut, 5), axis=0, return_index=True); cut = cut[np.sort(keep)]
    cen = cut.mean(0); n = len(cut)
    hlid = H - yc; hbody = yc; depth = hbody * .55
    UP, DN = np.array([0, 1., 0]), np.array([0, -1., 0])
    # interior da tampa
    lid_in = Mesh(); lid_core = Mesh(); body_in = Mesh(); body_core = Mesh(); seam = Mesh()
    r1 = ring(cen, cut, 1.0, yc); r2 = ring(cen, cut, .84, yc); r3 = ring(cen, cut, .80, yc + hlid * .10); r4 = ring(cen, cut, .60, yc + hlid * .10)
    cc = lambda y: np.array([cen[0], y, cen[1]])
    for k in range(n):
        j = (k + 1) % n
        lid_in.tri(r1[k], r1[j], r2[j], DN); lid_in.tri(r1[k], r2[j], r2[k], DN)       # aro plano
        lid_in.tri(r2[k], r2[j], r3[j], DN); lid_in.tri(r2[k], r3[j], r3[k], DN)       # rebaixo
        lid_in.tri(cc(yc + hlid * .10), r3[j], r3[k], DN); 
        lid_core.tri(cc(yc + hlid * .105), ring(cen, cut, .55, yc + hlid * .105)[j], ring(cen, cut, .55, yc + hlid * .105)[k], DN)
    # interior do corpo (aro + poço + núcleo no fundo)
    b2 = ring(cen, cut, .86, yc); b3 = ring(cen, cut, .80, yc - depth); b4 = ring(cen, cut, .62, yc - depth + hbody * .004)
    for k in range(n):
        j = (k + 1) % n
        body_in.tri(r1[k], r1[j], b2[j], UP); body_in.tri(r1[k], b2[j], b2[k], UP)
        mid = (b2[k] + b3[j]) / 2; inward = cc(mid[1]) - mid
        body_in.tri(b2[k], b2[j], b3[j], inward); body_in.tri(b2[k], b3[j], b3[k], inward)
        body_in.tri(cc(yc - depth), b3[k], b3[j], UP)
        body_core.tri(cc(yc - depth + hbody * .006), b4[k], b4[j], UP)
    # fenda luminosa (faixa em volta do corte)
    ro = [np.array([p[0] + (p[0] - cen[0]) / (np.linalg.norm(p - cen) + 1e-9) * .004, 0, p[2] + (p[2] - cen[1]) / (np.linalg.norm(p - cen) + 1e-9) * 0]) for p in []]
    so = ring(cen, cut, 1.0, 0)
    for k in range(n):
        j = (k + 1) % n
        def off(p, dy): 
            v = np.array([p[0] - cen[0], 0, p[2] - cen[1]]); v /= (np.linalg.norm(v) + 1e-9); return p + v * .006 + np.array([0, dy, 0])
        a0, a1 = off(so[k], yc - .012 * H), off(so[j], yc - .012 * H); b0, b1 = off(so[k], yc + .012 * H), off(so[j], yc + .012 * H)
        out = np.array([a0[0] - cen[0], 0, a0[2] - cen[1]])
        seam.tri(a0, a1, b1, out); seam.tri(a0, b1, b0, out)
    boxes[name] = dict(Vu=Vu, Tu=Tu, Vd=Vd, Td=Td, lid_in=lid_in, lid_core=lid_core, body_in=body_in, body_core=body_core, seam=seam,
        H=float(H), yc=float(yc), W=float(P[:, 0].max() - P[:, 0].min()), D=float(P[:, 2].max() - P[:, 2].min()), cen=[float(cen[0]), float(cen[1])],
        cut=cut.tolist())
    print(name, 'H=%.3f yc=%.3f W=%.3f D=%.3f cut pts=%d lid tris=%d body tris=%d' % (H, yc, boxes[name]['W'], boxes[name]['D'], n, len(Tu), len(Td)))

# ---------- 5) texturas ----------
col = img(0).convert('RGB').resize((TEX, TEX), Image.LANCZOS); orm = img(1).convert('RGB').resize((TEX, TEX), Image.LANCZOS); nm = img(2).convert('RGB').resize((TEX, TEX), Image.LANCZOS)
c = np.asarray(col, np.float32) / 255; ss = lambda x, a, b: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
mask = ss(c[..., 1], .50, .78) * ss(c[..., 2], .55, .85) * (1 - ss(c[..., 0], .45, .75))
luma = c @ np.array([.3, .5, .2], np.float32)          # cinza: a cor final vem do jogo (raridade)
g8 = (np.clip(mask * (.45 + .75 * luma), 0, 1) * 255).astype(np.uint8)
em = Image.fromarray(np.stack([g8] * 3, -1))
def jpg(im, q): b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True); return b.getvalue()
IMGS = [jpg(col, 88), jpg(orm, 86), jpg(nm, 92), jpg(em, 86)]
em.save(os.path.join(HERE, 'emissive_preview.jpg'))

# ---------- 6) escreve o GLB ----------
bin_ = bytearray(); bviews = []; accs = []; meshes = []; nodes = []; materials = []
def push(data, target=None):
    while len(bin_) % 4: bin_.append(0)
    o_ = len(bin_); bin_.extend(data); bv = dict(buffer=0, byteOffset=o_, byteLength=len(data))
    if target: bv['target'] = target
    bviews.append(bv); return len(bviews) - 1
def acc(arr, typ, comp_, target):
    v = push(arr.tobytes(), target); a_ = dict(bufferView=v, componentType=comp_, count=len(arr), type=typ)
    if typ == 'VEC3' and comp_ == 5126 and target == 34962 and arr.shape[1] == 3: a_['min'] = arr.min(0).tolist(); a_['max'] = arr.max(0).tolist()
    accs.append(a_); return len(accs) - 1
img_views = [push(b_) for b_ in IMGS]
images = [dict(bufferView=v, mimeType='image/jpeg', name=n_) for v, n_ in zip(img_views, ['color', 'orm', 'normal', 'emissive'])]
textures = [dict(source=i) for i in range(4)]
materials = [
    dict(name='shell', pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicRoughnessTexture=dict(index=1), metallicFactor=1, roughnessFactor=1),
         normalTexture=dict(index=2), emissiveTexture=dict(index=3), emissiveFactor=[1, 1, 1]),
    dict(name='inner', pbrMetallicRoughness=dict(baseColorFactor=[.05, .07, .10, 1], metallicFactor=.9, roughnessFactor=.38), emissiveFactor=[0, .06, .1], doubleSided=True),
    dict(name='core', pbrMetallicRoughness=dict(baseColorFactor=[0, 0, 0, 1], metallicFactor=0, roughnessFactor=1), emissiveFactor=[1, 1, 1], doubleSided=True),
    dict(name='seam', pbrMetallicRoughness=dict(baseColorFactor=[0, 0, 0, 1], metallicFactor=0, roughnessFactor=1), emissiveFactor=[1, 1, 1]),
]
MAT = {m_['name']: i for i, m_ in enumerate(materials)}
def prim(Vp, Tp, mat):
    Vp = np.asarray(Vp, np.float32)
    return dict(attributes=dict(POSITION=acc(np.ascontiguousarray(Vp[:, 0:3]), 'VEC3', 5126, 34962), NORMAL=acc(np.ascontiguousarray(Vp[:, 3:6]), 'VEC3', 5126, 34962),
                                TEXCOORD_0=acc(np.ascontiguousarray(Vp[:, 6:8]), 'VEC2', 5126, 34962)), indices=acc(np.asarray(Tp, np.uint16).reshape(-1), 'SCALAR', 5123, 34963), material=MAT[mat])
def mesh_of(M):
    if not M.v: return None
    p, nn, u, ii = M.arrays(); return np.hstack([p, nn, u]), ii.reshape(-1, 3)
def add_mesh(name, parts):
    prims = []
    for Vp, Tp, mat in parts:
        if Vp is None or len(Tp) == 0: continue
        prims.append(prim(Vp, Tp, mat))
    meshes.append(dict(name=name, primitives=prims)); return len(meshes) - 1
roots = []
for name, B in boxes.items():
    kids = []
    def N_(nm_, mesh_idx, extras=None):
        nd = dict(name=nm_, mesh=mesh_idx); 
        if extras: nd['extras'] = extras
        nodes.append(nd); return len(nodes) - 1
    def mm(M): 
        r = mesh_of(M); return (None, [], None) if r is None else (r[0], r[1], None)
    li, lc, bi, bc, sm = (mesh_of(B[k]) for k in ('lid_in', 'lid_core', 'body_in', 'body_core', 'seam'))
    lid = add_mesh(name + '_lid', [(B['Vu'], B['Tu'], 'shell'), (li[0], li[1], 'inner'), (lc[0], lc[1], 'core')])
    body = add_mesh(name + '_body', [(B['Vd'], B['Td'], 'shell'), (bi[0], bi[1], 'inner'), (bc[0], bc[1], 'core')])
    seam_m = add_mesh(name + '_seam', [(sm[0], sm[1], 'seam')])
    kids = [N_(name + '_body', body), N_(name + '_lid', lid), N_(name + '_seam', seam_m)]
    nodes.append(dict(name=name, children=kids, extras=dict(height=B['H'], cutY=B['yc'], width=B['W'], depth=B['D'], center=B['cen'], outline=[[round(x, 4), round(z, 4)] for x, z in B['cut'][::max(1, len(B['cut']) // 96)]])))
    roots.append(len(nodes) - 1)
G = dict(asset=dict(version='2.0', generator='CyberArena chest pipeline'), scene=0, scenes=[dict(nodes=roots)], nodes=nodes, meshes=meshes, materials=materials,
         accessors=accs, bufferViews=bviews, buffers=[dict(byteLength=len(bin_))], images=images, textures=textures)
js = json.dumps(G, separators=(',', ':')).encode(); js += b' ' * ((4 - len(js) % 4) % 4)
while len(bin_) % 4: bin_.append(0)
out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
open(DST, 'wb').write(out); print('OK', DST, round(len(out) / 1e6, 2), 'MB')
