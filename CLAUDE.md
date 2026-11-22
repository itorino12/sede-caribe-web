# Sitio web UCR Sede del Caribe

Sitio estático (Python + Jinja2). El contenido sale de Google Drive; la vista previa se publica en GitHub Pages con cada push a `main`. Detalles del Drive y del servidor: README.md.

## Comandos
- Compilar: `python3 build.py --vista-previa` (sale en `dist/`).
- Rehacer la maqueta 3D: `herramientas/rehacer_maqueta.sh`. Regenera los datos desde `herramientas/fuentes/` y rehace las imágenes de respaldo; tarda unos 2,5 min. Con `--sin-fotos` solo regenera los datos y compila, para probar.
- Probar: `python3 herramientas/pruebas.py`, que es la prueba rápida. Para cambios mayores, `--completa`: celular, ficha, pantalla completa, zonas, respaldos sin 3D y axe. Para ver una zona de la maqueta desde arriba, `--vista=X,Z,ALTO`; en vista oblicua, `--camara=TX,TY,TZ,CX,CY,CZ` (objetivo y cámara; se puede repetir). Las capturas quedan en `.cache/pruebas/`. `--solo=declaracion|paletas|sin_conexion|visita|busqueda|armador|propuestas|asistente` corre una sola prueba.

- Arte de una noticia (1200×800, estilo de la Sede): `python3 herramientas/arte_noticia.py herramientas/fuentes/noticias/<id>.json` (escribe en `src/assets/fotos/noticias/`; lo importante dentro de la franja 16:10 que recorta el carrusel). Revisar la miniatura en `noticias.html`.
- Rótulos QR de los lugares: `python3 herramientas/qr_lugares.py [--base URL] --verificar` (PDF en `.cache/qr-lugares.pdf`; usa `base_url` de la hoja; `--verificar` decodifica cada QR).
- Sin conexión: `src/sw.js` → `dist/sw.js`; páginas del botón «Guardar» en `SIN_CONEXION` (build.py). Prueba: `pruebas.py --solo=sin_conexion`. Si se cambia el nombre de un CSS/JS básico, revisar `ESENCIAL` en sw.js.
- Combinaciones de colores (botón «Colores» de la barra de arriba, ventana `#panel-colores`): se definen solo en `herramientas/paletas.py`, con colores de la paleta UCR; `python3 herramientas/paletas.py` comprueba el contraste y reescribe el bloque `paletas: inicio … fin` de sede.css (no editarlo a mano). Prueba: `pruebas.py --solo=paletas` (axe con cada una en claro y oscuro).
- Revisar enlaces: `python3 herramientas/verificar_enlaces.py` (después de compilar; `--externos` revisa internet; `--autoprueba` se prueba a sí mismo). Corre solo en GitHub antes de publicar y cada lunes para los externos.
- Política de seguridad del servidor: `python3 herramientas/probar_csp.py` (después de compilar) sirve `dist/` con las cabeceras de `servidor/sede-cabeceras.conf` y avisa de violaciones y errores de JavaScript. Nada de `<script>` con código en línea en las plantillas (van en `assets/js/`, ver `portada-arranque.js`); `style="…"` se permite solo como atributo (`style-src-attr`). GitHub Pages no manda esa política: un fallo así solo se ve en el servidor.
- Visitas propias sin cookies: `visitas.js` + `POST /api/visita` + `GET /api/admin/visitas` (ver README, «Visitas y enlaces»). No guardar IP ni navegador ahí.

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
  - `recorrido-visita.js`: visita guiada (pasa por los lugares con el botón `[data-lugar]` de la lista, sirve sin 3D; en 3D pide el giro con el evento `visita-giro`; `recorrido.html#visita` la inicia sola). Prueba sola: `pruebas.py --solo=visita`.
  - `recorrido-audio.js`: narración de cada lugar al elegirlo (evento `lugar-elegido`) y, en la visita, bienvenida, despedida y música de fondo; botón `[data-sonido]` (se oculta si no hay audios). Guion en `herramientas/fuentes/narracion/guion.txt` (voz ElevenLabs cIBxLwfshLYhRB9lCXEg, eleven_v4, un solo audio con `[long pause]` entre filas); `herramientas/cortar_narracion.py AUDIO [--musica M]` lo corta en `assets/media/narracion/` y escribe las duraciones en `recorrido-narracion.js` (la visita espera a que termine cada narración). Si cambia un texto, se regenera el audio completo.
  - `recorrido-busqueda.js`: buscador de lugares, aulas y dependencias (lee `#datos-campus`; al elegir activa el botón `[data-lugar]` de la lista, así sirve también sin 3D).
