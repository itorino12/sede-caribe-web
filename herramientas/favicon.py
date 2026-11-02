#!/usr/bin/env python3
"""Genera el ícono del sitio: «SC» en blanco sobre azul UCR oscuro, con una raya verde debajo.

Las letras se convierten en trazos a partir de Source Sans 3 Black (la tipografía del sitio), así el
ícono se ve igual en cualquier navegador aunque no tenga la fuente. Genera en src/assets/img/:
  favicon.svg                 ícono principal (pestañas y marcadores)
  favicon-32.png, icono-180.png, icono-192.png, icono-512.png   para navegadores y pantallas de inicio
  sitio.webmanifest           nombre y colores para «Agregar a la pantalla de inicio»

Necesita fonttools y brotli (pip install fonttools brotli). Los PNG se dibujan con Chromium (Playwright).
"""
import json
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

RAIZ = Path(__file__).resolve().parent.parent
IMG = RAIZ / "src/assets/img"
FUENTE = RAIZ / "src/assets/fonts/source-sans-3-latin-900-normal.woff2"
FONDO, LETRA, RAYA = "#01477C", "#FFFFFF", "#6DC067"   # azul UCR oscuro, blanco, verde UCR


def letras(texto, alto_mayus, centro_x, base_y):
    f = TTFont(FUENTE)
    glifos, cmap, hmtx = f.getGlyphSet(), f.getBestCmap(), f["hmtx"]
    cap = f["OS/2"].sCapHeight or 660
    k = alto_mayus / cap
    espacio = -18   # letras un poco más juntas, como en un logotipo
    ancho = sum(hmtx[cmap[ord(c)]][0] for c in texto) + espacio * (len(texto) - 1)
    x, trazos = centro_x / k - ancho / 2, []
    for c in texto:
        nombre = cmap[ord(c)]
        pen = SVGPathPen(glifos)
        glifos[nombre].draw(TransformPen(pen, (k, 0, 0, -k, x * k, base_y)))
        trazos.append(pen.getCommands())
        x += hmtx[nombre][0] + espacio
    return "".join(trazos)


def svg():
    d = letras("SC", 25, 32, 37)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
            f'<rect width="64" height="64" rx="12" fill="{FONDO}"/>'
            f'<path d="{d}" fill="{LETRA}"/>'
            f'<rect x="15" y="44" width="34" height="5" rx="2.5" fill="{RAYA}"/></svg>\n')


def png(contenido):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch()
        for tam, nombre in [(32, "favicon-32.png"), (180, "icono-180.png"), (192, "icono-192.png"), (512, "icono-512.png")]:
            pg = b.new_page(viewport={"width": tam, "height": tam})
            # en la pantalla de inicio el ícono va cuadrado: el sistema le pone sus propias esquinas
            cuadrado = contenido.replace('rx="12" ', "") if tam >= 180 else contenido
            pg.set_content(f'<style>*{{margin:0}}svg{{display:block;width:{tam}px;height:{tam}px}}</style>{cuadrado}')
            pg.screenshot(path=str(IMG / nombre), omit_background=True)
        b.close()


if __name__ == "__main__":
    contenido = svg()
    (IMG / "favicon.svg").write_text(contenido, encoding="utf-8")
    png(contenido)
    (IMG / "sitio.webmanifest").write_text(json.dumps({
        "name": "UCR Sede del Caribe", "short_name": "Sede del Caribe", "start_url": "../../index.html", "display": "browser",
        "background_color": "#FFFFFF", "theme_color": FONDO,
        "icons": [{"src": "icono-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "icono-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]},
        ensure_ascii=False, indent=1), encoding="utf-8")
    print("Ícono SC generado")
