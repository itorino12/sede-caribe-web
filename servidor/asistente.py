#!/usr/bin/env python3
"""Asistente de la Sede (el congo): recibe las preguntas del sitio y responde con Claude, por partes.

nginx le pasa POST /api/asistente (ver nginx-sede.conf); corre como servicio (sede-asistente.service).
Solo usa la biblioteca estándar de Python.

Qué sabe: en cada pregunta busca en el índice del sitio (assets/js/indice.js, el mismo del buscador)
las páginas que más se parecen y se las da a Claude junto con el mapa del sitio y el directorio.
No guarda las conversaciones; en el registro solo anota cuántas preguntas hubo.

Variables de entorno (en /etc/sede-web/sede.env):
  ANTHROPIC_API_KEY          llave de la API de Claude. Sin ella responde 503 y el sitio busca por su cuenta.
  SEDE_ASISTENTE_MODELO      modelo (claude-haiku-5-5)
  SEDE_ASISTENTE_PUERTO      puerto local (8787)
  SEDE_ASISTENTE_POR_HORA    preguntas por hora y por dirección IP (30)
  SEDE_ASISTENTE_POR_DIA     preguntas por día en total, para acotar el gasto (3000)
  SEDE_WEB                   carpeta publicada del sitio (/var/www/sede)
  SEDE_ASISTENTE_API         dirección de la API (solo para pruebas)
"""
import collections
import datetime
import http.server
import json
import os
import re
import sys
import threading
import time
import unicodedata
import urllib.error
import urllib.request
import zoneinfo

LLAVE = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODELO = os.environ.get("SEDE_ASISTENTE_MODELO", "claude-haiku-5-5")
PUERTO = int(os.environ.get("SEDE_ASISTENTE_PUERTO", "8787"))
POR_HORA = int(os.environ.get("SEDE_ASISTENTE_POR_HORA", "30"))
POR_DIA = int(os.environ.get("SEDE_ASISTENTE_POR_DIA", "3000"))
WEB = os.environ.get("SEDE_WEB", "/var/www/sede")
API = os.environ.get("SEDE_ASISTENTE_API", "https://api.anthropic.com/v1/messages")
CR = zoneinfo.ZoneInfo("America/Costa_Rica")

INSTRUCCIONES = """Usted es «el congo», el asistente virtual del sitio web de la Universidad de Costa Rica, Sede del Caribe (Limón y Siquirres). Es un mono congo (aullador de manto), amable y servicial, que vive en una rama de la portada del sitio.

Cómo responde:
- En español de Costa Rica y tratando de usted. Cálido y directo; algún toque caribeño de vez en cuando está bien, sin exagerar ni caer en estereotipos.
- Breve: uno a tres párrafos cortos o una lista corta. Más largo solo si se lo piden.
- Formato simple: **negrita**, listas con «- » y enlaces en markdown. Para las páginas del sitio use la ruta tal como aparece en la información de abajo, por ejemplo [Directorio](directorio.html).

Qué sabe:
- Para todo lo de la Sede (carreras, admisión, becas, trámites, horarios, oficinas, extensiones, ubicación, actividades) use solo la información del sitio que viene abajo. Si el dato no está, dígalo con franqueza y remita a la oficina que corresponda, con su extensión del directorio, o a la central telefónica. Nunca invente fechas, montos, requisitos, extensiones, correos ni nombres de personas.
- Datos generales de la UCR que no estén abajo pueden haber cambiado: sugiera confirmarlos en ucr.ac.cr o con la oficina respectiva.
- También puede ayudar con dudas generales de otros temas (estudio, conceptos, consejos prácticos), con su propio conocimiento y de forma breve.

Límites:
- No pida datos personales (cédula, carné, notas, salud). Si alguien los escribe, no los repita.
- Si alguien parece estar en peligro o en una crisis, recomiéndele con calidez buscar ayuda de inmediato: el 911, o Vida Estudiantil de la Sede.
- No ayude con nada dañino ni ilegal, ni a hacer trampa en evaluaciones; ofrezca en cambio explicar el tema.
- No tome partido en política ni hable mal de personas.
- Si se lo preguntan, aclare que es un asistente de inteligencia artificial y que puede equivocarse."""

VACIAS = set(("el la los las un una unos unas de del al a en y o u que como cual cuales cuando donde quien por para con sin sobre es son "
              "hay mi me se su sus le lo tengo puedo quiero saber necesito favor hola buenas buenos dias tardes noches ucr sede caribe").split())


