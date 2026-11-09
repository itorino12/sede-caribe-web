"""Utilidades de las pruebas: documentos de muestra en cada formato y un repositorio con embeddings de prueba."""
import io
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from congo.busqueda.embeddings import HashEmbed  # noqa: E402
from congo.busqueda.vectores import Vectores  # noqa: E402
from congo.documentos.repositorio import Repositorio  # noqa: E402

REGLAMENTO = [
    ("CAPÍTULO I. Disposiciones generales",
     "ARTÍCULO 1. Este reglamento regula la matrícula de los estudiantes de grado.\n"
     "ARTÍCULO 2. La matrícula ordinaria se realiza en las fechas del calendario universitario."),
    ("",
     "ARTÍCULO 3. El estudiante que no se matricule en el periodo ordinario puede solicitar matrícula "
     "extraordinaria ante la Oficina de Registro e Información, con un recargo.\n"
     "continúa el artículo con más detalles sobre los plazos y requisitos de la solicitud."),
]


def pdf_muestra(paginas=REGLAMENTO):
    import pymupdf
    doc = pymupdf.open()
    for titulo, texto in paginas:
        p = doc.new_page()
        p.insert_textbox(pymupdf.Rect(50, 50, 550, 800), (titulo + "\n" if titulo else "") + texto, fontsize=10)
    return doc.tobytes()


def docx_muestra():
    import docx
    d = docx.Document()
    d.add_heading("Becas socioeconómicas", level=1)
    d.add_paragraph("La beca socioeconómica se solicita en línea durante el periodo que define la Oficina de Becas.")
    d.add_heading("Requisitos", level=2)
    d.add_paragraph("Ser estudiante regular y presentar la documentación del grupo familiar.")
    t = d.add_table(rows=2, cols=2)
    t.cell(0, 0).text, t.cell(0, 1).text = "Categoría", "Exoneración"
    t.cell(1, 0).text, t.cell(1, 1).text = "5", "Total"
    b = io.BytesIO()
    d.save(b)
    return b.getvalue()


def xlsx_muestra():
    import openpyxl
    libro = openpyxl.Workbook()
    h = libro.active
    h.title = "Horarios"
    h.append(["Oficina", "Horario", "Extensión"])
    h.append(["Registro", "Lunes a viernes de 8:00 a 16:00", "2758-1234"])
    h.append(["Biblioteca", "Lunes a sábado de 7:00 a 21:00", "2758-5678"])
    b = io.BytesIO()
    libro.save(b)
    return b.getvalue()


HTML_MUESTRA = """<!doctype html><html><head><title>Admisión</title><script>var x=1</script></head>
<body><nav>Menú</nav><main><h1>Admisión</h1><p>La prueba de admisión se inscribe en el sitio de la UCR.</p>
<h2>Cupos</h2><ul><li>Informática Empresarial: 40 cupos.</li></ul></main><footer>pie</footer></body></html>""".encode()


@pytest.fixture
def repo(tmp_path):
    emb = HashEmbed()
    return Repositorio(tmp_path / "datos", emb, Vectores(tmp_path / "datos" / "chroma", emb.nombre))
