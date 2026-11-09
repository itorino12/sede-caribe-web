"""Extrae el texto de cada formato en bloques con su ubicación (página, sección u hoja).

Cada extractor devuelve una lista de Bloque. La ubicación solo se llena si el formato la tiene:
la página existe solo en PDF; en DOCX y HTML se usa el encabezado; en XLSX, la hoja y la fila.
"""
import io
import re
import zipfile
from dataclasses import dataclass

TIPOS = {".pdf", ".docx", ".xlsx", ".txt", ".html", ".htm"}


class ArchivoInvalido(ValueError):
    """El archivo no es del tipo que dice ser o no se puede leer."""


@dataclass
class Bloque:
    texto: str
    pagina: int | None = None
    seccion: str | None = None   # encabezado del documento
    hoja: str | None = None
    fila: int | None = None


def _limpio(t):
    t = t.replace("­", "").replace("\xa0", " ")
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{3,}", "\n\n", t).strip()


def tipo_de(nombre):
    ext = "." + nombre.rsplit(".", 1)[-1].lower() if "." in nombre else ""
    return ".html" if ext == ".htm" else ext


def validar(nombre, datos: bytes):
    """Comprueba que el contenido corresponde a la extensión. Devuelve la extensión normalizada."""
    ext = tipo_de(nombre)
    if ext not in TIPOS:
        raise ArchivoInvalido(f"tipo no permitido: {ext or 'sin extensión'}")
    if not datos:
        raise ArchivoInvalido("archivo vacío")
    if ext == ".pdf" and not datos.startswith(b"%PDF-"):
        raise ArchivoInvalido("no es un PDF")
    if ext in (".docx", ".xlsx"):
        try:
            nombres = zipfile.ZipFile(io.BytesIO(datos)).namelist()
        except zipfile.BadZipFile:
            raise ArchivoInvalido(f"no es un {ext[1:].upper()}") from None
        clave = "word/document.xml" if ext == ".docx" else "xl/workbook.xml"
        if clave not in nombres:
            raise ArchivoInvalido(f"no es un {ext[1:].upper()}")
    if ext in (".txt", ".html"):
        try:
            datos.decode("utf-8")
        except UnicodeDecodeError:
            try:
                datos.decode("cp1252")
            except UnicodeDecodeError:
                raise ArchivoInvalido("texto con codificación desconocida") from None
    return ext


def _texto(datos):
    try:
        return datos.decode("utf-8-sig")
    except UnicodeDecodeError:
        return datos.decode("cp1252")


def pdf(datos):
    import pymupdf
    try:
        doc = pymupdf.open(stream=datos, filetype="pdf")
    except Exception as e:  # PyMuPDF lanza varios tipos
        raise ArchivoInvalido(f"PDF ilegible: {e}") from None
    if doc.needs_pass:
        raise ArchivoInvalido("PDF protegido con contraseña")
    bloques = []
    for i, pagina in enumerate(doc, start=1):
        t = _limpio(pagina.get_text("text", sort=True))
        if t:
            bloques.append(Bloque(t, pagina=i))
    if not bloques:
        raise ArchivoInvalido("el PDF no tiene texto (¿es escaneado? hay que pasarlo por OCR)")
    return bloques


def docx(datos):
    import docx as python_docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    try:
        doc = python_docx.Document(io.BytesIO(datos))
    except Exception as e:
        raise ArchivoInvalido(f"DOCX ilegible: {e}") from None
    bloques, seccion, parrafos = [], None, []

    def cerrar():
        if parrafos:
            bloques.append(Bloque(_limpio("\n".join(parrafos)), seccion=seccion))
            parrafos.clear()

    # párrafos y tablas en el orden en que aparecen
    for el in doc.element.body.iterchildren():
        etiqueta = el.tag.rsplit("}", 1)[-1]
        if etiqueta == "p":
            p = Paragraph(el, doc)
            t = p.text.strip()
            if not t:
                continue
            estilo = (p.style.name if p.style is not None else "").lower()
            if estilo.startswith(("heading", "título", "titulo", "title")):
                cerrar()
                seccion = t[:200]
            parrafos.append(t)
        elif etiqueta == "tbl":
            tabla = Table(el, doc)
            for fila in tabla.rows:
                celdas = []
                for c in fila.cells:
                    if c.text.strip() and (not celdas or celdas[-1] != c.text.strip()):
                        celdas.append(c.text.strip())
                if celdas:
                    parrafos.append(" | ".join(celdas))
    cerrar()
    if not bloques:
        raise ArchivoInvalido("el DOCX no tiene texto")
    return bloques


def xlsx(datos):
    import openpyxl
    try:
        libro = openpyxl.load_workbook(io.BytesIO(datos), read_only=True, data_only=True)
    except Exception as e:
        raise ArchivoInvalido(f"XLSX ilegible: {e}") from None
    bloques = []
    for hoja in libro.worksheets:
        encabezados = None
        for n, fila in enumerate(hoja.iter_rows(values_only=True), start=1):
            valores = ["" if v is None else str(v).strip() for v in fila]
            if not any(valores):
                continue
            if encabezados is None:
                encabezados = valores
                continue
            partes = [f"{encabezados[i] or f'columna {i + 1}'}: {v}" if i < len(encabezados) else v
                      for i, v in enumerate(valores) if v]
            bloques.append(Bloque("; ".join(partes), hoja=hoja.title, fila=n))
        if encabezados is not None and not any(b.hoja == hoja.title for b in bloques):
            bloques.append(Bloque("; ".join(v for v in encabezados if v), hoja=hoja.title, fila=1))
    libro.close()
    if not bloques:
        raise ArchivoInvalido("el XLSX está vacío")
    return bloques


def html(datos):
    from bs4 import BeautifulSoup
    sopa = BeautifulSoup(_texto(datos), "html.parser")
    for basura in sopa(["script", "style", "noscript", "nav", "footer", "header", "form", "svg", "iframe"]):
        basura.decompose()
    raiz = sopa.find("main") or sopa.find("article") or sopa.body or sopa
    titulo = sopa.title.get_text(" ", strip=True) if sopa.title else None
    bloques, seccion, partes = [], titulo, []

    def cerrar():
        if partes:
            bloques.append(Bloque(_limpio("\n".join(partes)), seccion=seccion))
            partes.clear()

    for el in raiz.find_all(["h1", "h2", "h3", "h4", "p", "li", "td", "th", "dd", "dt", "pre", "blockquote"]):
        if el.find_parent(["li", "td", "th", "blockquote"]) and el.name in ("p", "li"):
            continue  # ya se tomó con su contenedor
        t = el.get_text(" ", strip=True)
        if not t:
            continue
        if el.name in ("h1", "h2", "h3", "h4"):
            cerrar()
            seccion = t[:200]
        partes.append(t)
    cerrar()
    if not bloques:
        t = _limpio(raiz.get_text("\n", strip=True))
        if t:
            bloques.append(Bloque(t, seccion=titulo))
    if not bloques:
        raise ArchivoInvalido("el HTML no tiene texto")
    return bloques


def txt(datos):
    t = _limpio(_texto(datos))
    if not t:
        raise ArchivoInvalido("el TXT está vacío")
    return [Bloque(t)]


def extraer(nombre, datos: bytes):
    ext = validar(nombre, datos)
    return {".pdf": pdf, ".docx": docx, ".xlsx": xlsx, ".html": html, ".txt": txt}[ext](datos)