def normal(s):
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


# ---------- índice del sitio (se vuelve a leer cuando el sitio se publica de nuevo) ----------
class Indice:
    def __init__(self, carpeta):
        self.ruta = os.path.join(carpeta, "assets", "js", "indice.js")
        self.marca = None
        self.entradas, self.fijo = [], INSTRUCCIONES
        self.candado = threading.Lock()

    def actual(self):
        try:
            marca = os.stat(self.ruta).st_mtime
        except OSError:
            return self
        with self.candado:
            if marca != self.marca:
                texto = open(self.ruta, encoding="utf-8").read()
                datos = json.loads(texto[texto.index("=") + 1:].rstrip().rstrip(";"))
                self.entradas = [dict(e, nt=normal(e["t"]), nx=normal(e["x"])) for e in datos]
                paginas = [e for e in datos if e["u"].endswith(".html") and e["u"] != "directorio.html"]
                directorio = [e for e in datos if e["u"] == "directorio.html" and e["t"] != "Directorio"]
                mapa = "\n".join(f"- {e['t']}: {e['u']}" for e in paginas[:80])
                dire = "\n".join(f"- {e['t']}: {e['x'][:160]}" for e in directorio[:250])
                self.fijo = (f"{INSTRUCCIONES}\n\n## Páginas del sitio\n{mapa}\n\n"
                             f"## Directorio de oficinas (nombre, extensión, área, edificio y correo)\n{dire}")
                self.marca = marca
        return self

    def buscar(self, texto, cuantas=6):
        terminos = [t for t in re.split(r"[^a-z0-9]+", normal(texto)) if len(t) > 2 and t not in VACIAS]
        if not terminos:
            return []
        puntos = []
        for e in self.entradas:
            p = sum(6 if k in e["nt"] else min(3, e["nx"].count(k)) for k in terminos)
            if p:
                puntos.append((p, e))
        puntos.sort(key=lambda par: -par[0])
        return [e for _, e in puntos[:cuantas]]


# ---------- límites de uso ----------
class Cupo:
    def __init__(self):
        self.por_ip = collections.defaultdict(collections.deque)
        self.dia, self.hoy = None, 0
        self.candado = threading.Lock()

    def permitir(self, ip):
        ahora = time.time()
        with self.candado:
            dia = datetime.datetime.now(CR).date()
            if dia != self.dia:
                self.dia, self.hoy = dia, 0
                self.por_ip.clear()
            cola = self.por_ip[ip]
            while cola and ahora - cola[0] > 3600:
                cola.popleft()
            if len(cola) >= POR_HORA or self.hoy >= POR_DIA:
                return False
            cola.append(ahora)
            self.hoy += 1
            return True


def limpiar(mensajes):
    """Convierte la conversación del sitio al formato de la API. Devuelve None si no sirve."""
    if not isinstance(mensajes, list) or not mensajes:
        return None
    salida = []
    for m in mensajes[-12:]:
        if not isinstance(m, dict) or m.get("rol") not in ("usuario", "congo") or not isinstance(m.get("texto"), str):
            return None
        texto = m["texto"].strip()[:1500]
        if not texto:
            continue
        rol = "user" if m["rol"] == "usuario" else "assistant"
        if salida and salida[-1]["role"] == rol:
            salida[-1]["content"] += "\n\n" + texto
        else:
            salida.append({"role": rol, "content": texto})
    while salida and salida[0]["role"] != "user":
        salida.pop(0)
    if not salida or salida[-1]["role"] != "user":
        return None
    return salida


