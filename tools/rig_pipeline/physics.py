import sys; sys.path.insert(0,'/home/claude/rig')
import numpy as np
from PIL import Image
from common import *
def sample_color(ch,uv):
    im=np.asarray(Image.open(f'/home/claude/new/{CH[ch]}_color.jpg').convert('RGB'),np.float32)/255.
    h,w,_=im.shape; x=np.clip((uv[:,0]%1)*w-0.5,0,w-1.001); y=np.clip((uv[:,1]%1)*h-0.5,0,h-1.001)
    x0=x.astype(int); y0=y.astype(int); fx=(x-x0)[:,None]; fy=(y-y0)[:,None]
    c=(im[y0,x0]*(1-fx)*(1-fy)+im[y0,x0+1]*fx*(1-fy)+im[y0+1,x0]*(1-fx)*fy+im[y0+1,x0+1]*fx*fy)
    return c
def smoothstep(a,b,x): t=np.clip((x-a)/(b-a+1e-9),0,1); return t*t*(3-2*t)
def vertex_smooth(M,val,iters=4):
    P=M['P']; idx=M['idx']; key=np.round(P*1e5).astype(np.int64); _,inv=np.unique(key,axis=0,return_inverse=True); inv=inv.ravel(); n=inv.max()+1
    import scipy.sparse as sp
    e=np.concatenate([idx[:,[0,1]],idx[:,[1,2]],idx[:,[2,0]]]); a=inv[e[:,0]]; b=inv[e[:,1]]
    A=sp.csr_matrix((np.ones(len(a)),(a,b)),shape=(n,n)); A=A+A.T; A.data[:]=1; deg=np.maximum(np.asarray(A.sum(1)).ravel(),1)
    v=np.zeros((n,)+val.shape[1:]); cnt=np.bincount(inv,minlength=n)
    np.add.at(v,inv,val); v/=cnt.reshape((-1,)+(1,)*(val.ndim-1))
    for _ in range(iters): v=0.5*v+0.5*(A@v)/deg.reshape((-1,)+(1,)*(val.ndim-1))
    return v[inv]
def masks(ch,M,bones,w,De):
    P=M['P']; n=len(P); x,y,z=P[:,0],P[:,1],P[:,2]
    dom=np.argmax(w,1); name=np.array(bones)[dom]
    col=vertex_smooth(M,sample_color(ch,M['uv']),3)
    r,g,b=col[:,0],col[:,1],col[:,2]
    out={'dom':name}
    if ch=='nexus':
        out['scarf']=smoothstep(0.08,0.2,r-np.maximum(g,b)*1.3)*(y>1.40)
    if ch=='atlas':
        out['chain']=smoothstep(0.03,0.09,(r-b)-0.02)*(r>0.18)*(y<1.15)*(y>0.7)   # correntes cobre/marrom
        # dreads: massa atras da cabeca/costas
        back=smoothstep(-0.03,-0.10,z)            # atras do eixo
        top=smoothstep(1.52,1.58,y)*(1-smoothstep(0.02,0.07,z)*smoothstep(-0.08,0.0,0.14-np.abs(x)))  # topo da cabeça menos rosto
        hair=np.maximum(back*smoothstep(1.02,1.12,y)*(1-smoothstep(1.55,1.6,y)*0),top*smoothstep(0.0,0.08,0.2-np.abs(x)*0))
        out['hair']=np.clip(hair,0,1)
    return out
