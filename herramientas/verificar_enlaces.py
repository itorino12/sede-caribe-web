#!/usr/bin/env python3
"""Verificador de enlaces del sitio compilado (dist/).

Uso (después de python3 build.py --vista-previa):
    python3 herramientas/verificar_enlaces.py                 internos: páginas, imágenes, scripts, estilos y anclas
    python3 herramientas/verificar_enlaces.py --externos      además comprueba cada enlace externo en internet
    python3 herramientas/verificar_enlaces.py --estricto      las anclas que faltan también cuentan como error
    python3 herramientas/verificar_enlaces.py --json salida.json
    python3 herramientas/verificar_enlaces.py --autoprueba    se prueba a sí mismo con un sitio de muestra

Sale con código 1 si hay errores internos (o externos rotos, con --externos).
- Error: el archivo no existe, o el enlace externo responde 404/410, error de servidor, DNS o certificado.
- Revisar: el sitio responde 401/403/429/999 (muchos sitios bloquean a los robots) o tardó demasiado: se mira a mano.
- Aviso: una ancla que no está en el HTML compilado (puede crearla un script). Las del recorrido (#lugar-N) se
  validan contra src/data/lugares.json.
- Dependen de la web antigua: /images/… y /index.php/… del Joomla; no fallan, pero se rompen al cambiar de sitio.
"""
import argparse
import concurrent.futures
import json
import re
import ssl
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urldefrag, urljoin, urlsplit

RAIZ = Path(__file__).resolve().parent.parent
ESQUEMAS_IGNORADOS = ("mailto:", "tel:", "javascript:", "data:", "sms:", "whatsapp:", "webcal:", "blob:")
REL_ENLAZADOS = {"stylesheet", "icon", "apple-touch-icon", "manifest", "preload", "alternate", "modulepreload", "shortcut"}
# Direcciones de la web Joomla anterior: hoy funcionan porque el sitio viejo sigue en línea, o las redirige nginx a una
# página general. Se listan aparte porque dejan de funcionar (o llevan a un lugar equivocado) al cambiar de sitio.
HEREDADOS = ("/index.php/", "/images/")
AGENTE = "Mozilla/5.0 (compatible; VerificadorEnlaces-SedeCaribe/1.0; +https://sedecaribe.ucr.ac.cr)"


class Lector(HTMLParser):
    """Junta, de una página, los enlaces que hay que comprobar y las anclas que ofrece."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []   # (etiqueta, url, línea)
        self.ids = set()

    def handle_starttag(self, tag, atributos):
        a = dict(atributos)
        linea = self.getpos()[0]
        if a.get("id"):
            self.ids.add(a["id"])
        if tag == "a" and a.get("name"):
            self.ids.add(a["name"])
        if tag in ("a", "area") and a.get("href"):
            self.refs.append((tag, a["href"], linea))
        elif tag == "link" and a.get("href") and REL_ENLAZADOS & set((a.get("rel") or "").lower().split()):
            self.refs.append((tag, a["href"], linea))
        elif tag in ("img", "script", "source", "video", "audio", "iframe", "track", "embed") and a.get("src"):
            self.refs.append((tag, a["src"], linea))
        if tag in ("img", "source") and a.get("srcset"):
            for trozo in a["srcset"].split(","):
                url = trozo.strip().split(" ")[0]
                if url:
                    self.refs.append((tag, url, linea))
        if tag == "video" and a.get("poster"):
            self.refs.append((tag, a["poster"], linea))


def leer(archivo):
    lector = Lector()
    lector.feed(archivo.read_text(encoding="utf-8", errors="replace"))
    return lector


def destino_interno(dist, ruta):
    """Archivo de dist/ al que apunta una ruta (/a/b → a/b, a/b/ → a/b/index.html), o None si no existe."""
    rel = unquote(ruta).lstrip("/")
    candidato = dist / rel
    if rel == "" or rel.endswith("/"):
        candidato = candidato / "index.html"
    if candidato.is_file():
        return candidato
    if candidato.is_dir() and (candidato / "index.html").is_file():
        return candidato / "index.html"
    return None


def lugares_validos():
    """Números de lugar del recorrido (src/data/lugares.json): sus anclas #lugar-N las crea el visor 3D al cargar."""
    try:
        return {str(x["id"]) for x in json.loads((RAIZ / "src" / "data" / "lugares.json").read_text(encoding="utf-8"))}
    except (OSError, ValueError, KeyError, TypeError):
        return None


