"""Conteo de visitas: sin datos personales, sin robots, visitantes por día y ruta pública que nunca falla."""
import sqlite3

import pytest
from fastapi.testclient import TestClient

from congo.app import crear_app, crear_servicios
from congo.busqueda.embeddings import HashEmbed
from congo.config import Config
from congo.proveedores import Falso
from congo.servicios import visitas as v

CLAVE = {"X-Congo-Clave": "clave-de-prueba-larga"}
NAVEGADOR = "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36"


@pytest.fixture
def servicio(tmp_path):
    return v.Visitas(tmp_path / "v.sqlite3")


@pytest.fixture
def cliente(tmp_path):
    cfg = Config(proveedor="falso", datos=tmp_path / "datos", embeddings="hash", clave_admin=CLAVE["X-Congo-Clave"],
                 sincronizar_min=0)
    s = crear_servicios(cfg, proveedor=Falso(), embebedor=HashEmbed())
    return TestClient(crear_app(cfg, s)), s


def test_limpiar_ruta_quita_busquedas_y_rechaza_basura():
    assert v.limpiar_ruta("/directorio.html?buscar=juan+perez#x") == "/directorio.html"
    assert v.limpiar_ruta("/index.html") == "/"
    assert v.limpiar_ruta("/carreras/x.html") == "/carreras/x.html"
    for malo in (None, 5, "sin-barra", "/a b", "/<script>", "/" + "a" * 300, "//evil.com"):
        assert v.limpiar_ruta(malo) is None


def test_origen_solo_dominio():
    assert v.limpiar_origen("www.google.com") == "google.com"
    assert v.limpiar_origen("") == "directo" and v.limpiar_origen(None) == "directo"
    assert v.limpiar_origen("http://x.com/ruta?q=1") == "otro"


def test_cuenta_vistas_y_visitantes_distintos(servicio):
    assert servicio.registrar("/", "google.com", "m", "10.0.0.1", NAVEGADOR)
    assert servicio.registrar("/", "google.com", "m", "10.0.0.1", NAVEGADOR)       # misma persona
    assert servicio.registrar("/", "google.com", "m", "10.0.0.2", NAVEGADOR)       # otra persona
    assert servicio.registrar("/agenda.html", "directo", "e", "10.0.0.1", NAVEGADOR)
    inf = servicio.informe(7)
    assert inf["vistas"] == 4
    assert inf["por_dia"][0]["visitantes"] == 2
    portada = next(p for p in inf["paginas"] if p["ruta"] == "/")
    assert portada["vistas"] == 3 and portada["visitantes"] == 2
    assert inf["dispositivos"] == {"celular": 3, "equipo": 1}
    assert {"origen": "google.com", "vistas": 3} in inf["origenes"]


def test_descarta_robots_y_sin_navegador(servicio):
    assert not servicio.registrar("/", "", "e", "10.0.0.1", "Googlebot/2.1")
    assert not servicio.registrar("/", "", "e", "10.0.0.1", "Lighthouse")
    assert not servicio.registrar("/", "", "e", "10.0.0.1", "")
    assert servicio.informe(7)["vistas"] == 0


def test_no_guarda_ip_ni_navegador_en_disco(servicio, tmp_path):
    servicio.registrar("/", "", "e", "203.0.113.77", NAVEGADOR)
    volcado = "\n".join(servicio.db.iterdump())
    assert "203.0.113.77" not in volcado and "Mozilla" not in volcado and "Chrome" not in volcado
    assert b"203.0.113.77" not in (tmp_path / "v.sqlite3").read_bytes()


def test_rutas_inventadas_no_llenan_la_base(servicio, monkeypatch):
    monkeypatch.setattr(v, "MAX_RUTAS_POR_DIA", 5)
    for i in range(30):
        servicio.registrar(f"/falsa-{i}.html", "", "e", "10.0.0.1", NAVEGADOR)
    n = servicio.db.execute("SELECT COUNT(DISTINCT ruta) FROM visitas").fetchone()[0]
    assert n == 6  # 5 rutas + «(otras)»


def test_ruta_publica_siempre_204(cliente):
    c, s = cliente
    ok = c.post("/api/visita", json={"p": "/estudiar.html?x=1", "r": "facebook.com", "d": "m"}, headers={"user-agent": NAVEGADOR})
    assert ok.status_code == 204 and ok.content == b""
    for cuerpo in ("no es json", [1, 2], {"p": 5}, {}):
        r = c.post("/api/visita", content=cuerpo if isinstance(cuerpo, str) else __import__("json").dumps(cuerpo),
                   headers={"user-agent": NAVEGADOR, "content-type": "application/json"})
        assert r.status_code == 204
    inf = c.get("/api/admin/visitas", headers=CLAVE).json()
    assert inf["success"] and inf["vistas"] == 1
    assert inf["paginas"][0]["ruta"] == "/estudiar.html" and inf["origenes"][0]["origen"] == "facebook.com"


def test_informe_exige_clave(cliente):
    c, _ = cliente
    assert c.get("/api/admin/visitas").status_code in (401, 403)


def test_apagado_por_configuracion(tmp_path):
    cfg = Config(proveedor="falso", datos=tmp_path / "d", embeddings="hash", clave_admin="x" * 20, sincronizar_min=0,
                 visitas=False)
    s = crear_servicios(cfg, proveedor=Falso(), embebedor=HashEmbed())
    c = TestClient(crear_app(cfg, s))
    assert c.post("/api/visita", json={"p": "/"}, headers={"user-agent": NAVEGADOR}).status_code == 204
    assert not (tmp_path / "d" / "visitas.sqlite3").exists()
    assert c.get("/api/admin/visitas", headers={"X-Congo-Clave": "x" * 20}).json()["success"] is False


def test_cambio_de_dia_reinicia_visitantes(servicio, monkeypatch):
    dias = iter(["2026-11-13", "2026-11-13", "2026-11-14"])
    monkeypatch.setattr(servicio, "_hoy", lambda: next(dias))
    servicio.registrar("/", "", "e", "10.0.0.1", NAVEGADOR)
    servicio.registrar("/", "", "e", "10.0.0.1", NAVEGADOR)
    servicio.registrar("/", "", "e", "10.0.0.1", NAVEGADOR)  # día nuevo: vuelve a contar como visitante
    filas = dict((d, (vs, vi)) for d, vs, vi in servicio.db.execute("SELECT dia, vistas, visitantes FROM diario"))
    assert filas == {"2026-11-13": (2, 1), "2026-11-14": (1, 1)}
