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
