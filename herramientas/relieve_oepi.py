#!/usr/bin/env python3
"""Extrae el relieve y el cauce de la quebrada del plano de conjunto de la OEPI (2010).

Uso:
    python3 herramientas/relieve_oepi.py [herramientas/fuentes/plano-oepi-2010.pdf]

El plano («Conjunto, Sede de Limón», OEPI, AutoCAD, escala 1:1500) trae curvas de nivel cada 0,5 m y
puntos de cota. Los números son trazos de AutoCAD, no texto: las cotas se leyeron a ojo sobre el plano
ampliado y quedan aquí escritas (COTAS y ETIQUETAS). El script toma del PDF la posición de los puntos,
las curvas y las dos orillas de la quebrada, les asigna altura y guarda todo en coordenadas del plano
(puntos tipográficos de la página girada) en herramientas/fuentes/relieve-oepi.json. campus3d.py lo pasa
a la maqueta con los puntos de control (edificios que están en los dos planos).

La infraestructura del plano es vieja (no tiene el auditorio ni la entrada actual): de él solo se usan el
relieve y el trazado de la quebrada.

Necesita pdfplumber, NumPy y SciPy.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pdfplumber
from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "herramientas" / "fuentes" / "relieve-oepi.json"

# Cota de cada punto (índice del marcador en el orden en que pdfplumber entrega las curvas → metros).
# Los que tapa una calle o cuya cifra no se distingue quedan fuera.
COTAS = {
    1: 101.20, 2: 100.6, 3: 99.64, 4: 101.23, 5: 100.23, 6: 100.19, 7: 100.2, 8: 99.03, 9: 99.00, 10: 100.11,
    12: 99.76, 14: 99.3, 17: 99.15, 18: 99.16, 20: 98.80, 23: 98.15, 24: 98.14, 25: 96.6, 26: 97.04, 27: 97.02,
    28: 97.02, 29: 98.33, 30: 98.35, 32: 95.84, 35: 94.81, 36: 96.9, 37: 96.68, 38: 96.71, 39: 96.71, 40: 96.63,
    41: 96.95, 42: 97.56, 44: 97.56, 45: 96.33, 46: 96.61, 47: 96.41, 48: 96.21, 49: 96.4, 51: 95.96, 54: 96.20,
    61: 96.08, 62: 96.13, 64: 95.67, 65: 95.43, 66: 99.53, 67: 99.64, 68: 99.89, 69: 99.95, 70: 99.74, 71: 97.92,
    72: 97.76, 73: 98.12, 75: 97.40, 76: 97.09, 78: 96.88, 80: 96.18, 81: 96.08, 84: 96.11, 86: 94.58, 87: 94.40,
    88: 96.31, 90: 95.39, 91: 95.15, 93: 95.60, 94: 95.37, 97: 93.95, 98: 93.54, 99: 92.73, 101: 95.84, 102: 95.72,
    104: 95.24, 105: 96.04, 108: 96.01, 109: 95.87, 110: 95.74, 111: 95.82, 112: 95.95, 113: 95.93, 115: 95.05,
    116: 95.28, 117: 95.37, 118: 95.16, 120: 95.88, 122: 95.60, 123: 95.11, 124: 95.34, 125: 94.67, 126: 94.60,
    127: 94.41, 128: 94.49, 129: 91.11, 131: 90.27, 132: 94.07, 134: 93.64, 135: 94.96, 136: 89.02, 137: 89.36,
    138: 88.84, 141: 89.72, 142: 90.74, 143: 91.62, 144: 92.28, 145: 93.07, 146: 94.14, 147: 94.94, 148: 95.31,
    149: 101.59, 151: 100.47, 152: 96.00, 153: 89.82, 154: 95.71, 155: 96.80, 157: 95.30, 159: 95.97, 160: 95.09,
    163: 97.65, 164: 99.81, 165: 102.96, 166: 105.63, 167: 106.54, 168: 105.89, 169: 100.45, 170: 103.24,
    171: 99.81, 172: 97.80, 173: 96.32, 174: 96.91, 175: 97.08, 176: 97.09, 177: 97.31, 179: 104.57, 180: 103.86,
    181: 104.87, 182: 102.80, 183: 100.91, 184: 99.55, 185: 96.70, 186: 97.82, 187: 100.94, 188: 100.10,
    189: 97.88, 190: 96.61, 191: 106.29, 192: 105.77, 193: 106.65, 194: 103.31, 195: 101.64, 196: 99.99,
    197: 101.95, 198: 103.85, 199: 105.40, 200: 104.48, 201: 101.31, 202: 98.55, 203: 97.90, 204: 100.74,
    205: 99.26, 206: 99.63, 208: 97.62, 209: 97.50, 210: 97.22, 211: 96.30, 212: 97.32, 213: 98.25, 214: 100.59,
    215: 101.03, 216: 99.93, 217: 99.75, 218: 101.92, 219: 104.54, 220: 105.44, 221: 105.68, 222: 105.60,
    223: 105.63, 224: 104.06, 225: 102.51, 226: 99.76, 227: 100.16, 228: 102.88, 229: 104.35, 230: 94.98,
    231: 95.04, 232: 94.34, 233: 95.52, 234: 89.36, 235: 89.36,
}

# Rótulos de curvas de nivel donde no hay puntos de cota (zona de la quebrada al este y residencias):
# (x, y, cota), en puntos de la página, junto al extremo de la curva que rotulan
ETIQUETAS = [
    (855.0, 355.0, 95.0), (857.5, 357.8, 94.5), (857.3, 369.1, 93.0), (861.6, 376.5, 92.0), (861.9, 386.9, 90.0),
    (860.9, 392.5, 88.5), (867.5, 407.1, 89.5), (871.3, 414.6, 90.5), (872.5, 421.8, 91.5), (872.3, 437.5, 93.0),
    (876.5, 457.5, 94.5), (876.5, 462.5, 95.0), (844.1, 324.4, 99.0), (855.0, 328.8, 99.5),
    (881.9, 484.1, 97.0), (883.1, 494.0, 98.0), (886.9, 501.9, 99.5), (885.0, 508.1, 101.0), (887.5, 528.5, 102.0),
    (757.5, 521.5, 102.0), (759.4, 532.1, 102.5), (759.4, 545.9, 103.0), (756.3, 510.6, 101.5),
    (904.4, 599.4, 102.5), (905.6, 607.3, 103.5), (920.0, 666.3, 103.5), (906.3, 676.3, 104.0), (893.8, 689.4, 104.5),
    (876.9, 700.0, 105.0), (868.1, 707.5, 105.5), (797.5, 658.1, 105.5), (773.8, 608.1, 104.0),
    (746.9, 378.1, 95.5), (748.1, 399.0, 96.5), (749.4, 421.0, 97.5), (749.8, 440.3, 98.5), (749.4, 460.0, 99.5),
    (747.5, 482.5, 100.5), (755.3, 502.5, 101.5),
]

# Lo que no son curvas de nivel aunque se dibuje con la misma línea: edificios, piscina, la rotonda de la
# biblioteca, el cajetín. (x0, y0, x1, y1) en puntos.
EXCLUIR = [(540, 160, 640, 300), (640, 220, 715, 310), (690, 100, 880, 180), (760, 190, 880, 330),
           (90, 440, 320, 590), (770, 510, 880, 680), (0, 0, 130, 792), (930, 0, 1224, 792), (0, 0, 1224, 40)]

# Edificios que están en el plano y en la maqueta: centro en el plano (pt) y centro en la maqueta (m)
CONTROL = [
    ("Oficinas (16)", (588.6, 186.7), (20.48, -83.41)),
    ("Aulas (15)", (587.9, 233.6), (20.48, -58.66)),
    ("Aulas (14)", (580.4, 279.4), (20.48, -33.91)),
    ("Piscina (17)", (678.8, 262.2), (73.25, -47.5)),
    ("Gimnasio (27)", (819.0, 258.1), (145.25, -52.0)),
    ("Biblioteca (24)", (731.5, 145.3), (102.56, -102.24)),
    ("Módulo administrativo (1 y 2)", (179.6, 513.6), (-166.6, 64.0)),
    ("Residencias (30)", (823.3, 589.7), (153.25, 100.0)),
]


def largo(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def remuestrear(pts, paso):
    pts = np.asarray(pts, float)
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(pts, axis=0).T))]
    if d[-1] == 0:
        return pts[:1]
    s = np.linspace(0, d[-1], max(2, int(d[-1] / paso) + 1))
    return np.c_[np.interp(s, d, pts[:, 0]), np.interp(s, d, pts[:, 1])]


def excluida(pts):
    x, y = np.mean(pts, axis=0)
    return any(a <= x <= c and b <= y <= d for a, b, c, d in EXCLUIR)


def quebrada(pagina):
    """Eje del cauce: promedio de las dos orillas (línea doble de 2,28 pt) de cada tramo, encadenados."""
    orillas = [o for o in pagina.lines + pagina.curves
               if round(o.get("linewidth") or 0, 2) == 2.28 and 7 <= len(o["pts"]) < 40 and largo(o["pts"]) > 15
               and math.dist(o["pts"][0], o["pts"][-1]) > 5
               and 330 < o["x0"] and o["x1"] < 880 and 240 < o["top"] and o["bottom"] < 470]
    caja = lambda o: np.array([o["x0"], o["top"], o["x1"], o["bottom"]])
    tramos, usadas = [], set()
    for i, a in enumerate(orillas):   # las dos orillas de un tramo tienen casi el mismo rectángulo envolvente
        if i in usadas:
            continue
        j = min((j for j in range(len(orillas)) if j != i and j not in usadas),
                key=lambda j: np.abs(caja(a) - caja(orillas[j])).sum())
        usadas |= {i, j}
        A, B = remuestrear(a["pts"], 1.0), remuestrear(orillas[j]["pts"], 1.0)
        if math.dist(A[0], B[0]) > math.dist(A[0], B[-1]):
            B = B[::-1]
        n = max(len(A), len(B))
        A, B = remuestrear(A, largo(A) / (n - 1)), remuestrear(B, largo(B) / (n - 1))
        n = min(len(A), len(B))
        tramos.append((A[:n] + B[:n]) / 2)
    # se encadenan desde la punta norte del tramo oeste (la que tiene menor y entre las de x menor)
    k0 = min(range(len(tramos)), key=lambda k: max(tramos[k][:, 0]))
    inicio = tramos.pop(k0)
    cadena = [inicio if inicio[0][1] < inicio[-1][1] else inicio[::-1]]
    while tramos:
        fin = cadena[-1][-1]
        k = min(range(len(tramos)), key=lambda k: min(math.dist(fin, tramos[k][0]), math.dist(fin, tramos[k][-1])))
        t = tramos.pop(k)
        cadena.append(t if math.dist(fin, t[0]) <= math.dist(fin, t[-1]) else t[::-1])
    return remuestrear(np.vstack(cadena), 2.0)


def main(pdf):
    pagina = pdfplumber.open(pdf).pages[0]
    marcas = [((c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2) for c in pagina.curves
              if abs((c["x1"] - c["x0"]) - 1.08) < 0.05 and abs((c["bottom"] - c["top"]) - 1.08) < 0.05]
    assert len(marcas) == 243, f"se esperaban 243 puntos de cota y hay {len(marcas)}"
    puntos = np.array([(*marcas[i], z) for i, z in COTAS.items()])
    anclas = np.vstack([puntos, np.array(ETIQUETAS)])

    candidatas = []
    for o in pagina.curves + pagina.lines:
        if round(o.get("linewidth") or 0, 2) != 0.24 or len(o["pts"]) < 5:
            continue
        pts = o["pts"]
        if largo(pts) < 15 or excluida(pts):
            continue
        candidatas.append(remuestrear(pts, 1.5))

    # cada rótulo se asigna a la curva cuyo extremo le queda más cerca
    alturas = [None] * len(candidatas)
    for x, y, z in ETIQUETAS:
        d, k = min((min(math.dist((x, y), c[0]), math.dist((x, y), c[-1])), k) for k, c in enumerate(candidatas))
        if d < 6:
            alturas[k] = z
    # el resto se ajusta a la media vuelta más cercana a lo que dan los puntos ya conocidos, solo si la curva
    # corre a nivel (poca variación a lo largo); en tres pasadas, para que las curvas ya resueltas ayuden
    for _ in range(3):
        conocidos = [anclas] + [np.c_[c, np.full(len(c), z)] for c, z in zip(candidatas, alturas) if z is not None]
        P = np.vstack(conocidos)
        lin = LinearNDInterpolator(P[:, :2], P[:, 2])
        for k, c in enumerate(candidatas):
            if alturas[k] is not None:
                continue
            v = lin(c)
            v = v[~np.isnan(v)]
            if len(v) < 0.7 * len(c):
                continue
            if np.std(v) < 0.45:
                alturas[k] = round(float(np.median(v)) * 2) / 2
    curvas = [{"z": z, "pts": np.round(c, 1).tolist()} for c, z in zip(candidatas, alturas) if z is not None]

    q = quebrada(pagina)
    salida = {
        "nota": "Relieve y quebrada del plano de conjunto de la OEPI (2010), en puntos de la página. "
                "Generado por herramientas/relieve_oepi.py.",
        "puntos": np.round(puntos, 2).tolist(),
        "curvas": curvas,
        "quebrada": np.round(q, 1).tolist(),
        "control": [{"nombre": n, "plano": list(p), "maqueta": list(m)} for n, p, m in CONTROL],
    }
    SALIDA.write_text(json.dumps(salida, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(puntos)} puntos, {len(curvas)} de {len(candidatas)} curvas, quebrada de {len(q)} puntos → {SALIDA}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else RAIZ / "herramientas" / "fuentes" / "plano-oepi-2010.pdf")
