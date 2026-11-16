#!/usr/bin/env bash
# Publica ya, sin esperar al temporizador (cada 5 min), y aplica la configuración del servidor.
# Uso:  sudo bash /opt/sede-web/servidor/desplegar.sh [--congo]
#   --congo   reinicia también el asistente (hágalo si cambió /etc/sede-web/sede.env)
#
# 1. Ejecuta sede-actualizar: baja el código, sincroniza Drive, compila y publica (lo mismo que hace el temporizador).
# 2. Copia a su lugar la configuración de nginx y de los servicios que haya cambiado en el repositorio.
#    - nginx-sede.conf NO se copia si el sitio ya tiene HTTPS (certbot le agregó líneas): se avisa para revisarlo a mano.
# 3. Prueba nginx (nginx -t); si falla, restaura lo anterior y no recarga.
# 4. Muestra un resumen.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Ejecute con sudo."; exit 1; }
REPO=/opt/sede-web
RESPALDO=$(mktemp -d /tmp/desplegar.XXXXXX)
REINICIAR_CONGO=0
[ "${1:-}" = "--congo" ] && REINICIAR_CONGO=1

echo "1/4 Código, contenido de Drive y compilación (puede tardar unos minutos)..."
systemctl start sede-actualizar

echo "2/4 Configuración del servidor..."
NGINX_CAMBIO=0
UNIDAD_CAMBIO=0
copiar() {   # origen destino tipo(nginx|unidad)
  if ! cmp -s "$1" "$2"; then
    [ -f "$2" ] && cp -a "$2" "$RESPALDO/$(echo "$2" | tr / _)"
    cp "$1" "$2"
    echo "  actualizado: $2"
    [ "$3" = nginx ] && NGINX_CAMBIO=1 || UNIDAD_CAMBIO=1
    CAMBIADOS+=("$2")
  fi
}
CAMBIADOS=()
copiar "$REPO/servidor/sede-cabeceras.conf" /etc/nginx/snippets/sede-cabeceras.conf nginx

if grep -q "managed by Certbot" /etc/nginx/sites-available/sede 2>/dev/null; then
  if ! diff -q <(grep -v "managed by Certbot" /etc/nginx/sites-available/sede) "$REPO/servidor/nginx-sede.conf" >/dev/null; then
    echo "  AVISO: nginx-sede.conf tiene cambios que NO se aplican porque el sitio ya usa HTTPS (certbot lo modificó)."
    echo "         Revise a mano:  diff /etc/nginx/sites-available/sede $REPO/servidor/nginx-sede.conf"
  fi
else
  copiar "$REPO/servidor/nginx-sede.conf" /etc/nginx/sites-available/sede nginx
fi

for u in sede-actualizar.service sede-actualizar.timer sede-congo.service; do
  copiar "$REPO/servidor/$u" "/etc/systemd/system/$u" unidad
done

if [ "$NGINX_CAMBIO" = 1 ]; then
  if nginx -t 2>"$RESPALDO/nginx-t.txt"; then
    systemctl reload nginx
    echo "  nginx recargado"
  else
    echo "  nginx -t FALLÓ; se restauran los archivos anteriores y no se recarga:"
    cat "$RESPALDO/nginx-t.txt"
    for f in "${CAMBIADOS[@]}"; do
      r="$RESPALDO/$(echo "$f" | tr / _)"
      [ -f "$r" ] && cp -a "$r" "$f" && echo "  restaurado: $f"
    done
    exit 1
  fi
fi
if [ "$UNIDAD_CAMBIO" = 1 ]; then
  systemctl daemon-reload
  # si cambió la definición de un servicio, el asistente arranca con la nueva
  for f in "${CAMBIADOS[@]}"; do
    if [[ "$f" == *sede-congo* ]]; then REINICIAR_CONGO=1; fi
  done
fi

echo "3/4 Asistente..."
if [ "$REINICIAR_CONGO" = 1 ]; then
  systemctl restart sede-congo
  sleep 5
  echo "  sede-congo reiniciado"
else
  echo "  sin reiniciar (el asistente se reinicia solo cuando cambia su código; use --congo si cambió sede.env)"
fi

echo "4/4 Resumen"
journalctl -u sede-actualizar -n 4 --no-pager | sed 's/^/  /'
printf '  nginx: %s   sede-congo: %s\n' "$(systemctl is-active nginx)" "$(systemctl is-active sede-congo)"
printf '  sitio local: %s\n' "$(curl -s -o /dev/null -w '%{http_code}' http://localhost/)"
printf '  asistente: %s\n' "$(curl -s -m 5 localhost:8787/api/health || echo 'sin respuesta')"
df -h / | tail -1 | awk '{print "  disco: " $3 " usados de " $2}'
rm -rf "$RESPALDO"
