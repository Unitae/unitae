#!/usr/bin/env bash
#
# Supplemental migration: Buildings + Entrances from SQLite → PostgreSQL
#
# Usage:
#   ./scripts/migrate-buildings-from-sqlite.sh /path/to/prod.db > migration-buildings.sql
#   psql "$DB_URL" -f migration-buildings.sql

set -euo pipefail

SQLITE_DB="${1:?Usage: $0 /path/to/prod.db}"
CONGREGATION_ID=2
SEP='§'

if ! command -v sqlite3 &>/dev/null; then
  echo "ERROR: sqlite3 is required" >&2
  exit 1
fi

sql_str() {
  local val="$1"
  if [ -z "$val" ]; then
    printf 'NULL'
  else
    local escaped
    escaped=$(printf '%s' "$val" | sed "s/'/''/g")
    if [[ "$escaped" == *'{{NL}}'* ]]; then
      escaped="${escaped//\{\{NL\}\}/\\n}"
      printf "E'%s'" "$escaped"
    else
      printf "'%s'" "$escaped"
    fi
  fi
}

sql_str_nn() {
  local val="$1"
  if [ -z "$val" ]; then
    printf "''"
  else
    local escaped
    escaped=$(printf '%s' "$val" | sed "s/'/''/g")
    if [[ "$escaped" == *'{{NL}}'* ]]; then
      escaped="${escaped//\{\{NL\}\}/\\n}"
      printf "E'%s'" "$escaped"
    else
      printf "'%s'" "$escaped"
    fi
  fi
}

sql_ts() {
  if [ -z "$1" ]; then
    printf 'NULL'
  else
    printf 'to_timestamp(%s / 1000.0)' "$1"
  fi
}

