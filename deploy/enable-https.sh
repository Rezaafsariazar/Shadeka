#!/usr/bin/env bash
# One-time HTTPS setup for ShadeKA on the Oracle server. Run ON the server:
#   cd ~/shadeka-frontend && git pull origin main-ejbmeu && bash deploy/enable-https.sh
# Safe to re-run. It does NOT modify any existing nginx config: it adds one new
# server block that only matches the HOST below, so the thesis services and the
# plain-http IP site keep working exactly as before.
set -euo pipefail

HOST="${HOST:-92-5-24-223.sslip.io}"   # sslip.io resolves this name to the IP, free, no signup
BACKEND="${BACKEND:-http://127.0.0.1:8000}"
WEBROOT="${WEBROOT:-/var/www/html}"
CONF="/etc/nginx/sites-available/shadeka-https"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"

say() { printf '\n==> %s\n' "$*"; }

say "1/6 Open port 443 in the instance firewall (Oracle images ship with iptables rules)"
if ! sudo iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
fi
sudo apt-get install -y iptables-persistent >/dev/null 2>&1 || true
sudo netfilter-persistent save >/dev/null 2>&1 || true

say "2/6 Install certbot"
sudo apt-get update -y >/dev/null
sudo apt-get install -y certbot python3-certbot-nginx

say "3/6 Add a dedicated nginx server block for $HOST"
if [ -f "$CONF" ]; then sudo cp "$CONF" "$CONF.bak.$(date +%s)"; fi
sudo tee "$CONF" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $HOST;

    root $WEBROOT;
    index index.html;

    # The backend, same-origin, so the https page never makes a mixed-content call.
    location /shadeka-api/ {
        proxy_pass $BACKEND/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
NGINX
sudo ln -sf "$CONF" /etc/nginx/sites-enabled/shadeka-https
sudo nginx -t
sudo systemctl reload nginx

say "4/6 Get the certificate (Let's Encrypt) and enable the https listener"
sudo certbot --nginx -d "$HOST" --non-interactive --agree-tos --register-unsafely-without-email --redirect

say "5/6 Build and publish the frontend"
cd "$APP_DIR"
npm install
npm run build
sudo rm -rf "${WEBROOT:?}"/*
sudo cp -r dist/* "$WEBROOT"/

say "6/6 Check"
sudo nginx -t
curl -sSI "https://$HOST/" | head -1
curl -sS -o /dev/null -w "backend via https: HTTP %{http_code}\n" "https://$HOST/shadeka-api/transit-nearby" || true

echo
echo "Done. Open: https://$HOST/"