def revisar_internos(dist, anfitriones):
    paginas = sorted(dist.rglob("*.html"))
    lectores = {p: leer(p) for p in paginas}
    errores, avisos, heredados, externos = [], [], [], {}
    lugares = lugares_validos()
    for pagina, lector in lectores.items():
        url_pagina = "/" + pagina.relative_to(dist).as_posix()
        for etiqueta, url, linea in lector.refs:
            url = url.strip()
            if not url or url.startswith(ESQUEMAS_IGNORADOS):
                continue
            absoluta = urljoin("http://sitio.local" + url_pagina, url)
            partes = urlsplit(absoluta)
            if partes.hostname != "sitio.local":
                if partes.hostname in anfitriones:
                    absoluta = "http://sitio.local" + partes.path + (("#" + partes.fragment) if partes.fragment else "")
                    partes = urlsplit(absoluta)
                else:
                    externos.setdefault(urldefrag(url)[0] if url.startswith("http") else absoluta, []).append(
                        {"pagina": url_pagina, "linea": linea, "etiqueta": etiqueta})
                    continue
            destino = destino_interno(dist, partes.path)
            donde = {"pagina": url_pagina, "linea": linea, "etiqueta": etiqueta, "enlace": url}
            if destino is None:
                if partes.path.startswith(HEREDADOS):
                    heredados.append({**donde, "motivo": "dirección de la web antigua: no está en el sitio nuevo"})
                else:
                    errores.append({**donde, "motivo": "no existe el archivo"})
                continue
            ancla = unquote(partes.fragment)
            if ancla and ancla.lower() != "top" and destino.suffix == ".html":
                ids = (lectores.get(destino) or leer(destino)).ids
                lugar = re.fullmatch(r"lugar-(\d+)", ancla)
                if lugar and destino.name == "recorrido.html" and lugares is not None:
                    if lugar.group(1) not in lugares:
                        avisos.append({**donde, "motivo": f"el recorrido no tiene el lugar {lugar.group(1)}"})
                    continue
                if ancla not in ids:
                    avisos.append({**donde, "motivo": f"no hay ancla #{ancla} en el HTML de {destino.relative_to(dist).as_posix()}"})
    return errores, avisos, heredados, externos, len(paginas)


def comprobar(url, tiempo=15):
    """(estado, detalle) de un enlace externo: ok | error | revisar. Primero HEAD y, si falla, GET."""
    contexto = ssl.create_default_context()
    ultimo = ("error", "sin respuesta")
    for metodo in ("HEAD", "GET"):
        pedido = urllib.request.Request(url, method=metodo, headers={"User-Agent": AGENTE, "Accept": "*/*"})
        try:
            with urllib.request.urlopen(pedido, timeout=tiempo, context=contexto) as r:
                final = r.geturl()
                nota = ""
                if url.startswith("http://") and final.startswith("https://"):
                    nota = "usar https://"
                return "ok", nota or (f"redirige a {final}" if final.rstrip("/") != url.rstrip("/") else "")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429, 999):
                ultimo = ("revisar", f"HTTP {e.code} (puede bloquear a los robots)")
            elif e.code in (404, 410) or e.code >= 500:
                ultimo = ("error", f"HTTP {e.code}")
            elif e.code in (400, 405, 501):
                ultimo = ("revisar", f"HTTP {e.code}")
            else:
                ultimo = ("error", f"HTTP {e.code}")
            if metodo == "HEAD":
                continue  # algunos servidores rechazan HEAD: se prueba con GET
            return ultimo
        except (urllib.error.URLError, ssl.SSLError, OSError, ValueError) as e:
            motivo = getattr(e, "reason", e)
            if "timed out" in str(motivo).lower():
                return "revisar", "tardó demasiado"
            ultimo = ("error", f"{type(motivo).__name__}: {motivo}")
            if metodo == "HEAD":
                continue
            return ultimo
    return ultimo


