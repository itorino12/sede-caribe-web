"""Declaración Jurada de Horario y Jornada (página declaracion-jurada.html del sitio).

Las reglas se aplican en el navegador (src/assets/js/declaracion-reglas.js); aquí solo se usa la IA para lo que
el navegador no puede hacer:
  - modo «extraer»: leer la tabla y las Observaciones de un PDF o una foto del formulario de la ORH. Los
    formularios exportados por la ORH traen los datos dibujados como trazos, no como texto, así que hay que
    leerlos de la imagen. El navegador tapa en blanco la franja de datos personales y la de firmas antes de
    enviar la imagen, y aquí se enmascara además el texto.
  - modo «revisar»: comentarios sobre lo que el motor de reglas no puede ver (coherencia entre cargo,
    etiquetas y actividades). No se envían nombre, identificación, teléfono ni correo.
Nada se guarda: ni la imagen ni la respuesta.
"""
import base64
import binascii
import json
import logging
from pathlib import Path

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from ..proveedores import CuotaAgotada, ProveedorError
from ..seguridad import enmascarar
from .consultas import ip_de

log = logging.getLogger("congo")
rutas = APIRouter(prefix="/api", tags=["declaración jurada"])

REGLAS = (Path(__file__).resolve().parents[1] / "servicios" / "declaracion_reglas.md").read_text(encoding="utf-8")
DIAS = [("L", "lunes"), ("K", "martes"), ("M", "miercoles"), ("J", "jueves"), ("V", "viernes"), ("S", "sabado")]
MAX_IMAGEN = 6 * 1024 * 1024
MAX_TEXTO = 12000

_txt = {"type": "STRING"}
# El horario va como lista de días con «de» y «a» obligatorios: con 12 campos opcionales (lunes_de…sabado_a),
# gemini-3.5-flash-lite omitía casi todas las horas «A» y días enteros (17 nov., declaración real).
_dia = {"type": "OBJECT", "properties": {
    "dia": {"type": "STRING", "enum": [n for _, n in DIAS]}, "de": _txt, "a": _txt},
    "required": ["dia", "de", "a"], "propertyOrdering": ["dia", "de", "a"]}
_fila = {"type": "OBJECT", "properties": {
    "seccion": {"type": "STRING", "enum": ["ucr", "otras"]},
    "lugar": _txt, "cargo": _txt, "jornada": _txt, "desde": _txt, "hasta": _txt,
    "horario": {"type": "ARRAY", "items": _dia}},
    "required": ["seccion", "lugar", "cargo", "jornada", "desde", "hasta", "horario"],
    "propertyOrdering": ["seccion", "lugar", "cargo", "jornada", "desde", "hasta", "horario"]}
ESQUEMA_EXTRAER = {"type": "OBJECT", "properties": {
    "es_declaracion": {"type": "BOOLEAN"},
    "unidad": _txt,
    "filas": {"type": "ARRAY", "items": _fila},
    "observaciones": {"type": "ARRAY", "items": _txt},
    "legibilidad": {"type": "ARRAY", "items": _txt},
    "dudas": {"type": "ARRAY", "items": _txt}},
    "required": ["es_declaracion", "filas", "observaciones", "legibilidad", "dudas"]}
ESQUEMA_REVISAR = {"type": "OBJECT", "properties": {
    "comentarios": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "regla": _txt, "tipo": {"type": "STRING", "enum": ["error", "verificar"]}, "texto": _txt},
        "required": ["regla", "tipo", "texto"]}}},
    "required": ["comentarios"]}

SISTEMA_EXTRAER = """Usted transcribe la «Declaración Jurada de Horario y Jornada de Trabajo» de la Oficina de Recursos Humanos de la Universidad de Costa Rica. Recibe la imagen de la página y, a veces, parte de su texto.

Copie exactamente lo que está escrito, sin corregir ni completar nada:
- Una fila por cada renglón con datos de la tabla «UNIVERSIDAD DE COSTA RICA» (seccion "ucr") y de la tabla «OTRAS INSTITUCIONES PÚBLICAS, PRIVADAS Y FUNDACIONES» (seccion "otras"), en el orden en que aparecen. Omita los renglones vacíos.
- Columnas: Lugar de Trabajo, Cargo o Categoría, Jornada de Trabajo, Vigencia desde y hasta, y el horario.
- horario: un elemento por cada día de esa fila que tenga alguna hora escrita, con su hora «De» y su hora «A». Cada día ocupa dos columnas (De y A): revise las dos. Recorra los seis días de izquierda a derecha (lunes, martes, miércoles, jueves, viernes, sábado) y no omita ninguno que tenga horas. Celda vacía = cadena vacía.
- Antes de responder, compruebe cada fila contra las Observaciones: suelen repetir los mismos días y horas (L = lunes, K = martes, M = miércoles, J = jueves, V = viernes, S = sábado). Si una Observación menciona un día que usted no anotó en la fila, vuelva a mirar esa fila en la imagen. Copie de la tabla, no de las Observaciones.
- Fechas y horas tal como se ven: si dice «20-7-2026», escriba «20-7-2026»; si dice «08:00», escriba «08:00».
- Observaciones: una cadena por renglón, con el texto completo y literal (abreviaturas de días incluidas: L, K, M, J, V, S).
- Las zonas tapadas en blanco tenían datos personales o firmas: ignórelas y no las mencione.
- legibilidad: problemas visuales concretos que vea (texto cortado, letra demasiado pequeña para leerse, columnas desplazadas, celdas que deberían tener datos y están vacías). Lista vacía si no hay.
- dudas: valores que no pudo leer con seguridad, con su fila y columna. Lista vacía si no hay.
- es_declaracion: false si la imagen no es este formulario.
Nunca invente valores."""

