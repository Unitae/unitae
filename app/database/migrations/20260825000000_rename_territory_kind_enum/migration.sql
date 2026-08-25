-- Rename the TerritoryKind enum to TerritoryKindKey so the name frees up for the
-- TerritoryKind entity table. Values and their mapped strings are untouched, so
-- "Territory"."type" keeps its data — this is a type rename, not a data migration.
ALTER TYPE "TerritoryKind" RENAME TO "TerritoryKindKey";
