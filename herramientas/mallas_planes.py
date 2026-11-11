#!/usr/bin/env python3
"""Arma la malla interactiva de las carreras a partir del texto de su plan de estudios.

Uso: python3 herramientas/mallas_planes.py [id-de-carrera ...]
Lee herramientas/fuentes/planes/<archivo>.txt y escribe la clave «malla» en
src/data/carreras/<id>.json (el resto del archivo no se toca).
El texto se obtiene con `pdftotext -layout` del plan oficial (enlace en «planes» de cada carrera).
"""
import json, re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from plan_texto import parse
import plan_sae

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PALETA = [("#0A6AA6", "#5AAEE0"), ("#00796B", "#4DB6A8"), ("#5A47A6", "#A595E6"), ("#A8550A", "#E8A060"),
          ("#B0306A", "#E58BB5"), ("#3B6E2C", "#8CC27A"), ("#7A5C00", "#D9B550"), ("#5F6B78", "#A9B4BF")]
MINUS = {"de", "del", "la", "las", "los", "el", "y", "e", "o", "u", "en", "para", "a", "con", "por", "al", "un", "una", "sin", "sobre", "según", "su", "sus"}
SIGLAS_MAYUS = {"TCU", "OMA", "OMC", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "TIC", "IT", "ITP", "CD", "UCR", "SAE", "PEM", "ISO", "ISPS", "STCW", "SOLAS", "MARPOL", "GMDSS", "SIG", "OMI", "ISM", "ISPS", "BIM", "CAD", "ISPM"}
ROMANOS = re.compile(r"^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$", re.I)


def titulo(txt):
    txt = re.sub(r"\s+", " ", txt).strip()
    txt = re.sub(r"\s*\d/$", "", txt)  # llamadas de nota: «PRECÁLCULO 1/»
    out = []
    for i, w in enumerate(txt.split(" ")):
        b = w.lower()
        core = re.sub(r"[^\wáéíóúüñ]", "", b)
        if ROMANOS.match(core) and core not in ("i",) or core.upper() in SIGLAS_MAYUS and len(core) > 1 or (core == "i" and i > 0):
            out.append(w.upper())
        elif i > 0 and b in MINUS:
            out.append(b)
        else:
            out.append(re.sub(r"^([\W_]*)(\w)", lambda m: m.group(1) + m.group(2).upper(), b))
    return " ".join(out)


def siglas_en(txt):
    return re.findall(r"[A-Z]{1,3}-\s?\d{3,4}|[A-Z]{1,3}-(?:I|II)\b", txt or "")


def limpia(txt):
    t = re.sub(r"\s+", " ", txt or "").strip()
    t = re.sub(r"([A-Z]{1,3}-)\s(\d)", r"\1\2", t)
    return "" if re.fullmatch(r"-+", t) else t


def req_sae(txt, existentes, lista_equiv=False):
    """Siglas de la malla que exige un requisito del SAE. «X Equiv.: Y» pone entre Y los equivalentes de planes anteriores:
    se ignoran, salvo que X no esté en la malla (entonces vale el equivalente que sí esté); lo que sigue a un «Equiv.:»
    se descarta hasta que otro elemento traiga su propio «Equiv.:» (los casos que esto no resuelve van en «req_extra»)."""
    out, tras = [], False
    for item in (txt or "").split(";"):
        if "Equiv.:" in item:
            x, eq = item.split("Equiv.:", 1)
            xs = [s.replace(" ", "") for s in siglas_en(x)]
            out += [s for s in xs if s in existentes] or [s.replace(" ", "") for s in siglas_en(eq) if s.replace(" ", "") in existentes]
            tras = lista_equiv
        elif not tras:
            out += [s.replace(" ", "") for s in siglas_en(item) if s.replace(" ", "") in existentes]
    return out


