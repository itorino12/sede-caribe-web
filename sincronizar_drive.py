#!/usr/bin/env python3
"""Trae el contenido del sitio desde Google Drive a ./contenido.

Qué lee (todo dentro de la carpeta raíz del sitio en Drive):
    «Contenido del sitio»  Hoja de cálculo. Una pestaña por tabla: config, avisos, noticias, eventos,
                           carreras, unidades, directorio, enlaces, hitos, cifras, lugares. La fila 1 son los encabezados.
    Páginas/               Documentos de Google. Cada uno es el texto largo de una página; su nombre
                           es el identificador que se escribe en la columna «documento» (p. ej. «historia»).
    Imágenes/              Fotos que se citan por nombre de archivo en la columna «imagen».
    Imágenes/Recorrido/    Una carpeta por lugar del recorrido 3D, que empieza con su número
                           («19 - Pista Atlética»). Sus fotos salen en el carrusel de ese lugar.

Escribe:
    contenido/datos/<pestaña>.json, contenido/paginas/<nombre>.md, contenido/imagenes/<archivo>
    contenido/imagenes/recorrido/<número>/<archivo>
    contenido/.huella   resumen de todo lo descargado; si no cambia, no hace falta recompilar.

Salida: código 0 si no hubo cambios, 10 si hubo cambios, 1 si falló (el sitio en línea no se toca).

Configuración (variables de entorno o /etc/sede-web/sede.env):
    SEDE_DRIVE_CARPETA   ID de la carpeta raíz en Drive
    SEDE_CREDENCIALES    ruta al JSON de la cuenta de servicio (por defecto /etc/sede-web/cuenta-servicio.json)

La cuenta de servicio solo necesita permiso de LECTOR sobre la carpeta raíz. Pasar el Drive a una unidad
compartida institucional es solo compartirla con la misma cuenta y cambiar SEDE_DRIVE_CARPETA.
"""
import hashlib, io, json, os, re, shutil, sys, tempfile, unicodedata
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

RAIZ = Path(__file__).resolve().parent
DESTINO = RAIZ / "contenido"
ALCANCES = ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/spreadsheets.readonly"]
HOJA = "Contenido del sitio"
PESTANAS = ["config", "avisos", "noticias", "eventos", "carreras", "unidades", "directorio", "enlaces", "hitos", "cifras", "lugares"]
# Columnas mínimas: si una pestaña no las tiene, se conserva la versión anterior y se avisa.
REQUERIDAS = {"config": {"clave", "valor"}, "noticias": {"publicar", "fecha", "titulo"}, "eventos": {"publicar", "fecha", "titulo"},
              "avisos": {"publicar", "titulo", "texto"}, "carreras": {"publicar", "id", "nombre"}, "unidades": {"publicar", "id", "nombre"},
              "directorio": {"unidad", "oficina", "extension"}, "enlaces": {"grupo", "titulo", "url"}, "hitos": {"anio", "texto"},
              "lugares": {"id", "zona", "nombre"}}
IMAGEN_MAX = 25 * 1024 * 1024
DOC = "application/vnd.google-apps.document"
CARPETA = "application/vnd.google-apps.folder"
SHEET = "application/vnd.google-apps.spreadsheet"


def config():
    env = {}
    f = Path("/etc/sede-web/sede.env")
    if f.exists():
        for linea in f.read_text().splitlines():
            if "=" in linea and not linea.strip().startswith("#"):
                k, v = linea.split("=", 1)
                env[k.strip()] = v.strip().strip('"')
    env.update({k: v for k, v in os.environ.items() if k.startswith("SEDE_")})
    if not env.get("SEDE_DRIVE_CARPETA"):
        sys.exit("Falta SEDE_DRIVE_CARPETA (ID de la carpeta raíz del sitio en Drive).")
    return env["SEDE_DRIVE_CARPETA"], env.get("SEDE_CREDENCIALES", "/etc/sede-web/cuenta-servicio.json")


