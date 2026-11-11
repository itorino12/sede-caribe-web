#!/usr/bin/env python3
"""Pasa una tabla de src/data/<pestaña>.json al formato de valores de la hoja «Contenido del sitio» de Drive.

Sirve para mantener la hoja igual a lo que muestra el sitio: se genera el JSON de filas y se pega en la
pestaña con la herramienta de Google Sheets (update_values). Las columnas salen en el orden del encabezado.

Uso:
    python3 herramientas/valores_hoja.py eventos                 # todas las filas, con encabezado
    python3 herramientas/valores_hoja.py eventos --desde 1 --hasta 100 --sin-encabezado
    python3 herramientas/valores_hoja.py eventos --suma          # filas y suma de largos (para comparar con la hoja)

Para comparar con la hoja, en una pestaña temporal: =SUMPRODUCT(LEN(eventos!A2:L1000)) debe dar la misma suma.
Antes de escribir fechas y horas, dar a las columnas formato de texto plano (si no, Sheets las vuelve fechas
y el sincronizador, que lee los valores con formato, ya no las entiende).
"""
import argparse, json, sys
from pathlib import Path

DATOS = Path(__file__).resolve().parent.parent / "src" / "data"
ENCABEZADOS = {
    "config": ["clave", "valor"],
    "avisos": ["publicar", "tipo", "titulo", "texto", "enlace_texto", "enlace", "desde", "hasta"],
    "noticias": ["publicar", "id", "fecha", "categoria", "titulo", "resumen", "cuerpo", "documento", "imagen", "imagen_alt",
                 "autor", "destacada", "fotos", "fotos_alt"],
    "eventos": ["publicar", "id", "fecha", "hora", "fecha_fin", "titulo", "lugar", "categoria", "descripcion", "enlace",
                "enlace_texto", "organiza"],
    "carreras": ["publicar", "id", "nombre", "grados", "codigo", "area", "recintos", "coordinacion", "correo", "extension",
                 "resumen", "plan_url", "documento"],
    "unidades": ["publicar", "id", "nombre", "grupo", "responsable", "cargo", "correo", "extension", "edificio", "resumen",
                 "documento", "fotos", "fotos_alt"],
    "directorio": ["unidad", "oficina", "extension", "edificio", "correo"],
    "enlaces": ["grupo", "titulo", "url", "descripcion"],
    "hitos": ["anio", "texto"],
    "cifras": ["valor", "etiqueta", "fuente"],
    "lugares": ["id", "zona", "nombre", "texto", "enlace", "foto360", "fotos", "fotos_alt"],
    "proyectos": ["publicar", "id", "codigo", "nombre", "modalidad", "resumen", "lugares", "poblacion", "aliados", "temas",
                  "carreras", "coordinador", "correo", "documento", "fotos", "fotos_alt", "enlace"],
}


def filas(pestana):
    datos = json.loads((DATOS / f"{pestana}.json").read_text(encoding="utf-8"))
    cab = ENCABEZADOS[pestana]
    return cab, [[str(f.get(c, "")) for c in cab] for f in datos]


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("pestana", choices=sorted(ENCABEZADOS))
    p.add_argument("--desde", type=int, default=1, help="primera fila de datos (1 = la primera)")
    p.add_argument("--hasta", type=int, help="última fila de datos")
    p.add_argument("--sin-encabezado", action="store_true")
    p.add_argument("--suma", action="store_true", help="solo cuenta filas y suma el largo de todas las celdas")
    a = p.parse_args()
    cab, datos = filas(a.pestana)
    if a.suma:
        print(a.pestana, len(datos), sum(len(c) for f in datos for c in f))
        return
    trozo = datos[a.desde - 1:a.hasta]
    if not a.sin_encabezado and a.desde == 1:
        trozo = [cab] + trozo
    json.dump(trozo, sys.stdout, ensure_ascii=False, separators=(",", ":"))
    print()


if __name__ == "__main__":
    main()
