#!/usr/bin/env bash
# Build ShadeKA and publish it to Cloudflare Pages (free), from your own computer.
#   bash deploy/deploy-pages.sh
# First run opens a browser once to log in to Cloudflare. After that it's one command.
# Needs Node 20+. The site appears at https://<PROJECT>.pages.dev
set -euo pipefail

PROJECT="${PROJECT:-shadeka}"
# Where the browser reaches the backend (the server's https proxy; see enable-https.sh).
API="${API:-https://92-5-24-223.sslip.io/shadeka-api}"
cd "$(dirname "$0")/.."

echo "==> Logging in to Cloudflare (skipped if already logged in)"
npx --yes wrangler whoami >/dev/null 2>&1 || npx --yes wrangler login

echo "==> Creating the Pages project '$PROJECT' (skipped if it exists)"
npx --yes wrangler pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true

echo "==> Building"
npm install
VITE_API_URL_HTTPS="$API" npm run build

echo "==> Publishing"
npx --yes wrangler pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true

echo
echo "Done. Open: https://$PROJECT.pages.dev/"
