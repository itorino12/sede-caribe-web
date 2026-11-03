#!/usr/bin/env python3
"""Dibuja las imágenes de la maqueta para la portada.

    src/assets/img/portada-maqueta.webp      captura fija: se ve mientras carga la maqueta 3D en vivo
    src/assets/img/portada-giro/vista-NN.webp vistas alrededor del campus: si el 3D falla, la portada
                                              las pasa lentamente (assets/js/portada-giro.js)
    src/assets/img/portada-giro/giro.json     cantidad de vistas
Uso (después de python3 build.py):  python3 herramientas/portada.py
Volver a correrlo cada vez que cambie la maqueta (herramientas/campus3d.py).
"""
import functools
import http.server
import io
import json
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
ANCHO, ALTO = 1920, 600
CUADROS, ANCHO_GIRO, ALTO_GIRO = 24, 1600, 500
SALIDA_GIRO = RAIZ / "src/assets/img/portada-giro"


def main():
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    manejador = functools.partial(Silencioso, directory=str(RAIZ / "dist"))
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": ANCHO, "height": 1100})
        pg.goto(f"http://127.0.0.1:{servidor.server_address[1]}/index.html#captura-portada")
        pg.add_style_tag(content=f".portada__rejilla{{min-height:{ALTO}px!important;height:{ALTO}px}}.portada__foto::after,.portada__texto,.portada__recorrido-boton,.portada__maqueta-fija{{display:none!important}}")
        pg.wait_for_function("window.__giro", timeout=60000)
        pg.wait_for_timeout(4000)   # textura del suelo y mural
        pg.evaluate("() => { const g = window.__giro; g.dibujarYa(); }")
        lienzo = pg.locator(".mapa3d--portada .mapa3d__lienzo")
        png = lienzo.screenshot()
        Image.open(io.BytesIO(png)).convert("RGB").save(RAIZ / "src/assets/img/portada-maqueta.webp", quality=78)
        # vistas de respaldo: misma cámara, girando en el mismo sentido que la maqueta en vivo
        SALIDA_GIRO.mkdir(parents=True, exist_ok=True)
        for viejo in SALIDA_GIRO.glob("vista-*.webp"):
            viejo.unlink()
        for i in range(CUADROS):
            pg.evaluate("""([i, n]) => {
              const g = window.__giro, t = g.controles.target, c = g.camara.position;
              if (!g.inicio) { const dx = c.x - t.x, dz = c.z - t.z; g.inicio = { az: Math.atan2(dx, dz), r: Math.hypot(dx, dz), y: c.y }; }
              const az = g.inicio.az - (i / n) * Math.PI * 2;
              c.set(t.x + g.inicio.r * Math.sin(az), g.inicio.y, t.z + g.inicio.r * Math.cos(az));
              g.camara.lookAt(t); g.dibujarYa();
            }""", [i, CUADROS])
            Image.open(io.BytesIO(lienzo.screenshot())).convert("RGB").resize((ANCHO_GIRO, ALTO_GIRO), Image.LANCZOS) \
                .save(SALIDA_GIRO / f"vista-{i:02d}.webp", quality=72, method=6)
        b.close()
    servidor.shutdown()
    (SALIDA_GIRO / "giro.json").write_text(json.dumps({"cuadros": CUADROS}), encoding="utf-8")
    peso = sum(f.stat().st_size for f in SALIDA_GIRO.glob("*.webp")) / 1024
    print(f"Portada lista: captura fija y {CUADROS} vistas de respaldo ({peso:.0f} KB)")


if __name__ == "__main__":
    main()
