import numpy as np, sys, matplotlib
matplotlib.use('Agg'); import matplotlib.pyplot as plt
from skeleton import *
def rx(a):c,s_=np.cos(a),np.sin(a);return np.array([[1,0,0],[0,c,-s_],[0,s_,c]])
def ry(a):c,s_=np.cos(a),np.sin(a);return np.array([[c,0,s_],[0,1,0],[-s_,0,c]])
def rz(a):c,s_=np.cos(a),np.sin(a);return np.array([[c,-s_,0],[s_,c,0],[0,0,1]])
def euler(x,y,z):return ry(np.radians(y))@rx(np.radians(x))@rz(np.radians(z))
def skin_mats(pose,root=(0,0,0)):
    nb=len(BONES);W=[None]*nb;M=[None]*nb
    for i in range(nb):
        p=PARENT[i];h=np.array(HEAD[i])
        loc=np.eye(4);loc[:3,:3]=pose.get(NAMES[i],np.eye(3)) if not isinstance(pose.get(NAMES[i]),tuple) else euler(*pose[NAMES[i]])
        if p<0: loc[:3,3]=h+np.array(root)
        else: loc[:3,3]=h-np.array(HEAD[p])
        W[i]=loc if p<0 else W[p]@loc
        B=np.eye(4);B[:3,3]=h
        M[i]=W[i]@np.linalg.inv(B)
    return np.array(M)
def apply(M,P,SI,SW):
    Pv=np.c_[P,np.ones(len(P))];out=np.zeros_like(P)
    for k in range(4):
        out+=SW[:,[k]]*np.einsum('nij,nj->ni',M[SI[:,k]],Pv)[:,:3]
    return out

TESTS=[
 {'uarm_R':(-90,0,0)},{'uarm_R':(-90,0,0),'farm_R':(-120,0,0)},{'uarm_L':(0,0,90)},{'uarm_R':(0,0,-90)},{'uarm_L':(-150,0,0)},
 {'thigh_L':(-80,0,0),'shin_L':(100,0,0)},{'thigh_R':(40,0,0)},{'thigh_L':(0,0,50)},
 {'spine':(35,0,0),'chest':(20,0,0)},{'spine':(0,30,0),'chest':(0,30,0),'head':(0,-40,0)},{'head':(30,0,0),'neck':(15,0,0)},
 {'hand_R':(-50,0,0),'farm_R':(-90,0,0)},{'foot_L':(-30,0,0),'toe_L':(30,0,0)},
]
def score(P,e,SI,SW,thr=1.5):
    tot=0
    L0=np.linalg.norm(P[e[:,0]]-P[e[:,1]],axis=1)
    for pose in TESTS:
        O=apply(skin_mats(pose),P,SI,SW);L=np.linalg.norm(O[e[:,0]]-O[e[:,1]],axis=1)
        tot+=int(((L>L0*thr)&(L>0.02)).sum())
    return tot
