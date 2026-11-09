"""Proveedor Gemini (Google AI Studio), por la API REST con respuesta por partes (SSE).

Nivel gratuito: no requiere facturación. Google puede usar y revisar lo que recibe, por eso el chat
enmascara datos personales antes de llamar aquí y solo se indexan documentos públicos.
"""
import json

import httpx

from .base import CuotaAgotada, Proveedor, ProveedorError, ProveedorNoDisponible

API = "https://generativelanguage.googleapis.com/v1beta"


class Gemini(Proveedor):
    nombre = "gemini"

    def __init__(self, llave, modelo="gemini-flash-latest", api=API, transporte=None, max_tokens=1500):
        self.llave, self.modelo, self.api = llave, modelo, api.rstrip("/")
        self.max_tokens = max_tokens
        self.cliente = httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0), transport=transporte)

    def disponible(self):
        return bool(self.llave)

    def generar(self, sistema, mensajes):
        if not self.llave:
            raise ProveedorNoDisponible("falta GEMINI_API_KEY")
        cuerpo = {
            "systemInstruction": {"parts": [{"text": sistema}]},
            "contents": [{"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
                         for m in mensajes],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": self.max_tokens},
        }
        url = f"{self.api}/models/{self.modelo}:streamGenerateContent"
        try:
            with self.cliente.stream("POST", url, params={"alt": "sse"}, json=cuerpo,
                                     headers={"x-goog-api-key": self.llave}) as r:
                if r.status_code != 200:
                    self._error(r.status_code, r.read())
                for linea in r.iter_lines():
                    if not linea.startswith("data:"):
                        continue
                    ev = json.loads(linea[5:].strip() or "{}")
                    if ev.get("error"):
                        raise ProveedorError(ev["error"].get("message", "error de Gemini")[:200])
                    bloqueo = ev.get("promptFeedback", {}).get("blockReason")
                    if bloqueo:
                        raise ProveedorError(f"Gemini bloqueó la pregunta ({bloqueo})")
                    for cand in ev.get("candidates", [])[:1]:
                        for parte in cand.get("content", {}).get("parts", []):
                            if parte.get("text") and not parte.get("thought"):
                                yield parte["text"]
        except httpx.TimeoutException as e:
            raise ProveedorError("Gemini tardó demasiado en responder") from e
        except httpx.HTTPError as e:
            raise ProveedorNoDisponible(f"sin conexión con Gemini: {type(e).__name__}") from e

    @staticmethod
    def _error(codigo, cuerpo):
        try:
            mensaje = json.loads(cuerpo).get("error", {}).get("message", "")
        except ValueError:
            mensaje = cuerpo[:200].decode("utf-8", "replace")
        if codigo == 429:
            raise CuotaAgotada(f"cuota de Gemini agotada: {mensaje[:200]}")
        if codigo in (401, 403) or "API key" in mensaje:
            raise ProveedorNoDisponible(f"llave de Gemini rechazada ({codigo})")
        raise ProveedorError(f"Gemini respondió {codigo}: {mensaje[:200]}")
