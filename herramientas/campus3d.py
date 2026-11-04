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
# parqueo asfaltado al costado de la piscina que da al gimnasio (fotos), entre la malla y la calle
# Medidas tomadas de la vista satelital (en metros, en el marco de la piscina: u al este, v al sur);
# el borde este se recorta para que no se meta en la calle del croquis
PARQUEO = {"u": (16.0, 37.0), "v": (-21.0, 10.0), "divisor": -8.0}
# (anotaciones) la piscina con su deck, malla, baños y vestidores va 5 m al este y 1,5 m al sur de donde estaba,
# para dejar espacio libre (con mesas) entre ella y las aulas, y entre la malla y el adoquín del norte
PISCINA_RECT = (1453, 1310, 60, 109, 15)


def piscina_a_px(u, v):
    cx, cy, _, _, g = PISCINA_RECT
    c, s_ = math.cos(math.radians(g)), math.sin(math.radians(g))
    return cx + (c * u - s_ * v) / ESCALA, cy + (s_ * u + c * v) / ESCALA
PLANTA = {"centro": (1486, 1566), "giro": 74}        # planta de tratamiento, al oeste de la calle, pasando el puente

# Numeración publicada (por zonas, edificios primero). Aquí adentro los edificios conservan el número del
# croquis oficial (1–18) y los lugares agregados, el número con que se crearon (19–37); al escribir
# campus3d.json se pasa a la numeración publicada, la misma de la pestaña «lugares» y de las carpetas de Drive.
NUMERACION = {"1": 1, "2": 2, "3": 3, "4": 4, "24": 5, "25": 6, "27": 7, "34": 8, "35": 9, "36": 10, "37": 11, "5": 12, "6": 13, "7": 14, "8": 15, "9": 16, "10": 17, "26": 18, "28": 19, "29": 20, "30": 21, "31": 22, "33": 23, "11": 24, "12": 25, "13": 26, "14": 27, "15": 28, "32": 29, "16": 30, "17": 31, "18": 32, "20": 33, "21": 34, "22": 35, "23": 36, "19": 37}
NUMERACION = {int(k): v for k, v in NUMERACION.items()}

# Aulas y dependencias de cada edificio, tal como las detalla el croquis oficial o la Sede (número del croquis). Cada grupo
# es un piso (sin nombre si el edificio es de uno); cada espacio, [nombre, uso o detalle].
DEPENDENCIAS = {
    1: [{"piso": None, "espacios": [["Aula 1", None], ["Aula 2", None], ["Aula 3", "Laboratorio de Idiomas"], ["Aula 4", None],
                                    ["Aula 5", "Laboratorio de Cómputo #1"], ["Aula 6", None], ["Aula 7", None], ["Servicios sanitarios", None]]}],
    2: [{"piso": None, "espacios": [["Recepción", None], ["Registro", None], ["Becas", None], ["OAF", None], ["Acción Social", None],
                                    ["Vida Estudiantil", None], ["Oficinas", "Orientación, Psicología y Trabajo Social"],
                                    ["Coordinación de Administración", None], ["Dirección", None]]}],
    # (la Sede) Coordinación de Docencia: el croquis no la detalla
    4: [{"piso": None, "espacios": [["Coordinación de Docencia", None], ["Audiovisuales", None], ["Tecnologías de la Información", None],
                                    ["Sala de Profesores", None]]}],
    7: [{"piso": None, "espacios": [["Aula 8", None], ["Aula 9", None], ["Aula 10", None], ["Aula 11", None], ["Aula 12", None]]}],
    8: [{"piso": None, "espacios": [["Aula 13", None], ["Aula 14", "Laboratorio de Química y Física"], ["Aula 15", "Laboratorio de Cómputo #2"],
                                    ["Aula 16", None], ["Aula 17", "Laboratorio de Cómputo #3"]]}],
    9: [{"piso": None, "espacios": [["Oficinas administrativas", None], ["Consultorio Médico", None], ["Consultorio Odontológico", None]]}],
    12: [{"piso": "Piso 1", "espacios": [["Aula 18", None], ["Aula 19", None], ["Aula 20", None]]},
         {"piso": "Piso 2", "espacios": [["Aula 21", None], ["Aula 22", None], ["Aula 23", None]]}],
    13: [{"piso": "Piso 1", "espacios": [["Laboratorio de Ingeniería Química", None], ["Simulador de Navegación", None]]},
         {"piso": "Piso 2", "espacios": [["Aula 24", None], ["Laboratorio de Física", None], ["Otros simuladores", None]]}],
}

# Edificios: número del croquis, forma y pisos. rect = (cx, cy, largo, ancho, giro en grados, horario)
EDIFICIOS = [
    # 1 y 2 (anotaciones de la Sede): los baños ocupan el extremo noroeste de cada uno; el 1 queda más alto
    # que el 2, y entre los dos hay una escalera y una rampa para sillas de ruedas que suben hacia el 1
    # 1 y 2 (fotos): un piso, alero ancho verde lima, techo de lámina verde agua, corredor con columnas celestes.
    # El 1 queda en lo alto de un talud, unos 3,5 m sobre el 2; los une una escalera larga techada y una rampa
    # techada (Ley 7600) que bajan por el talud. Los baños están en el extremo noroeste de cada uno.
    {"id": 1, "rect": (466, 1759, 175, 56, 49), "pisos": 1,
     "estilo": {"banos": {"extremo": -1, "fraccion": 0.21}, "loma": 3.5, "techo": "#7fae9f", "fascia": "#9acd3c",
                "alero": 2.6, "pendiente": 0.16, "columnas": "#8ec3e6"}},
    {"id": 2, "rect": (601, 1753, 215, 52, 51), "pisos": 1,
     "estilo": {"banos": {"extremo": -1, "fraccion": 0.2}, "techo": "#7fae9f", "fascia": "#9acd3c",
                "alero": 2.6, "pendiente": 0.16, "columnas": "#8ec3e6"}},
    # Soda y comedor: más al este de lo que marca el croquis, pasando la punta sureste del 2 (anotaciones)
    # Soda (fotos): columnas de concreto a la vista, celosías celestes, techo verde agua a cuatro aguas; está en
    # un bajo, con un talud de zacate alrededor
    {"id": 3, "rect": (745, 1826, 90, 70, -39), "pisos": 1,
     "estilo": {"techo": "#7fae9f", "ventanas": "celeste", "alero": 1.6, "hundido": 1.6}},
    # Coordinación de Docencia (fotos): hexágono con corredor perimetral de columnas azules y alero celeste,
    # techo verde agua en pirámide con una linternilla de ventanas arriba
    # (anotaciones) más atrás de lo que marca el croquis, lejos del pasillo 27, con su propio pasillo techado
    {"id": 4, "hex": (672, 1490, 36), "pisos": 1,
     "estilo": {"techo": "#6fa596", "fascia": "#a9d4ef", "alero": 2.8, "columnas": "#3f6f9e", "linterna_hex": True}},
    # Miniauditorio (fotos): blanco, franja alta de paneles grises, losa de techo muy volada sobre columnas de
    # acero en V, mural de cerámica hacia la calle y parasoles celestes junto a la puerta lateral
    # (fotos y anotaciones) más atrás que en el croquis: entre la fachada del mural y la calle hay una plaza
    {"id": 5, "rect": (989, 1292, 100, 100, 34), "pisos": 1, "alto": 7.5,
     "estilo": {"forma_techo": "plano", "techo": "#d9dcdf", "ventanas": "ninguna", "moderno": True}},
    # Entrada (fotos de la portada): pórtico blanco de losa delgada, caseta, rótulo de concreto y astas
    {"id": 6, "rect": (1049, 1131, 97, 20, -3), "pisos": 1, "alto": 3.4,
     "estilo": {"forma_techo": "plano", "techo": "#f4f5f6", "entrada": True}},
    # 7, 8 y 9: entre uno y otro hay zonas verdes con mesas de picnic, más anchas que en el croquis
    # 7, 8 y 9 (fotos): alineados entre sí (mismos extremos) y sin que el alero del 9 se meta en la calle; un piso, paredes blancas, ventanas corridas con rejas, techo bajo a dos aguas con alero
    # ancho (verde oscuro en 8 y 9, verde lima en 7) y corredores con columnas celestes
    # (anotaciones) entre el camino de la entrada y las puntas oeste de 7, 8 y 9 hay una zona verde: las aulas
    # se acortan 7 m de ese lado (28 px; el centro se corre 14 px a lo largo) y el extremo este queda igual
    {"id": 7, "rect": (1281.94, 1364.34, 139, 55, 5.5), "pisos": 1,
     "estilo": {"forma_techo": "dos_aguas", "pendiente": 0.14, "alero": 2.6, "techo": "#5d8a72", "fascia": "#9acd3c", "columnas": "#8ec3e6"}},
    {"id": 8, "rect": (1281.94, 1265.34, 139, 55, 5.5), "pisos": 1,
     "estilo": {"forma_techo": "dos_aguas", "pendiente": 0.14, "alero": 2.6, "techo": "#4f7d63", "fascia": "#1f6b4a", "columnas": "#8ec3e6"}},
    {"id": 9, "rect": (1281.94, 1166.34, 139, 55, 5.5), "pisos": 1,
     "estilo": {"forma_techo": "dos_aguas", "pendiente": 0.14, "alero": 2.6, "techo": "#4f7d63", "fascia": "#1f6b4a", "columnas": "#8ec3e6"}},
    {"id": 10, "rect": (1453, 1310, 60, 109, 15), "pisos": 0, "tipo": "piscina"},
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
    # Gimnasio (fotos): nave alta con techo de cuatro aguas de lámina verde y linternilla de ventilación,
    # viga perimetral de concreto sobre columnas que forma un corredor abierto, paredes blancas con franja celeste
    {"id": 14, "rect": (1689, 1292, 151, 196, 12.5), "pisos": 1, "alto": 9, "linterna": 0.6,
     "estilo": {"techo": "#8db38a", "corredor": True, "franja": "#4fa8e8", "rotulo": [-1, 0]}},
    # Bodega de Acción Social (foto): casita blanca de techo a dos aguas gris oscuro con alero blanco y portón negro
    {"id": 15, "rect": (1770, 1450, 59, 41, 0), "pisos": 1, "alto": 3.4,
     "estilo": {"forma_techo": "dos_aguas", "techo": "#4a5056", "ventanas": "ninguna", "porton": "#2b2f33"}},
    # Residencias: barra doblada del croquis, en dos alas; en la foto, techo de dos niveles con linternilla
    # el ala sur del croquis llega hasta la carretera: se acorta y se corre hacia adentro para que quede
    # dentro de la cerca, como en el campus real
    {"id": 16, "alas": [(1700, 1840, 200, 74, 81), (1742, 1960, 120, 66, 46)], "pisos": 2, "linterna": 0.42,
     "estilo": {"techo": "#66756b"}},
    {"id": 17, "rect": (1816, 1795, 63, 92, -11), "pisos": 1, "estilo": {"techo": "#66756b"}},
    # Laboratorio de Investigación (fotos): un piso sobre un talud, paredes gris claro con paneles blancos,
    # ventanas verticales con marco gris, techo casi plano con alero muy ancho, escalera y rampa al frente
    # a lo largo de la calle (que aquí corre casi de norte a sur, al este), con la escalera hacia la calle
    {"id": 18, "rect": (1560, 1826, 54, 30, 82), "pisos": 1, "alto": 3.6, "frente_calle": True,
     "estilo": {"forma_techo": "una_agua", "techo": "#9ea5aa", "pared": "#d6d9dc", "ventanas": "vidrio", "talud": 1.8}},
]


