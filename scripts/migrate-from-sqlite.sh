#!/usr/bin/env bash
#
# Migration script: SQLite (old Unitae/JWCH) → PostgreSQL (new Unitae)
#
# Usage:
#   ./scripts/migrate-from-sqlite.sh /path/to/prod.db > migration.sql
#
# Then run the output against the new database:
#   psql "$DB_URL" -f migration.sql

set -euo pipefail

SQLITE_DB="${1:?Usage: $0 /path/to/prod.db}"
CONGREGATION_ID=2
EXISTING_ADMIN_ID=1
EXISTING_ADMIN_OLD_ID=1

# Non-whitespace separator to avoid bash `read` collapsing empty fields
SEP='§'

if ! command -v sqlite3 &>/dev/null; then
  echo "ERROR: sqlite3 is required" >&2
  exit 1
fi

# Escape a value for SQL single-quoted string (double the single quotes).
# Converts {{NL}} markers back to actual newlines using PostgreSQL E-string syntax.
# Empty string → NULL.
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

# Same as sql_str but returns '' instead of NULL for empty strings (NOT NULL columns).
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

# Wrap a SQLite column expression to replace newlines with {{NL}} marker.
# Usage in SQLite queries: $(nl_safe "notes") or inline REPLACE(REPLACE(col, char(13), ''), char(10), '{{NL}}')
NL="REPLACE(REPLACE(%s, char(13), ''), char(10), '{{NL}}')"

# Convert JS epoch (ms) to PostgreSQL timestamp expression. Empty → NULL.
sql_ts() {
  if [ -z "$1" ]; then
    printf 'NULL'
  else
    printf 'to_timestamp(%s / 1000.0)' "$1"
  fi
}

# Convert SQLite boolean (0/1/"") to PostgreSQL boolean or NULL.
sql_bool() {
  if [ -z "$1" ]; then
    printf 'NULL'
  elif [ "$1" = "1" ]; then
    printf 'true'
  else
    printf 'false'
  fi
}

# Map user id: old admin → existing admin in new DB
map_uid() {
  if [ "$1" = "$EXISTING_ADMIN_OLD_ID" ]; then
    printf '%s' "$EXISTING_ADMIN_ID"
  else
    printf '%s' "$1"
  fi
}

# Run a SQLite query with § separator
sq() {
  sqlite3 -separator "$SEP" "$SQLITE_DB" "$1"
}

cat <<'HEADER'
-- =============================================================================
-- Migration: SQLite (old Unitae) → PostgreSQL (new Unitae)
-- Target congregation: id=2
-- =============================================================================

BEGIN;

-- Temporarily disable triggers if any
SET session_replication_role = 'replica';

HEADER

# ---------------------------------------------------------------------------
# 1. Users (skip old id=1 which maps to existing admin)
# ---------------------------------------------------------------------------
echo "-- ----- Users -----"
echo ""

sq "
SELECT id, firstname, lastname, email, active, isPublisher, type, isMale, phone,
       REPLACE(REPLACE(address, char(13), ''), char(10), '{{NL}}'),
       birthDate, baptismDate, isHelder, isServant, isAnointed
FROM User WHERE id != $EXISTING_ADMIN_OLD_ID ORDER BY id;
" | while IFS="$SEP" read -r id firstname lastname email active isPublisher type isMale phone address birthDate baptismDate isHelder isServant isAnointed; do
  printf 'INSERT INTO "User" (id, firstname, lastname, email, password, active, "platformAdmin", "isPublisher", type, "isMale", phone, address, "birthDate", "baptismDate", "isHelder", "isServant", "isAnointed", "publisherGroupId", "congregationId", "createdAt", "updatedAt")\n'
  printf 'VALUES (%s, %s, %s, %s, '"'"'$IMPORTED$'"'"', %s, false, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, NOW(), NOW());\n' \
    "$id" \
    "$(sql_str "$firstname")" \
    "$(sql_str "$lastname")" \
    "$(sql_str "$email")" \
    "$(sql_bool "$active")" \
    "$(sql_bool "$isPublisher")" \
    "$(sql_str "$type")" \
    "$(sql_bool "$isMale")" \
    "$(sql_str "$phone")" \
    "$(sql_str "$address")" \
    "$(sql_ts "$birthDate")" \
    "$(sql_ts "$baptismDate")" \
    "$(sql_bool "$isHelder")" \
    "$(sql_bool "$isServant")" \
    "$(sql_bool "$isAnointed")" \
    "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 2. PublisherGroups
# ---------------------------------------------------------------------------
echo "-- ----- PublisherGroups -----"
echo ""

