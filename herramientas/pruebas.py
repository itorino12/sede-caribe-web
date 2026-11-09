#!/usr/bin/env python3
"""Pruebas del sitio compilado (dist/), en Chromium con 3D por software.

Uso (después de python3 build.py --vista-previa):
    python3 herramientas/pruebas.py                 rápida: portada y recorrido en PC, sin errores, 3D listo
    python3 herramientas/pruebas.py --completa      además: celular, ficha, pantalla completa, botones de zona,
                                                    respaldos sin 3D (sin WebGL, 2 GB de memoria, ahorro de datos)
                                                    el asistente (el congo) y accesibilidad (axe, WCAG 2.2 AA, tema claro y oscuro)
    python3 herramientas/pruebas.py --vista=X,Z,ALTO  además guarda una vista cenital de la maqueta centrada en
                                                    (X, Z) a ALTO metros (coordenadas de campus3d.json)
Las capturas quedan en .cache/pruebas/. Sale con código 1 si algo falla.
"""
import argparse
import functools
import http.server
import subprocess
import sys
import tarfile
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / ".cache" / "pruebas"
GL = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
PAGINAS_AXE = ["index.html", "estudiar.html", "admision.html", "la-sede.html", "noticias.html", "agenda.html", "directorio.html",
               "enlaces.html", "contacto.html", "accesibilidad.html", "recorrido.html"]
fallas = []


def revisar(cond, texto):
    print(("  ok    " if cond else "  FALLA ") + texto)
    if not cond:
        fallas.append(texto)


def servidor():
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    s = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Silencioso, directory=str(RAIZ / "dist")))
    threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, f"http://127.0.0.1:{s.server_address[1]}/"


def pagina(nav, url, vp=None, previa=None, **ctx):
    c = nav.new_context(viewport=vp or {"width": 1366, "height": 900}, **ctx)
    if previa:
        c.add_init_script(previa)
    p = c.new_page()
    errores = []
    p.on("pageerror", lambda e: errores.append(str(e)))
    p.goto(url, wait_until="domcontentloaded")
    return c, p, errores


def estado_portada(p):
    return p.evaluate("(() => { const f = document.querySelector('.portada__foto--3d'); return { respaldo: !!f.dataset.giro, listo: !!f.querySelector('.mapa3d--listo') }; })()")


def menu(nav, base):
    print("Menú principal")
    for ancho in (1300, 1920):  # el menú horizontal empieza en 1281 px
        c, p, e = pagina(nav, base + "directorio.html", {"width": ancho, "height": 900})
        filas = p.evaluate("[...new Set([...document.querySelectorAll('.menu > ul > li:not(.menu__buscar)')].map(li => Math.round(li.getBoundingClientRect().top)))].length")
        revisar(filas == 1, f"{ancho} px: todas las entradas caben en una fila")
        revisar(p.evaluate("document.documentElement.scrollWidth <= innerWidth"), f"{ancho} px: sin desborde horizontal")
        for b in p.locator(".menu__item--sub > .menu__enlace").all():
            b.click()
            caja = b.locator("xpath=following-sibling::ul").bounding_box()
            revisar(caja["x"] >= 0 and caja["x"] + caja["width"] <= ancho, f"{ancho} px: el submenú «{b.inner_text()}» cabe en la pantalla")
            b.click()
        if ancho == 1300:
            p.locator(".cabecera").screenshot(path=str(SALIDA / "menu.png"))
        c.close()
    c, p, e = pagina(nav, base + "directorio.html?buscar=Recursos+humanos")
    p.wait_for_timeout(300)
    visibles = p.evaluate("[...document.querySelectorAll('[data-fila]')].filter(f => !f.hidden).map(f => f.textContent)")
    revisar(visibles and all("ecursos humanos" in v for v in visibles), f"directorio?buscar= llega filtrado ({len(visibles)} filas)")
    revisar(not e, f"directorio sin errores {e[:1]}")
    c.close()


def rapida(nav, base):
    menu(nav, base)
    print("Portada y recorrido (PC)")
    c, p, e = pagina(nav, base + "index.html")
    p.wait_for_selector(".mapa3d--listo", timeout=120000)
    revisar(not e, f"portada sin errores {e[:1]}")
    c.close()
    c, p, e = pagina(nav, base + "recorrido.html")
    p.wait_for_selector(".mapa3d--listo", timeout=120000)
    p.wait_for_timeout(1500)
    p.locator(".mapa3d__escena").screenshot(path=str(SALIDA / "recorrido.png"))
    revisar(not e, f"recorrido sin errores {e[:1]}")
    c.close()


