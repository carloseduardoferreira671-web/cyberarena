import sys; sys.path.insert(0,'/home/claude/rig')
import pickle
from build_glb import smooth_weights, weights_for
from skin import *
from physics import *
from glbwrite import GLB
import anim_export as A
import skeleton as SK
def tri_hat(y,nodes):
    """pesos 'chapéu' ao longo de y decrescente; nodes lista de y (decrescente)"""
    n=len(nodes); W=np.zeros((len(y),n))
    for i in range(n):
        if i==0: W[:,0]=np.where(y>=nodes[0],1,0)
        if i<n-1:
            m=(y<nodes[i])&(y>=nodes[i+1]); t=(nodes[i]-y[m])/(nodes[i]-nodes[i+1]); W[m,i]=1-t; W[m,i+1]=t
    W[y<nodes[-1],n-1]=1; return W
def make(ch,out=None,with_anim=True):
    M,bones,w=weights_for(ch); n=len(M['P']); d=pickle.load(open(f'/home/claude/rig/dist_{ch}.pkl','rb'))
    Pj,Ej=SK.build(SPECS[ch]); P=M['P']; x,y,z=P[:,0],P[:,1],P[:,2]
    mk=masks(ch,M,bones,w,d['De']); dom=np.argmax(w,1); dn=np.array(bones)[dom]
    parents=dict(PARENT); extra=[]
    allb=list(bones)
    # ---------- mãos: pesos euclidianos nítidos para os dedos ----------
    for side in ('Left','Right'):
        Wp=Pj[side+'Hand']; hd=SPECS[ch]['hand']['D']; Dd=unit(hd if side=='Left' else V(-hd[0],hd[1],hd[2]))
        t=(P-Wp)@Dd; r=np.linalg.norm(P-Wp,axis=1)
        hb0=[side+'ForeArm',side+'Hand']+[f'{side}Hand{fg}{k}' for fg in FINGERS for k in (1,2,3)]
        own=w[:,[bones.index(b) for b in hb0]].sum(1)
        f=smoothstep(0.0,0.035,t)*(r<0.2)*smoothstep(0.5,0.9,own)
        hb=[side+'Hand']+[f'{side}Hand{fg}{k}' for fg in FINGERS for k in (1,2,3)]
        cols=[bones.index(b) for b in hb]
        segs=segments(Pj,Ej,hb)
        Dh=np.stack([pt_seg(P,*segs[b]) for b in hb],1)
        wh_=to_weights(Dh,tau_scale=0.3,tmin=0.006,tmax=0.02,power=2.0)
        wh_/= wh_.sum(1,keepdims=True)+1e-9
        base=w.copy(); wnew=np.zeros_like(w)
        wnew[:,cols]=wh_
        w=(1-f[:,None])*base+f[:,None]*wnew
    # ---------- Atlas: dreads com 2 correntes de ossos ----------
    hm=np.zeros(n)
    if ch=='atlas':
        hm=vertex_smooth(M,mk['hair'],3); hm=np.clip(hm*1.1,0,1)
        for nm,sg in (('Tail',1),('Tail2',-1)):
            pts=[(0.07,1.60,-0.12),(0.08,1.46,-0.19),(0.08,1.32,-0.21),(0.08,1.18,-0.20),(0.07,1.04,-0.17)]
            names=[f'{nm}_{i+1}' for i in range(4)]+[f'{nm}_End']
            for i,(nm_,p) in enumerate(zip(names,pts)):
                Pj[nm_]=V(sg*p[0],p[1],p[2]); parents[nm_]='Head' if i==0 else names[i-1]; extra.append(nm_)
        allb=allb+extra
        ny=[1.70,1.60,1.46,1.32,1.18,1.04]
        H=tri_hat(y,ny)   # col0=Head, cols1..5 = chain
        wl=np.zeros((n,len(allb))); wr=np.zeros((n,len(allb)))
        hi=bones.index('Head')
        wl[:,hi]=H[:,0]; wr[:,hi]=H[:,0]
        for k in range(5): wl[:,allb.index(f'Tail_{k+1}' if k<4 else 'Tail_End')]=H[:,k+1]; wr[:,allb.index(f'Tail2_{k+1}' if k<4 else 'Tail2_End')]=H[:,k+1]
        side=smoothstep(-0.03,0.03,x)[:,None]
        wh=wl*side+wr*(1-side)
        w2=np.zeros((n,len(allb))); w2[:,:len(bones)]=w
        hmc=hm[:,None]
        w=(1-hmc)*w2+hmc*wh
    # ---------- física ----------
    nm_=dn
    region_mx={'Hips':.75,'Spine':.8,'Spine1':.85,'Spine2':.85,'Shoulder':.7,'Arm':.7,'ForeArm':.6,'UpLeg':.6,'Leg':.5}
    mx=np.zeros(n)
    for i,b in enumerate(dn):
        v=0.12
        for k,val in region_mx.items():
            if b.endswith(k) and not ('Hand' in b): v=val; break
        mx[i]=v
    mx=vertex_smooth(M,mx,3)
    scale={'atlas':1.0,'nexus':0.7,'cyber':0.7}[ch]; mx*=scale
    fabric=np.zeros(n); loose=np.zeros(n); hair=np.zeros(n)
    # protrusão (peças soltas): distância ao eixo do osso dono / mediana
    De=d['De']; dd=De[np.arange(n),dom]; 
    med=np.array([np.median(dd[dom==i]) if (dom==i).sum()>12 else 0 for i in range(len(bones))]); gm=np.median(med[med>0])
    rr=np.maximum(np.where(med[dom]>0,med[dom],gm),1.8*0.02); q=dd/rr
    prot=smoothstep(1.15,2.1,q)*(dd>1.8*0.022); prot=vertex_smooth(M,prot,2)
    loose=prot*0.55
    if ch=='nexus':
        sc=vertex_smooth(M,mk['scarf'],2); fabric=np.maximum(fabric,sc); loose=np.maximum(loose,sc*0.45); mx=mx*(1-sc*0.8)
    if ch=='atlas':
        t=np.clip((1.62-y)/0.6,0,1); fabric=np.maximum(fabric,hm); loose=np.maximum(loose,hm*(0.3+0.55*t)); hair=hm*0.12*t; mx=mx*(1-hm)
        chn=vertex_smooth(M,mk['chain'],2); fabric=np.maximum(fabric,chn*0.6); loose=np.maximum(loose,chn*0.6)
    if ch=='cyber':
        # capuz e pescoço: ZERO física
        ishead=np.isin(dn,['Head','Neck']).astype(float)
        zone=(np.abs(x-Pj['Neck'][0])<0.24)*smoothstep(1.40,1.47,y)
        nophys=np.clip(np.maximum(ishead,zone),0,1); nophys=vertex_smooth(M,nophys,2); nophys=np.clip(nophys*1.3,0,1)
        mx*= (1-nophys); fabric*=(1-nophys); loose*=(1-nophys); hair*=(1-nophys)
        mk['nophys']=nophys
    # mãos/pés quase rígidos
    stiff=np.isin(dn,[b for b in bones if 'Hand' in b or 'Foot' in b or 'Toe' in b]); mx[stiff]*=0.35; loose[stiff]*=0.5
    phys=dict(soft=np.stack([np.clip(mx,0,1.2),np.clip(fabric,0,1)],1),loose=np.clip(loose,0,1),hair=np.clip(hair,0,1))
    # ---------- pesos finais ----------
    w=smooth_weights(w,P,M['idx'],iters=1,lam=0.4) if ch!='atlas' else w
    ji,jw=top4(w)
    g=GLB()
    pa=g.accessor(P.astype('<f4'),5126,'VEC3',34962,True); na=g.accessor(M['N'].astype('<f4'),5126,'VEC3',34962)
    ua=g.accessor(M['uv'].astype('<f4'),5126,'VEC2',34962); ja=g.accessor(ji.astype('<u2'),5123,'VEC4',34962); wa=g.accessor(jw.astype('<f4'),5126,'VEC4',34962)
    ia=g.accessor(M['idx'].reshape(-1).astype('<u4'),5125,'SCALAR',34963)
    attrs={'POSITION':pa,'NORMAL':na,'TEXCOORD_0':ua,'JOINTS_0':ja,'WEIGHTS_0':wa,
      '_SOFT':g.accessor(phys['soft'].astype('<f4'),5126,'VEC2',34962),'_LOOSE':g.accessor(phys['loose'].astype('<f4'),5126,'SCALAR',34962),'_HAIR':g.accessor(phys['hair'].astype('<f4'),5126,'SCALAR',34962)}
    CC=CH[ch]
    i0=g.image(open(f'/home/claude/new/{CC}_color.jpg','rb').read(),'image/jpeg'); i1=g.image(open(f'/home/claude/new/{CC}_orm.jpg','rb').read(),'image/jpeg'); i2=g.image(open(f'/home/claude/new/{CC}_normal.png','rb').read(),'image/png')
    g.j['textures']=[{'source':i,'sampler':0} for i in (i0,i1,i2)]
    g.j['materials']=[{'name':'mat','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':1},'metallicFactor':1,'roughnessFactor':1},'normalTexture':{'index':2}}]
    g.j['meshes']=[{'name':ch+'_mesh','primitives':[{'attributes':attrs,'indices':ia,'material':0}]}]
    nodes=[{'name':ch.capitalize()+'Root','children':[1,2]},{'name':ch+'_mesh','mesh':0,'skin':0}]
    nid={}
    for b in allb: nid[b]=len(nodes); nodes.append({'name':('mixamorig'+b) if b in PARENT else b})
    for b in allb:
        par=parents.get(b)
        if par is None: nodes[nid[b]]['translation']=[float(v) for v in Pj[b]]
        else: nodes[nid[par]].setdefault('children',[]).append(nid[b]); nodes[nid[b]]['translation']=[float(v) for v in (Pj[b]-Pj[par])]
    g.j['nodes']=nodes; g.j['scenes'][0]['nodes']=[0]
    ibm=np.zeros((len(allb),16),'<f4')
    for k,b in enumerate(allb): M4=np.eye(4); M4[:3,3]=-Pj[b]; ibm[k]=M4.T.reshape(-1)
    g.j['skins']=[{'joints':[nid[b] for b in allb],'inverseBindMatrices':g.accessor(ibm,5126,'MAT4'),'skeleton':nid['Hips']}]
    if with_anim: A.add_animations(g,nid,Pj,ch)
    path=out or f'/home/claude/rig/out/{ch}_rig.glb'; g.save(path); print(ch,'ok',round(len(open(path,'rb').read())/1e6,2),'MB',len(allb),'bones',len(g.j.get('animations',[])),'anims')
    pickle.dump(dict(phys=phys,mk={k:v for k,v in mk.items() if k!='dom'},hm=hm),open(f'/home/claude/rig/phys_{ch}.pkl','wb'))
if __name__=='__main__':
    for c in sys.argv[1:]: make(c)
