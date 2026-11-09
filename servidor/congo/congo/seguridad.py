"""Security Layer: datos personales, límites de uso y clave de administración."""
import collections
import datetime
import hmac
import re
import threading
import time
import zoneinfo

CR = zoneinfo.ZoneInfo("America/Costa_Rica")
OCULTO = "[dato oculto]"

# Orden importante: primero lo más específico.
PATRONES = [
    re.compile(r"\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b"),                       # correo
    re.compile(r"\b\d[- ]?\d{4}[- ]?\d{4}\b"),                            # cédula 1-1234-5678 / 112345678
    re.compile(r"\b\d{11,12}\b"),                                         # DIMEX
    re.compile(r"(?:\+?506[- ]?)?\b[245678]\d{3}[- ]?\d{4}\b"),            # teléfono de Costa Rica
    re.compile(r"\b[A-Za-z]\d{5}\b"),                                     # carné UCR (B12345)
]


def enmascarar(texto):
    for p in PATRONES:
        texto = p.sub(OCULTO, texto)
    return texto


class Cupo:
    """Preguntas por hora y por IP, y un tope diario total que protege la cuota gratuita del proveedor."""

    def __init__(self, por_hora=30, por_dia=1000):
        self.por_hora, self.por_dia = por_hora, por_dia
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
            if len(cola) >= self.por_hora or self.hoy >= self.por_dia:
                return False
            cola.append(ahora)
            self.hoy += 1
            return True


def clave_valida(esperada, recibida):
    """Sin clave configurada, la administración queda cerrada."""
    return bool(esperada) and bool(recibida) and hmac.compare_digest(esperada.encode(), recibida.encode())