sql_bool() {
  if [ -z "$1" ]; then
    printf 'NULL'
  elif [ "$1" = "1" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

sql_int() {
  if [ -z "$1" ]; then
    printf 'NULL'
  else
    printf '%s' "$1"
  fi
}

sq() {
  sqlite3 -separator "$SEP" "$SQLITE_DB" "$1"
}

cat <<'HEADER'
-- =============================================================================
-- Supplemental migration: Buildings + Entrances
-- Target congregation: id=2
-- =============================================================================

BEGIN;

SET session_replication_role = 'replica';

HEADER

# ---------------------------------------------------------------------------
# 1. BuildingEntrances
# ---------------------------------------------------------------------------
echo "-- ----- BuildingEntrances -----"
echo ""

sq "
SELECT id, access, isMailboxOpen, isOpenEarly, isPMR, createdAt, updatedAt
FROM BuildingEntrance ORDER BY id;
" | while IFS="$SEP" read -r id access isMailboxOpen isOpenEarly isPMR createdAt updatedAt; do
  printf 'INSERT INTO "BuildingEntrance" (id, kind, "shopKind", homes, phones, liberals, access, "isPMR", "isOpenEarly", "isMailboxOpen", notes, "createdAt", "updatedAt", "congregationId")\n'
  printf 'VALUES (%s, '"'"'residential'"'"', '"'"''"'"', NULL, NULL, NULL, %s, %s, %s, %s, '"'"''"'"', %s, %s, %s);\n' \
    "$id" \
    "$(sql_int "$access")" \
    "$(sql_bool "$isPMR")" \
    "$(sql_bool "$isOpenEarly")" \
    "$(sql_bool "$isMailboxOpen")" \
    "$(sql_ts "$createdAt")" \
    "$(sql_ts "$updatedAt")" \
    "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 2. Update BuildingEntrance with aggregated homes/phones/liberals from Buildings
# ---------------------------------------------------------------------------
echo "-- ----- Aggregate residential data onto entrances -----"
echo ""

sq "
SELECT entranceId, SUM(homes), SUM(phones), SUM(liberals)
FROM Building
WHERE entranceId IS NOT NULL
GROUP BY entranceId
HAVING SUM(homes) IS NOT NULL OR SUM(phones) IS NOT NULL OR SUM(liberals) IS NOT NULL;
" | while IFS="$SEP" read -r entranceId homes phones liberals; do
  printf 'UPDATE "BuildingEntrance" SET homes = %s, phones = %s, liberals = %s WHERE id = %s AND "congregationId" = %s;\n' \
    "$(sql_int "$homes")" "$(sql_int "$phones")" "$(sql_int "$liberals")" \
    "$entranceId" "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 3. Buildings
# ---------------------------------------------------------------------------
echo "-- ----- Buildings -----"
echo ""

sq "
SELECT id, number, street, zip, latitude, longitude, active, inTerritory, inOpenData,
       createdAt, updatedAt, prospectionDate,
       REPLACE(REPLACE(notes, char(13), ''), char(10), '{{NL}}'),
       REPLACE(REPLACE(importantNotes, char(13), ''), char(10), '{{NL}}'),
       entranceId
FROM Building ORDER BY id;
" | while IFS="$SEP" read -r id number street zip latitude longitude active inTerritory inOpenData createdAt updatedAt prospectionDate notes importantNotes entranceId; do
  printf 'INSERT INTO "Building" (id, number, street, zip, latitude, longitude, active, "inTerritory", "inOpenData", "createdAt", "updatedAt", "prospectionDate", notes, "importantNotes", "congregationId")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);\n' \
    "$id" \
    "$(sql_str_nn "$number")" \
    "$(sql_str_nn "$street")" \
    "$(sql_str_nn "$zip")" \
    "$(sql_int "$latitude")" \
    "$(sql_int "$longitude")" \
    "$(sql_bool "$active")" \
    "$(sql_bool "$inTerritory")" \
    "$(sql_bool "$inOpenData")" \
    "$(sql_ts "$createdAt")" \
    "$(sql_ts "$updatedAt")" \
    "$(sql_ts "$prospectionDate")" \
    "$(sql_str_nn "$notes")" \
    "$(sql_str_nn "$importantNotes")" \
    "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 4. _BuildingToBuildingEntrance junction (from old Building.entranceId)
# ---------------------------------------------------------------------------
echo "-- ----- _BuildingToBuildingEntrance -----"
echo ""

sq "
SELECT DISTINCT id, entranceId
FROM Building
WHERE entranceId IS NOT NULL
ORDER BY id;
" | while IFS="$SEP" read -r buildingId entranceId; do
  # Prisma implicit m2m: A = Building (first alphabetically), B = BuildingEntrance
  printf 'INSERT INTO "_BuildingToBuildingEntrance" ("A", "B") VALUES (%s, %s);\n' \
    "$buildingId" "$entranceId"
done

echo ""

# ---------------------------------------------------------------------------
# 5. _BuildingEntranceToTerritory junction (copy as-is)
# ---------------------------------------------------------------------------
echo "-- ----- _BuildingEntranceToTerritory -----"
echo ""

sq "
SELECT A, B FROM _BuildingEntranceToTerritory ORDER BY A, B;
" | while IFS="$SEP" read -r entranceId territoryId; do
  printf 'INSERT INTO "_BuildingEntranceToTerritory" ("A", "B") VALUES (%s, %s);\n' \
    "$entranceId" "$territoryId"
done

echo ""

# ---------------------------------------------------------------------------
# 6. BuildingResidentialData (one per building that has residential data)
# ---------------------------------------------------------------------------
echo "-- ----- BuildingResidentialData -----"
echo ""

sq "
SELECT id, entranceId, homes, phones, liberals
FROM Building
WHERE entranceId IS NOT NULL AND (homes IS NOT NULL OR phones IS NOT NULL OR liberals IS NOT NULL)
ORDER BY id;
" | while IFS="$SEP" read -r buildingId entranceId homes phones liberals; do
  printf 'INSERT INTO "BuildingResidentialData" ("buildingId", "entranceId", homes, phones, liberals, "congregationId")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s);\n' \
    "$buildingId" "$entranceId" \
    "$(sql_int "$homes")" "$(sql_int "$phones")" "$(sql_int "$liberals")" \
    "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 7. Reset sequences
# ---------------------------------------------------------------------------
cat <<'SEQRESET'
-- ----- Reset sequences -----

SELECT setval(pg_get_serial_sequence('"BuildingEntrance"', 'id'), COALESCE((SELECT MAX(id) FROM "BuildingEntrance"), 1));
SELECT setval(pg_get_serial_sequence('"Building"', 'id'), COALESCE((SELECT MAX(id) FROM "Building"), 1));
SELECT setval(pg_get_serial_sequence('"BuildingResidentialData"', 'id'), COALESCE((SELECT MAX(id) FROM "BuildingResidentialData"), 1));

SET session_replication_role = 'origin';

COMMIT;

-- =============================================================================
-- Buildings migration complete!
-- =============================================================================
SEQRESET
