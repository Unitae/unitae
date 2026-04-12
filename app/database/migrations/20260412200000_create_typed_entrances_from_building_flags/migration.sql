-- Data migration: Create typed entrances from building boolean flags
-- For each building with hasShops/hasHotel/hasCampus/hasLandromat = true,
-- create a BuildingEntrance of the matching kind and link via join table.

-- Commerce entrances from buildings with hasShops = true
DO $$
DECLARE
    r RECORD;
    new_entrance_id INTEGER;
BEGIN
    FOR r IN
        SELECT b."id" AS building_id, b."shopKind", b."congregationId"
        FROM "Building" b
        WHERE b."hasShops" = true
    LOOP
        INSERT INTO "BuildingEntrance" ("kind", "shopKind", "congregationId", "createdAt", "updatedAt")
        VALUES ('commerce', COALESCE(r."shopKind", ''), r."congregationId", NOW(), NOW())
        RETURNING "id" INTO new_entrance_id;

        INSERT INTO "_BuildingToBuildingEntrance" ("A", "B")
        VALUES (r.building_id, new_entrance_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- Hotel entrances from buildings with hasHotel = true
DO $$
DECLARE
    r RECORD;
    new_entrance_id INTEGER;
BEGIN
    FOR r IN
        SELECT b."id" AS building_id, b."congregationId"
        FROM "Building" b
        WHERE b."hasHotel" = true
    LOOP
        INSERT INTO "BuildingEntrance" ("kind", "congregationId", "createdAt", "updatedAt")
        VALUES ('hotel', r."congregationId", NOW(), NOW())
        RETURNING "id" INTO new_entrance_id;

        INSERT INTO "_BuildingToBuildingEntrance" ("A", "B")
        VALUES (r.building_id, new_entrance_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- Campus entrances from buildings with hasCampus = true
DO $$
DECLARE
    r RECORD;
    new_entrance_id INTEGER;
BEGIN
    FOR r IN
        SELECT b."id" AS building_id, b."congregationId"
        FROM "Building" b
        WHERE b."hasCampus" = true
    LOOP
        INSERT INTO "BuildingEntrance" ("kind", "congregationId", "createdAt", "updatedAt")
        VALUES ('campus', r."congregationId", NOW(), NOW())
        RETURNING "id" INTO new_entrance_id;

        INSERT INTO "_BuildingToBuildingEntrance" ("A", "B")
        VALUES (r.building_id, new_entrance_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;

-- Laundromat entrances from buildings with hasLandromat = true
DO $$
DECLARE
    r RECORD;
    new_entrance_id INTEGER;
BEGIN
    FOR r IN
        SELECT b."id" AS building_id, b."congregationId"
        FROM "Building" b
        WHERE b."hasLandromat" = true
    LOOP
        INSERT INTO "BuildingEntrance" ("kind", "congregationId", "createdAt", "updatedAt")
        VALUES ('laundromat', r."congregationId", NOW(), NOW())
        RETURNING "id" INTO new_entrance_id;

        INSERT INTO "_BuildingToBuildingEntrance" ("A", "B")
        VALUES (r.building_id, new_entrance_id)
        ON CONFLICT DO NOTHING;
    END LOOP;
END $$;
