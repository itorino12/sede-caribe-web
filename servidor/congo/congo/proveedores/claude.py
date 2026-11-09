"""Proveedor Claude (Anthropic), el mismo modelo que usaba el asistente v1. Es de pago por uso."""
import json

import httpx

from .base import CuotaAgotada, Proveedor, ProveedorError, ProveedorNoDisponible

API = "https://api.anthropic.com/v1/messages"


class Claude(Proveedor):
    nombre = "claude"

    def __init__(self, llave, modelo="claude-haiku-5-5", api=API, transporte=None, max_tokens=1500):
        self.llave, self.modelo, self.api, self.max_tokens = llave, modelo, api, max_tokens
        self.cliente = httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0), transport=transporte)

    def disponible(self):
        return bool(self.llave)

    def generar(self, sistema, mensajes):
        if not self.llave:
            raise ProveedorNoDisponible("falta ANTHROPIC_API_KEY")
        cuerpo = {"model": self.modelo, "max_tokens": self.max_tokens, "stream": True,
                  "output_config": {"effort": "low"}, "system": sistema, "messages": mensajes}
        cabeceras = {"x-api-key": self.llave, "anthropic-version": "2023-06-01"}
        try:
            with self.cliente.stream("POST", self.api, json=cuerpo, headers=cabeceras) as r:
                if r.status_code != 200:
                    r.read()
                    if r.status_code == 429:
                        raise CuotaAgotada("límite de uso de Claude")
                    if r.status_code in (401, 403):
                        raise ProveedorNoDisponible(f"llave de Claude rechazada ({r.status_code})")
                    raise ProveedorError(f"Claude respondió {r.status_code}")
                for linea in r.iter_lines():
                    if not linea.startswith("data:"):
                        continue
                    ev = json.loads(linea[5:].strip() or "{}")
                    if ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                        yield ev["delta"]["text"]
                    elif ev.get("type") == "error":
                        raise ProveedorError(ev.get("error", {}).get("type", "error de Claude"))
        except httpx.TimeoutException as e:
            raise ProveedorError("Claude tardó demasiado en responder") from e
        except httpx.HTTPError as e:
            raise ProveedorNoDisponible(f"sin conexión con Claude: {type(e).__name__}") from e
