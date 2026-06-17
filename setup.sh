#!/bin/bash
set -e

echo "=== GymTrack Setup ==="

# Install PostgreSQL via Homebrew if not present
if ! command -v psql &> /dev/null; then
  echo "Instalando PostgreSQL..."
  brew install postgresql@16
  brew services start postgresql@16
  echo "Esperando que PostgreSQL arranque..."
  sleep 3
else
  echo "PostgreSQL ya está instalado."
fi

# Make sure Postgres is running
brew services start postgresql@16 2>/dev/null || true
sleep 2

# Create DB and user
echo "Creando base de datos..."
PG_BIN=$(brew --prefix postgresql@16)/bin

$PG_BIN/createuser -s gymtrack 2>/dev/null || echo "Usuario gymtrack ya existe."
$PG_BIN/psql -U $(whoami) postgres -c "ALTER USER gymtrack WITH PASSWORD 'gymtrack123';" 2>/dev/null || true
$PG_BIN/createdb -U gymtrack gymtrack 2>/dev/null || echo "Base de datos gymtrack ya existe."

echo "Base de datos lista."

# Update .env PATH for pg16 if needed
PG16_PATH="$PG_BIN"
echo "PostgreSQL en: $PG16_PATH"

# Install server deps & push schema
echo "Instalando dependencias del servidor..."
cd "$(dirname "$0")/server"
npm install

echo "Aplicando esquema a la base de datos..."
npx prisma db push

echo "Cargando datos de prueba..."
npm run db:seed

echo ""
echo "=== Setup completo ==="
echo "Credenciales: admin@gymtrack.com / admin123"
echo ""
echo "Para arrancar el sistema:"
echo "  Terminal 1: cd server && npm run dev"
echo "  Terminal 2: cd client && npm run dev"
echo "  Abrir: http://localhost:5173"
