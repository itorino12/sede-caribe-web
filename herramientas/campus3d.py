#!/usr/bin/env python3
"""Genera la maqueta 3D del campus a partir del croquis oficial «Distribución de Aulas».

Uso:
    python3 herramientas/campus3d.py croquis.pdf [satelite.png]

Con la captura satelital de Google Maps (la del celular, sin girar), los árboles se colocan donde la
foto muestra copa de árbol; sin ella, se toman los dibujos de árboles del croquis. La captura no se
guarda en el repositorio (es imagen de Google): solo las posiciones que salen de ella.

Necesita poppler (pdftoppm), OpenCV y Pillow. Produce:
    src/data/campus3d.json            edificios (contorno en metros, pisos), árboles y extensión del terreno
    src/assets/img/campus-suelo.webp  textura del terreno: zacate, calles, carretera y pista

El croquis es esquemático, no un plano a escala: la maqueta sirve para orientarse, no para medir.
Los edificios se definen a mano sobre el croquis (centro, largo, ancho y giro, en píxeles del croquis
rasterizado a 55 ppp); calles, carretera y árboles se leen de los colores del dibujo.
"""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
ESCALA = 0.25            # metros por píxel del croquis (aprox.: el gimnasio queda de ~49 x 38 m)
ORIGEN = (1200, 1500)    # píxel del croquis que queda en el centro de la maqueta
RECORTE = (0, 850, 2165, 3248)   # zona del croquis que es mapa (sin títulos ni leyendas)
PISO = 4.2               # altura de un piso, en metros
ALERO = 1.4              # vuelo del alero, en metros
PENDIENTE = 0.32         # altura del techo por metro de medio ancho (cuatro aguas)

# Elementos que no salen en el croquis, ubicados con Google Maps y las fotos (píxeles del croquis)
PICNIC = {"centro": (1688, 1598), "radio": 64}      # área de picnic y juegos frente al CIUB y las residencias
PUENTE = {"centro": (1540, 1478), "largo": 46}      # puente de la calle interna sobre la quebrada, al sur del gimnasio
PLANTA = {"centro": (1486, 1566), "giro": 74}        # planta de tratamiento, al oeste de la calle, pasando el puente

