import numpy as np
from animlib import *
S=np.sin; C=np.cos; pi=np.pi
def gait(A=28,K=55,arm=25,elb=25,lean=4,twist=10,sway=0.012,bounce=0,hipsr=4,foot=0.7,curl=0.3,back=False):
    def f(ph):
        th=2*pi*ph; p={}
        for side,off in (('l',0),('r',pi)):
            t=th+off; s=S(t)
            thigh=-A*s - (0 if True else 0)
            knee=K*max(0,S(t-0.5))**1.3+ (6 if S(t)<0 else 2)
            p[side+'ul']=(thigh,0,0); p[side+'leg']=(knee,0,0)
            p[side+'ft']=(-(thigh+knee)*foot+ (10 if S(t)>0.5 else 0),0,0); p[side+'toe']=(0,0,0)
            p[side+'a']=(arm*s*(1 if side=='l' else 1) ,0,0) if False else (arm*S(t),0,0)
            p[side+'fa']=(-elb-abs(arm)*0.35*max(0,-S(t)),0,0)
            p[side+'curl']=curl
        p['sp1']=(0,twist*S(th),0); p['sp2']=(0,twist*0.6*S(th),0); p['hips']=(hipsr,-twist*0.8*S(th),sway*0+3*S(th)); p['sp']=(lean,0,0)
        p['hd']=(-lean*0.5,-twist*0.4*S(th),0)
        p['hpos']=(sway*S(th),0,0)
        if back:
            for k in ('lul','rul'): p[k]=(-p[k][0],0,0)
        return p
    return f
def blend(a,b,u):
    ks=set(a)|set(b); out={}
    for k in ks:
        va=np.array(a.get(k,(0,0,0)),float); vb=np.array(b.get(k,(0,0,0)),float); out[k]=tuple(va+(vb-va)*u)
    return out
def P(**k): return k
guard=dict(sp=(8,0,0),sp1=(4,0,0),sp2=(2,0,0),hd=(-6,0,0),
  la=(-50,0,-12),lfa=(-105,0,0),lhd=(0,0,0),ra=(-45,0,12),rfa=(-110,0,0),lcurl=1,rcurl=1,lthumb=1,rthumb=1,
  lul=(-14,0,0),lleg=(18,0,0),lft=(0,0,0),rul=(10,0,0),rleg=(16,0,0),rft=(-8,0,0),hips=(0,-10,0))
def withg(**k):
    d=dict(guard); d.update(k); return d
CL={}   # nome -> dict(dur,loop,grounded,keys|fn)
def key(name,dur,keys,loop=False,grounded=True):
    CL[name]=dict(dur=dur,loop=loop,grounded=grounded,keys=[(t,pose_vec(p),*(( ) if k is None else (k,))) for (t,p,*kk) in keys for k in [kk[0] if kk else None]])
def cyc(name,dur,fn,grounded=True): CL[name]=dict(dur=dur,loop=True,grounded=grounded,fn=fn)
def alias(name,src,**ov): CL[name]=dict(CL[src]); CL[name].update(ov)
# ---------- IDLES ----------
def idle_fn(amp=1.0,arms=None,extra=None):
    def f(ph):
        th=2*pi*ph; b=S(th)
        p=dict(sp=(1.5*amp*b,0,0),sp1=(1*amp*b,0,0),sp2=(1.2*amp*b,0,0),hd=(-1.5*amp*b,0,0),
         la=(2*b,0,0),ra=(2*b,0,0),lfa=(-14,0,0),rfa=(-14,0,0),lcurl=.2,rcurl=.2,lsh=(0,0,-2*b),rsh=(0,0,2*b),
         lleg=(4,0,0),rleg=(4,0,0),lul=(-2,0,0),rul=(-2,0,0),hips=(0,0,0),hpos=(0.004*S(th*0.5),0,0))
        if arms: p.update(arms)
        if extra: p.update(extra(ph))
        return p
    return f
