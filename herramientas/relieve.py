"""Relieve de la maqueta a partir de herramientas/fuentes/relieve-oepi.json (ver relieve_oepi.py).

El plano de la OEPI está a escala; el croquis de la maqueta no (ensanchado y esquemático). Se pasa del uno
al otro con una deformación suave (placa delgada) que lleva los edificios comunes a su lugar en la maqueta.
Con los puntos de cota y las curvas ya en metros de la maqueta se arma una malla de alturas: dentro de la
zona levantada se interpola; fuera, el terreno sigue suave (extensión armónica) y llega a cero en el borde
de la maqueta, donde empieza el entorno plano. Los edificios quedan sobre plataformas a nivel y la quebrada
lleva su cauce, que siempre baja aguas abajo.
"""
import json
import math
from pathlib import Path

import cv2
import numpy as np
from scipy.interpolate import LinearNDInterpolator, RBFInterpolator
from scipy.ndimage import distance_transform_edt, gaussian_filter

FUENTE = Path(__file__).resolve().parent / "fuentes" / "relieve-oepi.json"
REFERENCIA = 96.0     # cota (m) que queda en y = 0: la explanada de las aulas y la piscina
PASO = 2.0            # metros por celda de la malla de alturas
CAUCE = {"hondo": 1.3, "ancho": 3.0, "borde": 2.5}   # cauce de la quebrada (m)
# Puntos de control de la quebrada (plano en pt → maqueta en m). El puente: donde la quebrada pasa bajo la calle
# de residencias. Al este del puente, el cauce va por el medio de las dos mallas que lo bordean (anotaciones de
# la Sede, en campus3d.py): el punto medio entre ellas a x = 130, 150 y 170 m.
CRUCE_PUENTE = (758.5, 342.8)
# donde pasa bajo la calle de entrada (alcantarilla del plano) ↔ el paso rayado sobre la alcantarilla (19), donde el
# pasillo techado cruza la calle
CRUCE_ENTRADA = ((355.5, 390.0), (-72.0, 5.65))
ENTRE_MALLAS = [((788.0, 358.8), (130.0, 4.04)), ((826.7, 377.1), (150.0, 6.70)), ((865.6, 395.5), (170.0, 9.48))]
ORILLA = 40.0         # ancho de la franja en que el relieve baja a cero junto al borde de la maqueta (m)


def cargar():
    return json.loads(FUENTE.read_text(encoding="utf-8"))


def registro(datos, extra=()):
    """Función plano (pt) → maqueta (m), con los puntos de control del plano y los que se agreguen."""
    ctrl = [(c["plano"], c["maqueta"]) for c in datos["control"]] + list(extra)
    P = np.array([p for p, _ in ctrl], float)
    M = np.array([m for _, m in ctrl], float)
    rbf = RBFInterpolator(P, M, kernel="thin_plate_spline", degree=1, smoothing=2.0)
    return lambda pts: rbf(np.atleast_2d(np.asarray(pts, float)))


def cauce(datos, a_maqueta, borde_x):
    """Eje de la quebrada en metros de la maqueta, de aguas arriba a aguas abajo, y cuántos puntos salen del plano.
    El plano lo dibuja hasta la cañada al este de residencias; de ahí sigue al este-noreste, entre las mallas que
    la bordean, hasta salir de la maqueta (como antes)."""
    q = a_maqueta(datos["quebrada"])
    ex, ez = q[-1]
    # pasa al sur de la esquina de la malla norte (209, −2,6) y al norte de la malla sur, que baja desde (181, 22)
    cola = np.array([(ex + 20, ez - 1.5), (ex + 40, ez - 3.5), (ex + 70, ez - 5.5), (borde_x + 12, ez - 6.5)])
    d = np.hypot(*np.diff(np.vstack([q[-1:], cola]), axis=0).T)
    pts = [q[-1]]
    for (a, b), L in zip(zip(np.vstack([q[-1:], cola])[:-1], cola), d):
        for t in np.arange(3.0, L + 1e-6, 3.0):
            pts.append(a + (b - a) * t / L)
    cola = np.array(pts[1:])
    todo = np.vstack([q, cola])
    suave = todo.copy()
    for k in range(len(q) - 2, len(todo)):   # la unión y la cola, suavizadas (media móvil)
        suave[k] = todo[max(0, k - 3):k + 4].mean(axis=0)
    return suave, len(q)


