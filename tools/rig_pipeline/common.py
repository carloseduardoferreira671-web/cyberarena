import numpy as np, json, os, sys
sys.path.insert(0,'/home/claude')
CH={'nexus':'752b47','cyber':'7e19a4','atlas':'3671c8'}
SC=1.8   # altura final do modelo em unidades (metros)
def load_mesh(ch):
    d=np.load(f'/home/claude/new/{CH[ch]}.npz')
    p=d['pos'].astype(np.float64); n=d['nrm'].astype(np.float64)
    # mesh original: de frente para +X, esquerda do personagem = -Z, pés em y=-0.5
    # jogo: de frente para +Z, esquerda do personagem = +X, pés em y=0
    def T(a,off=True):
        o=np.stack([-a[:,2],a[:,1]+(0.5 if off else 0),a[:,0]],1); return o
    P=T(p)*SC
    N=T(n,False)
    return dict(P=P,N=N,uv=d['uv'].astype(np.float64),idx=d['idx'].astype(np.int64))
