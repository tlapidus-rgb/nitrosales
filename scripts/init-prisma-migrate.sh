#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# NitroSales - Initialize Prisma Migrate (Baseline)
# ═══════════════════════════════════════════════════════════════
# Run this ONCE from your Mac in the nitrosales project root.
# It creates the initial migration representing the current DB
# and marks it as already applied (since the DB already has the tables).
#
# Prerequisites: DATABASE_URL must be set (e.g., via .env)
# Usage: bash scripts/init-prisma-migrate.sh
# ═══════════════════════════════════════════════════════════════

set -e

echo "=== NitroSales: Prisma Migrate Baseline ==="
echo ""

# Step 1: Create the baseline migration directory
MIGRATION_DIR="prisma/migrations/0_init"
mkdir -p "$MIGRATION_DIR"

echo "[1/3] Generating SQL from current schema..."
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script \
  > "$MIGRATION_DIR/migration.sql"

echo "[2/3] Marking migration as already applied (baseline)..."
npx prisma migrate resolve --applied 0_init

echo "[3/3] Verifying migration status..."
npx prisma migrate status

echo ""
echo "=== Done! ==="
echo "From now on, use 'npx prisma migrate dev' for local changes"
echo "and 'npx prisma migrate deploy' for production deployments."
echo ""
echo "IMPORTANT: Update your Vercel build command to:"
echo '  prisma generate && prisma migrate deploy && next build'
echo "(instead of: prisma generate && prisma db push && next build)"
