"""Gerador procedural de animações para o esqueleto Mixamo-like (ossos com orientação de mundo no repouso).
Convenções: +Z frente, +Y cima, +X esquerda do personagem. Ângulos em graus. Euler 'YXZ' (giro, arfar, rolar).
rx<0 braço/perna para frente; rx>0 joelho dobra, tronco inclina para frente; rz>0 abre braço/perna esquerda."""
import numpy as np
from scipy.spatial.transform import Rotation as R
D2R=np.pi/180
# nomes curtos -> osso
SHORT={'hips':'Hips','sp':'Spine','sp1':'Spine1','sp2':'Spine2','nk':'Neck','hd':'Head','lsh':'LeftShoulder','rsh':'RightShoulder',
 'la':'LeftArm','ra':'RightArm','lfa':'LeftForeArm','rfa':'RightForeArm','lhd':'LeftHand','rhd':'RightHand',
 'lul':'LeftUpLeg','rul':'RightUpLeg','lleg':'LeftLeg','rleg':'RightLeg','lft':'LeftFoot','rft':'RightFoot','ltoe':'LeftToeBase','rtoe':'RightToeBase'}
ROT_KEYS=list(SHORT.keys()); EXTRA=['hpos','lcurl','rcurl','lthumb','rthumb','lspread','rspread']
MIRROR={'l':'r','r':'l'}
def mir_pose(p):
    q={}
    for k,v in p.items():
        if k=='hpos': q[k]=(-v[0],v[1],v[2]); continue
        if k in('lcurl','rcurl','lthumb','rthumb','lspread','rspread'):
            q[{'l':'r','r':'l'}[k[0]]+k[1:]]=v; continue
        k2=k
        if k[0]=='l': k2='r'+k[1:]
        elif k[0]=='r' and k not in('rx',): k2='l'+k[1:]
        if k in('hips','sp','sp1','sp2','nk','hd'): k2=k
        q[k2]=(v[0],-v[1],-v[2])
    return q
def pose_vec(p):
    v=np.zeros(len(ROT_KEYS)*3+3+6)
    for i,k in enumerate(ROT_KEYS):
        if k in p: v[i*3:i*3+3]=p[k]
    n=len(ROT_KEYS)*3
    if 'hpos' in p: v[n:n+3]=p['hpos']
    for j,k in enumerate(['lcurl','rcurl','lthumb','rthumb','lspread','rspread']):
        if k in p: v[n+3+j]=p[k]
    return v
def ease(u,kind='smooth'):
    u=np.clip(u,0,1)
    if kind=='smooth': return u*u*(3-2*u)
    if kind=='in': return u*u
    if kind=='out': return 1-(1-u)**2
    return u
def sample_keys(keys,t,loop,dur,kinds=None):
    """keys: lista (t,pose_vec) ordenada"""
    ts=[k[0] for k in keys]
    if loop:
        t=t%dur
        if t<ts[0]: a=keys[-1]; b=keys[0]; ta=a[0]-dur; tb=b[0]
        elif t>=ts[-1]: a=keys[-1]; b=keys[0]; ta=a[0]; tb=b[0]+dur
        else:
            i=np.searchsorted(ts,t,side='right')-1; a=keys[i]; b=keys[i+1]; ta=a[0]; tb=b[0]
    else:
        if t<=ts[0]: return keys[0][1]
        if t>=ts[-1]: return keys[-1][1]
        i=np.searchsorted(ts,t,side='right')-1; a=keys[i]; b=keys[i+1]; ta=a[0]; tb=b[0]
    u=(t-ta)/max(1e-6,tb-ta)
    kind=(b[2] if len(b)>2 else 'smooth')
    return a[1]+(b[1]-a[1])*ease(u,kind)
class Skel:
    def __init__(s,Pj,parent,curl_axes,hand_fingers,arm_abd,leg_abd,fist_baked=False,hip_h=0.95):
        s.Pj=Pj; s.parent=parent; s.curl=curl_axes; s.fingers=hand_fingers; s.fist=fist_baked
        s.arm_abd=arm_abd; s.leg_abd=leg_abd; s.hip_h=hip_h
        s.names=list(Pj.keys())
        s.base=s.make_base()
    def make_base(s):
        # pose neutra: braços/pernas mais perto do corpo que na pose de modelagem
        b={}
        ta=s.arm_abd['target']
        b['la']=(0,0,-(s.arm_abd['L']-ta)); b['ra']=(0,0,(s.arm_abd['R']-ta))
        b['lul']=(0,0,-(s.leg_abd['L']-3)); b['rul']=(0,0,(s.leg_abd['R']-3))
        return b
