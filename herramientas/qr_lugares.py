#!/usr/bin/env python3
"""Rótulos con código QR, uno por lugar del campus, listos para imprimir.

Cada QR abre la ficha del lugar en el recorrido (recorrido.html#lugar-N).
Uso: python3 herramientas/qr_lugares.py [--base URL] [--salida ruta.pdf] [--verificar]
Por defecto usa base_url de src/data/config.json (dominio oficial).
Con --verificar decodifica cada QR del PDF generado y compara con el enlace esperado.
"""
import argparse, io, json, sys
from pathlib import Path
import segno
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

RAIZ = Path(__file__).resolve().parent.parent
ZONAS = {1: ("Zona 1", (0.0, 0.55, 0.65)), 2: ("Zona 2", (0.75, 0.6, 0.0)),
         3: ("Zona 3", (0.7, 0.1, 0.55)), 4: ("Zona 4", (0.15, 0.15, 0.15))}


def base_por_defecto():
    for f in json.load(open(RAIZ / "src/data/config.json", encoding="utf-8")):
        if f["clave"] == "base_url":
            return f["valor"].rstrip("/")
    sys.exit("No hay base_url en config.json")


def enlace(base, lugar):
    return f"{base.rstrip('/')}/recorrido.html#lugar-{lugar['id']}"


def partir(c, texto, fuente, tam, ancho):
    lineas, actual = [], ""
    for p in texto.split():
        prueba = (actual + " " + p).strip()
        if c.stringWidth(prueba, fuente, tam) <= ancho:
            actual = prueba
        else:
            lineas.append(actual); actual = p
    return lineas + [actual]


def generar(base, salida):
    lugares = json.load(open(RAIZ / "src/data/lugares.json", encoding="utf-8"))
    c = canvas.Canvas(str(salida), pagesize=A4)
    c.setTitle("Rótulos QR del campus - UCR Sede del Caribe")
    W, H = A4
    cols, filas = 2, 3
    cw, ch = W / cols, H / filas
    por_pagina = cols * filas
    for i, l in enumerate(lugares):
        if i and i % por_pagina == 0:
            c.showPage()
        k = i % por_pagina
        x0, y0 = (k % cols) * cw, H - (k // cols + 1) * ch
        zona, color = ZONAS.get(l["zona"], ("", (0, 0, 0)))
        c.setStrokeColorRGB(0.6, 0.6, 0.6); c.setDash(3, 3)
        c.rect(x0 + 0.5 * cm, y0 + 0.5 * cm, cw - cm, ch - cm)  # guía de corte
        c.setDash()
        c.setFillColorRGB(*color)
        c.rect(x0 + 0.5 * cm, y0 + ch - 1.9 * cm, cw - cm, 1.4 * cm, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1); c.setFont("Helvetica-Bold", 15)
        c.drawString(x0 + 0.9 * cm, y0 + ch - 1.35 * cm, f"Lugar {l['id']} · {zona}")
        buf = io.BytesIO()
        segno.make(enlace(base, l), error="m").save(buf, kind="png", scale=12, border=2)
        buf.seek(0)
        lado = 5.2 * cm
        c.drawImage(ImageReader(buf), x0 + (cw - lado) / 2, y0 + 2.3 * cm, lado, lado)
        c.setFillColorRGB(0, 0, 0)
        y = y0 + 1.75 * cm
        for ln in partir(c, l["nombre"], "Helvetica-Bold", 12, cw - 1.6 * cm)[:2]:
            c.setFont("Helvetica-Bold", 12); c.drawCentredString(x0 + cw / 2, y, ln); y -= 0.5 * cm
        c.setFont("Helvetica", 7.5); c.setFillColorRGB(0.35, 0.35, 0.35)
        c.drawCentredString(x0 + cw / 2, y0 + 0.65 * cm, "Escanee para ver la ficha · UCR Sede del Caribe")
    c.save()
    return lugares


def verificar(salida, base, lugares):
    import pymupdf
    from PIL import Image
    from pyzbar.pyzbar import decode
    esperados = [enlace(base, l) for l in lugares]
    leidos = []
    for pag in pymupdf.open(str(salida)):
        pix = pag.get_pixmap(dpi=200)
        leidos += [d.data.decode() for d in decode(Image.frombytes("RGB", (pix.w, pix.h), pix.samples))]
    faltan = [e for e in esperados if e not in leidos]
    print(f"QR leídos {len(leidos)} de {len(esperados)}; sin leer: {len(faltan)}")
    for e in faltan[:5]: print("  falta", e)
    return not faltan


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default=base_por_defecto())
    ap.add_argument("--salida", default=str(RAIZ / ".cache/qr-lugares.pdf"))
    ap.add_argument("--verificar", action="store_true")
    a = ap.parse_args()
    Path(a.salida).parent.mkdir(parents=True, exist_ok=True)
    ls = generar(a.base, a.salida)
    print(f"{len(ls)} rótulos → {a.salida} (base {a.base})")
    if a.verificar and not verificar(a.salida, a.base, ls):
        sys.exit(1)
