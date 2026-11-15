#!/usr/bin/env python3
"""Corta la narración del recorrido (un solo audio de ElevenLabs) en un audio por lugar.

    python3 herramientas/cortar_narracion.py PARTE1.mp3 [PARTE2.mp3 …] [--musica MUSICA.mp3] [--probar]

ElevenLabs acepta hasta 5000 caracteres por audio, así que el guion (herramientas/fuentes/narracion/guion.txt:
bienvenida, lugares 1 a 37 y despedida) se genera en dos partes: la primera hasta el lugar 19 y la segunda desde
el 20 (constante PARTE1). Entre una fila y otra hay una pausa larga.
Cada audio se corta en sus pausas más largas y se revisa que cada
trozo dure lo que se espera por su número de palabras; si alguno no cuadra, no escribe nada.
Salida: src/assets/media/narracion/{inicio,lugar-01…lugar-37,fin}.m4a y las duraciones en
src/assets/js/recorrido-narracion.js. Con --musica, además src/assets/media/visita-musica.m4a.
Con --probar solo muestra los cortes.
"""
import argparse
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GUION = RAIZ / "herramientas" / "fuentes" / "narracion" / "guion.txt"
SALIDA = RAIZ / "src" / "assets" / "media" / "narracion"
DURACIONES = RAIZ / "src" / "assets" / "js" / "recorrido-narracion.js"
MUSICA = RAIZ / "src" / "assets" / "media" / "visita-musica.m4a"


def guion():
    filas = []
    for linea in GUION.read_text(encoding="utf-8").splitlines():
        if linea.strip():
            clave, texto = linea.split("\t", 1)
            filas.append((clave, texto))
    return filas


def nombre(clave):
    return f"lugar-{int(clave):02d}" if clave.isdigit() else clave


def duracion(archivo):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(archivo)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def silencios(archivo, umbral_db=-40, minimo=0.5):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(archivo), "-af", f"silencedetect=noise={umbral_db}dB:d={minimo}",
                        "-f", "null", "-"], capture_output=True, text=True)
    inicios = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", r.stderr)]
    finales = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", r.stderr)]
    return list(zip(inicios, finales))


def cortes(archivo, palabras):
    """Tramos del audio, uno por fila del guion (palabras = nº de palabras de cada fila).

    La pausa entre filas sale de unos 1,3 s, pero alguna puede salir más corta; por eso se elige el conjunto de
    pausas (de 0,3 s o más) que reparte el audio en tramos proporcionales a las palabras de cada fila, con
    preferencia por las pausas largas (programación dinámica)."""
    n = len(palabras)
    total = duracion(archivo)
    sil = [s for s in silencios(archivo, -35, 0.3) if s[0] > 0.3 and s[1] < total - 0.3]
    if len(sil) < n - 1:
        sys.exit(f"Hay {len(sil)} pausas y se necesitan {n - 1}. ¿Es el audio correcto?")
    seg_por_palabra = (total - 1.3 * (n - 1)) / sum(palabras)
    INF = float("inf")
    # mejor[i][k]: costo mínimo de cortar en la pausa i habiendo cerrado las filas 0..k
    mejor = [[INF] * n for _ in sil]
    atras = [[None] * n for _ in sil]
    for i, (a, b) in enumerate(sil):
        esperado = palabras[0] * seg_por_palabra
        mejor[i][0] = ((a - esperado) / esperado) ** 2 - 0.5 * min(b - a, 1.5)
        for k in range(1, n - 1):
            for h in range(i):
                if mejor[h][k - 1] == INF:
                    continue
                largo = a - sil[h][1]
                esperado = palabras[k] * seg_por_palabra
                costo = mejor[h][k - 1] + ((largo - esperado) / esperado) ** 2 - 0.5 * min(b - a, 1.5)
                if costo < mejor[i][k]:
                    mejor[i][k], atras[i][k] = costo, h
    fin = INF; mejor_i = None
    for i, (a, b) in enumerate(sil):
        if mejor[i][n - 2] == INF:
            continue
        largo = total - b
        esperado = palabras[n - 1] * seg_por_palabra
        costo = mejor[i][n - 2] + ((largo - esperado) / esperado) ** 2
        if costo < fin:
            fin, mejor_i = costo, i
    if mejor_i is None:
        sys.exit("No se pudo repartir el audio en las filas del guion.")
    elegidas, i = [], mejor_i
    for k in range(n - 2, -1, -1):
        elegidas.append(sil[i]); i = atras[i][k]
    elegidas.reverse()
    tramos, desde = [], 0.0
    for a, b in elegidas:
        tramos.append((max(0.0, desde), a + 0.25))
        desde = b - 0.15
    tramos.append((desde, total))
    return tramos


