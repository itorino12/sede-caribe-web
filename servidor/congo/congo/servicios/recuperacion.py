"""Recuperación híbrida: búsqueda por significado (vectores) y por palabras (BM25), fusionadas por rango (RRF).

Un fragmento solo se usa si su similitud con la pregunta supera el umbral. Si ninguno lo supera,
el chat responde que no tiene esa información, sin llamar al modelo.

Además de la búsqueda por palabras en todo, hay otra solo en lo institucional: sin ella, los cientos de reglamentos
dejan fuera de los candidatos a la página del sitio que responde (p. ej. «director» aparece en casi todos).
"""
from dataclasses import dataclass

K_RRF = 60
POR_VECTOR = 40
CUPO_SITIO = 2  # fragmentos institucionales que siempre entran, si pasan el umbral


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
        por_vector = self.vectores.buscar(vector, POR_VECTOR)
        listas_texto = [self.registro.buscar_texto(consulta, 24, categoria)]
        if categoria is None:
            listas_texto.append(self.registro.buscar_texto(consulta, 12, "institucional"))

        similitud = dict(por_vector)
        faltan = list(dict.fromkeys(f for lista in listas_texto for f in lista if f not in similitud))
        similitud.update(self.vectores.similitudes(vector, faltan))

        puntaje = {}
        for rango, (fid, _) in enumerate(por_vector):
            puntaje[fid] = puntaje.get(fid, 0) + 1 / (K_RRF + rango)
        contados = set()
        for lista in listas_texto:  # la lista solo institucional suma lo que la general no encontró
            for rango, fid in enumerate(lista):
                if fid not in contados:
                    contados.add(fid)
                    puntaje[fid] = puntaje.get(fid, 0) + 1 / (K_RRF + rango)

        # pasa el umbral; las coincidencias fuertes por palabras tienen un margen pequeño
        texto_top = {f for lista in listas_texto for f in lista[:3]}
        validos = [f for f in puntaje
                   if similitud.get(f, -1) >= self.umbral or (f in texto_top and similitud.get(f, -1) >= self.umbral - 0.1)]

        filas = self.registro.fragmentos(validos)  # descarta lo que no esté vigente
        if categoria:
            filas = [f for f in filas if f["categoria"] == categoria]
        filas.sort(key=lambda f: -puntaje[f["fid"]])
        # cupo del sitio: los mejores fragmentos institucionales que pasaron el umbral entran aunque los reglamentos
        # sumen más puntaje; así el modelo ve la página que responde y no solo artículos de reglamentos
        sitio = [f for f in filas if f["categoria"] == "institucional"][:CUPO_SITIO] if categoria is None else []
        resto = [f for f in filas if f not in sitio]
        salida, cuenta = [], {}
        for fila in sitio + resto:
            if cuenta.get(fila["doc_id"], 0) >= self.por_documento:
                continue
            cuenta[fila["doc_id"]] = cuenta.get(fila["doc_id"], 0) + 1
            salida.append(Hallazgo(fila, round(similitud[fila["fid"]], 4), round(puntaje[fila["fid"]], 5)))
            if len(salida) == cuantos:
                break
        salida.sort(key=lambda h: -h.puntaje)
        return salida

    def diagnostico(self, consulta, cuantos=8):
        """Para calibrar el umbral: los mejores fragmentos por significado y por palabras, sin umbral ni filtros."""
        vector = self.embebedor.consulta(consulta)
        por_vector = self.vectores.buscar(vector, cuantos)
        por_texto = self.registro.buscar_texto(consulta, cuantos)
        por_sitio = self.registro.buscar_texto(consulta, cuantos, "institucional")
        similitud = dict(por_vector)
        similitud.update(self.vectores.similitudes(vector, [f for f in dict.fromkeys(por_texto + por_sitio)
                                                            if f not in similitud]))
        filas = {f["fid"]: f for f in self.registro.fragmentos(list(similitud))}

        def fila(fid):
            f = filas.get(fid, {})
            return {"similitud": round(similitud.get(fid, -1), 4), "documento": f.get("doc_id"),
                    "seccion": f.get("seccion"), "texto": (f.get("texto") or "")[:120]}
        return {"umbral": self.umbral, "por_significado": [fila(f) for f, _ in por_vector],
                "por_palabras": [fila(f) for f in por_texto], "por_palabras_sitio": [fila(f) for f in por_sitio]}

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
