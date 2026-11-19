import numpy as np, struct
def decode_vertex(buf, count, size):
    assert buf[0]==0xa0, hex(buf[0])
    data=1
    tail=bytearray(buf[len(buf)-size:])
    last=bytearray(tail)
    out=np.zeros((count,size),dtype=np.uint8)
    bs=min(256,(8192//size)&~15)
    off=0
    while off<count:
        n=min(bs,count-off)
        al=(n+15)&~15
        for k in range(size):
            hdr_size=((al//16)+3)//4
            hdr=buf[data:data+hdr_size]; data+=hdr_size
            col=bytearray(al)
            for g in range(al//16):
                bl=(hdr[g//4]>>((g%4)*2))&3
                if bl==0: continue
                if bl==3:
                    col[g*16:g*16+16]=buf[data:data+16]; data+=16
                else:
                    bits=2 if bl==1 else 4
                    nb=4 if bl==1 else 8
                    packed=buf[data:data+nb]; nxt=data+nb
                    mask=(1<<bits)-1
                    for i in range(16):
                        bi=i*bits
                        byte=packed[bi>>3]
                        enc=(byte>>(8-bits-(bi&7)))&mask
                        if enc==mask:
                            col[g*16+i]=buf[nxt]; nxt+=1
                        else: col[g*16+i]=enc
                    data=nxt
            p=last[k]
            for i in range(n):
                z=col[i]
                d=(-(z&1))^(z>>1)
                p=(p+d)&0xff
                out[off+i,k]=p
        last=bytearray(out[off+n-1].tobytes())
        off+=n
    return out
def exp_filter(raw,count,size):
    u=np.frombuffer(raw.tobytes(),dtype='<u4').reshape(count,size//4).astype(np.int64)
    ex=((u>>24)&0xff).astype(np.int64); ex=np.where(ex>=128,ex-256,ex)
    m=(u&0xffffff); m=np.where(m>=0x800000,m-0x1000000,m)
    return (m*np.exp2(ex.astype(np.float64))).astype(np.float32)
def decode_index(buf,count):
    assert buf[0]==0xe1 or buf[0]==0xe0
    codes=1; data=1+count//3
    aux=buf[len(buf)-16:]
    ef=[(0,0)]*16; eo=0; vf=[0]*16; vo=0
    nxt=0; last=0
    out=np.zeros(count,dtype=np.uint32)
    def vbyte():
        nonlocal data
        lead=buf[data]; data+=1
        if lead<128: return lead
        r=lead&127; sh=7
        for _ in range(4):
            g=buf[data]; data+=1
            r|=(g&127)<<sh; sh+=7
            if g<128: break
        return r
    def dec_idx():
        nonlocal last
        v=vbyte(); d=(v>>1)^(-(v&1)); last=(last+d)&0xffffffff; return last
    for i in range(0,count,3):
        ct=buf[codes]; codes+=1
        if ct<0xf0:
            fe=ct>>4
            a,b=ef[(eo-1-fe)&15]
            fec=ct&15
            if fec==0: c=nxt; nxt+=1; vf[vo]=c; vo=(vo+1)&15
            elif fec==15: c=dec_idx(); vf[vo]=c; vo=(vo+1)&15
            elif fec==13 or fec==14:
                c=(last+(-1 if fec==13 else 1))&0xffffffff; last=c; vf[vo]=c; vo=(vo+1)&15
            else: c=vf[(vo-1-fec)&15]
            out[i:i+3]=(a,b,c)
            ef[eo]=(c,b); eo=(eo+1)&15
            ef[eo]=(a,c); eo=(eo+1)&15
        else:
            if ct<0xfe:
                ca=aux[ct&15]; fea=0; feb=ca>>4; fec=ca&15
            else:
                ca=buf[data]; data+=1
                fea=0 if ct==0xfe else 15; feb=ca>>4; fec=ca&15
            a=b=c=0
            a = nxt if fea==0 else 0
            if fea==0: nxt+=1
            if feb==0: b=nxt; nxt+=1
            else: b=vf[(vo-feb)&15]
            if fec==0: c=nxt; nxt+=1
            else: c=vf[(vo-fec)&15]
            if fea==15: a=dec_idx()
            if feb==15: b=dec_idx()
            if fec==15: c=dec_idx()
            vf[vo]=a; vo=(vo+1)&15
            if feb==0 or feb==15: vf[vo]=b; vo=(vo+1)&15
            if fec==0 or fec==15: vf[vo]=c; vo=(vo+1)&15
            out[i:i+3]=(a,b,c)
            ef[eo]=(b,a); eo=(eo+1)&15
            ef[eo]=(c,b); eo=(eo+1)&15
            ef[eo]=(a,c); eo=(eo+1)&15
    return out
