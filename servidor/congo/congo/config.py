"""Configuración de CONGO 2.0. Se lee de variables de entorno y de /etc/sede-web/sede.env.

Variables (todas opcionales salvo la llave del proveedor elegido):
  CONGO_PROVEEDOR        gemini (por omisión) | claude | falso (solo pruebas)
  GEMINI_API_KEY         llave de Gemini (aistudio.google.com/apikey). Nunca va al navegador.
  CONGO_MODELO_GEMINI    gemini-flash-latest
  ANTHROPIC_API_KEY      llave de Claude, si CONGO_PROVEEDOR=claude
  CONGO_MODELO_CLAUDE    claude-haiku-5-5
  CONGO_DATOS            carpeta de datos (/var/lib/sede-congo)
  CONGO_EMBEDDINGS       modelo de fastembed (sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) o «hash» (pruebas)
  CONGO_UMBRAL           similitud mínima para usar un fragmento (0.45); calibrar con documentos reales
  CONGO_CLAVE_ADMIN      clave para /api/documents y /api/admin (cabecera X-Congo-Clave). Sin ella, esos endpoints se cierran.
  CONGO_POR_HORA         preguntas por hora y por IP (30)
  CONGO_POR_DIA          preguntas por día en total (1000): protege la cuota gratuita
  CONGO_MAX_MB           tamaño máximo de archivo subido (20)
  CONGO_DRIVE_CARPETA    ID de la carpeta «Documentos del congo» en Drive
  SEDE_CREDENCIALES      cuenta de servicio de Google (la misma del sitio)
  SEDE_WEB               carpeta publicada del sitio (/var/www/sede): se indexan sus páginas
  CONGO_SINCRONIZAR_MIN  cada cuántos minutos se sincronizan Drive y el sitio (10; 0 = nunca)
  CONGO_DOCS             1 para publicar la documentación OpenAPI en /api/docs
  CONGO_VISITAS          0 para apagar el conteo de visitas (por omisión, encendido; ver servicios/visitas.py)
"""
import os
from dataclasses import dataclass, field
from pathlib import Path

ARCHIVO_ENV = Path("/etc/sede-web/sede.env")


def _leer_env(archivo=ARCHIVO_ENV):
    env = {}
    try:
        for linea in archivo.read_text(encoding="utf-8").splitlines():
            if "=" in linea and not linea.strip().startswith("#"):
                k, v = linea.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    except OSError:
        pass
    env.update(os.environ)
    return env


@dataclass
class Config:
    proveedor: str = "gemini"
    gemini_llave: str = ""
    gemini_modelo: str = "gemini-flash-latest"
    claude_llave: str = ""
    claude_modelo: str = "claude-haiku-5-5"
    datos: Path = Path("/var/lib/sede-congo")
    embeddings: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    umbral: float = 0.45
    clave_admin: str = ""
    por_hora: int = 30
    por_dia: int = 1000
    max_mb: int = 20
    drive_carpeta: str = ""
    credenciales: str = "/etc/sede-web/cuenta-servicio.json"
    web: Path = Path("/var/www/sede")
    sincronizar_min: int = 10
    docs: bool = False
    visitas: bool = True
    extra: dict = field(default_factory=dict)

    @classmethod
    def desde_entorno(cls, archivo=ARCHIVO_ENV):
        e = _leer_env(archivo)
        return cls(
            proveedor=e.get("CONGO_PROVEEDOR", "gemini").strip().lower(),
            gemini_llave=e.get("GEMINI_API_KEY", "").strip(),
            gemini_modelo=e.get("CONGO_MODELO_GEMINI", "gemini-flash-latest"),
            claude_llave=e.get("ANTHROPIC_API_KEY", "").strip(),
            claude_modelo=e.get("CONGO_MODELO_CLAUDE", "claude-haiku-5-5"),
            datos=Path(e.get("CONGO_DATOS", "/var/lib/sede-congo")),
            embeddings=e.get("CONGO_EMBEDDINGS", cls.embeddings),
            umbral=float(e.get("CONGO_UMBRAL", "0.45")),
            clave_admin=e.get("CONGO_CLAVE_ADMIN", "").strip(),
            por_hora=int(e.get("CONGO_POR_HORA", "30")),
            por_dia=int(e.get("CONGO_POR_DIA", "1000")),
            max_mb=int(e.get("CONGO_MAX_MB", "20")),
            drive_carpeta=e.get("CONGO_DRIVE_CARPETA", "").strip(),
            credenciales=e.get("SEDE_CREDENCIALES", "/etc/sede-web/cuenta-servicio.json"),
            web=Path(e.get("SEDE_WEB", "/var/www/sede")),
            sincronizar_min=int(e.get("CONGO_SINCRONIZAR_MIN", "10")),
            docs=e.get("CONGO_DOCS", "") == "1",
            visitas=e.get("CONGO_VISITAS", "1") != "0",
        )
