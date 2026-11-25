"""Módulo 6: ingesta de las páginas del sitio y de la carpeta de Drive (Drive simulado)."""
import json

from conftest import docx_muestra, pdf_muestra
from congo.config import Config
from congo.ingesta import DOC_GOOGLE, HOJA_GOOGLE, Sincronizador


def test_paginas_del_sitio(repo, tmp_path):
    indice = tmp_path / "web" / "assets" / "js" / "indice.js"
    indice.parent.mkdir(parents=True)
    entradas = [{"t": "Inicio", "u": "index.html", "x": "portada"},
                {"t": "Becas", "u": "becas.html", "x": "La Oficina de Becas atiende en el edificio 4."},
                {"t": "Registro (ext. 3021)", "u": "directorio.html", "x": "Vida Estudiantil Edificio 2 registro@ucr.ac.cr"},
                {"t": "Feria vocacional", "u": "agenda.html#feria", "x": "12 de marzo, gimnasio"}]
    indice.write_text("window.INDICE=" + json.dumps(entradas) + ";", encoding="utf-8")
    sinc = Sincronizador(repo, Config(web=tmp_path / "web"))
    assert sinc.sitio() == {"nuevos": 3, "actualizados": 0, "sin_cambios": 0, "retirados": 0}
    assert sinc.sitio()["sin_cambios"] == 3
    docs = {d["id"]: d for d in repo.registro.listar(origen="sitio")}
    assert docs["sitio-becas"]["fuente"] == "becas.html" and "sitio-directorio" in docs and "sitio-index" not in docs
    indice.write_text("window.INDICE=" + json.dumps(entradas[:2]) + ";", encoding="utf-8")
    assert sinc.sitio()["retirados"] == 2


def test_paginas_completas_por_encabezado(repo, tmp_path):
    """Con congo/paginas.json, la página entra completa y partida por encabezado (no el texto recortado del índice)."""
    web = tmp_path / "web"
    (web / "assets" / "js").mkdir(parents=True)
    (web / "congo").mkdir()
    entradas = [{"t": "Dirección de la Sede", "u": "unidades/direccion.html", "x": "texto recortado"},
                {"t": "Registro (ext. 3021)", "u": "directorio.html", "x": "Vida Estudiantil"}]
    (web / "assets/js/indice.js").write_text("window.INDICE=" + json.dumps(entradas) + ";", encoding="utf-8")
    paginas = [{"t": "Dirección de la Sede", "u": "unidades/direccion.html",
                "s": [{"h": "", "x": "La Dirección conduce la Sede y coordina sus cinco áreas."},
                      {"h": "Contacto", "x": "Director Ing. Walter Anderson Rivera, MBA. Teléfono 2511-7303."}]},
               {"t": "Vacía", "u": "vacia.html", "s": [{"h": "", "x": ""}]}]
    (web / "congo/paginas.json").write_text(json.dumps(paginas), encoding="utf-8")
    informe = Sincronizador(repo, Config(web=web)).sitio()
    assert informe["nuevos"] == 2  # la dirección y el directorio; la página sin texto no entra
    filas = repo.registro.fragmentos(repo.registro.buscar_texto("Walter Anderson"))
    # las dos secciones son cortas: se juntan en un solo fragmento, con el encabezado delante de cada parte
    assert filas and "Contacto: Director Ing. Walter Anderson" in filas[0]["texto"] and "recortado" not in filas[0]["texto"]
    assert filas[0]["seccion"] == "Dirección de la Sede" and "cinco áreas" in filas[0]["texto"]


def test_secciones_largas_siguen_separadas_por_encabezado(repo, tmp_path):
    web = tmp_path / "web"
    (web / "assets" / "js").mkdir(parents=True)
    (web / "congo").mkdir()
    (web / "assets/js/indice.js").write_text("window.INDICE=[];", encoding="utf-8")
    paginas = [{"t": "Becas", "u": "unidades/becas.html",
                "s": [{"h": "Requisitos", "x": "Ser estudiante regular y presentar documentos. " * 10},
                      {"h": "Solicitud", "x": "La solicitud se hace en línea durante el periodo. " * 10}]}]
    (web / "congo/paginas.json").write_text(json.dumps(paginas), encoding="utf-8")
    Sincronizador(repo, Config(web=web)).sitio()
    secciones = {f["seccion"] for f in repo.registro.fragmentos(repo.registro.buscar_texto("solicitud documentos regular"))}
    assert secciones == {"Requisitos", "Solicitud"}