# Ensanche del mapa: el croquis deja muy poco espacio entre los edificios 7-9 y la piscina (los baños no caben)
# y entre la piscina y la calle del este (el parqueo real mide unos 20 m). Se abren dos franjas verticales
# en el croquis; todo lo que queda al este se corre. Las franjas pasan por zonas sin edificios.
ENSANCHES = [(1345, 1365, 40), (1498, 1520, 52)]   # (desde x, hasta x, cuánto se abre, en píxeles del croquis)
ENSANCHE_TOTAL = sum(d for *_, d in ENSANCHES)


def _rampa(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def ensanchar(x):
    """Coordenada x del croquis original → x del croquis ensanchado."""
    return x + sum(d * _rampa((x - a) / (b - a)) for a, b, d in ENSANCHES)


_TABLA = np.array([ensanchar(x) for x in np.arange(0, 2600, 0.25)])


def angostar(xw):
    """Inversa de ensanchar (la función es creciente)."""
    return float(np.interp(xw, _TABLA, np.arange(0, 2600, 0.25)))


def ensanchar_constantes():
    for e in EDIFICIOS:
        if "rect" in e:
            cx, cy, *rest = e["rect"]; e["rect"] = (ensanchar(cx), cy, *rest)
        if "alas" in e:
            e["alas"] = [(ensanchar(cx), cy, *rest) for cx, cy, *rest in e["alas"]]
        if "hex" in e:
            cx, cy, rr = e["hex"]; e["hex"] = (ensanchar(cx), cy, rr)
        if "poli" in e:
            e["poli"] = [(ensanchar(x), y) for x, y in e["poli"]]
    global PISCINA_RECT, RECORTE
    PISCINA_RECT = (ensanchar(PISCINA_RECT[0]), *PISCINA_RECT[1:])
    for d in (PICNIC, PUENTE, PLANTA):
        x, y = d["centro"]; d["centro"] = (int(round(ensanchar(x))), y)
    RECORTE = (RECORTE[0], RECORTE[1], RECORTE[2] + ENSANCHE_TOTAL, RECORTE[3])


def ensanchar_imagen(img):
    h, w = img.shape[:2]
    mapa_x = np.array([angostar(xw) for xw in range(w + ENSANCHE_TOTAL)], np.float32)
    mapa_x = np.tile(mapa_x, (h, 1))
    mapa_y = np.tile(np.arange(h, dtype=np.float32)[:, None], (1, w + ENSANCHE_TOTAL))
    return cv2.remap(img.astype(np.uint8), mapa_x, mapa_y, cv2.INTER_NEAREST, borderMode=cv2.BORDER_REPLICATE)


# Cauce de la quebrada al oeste del puente, trazado sobre una vista de la maqueta (ajuste afín con los
# números de los edificios); al este del puente sigue el trazo de antes
_VISTA = np.array([(325, 795), (852, 332), (896, 170), (1270, 330), (1343, 131), (1540, 293), (1580, 917), (1662, 800), (1408, 836), (545, 573)], float)
_CROQ = np.array([(466, 1759), (1011, 1306), (1049, 1131), (1433, 1304), (1510, 1113), (1689, 1292), (1721, 1900), (1816, 1795), (1553, 1826), (692, 1541)], float)
_AFIN = np.linalg.lstsq(np.hstack([_VISTA, np.ones((len(_VISTA), 1))]), _CROQ, rcond=None)[0]
QUEBRADA_OESTE = [tuple(np.array([x, y, 1.0]) @ _AFIN) for x, y in
                  [(275, 425), (330, 400), (385, 372), (440, 352), (500, 368), (560, 395), (620, 430), (670, 470),
                   (705, 505), (735, 550), (765, 580), (830, 596), (900, 600), (980, 590), (1060, 570), (1130, 545),
                   (1190, 510), (1240, 482), (1290, 466), (1335, 472)]]


def marco(id_, u, v):
    """Punto en el marco de un edificio: u a lo largo (sentido del giro), v hacia el lado izquierdo
    (para 1 y 2: u hacia el sureste, v hacia el noreste). En píxeles del croquis."""
    cx, cy, _, _, g = next(e for e in EDIFICIOS if e["id"] == id_)["rect"]
    c, s = math.cos(math.radians(g)), math.sin(math.radians(g))
    return (cx + c * u + s * v, cy + s * u - c * v)


# Lugares sin edificio que marcó la Sede sobre la maqueta (capturas anotadas). Píxeles del croquis original;
# los que dependen de las calles se calculan en main().
PUENTE_PEATONAL_X = 1775          # sobre la ruta 32, al norte de los edificios 12 y 13
CASETA_GUARDA = (1045, 1197)      # en la isla de zacate entre las calles, al sur de la entrada
BANO_MINIAUDITORIO = (925, 1361)  # al suroeste del miniauditorio, entre él y el sendero
# sendero techado que sube desde la calle (cerca del paso de la quebrada) hasta la explanada
SENDERO_EXPLANADA = [(948, 1466), (912, 1439), (883, 1417), (863, 1384), (862, 1351), (878, 1317), (908, 1283),
                     (934, 1245), (945, 1212), (925, 1188), (899, 1157), (887, 1141)]
# explanada (anotaciones): todo el zacate abierto dentro de la vuelta del sendero, que la delimita al este
EXPLANADA = [(910, 1240), (840, 1362), (794, 1353), (722, 1302), (676, 1254), (702, 1186), (745, 1136), (796, 1147), (885, 1201)]


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


def techo_dos_aguas(cx, cz, largo, ancho, g, base, alero=1.2, pendiente=0.36):
    """Techo a dos aguas: cumbrera a lo largo del lado mayor y dos frontones."""
    a, b = largo / 2 + alero, ancho / 2 + alero
    p = a_local(cx, cz, g)
    h = b * pendiente
    e = [p(-a, -b, base), p(a, -b, base), p(a, b, base), p(-a, b, base)]
    c1, c2 = p(-a, 0, base + h), p(a, 0, base + h)
    caras = [(e[0], e[1], c2), (e[0], c2, c1), (e[2], e[3], c1), (e[2], c1, c2), (e[1], e[2], c2), (e[3], e[0], c1)]
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
    est = e.get("estilo", {})
    if "hex" in e:
        cx, cy, rr = e["hex"]
        vol.append({"contorno": [a_metros(x, y) for x, y in contorno(e)], "desde": 0, "alto": alto})
        m = a_metros(cx, cy)
        techo, cumbre = techo_piramide(m[0], m[1], rr * ESCALA + est.get("alero", ALERO) - ALERO, alto)
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
        elif e.get("estilo", {}).get("forma_techo") == "dos_aguas":
            t, c = techo_dos_aguas(m[0], m[1], L, W, g, alto, alero=est.get("alero", 1.2), pendiente=est.get("pendiente", 0.36))
            techo += t
            cumbre = max(cumbre, c)
        elif e.get("estilo", {}).get("forma_techo") == "una_agua":
            t, c = techo_una_agua(m[0], m[1], L, W, g, alto + 0.6, alero=2.2, subida=W * 0.05)
            techo += t
            cumbre = max(cumbre, c)
        else:
            t, c = techo_cuatro_aguas(m[0], m[1], L, W, g, alto, alero=est.get("alero", ALERO),
                                      pendiente=est.get("pendiente", 0.2 if L * W > 900 else PENDIENTE))
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
        return inversa @ np.array([angostar(x), y, 1.0])   # la captura satelital calza con el croquis original

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


def junto_calle(puntos, d, calles):
    """Corre cada punto hasta que quede a d píxeles del borde de la calle (para pasillos que la acompañan)."""
    D = cv2.distanceTransform((calles == 0).astype(np.uint8), cv2.DIST_L2, 5)
    gx, gy = cv2.Sobel(D, cv2.CV_32F, 1, 0, ksize=5), cv2.Sobel(D, cv2.CV_32F, 0, 1, ksize=5)
    salida = []
    for x, y in puntos:
        for _ in range(30):
            xi, yi = int(round(x)), int(round(y))
            g = np.array([gx[yi, xi], gy[yi, xi]]); n = float(np.linalg.norm(g)) or 1.0
            paso = d - float(D[yi, xi])
            x += 0.6 * paso * g[0] / n; y += 0.6 * paso * g[1] / n
        salida.append((x, y))
    return salida


def suavizar(puntos, vueltas=2):
    """Esquinas redondeadas (Chaikin) y puntos cada ~4 m, para que el techo del pasillo siga la curva."""
    p = np.array(puntos, float)
    for _ in range(vueltas):
        q = [p[0]]
        for a, b in zip(p[:-1], p[1:]):
            q += [0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b]
        q.append(p[-1]); p = np.array(q)
    d = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
    n = max(2, int(round(d[-1] / 16)) + 1)
    t = np.linspace(0, d[-1], n)
    return list(zip(np.interp(t, d, p[:, 0]), np.interp(t, d, p[:, 1])))


def lugares_nuevos(calles, quebrada, lejos_carretera, y_ruta32):
    """Elementos sin edificio (pasillos techados, casetas, parqueos, etc.) y las máscaras para pintarlos
    en el suelo y para que no les caigan árboles encima. Todo sale en metros para la maqueta."""
    forma = calles.shape
    asfalto, lastre, claro, despejar, claro_plaza = (np.zeros(forma, np.uint8) for _ in range(5))
    rayas = np.zeros((forma[0] * 2, forma[1] * 2), np.uint8)   # al doble, para líneas finas
    elem = []
    M = lambda pts: [a_metros(float(x), float(y)) for x, y in pts]

    def pasillo(pts, id_=None, ancho=2.6, techo=True, cruces=(), subida=0.0, cima=None):
        pts = suavizar(pts)
        largo_ = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(np.array(pts), axis=0).T))])
        # sube parejo hasta el punto «cima» (o hasta el final) y de ahí sigue plano
        fin_ = largo_[int(np.argmin([math.dist(q, cima) for q in pts]))] if cima else largo_[-1]
        alturas = [round(float(subida * min(1.0, d / fin_)), 2) for d in largo_] if subida else []
        cv2.polylines(despejar, [np.array(pts, np.int32)], False, 1, 34)
        en_calle = [bool(calles[int(y), int(x)]) for x, y in pts]   # donde cruza una calle no lleva losa, columnas ni techo
        elem.append({"tipo": "pasillo", "id": id_, "puntos": M(pts), "ancho": ancho, "techo": techo, "en_calle": en_calle, "alturas": alturas,
                     "cruces": [M([c])[0] for c in cruces]})
        return pts

    def caja(id_, tipo, p, giro, largo, ancho, **extra):
        cv2.fillPoly(despejar, [np.array(rect_contorno(p[0], p[1], largo / ESCALA + 56, ancho / ESCALA + 56, giro), np.int32)], 1)
        elem.append({"tipo": tipo, "id": id_, "p": a_metros(*p), "giro": round(math.radians(giro), 3), "largo": largo, "ancho": ancho, **extra})

    def parqueo(id_, centro, largo, ancho, giro, filas, conexion=None, techado=False):
        """Parqueo asfaltado (largo x ancho en metros); filas = [(z del centro de la fila, fondo)] en metros,
        z medido hacia la izquierda del giro (como v en marco)."""
        cx, cy = centro
        cv2.fillPoly(asfalto, [np.array(rect_contorno(cx, cy, largo / ESCALA, ancho / ESCALA, giro), np.int32)], 255)
        cv2.fillPoly(despejar, [np.array(rect_contorno(cx, cy, largo / ESCALA + 24, ancho / ESCALA + 24, giro), np.int32)], 1)
        c, s = math.cos(math.radians(giro)), math.sin(math.radians(giro))
        pt = lambda u, v: (cx + (c * u + s * v) / ESCALA, cy + (s * u - c * v) / ESCALA)
        doble = lambda a, b: cv2.line(rayas, tuple(int(k * 2) for k in pt(*a)), tuple(int(k * 2) for k in pt(*b)), 255, 2)
        espacios = []
        for z, fondo in filas:
            n = int((largo - 1.5) // 2.6)
            u0 = -n * 2.6 / 2
            for i in range(n + 1):
                doble((u0 + i * 2.6, z - fondo / 2), (u0 + i * 2.6, z + fondo / 2))
            espacios.append({"z": z, "fondo": fondo, "n": n})
        if conexion:   # entrada de asfalto desde la calle
            cv2.line(asfalto, tuple(int(k) for k in conexion[0]), tuple(int(k) for k in conexion[1]), 255, 22)
        elem.append({"tipo": "parqueo", "id": id_, "centro": a_metros(cx, cy), "largo": largo, "ancho": ancho,
                     "giro": round(math.radians(giro), 3), "filas": espacios, "techado": techado})

    # --- pasillos techados (anotaciones): de la entrada bajan por el lado sureste de la calle (26), cruzan la
    # quebrada junto a la calle y siguen hacia el edificio administrativo (27) hasta la punta de la calle, donde
    # arranca el pasillo que va pegado al 2 hasta la soda (36). Otro pasillo une la calle con la punta oeste del 7
    # y uno más corre por el lado este de 7, 8 y 9.
    tramo26 = junto_calle([(1150, 1250), (1132, 1305), (1100, 1358), (1064, 1410), (1012, 1462), (962, 1508)], 15, calles)
    pasillo(tramo26, 26)
    # (anotaciones) el tramo norte, junto a la calle y frente a las puntas de 7, 8 y 9, es una acera sin techo;
    # el techo empieza donde llega el pasillo del 7
    p26 = elem[-1]
    k26 = next(i for i, (x, z) in enumerate(p26["puntos"]) if z > -31)
    elem.append({"tipo": "acera", "id": None, "puntos": p26["puntos"][:k26 + 1], "ancho": 2.4})
    for clave in ("puntos", "en_calle"):
        p26[clave] = p26[clave][k26:]
    if p26["alturas"]:
        p26["alturas"] = p26["alturas"][k26:]
    pasillo([marco(2, -100, 47), marco(2, 15, 47), marco(2, 32, 51), marco(2, 104, 51)], 36)
    union7 = junto_calle([(1080, 1392)], 15, calles)
    pasillo([marco(7, -74, 6), marco(7, -90, 2), (1118, 1374)] + union7)
    # (anotaciones) el pasillo del lado de la piscina termina antes de la esquina sur del 7
    pasillo([marco(9, 84, 38), marco(9, 84, 0), marco(8, 84, 0), marco(7, 84, 0), marco(7, 84, -8)])
    # sendero techado que sube de la calle a la explanada (29), pasando junto al baño del miniauditorio (31)
    # (fotos) el sendero sube a la explanada entre muros celestes, con baranda gris, y entra a ella por el norte
    pasillo(junto_calle(SENDERO_EXPLANADA[:1], 9, calles) + SENDERO_EXPLANADA[1:] + [(856, 1170)], techo=False, ancho=2.0, subida=3.5,
            cima=(945, 1212))

    # --- explanada (29): zacate abierto y parejo, sin árboles
    cv2.fillPoly(claro, [np.array(EXPLANADA, np.int32)], 255)
    cv2.fillPoly(despejar, [np.array(EXPLANADA, np.int32)], 1)
    despejar[:] = np.maximum(despejar, cv2.dilate(claro, np.ones((25, 25), np.uint8)) // 255)
    ex = np.array(EXPLANADA, float)
    # (fotos) es una planicie en lo alto, con taludes de zacate, y en ella un higuerón enorme
    elem.append({"tipo": "explanada", "id": 29, "contorno": M(EXPLANADA), "centro": a_metros(*ex.mean(axis=0)), "alto": 3.5,
                 "arbol": a_metros(*(ex.mean(axis=0) + (-14, 6)))})

    # --- plaza frente al Miniauditorio (fotos): concreto con guía táctil, bancas de concreto celeste
    plaza5 = [marco(5, 52, -56), marco(5, 82, -56), marco(5, 82, 56), marco(5, 52, 56)]
    cv2.fillPoly(claro_plaza, [np.array(plaza5, np.int32)], 255)
    cv2.fillPoly(despejar, [np.array(plaza5, np.int32)], 1)
    elem.append({"tipo": "bancas", "id": None, "giro": round(math.radians(34), 3),
                 "puntos": M([marco(5, 70, v) for v in (-40, -14, 12, 38)])})

    # --- casetas y baños
    caja(30, "caseta", CASETA_GUARDA, -3, 3.6, 3.2, alto=2.7, uso="guarda")
    # pluma roja y blanca junto a la caseta, atravesada en el carril de entrada
    ys_, xs_ = np.nonzero(calles[CASETA_GUARDA[1] - 60:CASETA_GUARDA[1] + 60, CASETA_GUARDA[0] - 60:CASETA_GUARDA[0] + 60])
    k_ = int(np.argmin(np.hypot(xs_ - 60, ys_ - 60)))
    hx, hy = xs_[k_] - 60, ys_[k_] - 60
    elem.append({"tipo": "pluma", "id": None, "p": a_metros(CASETA_GUARDA[0] + hx * 0.8, CASETA_GUARDA[1] + hy * 0.8),
                 "giro": round(math.atan2(hx, hy), 3), "largo": 4.5})
    # baños del Miniauditorio (31): el ala baja del mismo edificio (fotos), pegada a su cara suroeste, con celosías
    # y entrada propia bajo el alero
    caja(31, "caseta", marco(5, -20, -74), 34, 14.0, 12.0, alto=3.4, uso="ala_moderna")
    # caseta de arriba (37, fotos): torre blanca de dos niveles, cuartos eléctricos abajo y escalera metálica azul
    caja(37, "caseta", marco(2, -157, 0), 51, 5.0, 4.0, alto=2.8, uso="torre", elevada=2.8)
    # baño de Docencia (24): casita crema de techo verde a una agua, justo detrás de la Coordinación (4)
    # (anotaciones) justo detrás de Docencia, del lado contrario a la calle
    caja(24, "caseta", (684, 1426), -20, 6.0, 4.5, alto=2.8, uso="banos_crema")
    # pasillo techado corto que une la puerta de Docencia con el pasillo 27 (anotaciones)
    pasillo([(705, 1577), (688, 1531)])
    # baño del pabellón 7 (fotos y anotaciones): casita aparte con techo a dos aguas, alero celeste y un mural,
    # pasando el extremo oeste del 7, junto al pasillo techado que llega del camino de la entrada
    caja(None, "caseta", marco(7, -94, -21), 5.5, 9.0, 6.0, alto=3.0, uso="banos_mural")

    # --- parqueos: frente a Docencia (25) y el administrativo al final de la calle, junto al 2 (34)
    # (anotaciones y fotos) no hay calle hacia el 25: entre el final de la calle, el 25 y el 34 todo es una
    # explanada de asfalto. El 25 tiene cuatro espacios de frente hacia Docencia; el 34, tres espacios techados
    # (carport verde) y el resto del patio con rayas
    c25 = marco(2, 52, 149)
    parqueo(25, c25, 11.9, 6.0, -39, [(0.0, 5.0)])
    c34 = marco(2, -42, 63)
    parqueo(34, c34, 25.0, 9.5, 51, [(-2.25, 5.0)], techado=3)
    esquinas_ = rect_contorno(c25[0], c25[1], 11.9 / ESCALA + 8, 6.0 / ESCALA + 8, -39) + rect_contorno(c34[0], c34[1], 25.0 / ESCALA + 4, 9.5 / ESCALA + 4, 51)
    esquinas_ += [p_ for p_ in zip(*np.nonzero(calles[1570:1625, 640:830])[::-1])]   # borde de la calle, al norte
    esquinas_ = [(x + 640, y + 1570) if i_ >= 8 else (x, y) for i_, (x, y) in enumerate(esquinas_)]
    plaza = cv2.convexHull(np.array(esquinas_, np.float32)).astype(np.int32)
    cv2.fillPoly(asfalto, [plaza], 255)
    cv2.fillPoly(despejar, [plaza], 1)
    # la 33 es el parqueo de la piscina, que ya está modelado

    # --- (fotos) el 1 está en lo alto del talud, unos 3,5 m sobre el 2. Una escalera larga y techada baja del
    # corredor del 1 al vestíbulo del 2, y a su lado una rampa techada (Ley 7600) baja por el talud en dos tramos
    # paralelos a los edificios, con un descanso en la vuelta (pendiente cercana al 8 %)
    # (anotaciones) la escalera va en el extremo noroeste, pasando la punta del 2; la rampa corre pegada al 2
    # desde el otro extremo y, al final, un tramo corto sube atravesando el talud hasta el corredor del 1
    # (anotaciones) la escalera une los dos pabellones: va entre el corredor del 2 y el del 1, en el tramo donde
    # quedan frente a frente, cerca del extremo noroeste. La rampa (Ley 7600) sube en zigzag por el resto del
    # talud: un tramo pegado al 2 hacia el noroeste, un descanso y otro tramo de vuelta pegado al 1
    caja(None, "escalera", marco(2, -97, -54), 141, 8.4, 2.8, alto=3.5, techado=True)   # sube hacia el suroeste, al 1
    for u0, u1, v, base in ((6, -76, -41, 0.0), (-76, 6, -64, 1.75)):
        r0, r1 = marco(2, u0, v), marco(2, u1, v)
        cv2.line(despejar, tuple(int(k) for k in r0), tuple(int(k) for k in r1), 1, 26)
        elem.append({"tipo": "rampa", "id": None, "desde": a_metros(*r0), "hasta": a_metros(*r1), "ancho": 1.8, "alto": 1.75, "base": base, "techado": True})
    elem.append({"tipo": "descanso", "id": None, "p": a_metros(*marco(2, -82, -52.5)), "giro": round(math.radians(51), 3), "largo": 3.0, "ancho": 7.6, "alto": 1.75})
    elem.append({"tipo": "descanso", "id": None, "p": a_metros(*marco(2, 12, -66)), "giro": round(math.radians(51), 3), "largo": 3.0, "ancho": 3.6, "alto": 3.5})

    # --- entrada al Jardín Etnobotánico (35): sendero de lastre desde la punta sureste del 1
    a35, b35 = marco(1, 90, 20), marco(1, 200, 20)
    cv2.line(lastre, tuple(int(k) for k in a35), tuple(int(k) for k in b35), 255, 15)
    cv2.line(despejar, tuple(int(k) for k in a35), tuple(int(k) for k in marco(1, 240, 20)), 1, 70)
    elem.append({"tipo": "jardin", "id": 35, "desde": a_metros(*a35), "hasta": a_metros(*b35)})

    # --- mesas de picnic en las zonas verdes entre 9, 8 y 7, y en la isla de zacate al oeste del 8 y el 9
    mesas = []
    for arriba, abajo in ((9, 8), (8, 7)):
        for u in (-54, -18, 18, 54):
            p, q = marco(arriba, u, -27.5), marco(abajo, u, 27.5)
            mesas.append(((p[0] + q[0]) / 2, (p[1] + q[1]) / 2))
    # (anotaciones) las dos mesas de la isla de zacate frente al pórtico de la entrada se quitaron
    # alrededor de Docencia (4) hay varias mesas redondas de concreto en el zacate (fotos)
    mesas += [(672 + 64 * math.cos(math.radians(a)), 1490 + 64 * math.sin(math.radians(a))) for a in (205, 232)]   # la del noreste se quitó (anotaciones)
    # (anotaciones) mesas nuevas: junto al camino de la entrada, al sur de la unión con el pasillo del 7; tres entre
    # el pasillo de las aulas y los baños de la piscina; (anotaciones) tres detrás de la acera, entre ella y la
    # quebrada, pasando el toldo de los vestidores
    nuevas = [[-22.8, -22.2], [45.6, -65.5], [45.6, -60.0], [45.6, -54.5], [85.77, -15.02], [90.04, -13.57], [94.26, -11.92]]
    a_px = lambda x, z: (int(round(x / ESCALA + ORIGEN[0])), int(round(z / ESCALA + ORIGEN[1])))
    for x, z in nuevas:   # sin árboles encima de las mesas nuevas
        cv2.circle(despejar, a_px(x, z), int(4.5 / ESCALA), 1, -1)
    elem.append({"tipo": "mesas", "id": None, "puntos": M(mesas) + nuevas})
    # (anotaciones y revisión) paso de cebra frente al pórtico: cruza las dos calles que rodean la isla de zacate,
    # cada una en ángulo recto (no en diagonal, que lo llevaba debajo del alero del 13), y una acera une los dos
    # cruces por la isla. Del lado oeste llega al zacate frente a la caseta del guarda, con una acera corta hasta
    # el 13; del este, a la acera que baja junto al camino de la entrada
    def cebra_en(x, z, ancho=3.0):
        cx_, cy_ = a_px(x, z)
        R = int(7 / ESCALA)
        yy, xx = np.nonzero(calles[cy_ - R:cy_ + R, cx_ - R:cx_ + R])
        _, vecs_ = np.linalg.eigh(np.cov(np.vstack([xx, yy])))
        rx_, ry_ = vecs_[:, -1]                    # dirección de la calle
        ux_, uz_ = -ry_, rx_                       # el cruce va de lado a lado, en ángulo recto
        ds = np.round(np.arange(-12.0, 12.01, 0.3), 2)
        sobre = [bool(calles[a_px(x + ux_ * d, z + uz_ * d)[::-1]]) for d in ds]
        k0 = min((k for k, s in enumerate(sobre) if s), key=lambda k: abs(ds[k]))   # el asfalto más cercano a la semilla
        ki = k0
        while ki > 0 and sobre[ki - 1]: ki -= 1
        kd = k0
        while kd < len(ds) - 1 and sobre[kd + 1]: kd += 1
        izq, der = float(ds[ki]), float(ds[kd])
        franjas = [[round(x + ux_ * d, 2), round(z + uz_ * d, 2)] for d in np.arange(izq + 0.45, der - 0.2, 0.9)]
        elem.append({"tipo": "cebra", "id": None, "franjas": franjas, "giro": round(math.atan2(ux_, uz_), 3), "ancho": ancho})
        return [round(x + ux_ * (izq - 0.6), 2), round(z + uz_ * (izq - 0.6), 2)], [round(x + ux_ * (der + 0.6), 2), round(z + uz_ * (der + 0.6), 2)]
    oeste_a, oeste_b = cebra_en(-26.0, -84.0)
    este_a, este_b = cebra_en(-12.5, -76.0)
    lados_ = sorted([oeste_a, oeste_b], key=lambda q: q[0])        # el extremo de más al oeste llega al zacate del guarda
    isla_ = sorted([este_a, este_b], key=lambda q: q[0])
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8, "puntos": [lados_[1], isla_[0]]})          # por la isla
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8, "puntos": [lados_[0], [lados_[0][0], -88.4]]})   # hasta el 13
    # (anotaciones) acera desde la calle del puente hasta la esquina sur del 7, donde llega el pasillo de las aulas.
    # Pasa pegada a la malla de la piscina (a unos 2,4 m), de modo que los vestidores, el toldo y las mesas quedan
    # detrás de ella, del lado de la quebrada (ver vestidores en recorrido.js)
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8,
                 "puntos": [[107.0, -11.5], [98.0, -14.6], [86.56, -19.89], [67.24, -25.07], [56.13, -28.04], [41.4, -29.5]]})
    # (anotaciones) acera en la zona verde al norte del 9: sale del pasillo de los extremos de las aulas, bordea la
    # calle de arriba hasta la esquina y baja junto al camino de la entrada hasta la acera que ya estaba; otra
    # corta llega a ella desde el extremo oeste del 9
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8,
                 "puntos": [[42.3, -90.86], [35.4, -91.2], [29.4, -94.6], [23.4, -97.2], [17.4, -99.7], [11.4, -102.6],
                            [6.2, -104.8], [3.8, -103.4], [1.8, -99.5], [-1.4, -95.0], [-3.2, -90.0], [-4.8, -86.0],
                            [-6.1, -82.0], [-7.5, -78.0], [-8.9, -74.0], [-10.1, -70.0], [-11.1, -66.0], [-11.66, -62.19]]})
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8, "puntos": [[2.3, -80.5], [-6.1, -82.0]]})
    # (anotaciones) aceras a los dos lados de la calle que pasa entre la piscina y la Biblioteca: la del lado de la
    # piscina va desde la esquina de la calle que baja al puente hasta la acera que ya salía del pasillo de los
    # extremos de las aulas; la del lado de la Biblioteca, desde pasando la esquina hasta frente al 16. Un paso de
    # cebra las une cerca del extremo oeste
    # (anotaciones) el parqueo de bicicletas y motos se corrió detrás de la acera (ver recorrido.js), así que la del
    # lado de la piscina va de corrido
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8,
                 "puntos": [[115.78, -75.92], [111.91, -75.29], [108.0, -74.76], [104.0, -74.76], [100.0, -75.26],
                            [96.0, -75.26], [92.0, -75.26], [88.0, -75.26], [84.0, -75.26], [80.1, -75.5], [76.11, -75.61],
                            [72.99, -76.99], [69.69, -78.25], [66.41, -79.85], [62.72, -81.44], [60.82, -82.49],
                            [57.51, -84.34], [54.93, -86.06], [51.09, -88.14], [42.3, -90.86]]})
    # (anotaciones) acera corta que une esa acera, junto al paso de cebra, con el pasillo techado de los extremos
    # de las aulas, frente al 9
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8, "puntos": [[56.0, -85.2], [50.0, -81.0], [43.2, -79.0]]})
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8,
                 "puntos": [[127.42, -86.52], [125.48, -86.38], [121.37, -85.51], [118.17, -84.89], [114.09, -84.28],
                            [109.52, -83.53], [104.0, -83.24], [100.0, -83.24], [96.0, -83.24], [92.0, -83.24], [88.0, -83.49],
                            [84.0, -83.49], [76.38, -85.19], [72.52, -86.49], [69.42, -87.85], [64.87, -89.74],
                            [62.27, -91.82], [59.3, -93.54]]})
    elem.append({"tipo": "cebra", "id": None, "giro": 2.524, "ancho": 3.0,
                 "franjas": [[58.04, -86.15], [58.57, -86.89], [59.09, -87.62], [59.61, -88.36], [60.13, -89.09],
                             [60.65, -89.82]]})
    # (anotaciones) acera frente a las puntas oeste de 16, 15 y 14: sale de la acera corta que llega al extremo oeste
    # del 9 y corre hasta el pasillo techado que une la calle con la punta oeste del 7, fuera del alero
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8, "puntos": [[-1.6, -81.2], [-1.6, -38.3]]})
    # (anotaciones) acera por el lado este de la calle que baja de la entrada por residencias (33) al puente (36),
    # del lado de las residencias; termina antes de la cerca y empata con la acera este del puente
    elem.append({"tipo": "acera", "id": None, "ancho": 1.8,
                 "puntos": [[114.77, -1.05], [116.46, 4.19], [117.91, 8.23], [119.06, 12.14], [120.41, 16.23], [121.67, 20.19],
                            [123.19, 24.21], [124.36, 28.2], [125.81, 32.33], [125.8, 36.0], [126.18, 40.14], [126.55, 44.01],
                            [127.05, 48.0], [127.43, 52.14], [127.8, 56.01], [128.3, 60.0], [129.18, 64.03], [129.39, 68.21],
                            [129.92, 72.08], [130.3, 76.0], [130.8, 80.14], [131.55, 84.0], [132.05, 88.02], [133.06, 92.32],
                            [134.07, 96.24], [135.42, 100.02], [136.39, 104.36], [137.3, 108.22], [138.97, 112.27],
                            [141.53, 116.08], [144.45, 120.09], [147.13, 124.01], [149.7, 128.22], [151.58, 132.12],
                            [153.06, 136.29], [154.68, 140.25], [156.1, 144.31]]})
    # higuerón grande en el patio entre el 8 y el 9 (fotos)
    elem.append({"tipo": "arbol_grande", "id": None, "p": a_metros(*marco(9, -36, -50)), "escala": 1.7})
    # soda (fotos): comedor abierto al costado, con techo a dos aguas sobre columnas azules, y un tanque de agua
    # azul sobre una torre de tubo
    caja(None, "comedor", marco(3, 78, 0), -39, 10.0, 16.0, alto=3.2)
    elem.append({"tipo": "tanque", "id": None, "p": a_metros(*marco(3, 20, 56))})

    # --- portón: el acceso este desde la ruta 32, junto a la entrada principal, está cerrado
    ys, xs = np.nonzero((calles > 0) & (lejos_carretera > 20) & (lejos_carretera < 28))
    sel = (xs > 1120) & (xs < 1250) & (ys < 1130)
    cerca_extra = []
    if sel.any():
        gx_, gy_ = float(xs[sel].mean()), float(ys[sel].mean())
        # el portón va sobre la línea de la cerca, paralelo a la carretera: su frente mira hacia adentro
        sx = cv2.Sobel(lejos_carretera, cv2.CV_32F, 1, 0, ksize=5)[int(gy_), int(gx_)]
        sy = cv2.Sobel(lejos_carretera, cv2.CV_32F, 0, 1, ksize=5)[int(gy_), int(gx_)]
        giro_p = math.atan2(float(sx), float(sy))
        # (revisión) el portón cierra todo el asfalto en la línea de la cerca: se mide la calle de borde a borde a
        # lo largo de las hojas y el portón se centra en ella (antes medía 8,4 m y quedaban 4,5 m de malla sobre el asfalto)
        ux_g, uy_g = math.cos(giro_p), -math.sin(giro_p)
        lado_ = lambda s: next(d for d in range(1, 80) if not calles[int(round(gy_ + s * uy_g * d)), int(round(gx_ + s * ux_g * d))])
        d1_, d2_ = lado_(1), lado_(-1)
        gx_, gy_ = gx_ + ux_g * (d1_ - d2_) / 2, gy_ + uy_g * (d1_ - d2_) / 2
        semi_g = (d1_ + d2_) / 2 * ESCALA
        elem.append({"tipo": "porton", "id": None, "p": a_metros(gx_, gy_), "giro": round(giro_p, 3), "hoja": round(semi_g, 2)})
        # postes del portón (en los bordes del asfalto, 0,3 m afuera): ahí empalma la cerca
        ex, ey = ux_g * (semi_g + 0.3) / ESCALA, uy_g * (semi_g + 0.3) / ESCALA
        postes = sorted([(gx_ + ex, gy_ + ey), (gx_ - ex, gy_ - ey)])   # oeste, este
        # (anotaciones) la cerca baja desde el poste este del portón por el borde este del acceso hasta el pórtico
        # de la entrada; ahí termina en un portón para peatones
        # (revisión) la cerca va por la franja de zacate entre el acceso y la calle interna, sin pisar asfalto: arranca
        # donde empieza esa franja (entre ella y el poste del portón hay asfalto, el de la entrada a la calle interna)
        # y en cada punto se busca el centro de la franja, lo más lejos posible de las dos calles
        lejos_c = cv2.distanceTransform((calles == 0).astype(np.uint8), cv2.DIST_L2, 5)
        # línea marcada (en metros) por la franja de zacate de 1,5 m entre el acceso y la calle interna, hasta el pórtico
        guia_ = np.array([(x / ESCALA + ORIGEN[0], z / ESCALA + ORIGEN[1]) for x, z in
                          [(-2.5, -112.5), (-5.0, -108.0), (-8.0, -103.0), (-10.5, -99.0), (-12.8, -96.2)]], float)
        largo_g = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(guia_, axis=0).T))])
        cerca_extra = []
        for s_ in np.arange(0, largo_g[-1] + 0.1, 4):
            x_, y_ = np.interp(s_, largo_g, guia_[:, 0]), np.interp(s_, largo_g, guia_[:, 1])
            k_ = min(int(np.searchsorted(largo_g, s_, side="right")) - 1, len(guia_) - 2)
            tx_, ty_ = guia_[k_ + 1] - guia_[k_]; n_ = math.hypot(tx_, ty_) or 1
            nx_, ny_ = -ty_ / n_, tx_ / n_
            mejor_ = max((lejos_c[int(round(y_ + ny_ * d)), int(round(x_ + nx_ * d))], -abs(d), d) for d in range(-10, 11))
            mejor_ = (mejor_[0], mejor_[2])
            if mejor_[0] >= 2:   # al menos 0,5 m de zacate a cada lado
                cerca_extra.append((float(x_ + nx_ * mejor_[1]), float(y_ + ny_ * mejor_[1])))
        cerca_extra = [q for i, q in enumerate(cerca_extra) if i == 0 or math.dist(q, cerca_extra[i - 1]) > 2]
        (ax_, ay_), (bx_, by_) = [(float(x), float(y)) for x, y in cerca_extra[-2:]]
        d_ = math.hypot(bx_ - ax_, by_ - ay_) or 1
        ux_, uy_ = (bx_ - ax_) / d_, (by_ - ay_) / d_
        fin_ = (bx_ + ux_ * 1.5 / ESCALA, by_ + uy_ * 1.5 / ESCALA)   # el portón ocupa 1,5 m al final de la cerca
        elem.append({"tipo": "porton_peatonal", "id": None, "p": a_metros((bx_ + fin_[0]) / 2, (by_ + fin_[1]) / 2),
                     "giro": round(math.atan2(-uy_, ux_), 3), "ancho": 1.4})
        next(e for e in elem if e["tipo"] == "porton")["poste_este"] = postes[1]

    # --- paso de la quebrada bajo la calle (28): alcantarilla con cabezales de concreto y paso de cebra
    ys, xs = np.nonzero((calles > 0) & (cv2.dilate(quebrada, np.ones((9, 9), np.uint8)) > 0))
    sel = np.hypot(xs - 905, ys - 1525) < 70
    if sel.any():
        ax_, ay_ = float(xs[sel].mean()), float(ys[sel].mean())
        yc, xc = np.nonzero(calles[int(ay_) - 40:int(ay_) + 40, int(ax_) - 40:int(ax_) + 40])
        vals, vecs = np.linalg.eigh(np.cov(np.vstack([xc, yc])))
        dx_, dy_ = vecs[:, -1]   # dirección de la calle
        anchura = (calles[int(ay_) - 40:int(ay_) + 40, int(ax_) - 40:int(ax_) + 40] > 0).sum() / 80 * ESCALA
        # (fotos) el cruce es una plataforma de concreto rayado de lado a lado de la calle, con guía táctil
        elem.append({"tipo": "alcantarilla", "id": 28, "p": a_metros(ax_, ay_), "giro": round(math.atan2(dx_, dy_), 3), "ancho": round(float(anchura), 2)})
        # 27 (anotaciones): el pasillo de la entrada llega por el lado sureste hasta la alcantarilla, cruza la
        # calle justo encima de ella y sigue derecho por el otro lado hasta empatar con el pasillo de la soda
        nx_, ny_ = -dy_, dx_   # perpendicular a la calle
        if nx_ * 1 + ny_ * 1 < 0:
            nx_, ny_ = -nx_, -ny_   # que apunte al sureste
        lado_se, lado_no = (ax_ + 20 * nx_, ay_ + 20 * ny_), (ax_ - 20 * nx_, ay_ - 20 * ny_)
        norte27 = junto_calle([(860, 1515), (790, 1545), (720, 1570), (655, 1593), (610, 1610), (582, 1628)], 9, calles)
        pasillo([tramo26[-1], lado_se, lado_no] + norte27 + [marco(2, -100, 47)], 27)

    # --- puente peatonal sobre la ruta 32 (32)
    xp = ensanchar(PUENTE_PEATONAL_X)
    yp = y_ruta32(xp)
    pend = y_ruta32(xp + 50) - yp
    giro_calle = math.atan2(50, pend)   # dirección de la carretera en la maqueta (x, z)
    # medio ancho de la carretera: desde el eje, hacia el sur, hasta que se sale del asfalto
    nx_, ny_ = -pend / math.hypot(50, pend), 50 / math.hypot(50, pend)
    semi = next(d for d in range(1, 120) if lejos_carretera[int(yp + ny_ * d), int(xp + nx_ * d)] > 0.5) * ESCALA
    cv2.circle(despejar, (int(xp), int(yp)), 70, 1, -1)
    # (fotos) sin techo; las rampas corren junto a la carretera, fuera de la cerca de la UCR
    elem.append({"tipo": "puente_peatonal", "id": 32, "p": a_metros(xp, yp), "giro": round(giro_calle, 3), "semiancho": round(semi, 2)})
    return elem, {"asfalto": asfalto, "rayas": rayas, "lastre": lastre, "claro": claro, "despejar": despejar, "cerca": cerca_extra,
                  "plaza": claro_plaza}


