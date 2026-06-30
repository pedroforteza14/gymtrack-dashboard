#!/bin/bash
# ================================================
# Setup GitHub para Pedro Forteza
# Corre este script en tu terminal: bash setup-github.sh
# ================================================

set -e

echo ""
echo "======================================"
echo "  GitHub Setup - Pedro Forteza"
echo "======================================"
echo ""
echo "Necesitás un GitHub Personal Access Token con permisos 'repo' y 'delete_repo'."
echo "Crealo en: https://github.com/settings/tokens/new"
echo ""
read -p "Pegá tu token acá: " TOKEN
echo ""

HEADERS=(-H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json")

# ── 1. Crear repo kyma-ecommerce ──────────────────────────────
echo "📦 Creando repo kyma-ecommerce en GitHub..."
CREATE_RESULT=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${HEADERS[@]}" \
  https://api.github.com/user/repos \
  -d '{"name":"kyma-ecommerce","description":"E-commerce fullstack — Next.js, Supabase, MercadoPago","private":false}')

if [ "$CREATE_RESULT" = "201" ]; then
  echo "✅ Repo creado exitosamente."
elif [ "$CREATE_RESULT" = "422" ]; then
  echo "ℹ️  El repo ya existe, continuando..."
else
  echo "❌ Error creando repo (HTTP $CREATE_RESULT). Verificá tu token."
  exit 1
fi

# ── 2. Agregar remote y pushear kyma-ecommerce ────────────────
KYMA_PATH="$HOME/kyma-ecommerce"
if [ -d "$KYMA_PATH/.git" ]; then
  echo ""
  echo "🚀 Subiendo kyma-ecommerce a GitHub..."
  cd "$KYMA_PATH"
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://pedroforteza14:$TOKEN@github.com/pedroforteza14/kyma-ecommerce.git"
  git push -u origin main
  echo "✅ kyma-ecommerce subido."
else
  echo "⚠️  No encontré kyma-ecommerce en $KYMA_PATH. Ajustá la ruta en el script si está en otro lado."
fi

# ── 3. Listar repos y borrar los de práctica ─────────────────
echo ""
echo "🗑️  Borrando repos de práctica..."

REPOS_TO_DELETE=(
  "pruebaGit"
  "Mi-Pagina"
  "MiPagina"
  "proyecto"
  "BCO-Forteza"
  "HomeBanking-Forteza"
)

for REPO in "${REPOS_TO_DELETE[@]}"; do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "${HEADERS[@]}" \
    "https://api.github.com/repos/pedroforteza14/$REPO")
  if [ "$HTTP" = "204" ]; then
    echo "   ✅ Borrado: $REPO"
  elif [ "$HTTP" = "404" ]; then
    echo "   ⚠️  No existe (ya borrado?): $REPO"
  else
    echo "   ❌ Error borrando $REPO (HTTP $HTTP)"
  fi
done

echo ""
echo "======================================"
echo "  ¡Listo! Todo actualizado."
echo "  Tu GitHub: https://github.com/pedroforteza14"
echo "======================================"
echo ""
