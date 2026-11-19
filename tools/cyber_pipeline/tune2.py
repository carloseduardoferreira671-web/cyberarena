import numpy as np, itertools, collections
import tune as T, posetest_lib as pl
from skeleton import *
P,e=T.P,T.e
res=[]
for rs in (0.4,0.55,0.7):
    E,D=T.compute(rs)
    for lam,sig in itertools.product((1.2,2.5,5.0),(0.003,0.006,0.01)):
        SI,SW=T.weights(E,D,lam,sig);sc=pl.score(P,e,SI,SW);res.append((sc,rs,lam,sig))
        print(f'rad×{rs} λ={lam} σ={sig}: {sc}',flush=True)
best=min(res);print('MELHOR',best)
sc,rs,lam,sig=best
E,D=T.compute(rs);SI,SW=T.weights(E,D,lam,sig)
L0=np.linalg.norm(P[e[:,0]]-P[e[:,1]],axis=1)
for k,pose in enumerate(pl.TESTS):
    O=pl.apply(pl.skin_mats(pose),P,SI,SW);L=np.linalg.norm(O[e[:,0]]-O[e[:,1]],axis=1)
    bad=(L>L0*1.5)&(L>0.02);c=collections.Counter()
    for a,b in e[bad]:c[tuple(sorted((NAMES[SI[a,0]],NAMES[SI[b,0]])))]+=1
    print(k,list(pose.keys()),int(bad.sum()),c.most_common(3))
np.savez('skin_best.npz',SI=SI,SW=SW,params=np.array([rs,lam,sig]))
