import sys; sys.path.insert(0,'/home/claude/rig')
import numpy as np
from animlib import *
import catalog
from skeleton import *
from specs import SPECS
TARGET_ABD={'nexus':10,'cyber':14,'atlas':16}
def make_skel(ch,Pj):
    sp=SPECS[ch]; h=sp['hand']; curl={}
    for side in ('Left','Right'):
        D=unit(h['D']); N=unit(h['N'])
        if side=='Right': D=V(-D[0],D[1],D[2]); N=V(-N[0],N[1],N[2])
        N=unit(N-np.dot(N,D)*D); ax=unit(np.cross(N,D)); curl[side]=ax; curl[side+'Thumb']=ax
    abd={}; lab={}
    for s,sg in (('L',1),('R',-1)):
        side='Left' if s=='L' else 'Right'
        d=Pj[side+'ForeArm']-Pj[side+'Arm']; abd[s]=np.degrees(np.arctan2(d[0]*sg,-d[1]))
        d=Pj[side+'Foot']-Pj[side+'UpLeg']; lab[s]=np.degrees(np.arctan2(d[0]*sg,-d[1]))
    abd['target']=TARGET_ABD[ch]
    return Skel(Pj,PARENT,curl,None,abd,lab,fist_baked=(ch=='nexus'),hip_h=Pj['Hips'][1])
def add_animations(g,nid,Pj,ch,fps=24,names=None):
    sk=make_skel(ch,Pj); anims=[]
    bones=[b for b in PARENT]   # ossos animados (sem caudas)
    for name,c in catalog.CL.items():
        if names and name not in names: continue
        dur=c['dur']; n=max(2,int(round(dur*fps))+1)
        fr=[]
        for i in range(n):
            t=min(dur,i/fps)
            if 'fn' in c: fr.append(pose_vec(c['fn'](t/dur)))
            else: fr.append(sample_keys(c['keys'],t,c['loop'],dur))
        Vv=np.array(fr)
        times,Q,hp=to_tracks(sk,Vv,dur,fps,grounded=c['grounded'],loop=c['loop'])
        t32=times.astype('<f4'); ta=g.accessor(t32,5126,'SCALAR',None,True)
        samplers=[];channels=[]
        for b in bones:
            q=Q[b]
            const=np.allclose(q,q[0],atol=1e-5)
            if const:
                tt=g.accessor(np.array([0,dur],'<f4'),5126,'SCALAR',None,True); qq=g.accessor(np.array([q[0],q[0]],'<f4'),5126,'VEC4')
            else: tt=ta; qq=g.accessor(q.astype('<f4'),5126,'VEC4')
            samplers.append({'input':tt,'output':qq,'interpolation':'LINEAR'}); channels.append({'sampler':len(samplers)-1,'target':{'node':nid[b],'path':'rotation'}})
        pos=(Pj['Hips']+hp).astype('<f4')
        samplers.append({'input':ta,'output':g.accessor(pos,5126,'VEC3'),'interpolation':'LINEAR'}); channels.append({'sampler':len(samplers)-1,'target':{'node':nid['Hips'],'path':'translation'}})
        anims.append({'name':name,'samplers':samplers,'channels':channels})
    g.j['animations']=anims
