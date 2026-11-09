#!/usr/bin/env python3
"""Compila el sitio web de la Universidad de Costa Rica, Sede del Caribe.

Uso:
    python3 build.py              # genera ./dist
    python3 build.py --servir     # genera y sirve en http://localhost:8000
    python3 build.py --ejemplos   # agrega contenido de ejemplo marcado (solo para vistas previas)
    python3 build.py --vista-previa   # vista previa pública sin ejemplos, fuera de buscadores

De dónde sale el contenido:
    contenido/   lo que trae sincronizar_drive.py desde Google Drive (tiene prioridad)
    src/data/    respaldo con el contenido migrado del sitio anterior (si no hay Drive)
    src/paginas/ textos largos de respaldo (en Drive son Documentos de Google)

Reglas que se aplican al compilar (las mismas que se explican a quienes editan el Drive):
    - Solo se publica una fila si la columna «publicar» dice sí.
    - Una noticia con fecha futura queda programada: aparece el día de su fecha.
    - Un aviso solo se muestra entre su fecha «desde» y su fecha «hasta».
    - La agenda muestra lo que está en curso, lo próximo y, plegado, lo anterior. En «Esta semana», un plazo de
      más de una semana aparece solo el día que abre y el día que cierra.
"""
import calendar, hashlib, html, json, re, shutil, sys, unicodedata
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import markdown
import nh3
from jinja2 import Environment, FileSystemLoader, select_autoescape

RAIZ = Path(__file__).resolve().parent
SRC, DIST, CONT = RAIZ / "src", RAIZ / "dist", RAIZ / "contenido"
CR = timezone(timedelta(hours=-6))  # Costa Rica no usa horario de verano
HOY = datetime.now(CR).date()
AHORA = datetime.now(CR)
EJEMPLOS = "--ejemplos" in sys.argv
# Vista previa pública (GitHub Pages): fuera de buscadores, con o sin ejemplos
VISTA_PREVIA = EJEMPLOS or "--vista-previa" in sys.argv

MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
TABLAS = ["config", "avisos", "noticias", "eventos", "carreras", "unidades", "directorio", "enlaces", "hitos", "cifras", "proyectos"]

# Modalidades de los proyectos de acción social (secciones de la Vicerrectoría de Acción Social).
# La columna «modalidad» de la pestaña «proyectos» usa estos identificadores; cada una tiene su página
# accion-social/<id>.html, con el texto del documento «modalidad-<id>» de la carpeta Páginas.
MODALIDADES = [
    {"id": "tcu", "nombre": "Trabajo Comunal Universitario",
     "resumen": "Estudiantes de distintas carreras trabajan 300 horas con comunidades e instituciones. Es requisito de graduación."},
    {"id": "extension-cultural", "nombre": "Extensión Cultural",
     "resumen": "Música, danza, lengua, cocina, memoria y tradiciones de los pueblos de la provincia."},
    {"id": "extension-docente", "nombre": "Extensión Docente",
     "resumen": "Cursos libres, educación continua, capacitación y acompañamiento técnico para la comunidad."},
]
SI = {"sí", "si", "x", "true", "verdadero", "1", "publicar", "yes"}

# Qué grupo del directorio corresponde a cada unidad (para listar sus extensiones en su página)
DIRECTORIO_DE = {"direccion": "Dirección", "docencia": "Docencia", "investigacion": "Investigación",
                 "accion-social": "Acción Social", "vida-estudiantil": "Vida Estudiantil",
                 "administracion": "Administración", "siquirres": "Siquirres"}


# --------------------------------------------------------------------------- utilidades
def fecha(txt):
    """Acepta 2026-11-05, 05/11/2026 o 5/11/2026 (como las escribe Google Sheets en es-CR)."""
    txt = (txt or "").strip()
    if not txt:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(txt[:10], fmt).date()
        except ValueError:
            pass
    print(f"  ! fecha no reconocida: {txt!r}")
    return None


