# Sitio web de la Universidad de Costa Rica, Sede del Caribe

Sitio estático que se alimenta de Google Drive. Quien publica no toca código: edita una hoja de cálculo y unos documentos en Drive, y el servidor publica solo en unos 5 a 10 minutos.

## Cómo funciona

```
Google Drive (contenido)          GitHub (código)
        │                               │
        └──────────┐       ┌────────────┘
                   ▼       ▼
     Servidor UCR: sede-actualizar.timer, cada 5 minutos
       1. git pull                    si hay cambios de código
       2. sincronizar_drive.py        si hay cambios de contenido
       3. build.py → /var/www/sede    si algo cambió o cambió el día
```

- Si Drive no responde o la compilación falla, el sitio en línea **no se toca**.
- Si una pestaña de la hoja está mal armada (por ejemplo, alguien borró la columna «fecha»), se conserva la versión anterior de esa pestaña y se registra un aviso.
- Todo el texto que viene de Drive se limpia: nadie puede inyectar scripts ni estilos desde la hoja o los documentos.

## El Drive

Carpeta raíz del sitio, compartida como **Lector** con la cuenta de servicio del servidor:

```
Sitio web Sede del Caribe/
├── Contenido del sitio        Hoja de cálculo (una pestaña por tabla)
├── Páginas/                   Un Documento de Google por página de texto largo
├── Imágenes/                  Fotos de noticias y páginas
└── Guía para editores         Cómo publicar, paso a paso
```

### Pestañas de «Contenido del sitio»

La fila 1 son los encabezados (se pueden escribir con tildes y mayúsculas). Las columnas pueden ir en cualquier orden.

| Pestaña | Para qué | Columnas |
|---|---|---|
| config | Datos generales | clave, valor |
| avisos | Franja de aviso urgente o aviso en «Hoy en la Sede» | publicar, tipo (urgente o informativo), titulo, texto, enlace_texto, enlace, desde, hasta |
| noticias | Noticias | publicar, id, fecha, categoria, titulo, resumen, cuerpo, documento, imagen, imagen_alt, autor, destacada, fotos (galería: archivos de Imágenes separados por comas), fotos_alt (separadas por \|) |
| eventos | Agenda | publicar, id, fecha, hora, fecha_fin, titulo, lugar, categoria, descripcion, enlace, enlace_texto, organiza |
| carreras | Oferta académica | publicar, id, nombre, grados, codigo, area, recintos, coordinacion, correo, extension, resumen, plan_url, documento |
| unidades | Coordinaciones, recintos y servicios | publicar, id, nombre, grupo (Gobierno, Coordinaciones, Recintos o Servicios), responsable, cargo, correo, extension, edificio, resumen, documento |
| directorio | Extensiones | unidad, oficina, extension, edificio, correo |
| enlaces | Sistemas y trámites | grupo, titulo, url, descripcion |
| hitos | Línea de tiempo de la historia | anio, texto |
| cifras | Datos de la Sede | valor, etiqueta, fuente |

### Reglas de publicación

- Una fila sale en el sitio solo si **publicar** dice `sí`. Así, la columna funciona como aprobación.
- Una noticia con **fecha futura** queda programada y aparece ese día.
- Un aviso se muestra solo entre su fecha **desde** y su fecha **hasta**, y luego desaparece sin que nadie lo borre.
- La agenda muestra arriba los plazos en curso, luego las próximas actividades por mes (con minicalendario y filtro por tema) y, plegadas al final, las anteriores. En «Esta semana», un plazo de más de una semana aparece solo el día que abre y el día que cierra.
- La columna **documento** apunta a un Documento de Google de la carpeta «Páginas» por su nombre (por ejemplo, `historia`). Si una noticia tiene documento, se usa en lugar de la columna «cuerpo».
- La columna **imagen** lleva el nombre exacto de un archivo de la carpeta «Imágenes». El servidor lo convierte a WebP en dos tamaños.

