#!/usr/bin/env bash
# Prepara una máquina virtual Ubuntu 24.04 nueva para el sitio de la Sede del Caribe.
# Uso: sudo bash preparar-servidor.sh https://github.com/USUARIO/sede-caribe-web.git
# Después: copiar la llave de la cuenta de servicio a /etc/sede-web/cuenta-servicio.json,
# escribir el ID de la carpeta de Drive en /etc/sede-web/sede.env y pedir el certificado (paso final).
set -euo pipefail
REPO_URL=${1:?Indique la URL del repositorio en GitHub}

apt-get update
apt-get install -y nginx git rsync python3-venv ufw fail2ban unattended-upgrades certbot python3-certbot-nginx
dpkg-reconfigure -f noninteractive unattended-upgrades

id sedeweb >/dev/null 2>&1 || useradd --system --home /opt/sede-web --shell /usr/sbin/nologin sedeweb
mkdir -p /opt/sede-web /var/www/sede /etc/sede-web
chown sedeweb:sedeweb /opt/sede-web /var/www/sede
chmod 750 /etc/sede-web && chown root:sedeweb /etc/sede-web

[ -d /opt/sede-web/.git ] || sudo -u sedeweb git clone "$REPO_URL" /opt/sede-web
sudo -u sedeweb python3 -m venv /opt/sede-web/.venv
sudo -u sedeweb /opt/sede-web/.venv/bin/pip install --quiet -r /opt/sede-web/requirements.txt

[ -f /etc/sede-web/sede.env ] || cat > /etc/sede-web/sede.env <<'EOF'
# ID de la carpeta raíz del sitio en Google Drive (lo que va después de /folders/ en el enlace)
SEDE_DRIVE_CARPETA=
SEDE_CREDENCIALES=/etc/sede-web/cuenta-servicio.json
# Llave de la API de Claude para el asistente (el congo). Sin ella, el congo solo busca en el sitio.
ANTHROPIC_API_KEY=
EOF
chown root:sedeweb /etc/sede-web/sede.env && chmod 640 /etc/sede-web/sede.env

cp /opt/sede-web/servidor/sede-cabeceras.conf /etc/nginx/snippets/sede-cabeceras.conf
cp /opt/sede-web/servidor/nginx-sede.conf /etc/nginx/sites-available/sede
ln -sf /etc/nginx/sites-available/sede /etc/nginx/sites-enabled/sede
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

cp /opt/sede-web/servidor/sede-actualizar.{service,timer} /opt/sede-web/servidor/sede-asistente.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now sede-actualizar.timer sede-asistente.service

ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
systemctl enable --now fail2ban

echo
echo "Listo. Falta:"
echo "  1. Copiar la llave JSON de la cuenta de servicio a /etc/sede-web/cuenta-servicio.json (chmod 640, grupo sedeweb)"
echo "  2. Escribir SEDE_DRIVE_CARPETA en /etc/sede-web/sede.env"
echo "  3. Cuando el DNS de sedecaribe.ucr.ac.cr apunte aquí: certbot --nginx -d sedecaribe.ucr.ac.cr"
echo "  4. Probar: sudo systemctl start sede-actualizar && journalctl -u sede-actualizar -n 30 --no-pager"
echo "  5. Asistente: escribir ANTHROPIC_API_KEY en /etc/sede-web/sede.env y: sudo systemctl restart sede-asistente"
