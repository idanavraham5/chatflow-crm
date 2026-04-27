#!/bin/bash
# ── ChatFlow CRM — VPS Deployment Script ──────────────────────
# Run this on your VPS after cloning the repo
#
# Prerequisites:
#   - Ubuntu 22.04+ VPS
#   - Docker & Docker Compose installed
#   - Domain pointing to VPS IP
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh your-domain.com

set -e

DOMAIN=${1:-"chatflow.yourdomain.com"}
EMAIL="hibuk.mushlam@gmail.com"

echo "=== ChatFlow CRM Deployment ==="
echo "Domain: $DOMAIN"
echo ""

# ── 1. Install Docker if not installed ──
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. Please log out and back in, then re-run this script."
    exit 0
fi

# ── 2. Install Docker Compose if not installed ──
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
fi

# ── 3. Install Certbot for SSL ──
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    sudo apt-get update
    sudo apt-get install -y certbot
fi

# ── 4. Get SSL Certificate ──
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "Getting SSL certificate for $DOMAIN..."
    sudo certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
fi

# ── 5. Create .env file if not exists ──
if [ ! -f "./backend/.env" ]; then
    echo "Creating .env from .env.example..."
    cp ./backend/.env.example ./backend/.env
    # Generate random secret keys
    SECRET=$(openssl rand -hex 32)
    REFRESH_SECRET=$(openssl rand -hex 32)
    sed -i "s/your-secret-key-change-this-in-production/$SECRET/" ./backend/.env
    sed -i "s/your-refresh-secret-key-change-this/$REFRESH_SECRET/" ./backend/.env
    echo ""
    echo "⚠️  IMPORTANT: Edit ./backend/.env and add your WhatsApp credentials!"
    echo "   nano ./backend/.env"
    echo ""
    read -p "Press Enter after editing .env to continue..."
fi

# ── 6. Update nginx config with domain ──
sed "s/YOUR_DOMAIN/$DOMAIN/g" nginx-ssl.conf > /tmp/chatflow-nginx.conf
sudo cp /tmp/chatflow-nginx.conf /etc/nginx/sites-available/chatflow
sudo ln -sf /etc/nginx/sites-available/chatflow /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# ── 7. Build and start containers ──
echo "Building and starting containers..."
docker compose up -d --build

echo ""
echo "=== Deployment Complete! ==="
echo "ChatFlow CRM is running at: https://$DOMAIN"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f          # View logs"
echo "  docker compose restart backend  # Restart backend"
echo "  docker compose down             # Stop all"
echo "  docker compose up -d --build    # Rebuild and start"
echo ""
echo "WhatsApp Webhook URL (set in Meta):"
echo "  https://$DOMAIN/api/webhook/whatsapp"
