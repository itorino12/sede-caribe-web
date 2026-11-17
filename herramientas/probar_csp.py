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
           "noticias.html", "agenda.html", "estudiar.html", "declaracion-jurada.html"]


def cabeceras():
    """Las add_header de sede-cabeceras.conf, tal como las manda nginx."""
    texto = (RAIZ / "servidor" / "sede-cabeceras.conf").read_text(encoding="utf-8")
    return re.findall(r'add_header\s+(\S+)\s+"(.*?)"\s+always;', texto)


class Manejador(http.server.SimpleHTTPRequestHandler):
    # como el nginx de Ubuntu 24.04: .mjs no está en mime.types y sale como binario (con nosniff, el navegador no lo ejecuta)
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".mjs": "application/octet-stream"}

    def end_headers(self):
        for nombre, valor in cabeceras():
            if nombre != "Strict-Transport-Security":   # sobre HTTP local no aplica
                self.send_header(nombre, valor)
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/health":  # como el congo en marcha: la página no registra un 404 en la consola
            cuerpo = b'{"status":"ok"}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(cuerpo)))
            self.end_headers()
            self.wfile.write(cuerpo)
            return
        super().do_GET()

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
            ctx = nav.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
            hoja = ctx.new_page()
            avisos = []
            hoja.on("console", lambda m: avisos.append(m.text) if m.type == "error" else None)
            hoja.on("pageerror", lambda e: avisos.append(f"JavaScript: {e}"))
            hoja.goto(base + pag, wait_until="load")
            hoja.wait_for_timeout(4000)   # tiempo a congo.js, la maqueta y los carruseles
            if pag == "declaracion-jurada.html":  # pdf-lib, el adjunto y pdf.js (con su worker) bajo la política
                with hoja.expect_download() as d:
                    hoja.click("#dj-pdf")
                ruta = DIST.parent / ".cache" / "csp-declaracion.pdf"
                d.value.save_as(ruta)
                hoja.click('[data-modo="pdf"]')
                hoja.set_input_files("#dj-archivo", str(ruta))
                for _ in range(60):  # wait_for_function usa eval, que la política bloquea
                    if "generó esta página" in hoja.locator("#dj-estado").inner_text():
                        break
                    hoja.wait_for_timeout(250)
                else:
                    avisos.append("no se pudo leer el PDF generado (pdf.js)")
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