- Relieve y quebrada: del plano de conjunto de la OEPI (2010, `herramientas/fuentes/plano-oepi-2010.pdf`). `herramientas/relieve_oepi.py` saca cotas, curvas y cauce a `fuentes/relieve-oepi.json` (las cotas se leyeron a mano y están escritas en el script); `herramientas/relieve.py` los lleva a la maqueta (placa delgada con los edificios comunes y el puente) y arma la malla de alturas (`relieve` en `campus3d.json`, decímetros). Del plano solo se usan relieve y quebrada: su infraestructura es vieja.
  - En el visor, `alturaEn(x, z)` da la altura del terreno. Al final del armado, «asentar»: un lugar con altura (< 75 m) se sube entero y el terreno se empareja bajo su huella (`userData.talud` cambia el talud); lo lineal (`userData.lineal`: pasillos, aceras, cercas) y lo plano a ras del suelo siguen el terreno tramo a tramo. Lo que se agregue después se arma en y = 0, como siempre.
  - Relieve.py: plataformas a nivel (edificios, explanada, pista, parqueo; el edificio 1 con su loma de 3,5 m y la escalera y rampas al pie), excavación al pie del cerro frente al auditorio (plaza y baño a nivel) y el sendero a la explanada como rampa que contiene el cerro. Junto a la quebrada las calles bajan con el terreno (el puente es bajo), con la pendiente suavizada a lo largo de la calle. En el visor, bajo aceras y pisos de pasillo (`userData.franjas`) el terreno toma la rasante del camino. Bajo calles, pasillos y aceras el cauce no se excava.
  - Puntos de control de la quebrada: el puente, el paso rayado sobre la alcantarilla (19) y el medio entre las mallas al este del puente (`relieve.py`).
  - Aguas arriba de la alcantarilla (19) la quebrada sigue `QUEBRADA_ARRIBA` (campus3d.py, trazado de la Sede). `LLANOS` (campus3d.py) son zonas que la Sede pidió llanas: entrada, frente del auditorio y caseta del guarda (`NIVEL_ENTRADA`), la carretera frente a la entrada, la orilla entre la piscina y el puente, el puente y el picnic de residencias (al nivel de la calle). Se aplican después de las calles y antes del cauce. También la bodega (28) y su calle, y el corredor entre las mallas al este del puente (orillas a −0,3 m, sin la cañada del plano; `CAUCE_SOMERO` deja el cauce poco hondo en ese tramo aunque aguas arriba vaya más abajo; el picnic sube en rampa (`rampa` en LLANOS: nivel que va de un punto a otro) de la calle hacia el nivel de residencias). En el puente, malla en el costado este entre las dos mallas de la quebrada. Bajo el puente de residencias (36) el cauce va abierto (se quita del `tubo`); en el visor el puente se asienta con `userData.extremos` (altura de sus extremos y terreno emparejado solo en los estribos); lo lineal que llega a menos de 5,6 m del eje del tablero (`userData.ejeTablero`: mallas, aceras) sube a su nivel para empatar con él.
