#!/usr/bin/env python3
"""Revisa qué información del sitio NO le llega al congo (después de compilar: python3 build.py).

    python3 herramientas/auditar_congo.py [--detalle] [--estricto]

Reúne todo el texto que el congo indexa (dist/congo/paginas.json y las filas de agenda y directorio de
dist/assets/js/indice.js) y busca en él cada texto de src/data/*.json que el sitio muestra. Lo que no aparece es
información publicada que el congo no podría citar. También comprueba que los catálogos generados por build.py
(carreras y plan de estudios, unidades, acción social, investigación) nombren todo lo que hay en los datos.
Con --estricto termina con error si falta algo de los catálogos (sirve de prueba de regresión).
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
DATOS = RAIZ / "src" / "data"
DIST = RAIZ / "dist"

# Datos que no son texto para el público o que el congo recibe por otro camino
IGNORAR_ARCHIVOS = {"campus3d.json", "config.json", "ejemplos.json", "orientador.json", "videos.json", "lugares.json",
                    "secciones.json", "enlaces.json"}
IGNORAR_CLAVES = {"id", "publicar", "url", "enlace", "plan_url", "documento", "archivo", "color", "oscuro", "foto", "fotos",
                  "fotos_alt", "foto_alt", "imagen", "icono", "pagina", "req", "area_id", "programa", "alt", "correo",
                  "titular_portada", "estado", "tema", "orden", "kb", "ciclo_programa"}


def normal(t):
    t = unicodedata.normalize("NFD", str(t).lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def corpus():
    paginas = json.loads((DIST / "congo" / "paginas.json").read_text(encoding="utf-8"))
    partes = [f"{p['t']} {s['h']} {s['x']}" for p in paginas for s in p["s"]]
    indice = (DIST / "assets" / "js" / "indice.js").read_text(encoding="utf-8")
    for e in json.loads(indice[indice.index("=") + 1:].rstrip().rstrip(";")):
        if e["u"].startswith(("agenda.html", "directorio.html")):
            partes.append(f"{e['t']} {e['x']}")
    return normal(" ".join(partes)), paginas


def textos(nodo, ruta=""):
    """Cada texto de un JSON con su ruta, sin las claves que no son contenido."""
    if isinstance(nodo, dict):
        for k, v in nodo.items():
            if k not in IGNORAR_CLAVES:
                yield from textos(v, f"{ruta}.{k}" if ruta else k)
    elif isinstance(nodo, list):
        for i, v in enumerate(nodo):
            yield from textos(v, f"{ruta}[{i}]")
    elif isinstance(nodo, str):
        yield ruta, nodo


def cargar(ruta):
    d = json.loads(ruta.read_text(encoding="utf-8"))
    return [x for x in d if str(x.get("publicar", "sí")).lower() not in ("no", "false")] if isinstance(d, list) else d


def catalogo_esperado():
    """Lo que los catálogos del congo deben nombrar, según los datos: (descripción, texto)."""
    esperado = []
    for c in cargar(DATOS / "carreras.json"):
        esperado.append(("carrera", c["nombre"]))
        ruta = DATOS / "carreras" / f"{c['id']}.json"
        if ruta.exists():
            malla = json.loads(ruta.read_text(encoding="utf-8")).get("malla") or {}
            for curso in malla.get("cursos", []):
                esperado.append((f"curso de {c['nombre']}", curso["sigla"]))
    for u in cargar(DATOS / "unidades.json"):
        if not u.get("enlace"):
            esperado.append(("unidad", u["nombre"]))
    return esperado


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--detalle", action="store_true", help="lista cada texto que falta")
    a.add_argument("--estricto", action="store_true", help="error si los catálogos no nombran todo")
    args = a.parse_args()
    if not (DIST / "congo" / "paginas.json").exists():
        sys.exit("falta dist/: compile primero con python3 build.py --vista-previa")
    todo, paginas = corpus()

    print(f"Congo: {len(paginas)} páginas, {sum(len(s['x']) for p in paginas for s in p['s'])} caracteres.\n")
    print("== Datos publicados que el congo no podría citar")
    total_falta = 0
    for ruta in sorted(DATOS.glob("*.json")) + sorted((DATOS / "carreras").glob("*.json")):
        if ruta.name in IGNORAR_ARCHIVOS or ruta.name.startswith("horarios-"):
            continue
        faltan, vistos = [], 0
        for r, t in textos(cargar(ruta)):
            if len(t) < 15 or " " not in t.strip():
                continue
            vistos += 1
            n = normal(t)
            if len(n) > 80:   # textos largos (noticias en markdown, enlaces): basta con el comienzo
                n = " ".join(n.split()[:8])
            if n and n not in todo:
                faltan.append((r, t))
        total_falta += len(faltan)
        if faltan:
            print(f"  {ruta.relative_to(DATOS)}: faltan {len(faltan)} de {vistos} textos")
            for r, t in faltan[: (len(faltan) if args.detalle else 2)]:
                print(f"      {r}: {t[:90]}")
    print(f"\n  Total sin llegar al congo: {total_falta}")

    print("\n== Catálogos generados desde los datos")
    catalogos = normal(" ".join(f"{s['x']} {s['h']}" for p in paginas if p.get("id", "").startswith("catalogo-") for s in p["s"]))
    sin = [(d, t) for d, t in catalogo_esperado() if normal(t) not in catalogos]
    print(f"  {len(catalogo_esperado()) - len(sin)} de {len(catalogo_esperado())} nombres presentes en los catálogos")
    for d, t in sin[:20]:
        print(f"      falta ({d}): {t}")
    if args.estricto and sin:
        sys.exit(1)


if __name__ == "__main__":
    main()
