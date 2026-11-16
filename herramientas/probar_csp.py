#!/usr/bin/env python3
"""Comprueba que el sitio compilado funciona con las cabeceras de seguridad del servidor.

Sirve dist/ con las mismas cabeceras de servidor/sede-cabeceras.conf (la política de contenido incluida),
abre las páginas con Chromium y avisa de toda violación de la política y de errores de JavaScript.
Uso (después de compilar):  python3 herramientas/probar_csp.py [página ...]
Sin páginas, revisa una muestra: portada, recorrido, una carrera, horarios, noticias, agenda y estudiar.
"""
import http.server
import re
import sys
import threading
from functools import partial
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DIST = RAIZ / "dist"
MUESTRA = ["index.html", "recorrido.html", "carreras/informatica-empresarial.html", "horarios.html",
           "noticias.html", "agenda.html", "estudiar.html"]


def cabeceras():
    """Las add_header de sede-cabeceras.conf, tal como las manda nginx."""
    texto = (RAIZ / "servidor" / "sede-cabeceras.conf").read_text(encoding="utf-8")
    return re.findall(r'add_header\s+(\S+)\s+"(.*?)"\s+always;', texto)


class Manejador(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for nombre, valor in cabeceras():
            if nombre != "Strict-Transport-Security":   # sobre HTTP local no aplica
                self.send_header(nombre, valor)
        super().end_headers()

    def log_message(self, *a):
        pass


def main():
    from playwright.sync_api import sync_playwright
    paginas = sys.argv[1:] or MUESTRA
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), partial(Manejador, directory=str(DIST)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    fallos = 0
    with sync_playwright() as p:
        nav = p.chromium.launch(args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        for pag in paginas:
            ctx = nav.new_context(viewport={"width": 1280, "height": 900})
            hoja = ctx.new_page()
            avisos = []
            hoja.on("console", lambda m: avisos.append(m.text) if m.type == "error" else None)
            hoja.on("pageerror", lambda e: avisos.append(f"JavaScript: {e}"))
            hoja.goto(base + pag, wait_until="load")
            hoja.wait_for_timeout(4000)   # tiempo a congo.js, la maqueta y los carruseles
            avisos = sorted(set(a[:220] for a in avisos))
            print(f"{'OK ' if not avisos else 'FALLA'} {pag}")
            for a in avisos:
                print("     ", a)
            fallos += bool(avisos)
            ctx.close()
        nav.close()
    srv.shutdown()
    sys.exit(1 if fallos else 0)


if __name__ == "__main__":
    main()
