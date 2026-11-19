import numpy as np, cv2
d=np.load('mesh_raw.npz');POS_IDX=d['pos_idx'];IDX=d['idx'];TRI=POS_IDX[IDX].reshape(-1,3)
def normals(O):
    a,b,c=O[TRI[:,0]],O[TRI[:,1]],O[TRI[:,2]];nrm=np.cross(b-a,c-a);l=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-12;return nrm/l
def render(O,yaw=0,size=520,span=1.15,cy=0.0,bg=(235,235,235),base=(150,155,165)):
    th=np.radians(yaw);c,s=np.cos(th),np.sin(th)
    X=O[:,0]*c+O[:,2]*s;Z=-O[:,0]*s+O[:,2]*c;Y=O[:,1]
    sc=size/(2*span);sx=size/2+X*sc;sy=size/2-(Y-cy)*sc
    a,b,cc=np.c_[X,Y,Z][TRI[:,0]],np.c_[X,Y,Z][TRI[:,1]],np.c_[X,Y,Z][TRI[:,2]]
    nrm=np.cross(b-a,cc-a);nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-12
    # normal aponta para o observador (+Z) quando visível; tintar por luz
    light=np.array([.35,.55,.75]);light/=np.linalg.norm(light)
    lam=np.clip(nrm@light,-1,1);vis=nrm[:,2]
    dep=(a[:,2]+b[:,2]+cc[:,2])/3;order=np.argsort(dep)
    img=np.full((size,size,3),bg,np.uint8)
    for t in order:
        i=TRI[t];pts=np.array([[sx[i[0]],sy[i[0]]],[sx[i[1]],sy[i[1]]],[sx[i[2]],sy[i[2]]]],np.int32)
        k=0.35+0.65*abs(lam[t]);col=tuple(int(v*k) for v in base)
        cv2.fillConvexPoly(img,pts,col,cv2.LINE_AA)
    return img
