import numpy as np, scipy.sparse as sp, itertools, pickle
from scipy.sparse.csgraph import dijkstra
from skeleton import *
import posetest_lib as pl
d=np.load('mesh_raw.npz');P=d['P'];pos_idx=d['pos_idx'];idx=d['idx'];n=len(P)
tri=pos_idx[idx].reshape(-1,3)
e=np.vstack([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]);e=np.unique(np.sort(e,1),axis=0)
w=np.linalg.norm(P[e[:,0]]-P[e[:,1]],axis=1)+1e-9
G=sp.coo_matrix((w,(e[:,0],e[:,1])),shape=(n,n)).tocsr();G=G+G.T
def seg_dist(P,a,b):
    a=np.array(a);b=np.array(b);ab=b-a;t=np.clip(((P-a)@ab)/(ab@ab),0,1)
    return np.linalg.norm(P-(a+t[:,None]*ab),axis=1)
def compute(radscale):
    nb=len(BONES);E=np.zeros((nb,n));D=np.zeros((nb,n))
    for b in range(nb):
        E[b]=seg_dist(P,HEAD[b],TAIL[b]);seeds=np.where(E[b]<RAD[b]*radscale)[0]
        if len(seeds)<10: seeds=np.argsort(E[b])[:30]
        D[b]=dijkstra(G,directed=False,indices=seeds,min_only=True)
    D[~np.isfinite(D)]=10;return E,D
def weights(E,D,lam,sig):
    C=D+lam*E;W=np.exp(-(C-C.min(0))/sig);top=np.argsort(-W,0)[:4]
    SI=np.zeros((n,4),np.uint8);SW=np.zeros((n,4),np.float32)
    for k in range(4):SI[:,k]=top[k];SW[:,k]=W[top[k],np.arange(n)]
    SW/=SW.sum(1,keepdims=True);return SI,SW
if __name__=='__main__':
    res=[]
    for rs in (0.7,1.0):
        E,D=compute(rs)
        for lam,sig in itertools.product((0.2,0.6,1.2),(0.008,0.015,0.03)):
            SI,SW=weights(E,D,lam,sig);sc=pl.score(P,e,SI,SW)
            res.append((sc,rs,lam,sig));print(f'rad×{rs} λ={lam} σ={sig}: arestas esticadas={sc}',flush=True)
    best=min(res);print('MELHOR',best)
    pickle.dump(best,open('best.pkl','wb'))
