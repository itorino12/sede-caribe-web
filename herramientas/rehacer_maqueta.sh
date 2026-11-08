#!/usr/bin/env bash
# Rehace la maqueta 3D completa después de cambiar herramientas/campus3d.py o recorrido.js:
# datos y textura del suelo, imágenes de respaldo (portada y maqueta giratoria) y el sitio compilado.
# Uso:  herramientas/rehacer_maqueta.sh            todo
#       herramientas/rehacer_maqueta.sh --sin-fotos solo datos y compilación (más rápido; las imágenes de
#                                                   respaldo quedan viejas: no publicar así cambios visibles)
set -euo pipefail
cd "$(dirname "$0")/.."
F=herramientas/fuentes
python3 herramientas/campus3d.py "$F/croquis-aulas.pdf" "$F/satelite.png"
python3 build.py --vista-previa | tail -1
if [[ "${1:-}" != "--sin-fotos" ]]; then
  python3 herramientas/portada.py
  python3 herramientas/giro.py | tail -1
  cp src/assets/img/giro/giro-00.webp src/assets/img/campus-maqueta.webp
  python3 build.py --vista-previa | tail -1
fi
