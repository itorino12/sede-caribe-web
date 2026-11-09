"""Administración de documentos. Todas las rutas exigen la cabecera X-Congo-Clave."""
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..documentos.extractores import ArchivoInvalido
from ..documentos.registro import a_json
from ..documentos.repositorio import Rechazado
from ..seguridad import clave_valida


def exigir_clave(request: Request, x_congo_clave: str = Header("", include_in_schema=True)):
    if not clave_valida(request.app.state.s.config.clave_admin, x_congo_clave):
        raise HTTPException(401, "clave de administración inválida o no configurada")


rutas = APIRouter(prefix="/api/documents", tags=["documentos"], dependencies=[Depends(exigir_clave)])


def _publico(doc):
    doc = a_json(doc)
    doc.pop("archivo", None)  # la ruta en disco no se expone
    return doc


@rutas.post("/upload", status_code=201, summary="Incorpora o actualiza un documento")
async def subir(request: Request, archivo: UploadFile = File(...), id: str = Form(""), nombre: str = Form(""),
                categoria: str = Form("institucional"), subcategoria: str = Form(""), version: str = Form(""),
                vigencia: str = Form("vigente"), fecha_publicacion: str = Form(""), fecha_actualizacion: str = Form(""),
                url: str = Form(""), confidencial: str = Form("no")):
    s = request.app.state.s
    limite = s.config.max_mb * 1024 * 1024
    datos = await archivo.read(limite + 1)
    if len(datos) > limite:
        return JSONResponse({"success": False, "error": f"el archivo pasa de {s.config.max_mb} MB"}, status_code=413)
    meta = dict(id=id, nombre=nombre, categoria=categoria, subcategoria=subcategoria, version=version, vigencia=vigencia,
                fecha_publicacion=fecha_publicacion, fecha_actualizacion=fecha_actualizacion, url=url,
                confidencial=confidencial, origen="subida")
    try:
        from starlette.concurrency import run_in_threadpool
        r = await run_in_threadpool(s.repositorio.incorporar, archivo.filename or "documento", datos, meta)
    except ArchivoInvalido as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=415)
    except Rechazado as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=409 if "duplicado" in str(e) else 422)
    return {"success": True, "estado": r.estado, "documento": _publico(r.documento)}


@rutas.get("", summary="Lista los documentos")
def listar(request: Request, categoria: str | None = None, vigencia: str | None = None, origen: str | None = None):
    docs = request.app.state.s.repositorio.registro.listar(categoria, vigencia, origen)
    return {"success": True, "total": len(docs), "documentos": [_publico(d) for d in docs]}


def _uno(request, doc_id):
    doc = request.app.state.s.repositorio.registro.obtener(doc_id)
    if not doc:
        raise HTTPException(404, "documento no encontrado")
    return doc


@rutas.get("/{doc_id}", summary="Ficha de un documento, con su historial de versiones")
def ver(request: Request, doc_id: str):
    doc = _uno(request, doc_id)
    return {"success": True, "documento": _publico(doc),
            "historial": request.app.state.s.repositorio.registro.historial(doc_id)}


class CambioVigencia(BaseModel):
    vigencia: str = Field(pattern="^(vigente|derogado|reemplazado|retirado)$")


@rutas.patch("/{doc_id}", summary="Cambia la vigencia (un documento no vigente deja de usarse como fuente)")
def cambiar(request: Request, doc_id: str, cambio: CambioVigencia):
    _uno(request, doc_id)
    try:
        doc = request.app.state.s.repositorio.cambiar_vigencia(doc_id, cambio.vigencia)
    except (Rechazado, ArchivoInvalido, OSError) as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)
    return {"success": True, "documento": _publico(doc)}


@rutas.delete("/{doc_id}", summary="Elimina el documento, su archivo y sus fragmentos")
def eliminar(request: Request, doc_id: str):
    _uno(request, doc_id)
    request.app.state.s.repositorio.eliminar(doc_id)
    return {"success": True}


@rutas.post("/{doc_id}/reprocess", summary="Vuelve a extraer y vectorizar el documento")
def reprocesar(request: Request, doc_id: str):
    _uno(request, doc_id)
    try:
        doc = request.app.state.s.repositorio.reprocesar(doc_id)
    except (Rechazado, ArchivoInvalido, OSError) as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=422)
    return {"success": True, "documento": _publico(doc)}