def slug(txt):
    txt = unicodedata.normalize("NFKD", txt).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", txt).strip("-")[:70]


def publicable(fila):
    return str(fila.get("publicar", "sí")).strip().lower() in SI


ETIQUETAS = ["p", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "b", "i", "a", "blockquote", "br",
             "table", "thead", "tbody", "tr", "th", "td", "hr", "img", "figure", "figcaption"]


def md(texto):
    """Markdown → HTML seguro. Quien edita el Drive no puede inyectar scripts ni estilos."""
    if not texto:
        return ""
    crudo = markdown.markdown(texto.replace("\r\n", "\n"), extensions=["tables", "sane_lists"])
    limpio = nh3.clean(crudo, tags=set(ETIQUETAS),
                       attributes={"a": {"href", "title"}, "img": {"src", "alt"}, "th": {"scope"}},
                       url_schemes={"http", "https", "mailto", "tel"}, link_rel="noopener")
    # Los documentos de Google exportan el título como # o ##; el título ya lo pone la plantilla
    limpio = re.sub(r"<(h[2-4])><strong>(.*?)</strong></\1>", r"<\1>\2</\1>", limpio)  # Drive exporta títulos en negrita
    return re.sub(r"<h1>.*?</h1>", "", limpio, count=1)


def parrafos(texto):
    """Texto plano de una celda → párrafos (una línea en blanco separa párrafos)."""
    return md(texto)


def texto_plano(h):
    h = re.sub(r"<(script|style|svg|nav|header|footer)[^>]*>.*?</\1>", " ", h, flags=re.S)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def fecha_larga(d):
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}" if d else ""


def fecha_corta(d):
    return f"{d.day} {MESES[d.month - 1][:3]}." if d else ""


def dia_semana(d):
    return DIAS[d.weekday()] if d else ""


def mes(d):
    return MESES[d.month - 1] if d else ""


# --------------------------------------------------------------------------- carga
def leer_tabla(nombre):
    for base in ([CONT / "datos"] if CONT.exists() else []) + [SRC / "data"]:
        f = base / f"{nombre}.json"
        if f.exists():
            return json.loads(f.read_text(encoding="utf-8")), base
    return [], None


def lugares_campus():
    """Lugares de la maqueta 3D (pestaña «lugares»). El número es el del croquis oficial y une cada fila con su edificio."""
    filas = leer_tabla("lugares")[0] or json.loads((SRC / "data" / "lugares.json").read_text(encoding="utf-8"))
    salida = []
    for l in filas:
        try:
            # «fotos»: nombres de archivo separados por comas; «fotos_alt»: descripción de cada una, separadas por «|»
            nombres = [x.strip() for x in (l.get("fotos") or l.get("foto") or "").split(",") if x.strip()]
            # más las fotos de la carpeta Imágenes/Recorrido/<número> - <nombre> del Drive, en orden de nombre
            carpeta = CONT / "imagenes" / "recorrido" / str(int(l["id"]))
            if carpeta.is_dir():
                nombres += [f"recorrido/{int(l['id'])}/{p.name}" for p in sorted(carpeta.iterdir(), key=lambda p: p.name.lower())
                            if p.is_file() and not p.name.startswith(".") and f"recorrido/{int(l['id'])}/{p.name}" not in nombres]
            alts = [x.strip() for x in (l.get("fotos_alt") or l.get("foto_alt") or "").split("|")]
            fotos = []
            for i, nombre in enumerate(nombres):
                f = imagen(nombre)
                if f:
                    fotos.append({"s": f[640], "m": f[1280], "g": f[1920], "alt": alts[i] if i < len(alts) and alts[i] else f"{l['nombre']}, foto {i + 1}"})
            salida.append({**l, "id": int(l["id"]), "zona": int(l.get("zona") or 0), "fotos": fotos})
        except (KeyError, ValueError):
            continue
    return sorted(salida, key=lambda l: l["id"])