cyc('Idle',2.5,idle_fn())
cyc('Idle Fold Arms',2.5,idle_fn(arms=dict(la=(-25,35,-5),ra=(-25,-35,5),lfa=(-130,0,0),rfa=(-130,0,0),lhd=(0,0,20),rhd=(0,0,-20),lcurl=.5,rcurl=.5)))
cyc('Idle Look Around',4.6,idle_fn(extra=lambda ph:dict(hd=(0,35*S(2*pi*ph*1.0)*(1 if ph<.5 else 1),0),nk=(0,15*S(2*pi*ph),0),sp2=(0,6*S(2*pi*ph),0))))
cyc('Idle No',2.5,idle_fn(extra=lambda ph:dict(hd=(0,24*S(2*pi*ph*3),0),nk=(0,8*S(2*pi*ph*3),0))))
cyc('Yes',2.0,idle_fn(extra=lambda ph:dict(hd=(14*S(2*pi*ph*3),0,0),nk=(6*S(2*pi*ph*3),0,0))))
cyc('Idle Tired',3.0,idle_fn(amp=2.5,arms=dict(la=(4,0,-3),ra=(4,0,3)),extra=lambda ph:dict(sp=(14+3*S(2*pi*ph),0,0),hd=(18+2*S(2*pi*ph),0,0),sp1=(8,0,0),hips=(3,0,0),lleg=(14,0,0),rleg=(14,0,0))))
cyc('Idle Talking',3.0,idle_fn(extra=lambda ph:dict(ra=(-50+10*S(2*pi*ph*2),-20,-10),rfa=(-80+20*S(2*pi*ph*2),0,0),rhd=(10*S(2*pi*ph*3),0,0),rcurl=.4,hd=(0,6*S(2*pi*ph),0))))
cyc('Idle Talking Phone',3.0,idle_fn(extra=lambda ph:dict(ra=(-60,-30,-10),rfa=(-125,0,0),rhd=(0,0,-15),rcurl=.8,hd=(0,-10,-8))))
cyc('Idle Lantern',2.5,idle_fn(extra=lambda ph:dict(ra=(-30,0,0),rfa=(-70,0,0),rcurl=.9,rhd=(0,0,0))))
cyc('Idle Torch',2.5,idle_fn(extra=lambda ph:dict(ra=(-55,0,-10),rfa=(-70,0,0),rcurl=1,rhd=(-10,0,0))))
cyc('Idle Paper',3.1,idle_fn(extra=lambda ph:dict(la=(-50,10,5),ra=(-50,-10,-5),lfa=(-95,0,0),rfa=(-95,0,0),lcurl=.6,rcurl=.6,hd=(22,0,0),sp=(5,0,0))))
cyc('Idle Rail',2.5,idle_fn(extra=lambda ph:dict(la=(-30,0,10),lfa=(-65,0,0),lcurl=1,sp=(6,0,0))))
cyc('Idle Rail Call',2.5,idle_fn(extra=lambda ph:dict(la=(-30,0,10),lfa=(-65,0,0),lcurl=1,ra=(-150+8*S(2*pi*ph*3),0,-15),rfa=(-10,0,0),rcurl=0,sp=(6,0,0))))
cyc('Idle Rock',2.5,idle_fn(extra=lambda ph:dict(ra=(-75,0,0),rfa=(-80,0,0),rcurl=1,hd=(-4,0,0))))
cyc('Idle Scissors',2.5,idle_fn(extra=lambda ph:dict(ra=(-80,0,0),rfa=(-85,0,0),rcurl=.6,rthumb=1)))
cyc('Idle Shield',2.5,idle_fn(extra=lambda ph:dict(la=(-70,0,30),lfa=(-95,0,0),lhd=(0,0,0),lcurl=.8,sp=(6,0,0),lleg=(20,0,0),lul=(-14,0,0),rul=(8,0,0),rleg=(12,0,0))))
key('Idle Shield Break',1.2,[(0,P(la=(-70,0,30),lfa=(-95,0,0),lcurl=.8)),(.25,P(la=(-20,0,60),lfa=(-20,0,0),sp=(-8,0,0),hd=(-14,0,0),lcurl=0)),(.6,P(la=(10,0,25),lfa=(-20,0,0),sp=(10,0,0),hd=(10,0,0),hips=(0,0,0))),(1.2,P())])
cyc('Pistol Aim Neutral',2.0,idle_fn(extra=lambda ph:dict(ra=(-80,0,-5),rfa=(-10,0,0),rcurl=.8,lcurl=.8,la=(-70,0,10),lfa=(-40,0,0),sp1=(0,-8,0))))
key('Surprise',1.4,[(0,P()),(.15,P(sp=(-8,0,0),hd=(-14,0,0),la=(-40,0,40),ra=(-40,0,-40),lfa=(-40,0,0),rfa=(-40,0,0),lcurl=0,rcurl=0,lleg=(12,0,0),rleg=(12,0,0),hpos=(0,0,-0.03))),(.7,P(sp=(-6,0,0),hd=(-10,0,0),la=(-35,0,35),ra=(-35,0,-35),lfa=(-35,0,0),rfa=(-35,0,0),lcurl=0,rcurl=0,lleg=(10,0,0),rleg=(10,0,0))),(1.4,P())])
key('Bandage',3.0,[(0,P()),(.5,P(la=(-40,0,0),lfa=(-110,0,0),ra=(-50,10,0),rfa=(-100,0,0),sp=(14,0,0),hd=(20,0,0))),(1.5,P(la=(-45,0,0),lfa=(-110,0,0),ra=(-55,10,0),rfa=(-95,0,0),rhd=(0,0,20),sp=(14,0,0),hd=(20,0,0))),(2.5,P(la=(-40,0,0),lfa=(-110,0,0),ra=(-50,10,0),rfa=(-100,0,0),sp=(14,0,0),hd=(20,0,0))),(3.0,P())])
key('Culturalibre Neck Grab',2.0,[(0,P()),(.4,P(ra=(-100,0,0),rfa=(-60,0,0),la=(-30,0,0),sp=(6,0,0),hd=(-6,0,0),rcurl=1)),(1.5,P(ra=(-100,0,0),rfa=(-60,0,0),la=(-30,0,0),sp=(6,0,0),hd=(-6,0,0),rcurl=1)),(2.0,P())])
cyc('Henny Cyclist Normal Tough',2.0,idle_fn(extra=lambda ph:dict(sp=(20,0,0),hd=(-18,0,0),la=(-50,0,10),ra=(-50,0,-10),lfa=(-30,0,0),rfa=(-30,0,0),lcurl=1,rcurl=1,lleg=(40,0,0),rleg=(40,0,0),lul=(-30,0,0),rul=(-30,0,0),hips=(0,0,0))))
key('Punkduck Tennis Serve Wind Up',1.6,[(0,P()),(.4,P(la=(-80,0,10),lfa=(-20,0,0),ra=(-20,0,-10),rfa=(-120,0,0),sp1=(0,-10,0),sp=(-4,0,0))),(.9,P(la=(-90,0,10),ra=(-170,0,-20),rfa=(-30,0,0),sp=(-10,0,0),sp1=(0,10,0),hd=(-12,0,0))),(1.6,P())])
# ---------- LOCOMOÇÃO ----------
cyc('Walk',1.1,gait(A=24,K=48,arm=18,elb=18,lean=3,twist=8,curl=.25))
alias('Walk Forward','Walk')
cyc('Walk Formal',1.2,gait(A=22,K=42,arm=8,elb=30,lean=-1,twist=5,curl=.4))
cyc('Walk Carry',1.15,gait(A=22,K=45,arm=4,elb=30,lean=2,twist=5,curl=.4))
def carry(ph):
    p=gait(A=22,K=45,arm=4,elb=30,lean=2,twist=5)(ph); p.update(la=(-50,10,0),ra=(-50,-10,0),lfa=(-90,0,0),rfa=(-90,0,0),lcurl=.7,rcurl=.7); return p
