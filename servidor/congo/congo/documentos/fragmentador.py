"""Corta los bloques en fragmentos de tamaño útil para buscar y citar.

- Un fragmento nunca cruza de una página (PDF) ni de una hoja (XLSX) a otra: así la cita es exacta.
- En reglamentos, cada «Artículo N» empieza un fragmento nuevo y su número queda como sección.
  Si un artículo sigue en la página siguiente, esa continuación conserva el número del artículo.
"""
import re
from dataclasses import dataclass

MAXIMO = 1100   # caracteres por fragmento
SOLAPE = 150    # caracteres que se repiten entre fragmentos consecutivos de un mismo texto largo

ARTICULO = re.compile(r"^\s*(?:ART[ÍI]CULO|Art[íi]culo|Art\.)\s*(\d+(?:\s*bis)?)[°º.\-:)\s]", re.MULTILINE)


@dataclass
class Fragmento:
    texto: str
    pagina: int | None = None
    seccion: str | None = None
    hoja: str | None = None
    filas: str | None = None


def _partir_largo(texto):
    """Parte un texto más largo que MAXIMO, preferiblemente en fin de párrafo u oración."""
    piezas, inicio = [], 0
    while inicio < len(texto):
        fin = min(len(texto), inicio + MAXIMO)
        if fin < len(texto):
            corte = max(texto.rfind("\n", inicio + MAXIMO // 2, fin), texto.rfind(". ", inicio + MAXIMO // 2, fin))
            if corte > inicio:
                fin = corte + 1
        piezas.append(texto[inicio:fin].strip())
        if fin >= len(texto):
            break
        inicio = max(fin - SOLAPE, inicio + 1)
        espacio = texto.find(" ", inicio)  # no empezar a media palabra
        if 0 <= espacio < fin:
            inicio = espacio + 1
    return [p for p in piezas if p]


def _por_articulos(texto):
    """Divide el texto en trozos que empiezan en cada artículo. Devuelve (artículo o None, trozo)."""
    marcas = list(ARTICULO.finditer(texto))
    if not marcas:
        return [(None, texto)]
    trozos = []
    if marcas[0].start() > 0 and texto[:marcas[0].start()].strip():
        trozos.append((None, texto[:marcas[0].start()]))
    for i, m in enumerate(marcas):
        fin = marcas[i + 1].start() if i + 1 < len(marcas) else len(texto)
        numero = re.sub(r"\s+", " ", m.group(1))
        trozos.append(("Artículo " + numero, texto[m.start():fin]))
    return trozos


def fragmentar(bloques):
    fragmentos = []
    articulo = None  # el artículo en curso pasa de una página a la siguiente
    filas_hoja = []  # filas de XLSX pendientes de agrupar: (hoja, fila, texto)

    def cerrar_filas():
        grupo, largo = [], 0
        for hoja, fila, texto in filas_hoja + [(None, None, None)]:
            if grupo and (texto is None or hoja != grupo[0][0] or largo + len(texto) > MAXIMO):
                desde, hasta = grupo[0][1], grupo[-1][1]
                fragmentos.append(Fragmento("\n".join(t for _, _, t in grupo), hoja=grupo[0][0],
                                            filas=str(desde) if desde == hasta else f"{desde}-{hasta}"))
                grupo, largo = [], 0
            if texto is not None:
                grupo.append((hoja, fila, texto[:MAXIMO]))
                largo += len(texto) + 1
        filas_hoja.clear()

    ultima_seccion = None
    for b in bloques:
        if b.hoja is not None:
            filas_hoja.append((b.hoja, b.fila, b.texto))
            continue
        cerrar_filas()
        if b.seccion != ultima_seccion:  # en DOCX y HTML, un encabezado nuevo cierra el artículo en curso
            articulo, ultima_seccion = None, b.seccion
        for nuevo, trozo in _por_articulos(b.texto):
            if nuevo:
                articulo = nuevo
            seccion = articulo or b.seccion
            # se juntan trozos pequeños seguidos de la misma página y sección
            for pieza in _partir_largo(trozo.strip()):
                previo = fragmentos[-1] if fragmentos else None
                if (previo and previo.hoja is None and previo.pagina == b.pagina and previo.seccion == seccion
                        and len(previo.texto) + len(pieza) < MAXIMO // 2 and nuevo is None):
                    previo.texto += "\n" + pieza
                else:
                    fragmentos.append(Fragmento(pieza, pagina=b.pagina, seccion=seccion))
    cerrar_filas()
    return [f for f in fragmentos if len(f.texto) >= 20 or len(fragmentos) == 1]
