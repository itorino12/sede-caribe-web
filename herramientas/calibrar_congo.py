#!/usr/bin/env python3
"""Calibra el umbral del congo (CONGO_UMBRAL) con preguntas reales, en la VM y con el servicio en marcha.

    sudo python3 herramientas/calibrar_congo.py [--preguntas herramientas/fuentes/congo-preguntas.txt]

Para cada pregunta muestra la mejor similitud que logra el documento esperado y la mejor de todo el índice.
Al final sugiere un umbral entre lo que el congo no debería contestar (preguntas «-») y lo que sí.
La clave de administración se lee de /etc/sede-web/sede.env (por eso sudo); también sirve CONGO_CLAVE_ADMIN.
"""
import argparse
import json
import os
import statistics
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]


def clave():
    if os.environ.get("CONGO_CLAVE_ADMIN"):
        return os.environ["CONGO_CLAVE_ADMIN"]
    for linea in Path("/etc/sede-web/sede.env").read_text(encoding="utf-8").splitlines():
        if linea.startswith("CONGO_CLAVE_ADMIN="):
            return linea.split("=", 1)[1].strip().strip('"')
    raise SystemExit("falta CONGO_CLAVE_ADMIN")


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--preguntas", default=RAIZ / "herramientas/fuentes/congo-preguntas.txt")
    a.add_argument("--url", default=os.environ.get("CONGO_URL", "http://127.0.0.1:8787"))
    args = a.parse_args()
    casos = []
    for linea in Path(args.preguntas).read_text(encoding="utf-8").splitlines():
        if linea.strip() and not linea.startswith("#"):
            p, _, esperado = (x.strip() for x in linea.partition("|"))
            casos.append((p, esperado))
    pedido = urllib.request.Request(f"{args.url}/api/admin/calibrar", method="POST",
                                    data=json.dumps({"preguntas": [p for p, _ in casos]}).encode(),
                                    headers={"Content-Type": "application/json", "X-Congo-Clave": clave()})
    datos = json.load(urllib.request.urlopen(pedido, timeout=300))
    umbral, propias, ajenas, faltan = datos["umbral"], [], [], []
    print(f"Umbral actual: {umbral}\n")
    for (pregunta, esperado), r in zip(casos, datos["resultados"]):
        todos = r["por_significado"] + r["por_palabras"] + r["por_palabras_sitio"]
        mejor = max((x["similitud"] for x in todos), default=-1)
        if esperado == "-":
            ajenas.append(mejor)
            print(f"{'  sobra' if mejor >= umbral else '  ok   '} {mejor:5.2f}  (ajena)  {pregunta}")
            continue
        del_doc = [x for x in todos if (x["documento"] or "").startswith(esperado)]
        if not del_doc:
            faltan.append(pregunta)
            print(f"  FALTA        {pregunta}  → «{esperado}» no está entre los 8 mejores; arriba: {todos[0]['documento'] if todos else '—'}")
            continue
        sim = max(x["similitud"] for x in del_doc)
        propias.append(sim)
        print(f"{'  ok   ' if sim >= umbral else '  BAJO '} {sim:5.2f}  (mejor {mejor:.2f})  {pregunta}")
    print()
    if propias and ajenas:
        piso = sorted(propias)[max(0, len(propias) // 10 - 1)] if len(propias) >= 10 else min(propias)
        techo = max(ajenas)
        print(f"Documento esperado: mínimo {min(propias):.2f}, mediana {statistics.median(propias):.2f}. Ajenas: máximo {techo:.2f}.")
        if piso > techo:
            print(f"Umbral sugerido: {round((piso + techo) / 2, 2)} (CONGO_UMBRAL en /etc/sede-web/sede.env y reiniciar sede-congo).")
        else:
            print("No hay un umbral que separe bien: las ajenas puntúan tanto como las propias. "
                  "Conviene dejarlo cerca del mínimo de las propias y que el modelo diga «no sé» cuando no aplica.")
    if faltan:
        print(f"{len(faltan)} pregunta(s) sin su documento entre los mejores: el problema ahí es el contenido o los nombres, no el umbral.")


if __name__ == "__main__":
    main()