# Edificios: número del croquis, forma y pisos. rect = (cx, cy, largo, ancho, giro en grados, horario)
EDIFICIOS = [
    {"id": 1, "rect": (466, 1759, 175, 56, 49), "pisos": 1},
    {"id": 2, "rect": (601, 1753, 215, 52, 51), "pisos": 1},
    {"id": 3, "rect": (728, 1777, 105, 50, 121), "pisos": 1},
    {"id": 4, "hex": (692, 1541, 36), "pisos": 1},
    {"id": 5, "rect": (1011, 1306, 100, 100, 34), "pisos": 1, "alto": 7.5},
    # Entrada (fotos de la portada): pórtico blanco de losa delgada, caseta, rótulo de concreto y astas
    {"id": 6, "rect": (1049, 1131, 97, 20, -3), "pisos": 1, "alto": 3.4,
     "estilo": {"forma_techo": "plano", "techo": "#f4f5f6", "entrada": True}},
    {"id": 7, "rect": (1252, 1322, 180, 55, 5.5), "pisos": 1},
    {"id": 8, "rect": (1259, 1246, 180, 55, 5.5), "pisos": 1},
    {"id": 9, "rect": (1263, 1165, 180, 55, 5.5), "pisos": 1},
    {"id": 10, "rect": (1433, 1304, 60, 109, 15), "pisos": 0, "tipo": "piscina"},
    # Biblioteca (fotos): un piso, lámina verde, cuerpo central más alto, torrecita de ventilación,
    # ventanales corridos y zócalo azul claro
    {"id": 11, "rect": (1510, 1113, 128, 78, -6), "pisos": 1, "linterna": 0.55,
     "estilo": {"techo": "#5f9a58", "zocalo": "#a9d4ef", "ventanas": "vidrio", "cupula": True}},
    # 12 y 13 (fotos): el edificio nuevo de dos pisos. Aulas con losa plana volada, galerías y escaleras
    # exteriores; laboratorios con techo de una sola agua, ventanales verdes y parasoles curvos blancos.
    {"id": 12, "rect": (1726, 1072, 128, 39, -2), "pisos": 2,
     "estilo": {"forma_techo": "plano", "galeria": True, "techo": "#dcdfe2"}},
    {"id": 13, "rect": (1786, 1130, 113, 51, -10), "pisos": 2,
     "estilo": {"forma_techo": "una_agua", "parasoles": True, "ventanas": "vidrio_verde", "techo": "#d6dadd"}},
    {"id": 14, "rect": (1689, 1292, 151, 196, 12.5), "pisos": 1, "alto": 11},
    {"id": 15, "rect": (1770, 1450, 59, 41, 0), "pisos": 1},
    # Residencias: barra doblada del croquis, en dos alas; en la foto, techo de dos niveles con linternilla
    # el ala sur del croquis llega hasta la carretera: se acorta y se corre hacia adentro para que quede
    # dentro de la cerca, como en el campus real
    {"id": 16, "alas": [(1700, 1840, 200, 74, 81), (1742, 1960, 120, 66, 46)], "pisos": 2, "linterna": 0.42,
     "estilo": {"techo": "#66756b"}},
    {"id": 17, "rect": (1816, 1795, 63, 92, -11), "pisos": 1, "estilo": {"techo": "#66756b"}},
    # Laboratorio de Investigación (fotos): un piso sobre un talud, paredes gris claro con paneles blancos,
    # ventanas verticales con marco gris, techo casi plano con alero muy ancho, escalera y rampa al frente
    {"id": 18, "rect": (1552, 1826, 54, 30, 15), "pisos": 1, "alto": 3.6,
     "estilo": {"forma_techo": "una_agua", "techo": "#9ea5aa", "pared": "#d6d9dc", "ventanas": "vidrio", "talud": 1.8}},
]


def contornos_px(e):
    return [rect_contorno(*al) for al in e["alas"]] if "alas" in e else [contorno(e)]


def rasterizar(pdf):
    with tempfile.TemporaryDirectory() as t:
        subprocess.run(["pdftoppm", "-r", "55", "-png", "-singlefile", str(pdf), f"{t}/c"], check=True)
        return cv2.cvtColor(cv2.imread(f"{t}/c.png"), cv2.COLOR_BGR2RGB)


def a_metros(x, y):
    return [round((x - ORIGEN[0]) * ESCALA, 2), round((y - ORIGEN[1]) * ESCALA, 2)]


def contorno(e):
    if "hex" in e:
        cx, cy, r = e["hex"]
        return [(cx + r * math.cos(math.radians(30 + 60 * i)), cy + r * math.sin(math.radians(30 + 60 * i))) for i in range(6)]
    cx, cy, l, a, g = e["rect"]
    c, s = math.cos(math.radians(g)), math.sin(math.radians(g))
    return [(cx + c * dx * l / 2 - s * dy * a / 2, cy + s * dx * l / 2 + c * dy * a / 2) for dx, dy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]


def rect_contorno(cx, cy, l, a, g):
    return contorno({"rect": (cx, cy, l, a, g)})


def a_local(cx, cz, g):
    """Convierte coordenadas locales (u a lo largo, v a lo ancho, en metros) a la maqueta."""
    c, s = math.cos(math.radians(g)), math.sin(math.radians(g))
    return lambda u, v, y: [round(cx + c * u - s * v, 2), round(y, 2), round(cz + s * u + c * v, 2)]