def construir(cfg):
    ruta = os.path.join(RAIZ, "herramientas", "fuentes", "planes", cfg.get("archivo", ""))
    cursos_raw, _ = cfg["fuente"]() if "fuente" in cfg else (plan_sae.parse(ruta) if cfg.get("sae") else parse(ruta))
    for x in cursos_raw:
        x["nombre"] = cfg.get("nombres", {}).get(x["sigla"], x["nombre"])
    en_ciclos = [x for x in cursos_raw if x["ciclo"]]
    # ciclos: orden de aparición por (clave de tramo, ciclo)
    cic_def = cfg["ciclos"](en_ciclos)
    por_ciclo = {c["n"]: c for c in cic_def}
    cursos, vistos = [], set()
    for x in en_ciclos:
        n = cfg["ciclo_de"](x)
        if n is None:
            continue
        sig = x["sigla"]
        optativo = sig.startswith("OPT")
        if optativo and cfg.get("opt_uno") and any(c["ciclo"] == n and c.get("optativo") for c in cursos):
            continue  # un solo marcador de optativo por ciclo (los énfasis lo repiten)
        if optativo:
            sig = "OPT-%s-%d" % (n, sum(1 for c in cursos if c["ciclo"] == n and c.get("optativo")) + 1)
        elif sig in vistos:
            continue
        elif sig in ("EG-", "RP-", "EF-", "CN-"):
            pass
        vistos.add(sig)
        if x["sigla"] in ("EG-", "RP-", "EF-"):
            sig = x["sigla"] if x["sigla"] not in [c["sigla"] for c in cursos] else sig + n
        cursos.append({"sigla": sig, "nombre": cfg["nombre_opt"] if optativo and cfg.get("nombre_opt") else titulo(x["nombre"]), "ciclo": n, "creditos": x["cred"], "_r": limpia(x["req"]), "_c": limpia(x["coreq"]),
                       "optativo": optativo, "_x": x})
    existentes = {c["sigla"] for c in cursos}
    for c in cursos:
        x = c.pop("_x")
        r, co = c.pop("_r"), c.pop("_c")
        c["area"] = cfg["area_de"](c, x)
        reqs = req_sae(r, existentes, cfg.get("equiv_lista")) if cfg.get("sae") else [s.replace(" ", "") for s in siglas_en(r)]
        orden = {k["n"]: i for i, k in enumerate(cic_def)}
        pos = {k["sigla"]: orden[k["ciclo"]] for k in cursos}
        reqs = [s for s in dict.fromkeys(reqs) if s in existentes and s != c["sigla"] and pos[s] < pos[c["sigla"]]]
        c["req"] = reqs
        if cfg.get("sae"):
            r, co = r.replace("; ", ", ") if "Equiv" not in r else r, co.replace("; ", ", ") if "Equiv" not in co else co
        if r and (r != ", ".join(reqs)):
            c["req_texto"] = r
        cors = req_sae(co, existentes, cfg.get("equiv_lista")) if cfg.get("sae") else [s.replace(" ", "") for s in siglas_en(co)]
        cors = [s for s in dict.fromkeys(cors) if s in existentes and s != c["sigla"] and pos[s] == pos[c["sigla"]]]
        if cors:
            c["coreq"] = cors
        if co and (co != ", ".join(cors)):
            c["coreq_texto"] = co
        h = x.get("horas", "")
        if c["optativo"]:
            c["etiqueta"] = "Optativo"
        if c["sigla"] in cfg.get("renombrar", {}):
            c["nombre"] = cfg["renombrar"][c["sigla"]]
        for k, v in cfg.get("notas", {}).items():
            if c["sigla"] == k:
                c["nota"] = v
        if c["sigla"] in cfg.get("fijo", {}):
            c.update(cfg["fijo"][c["sigla"]])  # corrige lo que el PDF mezcla entre columnas
        for k, v in cfg.get("req_extra", {}).items():
            if c["sigla"] == k:
                c["req"] = list(dict.fromkeys(c["req"] + v))
    # créditos por ciclo
    for c in cic_def:
        s = sum(x["creditos"] for x in cursos if x["ciclo"] == c["n"])
        c["creditos"] = cfg.get("creditos_ciclo", {}).get(c["n"], s)
        c["nombre"] = cfg.get("nombre_ciclo", {}).get(c["n"], c["nombre"])
    # optativos (listas)
    optativos = {}
    for x in cursos_raw:
        if x["lista"] and cfg.get("lista_de"):
            k = cfg["lista_de"](x)
            if k:
                d = {"sigla": x["sigla"], "nombre": titulo(x["nombre"]), "creditos": x["cred"]}
                r = limpia(x["req"])
                if r:
                    d["req_texto"] = r
                optativos.setdefault(k, []).append(d)
    areas = []
    cred_area = {}
    for c in cursos:
        cred_area[c["area"]] = cred_area.get(c["area"], 0) + c["creditos"]
    for i, a in enumerate(cfg["areas"]):
        col = a.get("paleta", i)
        areas.append({"id": a["id"], "nombre": a["nombre"], "corto": a.get("corto", a["nombre"]), "color": PALETA[col][0], "oscuro": PALETA[col][1],
                      "descripcion": a["descripcion"], "creditos": cred_area.get(a["id"], 0)})
    m = {"plan": cfg["plan"], "total": cfg["total"], "tcu": cfg.get("tcu"), "resumen_creditos": cfg["resumen"], "nota_fuente": cfg["nota_fuente"],
         "areas": areas, "ciclos": cic_def, "cursos": cursos}
    if optativos:
        m["optativos"] = optativos
        m["titulo_optativos"] = cfg.get("titulo_optativos", "Cursos optativos")
        m["listas_optativos"] = cfg["listas_optativos"]
    return m


def revisar(cfg, m):
    sig = {c["sigla"] for c in m["cursos"]}
    malos = [(c["sigla"], r) for c in m["cursos"] for r in c["req"] + c.get("coreq", []) if r not in sig]
    sin_area = [c["sigla"] for c in m["cursos"] if c["area"] not in {a["id"] for a in m["areas"]}]
    print("%s: %d cursos, %d créditos en cursos, ciclos %s" % (cfg["id"], len(m["cursos"]), sum(c["creditos"] for c in m["cursos"]), [(c["n"], c["creditos"]) for c in m["ciclos"]]))
    if malos or sin_area:
        print("  PROBLEMAS", malos, sin_area)
    for a in m["areas"]:
        print("  %-5s %3d cr  %s" % (a["id"], a["creditos"], a["corto"]))


if __name__ == "__main__":
    from mallas_config import CARRERAS
    ids = sys.argv[1:] or list(CARRERAS)
    for i in ids:
        cfg = CARRERAS[i]
        m = construir(cfg)
        revisar(cfg, m)
        ruta = os.path.join(RAIZ, "src", "data", "carreras", i + ".json")
        d = json.load(open(ruta, encoding="utf8"))
        d["malla"] = m
        json.dump(d, open(ruta, "w", encoding="utf8"), ensure_ascii=False, indent=2)
        open(ruta, "a").write("\n")
