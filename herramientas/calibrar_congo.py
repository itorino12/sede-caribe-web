#!/usr/bin/env python3
"""Calibra el umbral del congo (CONGO_UMBRAL) con preguntas reales, en la VM y con el servicio en marcha.

    sudo python3 herramientas/calibrar_congo.py [--preguntas herramientas/fuentes/congo-preguntas.txt]

Para cada pregunta muestra la mejor similitud que logra el documento esperado y la mejor de todo el índice.
Al final sugiere un umbral entre lo que el congo no debería contestar (preguntas «-») y lo que sí.

Prueba de listas (regresión): una tercera columna «contiene: A; B; @carreras» exige que el texto que el chat le da al
modelo nombre todos esos elementos. «@carreras» se reemplaza por los nombres de src/data/carreras.json, así que una
carrera nueva pasa a exigirse sola. Si falta alguno, la herramienta termina con error (código 1).
La clave de administración se lee de /etc/sede-web/sede.env (por eso sudo); también sirve CONGO_CLAVE_ADMIN.
"""
import argparse
import json
import os
import statistics
import sys
import unicodedata
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


def sin_tildes(t):
    return " ".join("".join(c for c in unicodedata.normalize("NFD", t.lower()) if unicodedata.category(c) != "Mn").split())


def elementos(texto):
    """«A; B; @carreras» → ['A', 'B', <nombre de cada carrera publicada>]."""
    salida = []
    for x in (x.strip() for x in texto.split(";")):
        if x == "@carreras":
            carreras = json.loads((RAIZ / "src/data/carreras.json").read_text(encoding="utf-8"))
            salida += [c["nombre"] for c in carreras if str(c.get("publicar", "sí")).lower() not in ("no", "false")]
        elif x:
            salida.append(x)
    return salida


def main():
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("--preguntas", default=RAIZ / "herramientas/fuentes/congo-preguntas.txt")
    a.add_argument("--url", default=os.environ.get("CONGO_URL", "http://127.0.0.1:8787"))
    args = a.parse_args()
    casos = []
    for linea in Path(args.preguntas).read_text(encoding="utf-8").splitlines():
        if linea.strip() and not linea.startswith("#"):
            partes = [x.strip() for x in linea.split("|")]
            exigido = partes[2].removeprefix("contiene:").strip() if len(partes) > 2 else ""
            casos.append((partes[0], partes[1] if len(partes) > 1 else "", elementos(exigido) if exigido else []))
    pedido = urllib.request.Request(f"{args.url}/api/admin/calibrar", method="POST",
                                    data=json.dumps({"preguntas": [c[0] for c in casos]}).encode(),
                                    headers={"Content-Type": "application/json", "X-Congo-Clave": clave()})
    datos = json.load(urllib.request.urlopen(pedido, timeout=300))
    umbral, propias, ajenas, faltan, incompletas = datos["umbral"], [], [], [], []
    print(f"Umbral actual: {umbral}\n")
    for (pregunta, esperado, exigidos), r in zip(casos, datos["resultados"]):
        if exigidos:
            contexto = sin_tildes(" ".join(r.get("contexto", [])))
            ausentes = [e for e in exigidos if sin_tildes(e) not in contexto]
            if ausentes:
                incompletas.append(pregunta)
            print(f"{'  LISTA INCOMPLETA' if ausentes else '  lista completa  '} {len(exigidos) - len(ausentes)}/{len(exigidos)}  {pregunta}"
                  + (f"  → faltan: {'; '.join(ausentes)}" if ausentes else ""))
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
        techo = max(ajenas)
        sugerido = round(techo + 0.05, 2)  # un poco por encima de la mejor pregunta ajena
        bajo = sum(1 for x in propias if x < sugerido)
        print(f"Documento esperado: mínimo {min(propias):.2f}, mediana {statistics.median(propias):.2f}. Ajenas: máximo {techo:.2f}.")
        print(f"Umbral sugerido: {sugerido} (CONGO_UMBRAL en /etc/sede-web/sede.env y reiniciar sede-congo). "
              f"Con ese valor {bajo} de {len(propias)} preguntas propias quedan por debajo: ahí el problema es el contenido "
              "o cómo se encuentra, no el umbral.")
    if incompletas:
        print(f"{len(incompletas)} pregunta(s) de lista no llegan completas al modelo: revisar congo_catalogos.py y el presupuesto "
              "de recuperacion.py.")
        sys.exit(1)
    if faltan:
        print(f"{len(faltan)} pregunta(s) sin su documento entre los mejores: el problema ahí es el contenido o los nombres, no el umbral.")


if __name__ == "__main__":
    main()
