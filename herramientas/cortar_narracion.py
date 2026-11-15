#!/usr/bin/env python3
"""Corta la narración del recorrido (un solo audio de ElevenLabs) en un audio por lugar.

    python3 herramientas/cortar_narracion.py NARRACION.mp3 [--musica MUSICA.mp3] [--probar]

El audio se generó leyendo herramientas/fuentes/narracion/guion.txt (bienvenida, lugares 1 a 37 y despedida) con
una pausa larga entre uno y otro. Se corta en las N−1 pausas más largas (N = filas del guion) y se revisa que cada
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


def cortes(archivo, n):
    total = duracion(archivo)
    sil = silencios(archivo)
    # se descartan el silencio del principio y el del final
    medio = [s for s in sil if s[0] > 0.3 and s[1] < total - 0.3]
    if len(medio) < n - 1:
        sys.exit(f"Hay {len(medio)} pausas y se necesitan {n - 1}. ¿Es el audio correcto?")
    largos = sorted(sorted(medio, key=lambda s: s[1] - s[0], reverse=True)[: n - 1])
    menor_corte = min(b - a for a, b in largos)
    siguiente = sorted((b - a for a, b in medio), reverse=True)[n - 1] if len(medio) >= n else 0
    print(f"Pausa de corte más corta: {menor_corte:.2f} s; la pausa más larga que no se cortó: {siguiente:.2f} s")
    if siguiente and menor_corte - siguiente < 0.15:
        sys.exit("Las pausas entre lugares no se distinguen bien de las pausas dentro de un texto. Revise el audio.")
    tramos, desde = [], 0.0
    for a, b in largos:
        tramos.append((max(0.0, desde), a + 0.25))
        desde = b - 0.15
    tramos.append((desde, total))
    return tramos


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
    ap.add_argument("narracion", type=Path)
    ap.add_argument("--musica", type=Path)
    ap.add_argument("--probar", action="store_true")
    a = ap.parse_args()

    filas = guion()
    tramos = cortes(a.narracion, len(filas))
    malos = revisar(tramos, filas)
    if malos:
        sys.exit(f"Cortes dudosos en: {', '.join(malos)}. No se escribió nada.")
    if a.probar:
        return

    SALIDA.mkdir(parents=True, exist_ok=True)
    durs = {}
    for (desde, hasta), (clave, _) in zip(tramos, filas):
        destino = SALIDA / f"{nombre(clave)}.m4a"
        largo = hasta - desde
        codificar(a.narracion, destino, desde, hasta,
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