cyc('Walk Carry',1.15,carry)
cyc('Walk Backward',1.2,gait(A=20,K=40,arm=12,elb=16,lean=0,twist=6,back=True))
cyc('Jog Forward',0.8,gait(A=38,K=75,arm=38,elb=70,lean=8,twist=14,curl=.9,hipsr=5))
cyc('Jog Backward',0.85,gait(A=30,K=60,arm=28,elb=60,lean=0,twist=10,curl=.9,back=True))
cyc('Jog Left',0.85,gait(A=30,K=60,arm=25,elb=65,lean=6,twist=8,curl=.9,sway=0.03))
cyc('Run 01',0.7,gait(A=46,K=90,arm=46,elb=85,lean=12,twist=16,curl=1,hipsr=6,foot=.6))
cyc('Sprint',0.56,gait(A=54,K=105,arm=58,elb=95,lean=20,twist=18,curl=1,hipsr=7,foot=.55))
cyc('Sprint Shield',0.58,lambda ph:{**gait(A=52,K=100,arm=50,elb=90,lean=18,twist=14,curl=1)(ph),'la':(-85,0,25),'lfa':(-70,0,0)})
key('Sprint Enter',0.6,[(0,P()),(.2,P(sp=(24,0,0),hd=(-14,0,0),lul=(-36,0,0),lleg=(50,0,0),rul=(18,0,0),la=(20,0,0),ra=(-50,0,0),lfa=(-80,0,0),rfa=(-80,0,0),lcurl=1,rcurl=1)),(.6,P(sp=(20,0,0),hd=(-12,0,0),lul=(30,0,0),lleg=(70,0,0),rul=(-50,0,0),la=(-50,0,0),ra=(30,0,0),lfa=(-85,0,0),rfa=(-85,0,0),lcurl=1,rcurl=1))])
key('Sprint Exit',0.7,[(0,P(sp=(20,0,0),lul=(-40,0,0),lleg=(40,0,0),rul=(25,0,0),la=(30,0,0),ra=(-40,0,0),lfa=(-80,0,0),rfa=(-80,0,0))),(.35,P(sp=(8,0,0),lul=(-18,0,0),lleg=(30,0,0),rul=(6,0,0),rleg=(30,0,0),la=(-20,0,10),ra=(-10,0,-10),lfa=(-60,0,0),rfa=(-60,0,0))),(.7,P())])
key('Turn180 Left Root Motion',0.9,[(0,P()),(.45,P(hips=(0,95,0),sp1=(0,25,0),hd=(0,30,0),lleg=(25,0,0),rleg=(25,0,0),la=(-20,0,15),ra=(-20,0,-15))),(.9,P(hips=(0,180,0)))])
key('Turn180 Right Root Motion',0.9,[(0,P()),(.45,P(hips=(0,-95,0),sp1=(0,-25,0),hd=(0,-30,0),lleg=(25,0,0),rleg=(25,0,0),la=(-20,0,15),ra=(-20,0,-15))),(.9,P(hips=(0,-180,0)))])
# agachar / rastejar
crouch=P(hips=(18,0,0),sp=(14,0,0),sp1=(8,0,0),hd=(-18,0,0),lul=(-70,0,0),rul=(-70,0,0),lleg=(120,0,0),rleg=(120,0,0),lft=(-10,0,0),rft=(-10,0,0),la=(-25,0,5),ra=(-25,0,-5),lfa=(-70,0,0),rfa=(-70,0,0),lcurl=.6,rcurl=.6)
key('Crouch Enter',0.83,[(0,P()),(.83,crouch)]); key('Crouch Exit',0.83,[(0,crouch),(.83,P())])
cyc('Crouch Idle',2.9,lambda ph:{**crouch,'sp2':(2*S(2*pi*ph),0,0),'hd':(-18+2*S(2*pi*ph),0,0)})
def crouchwalk(ph):
    p=gait(A=26,K=55,arm=10,elb=60,lean=4,twist=8)(ph)
    for s in 'lr': u=p[s+'ul']; p[s+'ul']=(u[0]-55,0,0); p[s+'leg']=(p[s+'leg'][0]+90,0,0); p[s+'ft']=(-15,0,0)
    p['hips']=(14,0,0); p['sp']=(16,0,0); return p
cyc('Crouch Forward',2.0,crouchwalk)
prone=P(hips=(88,0,0),sp=(0,0,0),hd=(-70,0,0),la=(-150,0,10),ra=(-150,0,-10),lfa=(-20,0,0),rfa=(-20,0,0),lul=(0,0,0),rul=(0,0,0),lleg=(10,0,0),rleg=(10,0,0),lft=(40,0,0),rft=(40,0,0),hpos=(0,-0.45,0.2))
key('Crawl Enter',2.13,[(0,P()),(.8,crouch),(1.5,P(hips=(60,0,0),sp=(10,0,0),hd=(-40,0,0),la=(-80,0,0),ra=(-80,0,0),lul=(-80,0,0),rul=(-80,0,0),lleg=(110,0,0),rleg=(110,0,0),hpos=(0,-0.3,0))),(2.13,prone)],grounded=False)
key('Crawl Exit',2.0,[(0,prone),(.8,P(hips=(60,0,0),sp=(10,0,0),hd=(-40,0,0),la=(-80,0,0),ra=(-80,0,0),lul=(-80,0,0),rul=(-80,0,0),lleg=(110,0,0),rleg=(110,0,0),hpos=(0,-0.3,0))),(1.4,crouch),(2.0,P())],grounded=False)
cyc('Crawl Idle',2.3,lambda ph:{**prone,'hd':(-70+3*S(2*pi*ph),0,0)},grounded=False)
def crawl(ph,back=1):
    th=2*pi*ph; p=dict(prone)
    p['la']=(-150+30*S(th)*back,0,10); p['ra']=(-150-30*S(th)*back,0,-10)
    p['lul']=(18*S(th+pi)*back,0,10); p['rul']=(18*S(th)*back,0,-10)
    p['lleg']=(10+30*max(0,S(th+pi)),0,0); p['rleg']=(10+30*max(0,S(th)),0,0); p['sp1']=(0,5*S(th),0); return p