sq "SELECT id, name, adress, responsibleId, deputyId FROM PublisherGroup ORDER BY id;" \
| while IFS="$SEP" read -r id name adress responsibleId deputyId; do
  local_responsible=$(map_uid "$responsibleId")
  if [ -z "$deputyId" ]; then
    local_deputy="NULL"
  else
    local_deputy=$(map_uid "$deputyId")
  fi

  printf 'INSERT INTO "PublisherGroup" (id, name, adress, "responsibleId", "deputyId", "congregationId", "createdAt", "updatedAt")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW());\n' \
    "$id" "$(sql_str "$name")" "$(sql_str "$adress")" "$local_responsible" "$local_deputy" "$CONGREGATION_ID"
done

echo ""

# Update Users with their publisherGroupId
echo "-- ----- Update Users with PublisherGroup -----"
echo ""

sq "SELECT id, publisherGroupId FROM User WHERE publisherGroupId IS NOT NULL ORDER BY id;" \
| while IFS="$SEP" read -r id publisherGroupId; do
  target_id=$(map_uid "$id")
  printf 'UPDATE "User" SET "publisherGroupId" = %s WHERE id = %s AND "congregationId" = %s;\n' \
    "$publisherGroupId" "$target_id" "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 3. Territories
# ---------------------------------------------------------------------------
echo "-- ----- Territories -----"
echo ""

sq "SELECT id, number, type, REPLACE(REPLACE(notes, char(13), ''), char(10), '{{NL}}'), createdAt, updatedAt FROM Territory ORDER BY id;" \
| while IFS="$SEP" read -r id number type notes createdAt updatedAt; do
  printf 'INSERT INTO "Territory" (id, number, type, notes, "createdAt", "updatedAt", "congregationId")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s, %s);\n' \
    "$id" "$(sql_str_nn "$number")" "$(sql_str_nn "$type")" "$(sql_str_nn "$notes")" \
    "$(sql_ts "$createdAt")" "$(sql_ts "$updatedAt")" "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 4. Attributions
# ---------------------------------------------------------------------------
echo "-- ----- Attributions -----"
echo ""

sq "
SELECT id, type, publisherId, territoryId, startDate, endDate, lateDate,
       REPLACE(REPLACE(notes, char(13), ''), char(10), '{{NL}}'),
       createdAt, updatedAt
FROM Attribution ORDER BY id;
" | while IFS="$SEP" read -r id type publisherId territoryId startDate endDate lateDate notes createdAt updatedAt; do
  local_publisher=$(map_uid "$publisherId")

  printf 'INSERT INTO "Attribution" (id, type, "publisherId", "territoryId", "startDate", "endDate", "lateDate", notes, "createdAt", "updatedAt", "congregationId")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);\n' \
    "$id" "$(sql_str "$type")" "$local_publisher" "$territoryId" \
    "$(sql_ts "$startDate")" "$(sql_ts "$endDate")" "$(sql_ts "$lateDate")" \
    "$(sql_str_nn "$notes")" "$(sql_ts "$createdAt")" "$(sql_ts "$updatedAt")" "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 5. PublisherActivity
# ---------------------------------------------------------------------------
echo "-- ----- PublisherActivity -----"
echo ""

sq "
SELECT id, month, year, publisherId, hours, studies, type, isPublisher,
       REPLACE(REPLACE(notes, char(13), ''), char(10), '{{NL}}')
FROM PublisherActivity ORDER BY id;
" | while IFS="$SEP" read -r id month year publisherId hours studies type isPublisher notes; do
  local_publisher=$(map_uid "$publisherId")
  hours_sql=$( [ -z "$hours" ] && printf 'NULL' || printf '%s' "$hours" )

  printf 'INSERT INTO "PublisherActivity" (id, month, year, "publisherId", hours, studies, type, "isPublisher", notes, "congregationId")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);\n' \
    "$id" "$month" "$year" "$local_publisher" "$hours_sql" "$studies" \
    "$(sql_str_nn "$type")" "$(sql_bool "$isPublisher")" "$(sql_str_nn "$notes")" "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 6. EventKinds (upsert — 'off' likely already exists)
# ---------------------------------------------------------------------------
echo "-- ----- EventKinds -----"
echo ""

