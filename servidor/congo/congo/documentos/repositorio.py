"""Administración de documentos: incorpora, actualiza, retira y reprocesa, manteniendo juntos el registro
(SQLite) y la base vectorial (Chroma).

Reglas de vigencia:
- Mismo contenido (hash) bajo otro identificador vigente → se rechaza como duplicado.
- Mismo identificador con contenido o versión distinta → la versión anterior pasa al historial y se reemplaza.
- Un documento no vigente (derogado, reemplazado, retirado) conserva su ficha, pero sus fragmentos se borran.
- Un documento marcado como confidencial no se incorpora: nunca debe llegar al proveedor de IA.
"""
import hashlib
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path

from . import extractores, fragmentador
from .registro import CATEGORIAS, VIGENCIAS, Registro, slug


class Rechazado(ValueError):
    """El documento no se incorpora (duplicado, confidencial, metadatos inválidos)."""


@dataclass
class Resultado:
    estado: str   # nuevo | nueva_version | sin_cambios | no_indexado
    documento: dict


def _si(valor):
    return str(valor or "").strip().lower() in ("si", "sí", "1", "true", "x", "yes")


def normalizar_meta(meta, nombre_archivo):
    meta = {k: (str(v).strip() if v is not None else "") for k, v in (meta or {}).items()}
    if _si(meta.get("confidencial")):
        raise Rechazado("documento marcado como confidencial: no se incorpora")
    categoria = slug(meta.get("categoria") or "institucional").replace("-", " ")
    categoria = {"academica": "normativa", "normativa": "normativa", "academica y normativa": "normativa",
                 "informacion institucional": "institucional"}.get(categoria, categoria)
    if categoria not in CATEGORIAS:
        raise Rechazado(f"categoría desconocida: «{meta.get('categoria')}». Use institucional o normativa")
    vigencia = (meta.get("vigencia") or "vigente").lower()
    if vigencia not in VIGENCIAS:
        raise Rechazado(f"vigencia desconocida: «{vigencia}». Use: {', '.join(VIGENCIAS)}")
    nombre = meta.get("nombre") or Path(nombre_archivo).stem.replace("_", " ")
    return {
        "id": slug(meta.get("id") or nombre),
        "nombre": nombre[:200],
        "categoria": categoria,
        "subcategoria": (meta.get("subcategoria") or "").lower()[:60] or None,
        "fecha_publicacion": meta.get("fecha_publicacion") or None,
        "fecha_actualizacion": meta.get("fecha_actualizacion") or None,
        "version": meta.get("version") or None,
        "vigencia": vigencia,
        "fuente": meta.get("url") or meta.get("fuente") or None,
        "origen": meta.get("origen") or "subida",
        "marca_origen": meta.get("marca_origen") or None,
    }


