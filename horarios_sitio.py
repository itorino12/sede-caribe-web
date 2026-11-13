"""Arma la página «Horario de aulas»: los cursos de la guía de Registro, ubicados por carrera y ciclo del plan.

Entradas: src/data/horarios-<ciclo>.json (guía de Registro, la saca herramientas/horarios_guia.py),
las mallas de src/data/carreras/<id>.json (carrera y ciclo de cada sigla) y src/data/aulas.json (aula -> lugar del recorrido 3D).

Reglas de ubicación:
- Un curso que está en la malla de una carrera aparece en el ciclo que le toca en esa carrera (y en cada carrera que lo lleve).
  Con el nombre completo de la malla, no el abreviado de Registro.
- EG, SR, EF y RP (Estudios Generales, seminarios de realidad nacional, deportes y repertorio) van en «Generales».
- Lo demás (seminarios de graduación, planes anteriores, cursos de servicio) va en «Cursos complementarios».
"""
import re

DIAS = {"lunes": "Lun", "martes": "Mar", "miércoles": "Mié", "jueves": "Jue", "viernes": "Vie", "sábado": "Sáb", "domingo": "Dom"}
ORDEN_DIA = list(DIAS)
MODALIDAD = {"PRESENCIAL": "", "BIMODAL": "Bimodal", "VIRTUAL": "Virtual", "BAJO VIRTUAL": "Bajo virtual", "ALTO VIRTUAL": "Alto virtual"}

# Registro abreviaba o escribía sin tilde estos nombres; aquí van completos.
NOMBRES = {
    "EG0318": "Apreciación de las artes plásticas", "EG0319": "Taller de artes plásticas", "EG0323": "Apreciación musical",
    "SR0002": "Seminario de realidad nacional I: producción y desarrollo", "SR0004": "Seminario de realidad nacional I: medio ambiente",
    "SR0005": "Seminario de realidad nacional I: educación", "SR0008": "Seminario de realidad nacional I: desarrollo comunal",
    "SR0022": "Seminario de realidad nacional II: producción y desarrollo", "SR0044": "Seminario de realidad nacional II: medio ambiente",
    "SR0055": "Seminario de realidad nacional II: educación, hombre y sociedad", "SR0088": "Seminario de realidad nacional II: desarrollo comunal",
    "EF6201": "Actividad deportiva: voleibol principiante mixto", "HA3016": "Historia contemporánea de Costa Rica I",
    "CN0071": "Curso básico de embarque (OMI 1.13, 1.19, 1.20, 1.21 y 3.26)", "CN0105": "Buques petroleros y quimiqueros (OMI 1.01, 1.02, 1.03)",
    "IO6020": "Análisis y aplicación de teorías de la adquisición y aprendizaje de una segunda lengua en la realidad costarricense",
    "CN9801": "Proyecto de graduación II", "GF2510": "Geografía regional de Costa Rica",
}


def _min(h):
    return int(h[:2]) * 60 + int(h[3:])