def con_tramo_arriba(cauce_m, n_plano, tramo):
    """Cambia el cauce aguas arriba de la alcantarilla de la calle de entrada (CRUCE_ENTRADA) por un trazado dado
    (anotaciones de la Sede), en metros, de aguas arriba hacia la alcantarilla. Puntos cada ~3 m y la unión suavizada."""
    c = np.asarray(cauce_m, float)
    k = int(np.argmin(np.hypot(*(c - np.asarray(CRUCE_ENTRADA[1], float)).T)))
    t = np.vstack([np.asarray(tramo, float), c[k:k + 1]])
    largo = np.r_[0, np.cumsum(np.hypot(*np.diff(t, axis=0).T))]
    fino = np.linspace(0, largo[-1], max(2, int(largo[-1] / 3.0)) + 1)[:-1]
    arriba = np.c_[np.interp(fino, largo, t[:, 0]), np.interp(fino, largo, t[:, 1])]
    todo = np.vstack([arriba, c[k:]])
    n = len(arriba)
    suave = todo.copy()
    for i in range(max(1, n - 3), min(len(todo) - 1, n + 3)):
        suave[i] = todo[max(0, i - 2):i + 3].mean(axis=0)
    return suave, n_plano - k + n


def muestras(datos, a_maqueta):
    """Puntos (x, z, cota) en metros de la maqueta: puntos de cota y curvas de nivel."""
    xyz = [np.asarray(datos["puntos"], float)]
    for c in datos["curvas"]:
        p = np.asarray(c["pts"], float)
        xyz.append(np.c_[p, np.full(len(p), c["z"])])
    P = np.vstack(xyz)
    return np.c_[a_maqueta(P[:, :2]), P[:, 2]]


