"""Recuperación híbrida: búsqueda por significado (vectores) y por palabras (BM25), fusionadas por rango (RRF).

Un fragmento solo se usa si su similitud con la pregunta supera el umbral. Si ninguno lo supera,
el chat responde que no tiene esa información, sin llamar al modelo.

Además de la búsqueda por palabras en todo, hay otra solo en lo institucional: sin ella, los cientos de reglamentos
dejan fuera de los candidatos a la página del sitio que responde (p. ej. «director» aparece en casi todos).
"""
import re
from dataclasses import dataclass

from ..documentos.registro import normal, raiz, terminos

K_RRF = 60
POR_VECTOR = 40
CUPO_SITIO = 2  # fragmentos institucionales que siempre entran y no le restan lugar a los reglamentos
# El sitio no se limita por número de fragmentos sino por texto: una lista (las carreras, las oficinas) puede
# necesitar varios trozos, y los trozos vecinos de la página que responde se traen aunque su similitud sea baja.
PRESUPUESTO_SITIO = 5000   # caracteres de páginas del sitio que entran en el contexto
PRESUPUESTO_LISTA = 9000   # lo mismo cuando la pregunta pide una lista o un total
MAX_SITIO = 16             # fragmentos del sitio como máximo (el presupuesto de caracteres suele cortar antes)
PIDE_LISTA = re.compile(r"\b(cuales|cuantas|cuantos|todas|todos|lista|listado|ofrece|ofrecen|existen|hay|tipos|opciones)\b")


@dataclass
class Hallazgo:
    fragmento: dict      # fila de registro.fragmentos(): texto, página, sección, documento…
    similitud: float
    puntaje: float       # fusión RRF


def cubre(consulta, texto):
    """True si el texto contiene la raíz de todos los términos de la consulta, y son al menos dos."""
    ts = list(dict.fromkeys(terminos(consulta)))
    if len(ts) < 2:
        return False
    palabras = set(re.split(r"[^a-z0-9]+", normal(texto)))
    return all(any(p.startswith(raiz(t)) for p in palabras) if len(t) >= 4 else t in palabras for t in ts)


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
        # el modelo de significado a veces puntúa muy bajo preguntas cortas («¿Cómo solicito una beca?»: 0,06
        # contra la sección que responde). Si una página del sitio contiene todos los términos de la pregunta
        # (al menos dos), entra igual: el modelo de lenguaje decide si responde o dice que no sabe.
        if categoria is None and len(listas_texto) > 1:
            validos += [f["fid"] for f in self.registro.fragmentos(listas_texto[1][:3])
                        if f["fid"] not in validos and cubre(consulta, f"{f['nombre']} {f['seccion'] or ''} {f['texto']}")]

        filas = self.registro.fragmentos(validos)  # descarta lo que no esté vigente
        if categoria:
            filas = [f for f in filas if f["categoria"] == categoria]
        filas.sort(key=lambda f: -puntaje[f["fid"]])
        # el sitio entra por presupuesto de texto aunque los reglamentos sumen más puntaje; así el modelo ve la página
        # completa que responde y no solo artículos de reglamentos
        sitio = self._del_sitio(consulta, filas, puntaje, similitud) if categoria is None else []
        en_sitio = {f["fid"] for f in sitio}
        resto = [f for f in filas if f["fid"] not in en_sitio]
        salida, cuenta = [], {}
        tope = cuantos + max(0, len(sitio) - CUPO_SITIO)
        for fila in sitio + resto:
            limite = MAX_SITIO if fila["fid"] in en_sitio else self.por_documento
            if cuenta.get(fila["doc_id"], 0) >= limite:
                continue
            cuenta[fila["doc_id"]] = cuenta.get(fila["doc_id"], 0) + 1
            salida.append(Hallazgo(fila, round(similitud[fila["fid"]], 4), round(puntaje[fila["fid"]], 5)))
            if len(salida) == tope:
                break
        salida.sort(key=lambda h: -h.puntaje)  # orden estable: los vecinos traídos van justo después de su hallazgo
        return salida

    def _del_sitio(self, consulta, filas, puntaje, similitud):
        """Fragmentos del sitio para la respuesta: los mejores por puntaje hasta el presupuesto y, de las dos páginas
        que mejor responden, los trozos vecinos (por cercanía) mientras quede presupuesto."""
        lista = bool(PIDE_LISTA.search(normal(consulta)))
        presupuesto = PRESUPUESTO_LISTA if lista else PRESUPUESTO_SITIO
        sitio, gastado = [], 0
        for f in (f for f in filas if f["categoria"] == "institucional"):
            if len(sitio) >= MAX_SITIO:
                break
            if sitio and gastado + len(f["texto"]) > presupuesto:
                continue
            sitio.append(f)
            gastado += len(f["texto"])
        elegidos = {f["fid"] for f in sitio}
        for doc_id in list(dict.fromkeys(f["doc_id"] for f in sitio))[:2]:
            semillas = [f for f in sitio if f["doc_id"] == doc_id]
            vecinos = [v for v in self.registro.del_documento(doc_id) if v["fid"] not in elegidos]
            vecinos.sort(key=lambda v: (min(abs(v["n"] - s["n"]) for s in semillas), v["n"]))
            for v in vecinos:
                if len(sitio) >= MAX_SITIO or gastado + len(v["texto"]) > presupuesto:
                    break
                semilla = max(semillas, key=lambda s: -abs(v["n"] - s["n"]))
                puntaje[v["fid"]] = puntaje[semilla["fid"]] * 0.999   # la página ya respondió: hereda su peso
                similitud[v["fid"]] = similitud[semilla["fid"]]
                sitio.append(v)
                elegidos.add(v["fid"])
                gastado += len(v["texto"])
        return sitio

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
