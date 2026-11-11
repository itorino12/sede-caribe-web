# Sitio web UCR Sede del Caribe

Sitio estático (Python + Jinja2). El contenido sale de Google Drive; la vista previa se publica en GitHub Pages con cada push a `main`. Detalles del Drive y del servidor: README.md.

## Comandos
- Compilar: `python3 build.py --vista-previa` (sale en `dist/`).
- Rehacer la maqueta 3D: `herramientas/rehacer_maqueta.sh`. Regenera los datos desde `herramientas/fuentes/` y rehace las imágenes de respaldo; tarda unos 2,5 min. Con `--sin-fotos` solo regenera los datos y compila, para probar.
- Probar: `python3 herramientas/pruebas.py`, que es la prueba rápida. Para cambios mayores, `--completa`: celular, ficha, pantalla completa, zonas, respaldos sin 3D y axe. Para ver una zona de la maqueta desde arriba, `--vista=X,Z,ALTO`; en vista oblicua, `--camara=TX,TY,TZ,CX,CY,CZ` (objetivo y cámara; se puede repetir). Las capturas quedan en `.cache/pruebas/`.

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
- Relieve y quebrada: del plano de conjunto de la OEPI (2010, `herramientas/fuentes/plano-oepi-2010.pdf`). `herramientas/relieve_oepi.py` saca cotas, curvas y cauce a `fuentes/relieve-oepi.json` (las cotas se leyeron a mano y están escritas en el script); `herramientas/relieve.py` los lleva a la maqueta (placa delgada con los edificios comunes y el puente) y arma la malla de alturas (`relieve` en `campus3d.json`, decímetros). Del plano solo se usan relieve y quebrada: su infraestructura es vieja.
  - En el visor, `alturaEn(x, z)` da la altura del terreno. Al final del armado, «asentar»: un lugar con altura (< 75 m) se sube entero y el terreno se empareja bajo su huella (`userData.talud` cambia el talud); lo lineal (`userData.lineal`: pasillos, aceras, cercas) y lo plano a ras del suelo siguen el terreno tramo a tramo. Lo que se agregue después se arma en y = 0, como siempre.
  - Relieve.py: plataformas a nivel (edificios, explanada, pista, parqueo; el edificio 1 con su loma de 3,5 m y la escalera y rampas al pie), excavación al pie del cerro frente al auditorio (plaza y baño a nivel) y el sendero a la explanada como rampa que contiene el cerro. Calles en terraplén donde cruzan la hondonada de la quebrada. Bajo calles, pasillos y aceras el cauce no se excava.
  - Puntos de control de la quebrada: el puente, el paso rayado sobre la alcantarilla (19) y el medio entre las mallas al este del puente (`relieve.py`).
- Coordenadas en metros: x crece hacia el este y z hacia el sur. Zonas: 1 cian, 2 amarillo, 3 magenta, 4 negro.
- Si se cambia la maqueta y no se rehacen las imágenes de respaldo, la portada y la versión sin 3D quedan desactualizadas.

## Asistente (el congo)
- `src/assets/js/congo.js`: el congo y su rama (portada y panel); `src/assets/js/asistente.js`: el chat. Su contrato (`POST api/asistente`, texto por partes) no se cambia.
- Servidor CONGO 2.0: `servidor/congo/` (FastAPI, RAG, Gemini). Ver README, sección «Asistente».
  - Capas: `proveedores/` (IA), `documentos/` (extracción, fragmentos, registro), `busqueda/` (embeddings, Chroma), `servicios/` (recuperación, prompts, citas, chat), `rutas/` (API).
- Probar sin gastar: `bash herramientas/probar_congo.sh` (pytest, con proveedor y embeddings de prueba). Las pruebas `--completa` del sitio incluyen el chat.

## Drive = sitio
- La hoja «Contenido del sitio» (Drive) debe reflejar siempre `src/data/*.json`; en el servidor manda Drive, así que una pestaña vacía o vieja deja el sitio oficial desactualizado.
- Todo cambio en `src/data/*.json` se copia a la hoja en la misma tarea: `python3 herramientas/valores_hoja.py <pestaña> [--desde N --hasta M --sin-encabezado]` imprime las filas en JSON para `update_values`; las columnas de fecha y hora van como texto (formato TEXTO) para que Sheets no las convierta.
- Verificar con `valores_hoja.py <pestaña> --suma` (filas y suma de largos) contra `=SUMPRODUCT(LEN(rango))` y `COUNTA` en la hoja; si no coinciden, no se da por sincronizado.
- La cuenta de servicio del servidor solo lee: la escritura en Drive la hace Claude con las herramientas de Sheets.

## Reglas
- JorjaniEsp también sube cambios. Antes de hacer push: `git fetch`; si hay cambios, `git pull --rebase` y, si hay conflicto en `campus3d.json`, regenerarlo en vez de fusionarlo a mano.
- No subir capturas ni scripts temporales. Las pruebas que se repiten van en `herramientas/`.
- Mensajes de commit en español. Al usuario se le responde en español y de usted.
