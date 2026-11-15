#!/usr/bin/env python3
"""Combinaciones de colores del sitio (menú «Colores» de la portada y del panel de accesibilidad).

Todas usan solo colores de la paleta de la UCR (Manual de identidad visual; lista accesible del Centro de Informática,
«Análisis de color paleta UCR accesible», 2025). Este archivo es la única fuente: genera el bloque de CSS entre las marcas
«paletas: inicio» y «paletas: fin» de sede.css y comprueba el contraste WCAG de cada par de colores, en modo claro y oscuro.

Uso:
    python3 herramientas/paletas.py            # comprueba el contraste y reescribe el bloque de sede.css
    python3 herramientas/paletas.py --revisar  # solo comprueba (sale con error si algo no alcanza AA)
"""
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parent.parent / "src" / "assets" / "css" / "sede.css"

# Paleta UCR (nombres del documento del Centro de Informática)
UCR = {
    "celeste": "#00C0F3", "azul1": "#0C344E", "azul2": "#02477B", "negro": "#000000", "blanco": "#FFFFFF",
    "gris1": "#F2F2F2", "gris2": "#666666", "gris3": "#232323",
    "cafe1": "#B76E11", "cafe2": "#7B3400", "cafe3": "#670000",
    "amarillo": "#FFE06A", "amarillo2": "#FFDD00", "amarillo3": "#E9C31E", "amarillo4": "#FDB913",
    "naranja1": "#E5B365", "naranja2": "#F99D1C", "naranja3": "#F37021",
    "celeste2": "#8ED8F8", "celeste3": "#BAD2ED", "celeste4": "#80A9BA",
    "verde": "#6DC067", "verde2": "#B9D989", "verde3": "#8DC63F", "verde4": "#008641",
}

# Valores de :root que una combinación puede no cambiar. «verde-texto» en claro queda en el verde musgo del sitio: ningún
# verde de la paleta llega a 4,5:1 sobre el gris claro de las cajas (el más oscuro, Verde 4 #008641, da 4,3).
DEFECTO = {"claro": {"verde-texto": "#3D6B47"}, "oscuro": {"verde-texto": "#9DCCA6"}}

# Fondos fijos de cada modo (no cambian con la paleta)
FONDOS = {"claro": {"papel": "#FFFFFF", "niebla": "#F2F6F9"}, "oscuro": {"papel": "#323232", "niebla": "#2A2A2A"}}

# Variables que cambia cada combinación. Qué es cada una (ver :root en sede.css):
#   azul: titulares, botones y acentos · enlace: enlaces · sobre-acento: texto sobre «azul»
#   banda: franja de la semana (texto sobre-banda y sobre-banda-2) · azul-hondo: fondo del pie (texto pie-texto)
#   musgo: segundo acento (filetes, tarjetas alternas) · verde-texto: «abre» y «en curso», como texto y como fondo
#   (sobre él, el texto toma el color del papel)
#   filete: rayas decorativas · cab-boton: botón del menú (ícono blanco)
PALETAS = {
    "azul": {
        "nombre": "Azul UCR",
        "claro": dict(azul="azul2", enlace="azul2", **{"sobre-acento": "blanco", "banda": "azul1", "sobre-banda": "blanco",
                      "sobre-banda-2": "celeste3", "azul-hondo": "azul1", "pie-texto": "celeste3", "musgo": "azul1",
                      "filete": "celeste", "cab-boton": "azul2", "franja": "azul2"}),
        "oscuro": dict(azul="celeste2", enlace="celeste2", **{"sobre-acento": "azul1", "banda": "azul1", "sobre-banda": "blanco",
                       "sobre-banda-2": "celeste3", "azul-hondo": "azul1", "pie-texto": "celeste3", "musgo": "celeste3",
                       "verde-texto": "verde", "filete": "celeste", "cab-boton": "azul2", "franja": "azul1"}),
    },
    "caribe": {
        "nombre": "Verde Caribe",
        "claro": dict(azul="azul1", enlace="azul2", **{"sobre-acento": "blanco", "banda": "verde4", "sobre-banda": "blanco",
                      "sobre-banda-2": "blanco", "azul-hondo": "azul1", "pie-texto": "verde2", "musgo": "verde4",
                      "filete": "verde", "cab-boton": "verde4", "franja": "verde4"}),
        "oscuro": dict(azul="verde2", enlace="celeste2", **{"sobre-acento": "azul1", "banda": "verde4", "sobre-banda": "blanco",
                       "sobre-banda-2": "blanco", "azul-hondo": "azul1", "pie-texto": "verde2", "musgo": "celeste2",
                       "verde-texto": "verde", "filete": "verde", "cab-boton": "verde4", "franja": "verde4"}),
    },
    "tierra": {
        "nombre": "Tierra",
        "claro": dict(azul="cafe2", enlace="cafe2", **{"sobre-acento": "blanco", "banda": "cafe2", "sobre-banda": "blanco",
                      "sobre-banda-2": "naranja1", "azul-hondo": "cafe3", "pie-texto": "gris1", "musgo": "cafe1",
                      "filete": "naranja3", "cab-boton": "cafe2", "franja": "cafe2"}),
        "oscuro": dict(azul="naranja1", enlace="naranja1", **{"sobre-acento": "gris3", "banda": "cafe2", "sobre-banda": "blanco",
                       "sobre-banda-2": "naranja1", "azul-hondo": "cafe3", "pie-texto": "gris1", "musgo": "amarillo4",
                       "verde-texto": "verde", "filete": "naranja3", "cab-boton": "cafe2", "franja": "cafe2"}),
    },
    "celeste": {
        "nombre": "Celeste",
        "claro": dict(azul="azul2", enlace="azul2", **{"sobre-acento": "blanco", "banda": "celeste", "sobre-banda": "azul1",
                      "sobre-banda-2": "azul1", "azul-hondo": "azul1", "pie-texto": "celeste2", "musgo": "azul1",
                      "filete": "celeste", "cab-boton": "azul2", "franja": "azul2"}),
        "oscuro": dict(azul="celeste", enlace="celeste2", **{"sobre-acento": "azul1", "banda": "celeste", "sobre-banda": "azul1",
                       "sobre-banda-2": "azul1", "azul-hondo": "azul1", "pie-texto": "celeste2", "musgo": "celeste4",
                       "verde-texto": "verde", "filete": "celeste", "cab-boton": "azul2", "franja": "azul1"}),
    },
}

