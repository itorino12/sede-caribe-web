"""Estadísticas de visitas propias, sin cookies ni datos personales.

Qué se guarda: por día, la ruta de la página, el sitio de origen (solo el dominio) y la clase de pantalla (celular o
equipo), con el número de vistas y de visitantes. Qué NO se guarda: IP, navegador, texto de búsquedas ni nada que
identifique a una persona.

Para contar visitantes distintos se usa, como hacen Plausible y GoatCounter, un identificador temporal que
se calcula con IP + navegador + una sal que cambia cada día. Ese identificador vive solo en la memoria del proceso,
nunca llega al disco y se descarta al cambiar el día. Si el servicio se reinicia a media jornada, una persona puede
contarse dos veces ese día: es el costo de no guardar nada.
"""
import datetime
import hashlib
import os
import re
import sqlite3
import threading

from ..seguridad import CR

ESQUEMA = """
CREATE TABLE IF NOT EXISTS visitas (
  dia TEXT NOT NULL, ruta TEXT NOT NULL, origen TEXT NOT NULL, dispositivo TEXT NOT NULL,
  vistas INTEGER NOT NULL DEFAULT 0, visitantes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (dia, ruta, origen, dispositivo));
CREATE TABLE IF NOT EXISTS diario (
  dia TEXT PRIMARY KEY, vistas INTEGER NOT NULL DEFAULT 0, visitantes INTEGER NOT NULL DEFAULT 0);
"""

RUTA = re.compile(r"^/[A-Za-z0-9._~\-/%]{0,199}$")
DOMINIO = re.compile(r"^[a-z0-9]([a-z0-9.\-]{0,78}[a-z0-9])?$")
ROBOTS = ("bot", "crawl", "spider", "slurp", "headless", "lighthouse", "preview", "monitor", "curl", "python-requests")
MAX_RUTAS_POR_DIA = 1500      # evita que rutas inventadas llenen la base
MAX_IDENTIFICADORES = 200_000  # tope de memoria para los visitantes del día
RETENCION_DIAS = 400


def limpiar_ruta(ruta):
    """Solo la ruta: sin parámetros ni ancla (el directorio guarda lo que se busca en la dirección)."""
    if not isinstance(ruta, str):
        return None
    ruta = ruta.split("?", 1)[0].split("#", 1)[0]
    if ruta.endswith("/index.html"):
        ruta = ruta[: -len("index.html")]
    return ruta if RUTA.match(ruta) and not ruta.startswith("//") else None


def limpiar_origen(origen):
    if not isinstance(origen, str) or not origen:
        return "directo"
    origen = origen.strip().lower().removeprefix("www.")
    return origen if DOMINIO.match(origen) else "otro"


class Visitas:
    def __init__(self, ruta_db):
        ruta_db.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(ruta_db, check_same_thread=False, isolation_level=None)
        self.db.executescript(ESQUEMA)
        self.candado = threading.Lock()
        self.dia = None
        self.sal = b""
        self.sitio, self.paginas, self.rutas_hoy = set(), set(), set()

    def _hoy(self):
        return datetime.datetime.now(CR).date().isoformat()

    def _cambio_de_dia(self, dia):
        self.dia, self.sal = dia, os.urandom(16)
        self.sitio.clear()
        self.paginas.clear()
        self.rutas_hoy = {r[0] for r in self.db.execute("SELECT DISTINCT ruta FROM visitas WHERE dia = ?", (dia,))}
        limite = (datetime.date.fromisoformat(dia) - datetime.timedelta(days=RETENCION_DIAS)).isoformat()
        self.db.execute("DELETE FROM visitas WHERE dia < ?", (limite,))
        self.db.execute("DELETE FROM diario WHERE dia < ?", (limite,))

    def registrar(self, ruta, origen, dispositivo, ip, agente):
        """Cuenta una vista. Devuelve False si se descartó (robot, ruta inválida)."""
        agente = (agente or "").lower()
        if not agente or any(r in agente for r in ROBOTS):
            return False
        ruta = limpiar_ruta(ruta)
        if ruta is None:
            return False
        origen = limpiar_origen(origen)
        dispositivo = "celular" if dispositivo == "m" else "equipo"
        with self.candado:
            dia = self._hoy()
            if dia != self.dia:
                self._cambio_de_dia(dia)
            if ruta not in self.rutas_hoy:
                if len(self.rutas_hoy) >= MAX_RUTAS_POR_DIA:
                    ruta = "(otras)"
                self.rutas_hoy.add(ruta)
            ident = hashlib.sha256(self.sal + f"{ip}|{agente}".encode()).digest()
            nuevo_sitio = ident not in self.sitio and len(self.sitio) < MAX_IDENTIFICADORES
            nueva_pagina = (ident, ruta) not in self.paginas and len(self.paginas) < MAX_IDENTIFICADORES
            if nuevo_sitio:
                self.sitio.add(ident)
            if nueva_pagina:
                self.paginas.add((ident, ruta))
            self.db.execute(
                "INSERT INTO visitas (dia, ruta, origen, dispositivo, vistas, visitantes) VALUES (?,?,?,?,1,?) "
                "ON CONFLICT(dia, ruta, origen, dispositivo) DO UPDATE SET vistas = vistas + 1, visitantes = visitantes + ?",
                (dia, ruta, origen, dispositivo, int(nueva_pagina), int(nueva_pagina)))
            self.db.execute(
                "INSERT INTO diario (dia, vistas, visitantes) VALUES (?,1,?) "
                "ON CONFLICT(dia) DO UPDATE SET vistas = vistas + 1, visitantes = visitantes + ?",
                (dia, int(nuevo_sitio), int(nuevo_sitio)))
        return True

    def informe(self, dias=30, cuantas=50):
        dias = max(1, min(int(dias), RETENCION_DIAS))
        desde = (datetime.datetime.now(CR).date() - datetime.timedelta(days=dias - 1)).isoformat()
        q = self.db.execute
        por_dia = [{"dia": d, "vistas": v, "visitantes": n}
                   for d, v, n in q("SELECT dia, vistas, visitantes FROM diario WHERE dia >= ? ORDER BY dia", (desde,))]
        paginas = [{"ruta": r, "vistas": v, "visitantes": n} for r, v, n in q(
            "SELECT ruta, SUM(vistas) v, SUM(visitantes) n FROM visitas WHERE dia >= ? GROUP BY ruta "
            "ORDER BY v DESC LIMIT ?", (desde, cuantas))]
        origenes = [{"origen": o, "vistas": v} for o, v in q(
            "SELECT origen, SUM(vistas) v FROM visitas WHERE dia >= ? GROUP BY origen ORDER BY v DESC LIMIT 20", (desde,))]
        dispositivos = {d: v for d, v in q(
            "SELECT dispositivo, SUM(vistas) FROM visitas WHERE dia >= ? GROUP BY dispositivo", (desde,))}
        return {"desde": desde, "dias": dias, "vistas": sum(x["vistas"] for x in por_dia),
                "visitantes_por_dia_sumados": sum(x["visitantes"] for x in por_dia),
                "por_dia": por_dia, "paginas": paginas, "origenes": origenes, "dispositivos": dispositivos}