cyc('Crawl Forward',2.17,lambda ph:crawl(ph,1),grounded=False); cyc('Crawl Backward',2.5,lambda ph:crawl(ph,-1),grounded=False)
slide=P(hips=(-40,0,0),sp=(-10,0,0),hd=(10,0,0),lul=(-85,0,0),lleg=(5,0,0),rul=(-30,0,0),rleg=(110,0,0),la=(-30,0,40),ra=(-60,0,-30),lfa=(-20,0,0),rfa=(-40,0,0),hpos=(0,-0.42,0))
key('Slide Start',0.5,[(0,P(sp=(14,0,0))),(.5,slide)],grounded=False); cyc('Slide',1.0,lambda ph:dict(slide),grounded=False); key('Slide Exit',0.6,[(0,slide),(.6,P())],grounded=False)
key('Dodge Left',1.3,[(0,P()),(.2,P(hips=(6,0,-18),sp=(10,0,12),lul=(0,0,25),rul=(-10,0,-5),lleg=(40,0,0),la=(-40,0,20),ra=(-40,0,-20),hpos=(0.18,-0.12,0))),(.6,P(hips=(10,0,-10),sp=(10,0,8),lleg=(30,0,0),rleg=(30,0,0),hpos=(0.3,-0.1,0))),(1.3,P())])
key('Dodge Right',1.3,[(0,P()),(.2,P(hips=(6,0,18),sp=(10,0,-12),rul=(0,0,-25),lul=(-10,0,5),rleg=(40,0,0),la=(-40,0,20),ra=(-40,0,-20),hpos=(-0.18,-0.12,0))),(.6,P(hips=(10,0,10),sp=(10,0,-8),lleg=(30,0,0),rleg=(30,0,0),hpos=(-0.3,-0.1,0))),(1.3,P())])
alias('Dodge Left Root Motion','Dodge Left'); alias('Dodge Right Root Motion','Dodge Right')
key('Jog To Flip',1.0,[(0,P(sp=(10,0,0),lul=(-30,0,0),lleg=(50,0,0))),(.3,P(hips=(-40,0,0),sp=(-10,0,0),la=(-170,0,20),ra=(-170,0,-20),lul=(-60,0,0),rul=(-60,0,0),lleg=(90,0,0),rleg=(90,0,0),hpos=(0,0.25,0))),(.6,P(hips=(-200,0,0),la=(-60,0,10),ra=(-60,0,-10),lul=(-110,0,0),rul=(-110,0,0),lleg=(130,0,0),rleg=(130,0,0),hpos=(0,0.5,0))),(1.0,P(hips=(-360,0,0),lleg=(30,0,0),rleg=(30,0,0)))],grounded=False)
# ---------- AR ----------
key('Jump Start',0.5,[(0,P()),(.18,P(sp=(14,0,0),hd=(-6,0,0),lul=(-20,0,0),rul=(-20,0,0),lleg=(70,0,0),rleg=(70,0,0),la=(25,0,10),ra=(25,0,-10),lfa=(-30,0,0),rfa=(-30,0,0),hpos=(0,-0.2,0))),(.5,P(sp=(-4,0,0),lul=(-30,0,0),rul=(-12,0,0),lleg=(40,0,0),rleg=(20,0,0),lft=(30,0,0),rft=(30,0,0),la=(-60,0,35),ra=(-60,0,-35),lfa=(-30,0,0),rfa=(-30,0,0),hpos=(0,0.12,0)))],grounded=False)
cyc('Jump',0.9,lambda ph:dict(sp=(2,0,0),hd=(-4,0,0),lul=(-35+3*S(2*pi*ph),0,0),rul=(-12,0,0),lleg=(55,0,0),rleg=(30,0,0),lft=(25,0,0),rft=(20,0,0),la=(-70,0,40),ra=(-70,0,-40),lfa=(-25,0,0),rfa=(-25,0,0),lcurl=.4,rcurl=.4,hpos=(0,0.14,0)),grounded=False)
key('Jump Land',0.6,[(0,P(lul=(-30,0,0),lleg=(50,0,0),la=(-60,0,35),ra=(-60,0,-35),hpos=(0,0.1,0))),(.14,P(hips=(14,0,0),sp=(22,0,0),hd=(-12,0,0),lul=(-60,0,0),rul=(-60,0,0),lleg=(110,0,0),rleg=(110,0,0),la=(-20,0,25),ra=(-20,0,-25),lfa=(-60,0,0),rfa=(-60,0,0),hpos=(0,-0.1,0))),(.6,P())])
key('Hit Knockback',1.4,[(0,P()),(.15,P(hips=(-14,0,0),sp=(-22,0,0),sp2=(-10,0,0),hd=(-22,0,0),la=(-50,0,50),ra=(-50,0,-50),lfa=(-20,0,0),rfa=(-20,0,0),lul=(-10,0,0),rul=(16,0,0),lleg=(30,0,0),hpos=(0,0,-0.1))),(.5,P(hips=(-30,0,0),sp=(-26,0,0),hd=(-26,0,0),la=(-40,0,60),ra=(-40,0,-60),lul=(-24,0,0),rul=(12,0,0),lleg=(50,0,0),rleg=(20,0,0),hpos=(0,-0.2,-0.15))),(1.0,P(hips=(30,0,0),sp=(22,0,0),hd=(10,0,0),lul=(-60,0,0),rul=(-50,0,0),lleg=(90,0,0),rleg=(80,0,0),hpos=(0,-0.35,-0.1))),(1.4,P(hips=(10,0,0),sp=(10,0,0),lleg=(40,0,0),rleg=(40,0,0),hpos=(0,-0.12,-0.05)))])
alias('Hit Knockback Root Motion','Hit Knockback')
for nm,dur in (('Lift Air Fall',1.0),('Lift Air Idle',2.0),('Lift Air Root Motion',1.2),('Lift Air Hit Right',0.8),('Lift Air Fall Impact',0.8),('Lift Air Fall Root Motion',1.0)):
    pass