def edificio_json(e):
    alto = 0 if e.get("tipo") == "piscina" else e.get("alto", round(max(e["pisos"], 1) * PISO, 1))
    vol, techo, cumbre = volumenes(e, alto)
    pts = [p for v in vol for p in v["contorno"]]
    centro = [round(sum(p[0] for p in pts) / len(pts), 2), round(sum(p[1] for p in pts) / len(pts), 2)]
    estilo = dict(e.get("estilo", {}))
    if "banos" in estilo:   # tramo del extremo que ocupan los baños, y la cara del extremo (para el rótulo)
        cx, cy, l, a, g = e["rect"]
        b, c_, s_ = estilo["banos"], math.cos(math.radians(g)), math.sin(math.radians(g))
        L = l * b["fraccion"]
        u = b["extremo"] * (l - L) / 2
        estilo["banos"] = {"contorno": [a_metros(*q) for q in rect_contorno(cx + c_ * u, cy + s_ * u, L, a, g)],
                           "fin": a_metros(cx + c_ * b["extremo"] * l / 2, cy + s_ * b["extremo"] * l / 2),
                           "eje": [round(c_ * b["extremo"], 3), round(s_ * b["extremo"], 3)], "ancho": round(a * ESCALA, 2)}
    return {"id": NUMERACION[e["id"]], "croquis": e["id"], "tipo": e.get("tipo", "edificio"), "pisos": e["pisos"], "alto": alto, "centro": centro,
            "cumbre": round(cumbre, 2), "volumenes": vol, "techo": [c for v in techo for c in v], "estilo": estilo,
            **({"dependencias": DEPENDENCIAS[e["id"]]} if e["id"] in DEPENDENCIAS else {})}


