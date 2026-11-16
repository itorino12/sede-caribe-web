#!/usr/bin/env bash
# Prepara una máquina virtual Ubuntu 24.04 nueva para el sitio de la Sede del Caribe.
# Uso: sudo bash preparar-servidor.sh https://github.com/USUARIO/sede-caribe-web.git
# Después: copiar la llave de la cuenta de servicio a /etc/sede-web/cuenta-servicio.json,
# escribir el ID de la carpeta de Drive en /etc/sede-web/sede.env y pedir el certificado (paso final).
set -euo pipefail
REPO_URL=${1:?Indique la URL del repositorio en GitHub}

export DEBIAN_FRONTEND=noninteractive

# --- Sistema base (todo se puede repetir sin daño) ---
# Red persistente: sin esto, cloud-init reescribe la red al reiniciar y la VM puede quedar sin IP.
if [ -d /etc/cloud/cloud.cfg.d ]; then
  echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg
fi

apt-get update
apt-get -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold full-upgrade
apt-get install -y nginx git rsync python3-venv ufw fail2ban unattended-upgrades certbot python3-certbot-nginx cloud-guest-utils lvm2
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF2'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF2

# Apache pelearía con nginx por el puerto 80
if systemctl is-active --quiet apache2 2>/dev/null; then
  systemctl disable --now apache2
fi

# Usar todo el disco: el instalador de Ubuntu suele dejar la raíz en ~23 GB (LVM) aunque el disco sea mayor.
RAIZ=$(findmnt -no SOURCE /)
if lvs "$RAIZ" >/dev/null 2>&1; then
  PV=$(pvs --noheadings -o pv_name -S "vg_name=$(lvs --noheadings -o vg_name "$RAIZ" | xargs)" | head -1 | xargs)
  DISCO="/dev/$(lsblk -dno pkname "$PV")"
  PART=$(cat "/sys/class/block/$(basename "$PV")/partition")
  growpart "$DISCO" "$PART" || echo "growpart: sin cambios (¿la partición ya ocupa todo el disco?)"
  pvresize "$PV"
  lvextend -r -l +100%FREE "$RAIZ" || true
fi

id sedeweb >/dev/null 2>&1 || useradd --system --home /opt/sede-web --shell /usr/sbin/nologin sedeweb
mkdir -p /opt/sede-web /var/www/sede /var/www/sede-legado/images /etc/sede-web
chown sedeweb:sedeweb /opt/sede-web /var/www/sede
chmod 750 /etc/sede-web && chown root:sedeweb /etc/sede-web

[ -d /opt/sede-web/.git ] || sudo -u sedeweb git clone "$REPO_URL" /opt/sede-web
sudo -u sedeweb python3 -m venv /opt/sede-web/.venv
sudo -u sedeweb /opt/sede-web/.venv/bin/pip install --quiet -r /opt/sede-web/requirements.txt
# CONGO 2.0 (asistente) en su propio entorno
sudo -u sedeweb python3 -m venv /opt/sede-web/servidor/congo/.venv
sudo -u sedeweb /opt/sede-web/servidor/congo/.venv/bin/pip install --quiet -r /opt/sede-web/servidor/congo/requirements.txt

[ -f /etc/sede-web/sede.env ] || cat > /etc/sede-web/sede.env <<'EOF'
# ID de la carpeta raíz del sitio en Google Drive (lo que va después de /folders/ en el enlace)
SEDE_DRIVE_CARPETA=
SEDE_CREDENCIALES=/etc/sede-web/cuenta-servicio.json
# Asistente CONGO 2.0 (el congo). Sin llave, el congo solo busca en el sitio.
CONGO_PROVEEDOR=gemini
GEMINI_API_KEY=
# Clave para administrar documentos (cabecera X-Congo-Clave). Generar con: openssl rand -hex 24
CONGO_CLAVE_ADMIN=
# ID de la carpeta «Documentos del congo» en Drive (compartida como Lector con la cuenta de servicio)
CONGO_DRIVE_CARPETA=
EOF
chown root:sedeweb /etc/sede-web/sede.env && chmod 640 /etc/sede-web/sede.env

cp /opt/sede-web/servidor/sede-cabeceras.conf /etc/nginx/snippets/sede-cabeceras.conf
cp /opt/sede-web/servidor/nginx-sede.conf /etc/nginx/sites-available/sede
ln -sf /etc/nginx/sites-available/sede /etc/nginx/sites-enabled/sede
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

cp /opt/sede-web/servidor/sede-actualizar.{service,timer} /opt/sede-web/servidor/sede-congo.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sede-actualizar.timer sede-congo.service

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable

cat > /etc/fail2ban/jail.d/sede.local <<'EOF2'
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
EOF2
systemctl enable fail2ban && systemctl restart fail2ban

# SSH: sin ingreso directo de root. (Quitar contraseñas se hace aparte, cuando la llave ya esté probada.)
mkdir -p /etc/ssh/sshd_config.d
echo "PermitRootLogin no" > /etc/ssh/sshd_config.d/10-sede.conf
sshd -t && systemctl reload ssh

echo
echo "=== Resumen ==="
df -h / | tail -1
ufw status | head -8
hostname -I
for u in nginx sede-congo fail2ban; do printf '%-14s %s\n' "$u" "$(systemctl is-active $u)"; done
systemctl list-timers sede-actualizar.timer --no-pager | head -3

echo
echo "Listo. Falta:"
echo "  1. Copiar la llave JSON de la cuenta de servicio a /etc/sede-web/cuenta-servicio.json (chmod 640, grupo sedeweb)"
echo "  2. Escribir SEDE_DRIVE_CARPETA en /etc/sede-web/sede.env"
echo "  3. Cuando el DNS de sedecaribe.ucr.ac.cr apunte aquí: certbot --nginx -d sedecaribe.ucr.ac.cr"
echo "  4. Probar: sudo systemctl start sede-actualizar && journalctl -u sede-actualizar -n 30 --no-pager"
echo "  5. Asistente: escribir GEMINI_API_KEY y CONGO_CLAVE_ADMIN en /etc/sede-web/sede.env y: sudo systemctl restart sede-congo"
echo "     La primera vez baja el modelo de búsqueda (~220 MB, requiere salida a huggingface.co)."
echo "     Probar: curl -s localhost:8787/api/health  y  sudo -u sedeweb bash /opt/sede-web/herramientas/probar_congo.sh --en-vivo"