def preguntar(indice, mensajes):
    """Genera la respuesta por partes (texto)."""
    if not LLAVE:
        raise RuntimeError("falta ANTHROPIC_API_KEY")
    ultimas = " ".join(m["content"] for m in mensajes if m["role"] == "user")[-1500:]
    halladas = indice.buscar(mensajes[-1]["content"]) or indice.buscar(ultimas)
    hoy = datetime.datetime.now(CR)
    contexto = "\n\n".join(f"### {e['t']} ({e['u']})\n{e['x'][:1800]}" for e in halladas) or "(no se encontró nada parecido en el sitio)"
    variable = f"Hoy es {hoy:%Y-%m-%d} (hora de Costa Rica).\n\n## Páginas del sitio relacionadas con la pregunta\n{contexto}"
    cuerpo = {
        "model": MODELO,
        "max_tokens": 1500,
        "stream": True,
        "output_config": {"effort": "low"},
        "system": [{"type": "text", "text": indice.fijo, "cache_control": {"type": "ephemeral"}},
                   {"type": "text", "text": variable}],
        "messages": mensajes,
    }
    pedido = urllib.request.Request(API, data=json.dumps(cuerpo).encode(), method="POST", headers={
        "x-api-key": LLAVE, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(pedido, timeout=60) as r:
        for linea in r:
            if not linea.startswith(b"data:"):
                continue
            ev = json.loads(linea[5:].strip() or b"{}")
            if ev.get("type") == "content_block_delta" and ev.get("delta", {}).get("type") == "text_delta":
                yield ev["delta"]["text"]
            elif ev.get("type") == "error":
                raise RuntimeError(ev.get("error", {}).get("type", "error de la API"))


class Manejador(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "sede-asistente"

    def log_message(self, formato, *args):  # sin el contenido de las preguntas
        sys.stderr.write("%s %s\n" % (self.command, args[1] if len(args) > 1 else ""))

    def responder(self, codigo, datos):
        cuerpo = json.dumps(datos, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def do_GET(self):
        if self.path == "/api/asistente/salud":
            return self.responder(200, {"ok": True, "con_llave": bool(LLAVE), "modelo": MODELO})
        self.responder(404, {"error": "no existe"})

    def do_POST(self):
        if self.path.split("?")[0] != "/api/asistente":
            return self.responder(404, {"error": "no existe"})
        try:
            largo = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            largo = -1
        if not 0 < largo <= 16000:
            return self.responder(413, {"error": "pregunta demasiado larga"})
        try:
            mensajes = limpiar(json.loads(self.rfile.read(largo)).get("mensajes"))
        except (ValueError, AttributeError):
            mensajes = None
        if not mensajes:
            return self.responder(400, {"error": "pregunta inválida"})
        ip = self.headers.get("X-Real-IP") or self.client_address[0]
        if not self.server.cupo.permitir(ip):
            return self.responder(429, {"error": "demasiadas preguntas"})

        partes = preguntar(self.server.indice.actual(), mensajes)
        try:  # se pide el primer trozo antes de contestar: si la API falla, el sitio busca por su cuenta
            primero = next(partes, "")
        except (urllib.error.URLError, RuntimeError, OSError, ValueError) as e:
            sys.stderr.write(f"falla al consultar la API: {e}\n")
            return self.responder(503, {"error": "el asistente no está disponible"})
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        try:
            self.trozo(primero)
            try:
                for texto in partes:
                    self.trozo(texto)
            except (urllib.error.URLError, RuntimeError, OSError, ValueError) as e:
                sys.stderr.write(f"se cortó la respuesta: {e}\n")
                self.trozo("\n\n(Se me cortó la conexión. Intente de nuevo en un momento, por favor.)")
            self.wfile.write(b"0\r\n\r\n")
        except (BrokenPipeError, ConnectionResetError):
            pass  # la persona cerró el asistente

    def trozo(self, texto):
        if texto:
            datos = texto.encode()
            self.wfile.write(b"%x\r\n%s\r\n" % (len(datos), datos))
            self.wfile.flush()


def vigilar_codigo():
    """Si el código cambia (llega con git pull), sale y systemd lo vuelve a arrancar con la versión nueva."""
    marca = os.stat(__file__).st_mtime
    while True:
        time.sleep(60)
        try:
            if os.stat(__file__).st_mtime != marca:
                os._exit(0)
        except OSError:
            pass


def servidor(puerto=PUERTO, carpeta=WEB):
    s = http.server.ThreadingHTTPServer(("127.0.0.1", puerto), Manejador)
    s.daemon_threads = True
    s.indice, s.cupo = Indice(carpeta), Cupo()
    return s


if __name__ == "__main__":
    if not LLAVE:
        sys.stderr.write("Aviso: falta ANTHROPIC_API_KEY; el asistente responderá 503 y el sitio buscará por su cuenta.\n")
    threading.Thread(target=vigilar_codigo, daemon=True).start()
    s = servidor()
    sys.stderr.write(f"Asistente escuchando en 127.0.0.1:{PUERTO} con {MODELO}\n")
    s.serve_forever()
