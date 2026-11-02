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
| noticias | Noticias | publicar, id, fecha, categoria, titulo, resumen, cuerpo, documento, imagen, imagen_alt, autor, destacada |
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
- Las actividades pasadas salen de la agenda y quedan 30 días en «Del último mes».
- La columna **documento** apunta a un Documento de Google de la carpeta «Páginas» por su nombre (por ejemplo, `historia`). Si una noticia tiene documento, se usa en lugar de la columna «cuerpo».
- La columna **imagen** lleva el nombre exacto de un archivo de la carpeta «Imágenes». El servidor lo convierte a WebP en dos tamaños.

## Páginas del sitio

| Página | Contenido |
|---|---|
| `index.html` | Portada: «Hoy en la Sede» (fecha, avisos, próximas actividades, última noticia), accesos por perfil, noticias, carreras por área, historia, servicios |
| `estudiar.html` y `carreras/<id>.html` | Oferta académica con filtro por área y una ficha por carrera |
| `admision.html` | Pasos para ingresar |
| `la-sede.html` | Historia, misión y visión, coordinaciones, servicios |
| `unidades/<id>.html` | Una página por coordinación, recinto o servicio, con sus extensiones |
| `noticias.html` y `noticias/<id>.html` | Noticias con filtro por tema y página propia para compartir |
| `agenda.html` | Agenda por mes; `agenda.ics` permite suscribirse desde cualquier calendario |
| `directorio.html` | Extensiones con buscador |
| `enlaces.html`, `contacto.html`, `accesibilidad.html`, `404.html` | |

En todas: buscador interno (tecla `/` o Ctrl+K), panel de accesibilidad (texto, tema claro u oscuro, alto contraste, subrayado, animaciones), RSS de noticias, mapa del sitio y datos estructurados para buscadores.

**Calidad verificada:** 0 incumplimientos WCAG 2.2 A/AA (axe-core 4.14) en 13 páginas, en modo claro y oscuro. Sin desbordamiento horizontal a 390 px. Sin enlaces internos rotos ni errores de JavaScript.

## Trabajar localmente

```bash
pip install -r requirements.txt
python3 build.py --servir              # con el contenido de respaldo (src/data)
python3 build.py --ejemplos --servir   # con actividades y aviso de ejemplo marcados
```

`herramientas/semilla.py` y `herramientas/semilla_paginas.py` regeneran el contenido de respaldo migrado del sitio anterior.

## Poner en marcha el servidor

1. Pedir al CDI una máquina virtual Ubuntu 24.04 con salida a internet (GitHub y googleapis.com) y el DNS de sedecaribe.ucr.ac.cr.
2. `sudo bash servidor/preparar-servidor.sh https://github.com/USUARIO/sede-caribe-web.git`
3. En Google Cloud: crear un proyecto, habilitar las API de Drive y de Sheets, crear una **cuenta de servicio** y descargar su llave JSON. Copiarla a `/etc/sede-web/cuenta-servicio.json` (`chmod 640`, grupo `sedeweb`).
4. Compartir la carpeta raíz del Drive con el correo de la cuenta de servicio, como **Lector**.
5. Escribir el ID de la carpeta en `/etc/sede-web/sede.env`.
6. `sudo certbot --nginx -d sedecaribe.ucr.ac.cr`
7. Probar: `sudo systemctl start sede-actualizar && journalctl -u sede-actualizar -n 30 --no-pager`

`servidor/nginx-sede.conf` ya redirige las direcciones del sitio Joomla anterior (`/index.php/...`) a sus equivalentes nuevas, para no romper enlaces compartidos.

**Pasar el Drive a una cuenta institucional:** compartir la nueva carpeta con la misma cuenta de servicio y cambiar `SEDE_DRIVE_CARPETA`. No hay que tocar código.