def revisar_externos(externos, hilos=8):
    resultados = {}
    with concurrent.futures.ThreadPoolExecutor(hilos) as pool:
        futuros = {pool.submit(comprobar, u): u for u in externos if u.startswith(("http://", "https://"))}
        for f in concurrent.futures.as_completed(futuros):
            resultados[futuros[f]] = f.result()
    return resultados


def informe(dist, anfitriones, con_externos, estricto):
    errores, avisos, heredados, externos, n = revisar_internos(dist, anfitriones)
    salida = {"paginas": n, "errores": errores, "avisos": avisos, "heredados": heredados, "externos": {}}
    print(f"{n} páginas revisadas; {len(externos)} enlaces externos distintos.")
    sin_https = sorted(u for u in externos if u.startswith("http://"))
    if con_externos:
        for url, (estado, detalle) in sorted(revisar_externos(externos).items()):
            salida["externos"][url] = {"estado": estado, "detalle": detalle, "paginas": sorted({d["pagina"] for d in externos[url]})}
    por_estado = {e: [(u, d) for u, d in salida["externos"].items() if d["estado"] == e] for e in ("error", "revisar", "ok")}

    if errores:
        print(f"\nERRORES INTERNOS ({len(errores)}):")
        for e in errores:
            print(f"  {e['pagina']}:{e['linea']}  <{e['etiqueta']}> {e['enlace']}  → {e['motivo']}")
    if heredados:
        print(f"\nDependen de la web antigua ({len(heredados)}): hoy funcionan solo mientras el Joomla siga en línea" + ("" if estricto else " (no fallan)"))
        for e in heredados:
            print(f"  {e['pagina']}:{e['linea']}  {e['enlace'][:150]}")
    if avisos:
        print(f"\nAvisos de anclas ({len(avisos)}):" + ("" if estricto else " (no fallan; pueden crearlas los scripts)"))
        for e in avisos[:40]:
            print(f"  {e['pagina']}:{e['linea']}  {e['enlace']}  → {e['motivo']}")
        if len(avisos) > 40:
            print(f"  … y {len(avisos) - 40} más (use --json para verlos todos)")
    if con_externos:
        for estado, titulo in (("error", "ENLACES EXTERNOS ROTOS"), ("revisar", "Externos para revisar a mano")):
            if por_estado[estado]:
                print(f"\n{titulo} ({len(por_estado[estado])}):")
                for url, d in por_estado[estado]:
                    print(f"  {url}  → {d['detalle']}  (en {', '.join(d['paginas'][:3])}{'…' if len(d['paginas']) > 3 else ''})")
        notas = [(u, d) for u, d in por_estado["ok"] if d["detalle"]]
        if notas:
            print(f"\nFuncionan, pero conviene actualizarlos ({len(notas)}):")
            for url, d in notas:
                print(f"  {url}  → {d['detalle']}")
    elif sin_https:
        print(f"\nEnlaces http:// (use https:// si el sitio lo admite; --externos lo comprueba) ({len(sin_https)}):")
        for u in sin_https:
            print(f"  {u}  (en {externos[u][0]['pagina']})")

    fallan = bool(errores) or (estricto and bool(avisos or heredados)) or (con_externos and bool(por_estado["error"]))
    print("\n" + ("FALLA" if fallan else "Sin errores") + f": {len(errores)} internos"
          + (f", {len(por_estado['error'])} externos rotos, {len(por_estado['revisar'])} por revisar" if con_externos else ""))
    return salida, fallan


