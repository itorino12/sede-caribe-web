#!/usr/bin/env python3
"""Dibuja la silueta del edificio Black Star Line (Limón) en SVG, en vista frontal.

Rasgos del edificio que se conservan: techo de cuatro aguas con alero ancho, friso calado bajo el alero,
segundo piso con balcón corrido y baranda de balaustres, franja de calados en X entre los pisos,
y planta baja con columnas sobre bases.

Genera en src/assets/img/:
  black-star-line.svg         dibujo de línea (máscara: toma el color del CSS)
  black-star-line-blanco.svg  el mismo dibujo en blanco, para fondos azules
  bsl-mini.svg                ícono pequeño del edificio (máscara), para viñetas
"""
from pathlib import Path

IMG = Path(__file__).resolve().parent.parent / "src" / "assets" / "img"
ANCHO, BAHIAS = 640, 13
X0, X1 = 32, ANCHO - 32
PASO = (X1 - X0) / BAHIAS
G = 2.2  # grosor de línea principal


def linea(x1, y1, x2, y2, g=G):
    return f'<path d="M{x1:.1f} {y1:.1f}L{x2:.1f} {y2:.1f}" stroke-width="{g}"/>'


def dibujo():
    p = []
    # Techo de cuatro aguas: faldón superior y alero ancho con fascia
    p.append(f'<path d="M{X0 + 70} 22L{X1 - 70} 22L{X1 + 22} 52L{X0 - 22} 52Z" stroke-width="{G}"/>')
    p.append(linea(X0 - 22, 52, X1 + 22, 52, 3.4))
    p.append(f'<path d="M{X0 - 22} 52L{X0 - 22} 57L{X1 + 22} 57L{X1 + 22} 52" stroke-width="{G}"/>')
    # Friso calado bajo el alero: pequeños rombos en cada bahía
    for i in range(BAHIAS):
        cx = X0 + PASO * (i + .5)
        p.append(f'<path d="M{cx - 9:.1f} 66L{cx:.1f} 61L{cx + 9:.1f} 66L{cx:.1f} 71Z" stroke-width="1.2"/>')
    p.append(linea(X0, 75, X1, 75, 1.4))
    # Segundo piso: columnas, ventanas y balcón con balaustres
    for i in range(BAHIAS + 1):
        x = X0 + PASO * i
        p.append(linea(x, 57, x, 132, 2.6))
    for i in range(BAHIAS):
        xa = X0 + PASO * i
        p.append(f'<rect x="{xa + PASO * .3:.1f}" y="82" width="{PASO * .4:.1f}" height="22" stroke-width="1.4"/>')  # ventana
    p.append(linea(X0 - 6, 108, X1 + 6, 108, 2.4))   # pasamanos
    p.append(linea(X0 - 6, 126, X1 + 6, 126, 1.6))   # zócalo de la baranda
    for i in range(BAHIAS):
        xa = X0 + PASO * i
        for k in range(1, 8):
            x = xa + PASO * k / 8
            p.append(linea(x, 108, x, 126, 1))
    # Entrepiso: viga y franja de calados en X
    p.append(linea(X0 - 10, 132, X1 + 10, 132, 3))
    p.append(linea(X0 - 10, 146, X1 + 10, 146, 1.6))
    for i in range(BAHIAS):
        xa = X0 + PASO * i
        for k in range(3):
            a, b = xa + PASO * k / 3 + 2, xa + PASO * (k + 1) / 3 - 2
            p.append(f'<path d="M{a:.1f} 134L{b:.1f} 144M{b:.1f} 134L{a:.1f} 144" stroke-width="1"/>')
    # Planta baja: columnas sobre bases, puertas y ventanas con reja
    for i in range(BAHIAS + 1):
        x = X0 + PASO * i
        p.append(linea(x, 146, x, 204, 2.6))
        p.append(f'<rect x="{x - 4:.1f}" y="196" width="8" height="10" stroke-width="1.4"/>')
    for i in range(BAHIAS):
        xa = X0 + PASO * i
        if i % 3 == 1:
            p.append(f'<path d="M{xa + PASO * .32:.1f} 204V164H{xa + PASO * .68:.1f}V204" stroke-width="1.4"/>')  # puerta
        else:
            p.append(f'<rect x="{xa + PASO * .3:.1f}" y="160" width="{PASO * .4:.1f}" height="22" stroke-width="1.4"/>')
            p.append(linea(xa + PASO * .5, 160, xa + PASO * .5, 182, 1))
    # Acera
    p.append(linea(X0 - 30, 206, X1 + 30, 206, 2.4))
    return "".join(p)


def svg(trazo, vb, cuerpo, extra=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">'
            f'<g fill="none" stroke="{trazo}" stroke-linecap="round" stroke-linejoin="round"{extra}>{cuerpo}</g></svg>\n')


VB = f"0 0 {ANCHO} 212"
(IMG / "black-star-line.svg").write_text(svg("#000", VB, dibujo()), encoding="utf-8")
(IMG / "black-star-line-blanco.svg").write_text(svg("#fff", VB, dibujo(), ' opacity=".22"'), encoding="utf-8")
mini = ('<path d="M3 9L7 5H25L29 9Z" stroke-width="1.8"/><path d="M4 9V27M10 9V27M16 9V27M22 9V27M28 9V27" stroke-width="1.6"/>'
        '<path d="M3 16H29M3 19H29" stroke-width="1.6"/><path d="M2 28H30" stroke-width="2"/>')
(IMG / "bsl-mini.svg").write_text(svg("#000", "0 0 32 32", mini), encoding="utf-8")
print("Black Star Line dibujado")
