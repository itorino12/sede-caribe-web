"""Módulo 1: extracción, fragmentación y registro con vigencia."""
import pytest

from conftest import HTML_MUESTRA, docx_muestra, pdf_muestra, xlsx_muestra
from congo.documentos import extractores
from congo.documentos.fragmentador import MAXIMO, fragmentar
from congo.documentos.repositorio import Rechazado


def test_pdf_paginas_y_articulos():
    frags = fragmentar(extractores.extraer("r.pdf", pdf_muestra()))
    por_articulo = {f.seccion: f for f in frags}
    assert por_articulo["Artículo 1"].pagina == 1
    assert por_articulo["Artículo 3"].pagina == 2
    assert "Registro" in por_articulo["Artículo 3"].texto


def test_articulo_continua_en_la_pagina_siguiente():
    paginas = [("", "ARTÍCULO 7. Primera parte del artículo siete sobre evaluación."),
               ("", "segunda parte del artículo siete que sigue en otra página.")]
    frags = fragmentar(extractores.extraer("r.pdf", pdf_muestra(paginas)))
    assert [(f.pagina, f.seccion) for f in frags] == [(1, "Artículo 7"), (2, "Artículo 7")]


def test_docx_encabezados_y_tablas():
    frags = fragmentar(extractores.extraer("b.docx", docx_muestra()))
    secciones = {f.seccion for f in frags}
    assert {"Becas socioeconómicas", "Requisitos"} <= secciones
    assert any("Categoría | Exoneración" in f.texto for f in frags)
    assert all(f.pagina is None for f in frags)


def test_xlsx_hoja_y_filas():
    frags = fragmentar(extractores.extraer("h.xlsx", xlsx_muestra()))
    assert frags[0].hoja == "Horarios" and frags[0].filas == "2-3"
    assert "Oficina: Registro; Horario: Lunes a viernes" in frags[0].texto


def test_html_quita_menus_y_scripts():
    frags = fragmentar(extractores.extraer("a.html", HTML_MUESTRA))
    texto = " ".join(f.texto for f in frags)
    assert "40 cupos" in texto and "Menú" not in texto and "var x" not in texto
    assert {"Admisión", "Cupos"} <= {f.seccion for f in frags}


def test_texto_largo_se_parte():
    frags = fragmentar(extractores.extraer("t.txt", ("Una oración de prueba bastante larga. " * 120).encode()))
    assert len(frags) > 2 and all(len(f.texto) <= MAXIMO for f in frags)


@pytest.mark.parametrize("nombre,datos", [("x.pdf", b"no soy pdf"), ("x.docx", b"PK\x03\x04basura"),
                                          ("x.exe", b"MZ"), ("x.txt", b""), ("x.xlsx", docx_muestra())])
def test_archivos_invalidos(nombre, datos):
    with pytest.raises(extractores.ArchivoInvalido):
        extractores.extraer(nombre, datos)


def test_versiones_duplicados_y_vigencia(repo):
    v1 = pdf_muestra()  # PyMuPDF pone fecha en cada PDF: se reutilizan los mismos bytes
    r = repo.incorporar("Reglamento.pdf", v1, {"id": "reg-matricula", "categoria": "normativa", "version": "1"})
    assert r.estado == "nuevo" and r.documento["fragmentos"] > 0
    assert repo.incorporar("Reglamento.pdf", v1, {"id": "reg-matricula", "categoria": "normativa",
                                                             "version": "1"}).estado == "sin_cambios"
    with pytest.raises(Rechazado, match="duplicado"):
        repo.incorporar("Copia.pdf", v1, {"id": "otro", "categoria": "normativa"})

    nuevo = pdf_muestra([("", "ARTÍCULO 1. Texto reformado de la matrícula de grado.")])
    r = repo.incorporar("Reglamento.pdf", nuevo, {"id": "reg-matricula", "categoria": "normativa", "version": "2"})
    assert r.estado == "nueva_version" and r.documento["version"] == "2"
    assert len(repo.registro.historial("reg-matricula")) == 1
    textos = [f["texto"] for f in repo.registro.fragmentos(repo.registro.buscar_texto("matrícula"))]
    assert textos and all("extraordinaria" not in t for t in textos)  # la versión 1 ya no se recupera

    repo.cambiar_vigencia("reg-matricula", "derogado")
    assert repo.registro.buscar_texto("matrícula") == [] and repo.vectores.contar() == 0
    assert repo.registro.obtener("reg-matricula")["vigencia"] == "derogado"
    repo.cambiar_vigencia("reg-matricula", "vigente")
    assert repo.registro.buscar_texto("reformado")


def test_confidencial_y_metadatos_invalidos(repo):
    with pytest.raises(Rechazado, match="confidencial"):
        repo.incorporar("a.txt", b"secreto", {"confidencial": "sí"})
    with pytest.raises(Rechazado, match="categoría"):
        repo.incorporar("a.txt", b"texto cualquiera de prueba", {"categoria": "otra"})


def test_reprocesar_y_eliminar(repo):
    repo.incorporar("Becas.docx", docx_muestra(), {"categoria": "institucional", "subcategoria": "becas"})
    doc = repo.registro.listar()[0]
    assert repo.reprocesar(doc["id"])["fragmentos"] == doc["fragmentos"]
    assert repo.eliminar(doc["id"]) and repo.registro.listar() == [] and repo.vectores.contar() == 0