def autoprueba():
    """Sitio de muestra con fallas conocidas y un servidor local para los enlaces externos."""
    import http.server
    with tempfile.TemporaryDirectory() as t:
        t = Path(t)
        dist, web = t / "dist", t / "web"
        (dist / "carreras").mkdir(parents=True)
        web.mkdir()
        (web / "ok").write_text("ok")
        manejador = type("M", (http.server.SimpleHTTPRequestHandler,), {
            "__init__": lambda s, *a, **k: http.server.SimpleHTTPRequestHandler.__init__(s, *a, directory=str(web), **k),
            "log_message": lambda *a: None})
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_port}"
        (dist / "index.html").write_text(
            '<!doctype html><a href="carreras/x.html#malla">bien</a><a href="carreras/x.html#no-esta">ancla</a>'
            '<a href="falta.html">rota</a><a href="/carreras/">dir</a><img src="img/a.webp" srcset="img/a.webp 1x, img/b.webp 2x">'
            f'<a href="{base}/ok">ext ok</a><a href="{base}/no-existe">ext rota</a><a href="mailto:a@b.c">m</a>'
            '<a href="https://sedecaribe.ucr.ac.cr/carreras/x.html">propio</a><a href="https://sedecaribe.ucr.ac.cr/nada.html">propio roto</a>'
            '<a href="#">vacía</a><a href="#top">arriba</a><a href="/images/viejo.pdf">viejo</a><a href="/index.php/a/b">viejo2</a>', encoding="utf-8")
        (dist / "carreras" / "x.html").write_text('<h2 id="malla">m</h2><a href="../index.html">inicio</a>', encoding="utf-8")
        (dist / "carreras" / "index.html").write_text("<p>hola</p>", encoding="utf-8")
        (dist / "img").mkdir()
        (dist / "img" / "a.webp").write_bytes(b"x")
        errores, avisos, heredados, externos, n = revisar_internos(dist, {"sedecaribe.ucr.ac.cr"})
        rotos = sorted(e["enlace"] for e in errores)
        resultado = revisar_externos(externos)
        srv.shutdown()
    pruebas = [
        (n == 3, "cuenta las 3 páginas"),
        (rotos == ["falta.html", "https://sedecaribe.ucr.ac.cr/nada.html", "img/b.webp"], f"internos rotos: {rotos}"),
        (len(avisos) == 1 and "#no-esta" in avisos[0]["motivo"], "una ancla que falta se avisa"),
        (len(heredados) == 2, "las direcciones de la web antigua van aparte y no son error"),
        (resultado[f"{base}/ok"][0] == "ok", "externo que existe: ok"),
        (resultado[f"{base}/no-existe"][0] == "error", "externo 404: error"),
        (not any(u.startswith("mailto:") for u in externos), "mailto no se revisa"),
    ]
    for ok, texto in pruebas:
        print(("  ok    " if ok else "  FALLA ") + texto)
    return all(ok for ok, _ in pruebas)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dist", default=str(RAIZ / "dist"))
    ap.add_argument("--externos", action="store_true", help="comprobar también los enlaces externos (necesita internet)")
    ap.add_argument("--estricto", action="store_true", help="las anclas que faltan también son error")
    ap.add_argument("--json", help="guardar el informe completo en este archivo")
    ap.add_argument("--autoprueba", action="store_true")
    a = ap.parse_args()
    if a.autoprueba:
        sys.exit(0 if autoprueba() else 1)
    dist = Path(a.dist)
    if not (dist / "index.html").is_file():
        sys.exit(f"No hay {dist}/index.html: compile antes con python3 build.py --vista-previa")
    anfitriones = {"sedecaribe.ucr.ac.cr"}
    try:
        for fila in json.loads((RAIZ / "src" / "data" / "config.json").read_text(encoding="utf-8")):
            if fila.get("clave") == "base_url":
                anfitriones.add(urlsplit(fila["valor"]).hostname)
    except (OSError, ValueError):
        pass
    salida, fallan = informe(dist, anfitriones, a.externos, a.estricto)
    if a.json:
        Path(a.json).write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    sys.exit(1 if fallan else 0)


if __name__ == "__main__":
    main()
