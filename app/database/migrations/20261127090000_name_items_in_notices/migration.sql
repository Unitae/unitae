-- Pending assignment notices name their item (plan T12): from this release the app writes and cancels notices about
-- `Item` rows, keyed `Item:<id>:<recipient>`. A notice still waiting was written about the old row, so it moves to the
-- item that mirrors that row: type, id and debounce key, the recipient part of the key kept. A notice already sent or
-- cancelled keeps its name; so does one whose item is gone, which nothing can cancel or send any differently.
-- Idempotent: a second run finds no pending notice naming an old row with an item.

-- 1. Notices about a part.
UPDATE "NotificationEvent" AS n
SET "entityType" = 'Item',
    "entityId" = i."id",
    "debounceKey" = 'Item:' || i."id" || substring(n."debounceKey" FROM length('EventPart:' || n."entityId") + 1)
FROM "Item" AS i
WHERE n."status" = 'pending'
  AND n."entityType" = 'EventPart'
  AND i."legacyPartId" = n."entityId"
  AND i."congregationId" = n."congregationId";

-- 2. Notices about a duty.
UPDATE "NotificationEvent" AS n
SET "entityType" = 'Item',
    "entityId" = i."id",
    "debounceKey" = 'Item:' || i."id" || substring(n."debounceKey" FROM length('EventServicePart:' || n."entityId") + 1)
FROM "Item" AS i
WHERE n."status" = 'pending'
  AND n."entityType" = 'EventServicePart'
  AND i."legacyServiceId" = n."entityId"
  AND i."congregationId" = n."congregationId";