## Páginas del sitio

| Página | Contenido |
|---|---|
| `index.html` | Portada: «Hoy en la Sede» (fecha, avisos, próximas actividades, última noticia), accesos por perfil, noticias, carreras por área, historia, servicios |
| `estudiar.html` | Orientador: gustos y seis preguntas que sugieren las carreras más cercanas (`src/data/orientador.json`, `assets/js/orientador.js`) |
| `carreras.html` y `carreras/<id>.html` | Oferta académica (menú Docencia) con filtro por área y una ficha por carrera; el plan de estudios abre en pestaña nueva |
| `admision.html` | Pasos para ingresar |
| `la-sede.html` | Historia, misión y visión, coordinaciones, servicios |
| `unidades/<id>.html` | Una página por coordinación, recinto o servicio, con sus extensiones |
| `noticias.html` y `noticias/<id>.html` | Noticias con filtro por tema y página propia para compartir |
| `agenda.html` | Agenda por mes; `agenda.ics` permite suscribirse desde cualquier calendario |
| `directorio.html` | Extensiones con buscador |
| `enlaces.html`, `contacto.html`, `accesibilidad.html`, `404.html` | |

### Página de una carrera (molde)

`carreras/informatica-empresarial.html` es el ejemplo completo. Cada carrera tiene, como mínimo, su fila en la pestaña «carreras» y su documento en Páginas. El resto es opcional y sale de `src/data/carreras/<id>.json`; cada sección aparece solo si su clave existe:

| Clave | Qué muestra |
|---|---|
| `lema` | Bajada bajo el título |
| `cifras` | Tarjetas de datos sobre el texto (`valor`, `etiqueta`) |
| `planes` | Botones de las mallas en PDF en la ficha (`nombre`, `detalle`, `url`, `principal`). Si no existe, se usa `plan_url` |
| `malla` | Malla interactiva: `areas` (con `color` y `oscuro` para el modo oscuro), `ciclos`, `cursos` (`sigla`, `nombre`, `ciclo`, `area`, `creditos`, `req`, `req_texto`, `desc`, `horas`, `optativo`, `nota`, `programa`) y `optativos` por área |
| `actualizacion` | Plan vigente: resumen, `apertura`, `aprobacion`, `comparacion` con el plan anterior y reglas de `transicion` |
| `acreditacion` | Estado, avance del plan de mejora (`pem`) e `hitos` |
| `historia`, `sedes`, `intersedes` | Línea de tiempo y cifras por recinto |

- `req` lista las siglas de la malla que son requisito; con eso se dibuja la ruta. `req_texto` es el requisito oficial tal como lo escribe el plan, con las equivalencias del plan anterior.
- `programa` apunta al PDF vigente en `src/assets/programas/<id>/` (`archivo`, `ciclo`, `kb`). Al subir un programa nuevo, se reemplaza el PDF y se actualizan `ciclo` y `kb`.
- La malla en PDF del plan vigente va en `src/assets/docs/`.
- Las mallas de las demás carreras se generan desde el texto del plan oficial: `python3 herramientas/mallas_planes.py [id]` (configuración por carrera en `herramientas/mallas_config.py`; textos en `herramientas/fuentes/planes/`). Planes en formato «estructura curricular» los lee `plan_texto.py`; los fascículos del SAE (Inglés), `plan_sae.py`; la de Ingeniería Química se transcribió a mano en `mallas_config.py`. Si el plan cambia, se actualiza el texto y se vuelve a correr (solo toca la clave `malla`). Sin malla: Comunicación Colectiva (falta el plan) y la maestría.
- Los énfasis se muestran juntos en el mismo ciclo (Administración Aduanera IX–X; Marina Civil IV–XI); `creditos_ciclo` de la configuración pone los créditos que cursa cada estudiante.
- `malla.js` dibuja la ruta. Sin JavaScript queda la lista por ciclo con requisitos y programas.