def hijos(drive, carpeta):
    q = f"'{carpeta}' in parents and trashed = false"
    archivos, token = [], None
    while True:
        r = drive.files().list(q=q, fields="nextPageToken, files(id, name, mimeType, md5Checksum, modifiedTime, size)",
                               pageSize=200, pageToken=token, supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        archivos += r.get("files", [])
        token = r.get("nextPageToken")
        if not token:
            return archivos


def nombre_seguro(n):
    base, ext = os.path.splitext(n)
    return re.sub(r"[^\w.-]+", "-", base, flags=re.UNICODE).strip("-") + ext.lower()


def encabezado(c):
    """«Título», «Fecha fin» o «Extensión» → titulo, fecha_fin, extension: quien edita puede escribir con tildes."""
    c = unicodedata.normalize("NFKD", c.strip().lower()).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", c).strip("_")


def leer_hoja(sheets, hoja_id, anterior):
    meta = sheets.spreadsheets().get(spreadsheetId=hoja_id, fields="sheets.properties.title").execute()
    titulos = {s["properties"]["title"].strip().lower(): s["properties"]["title"] for s in meta["sheets"]}
    rangos = [f"'{titulos[p]}'" for p in PESTANAS if p in titulos]
    r = sheets.spreadsheets().values().batchGet(spreadsheetId=hoja_id, ranges=rangos, valueRenderOption="FORMATTED_VALUE",
                                                 dateTimeRenderOption="FORMATTED_STRING").execute()
    salida, avisos = {}, []
    for rango, valores in zip(rangos, r.get("valueRanges", [])):
        nombre = rango.strip("'").strip().lower()
        filas = valores.get("values", [])
        if not filas:
            salida[nombre] = []
            continue
        cab = [encabezado(c) for c in filas[0]]
        faltan = REQUERIDAS.get(nombre, set()) - set(cab)
        if faltan:
            avisos.append(f"La pestaña «{nombre}» no tiene las columnas {', '.join(sorted(faltan))}: se conserva la versión anterior.")
            salida[nombre] = anterior.get(nombre, [])
            continue
        datos = []
        for f in filas[1:]:
            fila = {c: (f[i].strip() if i < len(f) else "") for i, c in enumerate(cab) if c}
            if any(fila.values()):
                datos.append(fila)
        salida[nombre] = datos
    for p in PESTANAS:
        if p not in salida:
            avisos.append(f"No existe la pestaña «{p}»: se usa la versión anterior.")
            salida[p] = anterior.get(p, [])
    return salida, avisos


def descargar(drive, archivo, destino, exportar=None):
    pedido = drive.files().export_media(fileId=archivo["id"], mimeType=exportar) if exportar else \
        drive.files().get_media(fileId=archivo["id"], supportsAllDrives=True)
    buf = io.BytesIO()
    bajada = MediaIoBaseDownload(buf, pedido)
    listo = False
    while not listo:
        _, listo = bajada.next_chunk()
    destino.write_bytes(buf.getvalue())


def main():
    carpeta, credenciales = config()
    cred = service_account.Credentials.from_service_account_file(credenciales, scopes=ALCANCES)
    drive = build("drive", "v3", credentials=cred, cache_discovery=False)
    sheets = build("sheets", "v4", credentials=cred, cache_discovery=False)

    raiz = hijos(drive, carpeta)
    hoja = next((a for a in raiz if a["mimeType"] == SHEET and a["name"].strip().lower() == HOJA.lower()), None)
    if not hoja:
        sys.exit(f"No se encontró la hoja «{HOJA}» en la carpeta raíz. Revise que la cuenta de servicio tenga acceso.")
    sub = {a["name"].strip().lower(): a["id"] for a in raiz if a["mimeType"] == CARPETA}

    # Se arma todo en una carpeta temporal y solo al final se reemplaza ./contenido: nunca queda a medias.
    tmp = Path(tempfile.mkdtemp(prefix="sede-drive-"))
    for d in ("datos", "paginas", "imagenes"):
        (tmp / d).mkdir()
    anterior = {}
    if (DESTINO / "datos").exists():
        for f in (DESTINO / "datos").glob("*.json"):
            anterior[f.stem] = json.loads(f.read_text(encoding="utf-8"))

    tablas, avisos = leer_hoja(sheets, hoja["id"], anterior)
    for nombre, filas in tablas.items():
        (tmp / "datos" / f"{nombre}.json").write_text(json.dumps(filas, ensure_ascii=False, indent=1), encoding="utf-8")

    huella = hashlib.sha256(json.dumps(tablas, sort_keys=True, ensure_ascii=False).encode())
    carpeta_pag = sub.get("páginas") or sub.get("paginas")
    for doc in hijos(drive, carpeta_pag) if carpeta_pag else []:
        if doc["mimeType"] != DOC:
            continue
        nombre = re.sub(r"[^a-z0-9-]+", "-", doc["name"].strip().lower()).strip("-")
        descargar(drive, doc, tmp / "paginas" / f"{nombre}.md", exportar="text/markdown")
        huella.update((tmp / "paginas" / f"{nombre}.md").read_bytes())

    def traer_imagenes(archivos, relativa):
        (tmp / "imagenes" / relativa).mkdir(parents=True, exist_ok=True)
        for img in archivos:
            if not img["mimeType"].startswith("image/"):
                continue
            if int(img.get("size", 0)) > IMAGEN_MAX:
                avisos.append(f"La imagen «{img['name']}» pesa más de 25 MB y no se usó.")
                continue
            nombre = Path(relativa) / nombre_seguro(img["name"])
            previa = DESTINO / "imagenes" / nombre
            marca = DESTINO / "imagenes" / nombre.parent / f".{nombre.name}.md5"
            if previa.exists() and marca.exists() and marca.read_text() == img.get("md5Checksum"):
                shutil.copy2(previa, tmp / "imagenes" / nombre)  # sin cambios: no se vuelve a descargar
            else:
                descargar(drive, img, tmp / "imagenes" / nombre)
            (tmp / "imagenes" / nombre.parent / f".{nombre.name}.md5").write_text(img.get("md5Checksum", ""))
            huella.update(f"{nombre}:{img.get('md5Checksum')}".encode())

    carpeta_img = sub.get("imágenes") or sub.get("imagenes")
    hijos_img = hijos(drive, carpeta_img) if carpeta_img else []
    traer_imagenes(hijos_img, ".")
    # Imágenes/Recorrido/<número> - <nombre>/: fotos del carrusel de cada lugar del recorrido 3D
    recorrido = next((c for c in hijos_img if c["mimeType"] == CARPETA and c["name"].strip().lower() == "recorrido"), None)
    for lugar in hijos(drive, recorrido["id"]) if recorrido else []:
        numero = re.match(r"\s*0*(\d+)", lugar["name"])
        if lugar["mimeType"] != CARPETA or not numero:
            continue
        traer_imagenes(sorted(hijos(drive, lugar["id"]), key=lambda a: a["name"].lower()), f"recorrido/{numero.group(1)}")

    nueva = huella.hexdigest()
    vieja = (DESTINO / ".huella").read_text() if (DESTINO / ".huella").exists() else ""
    (tmp / ".huella").write_text(nueva)
    (tmp / "avisos.txt").write_text("\n".join(avisos))
    for a in avisos:
        print("Aviso:", a)

    if nueva == vieja:
        shutil.rmtree(tmp)
        print("Drive sin cambios.")
        return 0
    if DESTINO.exists():
        shutil.rmtree(DESTINO)
    shutil.move(str(tmp), DESTINO)
    print(f"Drive con cambios: {sum(len(v) for v in tablas.values())} filas, "
          f"{len(list((DESTINO / 'paginas').glob('*.md')))} páginas, {len(list((DESTINO / 'imagenes').glob('[!.]*')))} imágenes.")
    return 10


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as e:  # cualquier fallo de red o de permisos: se reporta y el sitio queda como estaba
        print(f"Error al sincronizar con Drive: {e}", file=sys.stderr)
        sys.exit(1)