def salidas_carretera(suelo_rgb, terreno):
    """Dónde salen la carretera y las calles por los bordes de la textura del suelo, para prolongarlas en la
    maqueta (alrededor de la maqueta hay zacate y sin esto las calles quedarían cortadas en el borde).
    Devuelve [{a, b: extremos [x, z] del tramo de calle sobre el borde, dir: [dx, dz] hacia afuera}]:
    la prolongación arranca exactamente en ese tramo, así empata con la textura aunque la calle cruce en diagonal."""
    a = np.asarray(suelo_rgb).astype(int)
    h, w = a.shape[:2]
    gris = (np.abs(a[..., 0] - a[..., 2]) < 18) & (a[..., 0] < 160) & (a[..., 1] < 165)
    mx, mz = terreno["ancho"] / w, terreno["largo"] / h
    ys, xs = np.nonzero(gris)
    a_m = lambda x, y: [round(float(terreno["x"] + x * mx), 2), round(float(terreno["z"] + y * mz), 2)]
    salidas = []
    bordes = [(gris[0, :], lambda i: (i, 0), (0, 1)), (gris[h - 1, :], lambda i: (i, h), (0, -1)),
              (gris[:, 0], lambda i: (0, i), (1, 0)), (gris[:, w - 1], lambda i: (w, i), (-1, 0))]
    for fila, punto, adentro in bordes:
        corridas, inicio = [], None
        for i, v in enumerate(list(fila) + [False]):
            if v and inicio is None:
                inicio = i
            elif not v and inicio is not None:
                if i - inicio >= 12:   # menos de unos 5 m: es la orilla de una calle que sale por la esquina
                    corridas.append((inicio, i))
                inicio = None
        for i0, i1 in corridas:
            bx, by = punto((i0 + i1) / 2)
            # dirección: del centro de la calle unos píxeles adentro hacia el borde
            d_borde = (xs - bx) * adentro[0] + (ys - by) * adentro[1]
            lateral = np.abs((xs - bx) * adentro[1] - (ys - by) * adentro[0])
            sel = (d_borde > 6) & (d_borde < 30) & (lateral < (i1 - i0) / 2 + 20)
            if sel.sum() < 10:
                continue
            dx, dz = (bx - xs[sel].mean()) * mx, (by - ys[sel].mean()) * mz
            n = math.hypot(dx, dz)
            salidas.append({"a": a_m(*punto(i0)), "b": a_m(*punto(i1)), "dir": [round(float(dx / n), 4), round(float(dz / n), 4)]})
    return salidas

