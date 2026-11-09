"""Administración: estadísticas, preguntas sin respuesta, categorías y sincronización. Exigen X-Congo-Clave."""
from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from .documentos import exigir_clave

rutas = APIRouter(prefix="/api/admin", tags=["administración"], dependencies=[Depends(exigir_clave)])


@rutas.get("/stats", summary="Documentos por categoría y vigencia, y uso por día")
def estadisticas(request: Request):
    s = request.app.state.s
    datos = s.repositorio.registro.estadisticas()
    datos.update(success=True, proveedor=s.proveedor.nombre, modelo=getattr(s.proveedor, "modelo", ""),
                 embeddings=s.repositorio.embebedor.nombre, umbral=s.config.umbral,
                 ultima_sincronizacion=getattr(s.sincronizador, "ultimo", None))
    return datos


@rutas.get("/unanswered", summary="Preguntas sin respuesta de los últimos 30 días (con datos personales ocultos)")
def sin_respuesta(request: Request, limite: int = 200):
    return {"success": True, "preguntas": request.app.state.s.repositorio.registro.preguntas_sin_respuesta(min(limite, 1000))}


@rutas.get("/categories", summary="Categorías y subcategorías, con cuántos documentos vigentes tiene cada una")
def categorias(request: Request):
    return {"success": True, "categorias": request.app.state.s.repositorio.registro.categorias()}


@rutas.post("/sync", summary="Sincroniza ya la carpeta de Drive y las páginas del sitio")
async def sincronizar(request: Request):
    informe = await run_in_threadpool(request.app.state.s.sincronizador.todo)
    return {"success": True, "informe": informe}
