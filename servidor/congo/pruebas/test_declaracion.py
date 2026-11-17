"""Declaración Jurada: /api/declaracion y la salida JSON de Gemini (sin gastar cuota)."""
import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

from congo.app import crear_app, crear_servicios
from congo.busqueda.embeddings import HashEmbed
from congo.config import Config
from congo.proveedores import CuotaAgotada, Falso, ProveedorError
from congo.proveedores.gemini import Gemini

IMAGEN = base64.b64encode(b"\xff\xd8\xff\xe0" + b"0" * 200).decode()
LEIDO = {"es_declaracion": True, "unidad": "Sede del Caribe",
         "filas": [{"seccion": "ucr", "lugar": "Sede del Caribe (Limón)", "cargo": "Interino 2", "jornada": "1/2",
                    "desde": "20-7-2026", "hasta": "31-12-2026", "martes_de": "08:00", "martes_a": "15:00",
                    "lunes_de": "", "lunes_a": ""},
                   {"seccion": "otras", "lugar": "FUNDEVI", "cargo": "Coordinador 8723-4075", "jornada": "1/4",
                    "desde": "20-7-2026", "hasta": "31-12-2026", "jueves_de": "15:00", "jueves_a": "20:00"}],
         "observaciones": ["IF0004 Desarrollo de Software II: Contacto: K 8 a 12", ""],
         "legibilidad": ["Cargo de la fila 2 en letra muy pequeña"], "dudas": []}


@pytest.fixture
def entorno(tmp_path):
    cfg = Config(proveedor="falso", datos=tmp_path / "datos", embeddings="hash", por_hora=100, sincronizar_min=0,
                 visitas=False, modelo_declaracion="gemini-otro")
    prov = Falso(json_respuesta=LEIDO)
    s = crear_servicios(cfg, proveedor=prov, embebedor=HashEmbed())
    return TestClient(crear_app(cfg, s)), prov


def test_extraer_normaliza_y_enmascara(entorno):
    cliente, prov = entorno
    r = cliente.post("/api/declaracion", json={"modo": "extraer", "imagen": IMAGEN, "mime": "image/jpeg",
                                               "texto": "Correo: alguien@ucr.ac.cr Observaciones: IF0004"})
    assert r.status_code == 200, r.text
    d = r.json()["datos"]
    assert d["filas"][0]["dias"] == {"K": {"de": "08:00", "a": "15:00"}}  # días vacíos fuera
    assert d["filas"][1]["seccion"] == "otras" and "8723" not in d["filas"][1]["cargo"]  # teléfono enmascarado
    assert d["observaciones"] == ["IF0004 Desarrollo de Software II: Contacto: K 8 a 12"]
    sistema, partes = prov.llamadas[-1]
    assert partes[0]["inlineData"]["data"] == IMAGEN and "alguien@ucr.ac.cr" not in partes[1]["text"]
    assert "Nunca invente" in sistema


def test_revisar_no_envia_datos_personales(entorno):
    cliente, prov = entorno
    prov.json_respuesta = {"comentarios": [{"regla": "B9", "tipo": "otro", "texto": "La etiqueta de FUNDEVI dice Sede del Caribe."}]}
    decl = {"persona": {"nombre": "Fulana", "identificacion": "1-1111-1111"}, "filas": [{"seccion": "ucr", "cargo": "Interino 2"}],
            "observaciones": ["x"]}
    r = cliente.post("/api/declaracion", json={"modo": "revisar", "declaracion": decl, "hallazgos": ["B7: fechas"]})
    assert r.status_code == 200
    assert r.json()["comentarios"] == [{"regla": "B9", "tipo": "verificar", "texto": "La etiqueta de FUNDEVI dice Sede del Caribe."}]
    sistema, partes = prov.llamadas[-1]
    assert "Fulana" not in partes[0]["text"] and "1-1111-1111" not in partes[0]["text"]
    assert "A3" in sistema  # las reglas van en las instrucciones


@pytest.mark.parametrize("cuerpo,codigo", [
    ({"modo": "otro"}, 400),
    ({"modo": "extraer", "imagen": "no es base64!"}, 400),
    ({"modo": "extraer", "imagen": IMAGEN, "mime": "application/pdf"}, 400),
    ({"modo": "revisar"}, 400)])
def test_pedidos_invalidos(entorno, cuerpo, codigo):
    cliente, _ = entorno
    assert cliente.post("/api/declaracion", json=cuerpo).status_code == codigo


def test_imagen_grande_cabe_y_proveedor_caido(entorno):
    cliente, prov = entorno
    grande = base64.b64encode(b"\xff\xd8" + b"1" * 2_000_000).decode()  # 2,7 MB en base64: más que el límite del chat
    assert cliente.post("/api/declaracion", json={"modo": "extraer", "imagen": grande}).status_code == 200
    prov.error = CuotaAgotada("cuota")
    r = cliente.post("/api/declaracion", json={"modo": "extraer", "imagen": IMAGEN})
    assert r.status_code == 503 and "límite" in r.json()["error"]
    prov.error = ProveedorError("caído")
    assert cliente.post("/api/declaracion", json={"modo": "extraer", "imagen": IMAGEN}).status_code == 503


def test_gemini_json_con_esquema_e_imagen():
    visto = {}

    def api(pedido):
        visto["url"], visto["cuerpo"] = str(pedido.url), json.loads(pedido.content)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [
            {"text": "razonando", "thought": True}, {"text": '{"comentarios": []}'}]}, "finishReason": "STOP"}]})

    g = Gemini("LLAVE", "gemini-chat", transporte=httpx.MockTransport(api))
    partes = [{"inlineData": {"mimeType": "image/jpeg", "data": IMAGEN}}, {"text": "hola"}]
    assert g.generar_json("sis", partes, {"type": "OBJECT"}, modelo="gemini-vision") == {"comentarios": []}
    assert visto["url"].endswith("/models/gemini-vision:generateContent")
    gc = visto["cuerpo"]["generationConfig"]
    assert gc["responseMimeType"] == "application/json" and gc["responseSchema"] == {"type": "OBJECT"} and gc["temperature"] == 0
    assert visto["cuerpo"]["contents"][0]["parts"] == partes


def test_gemini_json_cortado_o_invalido():
    cortado = Gemini("L", transporte=httpx.MockTransport(lambda p: httpx.Response(200, json={
        "candidates": [{"content": {"parts": [{"text": '{"a": '}]}, "finishReason": "MAX_TOKENS"}]})))
    with pytest.raises(ProveedorError):
        cortado.generar_json("s", [{"text": "x"}], {})
    invalido = Gemini("L", transporte=httpx.MockTransport(lambda p: httpx.Response(200, json={
        "candidates": [{"content": {"parts": [{"text": "no es json"}]}, "finishReason": "STOP"}]})))
    with pytest.raises(ProveedorError):
        invalido.generar_json("s", [{"text": "x"}], {})
