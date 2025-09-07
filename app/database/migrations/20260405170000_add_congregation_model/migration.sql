-- CreateTable: Congregation
CREATE TABLE "Congregation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Congregation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Congregation_slug_key" ON "Congregation"("slug");
CREATE UNIQUE INDEX "Congregation_domain_key" ON "Congregation"("domain");

-- Insert default congregation for existing data
INSERT INTO "Congregation" ("name", "slug", "domain", "updatedAt")
VALUES ('Lyon Confluence', 'lyon-confluence', 'lyonconfluence.org', CURRENT_TIMESTAMP);

-- Step 1: Add congregationId as NULLABLE to all tenant-scoped tables
ALTER TABLE "User" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "Territory" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "Building" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "BuildingEntrance" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "Attribution" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "PublisherGroup" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "PublisherActivity" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "BoardSection" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "BoardDocument" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "Event" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "EventKind" ADD COLUMN "congregationId" INTEGER;
ALTER TABLE "Setting" ADD COLUMN "congregationId" INTEGER;

-- Step 2: Assign all existing rows to the default congregation
UPDATE "User" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "Territory" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "Building" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "BuildingEntrance" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "Attribution" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "PublisherGroup" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "PublisherActivity" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "BoardSection" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "BoardDocument" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "Event" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "EventKind" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');
UPDATE "Setting" SET "congregationId" = (SELECT "id" FROM "Congregation" WHERE "slug" = 'lyon-confluence');

-- Step 3: Make congregationId NOT NULL
ALTER TABLE "User" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "Territory" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "Building" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "BuildingEntrance" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "Attribution" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "PublisherGroup" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "PublisherActivity" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "BoardSection" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "BoardDocument" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "Event" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "EventKind" ALTER COLUMN "congregationId" SET NOT NULL;
ALTER TABLE "Setting" ALTER COLUMN "congregationId" SET NOT NULL;

-- Step 4: Drop old unique constraints and create new compound ones
DROP INDEX "Building_number_street_zip_key";
DROP INDEX "EventKind_key_key";
DROP INDEX "Setting_key_key";

CREATE UNIQUE INDEX "Building_number_street_zip_congregationId_key" ON "Building"("number", "street", "zip", "congregationId");
CREATE UNIQUE INDEX "EventKind_key_congregationId_key" ON "EventKind"("key", "congregationId");
CREATE UNIQUE INDEX "Setting_key_congregationId_key" ON "Setting"("key", "congregationId");

-- Step 5: Add foreign key constraints
ALTER TABLE "User" ADD CONSTRAINT "User_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardSection" ADD CONSTRAINT "BoardSection_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BoardDocument" ADD CONSTRAINT "BoardDocument_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Territory" ADD CONSTRAINT "Territory_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BuildingEntrance" ADD CONSTRAINT "BuildingEntrance_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Building" ADD CONSTRAINT "Building_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherGroup" ADD CONSTRAINT "PublisherGroup_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublisherActivity" ADD CONSTRAINT "PublisherActivity_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Event" ADD CONSTRAINT "Event_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EventKind" ADD CONSTRAINT "EventKind_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
