#!/usr/bin/env bash
#
# Create typed entrances (commerce, hotel, campus, laundromat)
# from old building flags.
#
# Usage:
#   ./scripts/migrate-commerce-entrances.sh /path/to/prod.db > migration-commerce.sql
#   psql "$DB_URL" -f migration-commerce.sql

set -euo pipefail

SQLITE_DB="${1:?Usage: $0 /path/to/prod.db}"
CONGREGATION_ID=2
SEP='§'

sql_str_nn() {
  local val="$1"
  if [ -z "$val" ]; then
    printf "''"
  else
    local escaped
    escaped=$(printf '%s' "$val" | sed "s/'/''/g")
    printf "'%s'" "$escaped"
  fi
}

cat <<'HEADER'
BEGIN;

-- Create typed entrances from old building flags
-- For each flagged building, create a new BuildingEntrance of the matching kind
-- and link it to the building via the junction table.

HEADER

# Commerce entrances (hasShops = 1)
echo "-- ----- Commerce entrances -----"
sqlite3 -separator "$SEP" "$SQLITE_DB" "
SELECT id, shopKind FROM Building WHERE hasShops = 1 ORDER BY id;
" | while IFS="$SEP" read -r buildingId shopKind; do
  cat <<EOF
DO \$\$
DECLARE new_id INTEGER;
BEGIN
  INSERT INTO "BuildingEntrance" (kind, "shopKind", "congregationId", "createdAt", "updatedAt")
  VALUES ('commerce', $(sql_str_nn "$shopKind"), $CONGREGATION_ID, NOW(), NOW())
  RETURNING id INTO new_id;
  INSERT INTO "_BuildingToBuildingEntrance" ("A", "B") VALUES ($buildingId, new_id) ON CONFLICT DO NOTHING;
END \$\$;
EOF
done

echo ""

# Hotel entrances (hasHotel = 1)
echo "-- ----- Hotel entrances -----"
sqlite3 -separator "$SEP" "$SQLITE_DB" "
SELECT id FROM Building WHERE hasHotel = 1 ORDER BY id;
" | while IFS="$SEP" read -r buildingId; do
  cat <<EOF
DO \$\$
DECLARE new_id INTEGER;
BEGIN
  INSERT INTO "BuildingEntrance" (kind, "shopKind", "congregationId", "createdAt", "updatedAt")
  VALUES ('hotel', '', $CONGREGATION_ID, NOW(), NOW())
  RETURNING id INTO new_id;
  INSERT INTO "_BuildingToBuildingEntrance" ("A", "B") VALUES ($buildingId, new_id) ON CONFLICT DO NOTHING;
END \$\$;
EOF
done

echo ""

# Campus entrances (hasCampus = 1)
echo "-- ----- Campus entrances -----"
sqlite3 -separator "$SEP" "$SQLITE_DB" "
SELECT id FROM Building WHERE hasCampus = 1 ORDER BY id;
" | while IFS="$SEP" read -r buildingId; do
  cat <<EOF
DO \$\$
DECLARE new_id INTEGER;
BEGIN
  INSERT INTO "BuildingEntrance" (kind, "shopKind", "congregationId", "createdAt", "updatedAt")
  VALUES ('campus', '', $CONGREGATION_ID, NOW(), NOW())
  RETURNING id INTO new_id;
  INSERT INTO "_BuildingToBuildingEntrance" ("A", "B") VALUES ($buildingId, new_id) ON CONFLICT DO NOTHING;
END \$\$;
EOF
done

echo ""

# Laundromat entrances (hasLandromat = 1)
echo "-- ----- Laundromat entrances -----"
sqlite3 -separator "$SEP" "$SQLITE_DB" "
SELECT id FROM Building WHERE hasLandromat = 1 ORDER BY id;
" | while IFS="$SEP" read -r buildingId; do
  cat <<EOF
DO \$\$
DECLARE new_id INTEGER;
BEGIN
  INSERT INTO "BuildingEntrance" (kind, "shopKind", "congregationId", "createdAt", "updatedAt")
  VALUES ('laundromat', '', $CONGREGATION_ID, NOW(), NOW())
  RETURNING id INTO new_id;
  INSERT INTO "_BuildingToBuildingEntrance" ("A", "B") VALUES ($buildingId, new_id) ON CONFLICT DO NOTHING;
END \$\$;
EOF
done

echo ""
echo "COMMIT;"
