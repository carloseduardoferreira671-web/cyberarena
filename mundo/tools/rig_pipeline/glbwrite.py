import json, struct, numpy as np
def pad4(b,fill=b'\x00'):
    r=(-len(b))%4
    return b+fill*r
class GLB:
    def __init__(s):
        s.bin=bytearray(); s.bvs=[]; s.acc=[]; s.j={'asset':{'version':'2.0','generator':'cyberarena-rig'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'skins':[],'animations':[]}
    def bufview(s,data,target=None):
        data=bytes(data)
        off=len(s.bin); s.bin+=pad4(data)
        bv={'buffer':0,'byteOffset':off,'byteLength':len(data)}
        if target: bv['target']=target
        s.bvs.append(bv); return len(s.bvs)-1
    def accessor(s,arr,ctype,typ,target=None,minmax=False,normalized=False):
        arr=np.ascontiguousarray(arr)
        bv=s.bufview(arr.tobytes(),target)
        a={'bufferView':bv,'componentType':ctype,'count':int(arr.shape[0]),'type':typ}
        if normalized: a['normalized']=True
        if minmax:
            a['min']=arr.reshape(arr.shape[0],-1).min(0).tolist(); a['max']=arr.reshape(arr.shape[0],-1).max(0).tolist()
        s.acc.append(a); return len(s.acc)-1
    def image(s,data,mime):
        bv=s.bufview(data); s.j['images'].append({'bufferView':bv,'mimeType':mime}); return len(s.j['images'])-1
    def save(s,path):
        j=s.j; j['bufferViews']=s.bvs; j['accessors']=s.acc; j['buffers']=[{'byteLength':len(s.bin)}]
        for k in ('skins','animations','textures','images','materials','meshes','nodes'):
            if not j[k]: del j[k]
        js=pad4(json.dumps(j,separators=(',',':')).encode(),b' ')
        bn=pad4(bytes(s.bin))
        out=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bn))
        out+=struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bn),0x004E4942)+bn
        open(path,'wb').write(out)
