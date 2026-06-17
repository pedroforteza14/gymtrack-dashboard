#!/bin/bash

# ─────────────────────────────────────────
#  AdsTrack / GymTrack – Iniciador
# ─────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "╔══════════════════════════════════════╗"
echo "║    AdsTrack / GymTrack — Iniciando   ║"
echo "╚══════════════════════════════════════╝"

# 1. Instalar PM2 si no existe
if ! command -v pm2 &> /dev/null; then
  echo "▶ Instalando PM2..."
  npm install -g pm2 --silent
fi

# 2. Verificar que MySQL esté corriendo
echo "▶ Verificando MySQL..."
if ! mysqladmin ping -u root --silent 2>/dev/null; then
  echo "   MySQL no está corriendo. Iniciando..."
  brew services start mysql 2>/dev/null || brew services start mysql@8.0 2>/dev/null || true
  sleep 3
fi
echo "✓ MySQL listo"

# 3. Parar procesos anteriores
pm2 delete adstrack-api adstrack-ui 2>/dev/null || true

# 4. Arrancar con pm2 ecosystem
echo "▶ Iniciando servidores..."
pm2 start ecosystem.config.js
sleep 5

# 5. Guardar procesos PM2
pm2 save --force > /dev/null 2>&1

# 6. Abrir en el browser
echo "▶ Abriendo en el navegador..."
sleep 2
open "http://localhost:5173"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✓ Sistema corriendo                ║"
echo "║   → http://localhost:5173            ║"
echo "║                                      ║"
echo "║   Dueño:     admin@gymtrack.com      ║"
echo "║   Password:  admin123                ║"
echo "║                                      ║"
echo "║   Marketing: marketing@gymtrack.com  ║"
echo "║   Password:  marketing123            ║"
echo "║                                      ║"
echo "║   Para cerrar: ./stop.command        ║"
echo "╚══════════════════════════════════════╝"
