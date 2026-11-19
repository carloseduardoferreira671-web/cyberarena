import numpy as np
V=lambda *a: np.array(a,float)
SIDE=['Left','Right']
# hierarquia Mixamo
PARENT={'Hips':None,'Spine':'Hips','Spine1':'Spine','Spine2':'Spine1','Neck':'Spine2','Head':'Neck'}
for s in SIDE:
    PARENT[s+'Shoulder']='Spine2'; PARENT[s+'Arm']=s+'Shoulder'; PARENT[s+'ForeArm']=s+'Arm'; PARENT[s+'Hand']=s+'ForeArm'
    for f in ['Thumb','Index','Middle','Ring','Pinky']:
        PARENT[f'{s}Hand{f}1']=s+'Hand'; PARENT[f'{s}Hand{f}2']=f'{s}Hand{f}1'; PARENT[f'{s}Hand{f}3']=f'{s}Hand{f}2'
    PARENT[s+'UpLeg']='Hips'; PARENT[s+'Leg']=s+'UpLeg'; PARENT[s+'Foot']=s+'Leg'; PARENT[s+'ToeBase']=s+'Foot'
FINGERS=['Thumb','Index','Middle','Ring','Pinky']
def unit(v): v=np.asarray(v,float); return v/ (np.linalg.norm(v)+1e-12)
def mirror(p,cx): return V(2*cx-p[0],p[1],p[2])

def hand_fingers(W,D,N,L,Wd,side_sign,curl=0.0,spread=0.12,thumb_dir=None):
    """gera os 15 ossos dos dedos de uma mão.
    W punho; D direção dos dedos (mão aberta); N normal da palma; L comprimento punho→ponta do dedo médio;
    Wd largura da mão; side_sign +1 se o polegar fica em +S.  curl 0=aberta, 1=punho fechado (dobra para a palma)."""
    D=unit(D); N=unit(N-np.dot(N,D)*D); S=np.cross(N,D)   # S: lateral (do mindinho para o polegar?)
    S=unit(S)*side_sign
    out={}; ends={}
    # offsets laterais (do polegar para o mindinho = -S)
    offs={'Index':0.30,'Middle':0.10,'Ring':-0.10,'Pinky':-0.30}
    flen={'Index':0.88,'Middle':1.0,'Ring':0.93,'Pinky':0.76}
    for f,o in offs.items():
        base=W+D*(0.46*L)+S*(o*Wd)
        fl=0.54*L*flen[f]
        dirf=unit(D+S*(o*spread*-2.0))  # leve leque
        segs=[0.46*fl,0.31*fl,0.23*fl]
        p=base.copy(); out[f]=[]; d=dirf
        for k,sl in enumerate(segs):
            out[f].append(p.copy())
            ang=curl*[1.15,1.35,1.0][k]
            # dobra em direção à palma (-N)
            d=unit(d*np.cos(ang)-N*np.sin(ang)) if k>0 else unit(d*np.cos(curl*0.9)-N*np.sin(curl*0.9))
            p=p+d*sl
        ends[f]=p.copy()
    # polegar: nasce perto do punho, no lado S
    tb=W+D*(0.20*L)+S*(0.42*Wd)-N*0.0
    td=unit(D*0.65+S*0.55+(-N)*0.1) if thumb_dir is None else unit(thumb_dir)
    tl=0.36*L; segs=[0.42*tl,0.33*tl,0.25*tl]; p=tb.copy(); out['Thumb']=[]; d=td
    for k,sl in enumerate(segs):
        out['Thumb'].append(p.copy())
        ang=curl*0.8
        d=unit(d*np.cos(ang)-N*np.sin(ang)); p=p+d*sl
    ends['Thumb']=p.copy()
    return out,ends

def build(spec):
    """spec: dict com 'cx' e pontos do lado esquerdo (x>cx) + mãos; devolve pos (nome->xyz) e ends"""
    cx=spec['cx']; P={}; E={}
    for k in ['Hips','Spine','Spine1','Spine2','Neck','Head']: P[k]=V(*spec[k])
    E['HeadTop']=V(*spec['HeadTop'])
    sides={'Left':lambda p:V(*p),'Right':lambda p:mirror(p,cx)}
    for s,fn in sides.items():
        sp=spec.get(s+'_override',{})
        for k in ['Shoulder','Arm','ForeArm','Hand','UpLeg','Leg','Foot','ToeBase']:
            src=spec[k]
            if s+k in sp: P[s+k]=V(*sp[s+k])
            else: P[s+k]=fn(src)
        E[s+'ToeEnd']=fn(spec['ToeEnd'])
        h=spec['hand']
        W=P[s+'Hand']
        D=h['D']; N=h['N']
        if s=='Right':
            D=V(-D[0],D[1],D[2]); N=V(-N[0],N[1],N[2])  # espelha em torno do plano x
        fs,es=hand_fingers(W,V(*D),V(*N),h['L'],h['W'],h.get('side',1)*(1 if s=='Left' else -1)*(-1 if False else 1),h.get('curl',0.0),h.get('spread',0.12),None)
        for f in FINGERS:
            for i,pp in enumerate(fs[f]): P[f'{s}Hand{f}{i+1}']=pp
            E[f'{s}Hand{f}End']=es[f]
    return P,E
