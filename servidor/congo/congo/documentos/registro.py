"""Registro de documentos en SQLite: metadatos, versiones, vigencia, fragmentos y búsqueda por palabras (FTS5).

Solo los fragmentos de documentos vigentes están en la base: un documento derogado, reemplazado o retirado
conserva su ficha y su historial, pero sus fragmentos se borran y no se pueden recuperar como fuente.
"""
import datetime
import json
import re
import sqlite3
import threading
import unicodedata

VIGENCIAS = ("vigente", "derogado", "reemplazado", "retirado")
CATEGORIAS = {
    "institucional": ["carreras", "servicios", "horarios", "ubicaciones", "contactos", "admision", "becas", "general"],
    "normativa": ["reglamentos", "circulares", "resoluciones", "procedimientos", "matricula", "evaluacion",
                  "tramites", "gestion administrativa"],
}
CAMPOS = ("nombre", "categoria", "subcategoria", "fecha_publicacion", "fecha_actualizacion", "version", "vigencia",
          "fuente", "origen", "marca_origen")

ESQUEMA = """
CREATE TABLE IF NOT EXISTS documentos (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, categoria TEXT NOT NULL, subcategoria TEXT,
  fecha_publicacion TEXT, fecha_actualizacion TEXT, version TEXT, vigencia TEXT NOT NULL,
  fuente TEXT, origen TEXT NOT NULL, marca_origen TEXT, hash TEXT NOT NULL, tipo TEXT, archivo TEXT,
  fragmentos INTEGER NOT NULL DEFAULT 0, incorporado TEXT NOT NULL, actualizado TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS documentos_hash ON documentos(hash);
CREATE TABLE IF NOT EXISTS historial (
  doc_id TEXT NOT NULL, version TEXT, hash TEXT, vigencia TEXT, desde TEXT, hasta TEXT NOT NULL, motivo TEXT);
CREATE TABLE IF NOT EXISTS fragmentos (
  fid TEXT PRIMARY KEY, doc_id TEXT NOT NULL, n INTEGER NOT NULL, texto TEXT NOT NULL,
  pagina INTEGER, seccion TEXT, hoja TEXT, filas TEXT);
CREATE INDEX IF NOT EXISTS fragmentos_doc ON fragmentos(doc_id);
CREATE VIRTUAL TABLE IF NOT EXISTS fragmentos_fts USING fts5(
  fid UNINDEXED, texto, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS sin_respuesta (fecha TEXT NOT NULL, pregunta TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS uso (dia TEXT PRIMARY KEY, preguntas INTEGER NOT NULL DEFAULT 0,
  sin_respuesta INTEGER NOT NULL DEFAULT 0, fallas INTEGER NOT NULL DEFAULT 0);
"""

VACIAS = set(("el la los las un una unos unas de del al a en y o u que como cual cuales cuando donde quien por para con "
              "sin sobre es son hay mi me se su sus le lo tengo puedo quiero saber necesito favor hola buenas buenos "
              "dias tardes noches ucr sede caribe esta este estos estas eso esa ese hacer tiene debo").split())


def ahora():
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def normal(s):
    return unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", normal(s)).strip("-")[:80] or "documento"


def terminos(texto):
    return [t for t in re.split(r"[^a-z0-9]+", normal(texto)) if len(t) > 2 and t not in VACIAS]


