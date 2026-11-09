"""Módulos 4 y 5: chat con citas reales, contrato del sitio, JSON, seguridad y administración (API completa)."""
import pytest
from fastapi.testclient import TestClient

from conftest import docx_muestra, pdf_muestra
from congo.app import crear_app, crear_servicios
from congo.busqueda.embeddings import HashEmbed
from congo.config import Config
from congo.proveedores import CuotaAgotada, Falso, ProveedorNoDisponible
from congo.seguridad import enmascarar
from congo.servicios import citas

CLAVE = {"X-Congo-Clave": "clave-de-prueba-larga"}


@pytest.fixture
def entorno(tmp_path):
    cfg = Config(proveedor="falso", datos=tmp_path / "datos", embeddings="hash", umbral=0.2,
                 clave_admin=CLAVE["X-Congo-Clave"], por_hora=100, sincronizar_min=0, docs=True)
    prov = Falso()
    s = crear_servicios(cfg, proveedor=prov, embebedor=HashEmbed())
    s.repositorio.incorporar("Reglamento de matrícula.pdf", pdf_muestra(),
                             {"categoria": "normativa", "subcategoria": "matricula", "version": "2025",
                              "url": "https://www.cu.ucr.ac.cr/reglamento.pdf"})
    s.repositorio.incorporar("Becas.docx", docx_muestra(), {"categoria": "institucional", "subcategoria": "becas"})
    return TestClient(crear_app(cfg, s)), s, prov


def pregunta(texto, historial=()):
    return {"mensajes": [*historial, {"rol": "usuario", "texto": texto}]}


def test_contrato_del_sitio_con_fuentes_reales(entorno):
    cliente, s, prov = entorno
    prov.respuesta = "Puede pedir **matrícula extraordinaria** ante Registro [F1], con recargo [F1, F9]."
    r = cliente.post("/api/asistente", json=pregunta("¿Cómo pido matrícula extraordinaria?"))
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/plain")
    texto = r.text
    assert "[F" not in texto and "con recargo." in texto  # marcas fuera; F9 no existe y se ignora
    assert "**Fuentes:**" in texto
    assert "[Reglamento de matrícula, Artículo 3, p. 2](https://www.cu.ucr.ac.cr/reglamento.pdf)" in texto
    sistema = prov.llamadas[0][0]
    assert '<fragmento id="F1" documento="Reglamento de matrícula" seccion="Artículo 3" pagina="2"' in sistema


def test_chat_json(entorno):
    cliente, _, prov = entorno
    prov.respuesta = "Se solicita ante Registro [F1]."
    j = cliente.post("/api/chat", json=pregunta("matrícula extraordinaria requisitos")).json()
    assert j["success"] and j["answer"] == "Se solicita ante Registro."
    f = j["sources"][0]
    assert f["document"] == "Reglamento de matrícula" and f["section"] == "Artículo 3" and f["page"] == 2
    assert "extraordinaria" in f["excerpt"] and j["confidence"] in ("high", "medium", "low")


def test_sin_informacion_no_llama_al_modelo(entorno):
    cliente, s, prov = entorno
    j = cliente.post("/api/chat", json=pregunta("receta de pan casero con levadura")).json()
    assert j["confidence"] == "none" and j["sources"] == [] and j["requires_human_review"]
    assert "No tengo esa información" in j["answer"] and prov.llamadas == []
    sin = cliente.get("/api/admin/unanswered", headers=CLAVE).json()["preguntas"]
    assert sin[0]["pregunta"] == "receta de pan casero con levadura"


def test_respuesta_sin_citas_requiere_revision(entorno):
    cliente, _, prov = entorno
    prov.respuesta = "La matrícula es en enero."
    j = cliente.post("/api/chat", json=pregunta("¿cuándo es la matrícula?")).json()
    assert j["sources"] == [] and j["confidence"] == "low" and j["requires_human_review"]


def test_contradiccion_requiere_revision(entorno):
    cliente, _, prov = entorno
    prov.respuesta = "Atención: las fuentes no coinciden sobre el plazo [F1]."
    assert cliente.post("/api/chat", json=pregunta("plazo matrícula")).json()["requires_human_review"]


def test_saludo_sin_modelo(entorno):
    cliente, _, prov = entorno
    r = cliente.post("/api/asistente", json=pregunta("Hola!"))
    assert r.status_code == 200 and "Con gusto le ayudo" in r.text and prov.llamadas == []


def test_datos_personales_no_llegan_al_proveedor(entorno):
    cliente, _, prov = entorno
    cliente.post("/api/asistente", json=pregunta(
        "Soy 1-1234-5678, carné B12345, correo ana@ucr.ac.cr, tel 8888-1234: ¿matrícula extraordinaria?"))
    enviado = prov.llamadas[0][1][-1]["content"]
    for dato in ("1234-5678", "B12345", "ana@ucr.ac.cr", "8888-1234"):
        assert dato not in enviado
    assert enviado.count("[dato oculto]") == 4


def test_historial_seguimiento_y_fuentes_viejas(entorno):
    cliente, _, prov = entorno
    historial = [{"rol": "usuario", "texto": "¿Cómo pido matrícula extraordinaria?"},
                 {"rol": "congo", "texto": "Ante Registro.\n\n**Fuentes:**\n\n- Reglamento"}]
    cliente.post("/api/asistente", json=pregunta("¿y el recargo?", historial))
    mensajes = prov.llamadas[0][1]
    assert [m["role"] for m in mensajes] == ["user", "assistant", "user"]
    assert "Fuentes" not in mensajes[1]["content"]


