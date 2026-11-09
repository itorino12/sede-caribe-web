"""Recuperación híbrida: búsqueda por significado (vectores) y por palabras (BM25), fusionadas por rango (RRF).

Un fragmento solo se usa si su similitud con la pregunta supera el umbral. Si ninguno lo supera,
el chat responde que no tiene esa información, sin llamar al modelo.
"""
from dataclasses import dataclass

K_RRF = 60


@dataclass
class Hallazgo:
    fragmento: dict      # fila de registro.fragmentos(): texto, página, sección, documento…
    similitud: float
    puntaje: float       # fusión RRF


class Recuperacion:
    def __init__(self, registro, embebedor, vectores, umbral=0.45, por_documento=3):
        self.registro, self.embebedor, self.vectores = registro, embebedor, vectores
        self.umbral, self.por_documento = umbral, por_documento

    def buscar(self, consulta, cuantos=6, categoria=None):
        vector = self.embebedor.consulta(consulta)
        por_vector = self.vectores.buscar(vector, 24)
        por_texto = self.registro.buscar_texto(consulta, 24, categoria)

        similitud = dict(por_vector)
        faltan = [f for f in por_texto if f not in similitud]
        similitud.update(self.vectores.similitudes(vector, faltan))

        puntaje = {}
        for rango, (fid, _) in enumerate(por_vector):
            puntaje[fid] = puntaje.get(fid, 0) + 1 / (K_RRF + rango)
        for rango, fid in enumerate(por_texto):
            puntaje[fid] = puntaje.get(fid, 0) + 1 / (K_RRF + rango)

        # pasa el umbral; las coincidencias fuertes por palabras tienen un margen pequeño
        texto_top = set(por_texto[:3])
        validos = [f for f in puntaje
                   if similitud.get(f, -1) >= self.umbral or (f in texto_top and similitud.get(f, -1) >= self.umbral - 0.1)]
        validos.sort(key=lambda f: -puntaje[f])

        filas = self.registro.fragmentos(validos)  # descarta lo que no esté vigente
        if categoria:
            filas = [f for f in filas if f["categoria"] == categoria]
        salida, cuenta = [], {}
        for fila in filas:
            if cuenta.get(fila["doc_id"], 0) >= self.por_documento:
                continue
            cuenta[fila["doc_id"]] = cuenta.get(fila["doc_id"], 0) + 1
            salida.append(Hallazgo(fila, round(similitud[fila["fid"]], 4), round(puntaje[fila["fid"]], 5)))
            if len(salida) == cuantos:
                break
        return salida

    def confianza(self, hallazgos):
        """Nivel de confianza a partir de la recuperación (no se le pregunta al modelo)."""
        if not hallazgos:
            return "none"
        mejor = max(h.similitud for h in hallazgos)
        if mejor >= self.umbral + 0.2 and len(hallazgos) >= 2:
            return "high"
        if mejor >= self.umbral + 0.1:
            return "medium"
        return "low"