class Registro:
    def __init__(self, ruta):
        self.db = sqlite3.connect(ruta, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.executescript(ESQUEMA)
        self.candado = threading.RLock()

    # ---------- documentos ----------
    def obtener(self, doc_id):
        with self.candado:
            f = self.db.execute("SELECT * FROM documentos WHERE id = ?", (doc_id,)).fetchone()
        return dict(f) if f else None

    def por_hash(self, h):
        with self.candado:
            return [dict(f) for f in self.db.execute("SELECT * FROM documentos WHERE hash = ?", (h,))]

    def listar(self, categoria=None, vigencia=None, origen=None):
        sql, args = "SELECT * FROM documentos WHERE 1=1", []
        for campo, valor in (("categoria", categoria), ("vigencia", vigencia), ("origen", origen)):
            if valor:
                sql += f" AND {campo} = ?"
                args.append(valor)
        with self.candado:
            return [dict(f) for f in self.db.execute(sql + " ORDER BY categoria, nombre", args)]

    def guardar(self, doc_id, hash_, tipo, archivo, meta):
        """Crea o reemplaza la ficha. Si ya existía con otro contenido o versión, la anterior pasa al historial."""
        momento = ahora()
        with self.candado:
            previo = self.obtener(doc_id)
            if previo and (previo["hash"] != hash_ or previo["version"] != meta.get("version")):
                self.db.execute("INSERT INTO historial VALUES (?,?,?,?,?,?,?)",
                                (doc_id, previo["version"], previo["hash"], previo["vigencia"], previo["incorporado"],
                                 momento, "nueva versión"))
            valores = {c: meta.get(c) for c in CAMPOS}
            self.db.execute(
                """INSERT INTO documentos (id, nombre, categoria, subcategoria, fecha_publicacion, fecha_actualizacion,
                   version, vigencia, fuente, origen, marca_origen, hash, tipo, archivo, fragmentos, incorporado, actualizado)
                   VALUES (:id,:nombre,:categoria,:subcategoria,:fecha_publicacion,:fecha_actualizacion,:version,
                   :vigencia,:fuente,:origen,:marca_origen,:hash,:tipo,:archivo,0,:incorporado,:actualizado)
                   ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, categoria=excluded.categoria,
                   subcategoria=excluded.subcategoria, fecha_publicacion=excluded.fecha_publicacion,
                   fecha_actualizacion=excluded.fecha_actualizacion, version=excluded.version,
                   vigencia=excluded.vigencia, fuente=excluded.fuente, origen=excluded.origen,
                   marca_origen=excluded.marca_origen, hash=excluded.hash, tipo=excluded.tipo,
                   archivo=excluded.archivo, incorporado=excluded.incorporado, actualizado=excluded.actualizado""",
                dict(valores, id=doc_id, hash=hash_, tipo=tipo, archivo=archivo,
                     incorporado=momento if not previo or previo["hash"] != hash_ else previo["incorporado"],
                     actualizado=momento))

    def cambiar(self, doc_id, **campos):
        campos = {k: v for k, v in campos.items() if k in CAMPOS}
        if not campos:
            return
        with self.candado:
            previo = self.obtener(doc_id)
            if previo and "vigencia" in campos and campos["vigencia"] != previo["vigencia"]:
                self.db.execute("INSERT INTO historial VALUES (?,?,?,?,?,?,?)",
                                (doc_id, previo["version"], previo["hash"], previo["vigencia"], previo["incorporado"],
                                 ahora(), f"vigencia: {campos['vigencia']}"))
            asignar = ", ".join(f"{k} = ?" for k in campos)
            self.db.execute(f"UPDATE documentos SET {asignar}, actualizado = ? WHERE id = ?",
                            [*campos.values(), ahora(), doc_id])

    def historial(self, doc_id):
        with self.candado:
            return [dict(f) for f in self.db.execute("SELECT * FROM historial WHERE doc_id = ? ORDER BY hasta", (doc_id,))]

    def borrar(self, doc_id):
        with self.candado:
            self.borrar_fragmentos(doc_id)
            self.db.execute("DELETE FROM documentos WHERE id = ?", (doc_id,))
            self.db.execute("DELETE FROM historial WHERE doc_id = ?", (doc_id,))

    # ---------- fragmentos ----------
    def guardar_fragmentos(self, doc_id, filas):
        """filas: [(fid, n, texto, pagina, seccion, hoja, filas)]"""
        with self.candado:
            self.db.execute("BEGIN")
            try:
                for fid, n, texto, pagina, seccion, hoja, rango in filas:
                    self.db.execute("INSERT INTO fragmentos VALUES (?,?,?,?,?,?,?,?)",
                                    (fid, doc_id, n, texto, pagina, seccion, hoja, rango))
                    self.db.execute("INSERT INTO fragmentos_fts (fid, texto) VALUES (?, ?)", (fid, texto))
                self.db.execute("UPDATE documentos SET fragmentos = ? WHERE id = ?", (len(filas), doc_id))
                self.db.execute("COMMIT")
            except Exception:
                self.db.execute("ROLLBACK")
                raise

    def borrar_fragmentos(self, doc_id):
        with self.candado:
            fids = [f[0] for f in self.db.execute("SELECT fid FROM fragmentos WHERE doc_id = ?", (doc_id,))]
            self.db.executemany("DELETE FROM fragmentos_fts WHERE fid = ?", [(f,) for f in fids])
            self.db.execute("DELETE FROM fragmentos WHERE doc_id = ?", (doc_id,))
            self.db.execute("UPDATE documentos SET fragmentos = 0 WHERE id = ?", (doc_id,))
        return fids

    def fragmentos(self, fids):
        """Fragmentos con los datos de su documento, en el orden pedido. Solo de documentos vigentes."""
        if not fids:
            return []
        marcas = ",".join("?" * len(fids))
        with self.candado:
            filas = self.db.execute(
                f"""SELECT f.*, d.nombre, d.categoria, d.subcategoria, d.fuente, d.version, d.vigencia,
                    d.fecha_publicacion, d.fecha_actualizacion FROM fragmentos f JOIN documentos d ON d.id = f.doc_id
                    WHERE f.fid IN ({marcas}) AND d.vigencia = 'vigente'""", fids).fetchall()
        por_id = {f["fid"]: dict(f) for f in filas}
        return [por_id[i] for i in fids if i in por_id]

    def buscar_texto(self, consulta, cuantos=20, categoria=None):
        """Búsqueda por palabras (BM25). Devuelve fids, del más al menos relevante."""
        ts = terminos(consulta)
        if not ts:
            return []
        expresion = " OR ".join(f'"{t}"*' if len(t) > 4 else f'"{t}"' for t in dict.fromkeys(ts))
        sql = """SELECT fragmentos_fts.fid FROM fragmentos_fts JOIN fragmentos f ON f.fid = fragmentos_fts.fid
                 JOIN documentos d ON d.id = f.doc_id WHERE fragmentos_fts MATCH ? AND d.vigencia = 'vigente'"""
        args = [expresion]
        if categoria:
            sql += " AND d.categoria = ?"
            args.append(categoria)
        sql += " ORDER BY bm25(fragmentos_fts) LIMIT ?"
        args.append(cuantos)
        with self.candado:
            try:
                return [f[0] for f in self.db.execute(sql, args)]
            except sqlite3.OperationalError:
                return []

    # ---------- uso y preguntas sin respuesta ----------
    def contar(self, campo):
        dia = datetime.date.today().isoformat()
        with self.candado:
            self.db.execute("INSERT INTO uso (dia) VALUES (?) ON CONFLICT(dia) DO NOTHING", (dia,))
            self.db.execute(f"UPDATE uso SET {campo} = {campo} + 1 WHERE dia = ?", (dia,))

    def sin_respuesta(self, pregunta, dias=30):
        limite = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=dias)).isoformat()
        with self.candado:
            self.db.execute("DELETE FROM sin_respuesta WHERE fecha < ?", (limite,))
            self.db.execute("INSERT INTO sin_respuesta VALUES (?, ?)", (ahora(), pregunta[:500]))

    def preguntas_sin_respuesta(self, limite=200):
        with self.candado:
            return [dict(f) for f in self.db.execute(
                "SELECT fecha, pregunta FROM sin_respuesta ORDER BY fecha DESC LIMIT ?", (limite,))]

    def estadisticas(self):
        with self.candado:
            docs = [dict(f) for f in self.db.execute(
                "SELECT categoria, vigencia, COUNT(*) AS documentos, SUM(fragmentos) AS fragmentos "
                "FROM documentos GROUP BY categoria, vigencia")]
            uso = [dict(f) for f in self.db.execute("SELECT * FROM uso ORDER BY dia DESC LIMIT 30")]
            total = self.db.execute("SELECT COUNT(*) FROM fragmentos").fetchone()[0]
        return {"documentos": docs, "fragmentos_indexados": total, "uso_por_dia": uso}

    def categorias(self):
        with self.candado:
            cuenta = {(f[0], f[1]): f[2] for f in self.db.execute(
                "SELECT categoria, subcategoria, COUNT(*) FROM documentos WHERE vigencia = 'vigente' "
                "GROUP BY categoria, subcategoria")}
        return [{"categoria": c, "subcategorias": [{"nombre": s, "documentos": cuenta.get((c, s), 0)} for s in subs],
                 "documentos": sum(v for (cat, _), v in cuenta.items() if cat == c)}
                for c, subs in CATEGORIAS.items()]


def a_json(doc):
    return json.loads(json.dumps(doc, default=str))
