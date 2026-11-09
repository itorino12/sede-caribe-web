"""Módulo 2: búsqueda híbrida con umbral, solo sobre documentos vigentes."""
from conftest import HTML_MUESTRA, docx_muestra, pdf_muestra, xlsx_muestra
from congo.servicios.recuperacion import Recuperacion


def poblar(repo):
    repo.incorporar("Reglamento de matrícula.pdf", pdf_muestra(), {"categoria": "normativa", "subcategoria": "matricula"})
    repo.incorporar("Becas.docx", docx_muestra(), {"categoria": "institucional", "subcategoria": "becas"})
    repo.incorporar("Horarios.xlsx", xlsx_muestra(), {"categoria": "institucional", "subcategoria": "horarios"})
    repo.incorporar("Admisión.html", HTML_MUESTRA, {"categoria": "institucional", "subcategoria": "admision"})
    return Recuperacion(repo.registro, repo.embebedor, repo.vectores, umbral=0.2)


def test_encuentra_el_documento_correcto(repo):
    rec = poblar(repo)
    h = rec.buscar("¿Cómo solicito matrícula extraordinaria?")
    assert h and h[0].fragmento["nombre"] == "Reglamento de matrícula"
    assert h[0].fragmento["seccion"] == "Artículo 3" and h[0].fragmento["pagina"] == 2
    assert rec.buscar("horario de la biblioteca")[0].fragmento["hoja"] == "Horarios"


def test_sin_resultados_bajo_el_umbral(repo):
    rec = poblar(repo)
    assert rec.buscar("receta de pan casero con levadura") == []
    assert rec.confianza([]) == "none"


def test_filtro_de_categoria_y_vigencia(repo):
    rec = poblar(repo)
    assert all(h.fragmento["categoria"] == "normativa" for h in rec.buscar("matrícula becas", categoria="normativa"))
    doc = next(d for d in repo.registro.listar() if d["subcategoria"] == "matricula")
    repo.cambiar_vigencia(doc["id"], "derogado")
    assert all(h.fragmento["doc_id"] != doc["id"] for h in rec.buscar("matrícula extraordinaria"))