SISTEMA_REVISAR = f"""Usted es el revisor descrito en las reglas de abajo. Recibe una declaración ya leída (en JSON, sin datos personales) y los hallazgos que un programa ya calculó con las reglas numéricas (horas, topes, traslapes, almuerzo, coincidencia de Observaciones, desglose docente).

No repita esos hallazgos ni vuelva a calcular horas. Agregue solo lo que un programa no puede juzgar: si el cargo declarado es coherente con las Observaciones y su etiqueta (B9), actividades en el rubro equivocado (B12), etiquetas que confunden (por ejemplo, una fundación descrita como si fuera la UCR), categorías que no corresponden al régimen (B8), riesgos de incompatibilidad (A9) y cargas poco usuales. Cada comentario: regla (código), tipo «error» solo si es un incumplimiento claro y «verificar» si depende de un documento, y un texto de una o dos oraciones, directo, en español y de usted. Máximo 6 comentarios; lista vacía si no hay nada que agregar.

REGLAS
{REGLAS}"""


def _error(codigo, mensaje):
    return JSONResponse({"success": False, "error": mensaje}, status_code=codigo)


def _limpio(v, largo=300):
    return enmascarar(str(v or "").strip())[:largo]


def _dias(horario):
    letra = {n: l for l, n in DIAS}
    dias = {}
    for h in (horario or [])[:12]:
        if not isinstance(h, dict) or h.get("dia") not in letra or not (h.get("de") or h.get("a")):
            continue
        dias[letra[h["dia"]]] = {"de": _limpio(h.get("de"), 12), "a": _limpio(h.get("a"), 12)}
    return dias


def _normalizar(d):
    filas = []
    for f in (d.get("filas") or [])[:16]:
        if not isinstance(f, dict):
            continue
        filas.append({
            "seccion": "otras" if f.get("seccion") == "otras" else "ucr",
            **{k: _limpio(f.get(k), 120) for k in ("lugar", "cargo", "jornada", "desde", "hasta")},
            "dias": _dias(f.get("horario")),
        })
    lista = lambda k, n=20: [_limpio(x, 600) for x in (d.get(k) or [])[:n] if str(x or "").strip()]  # noqa: E731
    return {"es_declaracion": bool(d.get("es_declaracion", True)), "unidad": _limpio(d.get("unidad"), 120), "filas": filas,
            "observaciones": lista("observaciones"), "legibilidad": lista("legibilidad", 10), "dudas": lista("dudas", 10)}


@rutas.post("/declaracion", summary="Lee o comenta una Declaración Jurada de Horario y Jornada (IA)")
def declaracion(request: Request, cuerpo: dict = Body(...)):
    s = request.app.state.s
    if not isinstance(cuerpo, dict) or cuerpo.get("modo") not in ("extraer", "revisar"):
        return _error(400, "modo inválido")
    if not s.cupo.permitir(ip_de(request)):
        return _error(429, "demasiadas consultas; intente de nuevo más tarde")
    modelo = s.config.modelo_declaracion
    try:
        if cuerpo["modo"] == "extraer":
            mime = cuerpo.get("mime") or "image/jpeg"
            if mime not in ("image/jpeg", "image/png"):
                return _error(400, "la imagen debe ser JPEG o PNG")
            datos = str(cuerpo.get("imagen") or "")
            try:
                bruto = base64.b64decode(datos, validate=True)
            except (binascii.Error, ValueError):
                return _error(400, "imagen inválida")
            if not bruto or len(bruto) > MAX_IMAGEN:
                return _error(400, "falta la imagen o es demasiado grande")
            partes = [{"inlineData": {"mimeType": mime, "data": datos}}]
            texto = enmascarar(str(cuerpo.get("texto") or ""))[:MAX_TEXTO]
            if texto.strip():
                partes.append({"text": "Texto que trae el PDF (puede estar incompleto: los datos de la tabla suelen venir "
                                       "como dibujo y no como texto):\n" + texto})
            respuesta = s.proveedor.generar_json(SISTEMA_EXTRAER, partes, ESQUEMA_EXTRAER, modelo=modelo, max_tokens=6000)
            return {"success": True, "datos": _normalizar(respuesta if isinstance(respuesta, dict) else {})}
        decl = cuerpo.get("declaracion")
        if not isinstance(decl, dict):
            return _error(400, "falta la declaración")
        decl = {k: v for k, v in decl.items() if k in ("filas", "observaciones", "jornadaNombrada", "cuartoAdicional")}
        hallazgos = [h for h in (cuerpo.get("hallazgos") or [])[:60] if isinstance(h, (str, dict))]
        texto = enmascarar(json.dumps({"declaracion": decl, "hallazgos_del_programa": hallazgos}, ensure_ascii=False))[:30000]
        respuesta = s.proveedor.generar_json(SISTEMA_REVISAR, [{"text": texto}], ESQUEMA_REVISAR, modelo=modelo, max_tokens=2000)
        comentarios = [{"regla": _limpio(c.get("regla"), 20), "tipo": "error" if c.get("tipo") == "error" else "verificar",
                        "texto": _limpio(c.get("texto"), 600)}
                       for c in (respuesta.get("comentarios") if isinstance(respuesta, dict) else None) or [] if isinstance(c, dict)][:6]
        return {"success": True, "comentarios": comentarios}
    except CuotaAgotada:
        return _error(503, "la IA alcanzó su límite de uso por hoy")
    except ProveedorError as e:
        log.warning("declaración: proveedor no disponible: %s", e)
        return _error(503, "la IA no está disponible")