cyc('Lift Air Idle',2.0,lambda ph:dict(hips=(10,0,0),sp=(-6,0,0),la=(-50,0,50+4*S(2*pi*ph)),ra=(-50,0,-50-4*S(2*pi*ph)),lul=(-25,0,10),rul=(-8,0,-10),lleg=(40,0,0),rleg=(20,0,0),hpos=(0,0.1+0.03*S(2*pi*ph),0)),grounded=False)
key('Lift Air Root Motion',1.2,[(0,P()),(.6,P(hips=(6,0,0),lul=(-20,0,0),lleg=(40,0,0),la=(-40,0,40),ra=(-40,0,-40),hpos=(0,0.12,0))),(1.2,P(hips=(10,0,0),lul=(-25,0,10),lleg=(40,0,0),la=(-50,0,50),ra=(-50,0,-50),hpos=(0,0.1,0)))],grounded=False)
cyc('Lift Air Fall',1.0,lambda ph:dict(hips=(-10,0,0),sp=(-10,0,0),la=(-140,0,30),ra=(-140,0,-30),lul=(-20,0,10),rul=(-10,0,-10),lleg=(30,0,0),rleg=(40,0,0),hpos=(0,0.1,0)),grounded=False)
alias('Lift Air Fall Root Motion','Lift Air Fall')
key('Lift Air Fall Impact',0.8,[(0,P(hips=(-10,0,0),la=(-140,0,30),ra=(-140,0,-30),hpos=(0,0.1,0))),(.15,P(hips=(30,0,0),sp=(30,0,0),la=(-20,0,30),ra=(-20,0,-30),lul=(-60,0,0),rul=(-60,0,0),lleg=(110,0,0),rleg=(110,0,0),hpos=(0,-0.2,0))),(.8,P())])
key('Lift Air Hit Right',0.8,[(0,P(hips=(10,0,0),la=(-50,0,50),ra=(-50,0,-50),hpos=(0,0.1,0))),(.15,P(hips=(10,0,-20),sp=(-6,0,-14),hd=(0,0,-18),la=(-30,0,70),ra=(-60,0,-20),hpos=(0.1,0.1,0))),(.8,P(hips=(10,0,0),la=(-50,0,50),ra=(-50,0,-50),hpos=(0,0.1,0)))],grounded=False)
# ---------- ESCALADA ----------
climbp=P(sp=(10,0,0),hd=(-30,0,0),la=(-160,0,10),ra=(-160,0,-10),lfa=(-8,0,0),rfa=(-8,0,0),lcurl=1,rcurl=1,lul=(-70,0,10),rul=(-30,0,-10),lleg=(80,0,0),rleg=(70,0,0),lft=(25,0,0),rft=(25,0,0),hpos=(0,0,0))
cyc('Climb Idle',2.0,lambda ph:{**climbp,'sp':(10+1.5*S(2*pi*ph),0,0)},grounded=False)
def climb(ph,dirn=1):
    th=2*pi*ph; p=dict(climbp)
    p['la']=(-160+dirn*35*S(th),0,10); p['ra']=(-160-dirn*35*S(th),0,-10)
    p['lul']=(-70+dirn*30*S(th+pi),0,10); p['rul']=(-30+dirn*30*S(th),0,-10)
    p['lleg']=(80+dirn*20*S(th+pi),0,0); p['rleg']=(70+dirn*20*S(th),0,0)
    p['sp1']=(0,dirn*5*S(th),0); p['hpos']=(0,0.03*abs(S(th)),0); return p
cyc('Climb Up',1.0,lambda ph:climb(ph,1),grounded=False)
def side_climb(sgn):
    def f(ph):
        th=2*pi*ph; p=dict(climbp); p['la']=(-160,0,10+sgn*30*S(th)); p['ra']=(-160,0,-10+sgn*30*S(th)); p['lul']=(-70,0,10+sgn*20*S(th+pi)); p['rul']=(-30,0,-10+sgn*20*S(th)); p['hpos']=(0.02*sgn*S(th),0,0); return p
    return f
cyc('Climb Left',1.0,side_climb(1),grounded=False); cyc('Climb Right',1.0,side_climb(-1),grounded=False)
key('Climb Enter',0.8,[(0,P(sp=(6,0,0),la=(-70,0,10),ra=(-70,0,-10))),(.4,P(sp=(14,0,0),la=(-130,0,10),ra=(-130,0,-10),lul=(-50,0,0),lleg=(60,0,0),hpos=(0,0.1,0))),(.8,climbp)],grounded=False)
key('Climb Exit',0.8,[(0,climbp),(.4,P(sp=(16,0,0),la=(-60,0,20),ra=(-60,0,-20),lul=(-80,0,0),lleg=(90,0,0),hpos=(0,0.12,0.05))),(.8,P())],grounded=False)
def clb(name,dur,rise):
    key(name,dur,[(0,P(sp=(6,0,0),la=(-60,0,10),ra=(-60,0,-10))),(dur*.3,P(sp=(10,0,0),la=(-150,0,10),ra=(-150,0,-10),lul=(-70,0,0),lleg=(90,0,0),hpos=(0,rise*.4,0))),(dur*.65,P(sp=(24,0,0),la=(-60,0,25),ra=(-60,0,-25),lul=(-100,0,0),rul=(-30,0,0),lleg=(100,0,0),hpos=(0,rise*.9,0.05))),(dur,P(hpos=(0,0,0)))],grounded=False)