PARTE1 = 20   # filas de la primera parte: bienvenida y lugares 1 a 19; el resto va en la segunda


def repartir(archivos, filas):
    if len(archivos) == 1:
        return [(archivos[0], filas)]
    if len(archivos) != 2:
        sys.exit("Solo se admiten una o dos partes.")
    return [(archivos[0], filas[:PARTE1]), (archivos[1], filas[PARTE1:])]


def revisar(tramos, filas):
    # segundos por palabra de cada trozo: si uno se aleja mucho de los demás, el corte quedó corrido
    tasas = [(b - a) / len(t.split()) for (a, b), (_, t) in zip(tramos, filas)]
    med = statistics.median(tasas)
    malos = []
    for ((a, b), (clave, texto)), tasa in zip(zip(tramos, filas), tasas):
        aviso = "" if 0.6 * med <= tasa <= 1.6 * med else "  ← no cuadra"
        if aviso:
            malos.append(clave)
        print(f"{clave:>6}  {a:7.2f}–{b:7.2f}  {b - a:5.2f} s  {len(texto.split()):3d} palabras{aviso}")
    return malos


def codificar(origen, destino, desde=None, hasta=None, filtros="", canales=1, kbps=64):
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y"]
    if desde is not None:
        cmd += ["-ss", f"{desde:.3f}", "-to", f"{hasta:.3f}"]
    cmd += ["-i", str(origen), "-af", filtros, "-ac", str(canales), "-ar", "44100", "-c:a", "aac", "-b:a", f"{kbps}k",
            "-movflags", "+faststart", str(destino)]
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("narracion", type=Path, nargs="+")
    ap.add_argument("--musica", type=Path)
    ap.add_argument("--probar", action="store_true")
    a = ap.parse_args()

    filas = guion()
    partes = repartir(a.narracion, filas)
    tramos, filas_orden = [], []
    for archivo, parte in partes:
        tramos += [(archivo, d, h) for d, h in cortes(archivo, [len(t.split()) for _, t in parte])]
        filas_orden += parte
    malos = revisar([(d, h) for _, d, h in tramos], filas_orden)
    if malos:
        sys.exit(f"Cortes dudosos en: {', '.join(malos)}. No se escribió nada.")
    if a.probar:
        return
    filas = filas_orden

    SALIDA.mkdir(parents=True, exist_ok=True)
    durs = {}
    for (origen, desde, hasta), (clave, _) in zip(tramos, filas):
        destino = SALIDA / f"{nombre(clave)}.m4a"
        largo = hasta - desde
        codificar(origen, destino, desde, hasta,
                  f"loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.05,afade=t=out:st={max(0, largo - 0.2):.3f}:d=0.2")
        durs[int(clave) if clave.isdigit() else clave] = round(duracion(destino), 2)
    cuerpo = ",\n".join(f"  {json.dumps(k) if isinstance(k, str) else k}: {v}" for k, v in durs.items())
    DURACIONES.write_text("// Lo escribe herramientas/cortar_narracion.py: duración en segundos de cada audio de "
                          "assets/media/narracion/.\n"
                          f"export const NARRACION = {{\n{cuerpo},\n}};\n", encoding="utf-8")
    print(f"{len(durs)} audios en {SALIDA.relative_to(RAIZ)}; duraciones en {DURACIONES.relative_to(RAIZ)}")

    if a.musica:
        largo = duracion(a.musica)
        codificar(a.musica, MUSICA, filtros=f"loudnorm=I=-20:TP=-2,afade=t=in:d=2,afade=t=out:st={largo - 3:.3f}:d=3",
                  canales=2, kbps=96)
        print(f"Música: {MUSICA.relative_to(RAIZ)} ({duracion(MUSICA):.0f} s)")


if __name__ == "__main__":
    main()
