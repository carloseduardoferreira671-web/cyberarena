import numpy as np, json, os
from PIL import Image
from skeleton import *
OUT='/home/claude/work/CyberArena_dev/cyber_viewer/assets'
d=np.load('mesh_raw.npz');P=d['P'];pos_idx=d['pos_idx'];uv=d['uv'];nr=d['nr'];idx=d['idx']
s=np.load('skin_s16.npz');SI,SW=s['SI'],s['SW']
nV=len(pos_idx)
pos=P[pos_idx].astype('<f4');nrm=nr.astype('<f4');nrm/=np.linalg.norm(nrm,axis=1,keepdims=True)+1e-9
uvf=np.c_[uv[:,0],1-uv[:,1]].astype('<f4')
si=SI[pos_idx].astype('u1')
w=np.round(SW[pos_idx]*255).astype(int)
# corrigir soma para exatamente 255 no peso dominante
w[:,0]+=255-w.sum(1);assert (w>=0).all() and (w.sum(1)==255).all()
sw=w.astype('u1')
ind=idx.astype('<u2');assert idx.max()<65536
blobs=[('pos',pos),('nrm',nrm),('uv',uvf),('si',si),('sw',sw),('idx',ind)]
meta={'vertexCount':int(nV),'indexCount':int(len(ind)),'layout':{}}
buf=bytearray();off=0
for name,arr in blobs:
    b=arr.tobytes();meta['layout'][name]={'offset':off,'bytes':len(b),'dtype':str(arr.dtype),'comps':int(arr.shape[1]) if arr.ndim>1 else 1}
    buf+=b;off+=len(b)
    while len(buf)%4:buf+=b'\0';off=len(buf)
open(f'{OUT}/cyber.bin','wb').write(buf)
meta['bounds']={'min':P.min(0).round(4).tolist(),'max':P.max(0).round(4).tolist()}
meta['skeleton']={'names':NAMES,'parent':PARENT,'head':[list(h) for h in HEAD],'tail':[list(t) for t in TAIL]}
json.dump(meta,open(f'{OUT}/cyber.json','w'),separators=(',',':'))
im=Image.open('/home/claude/work/v134/character_sources/scripts/Cyber_3d.png').convert('RGB')
im.save(f'{OUT}/cyber_tex.webp','WEBP',quality=88,method=6)
print('cyber.bin',os.path.getsize(f'{OUT}/cyber.bin')//1024,'KB | json',os.path.getsize(f'{OUT}/cyber.json')//1024,'KB | tex webp',os.path.getsize(f'{OUT}/cyber_tex.webp')//1024,'KB (png original 4017 KB)')
print('vertices',nV,'indices',len(ind))
