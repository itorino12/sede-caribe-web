"""Citation Manager: quita las marcas [F#] del texto (mientras llega por partes), registra cuáles se usaron
y arma las referencias con los metadatos reales de esos fragmentos.
"""
import re

MARCA = re.compile(r"[ \t]?\[\s*F\d+(?:\s*[,;]\s*F?\d+)*\s*\]")
NUMEROS = re.compile(r"\d+")


class FiltroCitas:
    """Recibe el texto por partes y devuelve el texto sin marcas. Retiene un «[…» incompleto hasta ver si es marca."""

    def __init__(self, total):
        self.total = total
        self.usados = []
        self.pendiente = ""

    def _limpiar(self, texto):
        def anotar(m):
            for n in NUMEROS.findall(m.group(0)):
                n = int(n)
                if 1 <= n <= self.total and n not in self.usados:
                    self.usados.append(n)
            return ""
        return MARCA.sub(anotar, texto)

    def agregar(self, trozo):
        texto = self.pendiente + trozo
        corte = len(texto)
        abre = texto.rfind("[")
        if abre != -1 and "]" not in texto[abre:] and len(texto) - abre < 24:
            corte = abre
        while corte > 0 and texto[corte - 1] in " \t":  # un espacio puede ser parte de « [F1]»
            corte -= 1
        listo, self.pendiente = texto[:corte], texto[corte:]
        return self._limpiar(listo)

    def cerrar(self):
        resto, self.pendiente = self._limpiar(self.pendiente), ""
        return resto


def ubicacion(f):
    partes = []
    if f.get("seccion"):
        partes.append(f["seccion"])
    if f.get("pagina"):
        partes.append(f"p. {f['pagina']}")
    if f.get("hoja"):
        partes.append(f"hoja «{f['hoja']}»" + (f", filas {f['filas']}" if f.get("filas") else ""))
    return ", ".join(partes)


def fuentes(hallazgos, usados):
    """Referencias de los fragmentos citados, en orden de aparición. Nada inventado: todo sale del registro."""
    salida = []
    for n in usados:
        f = hallazgos[n - 1].fragmento
        extracto = re.sub(r"\s+", " ", f["texto"]).strip()
        salida.append({
            "document": f["nombre"],
            "section": f.get("seccion") if f.get("seccion") != f["nombre"] else None,
            "page": f.get("pagina"),
            "sheet": f.get("hoja"),
            "rows": f.get("filas"),
            "excerpt": extracto[:400] + ("…" if len(extracto) > 400 else ""),
            "url": f.get("fuente"),
            "version": f.get("version"),
            "document_id": f["doc_id"],
            "similarity": hallazgos[n - 1].similitud,
        })
    return salida


def _url_segura(url):
    return bool(url) and not re.search(r"[\s()<>\]]", url) and (url.startswith(("https://", "http://"))
                                                                  or re.fullmatch(r"[\w./#?=&%;-]+", url))


def markdown(lista):
    """Lista «Fuentes» para el chat del sitio (lo muestra el frontend actual sin cambios)."""
    if not lista:
        return ""
    vistas, lineas = set(), []
    for s in lista:
        etiqueta = s["document"].replace("[", "(").replace("]", ")")
        seccion = s["section"] if s["section"] != s["document"] else None  # en páginas del sitio coinciden
        lugar = ubicacion({"seccion": seccion, "pagina": s["page"], "hoja": s["sheet"], "filas": s["rows"]})
        clave = (etiqueta, lugar)
        if clave in vistas:
            continue
        vistas.add(clave)
        texto = f"{etiqueta}, {lugar}" if lugar else etiqueta
        lineas.append(f"- [{texto}]({s['url']})" if _url_segura(s["url"]) else f"- {texto}")
    return "\n\n**Fuentes:**\n\n" + "\n".join(lineas)
