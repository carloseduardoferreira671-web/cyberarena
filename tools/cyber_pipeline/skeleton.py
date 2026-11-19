# Esqueleto do Cyber. Espaço do modelo: Y para cima, personagem olha para +Z, direita do personagem = -X.
# Cada osso: nome, pai, posição da articulação (head) e ponta (tail) usada para o skinning.
def side(s,sx):
    x=lambda v:v*sx
    return [
     (f'clav_{s}','chest',(x(.07),.55,.01),(x(.27),.50,.0),.08),
     (f'uarm_{s}',f'clav_{s}',(x(.27),.50,.0),(x(.33),.26,.0),.11),
     (f'farm_{s}',f'uarm_{s}',(x(.33),.26,.0),(x(.33),.03,.02),.11),
     (f'hand_{s}',f'farm_{s}',(x(.33),.03,.02),(x(.31),-.13,.02),.08),
     (f'thigh_{s}','pelvis',(x(.13),-.03,.0),(x(.17),-.43,.0),.12),
     (f'shin_{s}',f'thigh_{s}',(x(.17),-.43,.0),(x(.17),-.80,-.01),.10),
     (f'foot_{s}',f'shin_{s}',(x(.17),-.80,-.01),(x(.17),-.90,.12),.09),
     (f'toe_{s}',f'foot_{s}',(x(.17),-.90,.12),(x(.17),-.93,.25),.06),
    ]
# direita do personagem = -X
BONES=[('pelvis',None,(0,.02,0),(0,.18,0),.13),
       ('spine','pelvis',(0,.18,0),(0,.38,.01),.14),
       ('chest','spine',(0,.38,.01),(0,.60,0),.17),
       ('neck','chest',(0,.60,0),(0,.66,0),.08),
       ('head','neck',(0,.66,0),(0,.95,0),.20)]
BONES+=side('R',-1)+side('L',+1)
NAMES=[b[0] for b in BONES]
IDX={n:i for i,n in enumerate(NAMES)}
PARENT=[IDX[b[1]] if b[1] else -1 for b in BONES]
HEAD=[b[2] for b in BONES]; TAIL=[b[3] for b in BONES]; RAD=[b[4] for b in BONES]
if __name__=='__main__': print(len(BONES),'ossos:',NAMES)
