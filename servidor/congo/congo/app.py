"""API Controller: arma la aplicación FastAPI y los servicios que comparten las rutas.

Se ejecuta con un solo proceso (uvicorn --workers 1): Chroma y SQLite tienen un solo escritor.
"""
import logging
import threading
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import proveedores
from .busqueda import embeddings
from .busqueda.vectores import Vectores
from .config import Config
from .documentos.repositorio import Repositorio
from .seguridad import Cupo
from .servicios.chat import Chat
from .servicios.recuperacion import Recuperacion

log = logging.getLogger("congo")
LIMITE_JSON = 64 * 1024


@dataclass
class Servicios:
    config: Config
    repositorio: Repositorio
    recuperacion: Recuperacion
    chat: Chat
    cupo: Cupo
    proveedor: object
    sincronizador: object = None


def crear_servicios(config, proveedor=None, embebedor=None):
    config.datos.mkdir(parents=True, exist_ok=True)
    emb = embebedor or embeddings.crear(config)
    vectores = Vectores(config.datos / "chroma", emb.nombre)
    repo = Repositorio(config.datos, emb, vectores)
    rec = Recuperacion(repo.registro, emb, vectores, umbral=config.umbral)
    prov = proveedor or proveedores.crear(config)
    from .ingesta import Sincronizador
    return Servicios(config, repo, rec, Chat(rec, prov, repo.registro), Cupo(config.por_hora, config.por_dia), prov,
                     Sincronizador(repo, config))


def _ciclo_sincronizacion(s, parar):
    minutos = s.config.sincronizar_min
    while not parar.wait(5 if minutos else 3600):
        if not minutos:
            continue
        try:
            s.sincronizador.todo()
        except Exception:  # un fallo de Drive no debe tumbar el asistente
            log.exception("falló la sincronización")
        if parar.wait(minutos * 60):
            return


def crear_app(config=None, servicios=None):
    config = config or Config.desde_entorno()
    s = servicios or crear_servicios(config)

    @asynccontextmanager
    async def vida(app):
        parar = threading.Event()
        if s.config.sincronizar_min and s.sincronizador:
            threading.Thread(target=_ciclo_sincronizacion, args=(s, parar), daemon=True).start()
        yield
        parar.set()

    app = FastAPI(title="CONGO 2.0", version="2.0.0", lifespan=vida,
                  description="Asistente de la UCR Sede del Caribe: respuestas con base en documentos oficiales.",
                  docs_url="/api/docs" if config.docs else None, redoc_url=None,
                  openapi_url="/api/openapi.json" if config.docs else None)
    app.state.s = s

    @app.middleware("http")
    async def limitar_tamano(request: Request, siguiente):
        limite = config.max_mb * 1024 * 1024 + 64 * 1024 if request.url.path == "/api/documents/upload" else LIMITE_JSON
        try:
            largo = int(request.headers.get("content-length") or 0)
        except ValueError:
            largo = limite + 1
        if largo > limite:
            return JSONResponse({"success": False, "error": "solicitud demasiado grande"}, status_code=413)
        respuesta = await siguiente(request)
        respuesta.headers.setdefault("Cache-Control", "no-store")
        respuesta.headers.setdefault("X-Content-Type-Options", "nosniff")
        return respuesta

    @app.exception_handler(Exception)
    async def error_general(request, exc):
        log.exception("error no controlado en %s", request.url.path)  # sin el contenido de la pregunta
        return JSONResponse({"success": False, "error": "error interno"}, status_code=500)

    from .rutas import admin, consultas, documentos
    app.include_router(consultas.rutas)
    app.include_router(documentos.rutas)
    app.include_router(admin.rutas)
    return app