def fotos_de(fila, carpeta):
    """Fotos de una fila: la columna «fotos» (nombres separados por comas, de la carpeta Imágenes) y, además,
    las de Imágenes/<carpeta>/<id>/ del Drive, en orden de nombre. «fotos_alt» describe cada una, separadas por «|»."""
    nombres = [x.strip() for x in (fila.get("fotos") or "").split(",") if x.strip()]
    sub = CONT / "imagenes" / carpeta / fila["id"]
    if sub.is_dir():
        nombres += [f"{carpeta}/{fila['id']}/{f.name}" for f in sorted(sub.iterdir(), key=lambda f: f.name.lower())
                    if f.is_file() and not f.name.startswith(".")]
    alts = [x.strip() for x in (fila.get("fotos_alt") or "").split("|")]
    fotos = []
    for i, nombre in enumerate(nombres):
        f = imagen(nombre)
        if f:
            fotos.append({**f, "alt": alts[i] if i < len(alts) and alts[i] else f"{fila['nombre']}, foto {i + 1}"})
    return fotos


def leer_pagina(nombre):
    if not nombre:
        return ""
    for base in ([CONT / "paginas"] if CONT.exists() else []) + [SRC / "paginas"]:
        f = base / f"{nombre}.md"
        if f.exists():
            return f.read_text(encoding="utf-8")
    return ""


def imagen(nombre, ancho_max=1600):
    """Una imagen subida a la carpeta «Imágenes» del Drive → dos versiones WebP en dist/media.
    Devuelve None si no existe, para que la plantilla simplemente no muestre imagen."""
    if not nombre:
        return None
    origen = next((p for p in [CONT / "imagenes" / nombre, SRC / "assets" / "fotos" / nombre, SRC / "assets" / "img" / nombre] if p.exists()), None)
    if not origen:
        print(f"  ! imagen no encontrada: {nombre}")
        return None
    from PIL import Image, ImageOps
    # el nombre lleva una huella del archivo: si alguien cambia la foto en el Drive, cambia la dirección
    # y ni el navegador ni la caché muestran la vieja
    huella = hashlib.sha1(origen.read_bytes()).hexdigest()[:8]
    base = f"{slug(Path(nombre).stem)}-{huella}"
    # caché fuera de dist (que se borra en cada compilación): convertir 4 tamaños en WebP es lento.
    # Se guarda por contenido, así que renombrar una foto no obliga a convertirla de nuevo.
    cache = RAIZ / ".cache" / "media"
    cache.mkdir(parents=True, exist_ok=True)
    medidas = cache / f"{huella}.json"
    salida = {}
    (DIST / "media").mkdir(parents=True, exist_ok=True)
    viejas = {a: next(iter(cache.glob(f"*-{huella}-{a}.webp")), None) for a in (640, 1280, 1920, 2560)}
    for ancho, f in viejas.items():   # cachés guardadas con el nombre anterior
        if f and not (cache / f"{huella}-{ancho}.webp").exists():
            f.rename(cache / f"{huella}-{ancho}.webp")
    viejo_json = next(iter(cache.glob(f"*-{huella}.json")), None)
    if viejo_json and not medidas.exists():
        viejo_json.rename(medidas)
    if medidas.exists() and all((cache / f"{huella}-{a}.webp").exists() for a in (640, 1280, 1920, 2560)):
        for ancho in (640, 1280, 1920, 2560):
            shutil.copy2(cache / f"{huella}-{ancho}.webp", DIST / "media" / f"{base}-{ancho}.webp")
            salida[ancho] = f"media/{base}-{ancho}.webp"
        salida.update(json.loads(medidas.read_text()))
        return salida
    with Image.open(origen) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        # 2560 px para pantallas grandes o de alta densidad (portada a todo lo ancho en PC)
        for ancho in (640, 1280, 1920, 2560):
            copia = im.copy()
            if copia.width > ancho:
                copia = copia.resize((ancho, round(copia.height * ancho / copia.width)), Image.LANCZOS)
            guardada = cache / f"{huella}-{ancho}.webp"
            if not guardada.exists():
                copia.save(guardada, "WEBP", quality=86 if ancho >= 1920 else 82, method=6)
            shutil.copy2(guardada, DIST / "media" / f"{base}-{ancho}.webp")
            salida[ancho] = f"media/{base}-{ancho}.webp"
        salida["w"], salida["h"] = im.width, im.height
    medidas.write_text(json.dumps({"w": salida["w"], "h": salida["h"]}))
    return salida