def leer_axe():
    axe_js = RAIZ / ".cache" / "axe" / "package" / "axe.min.js"
    if not axe_js.exists():
        axe_js.parent.parent.mkdir(parents=True, exist_ok=True)
        with tarfile.open(RAIZ / "herramientas" / "fuentes" / "axe-core-4.14.0.tgz") as t:
            t.extractall(axe_js.parent.parent, filter="data")
    return axe_js.read_text(encoding="utf-8")


def asistente(nav, base):
    """El congo de la portada abre el asistente; sin servidor responde buscando en el sitio."""
    print("Asistente (el congo)")
    for nombre, vp, mov in (("celular", {"width": 390, "height": 844}, True), ("pc", {"width": 1366, "height": 900}, False)):
        for esquema in ("light", "dark"):
            c, p, e = pagina(nav, base + "index.html", vp, is_mobile=mov, has_touch=mov, color_scheme=esquema)
            p.wait_for_selector(".congo-boton", timeout=20000)
            p.locator(".congo-boton").click(force=True)  # el congo se mueve: no se espera a que se quede quieto
            p.wait_for_selector("dialog.asistente[open]")
            p.wait_for_timeout(900)
            if esquema == "light":
                revisar(p.evaluate("document.querySelectorAll('.asistente__selva .congo').length") == 2, f"{nombre}: el congo pasa al asistente")
                revisar(p.evaluate("document.querySelector('.portada > .congo').classList.contains('congo--fuera')"), f"{nombre}: y se baja de la rama de la portada")
                p.fill("#asistente-campo", "becas")
                p.keyboard.press("Enter")
                p.wait_for_function("document.querySelectorAll('.mensaje--congo').length >= 2 && !document.querySelector('.mensaje--escribiendo')")
                revisar(p.evaluate("!!document.querySelector('.mensaje--congo:last-child a[href]')"), f"{nombre}: sin servidor, responde con enlaces del sitio")
                p.route("**/api/asistente", lambda r: r.fulfill(status=200, headers={"Content-Type": "text/plain; charset=utf-8"},
                                                                  body="Con **gusto**. Vea el [Directorio](/directorio.html)."))
                p.fill("#asistente-campo", "¿Dónde queda Registro?")
                p.click(".asistente__enviar")
                p.wait_for_function("document.querySelectorAll('.mensaje--congo').length >= 3 && !document.querySelector('.mensaje--escribiendo')")
                revisar(p.evaluate("!!document.querySelector('.mensaje--congo:last-child strong') && document.querySelector('.mensaje--congo:last-child a').getAttribute('href') === 'directorio.html'"),
                        f"{nombre}: con servidor, muestra la respuesta con formato y enlaces")
                p.screenshot(path=str(SALIDA / f"asistente-{nombre}.png"))
            p.add_script_tag(content=leer_axe())
            v = p.evaluate("axe.run(document.querySelector('dialog.asistente'), {runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}).then(r=>r.violations.map(v=>v.id+' ('+v.nodes.length+')'))")
            revisar(not v, f"{nombre} {esquema}: axe en el asistente {', '.join(v)}")
            p.keyboard.press("Escape"); p.wait_for_timeout(700)
            revisar(p.evaluate("!document.querySelector('dialog.asistente').open && !document.querySelector('.portada > .congo').classList.contains('congo--fuera')"),
                    f"{nombre} {esquema}: al cerrar, el congo vuelve a la rama")
            revisar(not e, f"{nombre} {esquema}: sin errores {e[:1]}")
            c.close()


