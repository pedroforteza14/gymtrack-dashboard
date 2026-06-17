#!/bin/bash

# ─────────────────────────────────────────
#  AdsTrack / GymTrack – Apagado
# ─────────────────────────────────────────

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "╔══════════════════════════════════════╗"
echo "║    AdsTrack / GymTrack — Apagando    ║"
echo "╚══════════════════════════════════════╝"

echo "▶ Deteniendo servidor y frontend..."
pm2 delete adstrack-api adstrack-ui gymtrack-api gymtrack-ui 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✓ Sistema apagado                  ║"
echo "║   MySQL sigue corriendo en segundo   ║"
echo "║   plano (normal en Mac).             ║"
echo "╚══════════════════════════════════════╝"