- Detalles por estilo en `campus3d.py` → `recorrido.js`: `balcones` (25; con `unir_galeria` la losa, la baranda y el techo doblan la esquina hasta el pasillo, con un poste en la esquina), `galeria` (25: pasillo con baranda de tubos en los dos pisos; `aberturas` deja libre la orilla donde llega una pasarela; `mover_postes` corre columnas a otra x y `quitar_postes` las quita), `parasoles_frente`/`parasoles_n` (26), `puerta_biblioteca` (24: entrada en la esquina entre los dos cuerpos, según la foto: puertas de vidrio, alero blanco por las dos paredes, plaza de adoquín en espiga) y `mural_mosaico` (24); `fachadaMirando()` elige la cara por dirección aunque sea la corta. El elemento `pasarela` une 25 y 26 en cada piso (la de arriba techada); con `nivel_de` se asienta a la misma altura que ese lugar (`userData.nivelDe`) y va escalada en alto como los edificios (`EXAGERAR`), para que los pisos y el techo empaten.
- Entrada principal: `entrada()` en `recorrido.js`, hecha según la foto de la portada (pórtico, parada techada, rótulo, astas, reflectores, flores, palmas). La «caseta» (13) es una parada techada abierta (fotos de la Sede, nov. 2026): piso de adoquín en espiga con cordón amarillo, losa blanca plana volada hacia la carretera con vigas oscuras y lámparas cuadradas, columnas de acero gris oscuro en V al frente (cada par en un cuadro de zacate), al fondo hojas blancas con tablones grises de concreto y una banca al pie de cada uno, y un muro blanco con el directorio azul en cada punta. La plaza de adoquín de la isla sale de `ISLA_ENTRADA` en `campus3d.py` (`plaza_entrada` en el JSON). Vista de la foto: `--camara=-34,3.4,-96,-36,2.9,-121`.
- Coordenadas en metros: x crece hacia el este y z hacia el sur. Zonas: 1 cian, 2 amarillo, 3 magenta, 4 negro.
- Si se cambia la maqueta y no se rehacen las imágenes de respaldo, la portada y la versión sin 3D quedan desactualizadas.

## Declaración Jurada (declaracion-jurada.html, en Docencia)
- Réplica del formulario de la ORH. Reglas (A, B, C del revisor) en `src/assets/js/declaracion-reglas.js`, sin DOM; prueba: `node herramientas/probar_declaracion.mjs` (ejemplo con datos ficticios en `herramientas/fuentes/declaracion/`).
- Página: `declaracion.js` (hoja, detalle por fila, Observaciones automáticas, borrador en localStorage); `declaracion-pdf.js` (pdf-lib, misma geometría en puntos que el original, tres campos de firma vacíos y `declaracion.json` adjunto); `declaracion-subir.js` (pdf.js: lee el adjunto sin IA; si no, tapa datos personales y firmas y, con permiso, manda la imagen a `POST api/declaracion`).
- Los PDF de la ORH traen la tabla dibujada como trazos, no como texto: sin IA no se pueden leer. Servidor: `servidor/congo/congo/rutas/declaracion.py` (Gemini con salida JSON; `CONGO_MODELO_DECLARACION` opcional); las reglas que lee la IA están en `servicios/declaracion_reglas.md`.
- Prueba en el navegador: `pruebas.py --solo=declaracion`.

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
- En `pruebas.py`, esperar condiciones con `esperar(p, "js")` y no pausas fijas: en máquinas lentas o sin GPU dan falsas fallas. Para botones dentro de la escena 3D girando, clic en el DOM (`pulsar`).
- Fotos: `build.py` hace cada una en 640, 960, 1280, 1920 y 2560 px (`ANCHOS`); en plantillas, `{{ foto|srcset(raiz, hasta) }}` en vez de escribir el srcset a mano.
- Enlaces al Joomla viejo (`https://sedecaribe.ucr.ac.cr/images/…`): el servidor nuevo los sirve desde `/var/www/sede-legado` (README, «Antes de apagar el Joomla»).
- Mensajes de commit en español. Al usuario se le responde en español y de usted.