def cargar():
    datos, origen = {}, set()
    for t in TABLAS:
        filas, base = leer_tabla(t)
        datos[t] = filas
        if base:
            origen.add("Drive" if base.parent == CONT else "respaldo")
    if EJEMPLOS:
        ej = json.loads((SRC / "data" / "ejemplos.json").read_text(encoding="utf-8"))
        for t, filas in ej.items():
            datos[t] = filas + datos[t]
    sitio = {f["clave"]: f["valor"] for f in datos.pop("config")}
    return sitio, datos, "Drive" if origen == {"Drive"} else ("respaldo" if origen == {"respaldo"} else "mixto")


def meses_agenda(lista, todos, prefijo="mes"):
    """Agrupa por año y mes de inicio. Cada mes lleva su minicalendario: semanas de lunes a domingo y,
    por día, las actividades de «todos» que empiezan ese día (el enlace va a la primera)."""
    inicios = {}
    for e in todos:
        inicios.setdefault(e["f"], []).append(e)
    meses = {}
    for e in lista:
        meses.setdefault((e["f"].year, e["f"].month), []).append(e)
    salida = []
    for (a, m), evs in meses.items():
        semanas = [[{"d": x, "fuera": x.month != m, "hoy": x == HOY, "ev": inicios.get(x, []) if x.month == m else []} for x in s]
                   for s in calendar.Calendar(0).monthdatescalendar(a, m)]
        salida.append({"anio": a, "mes": m, "id": f"{prefijo}-{a}-{m:02d}", "eventos": evs, "semanas": semanas})
    return salida


def normal(t):
    return unicodedata.normalize("NFD", t.lower()).encode("ascii", "ignore").decode()