def armonica(h, fijo, vueltas=4000):
    """Completa las celdas libres resolviendo Laplace (las fijas no cambian). Multimalla sencilla."""
    if min(h.shape) > 24:
        chico = cv2.resize(np.where(fijo, h, 0), (h.shape[1] // 2, h.shape[0] // 2), interpolation=cv2.INTER_AREA)
        peso = cv2.resize(fijo.astype(np.float32), (h.shape[1] // 2, h.shape[0] // 2), interpolation=cv2.INTER_AREA)
        fijo_c = peso > 0.2
        chico = np.where(fijo_c, chico / np.maximum(peso, 1e-6), 0)
        chico = armonica(chico, fijo_c, vueltas)
        inicio = cv2.resize(chico, (h.shape[1], h.shape[0]), interpolation=cv2.INTER_LINEAR)
        h = np.where(fijo, h, inicio)
        vueltas = 200
    h = h.copy()
    for _ in range(vueltas):
        p = np.pad(h, 1, mode="edge")
        prom = (p[:-2, 1:-1] + p[2:, 1:-1] + p[1:-1, :-2] + p[1:-1, 2:]) / 4
        h = np.where(fijo, h, prom)
    return h


def malla(terreno, muestras_xyz, plataformas, cauce, n_plano, calles, rampas=(), llanos=()):
    """Alturas (m, relativas a REFERENCIA) en una malla de PASO metros sobre el terreno de la maqueta.
    plataformas: lista de {"pol", "subir", "suave", "nivel" o "como"} (ver abajo): edificios, explanada, pista...
    rampas: lista de {"puntos", "ancho", "desde", "hasta", "cima"}: franjas que suben de una plataforma a otra.
    llanos: lista de {"pol", "nivel", "suave"}: zonas que quedan llanas a ese nivel (calles incluidas); se aplican
    después de las calles junto a la quebrada y antes del cauce, que se sigue excavando.
    cauce, n_plano: eje de la quebrada (m) y cuántos de sus puntos vienen del plano (en ellos el fondo
    siempre baja; en la cola, que sale de la maqueta, sigue al terreno).
    calles: máscara (uint8) de las calles sobre el terreno de la maqueta, a cualquier resolución: ahí el
    cauce va entubado y no se excava."""
    nx = int(round(terreno["ancho"] / PASO)) + 1
    nz = int(round(terreno["largo"] / PASO)) + 1
    xs = terreno["x"] + np.arange(nx) * PASO
    zs = terreno["z"] + np.arange(nz) * PASO
    X, Z = np.meshgrid(xs, zs)
    a_celda = lambda pol: np.round([((x - xs[0]) / PASO, (z - zs[0]) / PASO) for x, z in pol]).astype(np.int32)
    calles_m = cv2.resize(calles, (nx, nz), interpolation=cv2.INTER_AREA) > 60

    pts = muestras_xyz
    dentro = (pts[:, 0] > xs[0]) & (pts[:, 0] < xs[-1]) & (pts[:, 1] > zs[0]) & (pts[:, 1] < zs[-1])
    pts = pts[dentro]
    lin = LinearNDInterpolator(pts[:, :2], pts[:, 2] - REFERENCIA)
    h = lin(X, Z)
    # solo se confía en la interpolación cerca de los datos (no en triángulos largos entre zonas levantadas)
    cerca = np.zeros(X.shape, bool)
    ij = np.c_[np.round((pts[:, 1] - zs[0]) / PASO), np.round((pts[:, 0] - xs[0]) / PASO)].astype(int)
    cerca[ij[:, 0], ij[:, 1]] = True
    dist = distance_transform_edt(~cerca) * PASO
    conocido = ~np.isnan(h) & (dist < 22)
    h = np.where(conocido, h, 0.0)
    # borde de la maqueta: cero (el entorno es plano)
    borde = np.zeros(X.shape, bool)
    borde[0, :] = borde[-1, :] = borde[:, 0] = borde[:, -1] = True
    h[borde] = 0.0
    h = armonica(h, conocido | borde)
    h = gaussian_filter(h, 1.0)
    # franja junto al borde: baja suave a cero
    d_borde = np.minimum.reduce([X - xs[0], xs[-1] - X, Z - zs[0], zs[-1] - Z])
    t = np.clip(d_borde / ORILLA, 0, 1)
    h *= t * t * (3 - 2 * t)

    # plataformas a nivel (en orden: la que viene después manda), con un talud suave alrededor. Cada una es
    # {"pol": [(x, z)...], "subir": m sobre el nivel del terreno (loma), "suave": ancho del talud (m)}; el nivel es
    # la mediana del terreno bajo ella, salvo que traiga "nivel", "nivel_de" (puntos) o "como" (índice de otra)
    niveles = []
    for pl in plataformas:
        m = np.zeros(X.shape, np.uint8)
        cv2.fillPoly(m, [a_celda(pl["pol"])], 1)
        m = m > 0
        if not m.any():
            niveles.append(None)
            continue
        if "como" in pl:   # al nivel de otra; con «bajar», al pie de su loma
            nivel = niveles[pl["como"]] - (plataformas[pl["como"]].get("subir", 0.0) if pl.get("bajar") else 0.0)
        elif "nivel_de" in pl:   # mediana del terreno en esos puntos (la plaza, para la excavación del auditorio)
            ij = a_celda(pl["nivel_de"])
            nivel = float(np.median(h[ij[:, 1].clip(0, nz - 1), ij[:, 0].clip(0, nx - 1)]))
        else:
            nivel = pl.get("nivel", float(np.median(h[m]))) + pl.get("subir", 0.0)
        niveles.append(nivel)
        suave = pl.get("suave", 7.0)
        d = distance_transform_edt(~m) * PASO
        w = np.clip(1 - (d - min(2.0, suave)) / max(suave, 1e-3), 0, 1) if suave > 0 else (d <= 0).astype(float)
        w = w * w * (3 - 2 * w)
        h = h * (1 - w) + nivel * w

    # calles junto a la quebrada: bajan con el terreno hasta el puente o la alcantarilla (el puente es bajo), pero
    # con la pendiente repartida: la altura de la calle es un promedio suave (≈ 12 m) solo entre celdas de calle
    eje_q = np.zeros(X.shape, np.uint8)
    cq = np.asarray(cauce, float)
    eje_q[np.clip(np.round((cq[:, 1] - zs[0]) / PASO).astype(int), 0, nz - 1),
          np.clip(np.round((cq[:, 0] - xs[0]) / PASO).astype(int), 0, nx - 1)] = 1
    cerca_q = calles_m & (distance_transform_edt(eje_q == 0) * PASO < 40)
    if cerca_q.any():
        calle = calles_m.astype(float)
        suave = gaussian_filter(h * calle, 6.0) / np.maximum(gaussian_filter(calle, 6.0), 1e-6)
        h = np.where(cerca_q, suave, h)
        # orillas: un talud corto entre la calle y el terreno de al lado
        d_c, idx = distance_transform_edt(~cerca_q, return_indices=True)
        w = np.clip(1 - d_c * PASO / 6, 0, 1)
        w = w * w * (3 - 2 * w)
        h = np.where(~cerca_q & (w > 0), h * (1 - w) + h[idx[0], idx[1]] * w, h)

    for ll in llanos:
        m = np.zeros(X.shape, np.uint8)
        cv2.fillPoly(m, [a_celda(ll["pol"])], 1)
        d = distance_transform_edt(m == 0) * PASO
        w = np.clip(1 - d / max(ll.get("suave", 8.0), 1e-3), 0, 1)
        w = w * w * (3 - 2 * w)
        h = h * (1 - w) + ll["nivel"] * w
    # cauce: el fondo baja siempre aguas abajo; se excava salvo bajo las calles (alcantarillas y puente)
    c = np.asarray(cauce, float)
    ci = np.clip(np.round((c[:, 1] - zs[0]) / PASO).astype(int), 0, nz - 1)
    cj = np.clip(np.round((c[:, 0] - xs[0]) / PASO).astype(int), 0, nx - 1)
    fondo = h[ci, cj] - CAUCE["hondo"]
    fondo[:n_plano] = np.minimum.accumulate(fondo[:n_plano])
    linea = np.zeros(X.shape, np.uint8)
    linea[ci, cj] = 255
    d_cauce, idx = distance_transform_edt(linea == 0, return_indices=True)
    d_cauce *= PASO
    # nivel del fondo de cada celda: el del punto del eje más cercano
    tabla = np.full(X.shape, np.nan, np.float32)
    for k in range(len(c) - 1, -1, -1):   # si dos puntos caen en la misma celda, queda el de aguas arriba
        tabla[ci[k], cj[k]] = fondo[k]
    nivel_cauce = tabla[idx[0], idx[1]]
    a, b = CAUCE["ancho"] / 2, CAUCE["ancho"] / 2 + CAUCE["borde"]
    w = np.clip((b - d_cauce) / (b - a), 0, 1)
    w = w * w * (3 - 2 * w)
    # junto a las calles el cauce se va haciendo llano (entra al tubo sin dejar la orilla de la calle colgando)
    d_calle = distance_transform_edt(~calles_m) * PASO
    w *= np.clip(d_calle / 8.0, 0, 1)
    w = gaussian_filter(w, 0.8)
    h = np.where(w > 0, np.minimum(h, h * (1 - w) + nivel_cauce * w), h)
    # rampas (el sendero a la explanada): una franja que sube parejo del nivel de una plataforma al de otra
    for r in rampas:
        p = np.asarray(r["puntos"], float)
        largo = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
        t = np.clip(largo / largo[r.get("cima", len(p) - 1)], 0, 1)
        y = niveles[r["desde"]] + (niveles[r["hasta"]] - niveles[r["desde"]]) * t
        fino = np.linspace(0, largo[-1], int(largo[-1] / 0.5) + 2)
        px, pz, py = np.interp(fino, largo, p[:, 0]), np.interp(fino, largo, p[:, 1]), np.interp(fino, largo, y)
        sel = np.zeros(X.shape, np.uint8)
        lin = np.round(np.c_[(px - xs[0]) / PASO, (pz - zs[0]) / PASO]).astype(np.int32)
        cv2.polylines(sel, [lin], False, 1, max(1, int(round(r["ancho"] / PASO))))
        eje = np.ones(X.shape, bool)   # cada celda de la franja toma la altura del punto del eje más cercano
        eje[lin[:, 1].clip(0, nz - 1), lin[:, 0].clip(0, nx - 1)] = False
        _, idx = distance_transform_edt(eje, return_indices=True)
        tabla = np.zeros(X.shape, np.float32)
        tabla[lin[:, 1].clip(0, nz - 1), lin[:, 0].clip(0, nx - 1)] = py
        h = np.where(sel > 0, tabla[idx[0], idx[1]], h)
    return {"x": float(xs[0]), "z": float(zs[0]), "paso": PASO, "nx": nx, "nz": nz}, h.astype(np.float32), fondo


def codificar(info, h):
    """Alturas en decímetros (un byte con signo por celda: ±12,7 m), por filas de oeste a este y de norte a sur,
    en base64, para el JSON de la maqueta."""
    import base64
    assert np.abs(h).max() < 12.7, "el relieve se sale de ±12,7 m: hay que cambiar la unidad"
    dm = np.round(h * 10).astype(np.int8)
    return {**info, "unidad": 0.1, "datos": base64.b64encode(dm.tobytes()).decode("ascii")}