def build_clip(sk,dur,fn_or_keys,loop=False,grounded=True,fps=24,curl_rest=0.25):
    n=max(2,int(round(dur*fps))+1)
    base=pose_vec(sk.base)
    frames=[]
    for i in range(n):
        t=min(dur,i/fps)
        if callable(fn_or_keys): v=pose_vec(fn_or_keys(t/dur if loop else t))
        else: v=sample_keys(fn_or_keys,t,loop,dur)
        frames.append(v)
    V=np.array(frames)
    return V
def to_tracks(sk,V,dur,fps=24,grounded=True,curl_rest=0.25,loop=False):
    """converte parâmetros em quaterniões locais por osso e translação do quadril"""
    n=V.shape[0]; times=np.linspace(0,dur,n); base=pose_vec(sk.base)
    nr=len(ROT_KEYS)*3
    tracks={}; Q={b:np.zeros((n,4)) for b in sk.names}
    for b in sk.names: Q[b][:]=[0,0,0,1]
    for i,k in enumerate(ROT_KEYS):
        e=V[:,i*3:i*3+3]+base[i*3:i*3+3]
        rot=R.from_euler('YXZ',np.stack([e[:,1],e[:,0],e[:,2]],1),degrees=True)
        Q[SHORT[k]]=rot.as_quat()
    # dedos
    for si,(side,ck,tk,spk) in enumerate([('Left',nr+3,nr+5,nr+7),('Right',nr+4,nr+6,nr+8)]):
        curl=np.clip(V[:,ck]+curl_rest*(0.2 if sk.fist else 1.0),-0.4,1.2); th=np.clip(V[:,tk]+curl_rest,-0.4,1.2); spr=V[:,spk]
        ax=sk.curl[side]
        for f in ['Thumb','Index','Middle','Ring','Pinky']:
            for j in (1,2,3):
                nm=f'{side}Hand{f}{j}'
                amt=(th if f=='Thumb' else curl)
                k=[0.55,0.9,0.7][j-1] if f!='Thumb' else [0.35,0.7,0.6][j-1]
                ang=amt*k*80*(0.35 if sk.fist else 1.0)
                ax_=ax if f!='Thumb' else sk.curl[side+'Thumb']
                Q[nm]=R.from_rotvec(np.outer(ang*D2R,ax_)).as_quat()
    # translação do quadril
    hp=V[:,nr:nr+3].copy()
    if grounded:
        P=sk.Pj; lift=np.zeros(n)
        # FK das pernas
        Rh=R.from_quat(Q['Hips'])
        pts=[]
        for side in ('Left','Right'):
            q=Rh
            p_up=P['Hips']+Rh.apply(P[side+'UpLeg']-P['Hips'])
            q=q*R.from_quat(Q[side+'UpLeg']); p_leg=p_up+q.apply(P[side+'Leg']-P[side+'UpLeg'])
            q=q*R.from_quat(Q[side+'Leg']); p_ft=p_leg+q.apply(P[side+'Foot']-P[side+'Leg'])
            q=q*R.from_quat(Q[side+'Foot']); p_toe=p_ft+q.apply(P[side+'ToeBase']-P[side+'Foot'])
            q=q*R.from_quat(Q[side+'ToeBase']); p_end=p_toe+q.apply(np.array([0,-P[side+'ToeBase'][1],0.08]))
            low=np.minimum.reduce([p_ft[:,1]-P[side+'Foot'][1],p_toe[:,1]-P[side+'ToeBase'][1],p_end[:,1]-0.0+0*p_end[:,1]])
            pts.append(low)
        low=np.minimum(pts[0],pts[1]); hp[:,1]+= -low
    out={}
    root=P['Hips'] if grounded else sk.Pj['Hips']
    for b in sk.names:
        q=Q[b]
        # sinal contínuo
        for i in range(1,n):
            if np.dot(q[i],q[i-1])<0: q[i]=-q[i]
        out[b]=q
    return times,out,hp