# Muestras del menú (tres colores por combinación). «institucional» es la de siempre (variables de :root en sede.css).
INSTITUCIONAL = ("#005DA4", "#3D6B47", "#00C0F3")
MUESTRA = ("banda", "musgo", "filete")

# Pares que deben leerse: (texto, fondo, mínimo). 4,5 para texto; 3 para íconos y piezas gráficas (WCAG 1.4.11).
PARES = [("enlace", "papel", 4.5), ("enlace", "niebla", 4.5), ("azul", "papel", 4.5), ("azul", "niebla", 4.5),
         ("sobre-acento", "azul", 4.5), ("sobre-banda", "banda", 4.5), ("sobre-banda-2", "banda", 4.5),
         ("pie-texto", "azul-hondo", 4.5), ("papel", "verde-texto", 4.5), ("verde-texto", "papel", 4.5), ("verde-texto", "niebla", 4.5), ("blanco", "cab-boton", 3), ("musgo", "papel", 3)]


def luminancia(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contraste(a, b):
    la, lb = sorted((luminancia(a), luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def revisar():
    fallas = []
    plantilla = (CSS.parent.parent.parent / "templates" / "_macros.html").read_text(encoding="utf-8")
    for clave, p in PALETAS.items():   # el menú de la plantilla debe ofrecer cada combinación, con su nombre
        if f'("{clave}", "{p["nombre"]}")' not in plantilla:
            fallas.append(f"El menú de _macros.html no ofrece «{clave}» ({p['nombre']})")
    for clave, p in PALETAS.items():
        for modo in ("claro", "oscuro"):
            v = DEFECTO[modo] | {k: UCR[c] for k, c in p[modo].items()} | FONDOS[modo] | {"blanco": "#FFFFFF"}
            for t, f, minimo in PARES:
                r = contraste(v[t], v[f])
                if r < minimo:
                    fallas.append(f"{p['nombre']} ({modo}): {t} {v[t]} sobre {f} {v[f]} = {r:.2f} (mínimo {minimo})")
    return fallas


def bloque():
    lineas = ["/* paletas: inicio (generado por herramientas/paletas.py; no editar a mano) */"]
    for clave, p in PALETAS.items():
        for modo, sel in (("claro", f':root[data-paleta="{clave}"]'), ("oscuro", f':root[data-tema="oscuro"][data-paleta="{clave}"]')):
            decl = "; ".join(f"--{k}: {UCR[c]}" for k, c in p[modo].items())
            lineas.append(f"{sel} {{ {decl}; }}")
    # muestras del menú «Colores» (sin estilos en línea: la política de seguridad del sitio no los permite)
    lineas.append(f'[data-colores="institucional"] {{ --m1: {INSTITUCIONAL[0]}; --m2: {INSTITUCIONAL[1]}; --m3: {INSTITUCIONAL[2]}; }}')
    for clave, p in PALETAS.items():
        m = [UCR[p["claro"][k]] for k in MUESTRA]
        lineas.append(f'[data-colores="{clave}"] {{ --m1: {m[0]}; --m2: {m[1]}; --m3: {m[2]}; }}')
    lineas.append("/* paletas: fin */")
    return "\n".join(lineas)


if __name__ == "__main__":
    fallas = revisar()
    for f in fallas:
        print("  ✗", f)
    if fallas:
        sys.exit(f"{len(fallas)} pares sin contraste suficiente")
    print(f"Contraste suficiente en {len(PALETAS)} combinaciones × 2 modos × {len(PARES)} pares")
    if "--revisar" not in sys.argv:
        css = CSS.read_text(encoding="utf-8")
        nuevo = re.sub(r"/\* paletas: inicio.*?/\* paletas: fin \*/", lambda m: bloque(), css, flags=re.S)
        if nuevo == css and "paletas: inicio" not in css:
            sys.exit("Falta la marca «/* paletas: inicio */ … /* paletas: fin */» en sede.css")
        CSS.write_text(nuevo, encoding="utf-8")
        print("Bloque de paletas escrito en sede.css")
