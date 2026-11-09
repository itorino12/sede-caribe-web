# Sitio web UCR Sede del Caribe

Sitio estático (Python + Jinja2). El contenido sale de Google Drive; la vista previa se publica en GitHub Pages con cada push a `main`. Detalles del Drive y del servidor: README.md.

## Comandos
- Compilar: `python3 build.py --vista-previa` (sale en `dist/`).
- Rehacer la maqueta 3D: `herramientas/rehacer_maqueta.sh`. Regenera los datos desde `herramientas/fuentes/` y rehace las imágenes de respaldo; tarda unos 2,5 min. Con `--sin-fotos` solo regenera los datos y compila, para probar.
- Probar: `python3 herramientas/pruebas.py`, que es la prueba rápida. Para cambios mayores, `--completa`: celular, ficha, pantalla completa, zonas, respaldos sin 3D y axe. Para ver una zona de la maqueta desde arriba, `--vista=X,Z,ALTO`. Las capturas quedan en `.cache/pruebas/`.

## Maqueta 3D
- Generador: `herramientas/campus3d.py`. Produce `src/data/campus3d.json` y `src/assets/img/campus-suelo.webp`.
  - Por dentro usa los números del croquis; `NUMERACION` los convierte a los 37 lugares publicados.
  - `DEPENDENCIAS` tiene las aulas y oficinas que muestra la ficha de cada edificio.
- Visor (`src/assets/js/`):
  - `recorrido.js`: la escena 3D.
  - `recorrido-entorno.js`: los barrios alrededor.
  - `recorrido-config.js`: prioridad de los números y `FRENTE_PORTADA`.
  - `recorrido-ficha.js`: la ficha de cada lugar.
  - `recorrido-giro.js` y `portada-giro.js`: los respaldos sin 3D.
- Coordenadas en metros: x crece hacia el este y z hacia el sur. Zonas: 1 cian, 2 amarillo, 3 magenta, 4 negro.
- Si se cambia la maqueta y no se rehacen las imágenes de respaldo, la portada y la versión sin 3D quedan desactualizadas.

## Asistente (el congo)
- `src/assets/js/congo.js`: el congo y su rama (portada y panel); `src/assets/js/asistente.js`: el chat. Su contrato (`POST api/asistente`, texto por partes) no se cambia.
- Servidor CONGO 2.0: `servidor/congo/` (FastAPI, RAG, Gemini). Ver README, sección «Asistente».
  - Capas: `proveedores/` (IA), `documentos/` (extracción, fragmentos, registro), `busqueda/` (embeddings, Chroma), `servicios/` (recuperación, prompts, citas, chat), `rutas/` (API).
- Probar sin gastar: `bash herramientas/probar_congo.sh` (pytest, con proveedor y embeddings de prueba). Las pruebas `--completa` del sitio incluyen el chat.

## Reglas
- JorjaniEsp también sube cambios. Antes de hacer push: `git fetch`; si hay cambios, `git pull --rebase` y, si hay conflicto en `campus3d.json`, regenerarlo en vez de fusionarlo a mano.
- No subir capturas ni scripts temporales. Las pruebas que se repiten van en `herramientas/`.
- Mensajes de commit en español. Al usuario se le responde en español y de usted.
