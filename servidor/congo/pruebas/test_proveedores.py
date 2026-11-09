"""Módulo 3: proveedores. Se simula la API con un transporte falso de httpx (no se gasta cuota)."""
import json

import httpx
import pytest

from congo.proveedores import CuotaAgotada, ProveedorError, ProveedorNoDisponible
from congo.proveedores.claude import Claude
from congo.proveedores.gemini import Gemini

MENSAJES = [{"role": "user", "content": "hola"}, {"role": "assistant", "content": "¡Hola!"},
            {"role": "user", "content": "¿becas?"}]


def sse(eventos):
    return "".join(f"data: {json.dumps(e)}\r\n\r\n" for e in eventos).encode()


def test_gemini_formato_y_streaming():
    visto = {}

    def api(pedido):
        visto["url"], visto["llave"] = str(pedido.url), pedido.headers["x-goog-api-key"]
        visto["cuerpo"] = json.loads(pedido.content)
        return httpx.Response(200, content=sse([
            {"candidates": [{"content": {"parts": [{"text": "pensando", "thought": True}]}}]},
            {"candidates": [{"content": {"parts": [{"text": "Las becas "}]}}]},
            {"candidates": [{"content": {"parts": [{"text": "se piden en línea."}]}, "finishReason": "STOP"}]}]),
            headers={"content-type": "text/event-stream"})

    g = Gemini("LLAVE", "gemini-flash-latest", transporte=httpx.MockTransport(api))
    assert "".join(g.generar("instrucciones", MENSAJES)) == "Las becas se piden en línea."
    assert visto["url"].endswith("/models/gemini-flash-latest:streamGenerateContent?alt=sse")
    assert visto["llave"] == "LLAVE" and "LLAVE" not in visto["url"]  # la llave va en cabecera, no en la URL
    assert [c["role"] for c in visto["cuerpo"]["contents"]] == ["user", "model", "user"]
    assert visto["cuerpo"]["systemInstruction"]["parts"][0]["text"] == "instrucciones"


@pytest.mark.parametrize("codigo,cuerpo,error", [
    (429, {"error": {"message": "Resource exhausted"}}, CuotaAgotada),
    (400, {"error": {"message": "API key not valid. Please pass a valid API key."}}, ProveedorNoDisponible),
    (500, {"error": {"message": "interno"}}, ProveedorError)])
def test_gemini_errores(codigo, cuerpo, error):
    g = Gemini("LLAVE", transporte=httpx.MockTransport(lambda p: httpx.Response(codigo, json=cuerpo)))
    with pytest.raises(error):
        list(g.generar("s", MENSAJES))


def test_gemini_sin_llave_y_sin_red():
    with pytest.raises(ProveedorNoDisponible):
        list(Gemini("").generar("s", MENSAJES))

    def caida(p):
        raise httpx.ConnectError("sin red")
    with pytest.raises(ProveedorNoDisponible):
        list(Gemini("L", transporte=httpx.MockTransport(caida)).generar("s", MENSAJES))


def test_gemini_bloqueo():
    g = Gemini("L", transporte=httpx.MockTransport(
        lambda p: httpx.Response(200, content=sse([{"promptFeedback": {"blockReason": "SAFETY"}}]))))
    with pytest.raises(ProveedorError, match="bloqueó"):
        list(g.generar("s", MENSAJES))


def test_claude_streaming_y_cuota():
    ok = sse([{"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hola "}},
              {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "de nuevo"}}])
    c = Claude("L", transporte=httpx.MockTransport(lambda p: httpx.Response(200, content=ok)))
    assert "".join(c.generar("s", MENSAJES)) == "Hola de nuevo"
    c = Claude("L", transporte=httpx.MockTransport(lambda p: httpx.Response(429, json={})))
    with pytest.raises(CuotaAgotada):
        list(c.generar("s", MENSAJES))
