#!/usr/bin/env python3
"""Dibuja las vistas de la maqueta giratoria (para navegadores sin 3D).

Abre el recorrido 3D ya compilado (dist/recorrido.html) en Chromium, gira la cámara alrededor del
campus y guarda una imagen por vista, más la posición de cada número de edificio en cada vista:
    src/assets/img/giro/giro-00.webp … giro-23.webp
    src/assets/img/giro/giro.json

Uso (después de python3 build.py):  python3 herramientas/giro.py
Volver a correrlo cada vez que cambie la maqueta (herramientas/campus3d.py).
"""
import functools
import http.server
import json
import math
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "src/assets/img/giro"
CUADROS, ANCHO, ALTO = 24, 1200, 700


def main():
    SALIDA.mkdir(parents=True, exist_ok=True)
    manejador = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(RAIZ / "dist"))
    manejador.log_message = lambda *a: None
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{servidor.server_address[1]}/recorrido.html#captura-giro"
    marcas = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": ANCHO + 200, "height": ALTO + 400})
        pg.goto(url)
        pg.wait_for_function("window.__giro", timeout=20000)
        pg.add_style_tag(content=f""".mapa3d__escena{{width:{ANCHO}px!important;height:{ALTO}px!important;min-height:0!important;border:0!important;border-radius:0!important}}
          .mapa3d__herramientas,.mapa3d__brujula,.mapa3d__marcas,.mapa3d__ficha{{display:none!important}}.ancho{{max-width:none!important;padding:0!important}}""")
        pg.wait_for_timeout(3000)   # textura del suelo
        for i in range(CUADROS):
            m = pg.evaluate("""([i, n]) => {
              const g = window.__giro, T = g.controles.target.constructor;
              const objetivo = new T(-15, 0, 10);
              const inicio = Math.atan2(-80, 370), radio = 370, polar = 0.98;
              const az = inicio + (i / n) * Math.PI * 2;
              g.controles.target.copy(objetivo);
              g.camara.position.set(objetivo.x + radio * Math.sin(polar) * Math.sin(az), radio * Math.cos(polar), objetivo.z + radio * Math.sin(polar) * Math.cos(az));
              g.camara.fov = 38;
              g.dibujarYa();
              g.escena.fog.near = radio * 1.2; g.escena.fog.far = radio * 3;
              g.dibujarYa();
              const salida = [];
              for (const e of g.edificios) {
                if (e.userData.menor) continue;   // los lugares menores salen solo en la lista
                const v = e.userData.centro.clone(); v.y += 3; v.project(g.camara);
                const x = (v.x + 1) / 2 * 100, y = (1 - v.y) / 2 * 100;
                if (v.z < 1 && x > 2 && x < 98 && y > 4 && y < 96) salida.push({ id: e.userData.id, x: +x.toFixed(2), y: +y.toFixed(2) });
              }
              return salida;
            }""", [i, CUADROS])
            marcas.append(m)
            archivo = SALIDA / f"giro-{i:02d}.png"
            pg.locator(".mapa3d__lienzo").screenshot(path=str(archivo))
            Image.open(archivo).convert("RGB").resize((ANCHO, ALTO)).save(archivo.with_suffix(".webp"), quality=70, method=6)
            archivo.unlink()
        b.close()
    servidor.shutdown()
    (SALIDA / "giro.json").write_text(json.dumps({"cuadros": CUADROS, "ancho": ANCHO, "alto": ALTO, "marcas": marcas}), encoding="utf-8")
    peso = sum(f.stat().st_size for f in SALIDA.glob("*.webp")) / 1024
    print(f"Maqueta giratoria: {CUADROS} vistas, {peso:.0f} KB")


if __name__ == "__main__":
    main()