def preparar(sitio, d):
    """Filtra lo no publicable y convierte texto en fechas, HTML e imágenes."""
    avisos = []
    for a in filter(publicable, d["avisos"]):
        desde, hasta = fecha(a.get("desde")), fecha(a.get("hasta"))
        if (desde is None or desde <= HOY) and (hasta is None or HOY <= hasta):
            avisos.append({**a, "urgente": a.get("tipo", "").strip().lower() == "urgente"})
    avisos.sort(key=lambda a: not a["urgente"])

    noticias = []
    for n in filter(publicable, d["noticias"]):
        f = fecha(n.get("fecha"))
        if not f or f > HOY:          # sin fecha válida o programada para después
            continue
        cuerpo = leer_pagina(n.get("documento")) or n.get("cuerpo", "")
        noticias.append({**n, "id": n.get("id") or slug(n["titulo"]), "f": f, "html": md(cuerpo),
                         "img": imagen(n.get("imagen")), "destacada": str(n.get("destacada", "")).lower() in SI})
    noticias.sort(key=lambda n: (n["f"], n["destacada"]), reverse=True)

    eventos, pasados = [], []
    for e in filter(publicable, d["eventos"]):
        ini = fecha(e.get("fecha"))
        if not ini:
            continue
        fin = max(fecha(e.get("fecha_fin")) or ini, ini)
        ev = {**e, "id": e.get("id") or slug(f"{ini}-{e['titulo']}"), "f": ini, "fin": fin, "html": parrafos(e.get("descripcion", ""))}
        (eventos if fin >= HOY else pasados).append(ev)
    eventos.sort(key=lambda e: (e["f"], e.get("hora", "")))
    pasados.sort(key=lambda e: (e["f"], e.get("hora", "")))
    recientes = [e for e in reversed(pasados) if e["fin"] >= HOY - timedelta(days=30)]
    agenda = {"en_curso": sorted((e for e in eventos if e["f"] < HOY), key=lambda e: e["fin"]),
              "proximos": meses_agenda([e for e in eventos if e["f"] >= HOY], eventos),
              "pasados": meses_agenda(pasados, pasados, "antes")[::-1],
              "categorias": sorted({e["categoria"] for e in eventos + pasados if e.get("categoria")}, key=normal)}

    carreras = []
    for c in filter(publicable, d["carreras"]):
        carreras.append({**c, "html": md(leer_pagina(c.get("documento")) or c.get("resumen", ""))})

    unidades = []
    for u in filter(publicable, d["unidades"]):
        ext = [f for f in d["directorio"] if f["unidad"] == DIRECTORIO_DE.get(u["id"])]
        # «cifras-<id>»: datos destacados opcionales; el documento los ubica con un párrafo que diga solo [[cifras]]
        html = md(leer_pagina(u.get("documento")))
        antes, _, despues = html.partition("<p>[[cifras]]</p>")
        unidades.append({**u, "html": antes, "html_despues": despues, "extensiones": ext,
                         "cifras": leer_tabla(f"cifras-{u['id']}")[0]})

    proyectos = []
    for p in filter(publicable, d["proyectos"]):
        if p.get("modalidad") not in {m["id"] for m in MODALIDADES} or not p.get("id"):
            print(f"  ! proyecto sin modalidad válida: {p.get('nombre')!r}")
            continue
        proyectos.append({**p, "html": md(leer_pagina(p.get("documento"))), "fotos": fotos_de(p, "proyectos")})
    modalidades = [{**m, "html": md(leer_pagina(f"modalidad-{m['id']}")), "proyectos": [p for p in proyectos if p["modalidad"] == m["id"]]}
                   for m in MODALIDADES]
    for m in modalidades:  # entrada del menú «Acción social»: la agrupación y, dentro, sus proyectos
        m["menu"] = (m["nombre"], f"accion-social/{m['id']}.html",
                     [(p["nombre"], p.get("enlace") or f"accion-social/proyectos/{p['id']}.html") for p in m["proyectos"]])

    grupos_dir = {}
    for f in d["directorio"]:
        grupos_dir.setdefault(f["unidad"], []).append(f)

    enlaces = {}
    for e in d["enlaces"]:
        enlaces.setdefault(e["grupo"], []).append(e)

    # «Esta semana en la Sede»: lunes a viernes de la semana en curso (el fin de semana, la siguiente)
    lunes = HOY - timedelta(days=HOY.weekday()) + (timedelta(days=7) if HOY.weekday() >= 5 else timedelta())
    # Un plazo de más de una semana (p. ej. la interrupción de estudios) sale solo el día que abre y el día que cierra.
    def del_dia(x):
        salida = []
        for e in eventos + recientes:
            if not e["f"] <= x <= e["fin"]:
                continue
            largo = (e["fin"] - e["f"]).days >= 7
            if not largo or x in (e["f"], e["fin"]):
                salida.append({**e, "marca": ("abre" if x == e["f"] else "cierra") if largo else ""})
        return salida
    semana = [{"f": lunes + timedelta(days=i), "hoy": lunes + timedelta(days=i) == HOY, "pasado": lunes + timedelta(days=i) < HOY,
               "eventos": del_dia(lunes + timedelta(days=i))} for i in range(5)]

    # Fotos de la portada y de las páginas: se cambian en la pestaña config del Drive
    fotos = {k: imagen(sitio.get(f"foto_{k}") or por_defecto) for k, por_defecto in
             [("portada", "entrada.jpg"), ("portada_noche", "entrada-noche.jpg"), ("carreras", "auditorio.jpg"), ("historia", "edificio-aulas.jpg")]}

    return {"semana": semana, "fotos": fotos, "avisos": avisos, "noticias": noticias, "eventos": eventos, "recientes": recientes, "agenda": agenda,
            "carreras": carreras, "unidades": unidades, "unidad": {u["id"]: u for u in unidades},
            "directorio": grupos_dir, "enlaces": enlaces, "hitos": d["hitos"], "cifras": d["cifras"], "modalidades": modalidades,
            "categorias": sorted({n["categoria"] for n in noticias if n.get("categoria")}),
            "areas": list(dict.fromkeys(c["area"] for c in carreras))}


