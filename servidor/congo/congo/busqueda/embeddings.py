"""Servicio de embeddings: convierte textos en vectores, en la propia máquina y sin API comercial.

- FastEmbed: modelo multilingüe de código abierto en ONNX (sin PyTorch). La primera vez descarga el modelo
  (unos 220 MB) desde Hugging Face a CONGO_DATOS/modelos; después funciona sin internet.
- Hash: vectores de palabras con hashing, sin modelo. Solo para pruebas: no entiende sinónimos.
"""
import math
import re
import threading
import zlib

from ..documentos.registro import normal


class FastEmbed:
    def __init__(self, modelo, carpeta):
        self.modelo, self.carpeta = modelo, str(carpeta)
        self._motor = None
        self._candado = threading.Lock()
        self.nombre = modelo

    def _cargar(self):
        with self._candado:
            if self._motor is None:
                from fastembed import TextEmbedding
                self._motor = TextEmbedding(self.modelo, cache_dir=self.carpeta, threads=2)
        return self._motor

    def documentos(self, textos):
        return [v.tolist() for v in self._cargar().embed(list(textos), batch_size=16)]

    def consulta(self, texto):
        return next(iter(self._cargar().query_embed(texto))).tolist()


class HashEmbed:
    """Bolsa de palabras con hashing. Solo para pruebas."""
    nombre = "hash"

    def __init__(self, dim=512):
        self.dim = dim

    def _vector(self, texto):
        v = [0.0] * self.dim
        for t in re.split(r"[^a-z0-9]+", normal(texto)):
            if len(t) > 2:
                raiz = t[:6]  # «becas», «beca» y «becario» caen cerca
                v[zlib.crc32(raiz.encode()) % self.dim] += 1.0
        n = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / n for x in v]

    def documentos(self, textos):
        return [self._vector(t) for t in textos]

    def consulta(self, texto):
        return self._vector(texto)


def crear(config):
    if config.embeddings == "hash":
        return HashEmbed()
    return FastEmbed(config.embeddings, config.datos / "modelos")
