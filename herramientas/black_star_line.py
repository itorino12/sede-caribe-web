#!/usr/bin/env python3
"""Dibuja la silueta del edificio Black Star Line (Limón) en SVG, visto desde la esquina.

Vista en perspectiva de dos puntos: se ven las dos fachadas, la larga a la izquierda y la corta a la derecha,
como en una foto tomada desde la acera de enfrente.

Rasgos del edificio que se conservan: techo de cuatro aguas con alero ancho, friso calado bajo el alero,
segundo piso con balcón corrido y baranda de balaustres, franja de calados en X entre los pisos,
y planta baja con columnas sobre bases.

Genera en src/assets/img/:
  black-star-line.svg         dibujo de línea (máscara: toma el color del CSS)
  black-star-line-blanco.svg  el mismo dibujo en blanco, para fondos azules
  bsl-mini.svg                ícono pequeño del edificio (máscara), para viñetas
"""
import math
from pathlib import Path

IMG = Path(__file__).resolve().parent.parent / "src" / "assets" / "img"

# Medidas del edificio (unidades arbitrarias; una bahía mide 44)
BAHIA = 44.0
N_LARGA, N_CORTA = 11, 6
LARGA, CORTA = N_LARGA * BAHIA, N_CORTA * BAHIA
VUELO = 22          # alero
ALERO = 152         # altura del alero
CUMBRE = 58         # altura del techo sobre el alero

# Cámara: a nivel de la calle, frente a la esquina, girada hacia la fachada larga
GIRO = math.radians(47)
DIST, OJO, FOCAL = 1250.0, 75.0, 1000.0
CORRIMIENTO = .10  # cuánto se corre la mira hacia la fachada larga


def proyectar(x, y, z):
    """Mundo -> pantalla. La esquina del edificio está en el origen; la fachada larga va hacia -x
    (plano z=0) y la corta hacia +z (plano x=0)."""
    cx, cz = DIST * math.sin(GIRO) * .55, -DIST * math.cos(GIRO)
    # el punto de mira se corre hacia el centro de la fachada larga
    cx -= LARGA * CORRIMIENTO
    dx, dz = x - cx, z - cz
    X = dx * math.cos(GIRO) + dz * math.sin(GIRO)
    Z = -dx * math.sin(GIRO) + dz * math.cos(GIRO)
    return FOCAL * X / Z, -FOCAL * (y - OJO) / Z


class Dibujo:
    def __init__(self):
        self.trazos = []  # (lista de puntos en pantalla, grosor, cerrado)

    def poli(self, puntos3d, g, cerrado=False):
        self.trazos.append(([proyectar(*p) for p in puntos3d], g, cerrado))


def fachada(d, origen, direccion, largo, n, detalle=True):
    """Dibuja una fachada. origen y dirección en el plano del suelo; u recorre la fachada, y es la altura."""
    ox, oz = origen
    ux, uz = direccion

    def P(u, y):
        return (ox + ux * u, y, oz + uz * u)

    def L(u1, y1, u2, y2, g):
        d.poli([P(u1, y1), P(u2, y2)], g)

    paso = largo / n
    # Columnas a todo lo alto (planta baja y segundo piso)
    for i in range(n + 1):
        u = paso * i
        L(u, 0, u, 60, 2.4)
        L(u, 74, u, ALERO, 2.4)
        if detalle:
            d.poli([P(u - 4, 0), P(u + 4, 0), P(u + 4, 10), P(u - 4, 10)], 1.2, True)  # base
    # Entrepiso: viga y franja de calados en X
    L(0, 74, largo, 74, 2.8)
    L(0, 60, largo, 60, 1.6)
    if detalle:
        for i in range(n):
            for k in range(3):
                a, b = paso * i + paso * k / 3 + 2, paso * i + paso * (k + 1) / 3 - 2
                L(a, 62, b, 72, .9)
                L(b, 62, a, 72, .9)
    # Segundo piso: baranda con balaustres y ventanas
    L(0, 98, largo, 98, 2.2)
    L(0, 80, largo, 80, 1.4)
    if detalle:
        for i in range(n):
            for k in range(1, 7):
                u = paso * i + paso * k / 7
                L(u, 80, u, 98, .8)
            a, b = paso * i + paso * .3, paso * i + paso * .7
            d.poli([P(a, 102), P(b, 102), P(b, 124), P(a, 124)], 1.2, True)
        # Friso calado: rombos bajo el alero
        L(0, 131, largo, 131, 1.2)
        for i in range(n):
            c = paso * (i + .5)
            d.poli([P(c - 9, 140), P(c, 145), P(c + 9, 140), P(c, 135)], 1.1, True)
        # Planta baja: puertas y ventanas con reja
        for i in range(n):
            a, b = paso * i + paso * .32, paso * i + paso * .68
            if i % 3 == 1:
                d.poli([P(a, 0), P(a, 42), P(b, 42), P(b, 0)], 1.2)
            else:
                d.poli([P(a, 24), P(b, 24), P(b, 46), P(a, 46)], 1.2, True)
                L((a + b) / 2, 24, (a + b) / 2, 46, .9)