# --------------------------------------------------------------------------- salida
def ics(eventos, sitio):
    """Agenda en formato iCalendar: se puede suscribir desde Google Calendar u Outlook."""
    esc = lambda t: (t or "").replace("\\", "\\\\").replace(";", r"\;").replace(",", r"\,").replace("\n", r"\n")
    lineas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//UCR Sede del Caribe//Agenda//ES",
              "X-WR-CALNAME:Agenda UCR Sede del Caribe", "X-WR-TIMEZONE:America/Costa_Rica"]
    for e in eventos:
        lineas += ["BEGIN:VEVENT", f"UID:{e['id']}@{sitio['base_url'].split('//')[-1]}",
                   f"DTSTAMP:{AHORA.astimezone(timezone.utc):%Y%m%dT%H%M%SZ}"]
        h = re.match(r"(\d{1,2}):(\d{2})", e.get("hora", ""))
        if h:
            inicio = datetime.combine(e["f"], datetime.min.time()).replace(hour=int(h[1]), minute=int(h[2]))
            lineas += [f"DTSTART;TZID=America/Costa_Rica:{inicio:%Y%m%dT%H%M%S}",
                       f"DTEND;TZID=America/Costa_Rica:{inicio + timedelta(hours=2):%Y%m%dT%H%M%S}"]
        else:
            lineas += [f"DTSTART;VALUE=DATE:{e['f']:%Y%m%d}", f"DTEND;VALUE=DATE:{e['fin'] + timedelta(days=1):%Y%m%d}"]
        lineas += [f"SUMMARY:{esc(e['titulo'])}", f"LOCATION:{esc(e.get('lugar'))}",
                   f"DESCRIPTION:{esc(e.get('descripcion'))}", f"URL:{sitio['base_url']}/agenda.html#{e['id']}", "END:VEVENT"]
    lineas.append("END:VCALENDAR")
    return "\r\n".join(lineas) + "\r\n"


def rss(noticias, sitio):
    base = sitio["base_url"]
    items = "".join(
        f"<item><title>{html.escape(n['titulo'])}</title><link>{base}/noticias/{n['id']}.html</link>"
        f"<guid>{base}/noticias/{n['id']}.html</guid><pubDate>{datetime.combine(n['f'], datetime.min.time(), CR):%a, %d %b %Y %H:%M:%S %z}</pubDate>"
        f"<description>{html.escape(n.get('resumen', ''))}</description></item>" for n in noticias[:30])
    return (f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Noticias de la UCR, Sede del Caribe</title>'
            f"<link>{base}/noticias.html</link><description>{html.escape(sitio['descripcion'])}</description><language>es-CR</language>{items}</channel></rss>")


