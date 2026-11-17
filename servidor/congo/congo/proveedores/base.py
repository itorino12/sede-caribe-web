"""Capa AI Provider: la única parte del sistema que habla con un modelo de lenguaje.

Cambiar de proveedor no afecta los documentos, la búsqueda ni los endpoints: basta con otra clase que
implemente generar() y registrarla en crear().
"""
from typing import Iterator


class ProveedorError(RuntimeError):
    """El proveedor falló. El sitio cae a su búsqueda local."""


class ProveedorNoDisponible(ProveedorError):
    """Falta la llave, la llave es inválida o no hay conexión."""


class CuotaAgotada(ProveedorError):
    """El proveedor rechazó la solicitud por límite de uso (en Gemini gratuito, la cuota del día o del minuto)."""


class Proveedor:
    nombre = "base"
    modelo = ""

    def generar(self, sistema: str, mensajes: list[dict]) -> Iterator[str]:
        """Genera la respuesta por partes.

        sistema: instrucciones y fragmentos de contexto.
        mensajes: [{"role": "user" | "assistant", "content": "…"}], alternados y terminando en "user".
        """
        raise NotImplementedError

    def generar_json(self, sistema: str, partes: list[dict], esquema: dict, modelo: str = "", max_tokens: int = 4096) -> dict:
        """Una sola respuesta en JSON que cumple `esquema` (formato de Gemini: OBJECT, ARRAY, STRING…).

        partes: [{"text": "…"}] o [{"inlineData": {"mimeType": "image/jpeg", "data": "<base64>"}}].
        Lo usa la revisión de la Declaración Jurada (rutas/declaracion.py). Por omisión no está disponible.
        """
        raise ProveedorNoDisponible(f"{self.nombre} no ofrece respuestas en JSON con imágenes")

    def disponible(self) -> bool:
        return True