clb('Climb Up 1m Root Motion',1.5,0.5); clb('Climb Up 2m Root Motion',2.2,0.8); clb('Climb Ledge',1.6,0.5); clb('Climb Ledge Root Motion',1.6,0.5); clb('Get Off Wall 2m Root Motion',1.6,-0.3); clb('Step Up Root Motion',0.9,0.3)
key('Safety Vault Root Motion',1.1,[(0,P(sp=(10,0,0),lul=(-30,0,0),lleg=(50,0,0))),(.3,P(sp=(36,0,0),la=(-120,0,15),ra=(-120,0,-15),lul=(-90,0,0),lleg=(70,0,0),rul=(30,0,0),rleg=(30,0,0),hpos=(0,0.18,0.05))),(.55,P(sp=(24,0,0),la=(-80,0,15),ra=(-80,0,-15),lul=(-50,0,10),rul=(-90,0,-10),lleg=(40,0,0),rleg=(80,0,0),hpos=(0,0.22,0.05))),(1.1,P())],grounded=False)
# ---------- COMBATE ----------
key('Punch Cross',0.75,[(0,withg()),(.14,withg(hips=(0,-30,0),sp1=(0,-14,0),ra=(-25,0,-6),rfa=(-125,0,0),la=(-48,0,12),lfa=(-110,0,0))),(.3,withg(hips=(0,30,0),sp1=(0,18,0),sp=(14,0,0),ra=(-92,0,-4),rfa=(-6,0,0),rhd=(0,0,0),la=(-35,0,14),lfa=(-125,0,0),lul=(-30,0,0),lleg=(40,0,0),rul=(16,0,0),hpos=(0,-0.04,0.05),hd=(-10,0,0))),(.42,withg(hips=(0,28,0),sp1=(0,16,0),sp=(12,0,0),ra=(-92,0,-4),rfa=(-6,0,0),lul=(-30,0,0),lleg=(40,0,0),rul=(16,0,0),hpos=(0,-0.04,0.05))),(.75,withg())])
key('Punch Jab',0.55,[(0,withg()),(.1,withg(la=(-60,0,10),lfa=(-110,0,0),sp1=(0,10,0))),(.2,withg(la=(-92,0,6),lfa=(-6,0,0),sp1=(0,-12,0),sp=(12,0,0),hips=(0,-16,0),hpos=(0,-0.02,0.04))),(.32,withg(la=(-92,0,6),lfa=(-6,0,0),sp1=(0,-12,0))),(.55,withg())])
key('Melee Hook',0.85,[(0,withg()),(.18,withg(la=(-20,-30,40),lfa=(-100,0,0),sp1=(0,26,0),hips=(0,22,0),sp=(10,0,0))),(.34,withg(la=(-55,-70,-45),lfa=(-100,0,0),sp1=(0,-34,0),hips=(0,-36,0),sp=(14,0,0),hpos=(0,-0.03,0.04),lul=(-24,0,0),lleg=(30,0,0))),(.48,withg(la=(-55,-70,-45),lfa=(-100,0,0),sp1=(0,-30,0),hips=(0,-30,0))),(.85,withg())])
alias('Melee Hook Recovery','Melee Hook')
key('Melee Uppercut',0.9,[(0,withg()),(.2,withg(ra=(-10,0,-6),rfa=(-80,0,0),sp=(20,0,0),lleg=(40,0,0),rleg=(44,0,0),hips=(10,-20,0),hpos=(0,-0.14,0))),(.38,withg(ra=(-150,0,-6),rfa=(-70,0,0),sp=(-6,0,0),hips=(-6,30,0),lleg=(10,0,0),rleg=(10,0,0),hpos=(0,0.04,0.05),hd=(-14,0,0))),(.55,withg(ra=(-150,0,-6),rfa=(-70,0,0),sp=(-4,0,0),hips=(-4,24,0))),(.9,withg())])
key('Kick',0.95,[(0,withg()),(.2,withg(rul=(-60,0,0),rleg=(100,0,0),sp=(-4,0,0),hips=(0,-30,0),lleg=(22,0,0),la=(-40,0,25),ra=(-30,0,-25))),(.36,withg(rul=(-95,0,-10),rleg=(8,0,0),rft=(-20,0,0),sp=(-18,0,0),hips=(-8,-24,0),lleg=(30,0,0),la=(-30,0,50),ra=(-60,0,-30),hpos=(0,0,0.03))),(.5,withg(rul=(-95,0,-10),rleg=(8,0,0),sp=(-18,0,0))),(.95,withg())],grounded=False)
CL['Kick']['grounded']=False
for k in CL['Kick']['keys']: pass
key('Melee Knee',0.8,[(0,withg()),(.2,withg(hips=(0,-12,0),la=(-60,0,10),ra=(-60,0,-10),lfa=(-110,0,0),rfa=(-110,0,0),rul=(-30,0,0),rleg=(110,0,0))),(.36,withg(sp=(14,0,0),la=(-110,0,10),ra=(-110,0,-10),lfa=(-80,0,0),rfa=(-80,0,0),rul=(-115,0,0),rleg=(105,0,0),lleg=(14,0,0),lul=(-8,0,0),hpos=(0,0.03,0.05))),(.55,withg(sp=(10,0,0),rul=(-110,0,0),rleg=(105,0,0),lleg=(14,0,0),lul=(-8,0,0))),(.8,withg())],grounded=False)
alias('Melee Knee Recovery','Melee Knee')
key('Melee Combo',1.6,[(0,withg()),(.12,withg(hips=(0,-22,0),ra=(-25,0,-6),rfa=(-125,0,0))),(.22,withg(hips=(0,26,0),ra=(-92,0,-4),rfa=(-6,0,0),sp=(12,0,0))),(.4,withg(hips=(0,18,0),ra=(-50,0,-6),rfa=(-110,0,0),la=(-60,0,10),lfa=(-110,0,0))),(.52,withg(hips=(0,-26,0),la=(-92,0,6),lfa=(-6,0,0),sp=(12,0,0))),(.8,withg(hips=(0,-20,0),la=(-20,-30,40),lfa=(-100,0,0))),(.95,withg(hips=(0,34,0),ra=(-55,70,45),rfa=(-100,0,0),sp1=(0,30,0))),(1.2,withg(rul=(-80,0,0),rleg=(40,0,0),hips=(-6,-20,0),sp=(-12,0,0))),(1.6,withg())],grounded=False)
key('Overhand Throw',1.0,[(0,P()),(.25,P(ra=(-60,-30,-60),rfa=(-100,0,0),la=(-50,0,20),sp1=(0,-24,0),hips=(0,-14,0),sp=(-8,0,0),lul=(-12,0,0),lleg=(20,0,0),rleg=(10,0,0))),(.45,P(ra=(-100,-20,-40),rfa=(-80,0,0),la=(-70,0,20),sp1=(0,24,0),hips=(0,18,0),sp=(18,0,0),lul=(-36,0,0),lleg=(40,0,0),rcurl=0,hpos=(0,-0.04,0.06))),(.7,P(ra=(-70,0,-10),rfa=(-10,0,0),sp1=(0,20,0),sp=(20,0,0),hips=(0,16,0),lul=(-36,0,0),lleg=(40,0,0))),(1.0,P())])
key('Sword Attack',1.1,[(0,withg(ra=(-60,0,-20),rfa=(-90,0,0),la=(-50,0,10),lfa=(-100,0,0))),(.25,withg(ra=(-170,0,-30),rfa=(-60,0,0),la=(-110,0,10),lfa=(-100,0,0),sp=(-8,0,0),hips=(0,-20,0))),(.45,withg(ra=(-60,0,-5),rfa=(-15,0,0),la=(-50,0,10),lfa=(-100,0,0),sp=(20,0,0),hips=(0,30,0),lul=(-34,0,0),lleg=(40,0,0),hpos=(0,-0.05,0.07))),(1.1,withg(ra=(-60,0,-20),rfa=(-90,0,0)))])
alias('Sword Attack Root Motion','Sword Attack'); alias('Sword Attack Standing','Sword Attack')
key('Sword Block',1.0,[(0,P()),(.2,P(ra=(-100,0,-10),rfa=(-70,0,0),la=(-90,0,10),lfa=(-80,0,0),sp=(8,0,0),lleg=(18,0,0),rleg=(18,0,0),rcurl=1,lcurl=1)),(.8,P(ra=(-100,0,-10),rfa=(-70,0,0),la=(-90,0,10),lfa=(-80,0,0),sp=(8,0,0),lleg=(18,0,0),rleg=(18,0,0),rcurl=1,lcurl=1)),(1.0,P())])
key('Sword Dash Root Motion',0.8,[(0,P()),(.25,P(sp=(24,0,0),ra=(-50,0,-10),rfa=(-60,0,0),la=(20,0,0),lul=(-50,0,0),lleg=(70,0,0),rul=(30,0,0),hpos=(0,-0.1,0.1))),(.8,P())])
key('Bow Aim Down',1.2,[(0,P(la=(-50,0,15),lfa=(-20,0,0),ra=(-40,0,-20),rfa=(-110,0,0),sp1=(0,-14,0),hd=(10,0,0)))])
key('Bow Aim Up',1.2,[(0,P(la=(-110,0,15),lfa=(-10,0,0),ra=(-100,0,-25),rfa=(-110,0,0),sp1=(0,-14,0),hd=(-10,0,0),sp=(-6,0,0)))])
key('Bow Notch',1.0,[(0,P()),(.5,P(la=(-70,0,15),lfa=(-30,0,0),ra=(-50,0,-30),rfa=(-100,0,0),sp1=(0,-10,0))),(1.0,P(la=(-70,0,15),lfa=(-30,0,0),ra=(-50,0,-30),rfa=(-100,0,0),sp1=(0,-10,0)))])
key('Bow Shoot',0.8,[(0,P(la=(-90,0,15),lfa=(-8,0,0),ra=(-70,0,-60),rfa=(-130,0,0),sp1=(0,-18,0))),(.15,P(la=(-90,0,15),lfa=(-8,0,0),ra=(-60,0,-30),rfa=(-60,0,0),sp1=(0,-14,0),sp=(-4,0,0))),(.8,P(la=(-70,0,15),lfa=(-20,0,0),ra=(-30,0,-10),rfa=(-60,0,0)))])
HITB=dict(lleg=(8,0,0),rleg=(8,0,0))
def hit(name,dur,**k): key(name,dur,[(0,P()),(.09,P(**{**HITB,**k})),(dur*.5,P(**{kk:tuple(np.array(v)*.4) for kk,v in {**HITB,**k}.items()})),(dur,P())])
hit('Hit Chest',0.7,sp=(-12,0,0),sp2=(-8,0,0),hd=(-14,0,0),la=(-20,0,25),ra=(-20,0,-25),hips=(-4,0,0),hpos=(0,0,-0.05))
hit('Hit Head',0.7,hd=(-26,0,8),nk=(-10,0,4),sp=(-6,0,0),la=(-10,0,15),ra=(-10,0,-15))
hit('Hit Shoulder Left',0.7,sp1=(0,-12,10),sp2=(0,-10,8),hd=(0,-14,8),la=(-10,0,30),hips=(0,-8,0),hpos=(-0.04,0,0))
hit('Hit Shoulder Right',0.7,sp1=(0,12,-10),sp2=(0,10,-8),hd=(0,14,-8),ra=(-10,0,-30),hips=(0,8,0),hpos=(0.04,0,0))
hit('Hit Stomach',0.75,sp=(24,0,0),hd=(14,0,0),hips=(10,0,0),la=(-40,0,10),ra=(-40,0,-10),lfa=(-80,0,0),rfa=(-80,0,0),lleg=(22,0,0),rleg=(22,0,0))
# ---------- SOCIAL/OUTROS ----------
key('Idle To Lay',2.5,[(0,P()),(.8,crouch),(1.6,P(hips=(70,0,0),sp=(-20,0,0),la=(-30,0,30),ra=(-30,0,-30),lul=(-90,0,0),rul=(-90,0,0),lleg=(110,0,0),rleg=(110,0,0),hpos=(0,-0.5,-0.2))),(2.5,P(hips=(-90,0,0),sp=(0,0,0),hd=(5,0,0),la=(0,0,25),ra=(0,0,-25),hpos=(0,-0.78,-0.3)))],grounded=False)
key('Ground Sit Enter',1.5,[(0,P()),(.7,crouch),(1.5,P(hips=(-6,0,0),sp=(12,0,0),hd=(-8,0,0),lul=(-85,0,10),rul=(-85,0,-10),lleg=(95,0,0),rleg=(95,0,0),la=(-30,0,20),ra=(-30,0,-20),hpos=(0,-0.42,-0.08)))],grounded=False)
sit=P(hips=(-6,0,0),sp=(12,0,0),hd=(-8,0,0),lul=(-85,0,10),rul=(-85,0,-10),lleg=(95,0,0),rleg=(95,0,0),la=(-30,0,20),ra=(-30,0,-20),hpos=(0,-0.42,-0.08))
cyc('Ground Sit Idle',3.0,lambda ph:{**sit,'sp2':(2*S(2*pi*ph),0,0)},grounded=False)
key('Ground Sit Exit',1.5,[(0,sit),(.8,crouch),(1.5,P())],grounded=False)
cyc('Driving',2.0,lambda ph:dict(sp=(-6,0,0),hd=(-4,0,0),la=(-70,0,5),ra=(-70,0,-5),lfa=(-50,0,0),rfa=(-50,0,0),lcurl=1,rcurl=1,lul=(-80,0,5),rul=(-80,0,-5),lleg=(80,0,0),rleg=(80,0,0),hpos=(0,-0.35,-0.1)),grounded=False)
cyc('Counter Idle',2.5,idle_fn(extra=lambda ph:dict(la=(-40,0,10),ra=(-40,0,-10),lfa=(-100,0,0),rfa=(-100,0,0),sp=(4,0,0))))
key('Counter Enter',1.0,[(0,P()),(1.0,P(la=(-40,0,10),ra=(-40,0,-10),lfa=(-100,0,0),rfa=(-100,0,0),sp=(4,0,0)))]); key('Counter Exit',1.0,[(0,P(la=(-40,0,10),ra=(-40,0,-10),lfa=(-100,0,0),rfa=(-100,0,0))),(1.0,P())])
key('Counter Angry',2.0,[(0,P()),(.3,P(sp=(14,0,0),hd=(-10,0,0),la=(-30,0,10),ra=(-30,0,-10),lfa=(-80,0,0),rfa=(-80,0,0),lcurl=1,rcurl=1)),(1.0,P(sp=(16,0,0),hd=(-12,0,0),la=(-30,0,10),ra=(-30,0,-10),lfa=(-80,0,0),rfa=(-80,0,0),lcurl=1,rcurl=1,hd_=(0,0,0))),(2.0,P())])
key('Counter Give',1.5,[(0,P(la=(-40,0,10),ra=(-40,0,-10),lfa=(-100,0,0),rfa=(-100,0,0))),(.6,P(la=(-70,0,10),ra=(-70,0,-10),lfa=(-30,0,0),rfa=(-30,0,0),sp=(8,0,0))),(1.5,P())])
key('Kip Up',1.6,[(0,P(hips=(-90,0,0),hpos=(0,-0.8,-0.3),la=(0,0,25),ra=(0,0,-25))),(.4,P(hips=(-110,0,0),lul=(-120,0,0),rul=(-120,0,0),lleg=(100,0,0),rleg=(100,0,0),la=(-150,0,25),ra=(-150,0,-25),hpos=(0,-0.5,-0.2))),(.8,P(hips=(-40,0,0),lul=(-60,0,0),rul=(-60,0,0),lleg=(60,0,0),rleg=(60,0,0),la=(-30,0,20),ra=(-30,0,-20),hpos=(0,0.1,0))),(1.2,P(hips=(14,0,0),sp=(18,0,0),lul=(-70,0,0),rul=(-70,0,0),lleg=(110,0,0),rleg=(110,0,0),hpos=(0,-0.2,0))),(1.6,P())],grounded=False)
key('Monster Transformation',3.0,[(0,P()),(.8,P(sp=(24,0,0),hd=(-20,0,0),la=(-30,0,30),ra=(-30,0,-30),lfa=(-80,0,0),rfa=(-80,0,0),lcurl=1,rcurl=1,lleg=(30,0,0),rleg=(30,0,0))),(1.8,P(sp=(-16,0,0),hd=(-30,0,0),la=(-60,0,90),ra=(-60,0,-90),lcurl=0,rcurl=0,lleg=(24,0,0),rleg=(24,0,0))),(3.0,P())])
CL['Idle Look Around']['loop']=True
