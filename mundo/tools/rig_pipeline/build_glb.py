import sys; sys.path.insert(0,'/home/claude/rig')
import pickle, json
from skin import *
from glbwrite import GLB
def smooth_weights(w,P,idx,iters=3,lam=0.5):
    # une posicoes iguais
    key=np.round(P*1e5).astype(np.int64); _,inv=np.unique(key,axis=0,return_inverse=True); inv=inv.ravel()
    n=inv.max()+1; e=np.concatenate([idx[:,[0,1]],idx[:,[1,2]],idx[:,[2,0]]]); a=inv[e[:,0]]; b=inv[e[:,1]]
    A=sp.csr_matrix((np.ones(len(a)),(a,b)),shape=(n,n)); A=A+A.T; A.data[:]=1; deg=np.asarray(A.sum(1)).ravel()
    W=np.zeros((n,w.shape[1])); np.add.at(W,inv,w); cnt=np.bincount(inv,minlength=n); W/=cnt[:,None]
    for _ in range(iters):
        W=(1-lam)*W+lam*(A@W)/np.maximum(deg,1)[:,None]
    return W[inv]
def weights_for(ch,tau=0.35,smooth=2):
    M=load_mesh(ch); d=pickle.load(open(f'/home/claude/rig/dist_{ch}.pkl','rb')); bones=d['bones']
    w=to_weights(d['Dg'],tau_scale=tau)
    w=smooth_weights(w,M['P'],M['idx'],iters=smooth)
    return M,bones,w
def build(ch,anims=None,physics=None,out=None):
    M,bones,w=weights_for(ch); Pj,Ej=build_sk(ch)
    ji,jw=top4(w)
    g=GLB(); n=len(M['P'])
    pa=g.accessor(M['P'].astype('<f4'),5126,'VEC3',34962,True)
    na=g.accessor(M['N'].astype('<f4'),5126,'VEC3',34962)
    ua=g.accessor(M['uv'].astype('<f4'),5126,'VEC2',34962)
    ja=g.accessor(ji.astype('<u2'),5123,'VEC4',34962)
    wa=g.accessor(jw.astype('<f4'),5126,'VEC4',34962)
    ia=g.accessor(M['idx'].reshape(-1).astype('<u4'),5125,'SCALAR',34963)
    attrs={'POSITION':pa,'NORMAL':na,'TEXCOORD_0':ua,'JOINTS_0':ja,'WEIGHTS_0':wa}
    if physics is not None:
        attrs['_SOFT']=g.accessor(physics['soft'].astype('<f4'),5126,'VEC2',34962)
        attrs['_LOOSE']=g.accessor(physics['loose'].astype('<f4'),5126,'SCALAR',34962)
        attrs['_HAIR']=g.accessor(physics['hair'].astype('<f4'),5126,'SCALAR',34962)
    CC=CH[ch]
    i0=g.image(open(f'/home/claude/new/{CC}_color.jpg','rb').read(),'image/jpeg')
    i1=g.image(open(f'/home/claude/new/{CC}_orm.jpg','rb').read(),'image/jpeg')
    i2=g.image(open(f'/home/claude/new/{CC}_normal.png','rb').read(),'image/png')
    g.j['textures']=[{'source':i,'sampler':0} for i in (i0,i1,i2)]
    g.j['materials']=[{'name':'mat','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicRoughnessTexture':{'index':1},'metallicFactor':1,'roughnessFactor':1},'normalTexture':{'index':2}}]
    g.j['meshes']=[{'name':ch+'_mesh','primitives':[{'attributes':attrs,'indices':ia,'material':0}]}]
    # nos: 0 raiz, 1 malha, 2.. ossos
    nodes=[{'name':ch.capitalize()+'Root','children':[1,2]},{'name':ch+'_mesh','mesh':0,'skin':0}]
    nid={}
    allb=list(bones)+[b for b in Pj if b not in bones]
    for b in allb: nid[b]=len(nodes); nodes.append({'name':'mixamorig'+b if not b.startswith(('Tail','Cape')) else b})
    for b in allb:
        par=PARENT_X.get(b) if b in PARENT_X else PARENT.get(b)
        p=Pj[b]
        if par is None: nodes[nid[b]]['translation']=[float(x) for x in p]
        else:
            nodes[nid[par]].setdefault('children',[]).append(nid[b]); nodes[nid[b]]['translation']=[float(x) for x in (p-Pj[par])]
    # raiz recebe Hips como filho no índice 2
    g.j['nodes']=nodes; g.j['scenes'][0]['nodes']=[0]
    ibm=np.zeros((len(allb),16),'<f4')
    for k,b in enumerate(allb):
        M4=np.eye(4); M4[:3,3]=-Pj[b]; ibm[k]=M4.T.reshape(-1)
    g.j['skins']=[{'joints':[nid[b] for b in allb],'inverseBindMatrices':g.accessor(ibm.reshape(-1,16),5126,'MAT4'),'skeleton':nid['Hips']}]
    g.skin_bones=allb; g.nid=nid; g.Pj=Pj
    if anims: anims(g,nid,Pj)
    path=out or f'/home/claude/rig/out/{ch}_rig.glb'; g.save(path); print('saved',path,len(open(path,'rb').read())/1e6,'MB')
    return g
PARENT_X={}
def build_sk(ch):
    P,E=globals()['build_skel'](SPECS[ch]); return P,E
import skeleton as _sk
build_skel=_sk.build
if __name__=='__main__':
    build(sys.argv[1])
