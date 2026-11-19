import sys,time; sys.path.insert(0,'/home/claude/rig')
import numpy as np, scipy.sparse as sp
from scipy.sparse.csgraph import dijkstra
from scipy import ndimage
from scipy.spatial import cKDTree
from common import *; from specs import *; from skeleton import *
H_VOX=0.0075
def subdivide(tri,thr):
    while True:
        e=np.stack([np.linalg.norm(tri[:,0]-tri[:,1],axis=1),np.linalg.norm(tri[:,1]-tri[:,2],axis=1),np.linalg.norm(tri[:,2]-tri[:,0],axis=1)],1).max(1)
        big=e>thr
        if not big.any(): return tri
        t=tri[big]; a,b,c=t[:,0],t[:,1],t[:,2]; ab=(a+b)/2; bc=(b+c)/2; ca=(c+a)/2
        new=np.concatenate([np.stack([a,ab,ca],1),np.stack([ab,b,bc],1),np.stack([ca,bc,c],1),np.stack([ab,bc,ca],1)])
        tri=np.concatenate([tri[~big],new])
def voxelize(P,idx,h):
    tri=subdivide(P[idx],h*0.9); pts=np.concatenate([tri.mean(1),tri.reshape(-1,3)])
    lo=P.min(0)-3*h; ij=np.floor((pts-lo)/h).astype(int); dims=ij.max(0)+4
    surf=np.zeros(dims,bool); surf[ij[:,0],ij[:,1],ij[:,2]]=True
    lab,n=ndimage.label(~surf); ext=np.unique(np.concatenate([lab[0].ravel(),lab[-1].ravel(),lab[:,0].ravel(),lab[:,-1].ravel(),lab[:,:,0].ravel(),lab[:,:,-1].ravel()]))
    solid=~np.isin(lab,ext[ext>0]) | surf
    return solid,lo
def segments(Pj,Ej,bones):
    seg={}
    kids={}
    for k,p in PARENT.items():
        if p: kids.setdefault(p,[]).append(k)
    for b in bones:
        a=Pj[b]
        ch=kids.get(b,[])
        if b=='Hips': t=Pj['Spine']
        elif b=='Head': t=Ej['HeadTop']
        elif b.endswith('ToeBase'): t=Ej[b[:-8]+'ToeEnd'] if False else Ej[('Left' if b.startswith('Left') else 'Right')+'ToeEnd']
        elif 'Hand' in b and b[-1] in '123' and b!='LeftHand' and b!='RightHand':
            side='Left' if b.startswith('Left') else 'Right'; f=b[len(side)+4:-1]
            t=Pj[b[:-1]+str(int(b[-1])+1)] if b[-1]!='3' else Ej[f'{side}Hand{f}End']
        elif b in('LeftHand','RightHand'):
            side=b[:-4]; t=(Pj[f'{side}HandMiddle1'])
        elif ch: t=Pj[ch[0]] if b not in('Spine2',) else Pj['Neck']
        else: t=a+V(0,0.05,0)
        seg[b]=(a,t)
    return seg
def pt_seg(Q,a,b):
    ab=b-a; l2=(ab@ab)+1e-12; t=np.clip(((Q-a)@ab)/l2,0,1); return np.linalg.norm(Q-(a+t[:,None]*ab),axis=1)
def compute_weights(ch,P,idx,Pj,Ej,bones,extra_sources=None,tau_scale=0.35):
    t0=time.time(); h=H_VOX
    solid,lo=voxelize(P,idx,h); N=solid.sum(); print('voxels',solid.shape,N,'fill',N/solid.size)
    ids=-np.ones(solid.shape,np.int64); ids[solid]=np.arange(N)
    # grafo 18-vizinhos
    rows=[];cols=[];w=[]
    offs=[(1,0,0),(0,1,0),(0,0,1),(1,1,0),(1,-1,0),(1,0,1),(1,0,-1),(0,1,1),(0,1,-1)]
    for o in offs:
        sl_a=tuple(slice(max(0,-d),solid.shape[i]-max(0,d)) for i,d in enumerate(o))
        sl_b=tuple(slice(max(0,d),solid.shape[i]-max(0,-d)) for i,d in enumerate(o))
        m=solid[sl_a]&solid[sl_b]; a=ids[sl_a][m]; b=ids[sl_b][m]
        rows+= [a,b]; cols+=[b,a]; w+=[np.full(len(a),np.linalg.norm(o)*h)]*2
    G=sp.csr_matrix((np.concatenate(w),(np.concatenate(rows),np.concatenate(cols))),shape=(N+len(bones),N+len(bones)))
    cen=(np.argwhere(solid)+0.5)*h+lo; tree=cKDTree(cen)
    seg=segments(Pj,Ej,bones)
    br=[];bc=[];bw=[]
    for bi,b in enumerate(bones):
        a,t=seg[b]; L=np.linalg.norm(t-a); n=max(2,int(L/(h*0.6)))
        pts=a+(t-a)*np.linspace(0,1,n)[:,None]
        d,j=tree.query(pts); 
        for dd,jj in zip(d,j): br.append(N+bi); bc.append(jj); bw.append(dd+1e-4)
    Gs=G.tolil() if False else None
    B=sp.csr_matrix((bw,(br,bc)),shape=G.shape)
    G=(G+B).tocsr()
    # vértices -> voxel
    dv,vj=tree.query(P)
    Dg=np.zeros((len(P),len(bones)),np.float32)
    for bi,b in enumerate(bones):
        dist=dijkstra(G,directed=True,indices=N+bi)
        Dg[:,bi]=dist[vj]
    print('dijkstra',time.time()-t0)
    De=np.stack([pt_seg(P,*seg[b]) for b in bones],1)
    bad=~np.isfinite(Dg); Dg=np.where(bad,De+1.0,Dg)
    return Dg,De,dv
def to_weights(D,tau_scale=0.35,tmin=0.012,tmax=0.06,power=2.0):
    d0=D.min(1,keepdims=True); tau=np.clip(tau_scale*d0,tmin,tmax)
    w=np.clip(1-(D-d0)/tau,0,1)**power
    return w
def top4(w):
    idx=np.argsort(-w,1)[:,:4]; ww=np.take_along_axis(w,idx,1); ww/= ww.sum(1,keepdims=True)+1e-12; return idx,ww
