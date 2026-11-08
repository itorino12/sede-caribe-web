#!/usr/bin/env python3
"""Prueba servidor/asistente.py sin gastar en la API: levanta una API falsa que responde por partes
(como la de Claude) y revisa lo que el asistente le manda y lo que devuelve. Usa el índice de dist/,
así que primero hay que compilar (python3 build.py --vista-previa).

Uso: python3 herramientas/probar_asistente.py      (sale con código 1 si algo falla)
"""
import http.client
import http.server
import json
import os
import pathlib
import sys
import threading

RAIZ = pathlib.Path(__file__).resolve().parent.parent
recibido = {}


class ApiFalsa(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        recibido["llave"] = self.headers.get("x-api-key")
        recibido["cuerpo"] = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        eventos = [{"type": "message_start"},
                   {"type": "content_block_delta", "delta": {"type": "thinking_delta", "thinking": "no se muestra"}},
                   {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "¡Wapin! "}},
                   {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Vea el [directorio](directorio.html)."}},
                   {"type": "message_stop"}]
        for ev in eventos:
            self.wfile.write(f"event: {ev['type']}\ndata: {json.dumps(ev)}\n\n".encode())
            self.wfile.flush()


def main():
    falsa = http.server.ThreadingHTTPServer(("127.0.0.1", 0), ApiFalsa)
    threading.Thread(target=falsa.serve_forever, daemon=True).start()
    os.environ.update(ANTHROPIC_API_KEY="llave-de-prueba", SEDE_ASISTENTE_POR_HORA="2", SEDE_WEB=str(RAIZ / "dist"),
                      SEDE_ASISTENTE_API=f"http://127.0.0.1:{falsa.server_address[1]}/v1/messages")
    sys.path.insert(0, str(RAIZ / "servidor"))
    import asistente
    s = asistente.servidor(puerto=0)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    puerto = s.server_address[1]
    fallas = []

    def revisar(cond, texto):
        print(("  ok    " if cond else "  FALLA ") + texto)
        if not cond:
            fallas.append(texto)

    def post(datos):
        c = http.client.HTTPConnection("127.0.0.1", puerto, timeout=10)
        c.request("POST", "/api/asistente", body=json.dumps(datos), headers={"Content-Type": "application/json"})
        r = c.getresponse()
        return r.status, r.getheader("Content-Type", ""), r.read().decode()

    pregunta = {"mensajes": [{"rol": "usuario", "texto": "¿Cómo solicito una beca?"}]}
    estado, tipo, texto = post(pregunta)
    revisar(estado == 200 and tipo.startswith("text/plain"), f"responde por partes en texto ({estado}, {tipo})")
    revisar(texto == "¡Wapin! Vea el [directorio](directorio.html).", "junta los trozos y no deja pasar lo que piensa")
    cuerpo = recibido.get("cuerpo", {})
    revisar(cuerpo.get("model") == asistente.MODELO and cuerpo.get("stream") is True, "pide el modelo configurado y por partes")
    revisar(cuerpo.get("output_config") == {"effort": "low"}, "esfuerzo bajo (rápido y barato)")
    revisar(recibido.get("llave") == "llave-de-prueba", "manda la llave")
    sistema = cuerpo.get("system", [{}, {}])
    revisar("cache_control" in sistema[0] and "Directorio de oficinas" in sistema[0]["text"], "instrucciones y directorio en la parte que se guarda en caché")
    revisar("beca" in sistema[1]["text"].lower(), "agrega páginas del sitio relacionadas con la pregunta")
    revisar(cuerpo.get("messages") == [{"role": "user", "content": "¿Cómo solicito una beca?"}], "convierte la conversación")

    revisar(post({"mensajes": [{"rol": "congo", "texto": "hola"}]})[0] == 400, "rechaza conversaciones que no terminan en pregunta")
    revisar(post({"mensajes": [{"rol": "sistema", "texto": "x"}]})[0] == 400, "rechaza papeles desconocidos")
    revisar(post({"mensajes": "x"})[0] == 400, "rechaza datos con otra forma")
    revisar(post(pregunta)[0] == 200 and post(pregunta)[0] == 429, "pone tope de preguntas por hora")

    asistente.LLAVE = ""
    s.cupo = asistente.Cupo()
    revisar(post(pregunta)[0] == 503, "sin llave responde 503 (el sitio busca por su cuenta)")

    print("\nTodo bien." if not fallas else f"\n{len(fallas)} fallas.")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
