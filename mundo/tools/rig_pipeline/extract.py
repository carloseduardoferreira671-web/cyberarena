import sys,json,os
sys.path.insert(0,'/home/claude')
from glbinfo import load
import meshopt, numpy as np
from PIL import Image
import io
os.makedirs('/home/claude/new',exist_ok=True)
for p in ['752b47','7e19a4','3671c8']:
    j,b=load(f'/mnt/user-data/uploads/photo-model-{p}.glb')
    def ext(i):
        e=j['bufferViews'][i]['extensions']['EXT_meshopt_compression']; return e,b[e['byteOffset']:e['byteOffset']+e['byteLength']]
    e,d=ext(3); pos=meshopt.exp_filter(meshopt.decode_vertex(d,e['count'],12),e['count'],12)
    e,d=ext(4); nrm=meshopt.decode_vertex(d,e['count'],4)[:,:3].view(np.int8).astype(np.float32)/127.0
    e,d=ext(5); uv=meshopt.exp_filter(meshopt.decode_vertex(d,e['count'],8),e['count'],8)
    e,d=ext(6); idx=meshopt.decode_index(d,e['count']).reshape(-1,3)
    n=len(pos)
    bad=((idx[:,0]==idx[:,1])|(idx[:,1]==idx[:,2])|(idx[:,0]==idx[:,2])).sum()
    print(p,'verts',n,'tris',len(idx),'maxidx',idx.max(),'degenerate',bad,'pos',pos.min(0),pos.max(0))
    np.savez(f'/home/claude/new/{p}.npz',pos=pos,nrm=nrm,uv=uv,idx=idx)
    for k,(bi,nm) in enumerate([(0,'color.jpg'),(1,'orm.jpg'),(2,'normal.png')]):
        bv=j['bufferViews'][bi]; o=bv['byteOffset']; open(f'/home/claude/new/{p}_{nm}','wb').write(b[o:o+bv['byteLength']])
    im=Image.open(f'/home/claude/new/{p}_color.jpg'); print(' tex',im.size)
