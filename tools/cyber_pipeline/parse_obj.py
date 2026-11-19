import numpy as np, json, sys
from collections import defaultdict
P=[];T=[];N=[];F=[]
for l in open('/home/claude/work/_obj/base.obj'):
    if l.startswith('v '): P.append(l.split()[1:4])
    elif l.startswith('vt '): T.append(l.split()[1:3])
    elif l.startswith('vn '): N.append(l.split()[1:4])
    elif l.startswith('f '):
        F.append([tuple(int(x) if x else 0 for x in t.split('/')) for t in l.split()[1:]])
P=np.array(P,float);T=np.array(T,float);N=np.array(N,float)
print('faces com lados:',sorted(set(len(f) for f in F)))
# triangulate
tris=[]
for f in F:
    for i in range(1,len(f)-1): tris.append((f[0],f[i],f[i+1]))
print('triangulos',len(tris))
# unified vertices keyed by (v,vt,vn)
key2i={};pos_idx=[];uv=[];nr=[];idx=[]
for tri in tris:
    for (v,t,n) in tri:
        k=(v,t,n)
        if k not in key2i:
            key2i[k]=len(pos_idx);pos_idx.append(v-1);uv.append(T[t-1] if t else (0,0));nr.append(N[n-1] if n else (0,1,0))
        idx.append(key2i[k])
pos_idx=np.array(pos_idx);uv=np.array(uv);nr=np.array(nr);idx=np.array(idx,np.uint32)
print('vertices unificados',len(pos_idx),'indices',len(idx))
# connected components over POSITION indices (welded by exact coordinates)
q=np.round(P,5);_,weld=np.unique(q,axis=0,return_inverse=True)
print('posicoes unicas por coordenada:',weld.max()+1,'de',len(P))
par=list(range(weld.max()+1))
def find(a):
    while par[a]!=a: par[a]=par[par[a]];a=par[a]
    return a
for i in range(0,len(idx),3):
    a,b,c=[weld[pos_idx[j]] for j in idx[i:i+3]]
    ra,rb,rc=find(a),find(b),find(c);par[rb]=ra;par[find(c)]=find(a)
comp=np.array([find(weld[p]) for p in range(len(P))])
u,cnt=np.unique(comp,return_counts=True)
order=np.argsort(-cnt)
print('componentes conectados:',len(u),' maiores:',cnt[order][:12].tolist())
np.savez('mesh_raw.npz',P=P,pos_idx=pos_idx,uv=uv,nr=nr,idx=idx,comp=comp,weld=weld)
from PIL import Image
im=Image.open('/home/claude/work/v134/character_sources/scripts/Cyber_3d.png');print('textura',im.size,im.mode)
print('uv min/max',uv.min(0),uv.max(0))
