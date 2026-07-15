-- The legacy Setting('territory') rows were backfilled into TerritoryPerimeter in
-- 20260503100000_add_territory_perimeter. That migration intentionally left the source rows in
-- place so we could flip the readers back if the backfill mis-parsed anything in production.
-- The perimeter model has been live since May 2026 with no rollback, so the fallback is now
-- safe to drop.
DELETE FROM "Setting" WHERE key = 'territory';