En todas: buscador interno (tecla `/` o Ctrl+K), panel de accesibilidad (texto, tema claro u oscuro, alto contraste, subrayado, animaciones), RSS de noticias, mapa del sitio y datos estructurados para buscadores.

**Calidad verificada:** 0 incumplimientos WCAG 2.2 A/AA (axe-core 4.14) en 17 páginas, en modo claro y oscuro. Sin desbordamiento horizontal a 390 px. Sin enlaces internos rotos ni errores de JavaScript.

## Recorrido 3D del campus

`recorrido.html` muestra una maqueta 3D del campus (three.js, servido desde `assets/js/vendor/`, sin depender de otros sitios). Se entra desde el botón «Recorrer la Sede en 3D» de la portada o desde el menú La Sede.

- **Forma del campus:** `src/data/campus3d.json` y la textura `src/assets/img/campus-suelo.webp` salen del croquis oficial «Distribución de Aulas» (guardado en `herramientas/fuentes/` junto con la captura satelital). Para rehacer la maqueta entera, con las imágenes de respaldo, se usa `herramientas/rehacer_maqueta.sh`, y para probar, `python3 herramientas/pruebas.py` (`--completa` para cambios mayores). El croquis es esquemático: formas y alturas son aproximadas. Si cambia un edificio, se ajusta su línea en `EDIFICIOS` dentro del script y se vuelve a correr.
- **Relieve y quebrada:** salen del plano de conjunto de la OEPI de 2010 (`herramientas/fuentes/plano-oepi-2010.pdf`, curvas cada 0,5 m y puntos de cota). Las cotas se leyeron a mano en `herramientas/relieve_oepi.py`; `herramientas/relieve.py` las pasa a la maqueta. Fuera de la zona que levantó el plano (por ejemplo, la pista) el terreno es una continuación suave, no un dato. La infraestructura de ese plano no se usa: es anterior al auditorio y a la entrada actual.
- **Nombres y textos:** pestaña «lugares» de la hoja (id = número del croquis). Si la pestaña falta o está vacía, se usa `src/data/lugares.json`.
- **Sin 3D:** si el navegador no permite 3D (o pierde el contexto gráfico), se carga una maqueta giratoria: 24 vistas de la maqueta en `src/assets/img/giro/`, generadas con `python3 herramientas/giro.py` después de compilar. Hay que volver a generarlas cuando cambie la maqueta. En teléfonos la maqueta 3D va en modo liviano (menos resolución y sombras más simples).
- **Fotos por carpeta:** en Drive, `Imágenes/Recorrido/<número> - <nombre>/` (p. ej. «37 - Pista Atlética»). La sincronización las baja a `contenido/imagenes/recorrido/<número>/` y se suman al carrusel del lugar, en orden de nombre.
- **Fotos:** columna «fotos» (archivos de la carpeta Imágenes, separados por comas) y «fotos_alt» (descripciones separadas por |). Salen en un carrusel en la ficha y se amplían a pantalla completa.
- **Fotos 360°:** la columna «foto360» queda lista para cuando existan las fotos.

## Trabajar localmente

```bash
pip install -r requirements.txt
python3 build.py --servir              # con el contenido de respaldo (src/data)
python3 build.py --ejemplos --servir   # con actividades y aviso de ejemplo marcados
```

`herramientas/semilla.py` y `herramientas/semilla_paginas.py` regeneran el contenido de respaldo migrado del sitio anterior.

## Asistente (el congo)

En la portada, un congo anda colgado de una rama. Al tocarlo se baja y abre un chat: el asistente de la Sede.

