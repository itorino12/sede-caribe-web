"""Catálogos del congo: texto armado desde los DATOS del sitio, no desde el HTML.

Por qué existen: las páginas se parten por encabezado y un asistente que busca por similitud solo ve unos
pocos trozos por pregunta. Una pregunta de lista («¿qué carreras ofrece?», «¿qué oficinas hay?») necesita un
trozo que reúna toda la lista, y hay información que el HTML no trae (descripción de cada curso, notas del
plan, resumen de cada carrera y de cada unidad). Aquí se genera ese texto cada vez que se compila, así que una
carrera, un curso o una oficina nueva entra sola, sin editar textos a mano.

`catalogos(c, fecha_larga)` recibe el diccionario que arma `preparar()` de build.py y devuelve páginas con la
forma de congo/paginas.json: {"id", "t", "enlace", "s": [{"h": encabezado, "x": texto}]}.
`id` identifica el documento en el congo; `enlace` es la página real a la que apunta la cita.
"""
import re

LIMITE_BLOQUE = 1000   # el congo parte los textos en fragmentos de hasta 1100 caracteres: un bloque cabe en uno


def _t(*partes, sep=" "):
    return sep.join(str(p).strip() for p in partes if p is not None and str(p).strip())


def _punto(texto):
    texto = (texto or "").strip()
    return texto if not texto or texto[-1] in ".!?:" else texto + "."


def _plural(n, uno, varios):
    return f"{n} {uno if n == 1 else varios}"


def _bloques(h, lineas):
    """Junta líneas en bloques de hasta LIMITE_BLOQUE caracteres, repitiendo el encabezado para que cada
    fragmento diga de qué trata."""
    salida, actual = [], []
    for linea in lineas:
        if actual and sum(len(x) + 1 for x in actual) + len(linea) > LIMITE_BLOQUE:
            salida.append({"h": h, "x": "\n".join(actual)})
            actual = []
        actual.append(linea)
    if actual:
        salida.append({"h": h, "x": "\n".join(actual)})
    return salida


def _es_posgrado(c):
    return "posgrado" in f"{c.get('area', '')} {c.get('grados', '')}".lower()


def _lista_carreras(carreras):
    grado = [c for c in carreras if not _es_posgrado(c)]
    posgrado = [c for c in carreras if _es_posgrado(c)]
    intro = (f"La Sede del Caribe de la Universidad de Costa Rica ofrece {_plural(len(carreras), 'carrera', 'carreras')} "
             f"({_plural(len(grado), 'de grado', 'de grado')}" + (f" y {len(posgrado)} de posgrado" if posgrado else "") + "). ")
    nombres = "; ".join(f"{c['nombre']} ({c['grados']})" for c in carreras)
    secciones = [{"h": "Lista de las carreras de la Sede del Caribe", "x": f"{intro}Son: {nombres}."}]
    por_area = {}
    for c in carreras:
        por_area.setdefault(c.get("area") or "Otras", []).append(c)
    secciones += _bloques("Carreras por área", [f"{area}: " + "; ".join(f"{c['nombre']} ({c['grados']})" for c in cs) + "."
                                               for area, cs in por_area.items()])
    secciones += _bloques("Dónde se imparte cada carrera y cómo contactar a su coordinación", [
        _t(f"{c['nombre']}:", _punto(f"se imparte en {c['recintos']}") if c.get("recintos") else "",
           _punto(f"Código {c['codigo']}") if c.get("codigo") else "",
           _punto(f"Coordina {c['coordinacion']}") if c.get("coordinacion") else "",
           _punto(f"Correo {c['correo']}") if c.get("correo") else "",
           _punto(f"Extensión {c['extension']}") if c.get("extension") else "") for c in carreras])
    secciones += _bloques("En qué consiste cada carrera", [
        _t(f"{c['nombre']}:", _punto(c.get("resumen")), _punto((c.get("ficha") or {}).get("lema"))) for c in carreras
        if c.get("resumen") or (c.get("ficha") or {}).get("lema")])
    return {"id": "catalogo-carreras", "t": "Carreras que ofrece la Sede del Caribe (lista completa)",
            "enlace": "carreras.html", "s": secciones}