def techo_cuatro_aguas(cx, cz, largo, ancho, g, base, alero=ALERO, pendiente=PENDIENTE):
    """Triángulos de un techo de cuatro aguas sobre un rectángulo (en metros). Si es cuadrado, queda en pirámide."""
    a, b = largo / 2 + alero, ancho / 2 + alero
    p = a_local(cx, cz, g)
    if a >= b:
        h = b * pendiente
        r = a - b
        e = [p(-a, -b, base), p(a, -b, base), p(a, b, base), p(-a, b, base)]
        c1, c2 = p(-r, 0, base + h), p(r, 0, base + h)
        caras = [(e[0], e[1], c2), (e[0], c2, c1), (e[2], e[3], c1), (e[2], c1, c2), (e[1], e[2], c2), (e[3], e[0], c1)]
    else:
        h = a * pendiente
        r = b - a
        e = [p(-a, -b, base), p(a, -b, base), p(a, b, base), p(-a, b, base)]
        c1, c2 = p(0, -r, base + h), p(0, r, base + h)
        caras = [(e[1], e[2], c2), (e[1], c2, c1), (e[3], e[0], c1), (e[3], c1, c2), (e[0], e[1], c1), (e[2], e[3], c2)]
    return [v for t in caras for v in t], base + h


def techo_una_agua(cx, cz, largo, ancho, g, base, alero=1.8, subida=None):
    """Techo de una sola agua: plano inclinado, más alto en el lado norte (−v)."""
    a, b = largo / 2 + alero, ancho / 2 + alero
    subida = subida if subida is not None else ancho * 0.14
    p = a_local(cx, cz, g)
    e = [p(-a, -b, base + subida), p(a, -b, base + subida), p(a, b, base), p(-a, b, base)]
    return [v for t in ((e[0], e[1], e[2]), (e[0], e[2], e[3])) for v in t], base + subida


def techo_piramide(cx, cz, radio, base, lados=6):
    h = radio * 0.42
    borde = [[round(cx + (radio + ALERO) * math.cos(math.radians(30 + 360 / lados * i)), 2), base,
              round(cz + (radio + ALERO) * math.sin(math.radians(30 + 360 / lados * i)), 2)] for i in range(lados)]
    cima = [cx, round(base + h, 2), cz]
    return [v for i in range(lados) for v in (borde[i], borde[(i + 1) % lados], cima)], base + h


def volumenes(e, alto):
    """Volúmenes (paredes) y techo de un edificio, en metros."""
    vol, techo, cumbre = [], [], alto
    if e.get("tipo") == "piscina":
        return [{"contorno": [a_metros(x, y) for x, y in contorno(e)], "desde": 0, "alto": 0.5}], [], 0.5
    if "hex" in e:
        cx, cy, rr = e["hex"]
        vol.append({"contorno": [a_metros(x, y) for x, y in contorno(e)], "desde": 0, "alto": alto})
        m = a_metros(cx, cy)
        techo, cumbre = techo_piramide(m[0], m[1], rr * ESCALA, alto)
        return vol, techo, cumbre
    for (cx, cy, l, a, g) in e.get("alas") or [e["rect"]]:
        vol.append({"contorno": [a_metros(x, y) for x, y in rect_contorno(cx, cy, l, a, g)], "desde": 0, "alto": alto})
        m = a_metros(cx, cy)
        L, W = l * ESCALA, a * ESCALA
        if e.get("linterna"):
            # techo bajo, y encima una linternilla con ventanas corridas y su propio techo de cuatro aguas
            t, _ = techo_cuatro_aguas(m[0], m[1], L, W, g, alto, pendiente=0.22)
            techo += t
            k = float(e["linterna"])
            lc = rect_contorno(cx, cy, l * 0.78, a * k, g)
            alto_l = W / 2 * 0.22 * 0.85 + 2.2
            vol.append({"contorno": [a_metros(x, y) for x, y in lc], "desde": alto, "alto": alto_l, "linterna": True})
            t, c = techo_cuatro_aguas(m[0], m[1], L * 0.78, W * k, g, alto + alto_l, alero=0.9)
            techo += t
            cumbre = max(cumbre, c)
        elif e.get("estilo", {}).get("forma_techo") == "plano":
            cumbre = max(cumbre, alto + 0.6)   # la losa volada la dibuja la maqueta
        elif e.get("estilo", {}).get("forma_techo") == "una_agua":
            t, c = techo_una_agua(m[0], m[1], L, W, g, alto + 0.6, alero=2.2, subida=W * 0.05)
            techo += t
            cumbre = max(cumbre, c)
        else:
            t, c = techo_cuatro_aguas(m[0], m[1], L, W, g, alto, pendiente=0.2 if L * W > 900 else PENDIENTE)
            techo += t
            cumbre = max(cumbre, c)
    return vol, techo, cumbre