- **Sitio:** `src/assets/js/congo.js` (dibujo y animación del congo y la rama) y `src/assets/js/asistente.js` (el chat). Pide las respuestas a `api/asistente`; si no hay servidor (la vista previa de GitHub Pages) o falla, lo dice y responde con enlaces del propio sitio, usando el índice del buscador.
- **Servidor: CONGO 2.0** (`servidor/congo/`, servicio `sede-congo`, FastAPI en 127.0.0.1:8787). Responde con base en documentos oficiales (RAG) y cita las fuentes reales:
  1. Oculta datos personales de la pregunta (cédula, carné, teléfono, correo).
  2. Busca fragmentos vigentes por significado (fastembed, modelo multilingüe local) y por palabras (SQLite FTS5).
  3. Si ningún fragmento pasa el umbral, responde que no tiene la información, sin llamar al modelo.
  4. Si hay fragmentos, se los da a Gemini numerados. El código quita las marcas `[F#]` y agrega al final la lista «Fuentes» con documento, artículo o sección, página y enlace reales.
- **Qué sabe:** las páginas publicadas del sitio (se indexan solas) y los documentos de la carpeta de Drive «Documentos del congo». Esa carpeta lleva una hoja «Metadatos» con una fila por archivo: `archivo, id, nombre, categoria (institucional|normativa), subcategoria, version, vigencia (vigente|derogado|reemplazado|retirado), fecha_publicacion, fecha_actualizacion, url, confidencial`. Sin fila, el archivo no se usa. Si está marcado confidencial, no se incorpora. Un documento no vigente sale de la búsqueda, pero queda su historial. Se revisa cada 10 minutos.
- **Contrato con el sitio:** el mismo de antes. `POST /api/asistente` recibe `{"mensajes":[{"rol","texto"}]}` y devuelve texto por partes. El frontend no cambió. Si el proveedor falla o se agota la cuota, devuelve 503 y el sitio busca por su cuenta.
- **Otros endpoints:**
  - `POST /api/chat`: JSON con `answer`, `sources`, `confidence` y `requires_human_review`.
  - `POST /api/search` y `GET /api/health`.
  - Administración, que exige la cabecera `X-Congo-Clave` y nginx solo la deja pasar desde la red de la UCR:
    - `POST /api/documents/upload`, `GET /api/documents[/{id}]`, `PATCH /api/documents/{id}` (vigencia), `DELETE /api/documents/{id}` y `POST /api/documents/{id}/reprocess`.
    - `GET /api/admin/stats`, `GET /api/admin/unanswered`, `GET /api/admin/categories` y `POST /api/admin/sync`.
  - Documentación OpenAPI en `/api/docs` con `CONGO_DOCS=1`.
- **Llave y privacidad:** `GEMINI_API_KEY` en `/etc/sede-web/sede.env`. Se saca en aistudio.google.com/apikey, sin activar facturación. En el nivel gratuito, Google puede usar y revisar lo que recibe: por eso se ocultan los datos personales y solo se indexan documentos públicos. Con `CONGO_PROVEEDOR=claude` y `ANTHROPIC_API_KEY` se usa Claude, que es de pago. Todas las variables están en `servidor/congo/congo/config.py`.
- **Topes:** 30 preguntas por hora por persona y 1000 por día en total, además del límite de nginx.
- **Datos:** `/var/lib/sede-congo` (registro SQLite, vectores de Chroma, originales y el modelo). No guarda conversaciones. Las preguntas sin respuesta se guardan con los datos personales ocultos y se borran a los 30 días.
- **Probar:**
  - `bash herramientas/probar_congo.sh` corre las pruebas automáticas sin gastar cuota.
  - En la VM, `bash herramientas/probar_congo.sh --en-vivo` revisa el servicio y hace una pregunta real.
- **Requisitos de la VM:** unos 1,5 GB de RAM para el servicio. Salida HTTPS a `generativelanguage.googleapis.com` y `pypi.org`, y a `huggingface.co` la primera vez, para bajar el modelo de búsqueda (~220 MB).

## Visitas y enlaces