def _curso(k, areas):
    horas = k.get("horas") or {}
    detalle = ", ".join(x for x in (f"{horas['teoria']} h de teoría" if horas.get("teoria") else "",
                                    f"{horas['practica']} h de práctica" if horas.get("practica") else "") if x)
    req = k.get("req_texto") or ", ".join(k.get("req") or [])
    coreq = k.get("coreq_texto") or ", ".join(k.get("coreq") or [])
    return _t(f"{_t(k.get('sigla'), k.get('nombre'))}:", f"{k['creditos']} créditos." if k.get("creditos") else "",
              f"Énfasis: {k['etiqueta']}." if k.get("etiqueta") else "",
              f"Área: {areas[k['area']]}." if k.get("area") in areas else "",
              f"Requisitos: {req}." if req else "", f"Correquisitos: {coreq}." if coreq else "",
              f"Horas: {detalle}." if detalle else "", _punto(k.get("desc")), _punto(k.get("nota")),
              "Es un curso optativo." if k.get("optativo") else "")


def _carrera(c):
    f, m = c.get("ficha") or {}, (c.get("ficha") or {}).get("malla") or {}
    nombre = c["nombre"]
    datos = [_t(f"{nombre} es una carrera de la Sede del Caribe de la UCR.", f"Grados: {c['grados']}." if c.get("grados") else "",
                f"Área: {c['area']}." if c.get("area") else "", f"Código: {c['codigo']}." if c.get("codigo") else "",
                f"Se imparte en {c['recintos']}." if c.get("recintos") else "")]
    if c.get("resumen"):
        datos.append(_punto(c["resumen"]))
    if f.get("lema"):
        datos.append(_punto(f["lema"]))
    if c.get("coordinacion") or c.get("correo"):
        datos.append(_t("Coordinación:", c.get("coordinacion", ""), f"correo {c['correo']}," if c.get("correo") else "",
                        f"extensión {c['extension']}." if c.get("extension") else ""))
    if m.get("ciclos"):
        anios = max((x.get("anio") or 0) for x in m["ciclos"])
        datos.append(_t(f"Duración según el plan de estudios ({m.get('plan', 'plan vigente')}): "
                        f"{_plural(len(m['ciclos']), 'ciclo lectivo', 'ciclos lectivos')}" + (f", distribuidos en {anios} años" if anios else "") + ".",
                        f"{m['total']} créditos en total." if m.get("total") else "",
                        f"Además, {m['tcu']} horas de Trabajo Comunal Universitario." if m.get("tcu") else ""))
    for p in f.get("planes") or []:
        datos.append(_t(f"Plan de estudios en PDF: {p.get('nombre', '')}", f"({p['detalle']})" if p.get("detalle") else "",
                        f"{p['url']}" if p.get("url") else ""))
    if not f.get("planes") and c.get("plan_url"):
        datos.append(f"Plan de estudios en PDF: {c['plan_url']}")
    if not m:
        datos.append("El sitio todavía no publica la malla curricular de esta carrera.")
    secciones = [{"h": "Datos de la carrera", "x": "\n".join(datos)}]
    if m:
        areas = {a["id"]: a.get("nombre") or a["id"] for a in m.get("areas", [])}
        secciones += _bloques("Áreas del plan de estudios", [
            _t(f"{a.get('nombre')}", f"({a['creditos']} créditos):" if a.get("creditos") else ":", _punto(a.get("descripcion")))
            for a in m.get("areas", [])])
        por_ciclo = {}
        for k in m.get("cursos", []):
            por_ciclo.setdefault(k.get("ciclo"), []).append(k)
        for ciclo in m.get("ciclos", []):
            cursos = por_ciclo.get(ciclo["n"], [])
            detalle = ", ".join(x for x in (f"año {ciclo['anio']}" if ciclo.get("anio") else "",
                                            f"{ciclo['creditos']} créditos" if ciclo.get("creditos") else "") if x)
            encabezado = f"Cursos del {ciclo.get('nombre', ciclo['n'])}" + (f" ({detalle})" if detalle else "")
            if cursos:
                secciones += _bloques(f"{nombre}: {encabezado}", [_curso(k, areas) for k in cursos])
        for clave, lista in (m.get("optativos") or {}).items():
            titulo = next((x.get("titulo") for x in m.get("listas_optativos", []) if x.get("id") == clave), None) or areas.get(clave, clave)
            nota = next((x.get("nota") for x in m.get("listas_optativos", []) if x.get("id") == clave), "")
            secciones += _bloques(f"{nombre}: cursos optativos, {titulo}", ([nota] if nota else []) + [_curso(k, areas) for k in lista])
        notas = [m.get(k) for k in ("resumen_creditos", "nota_fuente", "sin_programa") if m.get(k)]
        if notas:
            secciones.append({"h": f"{nombre}: notas del plan de estudios", "x": "\n".join(_punto(n) for n in notas)})
    return {"id": f"catalogo-carrera-{c['id']}", "t": f"{nombre}: datos, plan de estudios y cursos",
            "enlace": f"carreras/{c['id']}.html", "s": secciones}


