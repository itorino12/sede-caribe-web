"""Elige el proveedor de IA según CONGO_PROVEEDOR."""
from .base import CuotaAgotada, Proveedor, ProveedorError, ProveedorNoDisponible  # noqa: F401


class Falso(Proveedor):
    """Proveedor de pruebas: no llama a ninguna API. Responde citando el primer fragmento del contexto."""
    nombre = "falso"
    modelo = "falso"

    def __init__(self, respuesta=None, error=None):
        self.respuesta, self.error = respuesta, error
        self.llamadas = []

    def generar(self, sistema, mensajes):
        self.llamadas.append((sistema, mensajes))
        if self.error:
            raise self.error
        texto = self.respuesta or "Según la normativa, el trámite se hace ante Registro [F1]."
        for i in range(0, len(texto), 7):
            yield texto[i:i + 7]


def crear(config):
    if config.proveedor == "gemini":
        from .gemini import Gemini
        return Gemini(config.gemini_llave, config.gemini_modelo)
    if config.proveedor == "claude":
        from .claude import Claude
        return Claude(config.claude_llave, config.claude_modelo)
    if config.proveedor == "falso":
        return Falso()
    raise ValueError(f"CONGO_PROVEEDOR desconocido: {config.proveedor} (use gemini o claude)")