- **Visitas (sin cookies, sin terceros):** `src/assets/js/visitas.js` envía a `POST /api/visita` solo la ruta (sin parámetros ni ancla), el dominio de origen y si la pantalla es de celular. Se omite en la vista previa y si el navegador pide «No rastrear» (DNT o GPC). El servidor (`servidor/congo/congo/servicios/visitas.py`) cuenta por día, ruta, origen y dispositivo en `/var/lib/sede-congo/visitas.sqlite3`; **no guarda IP, navegador ni textos de búsqueda**, descarta robots y cuenta visitantes distintos con un identificador temporal que vive solo en memoria y cambia cada día. Se apaga con `CONGO_VISITAS=0`. Informe (misma clave y red que el resto de la administración): `curl -H "X-Congo-Clave: …" "https://sedecaribe.ucr.ac.cr/api/admin/visitas?dias=30"` (nginx solo lo deja pasar desde la red de la UCR; también sirve desde la VM con `http://127.0.0.1:8787`). Pasa por la CSP sin cambios (`connect-src 'self'`). Ojo: nginx pide recargar (`nginx -t && systemctl reload nginx`) y el servicio, reiniciarse tras actualizar.
- **Verificador de enlaces:** `python3 herramientas/verificar_enlaces.py` (después de compilar) revisa enlaces internos, imágenes, scripts, estilos y anclas; las `#lugar-N` del recorrido se validan contra `src/data/lugares.json`. Los que dependen del Joomla anterior (`/images/…`, `/index.php/…`) salen aparte. `--externos` comprueba cada enlace de internet; `--estricto` convierte avisos en error; `--autoprueba` lo prueba con un sitio de muestra. En GitHub: `vista-previa.yml` corre la revisión interna antes de publicar (un enlace interno roto detiene el despliegue) y `enlaces.yml` revisa los externos cada lunes y abre, actualiza o cierra un aviso (issue).

## Poner en marcha el servidor

1. Pedir al CDI una máquina virtual Ubuntu 24.04 (2 vCPU, 4 GB de RAM) con salida HTTPS a GitHub, googleapis.com, generativelanguage.googleapis.com, pypi.org y huggingface.co, y el DNS de sedecaribe.ucr.ac.cr.
2. `sudo bash servidor/preparar-servidor.sh https://github.com/USUARIO/sede-caribe-web.git`
3. En Google Cloud: crear un proyecto, habilitar las API de Drive y de Sheets, crear una **cuenta de servicio** y descargar su llave JSON. Copiarla a `/etc/sede-web/cuenta-servicio.json` (`chmod 640`, grupo `sedeweb`).
4. Compartir la carpeta raíz del Drive con el correo de la cuenta de servicio, como **Lector**.
5. Escribir el ID de la carpeta en `/etc/sede-web/sede.env`.
6. `sudo certbot --nginx -d sedecaribe.ucr.ac.cr`
7. Probar: `sudo systemctl start sede-actualizar && journalctl -u sede-actualizar -n 30 --no-pager`
8. Asistente: escribir `GEMINI_API_KEY`, `CONGO_CLAVE_ADMIN` (`openssl rand -hex 24`) y `CONGO_DRIVE_CARPETA` en `/etc/sede-web/sede.env`. Compartir la carpeta «Documentos del congo» con la cuenta de servicio, como Lector. Luego ejecutar `sudo systemctl restart sede-congo` y `bash herramientas/probar_congo.sh --en-vivo`.
9. Calibrar `CONGO_UMBRAL` con preguntas reales. El valor por omisión (0,45) es un punto de partida: no se ha medido con los documentos de la Sede.

`servidor/nginx-sede.conf` ya redirige las direcciones del sitio Joomla anterior (`/index.php/...`) a sus equivalentes nuevas, para no romper enlaces compartidos.

**Pasar el Drive a una cuenta institucional:** compartir la nueva carpeta con la misma cuenta de servicio y cambiar `SEDE_DRIVE_CARPETA`. No hay que tocar código.