@pytest.mark.parametrize("error", [ProveedorNoDisponible("sin llave"), CuotaAgotada("cuota")])
def test_proveedor_caido_da_503_para_el_respaldo_del_sitio(entorno, error):
    cliente, _, prov = entorno
    prov.error = error
    assert cliente.post("/api/asistente", json=pregunta("matrícula extraordinaria")).status_code == 503
    assert cliente.post("/api/chat", json=pregunta("matrícula extraordinaria")).status_code == 503


def test_entradas_invalidas_y_limites(entorno, tmp_path):
    cliente, s, _ = entorno
    assert cliente.post("/api/asistente", json={"mensajes": []}).status_code == 400
    assert cliente.post("/api/asistente", json={"mensajes": [{"rol": "sistema", "texto": "x"}]}).status_code == 400
    assert cliente.post("/api/asistente", content=b"x" * 70000,
                        headers={"content-type": "application/json"}).status_code == 413
    s.cupo.por_hora = 1
    s.cupo.por_ip.clear()
    cliente.post("/api/search", json={"consulta": "becas"})
    assert cliente.post("/api/asistente", json=pregunta("becas")).status_code == 429


def test_busqueda_y_salud(entorno):
    cliente, _, _ = entorno
    r = cliente.post("/api/search", json={"consulta": "beca socioeconómica requisitos"}).json()
    assert r["results"][0]["document"] == "Becas"
    assert cliente.get("/api/health").json()["fragmentos"] > 0


def test_administracion_exige_clave(entorno):
    cliente, _, _ = entorno
    for metodo, ruta in [("get", "/api/documents"), ("get", "/api/admin/stats"), ("get", "/api/admin/categories"),
                         ("delete", "/api/documents/becas"), ("post", "/api/admin/sync")]:
        assert getattr(cliente, metodo)(ruta).status_code == 401
        assert getattr(cliente, metodo)(ruta, headers={"X-Congo-Clave": "mala"}).status_code == 401


def test_sin_clave_configurada_todo_cerrado(entorno):
    cliente, s, _ = entorno
    s.config.clave_admin = ""
    assert cliente.get("/api/documents", headers={"X-Congo-Clave": ""}).status_code == 401


def test_ciclo_de_documentos(entorno):
    cliente, s, _ = entorno
    r = cliente.post("/api/documents/upload", headers=CLAVE,
                     files={"archivo": ("Horario.txt", "La biblioteca abre de lunes a sábado de 7 a 21 horas.".encode())},
                     data={"categoria": "institucional", "subcategoria": "horarios", "version": "1"})
    assert r.status_code == 201 and r.json()["estado"] == "nuevo"
    doc_id = r.json()["documento"]["id"]
    assert "archivo" not in r.json()["documento"]
    assert cliente.post("/api/documents/upload", headers=CLAVE, files={"archivo": ("Copia.txt",
                        "La biblioteca abre de lunes a sábado de 7 a 21 horas.".encode())}).status_code == 409
    assert cliente.post("/api/documents/upload", headers=CLAVE, files={"archivo": ("x.exe", b"MZ")}).status_code == 415
    assert cliente.post("/api/documents/upload", headers=CLAVE, files={"archivo": ("x.txt", b"texto secreto")},
                        data={"confidencial": "sí"}).status_code == 422

    assert cliente.patch(f"/api/documents/{doc_id}", headers=CLAVE, json={"vigencia": "derogado"}).json()["documento"]["vigencia"] == "derogado"
    assert all(x["document_id"] != doc_id for x in cliente.post("/api/search", json={"consulta": "biblioteca horario"}).json()["results"])
    ficha = cliente.get(f"/api/documents/{doc_id}", headers=CLAVE).json()
    assert ficha["historial"][0]["vigencia"] == "vigente"
    cliente.patch(f"/api/documents/{doc_id}", headers=CLAVE, json={"vigencia": "vigente"})
    assert cliente.post(f"/api/documents/{doc_id}/reprocess", headers=CLAVE).json()["documento"]["fragmentos"] == 1
    assert cliente.delete(f"/api/documents/{doc_id}", headers=CLAVE).status_code == 200
    assert cliente.get(f"/api/documents/{doc_id}", headers=CLAVE).status_code == 404

    stats = cliente.get("/api/admin/stats", headers=CLAVE).json()
    assert stats["fragmentos_indexados"] > 0 and stats["proveedor"] == "falso"
    cats = {c["categoria"]: c for c in cliente.get("/api/admin/categories", headers=CLAVE).json()["categorias"]}
    assert cats["normativa"]["documentos"] == 1
    assert cliente.get("/api/openapi.json").status_code == 200


def test_filtro_de_citas_por_partes():
    f = citas.FiltroCitas(3)
    trozos = ["Texto uno [", "F", "2] y dos", " [F1,", " F3]. Fin [nota] ", "[F7]"]
    salida = "".join(f.agregar(t) for t in trozos) + f.cerrar()
    assert salida == "Texto uno y dos. Fin [nota]" and f.usados == [2, 1, 3]


def test_enmascarar_no_toca_texto_normal():
    assert enmascarar("¿Cuándo es la matrícula del I ciclo 2027?") == "¿Cuándo es la matrícula del I ciclo 2027?"
    assert enmascarar("Mi cédula es 702340567") == "Mi cédula es [dato oculto]"