def main():
    sitio, crudos, origen = cargar()
    if DIST.exists():
        shutil.rmtree(DIST)
    shutil.copytree(SRC / "assets", DIST / "assets", ignore=shutil.ignore_patterns("fotos"))  # las fotos originales solo se publican convertidas a WebP
    c = preparar(sitio, crudos)

    huella = hashlib.sha1()
    for f in sorted((SRC / "assets").rglob("*")):
        if f.is_file():
            huella.update(f.read_bytes())
    version = huella.hexdigest()[:10]
    # los scripts que se cargan entre sí también llevan la versión: si no, el navegador puede juntar un script
    # nuevo con otro viejo guardado en caché y la maqueta 3D no arranca
    for js in (DIST / "assets" / "js").rglob("*.js"):
        texto_js = js.read_text(encoding="utf-8")
        nuevo_js = re.sub(r'(["\'])(\./(?:vendor/)?[\w.-]+\.js)\1', rf'\1\2?v={version}\1', texto_js)
        if nuevo_js != texto_js:
            js.write_text(nuevo_js, encoding="utf-8")

    env = Environment(loader=FileSystemLoader(SRC / "templates"), autoescape=select_autoescape(["html"]),
                      trim_blocks=True, lstrip_blocks=True)
    env.filters.update(fecha_larga=fecha_larga, fecha_corta=fecha_corta, dia_semana=dia_semana, mes=mes,
                       tel=lambda t: "tel:+506" + re.sub(r"\D", "", t or ""))
    env.globals.update(sitio=sitio, hoy=HOY, MESES=MESES, ahora=AHORA, ejemplos=EJEMPLOS, vista_previa=VISTA_PREVIA, origen=origen,
                       unidades_publicadas={u["id"] for u in c["unidades"]})  # el menú omite las que no tienen página

    # datos de la maqueta 3D: van dentro de recorrido.html y, aparte, en un archivo que la portada pide después de cargar
    recorrido = {"campus": json.loads((SRC / "data" / "campus3d.json").read_text(encoding="utf-8")), "lugares": lugares_campus()}
    # las aulas y dependencias de cada edificio (según el croquis) van con su lugar, para la ficha
    dependencias = {e["id"]: e["dependencias"] for e in recorrido["campus"]["edificios"] if e.get("dependencias")}
    for l in recorrido["lugares"]:
        if l["id"] in dependencias:
            l["dependencias"] = dependencias[l["id"]]
    (DIST / "assets" / "datos-recorrido.json").write_text(json.dumps(recorrido, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # (archivo de salida, plantilla, título, descripción, variables extra)
    paginas = [
        ("index.html", "index.html", "Inicio", sitio["descripcion"], {}),
        ("estudiar.html", "estudiar.html", "Carreras", "Carreras de grado y posgrado de la UCR en Limón y Siquirres.", {}),
        ("admision.html", "admision.html", "Cómo ingresar", "Pasos para entrar a la Universidad de Costa Rica en la Sede del Caribe.", {"html": md(leer_pagina("admision"))}),
        ("la-sede.html", "la-sede.html", "La Sede", "Historia, misión, visión, coordinaciones y recintos de la Sede del Caribe.",
         {"historia": md(leer_pagina("historia")), "mision": md(leer_pagina("mision-vision"))}),
        ("noticias.html", "noticias.html", "Noticias", "Noticias de la comunidad universitaria de la Sede del Caribe.", {}),
        ("agenda.html", "agenda.html", "Agenda", "Actividades, cursos, plazos y eventos de la Sede del Caribe.", {}),
        ("directorio.html", "directorio.html", "Directorio", "Extensiones telefónicas y correos de las oficinas de la Sede del Caribe.", {}),
        ("enlaces.html", "enlaces.html", "Enlaces y trámites", "Accesos a los sistemas universitarios para estudiantes y personal.", {}),
        ("contacto.html", "contacto.html", "Contacto", "Cómo comunicarse con la Sede del Caribe.", {}),
        ("recorrido.html", "recorrido.html", "Recorrido por la Sede", "Maqueta 3D del campus de la Sede del Caribe: edificios, aulas, laboratorios y servicios.",
         {"lugares": recorrido["lugares"], "campus3d": recorrido["campus"]}),
        ("accesibilidad.html", "accesibilidad.html", "Accesibilidad", "Compromiso de accesibilidad del sitio.", {}),
        ("404.html", "404.html", "Página no encontrada", "La página que busca no existe o cambió de dirección.", {}),
    ]
    paginas += [(f"carreras/{x['id']}.html", "carrera.html", x["nombre"], x.get("resumen") or f"{x['grados']} en {x['nombre']}, UCR Sede del Caribe.", {"carrera": x})
                for x in c["carreras"]]
    paginas += [(f"unidades/{u['id']}.html", "unidad.html", u["nombre"], u["resumen"], {"u": u}) for u in c["unidades"]]
    paginas += [(f"noticias/{n['id']}.html", "noticia.html", n["titulo"], n.get("resumen", ""), {"n": n}) for n in c["noticias"]]
    paginas += [(f"accion-social/{m['id']}.html", "modalidad.html", m["nombre"], m["resumen"], {"m": m}) for m in c["modalidades"]]
    paginas += [(f"accion-social/proyectos/{p['id']}.html", "proyecto.html", p["nombre"], p["resumen"],
                 {"p": p, "m": next(m for m in c["modalidades"] if m["id"] == p["modalidad"])})
                for m in c["modalidades"] for p in m["proyectos"] if not p.get("enlace")]

    indice = []
    for salida, plantilla, titulo, desc, extra in paginas:
        prof = salida.count("/")
        raiz = "../" * prof
        texto = env.get_template(plantilla).render(pagina=salida, raiz=raiz, titulo=titulo, descripcion=desc, **c, **extra)
        texto = re.sub(r'(assets/(?:css|js)/[\w.-]+\.(?:css|js))"', rf'\1?v={version}"', texto)
        destino = DIST / salida
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(texto, encoding="utf-8")
        if salida != "404.html":
            m = re.search(r"<main[^>]*>(.*)</main>", texto, re.S)
            indice.append({"t": titulo, "u": salida, "x": texto_plano(m.group(1) if m else texto)[:4000]})
    for e in c["eventos"]:
        indice.append({"t": e["titulo"], "u": f"agenda.html#{e['id']}", "x": f"{fecha_larga(e['f'])} {e.get('lugar', '')} {e.get('descripcion', '')}"})
    for g, filas in c["directorio"].items():
        for f in filas:
            indice.append({"t": f"{f['oficina']} (ext. {f['extension']})", "u": "directorio.html", "x": f"{g} {f['edificio']} {f['correo']}"})

    (DIST / "assets/js/indice.js").write_text("window.INDICE=" + json.dumps(indice, ensure_ascii=False) + ";", encoding="utf-8")
    (DIST / "agenda.ics").write_text(ics(c["eventos"], sitio), encoding="utf-8")
    (DIST / "noticias.xml").write_text(rss(c["noticias"], sitio), encoding="utf-8")
    base = sitio["base_url"].rstrip("/")
    urls = "".join(f"<url><loc>{base}/{s if s != 'index.html' else ''}</loc><lastmod>{HOY}</lastmod></url>" for s, *_ in paginas if s != "404.html")
    (DIST / "sitemap.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>', encoding="utf-8")
    # La vista previa no debe aparecer en buscadores: el sitio oficial será sedecaribe.ucr.ac.cr
    robots = "User-agent: *\nDisallow: /\n" if VISTA_PREVIA else f"User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n"
    (DIST / "robots.txt").write_text(robots, encoding="utf-8")
    (DIST / "estado.json").write_text(json.dumps({"compilado": AHORA.isoformat(timespec="seconds"), "origen": origen,
                                                  "noticias": len(c["noticias"]), "eventos": len(c["eventos"]), "avisos": len(c["avisos"])},
                                                 ensure_ascii=False), encoding="utf-8")
    print(f"Listo: {len(paginas)} páginas, contenido desde {origen}, {len(c['noticias'])} noticias, "
          f"{len(c['eventos'])} actividades, {len(c['avisos'])} avisos activos.")

    if "--servir" in sys.argv:
        import functools, http.server, socketserver
        h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))
        with socketserver.TCPServer(("", 8000), h) as srv:
            print("Sirviendo en http://localhost:8000")
            srv.serve_forever()


if __name__ == "__main__":
    main()
