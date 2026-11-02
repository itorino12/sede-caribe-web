#!/usr/bin/env bash
# Mantiene el sitio al día. Lo ejecuta sede-actualizar.timer cada 5 minutos (como el usuario sedeweb).
#   1. Trae cambios de código desde GitHub (plantillas, estilos).
#   2. Trae cambios de contenido desde Google Drive.
#   3. Si algo cambió, o si cambió el día (avisos que vencen, noticias programadas), recompila y publica.
# Si la sincronización o la compilación fallan, el sitio en línea no se toca.
{
set -euo pipefail
REPO=/opt/sede-web
WEB=/var/www/sede
PY="$REPO/.venv/bin/python"
exec 9>/run/sede-web/actualizar.lock
flock -n 9 || { echo "Ya hay una actualización en curso; se omite."; exit 0; }

cd "$REPO"
motivo=()

RAMA=$(git rev-parse --abbrev-ref HEAD)
if git fetch --quiet origin "$RAMA"; then
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$RAMA")" ]; then
    git pull --ff-only --quiet
    "$REPO/.venv/bin/pip" install --quiet -r requirements.txt
    motivo+=("código")
  fi
else
  echo "No se pudo consultar GitHub; se sigue con el código actual."
fi

set +e
"$PY" sincronizar_drive.py
codigo=$?
set -e
case $codigo in
  0)  ;;
  10) motivo+=("contenido de Drive") ;;
  *)  echo "La sincronización con Drive falló; se publica con el último contenido bueno." ;;
esac

HOY=$(TZ=America/Costa_Rica date +%F)
if [ "$(cat /run/sede-web/ultimo-dia 2>/dev/null)" != "$HOY" ]; then motivo+=("cambio de día"); fi

[ ${#motivo[@]} -eq 0 ] && exit 0

echo "Recompilando por: ${motivo[*]}"
"$PY" build.py
rsync -a --delete dist/ "$WEB"/
echo "$HOY" > /run/sede-web/ultimo-dia
echo "Sitio publicado $(TZ=America/Costa_Rica date '+%F %T') ($(git log -1 --format='%h'))"
exit 0
}