def main(pdf, sat=None):
    ensanchar_constantes()
    img = ensanchar_imagen(rasterizar(pdf)).astype(int)
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
    # La ruta 32 sigue hacia el este, pero el croquis la corta al norte del edificio 12: se prolonga hasta
    # el borde con la misma dirección y el mismo ancho que trae
    ys32, xs32 = np.nonzero(carretera[:1300])
    punta = int(xs32.max())
    cols = [x for x in range(punta - 200, punta - 70, 6) if (xs32 == x).any()]
    medios = [ys32[xs32 == x].mean() for x in cols]
    ancho32 = int(np.median([(xs32 == x).sum() for x in cols]))
    recta = np.polyfit(cols, medios, 1)
    y_de = lambda x: float(np.polyval(recta, x))
    cv2.line(carretera, (punta - 90, int(y_de(punta - 90))), (x1 + 40, int(y_de(x1 + 40))), 255, ancho32)

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
    # (revisión) la envolvente convexa deja recto y con un quiebre el lado que el croquis no cierra: se ajusta una
    # pista de verdad (dos rectas y dos semicírculos) al borde exterior que sí está dibujado
    from scipy.optimize import least_squares
    borde_o = np.vstack(cs)[:, 0, :].astype(float)
    borde_o = borde_o[borde_o[:, 1] < 2870]                         # sin el corte recto donde estaba el acceso
    mx_o, my_o = borde_o.mean(axis=0)
    _, v_o = np.linalg.eigh(np.cov(borde_o.T)); ang0 = math.atan2(v_o[1, -1], v_o[0, -1])
    def resto(q):
        cx_, cy_, an_, a_, r_ = q
        ux_, uy_ = math.cos(an_), math.sin(an_)
        lo_ = (borde_o[:, 0] - cx_) * ux_ + (borde_o[:, 1] - cy_) * uy_
        tr_ = -(borde_o[:, 0] - cx_) * uy_ + (borde_o[:, 1] - cy_) * ux_
        return np.hypot(np.clip(np.abs(lo_) - a_, 0, None), tr_) - r_
    sol = least_squares(resto, [mx_o, my_o, ang0, 200.0, 150.0]).x
    cx_s, cy_s, an_s, a_s, r_s = sol
    us_, vs_ = (math.cos(an_s), math.sin(an_s)), (-math.sin(an_s), math.cos(an_s))
    lleno = np.zeros_like(anillo)
    esq_ = [(cx_s + us_[0] * a_s * i + vs_[0] * r_s * j, cy_s + us_[1] * a_s * i + vs_[1] * r_s * j) for i, j in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    cv2.fillPoly(lleno, [np.array(esq_, np.int32)], 255)
    for i in (-1, 1):
        cv2.circle(lleno, (int(round(cx_s + us_[0] * a_s * i)), int(round(cy_s + us_[1] * a_s * i))), int(round(r_s)), 255, -1)
    pista = cv2.subtract(lleno, cv2.erode(lleno, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (49, 49))))
    # (revisión) el acceso de la pista es un camino recto que llega al borde del óvalo: se rehace como una franja
    # limpia (el croquis le pegaba una cuña de asfalto a lo largo de la curva) y no se pinta sobre carriles ni cancha
    calles[acceso > 0] = 0
    lejos_ovalo = cv2.dilate(lleno, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (73, 73)))   # ~9 m alrededor
    nucleo = ((acceso > 0) & (lejos_ovalo == 0)).astype(np.uint8)
    n_, lab_, st_, _ = cv2.connectedComponentsWithStats(nucleo)
    nuevo_acceso = np.zeros_like(acceso)
    if n_ > 1:
        k_ = 1 + int(np.argmax(st_[1:, 4]))
        ys_a, xs_a = np.nonzero(lab_ == k_)
        mx_a, my_a = xs_a.mean(), ys_a.mean()
        _, vecs_a = np.linalg.eigh(np.cov(np.vstack([xs_a, ys_a])))
        ax_, ay_ = vecs_a[:, -1]
        cy_o, cx_o = np.mean(np.nonzero(lleno), axis=1)
        if ax_ * (cx_o - mx_a) + ay_ * (cy_o - my_a) < 0:
            ax_, ay_ = -ax_, -ay_          # a lo largo del camino, hacia la pista
        a_lo = (xs_a - mx_a) * ax_ + (ys_a - my_a) * ay_
        a_tr = -(xs_a - mx_a) * ay_ + (ys_a - my_a) * ax_
        ancho_a = float(np.percentile(a_tr, 95) - np.percentile(a_tr, 5))
        ini = (mx_a + ax_ * a_lo.min(), my_a + ay_ * a_lo.min())
        fin = next(((mx_a + ax_ * s, my_a + ay_ * s) for s in range(int(a_lo.max()), 600)
                    if lleno[int(my_a + ay_ * s), int(mx_a + ax_ * s)]), (mx_a + ax_ * a_lo.max(), my_a + ay_ * a_lo.max()))
        cv2.line(nuevo_acceso, (int(ini[0]), int(ini[1])), (int(fin[0]), int(fin[1])), 255, max(int(ancho_a), 8))
    acceso = cv2.bitwise_and(nuevo_acceso, cv2.bitwise_not(lleno))
    calles[acceso > 0] = 255
    # eje largo de la pista (componente principal del óvalo) y medio largo de la cancha, para los marcos
    ys_o, xs_o = np.nonzero(lleno)
    _, vecs_o = np.linalg.eigh(np.cov(np.vstack([xs_o, ys_o])))
    vx_o, vy_o = vecs_o[:, -1]
    proy_o = (xs_o - xs_o.mean()) * vx_o + (ys_o - ys_o.mean()) * vy_o
    trans_o = -(xs_o - xs_o.mean()) * vy_o + (ys_o - ys_o.mean()) * vx_o
    eje_pista = math.atan2(-vy_o, vx_o)                                   # en recorrido.js: dirección (cos, −sen)
    # medidas interiores del óvalo (sin el anillo de 6,1 m); en una pista reglamentaria la cancha termina unos
    # 0,72 semianchos antes del extremo interior de las curvas
    largo_in = (proy_o.max() - proy_o.min()) / 2 * ESCALA - 49 * ESCALA / 2
    ancho_in = (trans_o.max() - trans_o.min()) / 2 * ESCALA - 49 * ESCALA / 2
    medio_cancha = largo_in - 0.72 * ancho_in
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
    oeste = [(ensanchar(x), y) for x, y in QUEBRADA_OESTE] + [(qx, qy)]
    este = [(qx + d, qy + 26 * math.sin(d / 90) + 0.12 * d) for d in range(12, 430, 12)]
    puntos = np.array(oeste + este, np.float32)
    # se suaviza el trazo a mano (media móvil) para que el cauce no quede quebrado
    suave = np.array([puntos[max(0, i - 2):i + 3].mean(axis=0) for i in range(len(puntos))])
    suave[-len(este) - 1] = (qx, qy)
    cv2.polylines(quebrada, [suave.astype(np.int32)], False, 255, 13)
    lejos_carretera = cv2.distanceTransform((carretera == 0).astype(np.uint8), cv2.DIST_L2, 5)
    elementos, extra = lugares_nuevos(calles, quebrada, lejos_carretera, y_de)
    pintar(extra["claro"], (164, 206, 126))
    pintar(quebrada, (88, 132, 150), borde=(120, 140, 96))
    # área de picnic: zacate más claro y cuidado
    picnic = np.zeros_like(calles)
    cv2.circle(picnic, PICNIC["centro"], PICNIC["radio"], 255, -1)
    pintar(cv2.GaussianBlur(picnic, (0, 0), 6), (166, 208, 120))
    # dentro de la U todo está asfaltado (fotos), también el camino a la pista; cordón de concreto claro
    pintar(cv2.bitwise_or(calles, acceso), (84, 88, 94), borde=(214, 212, 204))
    pintar(extra["lastre"], (176, 160, 128))
    pintar(extra["plaza"], (200, 198, 190), borde=(170, 168, 160))
    pintar(extra["asfalto"], (80, 84, 90), borde=(200, 198, 190))
    pintar(cv2.resize(extra["rayas"], (calles.shape[1], calles.shape[0]), interpolation=cv2.INTER_AREA), (236, 236, 232))
    # parqueo junto a la piscina (satélite): rectángulo asfaltado con dos filas de espacios espalda con
    # espalda en la parte norte y pasillos al norte y al sur; se entra desde la calle del este
    u0, u1 = PARQUEO["u"]
    for u_ in np.arange(u0, u1, 0.5):   # no meterse en la calle: se corta 1,5 m antes
        x_, y_ = piscina_a_px(u_, (PARQUEO["v"][0] + PARQUEO["v"][1]) / 2)
        if calles[int(y_), int(x_)]:
            u1 = u_ - 1.5
            break
    PARQUEO["u"] = (u0, u1)
    v0, v1 = PARQUEO["v"]
    esquinas = [piscina_a_px(u0, v0), piscina_a_px(u1, v0), piscina_a_px(u1, v1), piscina_a_px(u0, v1)]
    PARQUEO["rect"] = (*piscina_a_px((u0 + u1) / 2, (v0 + v1) / 2), (u1 - u0) / ESCALA, (v1 - v0) / ESCALA, PISCINA_RECT[4])
    parqueo = np.zeros_like(calles)
    cv2.fillPoly(parqueo, [np.array(esquinas, np.int32)], 255)
    pintar(parqueo, (78, 82, 88), borde=(200, 198, 190))
    rayas = np.zeros((calles.shape[0] * 2, calles.shape[1] * 2), np.uint8)   # al doble para líneas finas
    dv = PARQUEO["divisor"]
    linea = lambda a, b: cv2.line(rayas, tuple(int(c * 2) for c in piscina_a_px(*a)), tuple(int(c * 2) for c in piscina_a_px(*b)), 255, 2)
    linea((u0 + 1, dv), (u1 - 1, dv))
    for u_ in np.arange(u0 + 1, u1 - 0.9, 2.6):
        linea((u_, dv - 5), (u_, dv + 5))
    rayas = cv2.resize(rayas, (calles.shape[1], calles.shape[0]), interpolation=cv2.INTER_AREA)
    pintar(rayas, (236, 236, 232))
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
    # alrededor de la piscina van el deck, los baños, los vestidores y el parqueo de bicicletas: sin árboles
    pcx_, pcy_, pl_, pa_, pg_ = PISCINA_RECT
    cv2.fillPoly(lejos_edificios, [np.array(rect_contorno(pcx_, pcy_, pl_ + 150, pa_ + 150, pg_), np.int32)], 1)
    lejos_edificios |= cv2.dilate((quebrada > 0).astype(np.uint8), np.ones((25, 25), np.uint8))   # sin árboles en el cauce
    cv2.circle(lejos_edificios, PLANTA["centro"], 115, 1, -1)
    cv2.fillPoly(lejos_edificios, [np.array(rect_contorno(*PARQUEO["rect"]), np.int32)], 1)
    lejos_edificios |= extra["despejar"]
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
    # (revisión) ningún árbol con la copa sobre los carriles de la pista
    lejos_pista = cv2.distanceTransform((pista == 0).astype(np.uint8), cv2.DIST_L2, 5)
    a_px_ = lambda x, z: (int(round(x / ESCALA + ORIGEN[0])), int(round(z / ESCALA + ORIGEN[1])))
    arboles = [a for a in arboles if lejos_pista[a_px_(*a["p"])[1], a_px_(*a["p"])[0]] * ESCALA >= a["r"] + 0.5
               and not lleno[a_px_(*a["p"])[1], a_px_(*a["p"])[0]]]   # ni dentro de la cancha

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
    cv2.floodFill(libre.copy(), zona, (int(ensanchar(1510)), 1113), 1, flags=4 | (1 << 8))
    zona = zona[1:-1, 1:-1]
    cs, _ = cv2.findContours(zona, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    borde = max(cs, key=cv2.contourArea)[:, 0, :]
    # portón de la pista: donde el camino de acceso de la pista llega a la carretera
    ys, xs = np.nonzero(acceso)
    k_min = int(np.argmin(lejos_carretera[ys, xs])) if len(xs) else None
    porton = None
    tramo_porton = []
    if k_min is not None:
        # (revisión) el portón va exactamente donde el camino de acceso cruza la línea de la cerca: el tramo del
        # borde que cae sobre el camino es la abertura, sus extremos son los postes y el portón la cierra de lado a lado
        acc_d = cv2.dilate(acceso, np.ones((5, 5), np.uint8))
        en_camino = [i for i, (x, y) in enumerate(borde) if acc_d[int(y), int(x)]]
        grupos_ = []
        for i in en_camino:
            if grupos_ and i - grupos_[-1][-1] <= 3:
                grupos_[-1].append(i)
            else:
                grupos_.append([i])
        if grupos_:
            tramo_porton = max(grupos_, key=len)
            (ax_, ay_), (bx_, by_) = [tuple(map(float, borde[i])) for i in (tramo_porton[0], tramo_porton[-1])]
            L_ = math.hypot(bx_ - ax_, by_ - ay_) or 1
            ux_, uy_ = (bx_ - ax_) / L_, (by_ - ay_) / L_
            mx_, my_ = (ax_ + bx_) / 2, (ay_ + by_) / 2
            cy_pista, cx_pista = np.mean(np.nonzero(pista), axis=1)
            nx_, ny_ = -uy_, ux_
            if nx_ * (cx_pista - mx_) + ny_ * (cy_pista - my_) < 0:
                nx_, ny_ = -nx_, -ny_   # +z local del portón apunta a la pista
            m_ = 0.4 / ESCALA
            porton = {"p": a_metros(mx_, my_), "hacia_pista": round(math.atan2(nx_, ny_), 3), "semiancho": round(L_ / 2 * ESCALA + 0.4, 2),
                      "postes": [a_metros(ax_ - ux_ * m_, ay_ - uy_ * m_), a_metros(bx_ + ux_ * m_, by_ + uy_ * m_)]}
    # portón verde de la entrada por residencias (fotos): donde la calle interna junto a las residencias
    # sale a la carretera
    ys, xs = np.nonzero((calles > 0) & (acceso == 0) & (lejos_carretera > 18) & (lejos_carretera < 26))
    sel = (xs > 1600) & (ys > 1700)
    porton_res = None
    if sel.any():
        rx, ry = float(xs[sel].mean()), float(ys[sel].mean())
        # dirección de la calle interna en el portón (componente principal de la calle alrededor)
        yc, xc = np.nonzero(calles[int(ry) - 45:int(ry) + 45, int(rx) - 45:int(rx) + 45])
        _, vecs = np.linalg.eigh(np.cov(np.vstack([xc, yc])))
        dx_, dy_ = vecs[:, -1]
        sx = cv2.Sobel(lejos_carretera, cv2.CV_32F, 1, 0, ksize=5)[int(ry), int(rx)]
        sy = cv2.Sobel(lejos_carretera, cv2.CV_32F, 0, 1, ksize=5)[int(ry), int(rx)]
        if dx_ * sx + dy_ * sy < 0:
            dx_, dy_ = -dx_, -dy_   # hacia adentro del campus
        # ancho de la calle en el portón, para que las hojas la cierren de borde a borde
        semi_ = next(d for d in range(1, 60) if not calles[int(ry + dx_ * d), int(rx - dy_ * d)]) * ESCALA
        porton_res = {"p": a_metros(rx, ry), "hacia_dentro": round(math.atan2(dx_, dy_), 3), "semiancho": round(semi_, 2),
                      "postes": [a_metros(rx + dy_ * (semi_ + 0.5) / ESCALA, ry - dx_ * (semi_ + 0.5) / ESCALA),
                                 a_metros(rx - dy_ * (semi_ + 0.5) / ESCALA, ry + dx_ * (semi_ + 0.5) / ESCALA)]}
    # la cerca se abre en las calles internas que salen a la carretera y, en la pista, solo donde va el portón
    accesos = cv2.dilate(((calles > 0) & (acceso == 0)).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31)))
    for i in tramo_porton:   # la cerca se abre solo donde está el portón
        cv2.circle(accesos, (int(borde[i][0]), int(borde[i][1])), 3, 1, -1)
    entrada6 = (1049, 1131)
    tramos, tramo = [], []
    for i in range(0, len(borde), 6):
        x, y = int(borde[i][0]), int(borde[i][1])
        sirve = (lejos_carretera[y, x] < 60 and x0 + 8 < x < x1 - 8 and y0 + 8 < y < y1 - 8
                 and not accesos[y, x] and math.hypot(x - entrada6[0], y - entrada6[1]) > 75
                 and not (960 < x < 1170 and y < 1115))   # entre la entrada y el acceso cerrado no hay cerca
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
    if len(extra["cerca"]) > 1:
        cerca.append([a_metros(float(x), float(y)) for x, y in extra["cerca"]])
        pass
    # la cerca empalma con los postes del portón de la pista y del de residencias
    for pe in (porton["postes"] if porton else []) + (porton_res["postes"] if porton_res else []):
        mejor = min(((t, k) for t in cerca for k in (0, -1)), key=lambda tk: math.dist(tk[0][tk[1]], pe))
        if math.dist(mejor[0][mejor[1]], pe) < 16:
            (mejor[0].insert(0, pe) if mejor[1] == 0 else mejor[0].append(pe))
    porton_n = next((e for e in elementos if e["tipo"] == "porton"), None)
    if porton_n:
        # (revisión) el portón del acceso cerrado va en la misma línea que la cerca que viene del este y cierra el
        # asfalto de borde a borde: se sigue esa línea desde el último poste hasta entrar y salir del asfalto
        pe = a_metros(*porton_n.pop("poste_este"))
        t0 = min(cerca[:-1], key=lambda t: min(math.dist(t[0], pe), math.dist(t[-1], pe)))
        if math.dist(t0[0], pe) < math.dist(t0[-1], pe):
            t0.reverse()
        en_asfalto = lambda x, z: bool(calles[int(round(z / ESCALA + ORIGEN[1])), int(round(x / ESCALA + ORIGEN[0]))])
        (ax_, az_), (bx_, bz_) = t0[-2], t0[-1]
        L_ = math.hypot(bx_ - ax_, bz_ - az_); ux_, uz_ = (bx_ - ax_) / L_, (bz_ - az_) / L_
        pasos = [s / 10 for s in range(0, int((L_ + 30) * 10))]
        dentro_ = [s for s in pasos if en_asfalto(ax_ + ux_ * s, az_ + uz_ * s)]
        if dentro_:
            # tramos de asfalto en la línea (la esquina redondeada de la calle interna y luego el acceso): el portón
            # va desde el primer asfalto hasta el final del tramo más largo, que es el acceso
            tramos_a = []
            for s in dentro_:
                if tramos_a and s - tramos_a[-1][1] <= 1.0:
                    tramos_a[-1][1] = s
                else:
                    tramos_a.append([s, s])
            s_e = tramos_a[0][0]
            s_w = max(tramos_a, key=lambda r: r[1] - r[0])[1] + 0.1
            E_ = (ax_ + ux_ * (s_e - 0.3), az_ + uz_ * (s_e - 0.3)); W_ = (ax_ + ux_ * (s_w + 0.3), az_ + uz_ * (s_w + 0.3))
            t0[-1] = [round(E_[0], 2), round(E_[1], 2)]
            porton_n["p"] = [round((E_[0] + W_[0]) / 2, 2), round((E_[1] + W_[1]) / 2, 2)]
            porton_n["giro"] = round(math.atan2(-uz_, ux_), 3)
            porton_n["hoja"] = round(math.dist(E_, W_) / 2 - 0.1, 2)
    cy_pista, cx_pista = np.mean(np.nonzero(pista), axis=1)

    ys_c, xs_c = np.nonzero(calles)
    for e in EDIFICIOS:
        if e.get("frente_calle"):
            cx_e, cy_e = e["rect"][:2]
            i = int(np.argmin(np.hypot(xs_c - cx_e, ys_c - cy_e)))
            dx_e, dy_e = xs_c[i] - cx_e, ys_c[i] - cy_e
            n = math.hypot(dx_e, dy_e) or 1
            e["estilo"]["frente"] = [round(dx_e / n, 3), round(dy_e / n, 3)]
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
        "parqueo": {"centro": a_metros(*PARQUEO["rect"][:2]), "largo": round(PARQUEO["rect"][2] * ESCALA, 2),
                    "ancho": round(PARQUEO["rect"][3] * ESCALA, 2), "giro": round(math.radians(PARQUEO["rect"][4]), 3),
                    "divisor": round(PARQUEO["divisor"] - (PARQUEO["v"][0] + PARQUEO["v"][1]) / 2, 2),
                    # (anotaciones) filas de espacios en los bordes norte y sur (fondo en m) y espacio de discapacidad
                    "rayas_bordes": 5.0, "discapacidad": True},
        "planta": {"centro": a_metros(*PLANTA["centro"]), "giro": round(math.radians(PLANTA["giro"]), 3)},
        # (anotaciones) el puente lleva acera solo del lado este, donde llega la acera de la calle de las residencias
        "puente": {"centro": a_metros(*PUENTE["centro"]), "eje": [a_metros(x, y) for x, y in PUENTE["eje"]], "acera": "este"},
        "elementos": [{**el, "id": NUMERACION.get(el["id"]) if el.get("id") else el.get("id")} for el in elementos],
        "numeros": {"pista": NUMERACION[19], "porton_residencias": NUMERACION[20], "picnic": NUMERACION[21],
                    "planta": NUMERACION[22], "puente": NUMERACION[23], "parqueo_piscina": NUMERACION[33]},
        "pista": {"centro": a_metros(float(cx_pista), float(cy_pista)), "eje": round(float(eje_pista), 3), "medio_cancha": round(float(medio_cancha), 1)},
    }
    datos["salidas"] = salidas_carretera(np.clip(suelo, 0, 255).astype(np.uint8), datos["terreno"])
    (RAIZ / "src/data/campus3d.json").write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")
    print(f"Maqueta: {len(EDIFICIOS)} edificios, {len(arboles)} árboles, {sum(len(c) for c in cerca)} puntos de cerca en {len(cerca)} tramos, textura {w}x{h}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
