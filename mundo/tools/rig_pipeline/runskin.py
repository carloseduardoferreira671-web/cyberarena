import sys; sys.path.insert(0,'/home/claude/rig')
from skin import *
import pickle
ch=sys.argv[1]; M=load_mesh(ch); Pj,Ej=build(SPECS[ch])
bones=[k for k in PARENT]  # todos os ossos
Dg,De,dv=compute_weights(ch,M['P'],M['idx'],Pj,Ej,bones)
pickle.dump(dict(bones=bones,Dg=Dg,De=De,dv=dv),open(f'/home/claude/rig/dist_{ch}.pkl','wb'))
print('saved',Dg.shape,'max vox dist',dv.max())
