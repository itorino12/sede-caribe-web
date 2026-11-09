"""Chat Service: une seguridad, recuperación, prompt, proveedor y citas.

Flujo de una pregunta:
  1. Valida la conversación y oculta datos personales.
  2. Arma la consulta (la última pregunta, más la anterior si la última es muy corta).
  3. Recupera fragmentos vigentes. Si ninguno pasa el umbral, responde que no tiene la información,
     sin llamar al modelo, y anota la pregunta (oculta) en «sin respuesta».
  4. Llama al proveedor con los fragmentos numerados y va quitando las marcas [F#] del texto.
  5. Al final agrega las fuentes reales y calcula la confianza.
"""
import re
import threading
from dataclasses import dataclass, field

from ..proveedores import ProveedorError
from ..seguridad import OCULTO, enmascarar
from . import citas, prompts

SALUDO = re.compile(r"^\s*(hola|buenas|buenos d[ií]as|buenas tardes|buenas noches|wapin|gracias|muchas gracias|ok|"
                    r"listo|adi[oó]s|chao|pura vida)\W*$", re.IGNORECASE)
SIN_INFORMACION = ("No tengo esa información en los documentos oficiales que consulto. Le recomiendo revisar el "
                   "[directorio](directorio.html) para ubicar la oficina correspondiente, o preguntarme de otra forma.")
RESPUESTA_SALUDO = ("¡Wapin! Con gusto le ayudo. Pregúnteme sobre carreras, admisión, becas, trámites, reglamentos, "
                    "horarios o cómo llegar a la Sede.")
CONTRADICCION = re.compile(r"fuentes no coinciden|se contradicen|contradicci[oó]n", re.IGNORECASE)


class ConversacionInvalida(ValueError):
    pass


def limpiar(mensajes):
    """Convierte la conversación del sitio ({rol: usuario|congo, texto}) al formato de los proveedores."""
    if not isinstance(mensajes, list) or not mensajes:
        raise ConversacionInvalida("conversación vacía")
    salida = []
    for m in mensajes[-12:]:
        if not isinstance(m, dict) or m.get("rol") not in ("usuario", "congo") or not isinstance(m.get("texto"), str):
            raise ConversacionInvalida("mensaje con formato inválido")
        texto = m["texto"].strip()[:1500]
        if m["rol"] == "congo":
            texto = texto.split("\n\n**Fuentes:**")[0]  # las fuentes no hacen falta en el historial
        if not texto:
            continue
        rol = "user" if m["rol"] == "usuario" else "assistant"
        texto = enmascarar(texto) if rol == "user" else texto
        if salida and salida[-1]["role"] == rol:
            salida[-1]["content"] += "\n\n" + texto
        else:
            salida.append({"role": rol, "content": texto})
    while salida and salida[0]["role"] != "user":
        salida.pop(0)
    if not salida or salida[-1]["role"] != "user":
        raise ConversacionInvalida("la conversación debe terminar con una pregunta")
    return salida


@dataclass
class Respuesta:
    """Se recorre `partes` para obtener el texto por partes; al terminar, `resultado` tiene el JSON completo."""
    partes: object = None
    resultado: dict = field(default_factory=dict)


class Chat:
    def __init__(self, recuperacion, proveedor, registro, simultaneas=4):
        self.recuperacion, self.proveedor, self.registro = recuperacion, proveedor, registro
        self.turnos = threading.BoundedSemaphore(simultaneas)  # protege el límite por minuto del proveedor

    def consulta(self, mensajes):
        # los datos ocultos no aportan a la búsqueda y diluyen la consulta
        preguntas = [m["content"].replace(OCULTO, " ") for m in mensajes if m["role"] == "user"]
        ultima = preguntas[-1]
        if len(ultima.split()) < 5 and len(preguntas) > 1:  # «¿y los requisitos?»
            return preguntas[-2][-300:] + " " + ultima
        return ultima

    def responder(self, conversacion, buscar_hasta=6):
        mensajes = limpiar(conversacion)
        respuesta = Respuesta()
        self.registro.contar("preguntas")
        ultima = mensajes[-1]["content"]

        if SALUDO.match(ultima):
            respuesta.partes = self._fijo(respuesta, RESPUESTA_SALUDO, "none", False)
            return respuesta
        hallazgos = self.recuperacion.buscar(self.consulta(mensajes), buscar_hasta)
        if not hallazgos:
            self.registro.contar("sin_respuesta")
            self.registro.sin_respuesta(ultima)
            respuesta.partes = self._fijo(respuesta, SIN_INFORMACION, "none", True)
            return respuesta
        respuesta.partes = self._generar(respuesta, mensajes, hallazgos)
        return respuesta

    @staticmethod
    def _fijo(respuesta, texto, confianza, revisar):
        respuesta.resultado = {"success": True, "answer": texto, "sources": [], "confidence": confianza,
                               "requires_human_review": revisar}
        yield texto

    def _generar(self, respuesta, mensajes, hallazgos):
        filtro = citas.FiltroCitas(len(hallazgos))
        texto = []
        if not self.turnos.acquire(timeout=20):
            raise ProveedorError("demasiadas preguntas simultáneas")
        try:
            for trozo in self.proveedor.generar(prompts.sistema(hallazgos), mensajes):
                limpio = filtro.agregar(trozo)
                if limpio:
                    texto.append(limpio)
                    yield limpio
            resto = filtro.cerrar()
            if resto:
                texto.append(resto)
                yield resto
        except ProveedorError:
            self.registro.contar("fallas")
            raise
        finally:
            self.turnos.release()

        cuerpo = "".join(texto).strip()
        if not cuerpo:
            self.registro.contar("fallas")
            raise ProveedorError("el proveedor devolvió una respuesta vacía")
        lista = citas.fuentes(hallazgos, filtro.usados)
        if lista:
            confianza = self.recuperacion.confianza([hallazgos[n - 1] for n in filtro.usados])
        else:  # respondió sin citar: o no tenía la información, o no se puede comprobar de dónde la sacó
            confianza = "low"
            self.registro.contar("sin_respuesta")
            self.registro.sin_respuesta(mensajes[-1]["content"])
        contradiccion = bool(CONTRADICCION.search(cuerpo))
        pie = citas.markdown(lista)
        if pie:
            yield pie
        respuesta.resultado = {"success": True, "answer": cuerpo, "sources": lista, "confidence": confianza,
                               "requires_human_review": confianza == "low" or contradiccion}