def _hora(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def _dias(dias):
    t = [DIAS.get(d, d[:3].capitalize()) for d in dias]
    return t[0] if len(t) == 1 else ", ".join(t[:-1]) + " y " + t[-1]


def _franjas(horas):
    """Une los bloques seguidos (09:50 y 10:00) del mismo día y aula en una sola franja."""
    por = {}
    for x in horas:
        por.setdefault((tuple(x["dias"]), x["aula"]), []).append((_min(x["inicio"]), _min(x["fin"])))
    salida = []
    for (dias, aula), bloques in por.items():
        bloques.sort()
        unidos = [list(bloques[0])]
        for i, f in bloques[1:]:
            if i - unidos[-1][1] <= 10:
                unidos[-1][1] = max(unidos[-1][1], f)
            else:
                unidos.append([i, f])
        for i, f in unidos:
            salida.append({"dias": _dias(dias), "rango": f"{_hora(i)}–{_hora(f)}", "aula": aula, "_o": (ORDEN_DIA.index(dias[0]) if dias[0] in ORDEN_DIA else 9, i),
                           "d": [ORDEN_DIA.index(x) for x in dias if x in ORDEN_DIA], "i": i, "f": f})
    salida.sort(key=lambda s: s["_o"])
    for s in salida:
        del s["_o"]
    return salida


def _general(sigla):
    p = sigla[:2]
    if p == "EG":
        return "Curso integrado de humanidades" if sigla in ("EG0124", "EG0125") else "Cursos de arte"
    return {"SR": "Seminarios de realidad nacional", "EF": "Actividades deportivas", "RP": "Repertorio"}.get(p)


def armar(horarios, carreras, aulas):
    cursos = {c["sigla"]: c for c in horarios["cursos"]}
    lugar = {a["aula"]: a["lugar"] for a in aulas["aulas"]}

    def aula(n):
        if n == "9999":
            return {"n": "", "estado": "confirmar"}
        if not n:
            return {"n": "", "estado": "ninguna"}
        return {"n": n, "estado": "ok", "lugar": lugar.get(n)}

    def tarjeta(c, nombre=None, area=None):
        grupos = []
        for g in c["grupos"]:
            fr = _franjas(g["horas"])
            # Para el armador de horario del navegador: «días|inicio|fin|aula;…», con días 0 = lunes y minutos desde la medianoche.
            cod = ";".join(f"{','.join(str(x) for x in f['d'])}|{f['i']}|{f['f']}|{f['aula'] or ''}" for f in fr if f["d"])
            for f in fr:
                f["aula"] = aula(f["aula"])
            unicas = {(f["aula"]["estado"], f["aula"]["n"]) for f in fr}
            grupos.append({"grupo": g["grupo"], "modalidad": MODALIDAD.get(g["modalidad"], g["modalidad"].capitalize()), "cerrado": g["cerrado"],
                           "franjas": fr, "cod": cod, "aula_unica": fr[0]["aula"] if len(unicas) == 1 else None})
        return {"sigla": c["sigla"], "nombre": nombre or NOMBRES.get(c["sigla"]) or c["nombre"], "escuela": c.get("escuela", ""),
                "color": (area or {}).get("color", ""), "oscuro": (area or {}).get("oscuro", ""), "grupos": grupos}

    usados = set()
    salida = []
    for car in carreras:
        malla = (car.get("ficha") or {}).get("malla")
        if not malla:
            continue
        areas = {a["id"]: a for a in malla.get("areas", [])}
        por_ciclo = {x["n"]: {"nombre": x["nombre"], "cursos": []} for x in malla.get("ciclos", [])}
        vistos = set()

        def poner(clave, m, area):
            sigla = re.sub(r"-", "", m["sigla"])
            if not re.fullmatch(r"[A-Z]{2}\d{4}", sigla) or sigla not in cursos or sigla in vistos or _general(sigla):
                return
            vistos.add(sigla); usados.add(sigla)
            por_ciclo.setdefault(clave, {"nombre": "Optativos", "cursos": []})["cursos"].append(tarjeta(cursos[sigla], m["nombre"], area))

        for m in malla.get("cursos", []):
            poner(m["ciclo"], m, areas.get(m.get("area")))
        for grupo, lista in (malla.get("optativos") or {}).items():
            for m in lista:
                poner("optativos", m, areas.get(grupo))
        ciclos = [x for x in por_ciclo.values() if x["cursos"]]
        for x in ciclos:
            x["cursos"].sort(key=lambda t: t["sigla"])
        if ciclos:
            salida.append({"id": car["id"], "nombre": car["nombre"], "grados": car["grados"], "plan": malla.get("plan", ""),
                           "n": len(vistos), "ciclos": ciclos})

    generales = {}
    complementarios = []
    for sigla, c in cursos.items():
        g = _general(sigla)
        if g:
            generales.setdefault(g, []).append(tarjeta(c))
        elif sigla not in usados:
            complementarios.append(tarjeta(c))
    orden = ["Curso integrado de humanidades", "Seminarios de realidad nacional", "Cursos de arte", "Actividades deportivas", "Repertorio"]
    gen = [{"titulo": t, "cursos": sorted(generales[t], key=lambda x: x["sigla"])} for t in orden if t in generales]
    complementarios.sort(key=lambda t: t["sigla"])
    return {"ciclo": horarios["ciclo"], "version": horarios["version"], "generado": horarios["generado"], "fuente": horarios["fuente"],
            "total": len(cursos), "carreras": salida, "generales": gen, "n_generales": sum(len(g["cursos"]) for g in gen),
            "complementarios": complementarios}
