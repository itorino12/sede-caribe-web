#!/usr/bin/env python3
"""Dibuja la captura fija de la maqueta para la portada (src/assets/img/portada-maqueta.webp).

La portada muestra esta imagen mientras carga la maqueta 3D en vivo, que entra después con un fundido.
Uso (después de python3 build.py):  python3 herramientas/portada.py
Volver a correrlo cada vez que cambie la maqueta (herramientas/campus3d.py).
"""
import functools
import http.server
import io
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
ANCHO, ALTO = 1920, 600


def main():
    manejador = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(RAIZ / "dist"))
    manejador.log_message = lambda *a: None
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": ANCHO, "height": 1100})
        pg.goto(f"http://127.0.0.1:{servidor.server_address[1]}/index.html#captura-portada")
        pg.add_style_tag(content=f".portada__rejilla{{min-height:{ALTO}px!important;height:{ALTO}px}}.portada__foto::after,.portada__texto,.portada__recorrido-boton{{display:none!important}}")
        pg.wait_for_function("window.__giro", timeout=60000)
        pg.wait_for_timeout(4000)   # textura del suelo y mural
        pg.evaluate("() => { const g = window.__giro; g.dibujarYa(); }")
        png = pg.locator(".mapa3d--portada .mapa3d__lienzo").screenshot()
        b.close()
    Image.open(io.BytesIO(png)).convert("RGB").save(RAIZ / "src/assets/img/portada-maqueta.webp", quality=78)
    print("Captura de la portada lista")


if __name__ == "__main__":
    main()
