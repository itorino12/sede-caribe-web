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
CAUCE = {"hondo": 1.3, "ancho": 3.0, "borde": 3.5}   # cauce de la quebrada (m)
CRUCE_PUENTE = (758.5, 342.8)   # en el plano: donde la quebrada pasa bajo la calle de residencias (el puente)
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
    cola = np.array([(ex + 22, ez - 7), (ex + 45, ez - 12), (ex + 70, ez - 14), (borde_x + 12, ez - 15)])
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


def malla(terreno, muestras_xyz, plataformas, cauce, n_plano, calles):
    """Alturas (m, relativas a REFERENCIA) en una malla de PASO metros sobre el terreno de la maqueta.
    plataformas: polígonos [(x, z), ...] en metros; cada uno queda a nivel (edificios, explanada, pista...).
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

    # plataformas a nivel bajo los edificios, con un talud suave alrededor
    for pol in plataformas:
        m = np.zeros(X.shape, np.uint8)
        cv2.fillPoly(m, [a_celda(pol)], 1)
        m = m > 0
        if not m.any():
            continue
        nivel = float(np.median(h[m]))
        d = distance_transform_edt(~m) * PASO
        w = np.clip(1 - (d - 2.0) / 7.0, 0, 1)
        w = w * w * (3 - 2 * w)
        h = h * (1 - w) + nivel * w

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
    w[calles_m] = 0
    w = gaussian_filter(w, 0.6)
    h = np.where(w > 0, np.minimum(h, h * (1 - w) + nivel_cauce * w), h)
    return {"x": float(xs[0]), "z": float(zs[0]), "paso": PASO, "nx": nx, "nz": nz}, h.astype(np.float32), fondo


def codificar(info, h):
    """Alturas en decímetros (un byte con signo por celda: ±12,7 m), por filas de oeste a este y de norte a sur,
    en base64, para el JSON de la maqueta."""
    import base64
    assert np.abs(h).max() < 12.7, "el relieve se sale de ±12,7 m: hay que cambiar la unidad"
    dm = np.round(h * 10).astype(np.int8)
    return {**info, "unidad": 0.1, "datos": base64.b64encode(dm.tobytes()).decode("ascii")}