def edificio(detalle=True, n_larga=N_LARGA, n_corta=N_CORTA):
    global LARGA, CORTA
    LARGA, CORTA = n_larga * BAHIA, n_corta * BAHIA
    d = Dibujo()
    # Fachada larga: de la esquina hacia la izquierda (plano z=0). Fachada corta: hacia el fondo (plano x=0).
    fachada(d, (0, 0), (-1, 0), LARGA, n_larga, detalle)
    fachada(d, (0, 0), (0, 1), CORTA, n_corta, detalle)
    # Techo de cuatro aguas
    v, y0, y1 = VUELO, ALERO, ALERO + CUMBRE
    e_izq, e_esq, e_fondo = (-LARGA - v, y0, -v), (v, y0, -v), (v, y0, CORTA + v)
    r_izq, r_der = (-LARGA + CORTA / 2, y1, CORTA / 2), (-CORTA / 2, y1, CORTA / 2)
    d.poli([e_izq, e_esq, e_fondo], 3.2)                       # borde del alero
    d.poli([(-LARGA - v, y0 - 6, -v), (v, y0 - 6, -v), (v, y0 - 6, CORTA + v)], 1.8)   # fascia
    d.poli([(-LARGA - v, y0 - 6, -v), e_izq], 1.8)
    d.poli([(v, y0 - 6, CORTA + v), e_fondo], 1.8)
    d.poli([e_izq, r_izq, r_der, e_esq], 2.2)                  # limatesas y cumbrera
    d.poli([r_der, e_fondo], 2.2)
    # Acera, corrida en las dos direcciones
    d.poli([(-LARGA - 30, 0, -14), (14, 0, -14), (14, 0, CORTA + 30)], 2.2)
    return d


def svg(d, trazo, ancho, margen, extra="", escala_g=1.0):
    xs = [p[0] for t in d.trazos for p in t[0]]
    ys = [p[1] for t in d.trazos for p in t[0]]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    k = (ancho - 2 * margen) / (x1 - x0)
    alto = round((y1 - y0) * k + 2 * margen)
    partes = []
    for pts, g, cerrado in d.trazos:
        c = " ".join(f"{(x - x0) * k + margen:.1f} {(y - y0) * k + margen:.1f}" for x, y in pts)
        partes.append(f'<path d="M{c}{"Z" if cerrado else ""}" stroke-width="{g * escala_g:.2f}"/>')
    cuerpo = "".join(partes)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {ancho} {alto}">'
            f'<g fill="none" stroke="{trazo}" stroke-linecap="round" stroke-linejoin="round"{extra}>{cuerpo}</g></svg>\n'), alto


if __name__ == "__main__":
    grande = edificio()
    contenido, alto = svg(grande, "#000", 640, 4)
    (IMG / "black-star-line.svg").write_text(contenido, encoding="utf-8")
    (IMG / "black-star-line-blanco.svg").write_text(svg(grande, "#fff", 640, 4, ' opacity=".22"')[0], encoding="utf-8")
    mini, _ = svg(edificio(detalle=False, n_larga=3, n_corta=2), "#000", 32, 1.5, escala_g=.75)
    (IMG / "bsl-mini.svg").write_text(mini, encoding="utf-8")
    print(f"Black Star Line dibujado (640 x {alto})")
