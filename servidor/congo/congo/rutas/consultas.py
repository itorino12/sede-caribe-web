"""Consultas públicas: /api/asistente (contrato del sitio), /api/chat (JSON), /api/search y /api/health."""
import logging

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from ..proveedores import CuotaAgotada, ProveedorError
from ..servicios.chat import ConversacionInvalida

log = logging.getLogger("congo")
rutas = APIRouter(prefix="/api", tags=["consultas"])

EJEMPLO = {"mensajes": [{"rol": "usuario", "texto": "¿Cómo solicito una beca?"}]}


def ip_de(request: Request):
    """Detrás de nginx, la IP real llega en X-Real-IP; solo se cree si la conexión viene de la propia máquina."""
    cliente = request.client.host if request.client else ""
    if cliente in ("127.0.0.1", "::1") and request.headers.get("x-real-ip"):
        return request.headers["x-real-ip"]
    return cliente


def _error(codigo, mensaje):
    return JSONResponse({"success": False, "error": mensaje}, status_code=codigo)


def _preparar(request, cuerpo):
    s = request.app.state.s
    if not s.cupo.permitir(ip_de(request)):
        return None, _error(429, "demasiadas preguntas; intente de nuevo más tarde")
    try:
        return s.chat.responder(cuerpo.get("mensajes") if isinstance(cuerpo, dict) else None), None
    except ConversacionInvalida as e:
        return None, _error(400, str(e))


@rutas.post("/asistente", summary="Chat del sitio (respuesta por partes, en texto)",
            response_class=StreamingResponse,
            responses={200: {"content": {"text/plain": {}}, "description": "Respuesta en markdown simple, con «Fuentes» al final"},
                       429: {"description": "Límite de preguntas"}, 503: {"description": "Proveedor no disponible: el sitio busca por su cuenta"}})
def asistente(request: Request, cuerpo: dict = Body(..., examples=[EJEMPLO])):
    """Contrato del frontend actual (asistente.js): `{"mensajes":[{"rol":"usuario"|"congo","texto":"…"}]}`."""
    respuesta, error = _preparar(request, cuerpo)
    if error:
        return error
    partes = respuesta.partes
    try:  # se pide el primer trozo antes de contestar: si el proveedor falla, el sitio usa su búsqueda local
        primero = next(partes)
    except (ProveedorError, StopIteration) as e:
        log.warning("proveedor no disponible: %s", e)
        return _error(503, "el asistente no está disponible")

    def flujo():
        yield primero
        try:
            yield from partes
        except ProveedorError as e:
            log.warning("se cortó la respuesta: %s", e)
            yield "\n\n(Se me cortó la conexión. Intente de nuevo en un momento, por favor.)"

    return StreamingResponse(flujo(), media_type="text/plain; charset=utf-8",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


class Fuente(BaseModel):
    document: str
    section: str | None = None
    page: int | None = None
    sheet: str | None = None
    rows: str | None = None
    excerpt: str
    url: str | None = None
    version: str | None = None
    document_id: str
    similarity: float


class RespuestaChat(BaseModel):
    success: bool
    answer: str
    sources: list[Fuente]
    confidence: str = Field(description="high | medium | low | none, calculada con la recuperación")
    requires_human_review: bool


@rutas.post("/chat", response_model=RespuestaChat, summary="Chat en JSON, con fuentes estructuradas")
def chat(request: Request, cuerpo: dict = Body(..., examples=[EJEMPLO])):
    respuesta, error = _preparar(request, cuerpo)
    if error:
        return error
    try:
        "".join(respuesta.partes)
    except CuotaAgotada:
        return _error(503, "cuota del proveedor agotada")
    except ProveedorError as e:
        log.warning("proveedor no disponible: %s", e)
        return _error(503, "el asistente no está disponible")
    return respuesta.resultado


class Busqueda(BaseModel):
    consulta: str = Field(min_length=2, max_length=500)
    cuantos: int = Field(6, ge=1, le=10)
    categoria: str | None = Field(None, pattern="^(institucional|normativa)$")


@rutas.post("/search", summary="Busca fragmentos de documentos vigentes (sin IA)")
def buscar(request: Request, b: Busqueda):
    s = request.app.state.s
    if not s.cupo.permitir(ip_de(request)):
        return _error(429, "demasiadas consultas")
    hallazgos = s.recuperacion.buscar(b.consulta, b.cuantos, b.categoria)
    return {"success": True, "results": [{
        "document": h.fragmento["nombre"], "document_id": h.fragmento["doc_id"], "category": h.fragmento["categoria"],
        "section": h.fragmento["seccion"], "page": h.fragmento["pagina"], "sheet": h.fragmento["hoja"],
        "rows": h.fragmento["filas"], "excerpt": h.fragmento["texto"][:600], "url": h.fragmento["fuente"],
        "similarity": h.similitud} for h in hallazgos]}


@rutas.get("/health", summary="Estado del servicio")
def salud(request: Request):
    s = request.app.state.s
    return {"ok": True, "proveedor": s.proveedor.nombre, "modelo": getattr(s.proveedor, "modelo", ""),
            "con_llave": s.proveedor.disponible(), "fragmentos": s.repositorio.vectores.contar()}


@rutas.get("/asistente/salud", include_in_schema=False)
def salud_v1(request: Request):  # la ruta de revisión del asistente v1 sigue funcionando
    return salud(request)
