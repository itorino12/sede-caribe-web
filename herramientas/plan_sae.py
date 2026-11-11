#!/usr/bin/env python3
"""Lee el «fascículo» del SAE (Sistema de Aplicaciones Estudiantiles) de una carrera y devuelve cursos como plan_texto.parse.

Los fascículos traen las siglas sin guion (LM1001), los requisitos con «Equiv.:» y a veces el número de ciclo
suelto en otra línea; por eso el ciclo se lleva con las líneas «Créditos ciclo N» y se valida contra ellas.
"""
import re

ROM = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]
SIG = r"[A-Z]{2}\d{4}|[A-Z]{2,3}-\w*|OPT\d{4}"
INICIO = re.compile(r"^\s*(\d{1,2})?\s+(%s)(?:\s{2,}|\s*$)(.*)$" % SIG)
RUIDO = re.compile(r"Universidad de|Sistema de Aplic|Módulo Planes|Página|FASCÍCULO|Escuela:|^\s*Carrera|Plan de Estudio|Enfasis|^Ciclo|Grado:|Total|Observaciones|\*Horas\*|^\s*Curso\s|Programa:|Fecha|^\s*SIGLA")


def norm(s):
    s = re.sub(r"\b([A-Z]{2})(\d{4})\b", r"\1-\2", s)
    return s


def sigla(s):
    if s.startswith("OPT"):
        return "OPT-"
    if s == "RP-1":
        return "RP-"
    m = re.fullmatch(r"([A-Z]{2})(\d{4})", s)
    return "%s-%s" % m.groups() if m else s


def parse(path):
    L = open(path, encoding="utf8").read().split("\n")
    cursos, cur, ciclo, lista = [], None, 1, None
    cred_h = rq = cq = None
    sumas = {}
    for l in L:
        if "Cred." in l and "Requisitos" in l:
            rq, cq = l.index("Requisitos"), l.index("Correquisitos")
            cred_h = l.index("Cred.") if l.index("Cred.") < rq else None
        if "Bloques Optativos" in l:
            lista, ciclo, cur = "LISTA DE CURSOS OPTATIVOS", None, None
            continue
        m = re.search(r"Créditos ciclo (\d+) : (\d+)", l)
        if m:
            sumas[int(m.group(1))] = int(m.group(2))
            ciclo = int(m.group(1)) + 1
            cur = None
            continue
        m = INICIO.match(l)
        if m and not RUIDO.search(l):
            pre, sg, resto = m.groups()
            if pre and lista is None:
                ciclo = int(pre)
            hm = re.match(r"^(.*?)\s*(\d+)\s+(\d)\s+(\d)(?=\s|$)(.*)$", resto)
            if sg.startswith("OPT"):
                nombre, horas, tail = resto.strip(), "", ""
                ent = re.findall(r"\d+", resto)
                cur = dict(sigla=sigla(sg), nombre=re.sub(r"\s+\d+\s*$", "", nombre) if False else nombre.rsplit(None, 1)[0], cred=int(ent[-1]), req="", coreq="", ciclo=ROM[ciclo - 1] if ciclo else None)
            elif hm:
                nombre, t, p, ll, tail = hm.groups()
                # la cola: [TP] [cred] requisitos / correquisitos (química lleva la cred al final)
                pos0 = len(l) - len(tail)
                partes = [(pos0 + x.start(), x.group().strip()) for x in re.finditer(r"\S.*?(?=\s{3,}|$)", tail)]
                enteros = []
                while partes and re.fullmatch(r"\d+", partes[0][1]) and (cred_h is None or True):
                    enteros.append(int(partes.pop(0)[1]))
                cred = None
                req = coreq = ""
                if partes and re.fullmatch(r"\d+", partes[-1][1]) and cq and partes[-1][0] > cq + 20:
                    cred = int(partes.pop()[1])  # química: la cred va al final
                elif enteros:
                    cred = enteros[-1]
                for pos, tx in partes:
                    if cq and pos >= cq - 4:
                        coreq += (" " if coreq else "") + tx
                    else:
                        req += (" " if req else "") + tx
                if cred is None and enteros:
                    cred = enteros[-1]
                cur = dict(sigla=sigla(sg), nombre=nombre.strip(), cred=cred, req=norm(req), coreq=norm(coreq), ciclo=ROM[ciclo - 1] if lista is None else None)
            else:
                cur = dict(sigla=sigla(sg), nombre=resto.strip(), cred=None, req="", coreq="", ciclo=ROM[ciclo - 1] if lista is None else None)
            cur["lista"] = lista
            cur["bloque"] = ""
            cursos.append(cur)
            continue
        if cur and l.strip() and not RUIDO.search(l) and not re.fullmatch(r"\s*\d+\s*", l):
            col = len(l) - len(l.lstrip())
            tx = norm(l.strip())
            if rq and col >= rq - 4:
                if cq and col >= cq - 4:
                    cur["coreq"] = (cur["coreq"] + " " + tx).strip()
                else:
                    cur["req"] = (cur["req"] + " " + tx).strip()
            elif cur["cred"] is None and re.match(r"^\d+(\s+\d+)+", tx):
                tok = tx.split()
                ent = []
                while tok and tok[0].isdigit():
                    ent.append(int(tok.pop(0)))
                cur["cred"] = ent[-1]  # el nombre ocupó una línea y las horas y la cred. cayeron en la siguiente
                cur["req"] = " ".join(tok)
            elif cur.get("lista") and re.fullmatch(r"[A-ZÁÉÍÓÚÑ ,.:()/-]+", tx):
                cur["nombre"] += " " + tx  # nombre de un curso optativo que sigue en la línea de abajo
            else:
                cur.setdefault("_sueltas", []).append(tx)
    return cursos, sumas


if __name__ == "__main__":
    import sys
    cs, sumas = parse(sys.argv[1])
    por = {}
    for c in cs:
        if c["ciclo"]:
            por[c["ciclo"]] = por.get(c["ciclo"], 0) + (c["cred"] or 0)
    print("créditos por ciclo:", {k: v for k, v in por.items()}, "\nSAE:", {ROM[k - 1]: v for k, v in sumas.items()})
    for c in cs:
        print(c["ciclo"], c["sigla"], c["cred"], c["nombre"], "|", c["req"], "|", c["coreq"], c.get("_sueltas", ""))
