"""Ingesta: mantiene el repositorio al día con dos orígenes.

1. Las páginas publicadas del sitio (SEDE_WEB/assets/js/indice.js, el mismo índice del buscador):
   cada página es un documento institucional; la agenda y el directorio, un documento cada uno.
2. La carpeta de Drive «Documentos del congo» (CONGO_DRIVE_CARPETA), compartida como Lector con la cuenta
   de servicio del sitio. Dentro, una hoja de cálculo cuyo nombre contenga «metadatos», con una fila por archivo:
       archivo | id | nombre | categoria | subcategoria | version | vigencia | fecha_publicacion |
       fecha_actualizacion | url | confidencial
   Solo se incorporan los archivos que tienen fila. Los Documentos de Google se exportan como DOCX y las
   Hojas de Google como XLSX. Un archivo que sale de la carpeta queda «retirado».

Uso por consola (con el servicio detenido, o mejor: POST /api/admin/sync con el servicio en marcha):
    python -m congo.ingesta [--sitio] [--drive] [--carpeta DIR]
"""
import argparse
import hashlib
import io
import json
import logging
import re
import threading
import time
from pathlib import Path

from .documentos.extractores import ArchivoInvalido, Bloque, tipo_de
from .documentos.registro import slug
from .documentos.repositorio import Rechazado

