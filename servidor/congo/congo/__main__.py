"""Arranca CONGO 2.0: python -m congo (lo hace sede-congo.service).

Escucha solo en 127.0.0.1: nginx lo publica en /api/. Un solo proceso, porque Chroma y SQLite tienen un solo escritor.
Si el código cambia (llega con git pull), sale y systemd lo vuelve a arrancar con la versión nueva.
"""
import logging
import os
import threading
import time
from pathlib import Path

import uvicorn

from .app import crear_app

CODIGO = Path(__file__).parent


def huella():
    return sorted((str(p), p.stat().st_mtime) for p in CODIGO.rglob("*.py"))


def vigilar_codigo():
    inicial = huella()
    while True:
        time.sleep(60)
        try:
            if huella() != inicial:
                logging.getLogger("congo").warning("el código cambió: reinicio")
                os._exit(0)
        except OSError:
            pass


def main():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    threading.Thread(target=vigilar_codigo, daemon=True).start()
    puerto = int(os.environ.get("CONGO_PUERTO", "8787"))
    uvicorn.run(crear_app(), host="127.0.0.1", port=puerto, workers=1, access_log=False, proxy_headers=False,
                timeout_keep_alive=5)


if __name__ == "__main__":
    main()
