"""POST /api/visita: cuenta una vista de página, sin cookies ni datos personales (ver servicios/visitas.py)."""
from fastapi import APIRouter, Request
from fastapi.responses import Response

from .consultas import ip_de

rutas = APIRouter(prefix="/api", tags=["visitas"])


@rutas.post("/visita", summary="Cuenta una vista de página (sin cookies ni datos personales)", status_code=204,
            include_in_schema=True)
async def visita(request: Request):
    """Cuerpo: `{"p": "/ruta.html", "r": "dominio.de.origen", "d": "m"|"e"}`. Siempre responde 204: no revela si contó."""
    s = request.app.state.s
    if s.visitas is not None:
        try:
            cuerpo = await request.json()
        except ValueError:
            cuerpo = None
        if isinstance(cuerpo, dict):
            s.visitas.registrar(cuerpo.get("p"), cuerpo.get("r"), cuerpo.get("d"), ip_de(request),
                                request.headers.get("user-agent"))
    return Response(status_code=204)