def _unidades(unidades):
    grupos = {}
    for u in unidades:
        if not u.get("enlace"):
            grupos.setdefault(u.get("grupo") or "Otras unidades", []).append(u)
    secciones = []
    for grupo, us in grupos.items():
        lineas = []
        for u in us:
            ext = "; ".join(_t(e.get("oficina"), f"ext. {e['extension']}" if e.get("extension") else "", e.get("correo"))
                            for e in (u.get("extensiones") or []))
            lineas.append(_t(f"{u['nombre']}:", _punto(u.get("resumen")),
                             _punto(f"Responsable: {_t(u.get('responsable'), u.get('cargo'), sep=', ')}") if u.get("responsable") else "",
                             _punto(f"Edificio: {u['edificio']}") if u.get("edificio") else "",
                             _punto(f"Contacto: {ext}") if ext else ""))
        secciones += _bloques(f"{grupo}: lista completa", lineas)
    return {"id": "catalogo-unidades", "t": "Coordinaciones, oficinas, recintos y servicios de la Sede del Caribe",
            "enlace": "la-sede.html", "s": secciones}


def _accion_social(m):
    lineas = []
    for p in m.get("proyectos", []):
        lineas.append(_t(f"{_t(p.get('codigo'), p.get('nombre'))}:", _punto(p.get("resumen")),
                         _punto(f"Lugares: {p['lugares']}") if p.get("lugares") else "",
                         _punto(f"Población: {p['poblacion']}") if p.get("poblacion") else "",
                         _punto(f"Aliados: {p['aliados']}") if p.get("aliados") else "",
                         _punto(f"Carreras que participan: {p['carreras']}") if p.get("carreras") else "",
                         _punto(f"Coordina {p['coordinador']}") if p.get("coordinador") else ""))
    if not lineas:
        return None
    return {"id": f"catalogo-accion-social-{m['id']}", "t": f"{m['nombre']}: proyectos de Acción Social de la Sede",
            "enlace": f"accion-social/{m['id']}.html", "s": _bloques(f"Proyectos de {m['nombre']}", lineas)}


def _investigacion(g):
    lineas = [_t(f"{_t(p.get('codigo'), p.get('nombre_oficial') or p.get('corto'))}:", _punto(p.get("resumen")),
                 _punto(f"Responsable: {p['responsable']}") if p.get("responsable") else "",
                 _punto(f"Vigencia: {p['vigencia']}") if p.get("vigencia") else "") for p in g.get("proyectos", [])]
    if not lineas:
        return None
    return {"id": f"catalogo-investigacion-{g['id']}", "t": f"{g['nombre']}: proyectos de investigación",
            "enlace": f"investigacion/{g['id']}.html",
            "s": _bloques(f"Proyectos de {g['nombre']}", [_punto(g.get("resumen"))] * bool(g.get("resumen")) + lineas)}


def catalogos(c, fecha_larga=lambda d: str(d)):
    paginas = []
    if c.get("carreras"):
        paginas.append(_lista_carreras(c["carreras"]))
        paginas += [_carrera(x) for x in c["carreras"]]
    if c.get("unidades"):
        paginas.append(_unidades(c["unidades"]))
    paginas += [p for p in (_accion_social(m) for m in c.get("modalidades", [])) if p]
    paginas += [p for p in (_investigacion(g) for g in c.get("programas_inv", [])) if p]
    if c.get("noticias"):
        paginas.append({"id": "catalogo-noticias", "t": "Noticias recientes de la Sede del Caribe", "enlace": "noticias.html",
                        "s": _bloques("Noticias más recientes", [_t(f"{fecha_larga(n['f'])}: {n['titulo']}.", _punto(n.get("resumen")))
                                                                  for n in c["noticias"]])})
    if c.get("avisos"):
        paginas.append({"id": "catalogo-avisos", "t": "Avisos vigentes de la Sede del Caribe", "enlace": "index.html",
                        "s": _bloques("Avisos vigentes", [_t(f"{a['titulo']}:", _punto(a.get("texto")),
                                                              f"{a['enlace_texto']}: {a['enlace']}" if a.get("enlace") else "")
                                                         for a in c["avisos"]])})
    if c.get("cifras"):
        paginas.append({"id": "catalogo-cifras", "t": "La Sede del Caribe en cifras", "enlace": "index.html",
                        "s": _bloques("La Sede en cifras", [_t(f"{x['valor']} {x['etiqueta']}", f"(fuente: {x['fuente']})." if x.get("fuente") else "")
                                                             for x in c["cifras"]])})
    return [p for p in paginas if p["s"]]