log = logging.getLogger("congo")
DOC_GOOGLE = "application/vnd.google-apps.document"
HOJA_GOOGLE = "application/vnd.google-apps.spreadsheet"
CARPETA = "application/vnd.google-apps.folder"
EXPORTAR = {DOC_GOOGLE: ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"),
            HOJA_GOOGLE: ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx")}
COLUMNAS = ("archivo", "id", "nombre", "categoria", "subcategoria", "version", "vigencia", "fecha_publicacion",
            "fecha_actualizacion", "url", "confidencial")


def _encabezado(c):
    return slug(c).replace("-", "_")


def _sin_ext(nombre):
    return re.sub(r"\.[A-Za-z0-9]{2,5}$", "", nombre.strip()).lower()


class Sincronizador:
    def __init__(self, repo, config):
        self.repo, self.config = repo, config
        self.candado = threading.Lock()
        self.ultimo = None

    def todo(self):
        with self.candado:
            informe = {"sitio": self.sitio(), "drive": self.drive()}
            self.ultimo = {"fecha": time.strftime("%Y-%m-%d %H:%M:%S"), "informe": informe}
            return informe

    # ---------- páginas del sitio ----------
    def sitio(self, ruta=None):
        ruta = Path(ruta or self.config.web / "assets" / "js" / "indice.js")
        if not ruta.exists():
            return {"estado": f"no existe {ruta}"}
        texto = ruta.read_text(encoding="utf-8")
        entradas = json.loads(texto[texto.index("=") + 1:].rstrip().rstrip(";"))
        grupos = {}
        for e in entradas:
            u, t, x = e.get("u", ""), e.get("t", ""), e.get("x", "")
            if u == "index.html" or not t:
                continue
            if u == "directorio.html":
                clave = ("sitio-directorio", "Directorio de oficinas", "directorio.html", "contactos")
                linea = t if t == "Directorio" else f"{t}: {x}"
            elif u.startswith("agenda.html"):
                clave = ("sitio-agenda", "Agenda de actividades", "agenda.html", "general")
                linea = f"{t}. {x}"
            else:
                clave = (f"sitio-{slug(u.removesuffix('.html'))}", t, u, "general")
                linea = x
            grupos.setdefault(clave, []).append(linea)
        informe, vistos = {"nuevos": 0, "actualizados": 0, "sin_cambios": 0, "retirados": 0}, set()
        for (doc_id, nombre, url, sub), lineas in grupos.items():
            vistos.add(doc_id)
            contenido = "\n".join(lineas)
            meta = {"id": doc_id, "nombre": nombre, "categoria": "institucional", "subcategoria": sub, "url": url,
                    "origen": "sitio"}
            bloques = [Bloque(contenido, seccion=nombre)]
            r = self.repo.incorporar_bloques(meta, bloques, hashlib.sha256(contenido.encode()).hexdigest())
            informe["sin_cambios" if r.estado == "sin_cambios" else "nuevos" if r.estado == "nuevo" else "actualizados"] += 1
        for d in self.repo.registro.listar(origen="sitio"):
            if d["id"] not in vistos:
                self.repo.eliminar(d["id"])
                informe["retirados"] += 1
        return informe

    # ---------- Drive ----------
    def _clientes(self):
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        cred = service_account.Credentials.from_service_account_file(
            self.config.credenciales, scopes=["https://www.googleapis.com/auth/drive.readonly",
                                              "https://www.googleapis.com/auth/spreadsheets.readonly"])
        return (build("drive", "v3", credentials=cred, cache_discovery=False),
                build("sheets", "v4", credentials=cred, cache_discovery=False))

    @staticmethod
    def _listar(drive, carpeta):
        archivos, pendientes = [], [carpeta]
        while pendientes:
            padre, token = pendientes.pop(), None
            while True:
                r = drive.files().list(q=f"'{padre}' in parents and trashed = false", pageSize=200, pageToken=token,
                                       fields="nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, size)",
                                       supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
                for f in r.get("files", []):
                    (pendientes.append(f["id"]) if f["mimeType"] == CARPETA else archivos.append(f))
                token = r.get("nextPageToken")
                if not token:
                    break
        return archivos

    @staticmethod
    def _metadatos(sheets, hoja_id):
        valores = sheets.spreadsheets().values().get(spreadsheetId=hoja_id, range="A:K",
                                                     valueRenderOption="FORMATTED_VALUE").execute().get("values", [])
        if not valores:
            return {}
        cab = [_encabezado(c) for c in valores[0]]
        if "archivo" not in cab:
            raise ValueError("la hoja de metadatos no tiene la columna «archivo»")
        filas = {}
        for v in valores[1:]:
            fila = {c: (v[i].strip() if i < len(v) else "") for i, c in enumerate(cab) if c in COLUMNAS}
            if fila.get("archivo"):
                filas[_sin_ext(fila["archivo"])] = fila
        return filas

    @staticmethod
    def _descargar(drive, f):
        from googleapiclient.http import MediaIoBaseDownload
        if f["mimeType"] in EXPORTAR:
            mime, ext = EXPORTAR[f["mimeType"]]
            pedido, nombre = drive.files().export_media(fileId=f["id"], mimeType=mime), _sin_ext(f["name"]) + ext
        else:
            pedido, nombre = drive.files().get_media(fileId=f["id"], supportsAllDrives=True), f["name"]
        buf, listo = io.BytesIO(), False
        bajada = MediaIoBaseDownload(buf, pedido)
        while not listo:
            _, listo = bajada.next_chunk()
        return nombre, buf.getvalue()

    def drive(self):
        if not self.config.drive_carpeta:
            return {"estado": "sin configurar (falta CONGO_DRIVE_CARPETA)"}
        if not Path(self.config.credenciales).exists():
            return {"estado": f"falta la cuenta de servicio {self.config.credenciales}"}
        drive, sheets = self._clientes()
        archivos = self._listar(drive, self.config.drive_carpeta)
        hojas = [f for f in archivos if f["mimeType"] == HOJA_GOOGLE and "metadatos" in f["name"].lower()]
        if not hojas:
            return {"estado": "no hay una hoja «Metadatos» en la carpeta"}
        meta = self._metadatos(sheets, hojas[0]["id"])
        informe = {"incorporados": 0, "sin_cambios": 0, "sin_metadatos": [], "rechazados": [], "retirados": 0}
        vistos = set()
        for f in archivos:
            if f["id"] == hojas[0]["id"]:
                continue
            fila = meta.get(_sin_ext(f["name"]))
            if fila is None:
                informe["sin_metadatos"].append(f["name"])
                continue
            ext = EXPORTAR[f["mimeType"]][1] if f["mimeType"] in EXPORTAR else tipo_de(f["name"])
            if ext not in (".pdf", ".docx", ".xlsx", ".txt", ".html"):
                informe["rechazados"].append(f"{f['name']}: tipo no admitido")
                continue
            doc_id = slug(fila.get("id") or fila.get("nombre") or _sin_ext(f["name"]))
            vistos.add(doc_id)
            marca = f"{f['id']}:{f.get('modifiedTime')}:{f.get('md5Checksum', '')}:" + \
                hashlib.sha1(json.dumps(fila, sort_keys=True).encode()).hexdigest()[:10]
            previo = self.repo.registro.obtener(doc_id)
            if previo and previo["marca_origen"] == marca:
                informe["sin_cambios"] += 1
                continue
            try:
                nombre, datos = self._descargar(drive, f)
                self.repo.incorporar(nombre, datos, dict(fila, id=doc_id, origen="drive", marca_origen=marca))
                informe["incorporados"] += 1
            except (ArchivoInvalido, Rechazado) as e:
                informe["rechazados"].append(f"{f['name']}: {e}")
                if "confidencial" in str(e) and previo:
                    self.repo.eliminar(doc_id)
            except Exception as e:  # un archivo dañado no detiene el resto
                log.exception("no se pudo incorporar %s", f["name"])
                informe["rechazados"].append(f"{f['name']}: {type(e).__name__}")
        for d in self.repo.registro.listar(origen="drive"):
            if d["id"] not in vistos and d["vigencia"] != "retirado":
                self.repo.cambiar_vigencia(d["id"], "retirado")
                informe["retirados"] += 1
        return informe


def main():
    from .app import crear_servicios
    from .config import Config
    p = argparse.ArgumentParser(description="Incorpora documentos al repositorio del congo.")
    p.add_argument("--sitio", action="store_true", help="indexar las páginas publicadas del sitio")
    p.add_argument("--drive", action="store_true", help="sincronizar la carpeta de Drive")
    p.add_argument("--carpeta", help="incorporar los archivos de una carpeta local (con metadatos.json opcional)")
    a = p.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    s = crear_servicios(Config.desde_entorno())
    if a.sitio:
        print("sitio:", s.sincronizador.sitio())
    if a.drive:
        print("drive:", s.sincronizador.drive())
    if a.carpeta:
        carpeta = Path(a.carpeta)
        metas = json.loads((carpeta / "metadatos.json").read_text()) if (carpeta / "metadatos.json").exists() else {}
        for f in sorted(carpeta.iterdir()):
            if f.is_file() and f.name != "metadatos.json":
                try:
                    r = s.repositorio.incorporar(f.name, f.read_bytes(), metas.get(f.name, {}))
                    print(f"{f.name}: {r.estado} ({r.documento['fragmentos']} fragmentos)")
                except (ArchivoInvalido, Rechazado) as e:
                    print(f"{f.name}: rechazado — {e}")


if __name__ == "__main__":
    main()