# Captura de Google Maps (celular, 1344 px de ancho) → croquis: ajuste afín con seis puntos comunes
# (biblioteca, piscina, gimnasio, residencias, oficinas y centro de la pista), error menor a 9 m.
SAT_ANCHO = 672
SAT_A_CROQUIS = np.array([[2.5708, -0.4783, 668.36], [0.4804, 2.7018, -251.56]])
SAT_VALIDA = (440, 1240)      # franja de la captura sin la barra de búsqueda ni el panel inferior
SAT_BOTONES = [(570, 1050, 672, 1245)]   # botones de ubicación y rutas de la app


def arboles_satelitales(ruta, rng, prohibido):
    im = cv2.imread(str(ruta))
    im = cv2.resize(im, (SAT_ANCHO, round(im.shape[0] * SAT_ANCHO / im.shape[1])), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(cv2.GaussianBlur(im, (0, 0), 2), cv2.COLOR_BGR2HSV).astype(int)
    copa = (hsv[..., 2] < 85) & (hsv[..., 1] > 55) & (im[..., 1].astype(int) >= im[..., 2].astype(int))
    copa = cv2.morphologyEx(copa.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    valida = np.zeros_like(copa)
    valida[SAT_VALIDA[0]:SAT_VALIDA[1]] = 1
    for x0, y0, x1, y1 in SAT_BOTONES:
        valida[y0:y1, x0:x1] = 0
    inversa = cv2.invertAffineTransform(SAT_A_CROQUIS)

    def a_sat(x, y):
        return inversa @ np.array([x, y, 1.0])

    def cubre(x, y):
        sx, sy = a_sat(x, y)
        return 0 <= sx < copa.shape[1] and 0 <= sy < copa.shape[0] and valida[int(sy), int(sx)]

    x0, y0, x1, y1 = RECORTE
    paso = 54   # ≈ 13,5 m entre árboles
    salida = []
    for yy in range(y0 + 20, y1 - 20, paso):
        for xx in range(x0 + 20 + (paso // 2 if (yy // paso) % 2 else 0), x1 - 20, paso):
            x, y = xx + rng.uniform(-16, 16), yy + rng.uniform(-16, 16)
            if not (0 <= x < prohibido.shape[1] and 0 <= y < prohibido.shape[0]) or prohibido[int(y), int(x)]:
                continue
            sx, sy = a_sat(x, y)
            if not cubre(x, y) or not copa[int(sy), int(sx)]:
                continue
            salida.append({"p": a_metros(x, y), "r": round(rng.uniform(4.6, 7.2), 2), "palma": bool(rng.random() < 0.06)})
    return {"arboles": salida, "cubre": cubre}


def edificio_json(e):
    alto = 0 if e.get("tipo") == "piscina" else e.get("alto", round(max(e["pisos"], 1) * PISO, 1))
    vol, techo, cumbre = volumenes(e, alto)
    pts = [p for v in vol for p in v["contorno"]]
    centro = [round(sum(p[0] for p in pts) / len(pts), 2), round(sum(p[1] for p in pts) / len(pts), 2)]
    return {"id": e["id"], "tipo": e.get("tipo", "edificio"), "pisos": e["pisos"], "alto": alto, "centro": centro,
            "cumbre": round(cumbre, 2), "volumenes": vol, "techo": [c for v in techo for c in v], "estilo": e.get("estilo", {})}


def main(pdf, sat=None):
    img = rasterizar(pdf).astype(int)
    R, G, B = img[..., 0], img[..., 1], img[..., 2]
    gris = (abs(R - G) < 6) & (abs(G - B) < 6)
    x0, y0, x1, y1 = RECORTE

    # --- carretera (gris oscuro) y calles internas (gris claro); se quitan textos y líneas guía finas
    carretera = (gris & (R >= 128) & (R <= 150)).astype(np.uint8) * 255
    carretera[:950] = 0
    carretera[2250:2470, 1800:] = 0   # la «N» del norte
    # las líneas punteadas que unen la leyenda con los edificios son del mismo gris: se borran por finas
    carretera = cv2.morphologyEx(carretera, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    calles = (gris & (R >= 214) & (R <= 226)).astype(np.uint8) * 255
    calles = cv2.morphologyEx(calles, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    # La leyenda de la zona 2 tapa un tramo de la carretera en el croquis: se completa a mano
    cv2.polylines(carretera, [np.array([(0, 1242), (125, 1206), (470, 1112), (830, 1036)], np.int32)], False, 255, 46)

    # --- pista de atletismo: la vuelta de calle gris claro al sur del campus
    n, lab, st, _ = cv2.connectedComponentsWithStats(calles)
    pista_cruda = np.zeros_like(calles)
    for i in range(1, n):
        if st[i, 1] > 2300 and st[i, 4] > 20000:
            pista_cruda[lab == i] = 255
    calles[pista_cruda > 0] = 0
    # El croquis deja el anillo abierto arriba y le pega el camino de acceso abajo. La pista real es un
    # óvalo cerrado: se rehace como el borde de su envolvente convexa, y el acceso queda como calle.
    acceso = pista_cruda.copy(); acceso[:2880] = 0
    calles[acceso > 0] = 255
    anillo = pista_cruda.copy(); anillo[2880:] = 0
    cs, _ = cv2.findContours(anillo, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    lleno = np.zeros_like(anillo)
    cv2.fillPoly(lleno, [cv2.convexHull(np.vstack(cs))], 255)
    pista = cv2.subtract(lleno, cv2.erode(lleno, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (49, 49))))
    # el camino recto que baja de la pista a la carretera sigue siendo calle
    interior = np.zeros_like(pista)
    cs, _ = cv2.findContours(pista, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    cv2.drawContours(interior, cs, -1, 255, -1)

    # --- textura del terreno
    k = 0.6
    h, w = int((y1 - y0) * k), int((x1 - x0) * k)
    rng = np.random.default_rng(7)
    suelo = np.zeros((h, w, 3), np.float32)
    suelo[:] = (151, 196, 122)
    ruido = cv2.GaussianBlur(rng.normal(0, 1, (h // 8, w // 8)).astype(np.float32), (0, 0), 1.6)
    ruido = cv2.resize(ruido, (w, h), interpolation=cv2.INTER_CUBIC)[..., None]
    suelo += ruido * 9

    def pintar(mascara, color, borde=None):
        m = cv2.resize(mascara[y0:y1, x0:x1], (w, h), interpolation=cv2.INTER_AREA).astype(np.float32)[..., None] / 255
        if borde:
            b = cv2.dilate(m[..., 0], cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))[..., None]
            suelo[:] = suelo * (1 - b) + np.array(borde, np.float32) * b
        suelo[:] = suelo * (1 - m) + np.array(color, np.float32) * m

    pintar(interior, (170, 210, 140))
    pintar(pista, (196, 116, 88), borde=(235, 235, 228))
    # calles internas: asfalto con cordón de concreto (fotos); el camino a la pista es de lastre
    # quebrada: cruza bajo el puente, de oeste a este, con un trazo ondulado
    quebrada = np.zeros_like(calles)
    # el puente se ajusta al eje real de la calle: centro y dirección salen del trazo de la calle en el croquis
    px0, py0 = PUENTE["centro"]
    filas, centros = [], []
    for yy in range(py0 - 45, py0 + 46, 3):
        xs_f = np.nonzero(calles[yy, px0 - 70:px0 + 70])[0]
        if len(xs_f):
            filas.append(yy); centros.append(px0 - 70 + xs_f.mean())
    # la calle se curva justo en el puente: se ajusta una parábola al eje y el puente sigue la curva
    coef = np.polyfit(filas, centros, 2)
    PUENTE["centro"] = (int(round(np.polyval(coef, py0))), py0)
    mitad = PUENTE["largo"] / 2 + 6
    PUENTE["eje"] = [(float(np.polyval(coef, yy)), float(yy)) for yy in np.linspace(py0 - mitad, py0 + mitad, 9)]
    qx, qy = PUENTE["centro"]
    puntos = [(int(qx + d), int(qy + 26 * math.sin(d / 90) + 0.12 * d)) for d in range(-420, 430, 12)]
    cv2.polylines(quebrada, [np.array(puntos, np.int32)], False, 255, 13)
    pintar(quebrada, (88, 132, 150), borde=(120, 140, 96))
    # área de picnic: zacate más claro y cuidado
    picnic = np.zeros_like(calles)
    cv2.circle(picnic, PICNIC["centro"], PICNIC["radio"], 255, -1)
    pintar(cv2.GaussianBlur(picnic, (0, 0), 6), (166, 208, 120))
    # dentro de la U todo está asfaltado (fotos), también el camino a la pista; cordón de concreto claro
    pintar(cv2.bitwise_or(calles, acceso), (84, 88, 94), borde=(214, 212, 204))
    pintar(carretera, (112, 116, 122), borde=(88, 92, 98))
    # sombra suave bajo cada edificio (contacto con el suelo)
    sombra = np.zeros((y1 - y0, x1 - x0), np.uint8)
    for e in EDIFICIOS:
        for pol in contornos_px(e):
            cv2.fillPoly(sombra, [np.array([(x - x0 + 6, y - y0 + 6) for x, y in pol], np.int32)], 255)
    sombra = cv2.GaussianBlur(cv2.resize(sombra, (w, h)), (0, 0), 6).astype(np.float32)[..., None] / 255
    suelo *= 1 - sombra * 0.28
    salida = RAIZ / "src/assets/img/campus-suelo.webp"
    cv2.imwrite(str(salida), cv2.cvtColor(np.clip(suelo, 0, 255).astype(np.uint8), cv2.COLOR_RGB2BGR), [cv2.IMWRITE_WEBP_QUALITY, 82])

    # --- árboles: manchas verdes del dibujo; las grandes se llenan con varios árboles
    verde_crudo = ((G > R + 25) & (G > B + 25)).astype(np.uint8)
    verde_crudo[:950] = 0
    verde_crudo[2300:] = 0   # al sur de los edificios el croquis no dibuja árboles (solo leyendas)
    verde = verde_crudo * 255
    verde = cv2.morphologyEx(verde, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    ocupado = cv2.dilate(((calles > 0) | (carretera > 0) | (pista > 0)).astype(np.uint8), np.ones((15, 15), np.uint8))
    for e in EDIFICIOS:
        for pol in contornos_px(e):
            cv2.fillPoly(ocupado, [np.array(pol, np.int32)], 1)
    n, lab, st, cen = cv2.connectedComponentsWithStats(verde)
    arboles = []
    # distancia mínima entre árboles y edificios (≈ 9 m), para que la maqueta respire y se vean las fachadas
    lejos_edificios = np.zeros_like(ocupado)
    for e in EDIFICIOS:
        for pol in contornos_px(e):
            cv2.fillPoly(lejos_edificios, [np.array(pol, np.int32)], 1)
    lejos_edificios = cv2.dilate(lejos_edificios, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (73, 73)))
    cv2.circle(lejos_edificios, PICNIC["centro"], PICNIC["radio"] + 18, 1, -1)
    cv2.circle(lejos_edificios, PUENTE["centro"], 40, 1, -1)
    cv2.circle(lejos_edificios, PLANTA["centro"], 115, 1, -1)
    satelital = arboles_satelitales(sat, rng, ocupado | lejos_edificios) if sat else None
    for i in range(1, n):
        area = st[i, 4]
        if area < 1500:
            continue   # íconos de baños y adornos
        comp = (lab == i).astype(np.uint8)
        cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        # las palmeras del croquis son estrellas de hojas finas: poco verde dentro de su contorno
        solidez = (verde_crudo & comp).sum() / max(cv2.contourArea(cv2.convexHull(cs[0])), 1)
        palma = solidez < 0.7
        if palma:   # una palmera grande por dibujo, con algunas pequeñas alrededor si el dibujo es amplio
            r = math.sqrt(area / math.pi)
            puntos = [(cen[i][0], cen[i][1], r * 0.75)]
            if area > 25000:
                puntos += [(cen[i][0] + r * 0.7 * math.cos(t), cen[i][1] + r * 0.7 * math.sin(t), r * 0.45) for t in (0.6, 2.7, 4.6)]
        elif area < 9000:
            puntos = [(cen[i][0], cen[i][1], math.sqrt(area / math.pi))]
        else:
            x, y, ww, hh = st[i, :4]
            puntos = []
            for yy in range(y + 30, y + hh, 62):
                for xx in range(x + 30 + (31 if (yy // 62) % 2 else 0), x + ww, 62):
                    if comp[yy, xx]:
                        puntos.append((xx + rng.uniform(-10, 10), yy + rng.uniform(-10, 10), rng.uniform(28, 38)))
        for x, y, r in puntos:
            xi, yi = int(x), int(y)
            if ocupado[yi, xi] or lejos_edificios[yi, xi]:
                continue
            if satelital is not None and not palma and satelital["cubre"](x, y):
                continue   # donde hay foto satelital, mandan los árboles de la foto
            arboles.append({"p": a_metros(x, y), "r": round(min(r, 45) * ESCALA, 2), "palma": bool(palma)})
    if satelital is not None:
        arboles += satelital["arboles"]

    # --- cerca perimetral (fotos): malla verde con alambre de púas a lo largo de las carreteras que
    # rodean la U. Se toma la zona del campus (lo que queda de este lado de la carretera, empezando en la
    # biblioteca) y se sigue su borde solo donde da a la carretera; se abre en las calles de acceso.
    lejos_carretera = cv2.distanceTransform((carretera == 0).astype(np.uint8), cv2.DIST_L2, 5)
    # la ruta 32 se acaba antes del borde del croquis: se prolonga hasta el borde para que el lado norte
    # (fuera de la U) no quede unido al campus
    bloqueo = carretera.copy()
    ys32, xs32 = np.nonzero(carretera[:1300])
    if len(xs32):
        k = int(np.argmax(xs32))
        cv2.line(bloqueo, (int(xs32[k]), int(ys32[k])), (x1, int(ys32[k]) - 40), 255, 46)
    libre = (cv2.distanceTransform((bloqueo == 0).astype(np.uint8), cv2.DIST_L2, 5) > 22).astype(np.uint8)
    marco = np.zeros_like(libre); marco[y0 + 2:y1 - 2, x0 + 2:x1 - 2] = 1
    libre &= marco
    zona = np.zeros((libre.shape[0] + 2, libre.shape[1] + 2), np.uint8)
    cv2.floodFill(libre.copy(), zona, (1510, 1113), 1, flags=4 | (1 << 8))
    zona = zona[1:-1, 1:-1]
    cs, _ = cv2.findContours(zona, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    borde = max(cs, key=cv2.contourArea)[:, 0, :]
    # portón de la pista: donde el camino de acceso de la pista llega a la carretera
    ys, xs = np.nonzero(acceso)
    k_min = int(np.argmin(lejos_carretera[ys, xs])) if len(xs) else None
    porton = None
    if k_min is not None:
        # centro del camino donde llega a la carretera (promedio de la franja más cercana)
        cerca_c = lejos_carretera[ys, xs] < lejos_carretera[ys[k_min], xs[k_min]] + 25
        px, py = int(xs[cerca_c].mean()), int(ys[cerca_c].mean())
        # dirección del camino de acceso (de la pista hacia la carretera) para orientar el portón
        cy_pista, cx_pista = np.mean(np.nonzero(pista), axis=1)
        porton = {"p": a_metros(px, py - 14), "hacia_pista": round(math.atan2(cx_pista - px, cy_pista - py), 3)}
    # portón verde de la entrada por residencias (fotos): donde la calle interna junto a las residencias
    # sale a la carretera
    ys, xs = np.nonzero((calles > 0) & (acceso == 0) & (lejos_carretera < 40))
    sel = (xs > 1600) & (ys > 1700)
    porton_res = None
    if sel.any():
        rx, ry = int(xs[sel].mean()), int(ys[sel].mean())
        porton_res = {"p": a_metros(rx, ry), "hacia_dentro": round(math.atan2(1700 - rx, 1840 - ry), 3)}
    # la cerca se abre en las calles internas que salen a la carretera y, en la pista, solo donde va el portón
    accesos = cv2.dilate(((calles > 0) & (acceso == 0)).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    if porton:
        cv2.circle(accesos, (px, py - 14), 17, 1, -1)
    entrada6 = (1049, 1131)
    tramos, tramo = [], []
    for i in range(0, len(borde), 6):
        x, y = int(borde[i][0]), int(borde[i][1])
        sirve = (lejos_carretera[y, x] < 60 and x0 + 8 < x < x1 - 8 and y0 + 8 < y < y1 - 8
                 and not accesos[y, x] and math.hypot(x - entrada6[0], y - entrada6[1]) > 75)
        if sirve:
            tramo.append((x, y))
        elif tramo:
            tramos.append(tramo); tramo = []
    if tramo:
        tramos.append(tramo)
    cerca = []
    for t in tramos:
        if len(t) < 4:
            continue
        simple = cv2.approxPolyDP(np.array(t, np.float32).reshape(-1, 1, 2), 3, False)[:, 0, :]
        cerca.append([a_metros(float(x), float(y)) for x, y in simple])
    cy_pista, cx_pista = np.mean(np.nonzero(pista), axis=1)

    for e in EDIFICIOS:
        for pol in contornos_px(e):
            for x, y in pol:
                d = lejos_carretera[int(y), int(x)]
                if d < 34:
                    print(f"  ! el edificio {e['id']} queda pegado a la carretera ({d:.0f} px): se sale de la cerca")

    datos = {
        "nota": "Generado por herramientas/campus3d.py a partir del croquis oficial «Distribución de Aulas». Esquemático, no a escala.",
        "terreno": {"x": a_metros(x0, y0)[0], "z": a_metros(x0, y0)[1], "ancho": round((x1 - x0) * ESCALA, 2), "largo": round((y1 - y0) * ESCALA, 2)},
        "edificios": [edificio_json(e) for e in EDIFICIOS],
        "arboles": arboles,
        "cerca": cerca,
        "porton_pista": porton,
        "porton_residencias": porton_res,
        "picnic": {"centro": a_metros(*PICNIC["centro"]), "radio": round(PICNIC["radio"] * ESCALA, 2)},
        "planta": {"centro": a_metros(*PLANTA["centro"]), "giro": round(math.radians(PLANTA["giro"]), 3)},
        "puente": {"centro": a_metros(*PUENTE["centro"]), "eje": [a_metros(x, y) for x, y in PUENTE["eje"]]},
        "pista": {"centro": a_metros(float(cx_pista), float(cy_pista))},
    }
    (RAIZ / "src/data/campus3d.json").write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    print(f"Maqueta: {len(EDIFICIOS)} edificios, {len(arboles)} árboles, {sum(len(c) for c in cerca)} puntos de cerca en {len(cerca)} tramos, textura {w}x{h}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
