#!/bin/bash
set -euo pipefail

echo "=== Arila Deploy Script ==="

# Build client
echo "Building client..."
cd client
npm ci
npm run build
cd ..

# Build server
echo "Building server..."
cd server
npm ci
npm run build
cd ..

# Copy client build to serving directory
echo "Deploying client..."
sudo mkdir -p /var/www/arila/client
sudo cp -r client/dist /var/www/arila/client/

# Restart server
echo "Restarting server..."
pm2 restart ecosystem.config.cjs || pm2 start ecosystem.config.cjs

# Reload Caddy
echo "Reloading Caddy..."
sudo caddy reload --config /etc/caddy/Caddyfile

echo "=== Deploy complete ==="