def test_unir_cortos_deja_una_lista_en_pocos_fragmentos():
    """Regresión: la página de carreras salía en 13 trozos de una línea y el asistente solo veía 2."""
    from congo.documentos.extractores import Bloque
    from congo.ingesta import unir_cortos
    nombres = [f"Carrera {i} (Bachillerato)" for i in range(13)]
    unidos = unir_cortos([Bloque("Bachillerato y licenciatura, Limón.", seccion=n) for n in nombres], "Carreras")
    assert 1 <= len(unidos) <= 2 and all(n in "\n".join(b.texto for b in unidos) for n in nombres)
    assert all(b.seccion == "Carreras" for b in unidos)
    largo = Bloque("x" * 400, seccion="Largo")
    assert unir_cortos([Bloque("corto", seccion="A"), largo, Bloque("corto", seccion="B")], "T")[1] is largo
    assert len(unir_cortos([Bloque("solo", seccion="A")], "T")) == 1


def test_catalogos_del_sitio_con_su_enlace(repo, tmp_path):
    """Los catálogos de build.py (con «id» y «enlace») son documentos propios y la cita apunta a la página real."""
    web = tmp_path / "web"
    (web / "assets" / "js").mkdir(parents=True)
    (web / "congo").mkdir()
    (web / "assets/js/indice.js").write_text("window.INDICE=[];", encoding="utf-8")
    paginas = [{"t": "Carreras y planes de estudio", "u": "carreras.html", "s": [{"h": "", "x": "Filtros por área"}]},
               {"id": "catalogo-carreras", "t": "Carreras que ofrece la Sede (lista completa)", "enlace": "carreras.html",
                "s": [{"h": "Lista", "x": "La Sede ofrece 13 carreras: Informática Empresarial; Contaduría Pública."}]}]
    (web / "congo/paginas.json").write_text(json.dumps(paginas), encoding="utf-8")
    assert Sincronizador(repo, Config(web=web)).sitio()["nuevos"] == 2
    docs = {d["id"]: d for d in repo.registro.listar(origen="sitio")}
    assert docs["sitio-catalogo-carreras"]["fuente"] == "carreras.html" and "sitio-carreras" in docs


class DriveFalso(Sincronizador):
    archivos, metadatos, contenidos = [], {}, {}

    def _clientes(self):
        return None, None

    def _listar(self, drive, carpeta):
        return self.archivos

    def _metadatos(self, sheets, hoja):
        return self.metadatos

    def _descargar(self, drive, f):
        return self.contenidos[f["id"]]


def test_drive_con_hoja_de_metadatos(repo, tmp_path):
    cred = tmp_path / "cuenta.json"
    cred.write_text("{}")
    cfg = Config(drive_carpeta="carpeta", credenciales=str(cred))
    s = DriveFalso(repo, cfg)
    pdf = pdf_muestra()
    s.archivos = [{"id": "h", "name": "Metadatos del congo", "mimeType": HOJA_GOOGLE},
                  {"id": "1", "name": "Reglamento matrícula.pdf", "mimeType": "application/pdf", "modifiedTime": "t1"},
                  {"id": "2", "name": "Guía de becas", "mimeType": DOC_GOOGLE, "modifiedTime": "t1"},
                  {"id": "3", "name": "Actas privadas.pdf", "mimeType": "application/pdf", "modifiedTime": "t1"},
                  {"id": "4", "name": "Sin fila.pdf", "mimeType": "application/pdf", "modifiedTime": "t1"}]
    s.metadatos = {"reglamento matrícula": {"archivo": "Reglamento matrícula.pdf", "id": "reg-mat", "categoria": "normativa",
                                            "version": "2025", "vigencia": "vigente", "url": "https://ucr.ac.cr/r.pdf"},
                   "guía de becas": {"archivo": "Guía de becas", "categoria": "institucional", "subcategoria": "becas"},
                   "actas privadas": {"archivo": "Actas privadas.pdf", "confidencial": "sí"}}
    s.contenidos = {"1": ("Reglamento matrícula.pdf", pdf), "2": ("Guía de becas.docx", docx_muestra()),
                    "3": ("Actas privadas.pdf", pdf_muestra([("", "contenido reservado de actas")]))}
    informe = s.drive()
    assert informe["incorporados"] == 2 and informe["sin_metadatos"] == ["Sin fila.pdf"]
    assert any("confidencial" in r for r in informe["rechazados"])
    assert repo.registro.obtener("reg-mat")["fuente"] == "https://ucr.ac.cr/r.pdf"

    assert s.drive()["sin_cambios"] == 2  # sin cambios en Drive no se descarga de nuevo
    s.metadatos["reglamento matrícula"]["vigencia"] = "derogado"
    s.drive()
    assert repo.registro.obtener("reg-mat")["vigencia"] == "derogado" and repo.registro.buscar_texto("extraordinaria") == []
    s.archivos = s.archivos[:2]  # la guía sale de la carpeta
    assert s.drive()["retirados"] == 1 and repo.registro.obtener("guia-de-becas")["vigencia"] == "retirado"


def test_drive_sin_configurar(repo):
    assert "sin configurar" in Sincronizador(repo, Config(drive_carpeta="")).drive()["estado"]