class Repositorio:
    def __init__(self, carpeta, embebedor, vectores):
        self.carpeta = Path(carpeta)
        self.originales = self.carpeta / "originales"
        self.originales.mkdir(parents=True, exist_ok=True)
        self.registro = Registro(self.carpeta / "registro.sqlite3")
        self.embebedor, self.vectores = embebedor, vectores
        self.candado = threading.Lock()  # una incorporación a la vez

    # ---------- incorporar ----------
    def incorporar(self, nombre_archivo, datos: bytes, meta=None):
        """Incorpora un archivo. Lanza extractores.ArchivoInvalido o Rechazado si no se puede."""
        meta = normalizar_meta(meta, nombre_archivo)
        tipo = extractores.validar(nombre_archivo, datos)
        h = hashlib.sha256(datos).hexdigest()
        with self.candado:
            for otro in self.registro.por_hash(h):
                if otro["id"] != meta["id"] and otro["vigencia"] == "vigente":
                    raise Rechazado(f"duplicado: el mismo archivo ya está incorporado como «{otro['id']}»")
            previo = self.registro.obtener(meta["id"])
            if previo and previo["hash"] == h and self._igual(previo, meta):
                return Resultado("sin_cambios", previo)
            bloques = extractores.extraer(nombre_archivo, datos) if meta["vigencia"] == "vigente" else None
            destino = self.originales / meta["id"] / f"{h[:16]}{tipo}"
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(datos)
            if previo and previo["archivo"] and previo["archivo"] != str(destino):
                Path(previo["archivo"]).unlink(missing_ok=True)
            return self._registrar(meta, h, tipo, str(destino), bloques, previo)

    def incorporar_bloques(self, meta, bloques, huella):
        """Incorpora texto que no viene de un archivo (las páginas del sitio)."""
        meta = normalizar_meta(meta, meta.get("nombre", "pagina"))
        with self.candado:
            previo = self.registro.obtener(meta["id"])
            if previo and previo["hash"] == huella and self._igual(previo, meta):
                return Resultado("sin_cambios", previo)
            return self._registrar(meta, huella, "sitio", None, bloques, previo)

    @staticmethod
    def _igual(previo, meta):
        return all((previo.get(k) or None) == (meta.get(k) or None)
                   for k in ("nombre", "categoria", "subcategoria", "version", "vigencia", "fuente",
                             "fecha_publicacion", "fecha_actualizacion"))

    def _registrar(self, meta, h, tipo, archivo, bloques, previo):
        doc_id = meta["id"]
        self._quitar_del_indice(doc_id)
        self.registro.guardar(doc_id, h, tipo, archivo, meta)
        if meta["vigencia"] == "vigente":
            self._indexar(doc_id, h, meta, bloques)
        estado = ("nuevo" if not previo else "nueva_version" if previo["hash"] != h or previo["version"] != meta["version"]
                  else "actualizado")
        if meta["vigencia"] != "vigente":
            estado = "no_indexado"
        return Resultado(estado, self.registro.obtener(doc_id))

    def _indexar(self, doc_id, h, meta, bloques):
        frags = fragmentador.fragmentar(bloques)
        if not frags:
            raise extractores.ArchivoInvalido("el documento no produjo texto útil")
        fids = [f"{doc_id}#{h[:8]}#{n}" for n in range(len(frags))]
        # el texto que se vectoriza lleva el nombre del documento y la sección: mejora la búsqueda
        textos = [f"{meta['nombre']}. {f.seccion or ''}\n{f.texto}" for f in frags]
        vectores = self.embebedor.documentos(textos)
        self.vectores.agregar(fids, vectores, doc_id)
        try:
            self.registro.guardar_fragmentos(doc_id, [(fid, n, f.texto, f.pagina, f.seccion, f.hoja, f.filas)
                                                      for n, (fid, f) in enumerate(zip(fids, frags))])
        except Exception:
            self.vectores.borrar(doc_id)
            raise

    def _quitar_del_indice(self, doc_id):
        self.registro.borrar_fragmentos(doc_id)
        self.vectores.borrar(doc_id)

    # ---------- administrar ----------
    def cambiar_vigencia(self, doc_id, vigencia):
        if vigencia not in VIGENCIAS:
            raise Rechazado(f"vigencia desconocida: {vigencia}")
        with self.candado:
            doc = self.registro.obtener(doc_id)
            if not doc:
                return None
            if vigencia == doc["vigencia"]:
                return doc
            if vigencia != "vigente":
                self._quitar_del_indice(doc_id)
                self.registro.cambiar(doc_id, vigencia=vigencia)
            else:
                self.registro.cambiar(doc_id, vigencia=vigencia)
                if doc["archivo"]:
                    self._reindexar(doc)
            return self.registro.obtener(doc_id)

    def reprocesar(self, doc_id):
        with self.candado:
            doc = self.registro.obtener(doc_id)
            if not doc:
                return None
            if not doc["archivo"]:
                raise Rechazado("este documento no tiene archivo original (viene del sitio): se actualiza solo al sincronizar")
            self._quitar_del_indice(doc_id)
            if doc["vigencia"] == "vigente":
                self._reindexar(doc)
            return self.registro.obtener(doc_id)

    def _reindexar(self, doc):
        datos = Path(doc["archivo"]).read_bytes()
        bloques = extractores.extraer(doc["archivo"], datos)
        self._indexar(doc["id"], doc["hash"], doc, bloques)

    def eliminar(self, doc_id):
        with self.candado:
            doc = self.registro.obtener(doc_id)
            if not doc:
                return False
            self.vectores.borrar(doc_id)
            self.registro.borrar(doc_id)
            shutil.rmtree(self.originales / doc_id, ignore_errors=True)
            return True
