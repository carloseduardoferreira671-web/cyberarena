import numpy as np, scipy.sparse as sp
import tune as T, posetest_lib as pl
from skeleton import *
P,e,n=T.P,T.e,T.n
s=np.load('skin_best.npz');SI,SW=s['SI'],s['SW'];nb=len(BONES)
W0=np.zeros((n,nb),np.float32)
for k in range(4):W0[np.arange(n),SI[:,k]]+=SW[:,k]
A=sp.coo_matrix((np.ones(len(e)),(e[:,0],e[:,1])),shape=(n,n)).tocsr();A=A+A.T
deg=np.asarray(A.sum(1)).ravel();Dinv=sp.diags(1/deg);S=Dinv@A
print('comprimento médio de aresta: %.4f'%np.linalg.norm(P[e[:,0]]-P[e[:,1]],axis=1).mean())
def smooth(W,it,alpha=.6):
    for _ in range(it):W=(1-alpha)*W+alpha*(S@W)
    return W
def top4(W):
    t=np.argsort(-W,1)[:,:4];SI=t.astype(np.uint8);SW=np.take_along_axis(W,t,1).astype(np.float32);SW/=SW.sum(1,keepdims=True);return SI,SW
if __name__=='__main__':
    for it in (0,4,8,16,32):
        SIs,SWs=top4(smooth(W0,it));print(f'iterações={it}: arestas esticadas={pl.score(P,e,SIs,SWs)}',flush=True)
        np.savez(f'skin_s{it}.npz',SI=SIs,SW=SWs)
