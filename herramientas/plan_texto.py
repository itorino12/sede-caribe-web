"""Lee el texto de un plan de estudios de la UCR (formato «estructura curricular»).

El texto sale de `pdftotext -layout <plan>.pdf` y está en herramientas/fuentes/planes/.
"""
import re
SIGRE=r'(?:[A-Z]{1,3}\s?-\s?\d{3,4}|[A-Z]{1,3}\d{4}|[A-Z]{1,3}-(?:I{1,3}|IV)?)'
def cols(l):
    # tokens separados por 2+ espacios, con su columna
    return [(m.start(),m.group(0).strip()) for m in re.finditer(r'\S+(?:\s\S+)*',l) if True] if False else [(m.start(),m.group(0)) for m in re.finditer(r'\S(?:.*?\S)?(?=\s{2,}|$)',l)]
def parse(path):
    ciclo=None; bloque=''; cursos=[]; subt={}; ult=None; lista=None; hr=hc=0
    for raw in open(path,encoding='utf8'):
        l=raw.rstrip()
        if not l.strip(): continue
        u=l.upper().strip()
        m=re.match(r'^([IVX]+) CICLO\b',u)
        if m: ciclo=m.group(1); lista=None; ult=None; continue
        if re.match(r'^(BLOQUE COMÚN|ÉNFASIS|ENFASIS)',u) or (re.match(r'^(LICENCIATURA|BACHILLERATO|DIPLOMADO)\b',u) and len(u)<70 and ciclo is None): bloque=u; ult=None; continue
        if re.search(r'LISTA DE CURSOS|BLOQUE OPTATIVO DEL',u) and not re.match(r'^'+SIGRE,u): lista=u; ciclo=None; ult=None; continue
        if re.fullmatch(r'TOTAL.*',u) or re.match(r'^TOTAL ',u): ciclo=None if False else ciclo; 
        if 'SUBTOTAL' in u:
            n=re.findall(r'\d+',u.split('SUBTOTAL')[1]); subt[(bloque,ciclo)]=int(n[-1]); ult=None; continue
        mh=re.search(r'(?<!CO)REQUISITOS',u); mc=re.search(r'CORREQUISITOS',u)
        if mh and mc: hr=mh.start()+4; hc=mc.start()+6; ult=None; continue
        if re.search(r'^TOTAL|\bTOTAL\b.*\d|SEGÚN INFORME|NIVEL Y|^SIGLA|^NOTAS|ACTUALIZADO|^EN:|NOMBRE DEL CURSO',u): ult=None; continue
        if re.match(r'^\d ?AÑO|^(PRIMER|SEGUNDO|TERCER|CUARTO|QUINTO|SEXTO) AÑO',u): ult=None; continue
        t=cols(l)
        if len(t)>=2 and (ciclo or lista):
            x0,s0=t[0]
            mm=re.match(r'^('+SIGRE+r')(?:\s+(.+))?$',s0)
            if mm and x0<4 and (mm.group(2) or len(t)>=5):
                sig=mm.group(1).replace(' ',''); 
                resto=t[1:]
                nombre=mm.group(2) if mm.group(2) else resto.pop(0)[1]
                if re.fullmatch(r'\d+',resto[-1][1]) and len(resto)>=2:
                    cred=int(resto[-1][1]); medio=resto[:-1]
                    horas=[x for x in medio if re.fullmatch(r'[-\s\d]+',x[1]) and not re.fullmatch(r'-{3,}',x[1])]
                    celdas=[x for x in medio if x not in horas]
                    rq=[];co=[]
                    for x,s_ in celdas:
                        c=x+len(s_)/2
                        (rq if abs(c-hr)<=abs(c-hc) else co).append((x,s_))
                    rtxt=' '.join(s_ for _,s_ in rq); ctxt=' '.join(s_ for _,s_ in co)
                    ult={'sigla':sig,'nombre':nombre,'ciclo':ciclo if not (lista and not ciclo) else None,'lista':lista if not ciclo else None,'bloque':bloque,'cred':cred,'req':rtxt or '---','coreq':ctxt or '---','rc':hr-4,'cc':hc-4,'horas':' '.join(x[1] for x in horas)}
                    cursos.append(ult); continue
        if ult:
            # continuación
            for x,s in t:
                if re.fullmatch(r'[-\s\d]+',s): continue
                if x>=ult['cc']-4: ult['coreq']=(ult['coreq']+' '+s) if ult['coreq'] not in('---','----') else s
                elif x>=ult['rc']-4: ult['req']=(ult['req']+' '+s) if ult['req'] not in('---','----') else s
                else: ult['nombre']+=' '+s
    return cursos,subt
def resumen(path,ver=False):
    c,s=parse(path); por={}
    for x in c:
        if x['ciclo']: por[(x['bloque'],x['ciclo'])]=por.get((x['bloque'],x['ciclo']),0)+x['cred']
    mal=[(k,por.get(k),s.get(k)) for k in set(por)|set(s) if por.get(k)!=s.get(k)]
    print(path,len(c),'cursos; desajustes:',mal)
    if ver:
        for x in c: print(x['ciclo'],x['sigla'],x['cred'],'|',x['req'],'|',x['coreq'],'|',x['nombre'])
    return c
if __name__=='__main__':
    import sys; resumen(sys.argv[1],len(sys.argv)>2)