sq "SELECT id, name, key, color, weekDay, createdAt, updatedAt FROM EventKind ORDER BY id;" \
| while IFS="$SEP" read -r id name key color weekDay createdAt updatedAt; do
  weekDay_sql=$( [ -z "$weekDay" ] && printf 'NULL' || printf '%s' "$weekDay" )

  printf 'INSERT INTO "EventKind" (name, key, color, "weekDay", "createdAt", "updatedAt", "congregationId")\n'
  printf 'SELECT %s, %s, %s, %s, %s, %s, %s\n' \
    "$(sql_str "$name")" "$(sql_str "$key")" "$(sql_str "$color")" "$weekDay_sql" \
    "$(sql_ts "$createdAt")" "$(sql_ts "$updatedAt")" "$CONGREGATION_ID"
  printf 'WHERE NOT EXISTS (\n'
  printf '  SELECT 1 FROM "EventKind" WHERE key = %s AND "congregationId" = %s\n' \
    "$(sql_str "$key")" "$CONGREGATION_ID"
  printf ');\n'
done

echo ""

# ---------------------------------------------------------------------------
# 7. Events (days off)
# ---------------------------------------------------------------------------
echo "-- ----- Events -----"
echo ""

sq "
SELECT id,
       REPLACE(REPLACE(name, char(13), ''), char(10), '{{NL}}'),
       REPLACE(REPLACE(description, char(13), ''), char(10), '{{NL}}'),
       kindId, startDate, endDate, createdById, createdAt, updatedAt
FROM Event ORDER BY id;
" | while IFS="$SEP" read -r id name description kindId startDate endDate createdById createdAt updatedAt; do
  local_created_by=$(map_uid "$createdById")

  if [ -z "$kindId" ]; then
    kindId_sql="NULL"
  else
    printf -v kindId_sql '(SELECT id FROM "EventKind" WHERE key = '"'"'off'"'"' AND "congregationId" = %s LIMIT 1)' "$CONGREGATION_ID"
  fi

  printf 'INSERT INTO "Event" (id, name, description, "kindId", "startDate", "endDate", "createdById", "createdAt", "updatedAt", "congregationId")\n'
  printf 'VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s);\n' \
    "$id" "$(sql_str_nn "$name")" "$(sql_str_nn "$description")" "$kindId_sql" \
    "$(sql_ts "$startDate")" "$(sql_ts "$endDate")" "$local_created_by" \
    "$(sql_ts "$createdAt")" "$(sql_ts "$updatedAt")" "$CONGREGATION_ID"
done

echo ""

# ---------------------------------------------------------------------------
# 8. CongregationUserRole (map old role IDs by key)
# ---------------------------------------------------------------------------
echo "-- ----- CongregationUserRole (from _UserToUserRole) -----"
echo ""

sq "
SELECT u.A as userId, r.key as roleKey
FROM _UserToUserRole u
JOIN UserRole r ON r.id = u.B
ORDER BY u.A, r.key;
" | while IFS="$SEP" read -r userId roleKey; do
  local_user=$(map_uid "$userId")

  printf 'INSERT INTO "CongregationUserRole" ("userId", "roleId", "congregationId")\n'
  printf 'SELECT %s, ur.id, %s\n' "$local_user" "$CONGREGATION_ID"
  printf 'FROM "UserRole" ur WHERE ur.key = %s\n' "$(sql_str "$roleKey")"
  printf 'ON CONFLICT ("userId", "roleId", "congregationId") DO NOTHING;\n'
done

echo ""

# ---------------------------------------------------------------------------
# 9. Reset sequences
# ---------------------------------------------------------------------------
cat <<'SEQRESET'
-- ----- Reset sequences to max(id) + 1 -----

SELECT setval(pg_get_serial_sequence('"User"', 'id'), COALESCE((SELECT MAX(id) FROM "User"), 1));
SELECT setval(pg_get_serial_sequence('"PublisherGroup"', 'id'), COALESCE((SELECT MAX(id) FROM "PublisherGroup"), 1));
SELECT setval(pg_get_serial_sequence('"Territory"', 'id'), COALESCE((SELECT MAX(id) FROM "Territory"), 1));
SELECT setval(pg_get_serial_sequence('"Attribution"', 'id'), COALESCE((SELECT MAX(id) FROM "Attribution"), 1));
SELECT setval(pg_get_serial_sequence('"PublisherActivity"', 'id'), COALESCE((SELECT MAX(id) FROM "PublisherActivity"), 1));
SELECT setval(pg_get_serial_sequence('"Event"', 'id'), COALESCE((SELECT MAX(id) FROM "Event"), 1));
SELECT setval(pg_get_serial_sequence('"EventKind"', 'id'), COALESCE((SELECT MAX(id) FROM "EventKind"), 1));
SELECT setval(pg_get_serial_sequence('"CongregationUserRole"', 'id'), COALESCE((SELECT MAX(id) FROM "CongregationUserRole"), 1));

-- Re-enable triggers
SET session_replication_role = 'origin';

COMMIT;

-- =============================================================================
-- Migration complete!
-- Users will need to reset their passwords via the password reset flow.
-- =============================================================================
SEQRESET