def completa(nav, base):
    print("Recorrido: ficha, pantalla completa y zonas")
    c, p, e = pagina(nav, base + "recorrido.html#lugar-1")
    p.wait_for_selector(".mapa3d--listo", timeout=120000)
    p.wait_for_timeout(1500)
    revisar(p.evaluate("!document.querySelector('.mapa3d__ficha').hidden"), "#lugar-1 abre la ficha")
    revisar(p.evaluate("document.querySelectorAll('.mapa3d__ficha-dependencias li').length") > 0, "la ficha muestra aulas y dependencias")
    p.click(".mapa3d__ficha-cerrar")
    p.click("[data-pantalla]"); p.wait_for_timeout(800)
    revisar(p.evaluate("!!document.fullscreenElement"), "pantalla completa")
    p.click("[data-pantalla]"); p.wait_for_timeout(500)
    p.click("[data-zona='3']"); p.wait_for_timeout(2000)
    revisar(p.evaluate("document.querySelector('[data-zona=\"3\"]').getAttribute('aria-pressed')") == "true", "botón de zona")
    p.locator(".mapa3d__escena").screenshot(path=str(SALIDA / "zona3.png"))
    revisar(not e, f"sin errores {e[:1]}")
    c.close()

    print("Celular")
    c, p, e = pagina(nav, base + "recorrido.html#lugar-26", {"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    p.wait_for_selector(".mapa3d--listo", timeout=120000)
    p.wait_for_timeout(1500)
    p.screenshot(path=str(SALIDA / "celular.png"))
    revisar(not e, f"celular sin errores {e[:1]}")
    c.close()

    print("Respaldos de la portada")
    c, p, _ = pagina(nav, base + "index.html", previa="Object.defineProperty(navigator,'deviceMemory',{get:()=>2})")
    p.wait_for_timeout(6000)
    revisar(estado_portada(p)["respaldo"], "2 GB de memoria → vistas de respaldo")
    c.close()
    c, p, _ = pagina(nav, base + "index.html", previa="Object.defineProperty(navigator,'connection',{get:()=>({saveData:true})})")
    p.wait_for_timeout(6000)
    revisar(estado_portada(p)["respaldo"], "ahorro de datos → vistas de respaldo")
    c.close()
    sin3d = nav.browser_type.launch(args=["--disable-webgl", "--disable-3d-apis"])
    c, p, _ = pagina(sin3d, base + "index.html")
    p.wait_for_timeout(6000)
    revisar(estado_portada(p)["respaldo"], "sin WebGL → vistas de respaldo")
    c.close()
    c, p, e = pagina(sin3d, base + "recorrido.html")
    p.wait_for_timeout(4000)
    revisar(p.evaluate("document.querySelector('.mapa3d').classList.contains('mapa3d--giro')"), "recorrido sin WebGL → maqueta giratoria")
    c.close(); sin3d.close()

    asistente(nav, base)

    print("Accesibilidad (axe)")
    axe = leer_axe()
    for esquema in ("light", "dark"):
        c = nav.new_context(color_scheme=esquema, viewport={"width": 1280, "height": 900})
        for url in PAGINAS_AXE:
            p = c.new_page()
            p.goto(base + url, wait_until="domcontentloaded")
            p.add_script_tag(content=axe)
            v = p.evaluate("axe.run({runOnly:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}).then(r=>r.violations.map(v=>v.id+' ('+v.nodes.length+')'))")
            if v:
                revisar(False, f"axe {esquema} {url}: {', '.join(v)}")
            p.close()
        c.close()
    revisar(True, "axe terminado")


def vista(nav, base, texto):
    x, z, alto = (float(v) for v in texto.split(","))
    c, p, _ = pagina(nav, base + "recorrido.html#captura-giro", {"width": 1280, "height": 900})
    p.wait_for_function("window.__giro", timeout=120000)
    p.wait_for_timeout(2500)
    p.add_style_tag(content=".mapa3d__herramientas,.mapa3d__brujula,.mapa3d__marcas,.mapa3d__zonas{display:none!important}.mapa3d__escena{height:800px!important}")
    p.evaluate("""([x, z, h]) => { const g = window.__giro; g.controles.target.set(x, 0, z); g.camara.position.set(x, h, z + 0.01);
      g.camara.up.set(0, 0, -1); g.camara.lookAt(x, 0, z); g.escena.fog.near = 5000; g.escena.fog.far = 9000; g.renderer.render(g.escena, g.camara); }""", [x, z, alto])
    archivo = SALIDA / f"vista_{int(x)}_{int(z)}.png"
    p.locator(".mapa3d__lienzo").screenshot(path=str(archivo))
    print(f"Vista guardada en {archivo.relative_to(RAIZ)}")
    c.close()


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--completa", action="store_true")
    a.add_argument("--vista")
    args = a.parse_args()
    if not (RAIZ / "dist" / "index.html").exists():
        subprocess.run([sys.executable, "build.py", "--vista-previa"], cwd=RAIZ, check=True)
    SALIDA.mkdir(parents=True, exist_ok=True)
    s, base = servidor()
    with sync_playwright() as pw:
        nav = pw.chromium.launch(args=GL)
        rapida(nav, base)
        if args.completa:
            completa(nav, base)
        if args.vista:
            vista(nav, base, args.vista)
        nav.close()
    s.shutdown()
    print(f"\n{len(fallas)} fallas. Capturas en .cache/pruebas/" if fallas else "\nTodo bien. Capturas en .cache/pruebas/")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
