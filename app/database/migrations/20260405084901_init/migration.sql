-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "firstname" TEXT,
    "lastname" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isPublisher" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'normal',
    "isMale" BOOLEAN,
    "phone" TEXT,
    "address" TEXT,
    "birthDate" TIMESTAMP(3),
    "baptismDate" TIMESTAMP(3),
    "isHelder" BOOLEAN NOT NULL DEFAULT false,
    "isServant" BOOLEAN NOT NULL DEFAULT false,
    "isAnointed" BOOLEAN NOT NULL DEFAULT false,
    "publisherGroupId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardSection" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER,

    CONSTRAINT "BoardSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardDocument" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "sectionId" INTEGER NOT NULL,
    "order" INTEGER,
    "type" TEXT,
    "visibleFrom" TIMESTAMP(3),
    "visibleUntil" TIMESTAMP(3),
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Territory" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'doors-to-doors',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attribution" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'default',
    "publisherId" INTEGER NOT NULL,
    "territoryId" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "lateDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildingEntrance" (
    "id" SERIAL NOT NULL,
    "access" INTEGER,
    "isPMR" BOOLEAN,
    "isOpenEarly" BOOLEAN,
    "isMailboxOpen" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingEntrance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" SERIAL NOT NULL,
    "number" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "inTerritory" BOOLEAN NOT NULL DEFAULT true,
    "inOpenData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "homes" INTEGER,
    "phones" INTEGER,
    "liberals" INTEGER,
    "hasShops" BOOLEAN,
    "shopKind" TEXT NOT NULL DEFAULT '',
    "hasCampus" BOOLEAN,
    "hasHotel" BOOLEAN,
    "hasLandromat" BOOLEAN,
    "prospectionDate" TIMESTAMP(3),
    "entranceId" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "importantNotes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "adress" TEXT NOT NULL,
    "responsibleId" INTEGER NOT NULL,
    "deputyId" INTEGER NOT NULL,

    CONSTRAINT "PublisherGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublisherActivity" (
    "id" SERIAL NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "publisherId" INTEGER NOT NULL,
    "hours" INTEGER,
    "studies" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'normal',
    "isPublisher" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PublisherActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kindId" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventKind" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "weekDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_UserToUserRole" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_UserToUserRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_viewedBy" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_viewedBy_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_BuildingEntranceToTerritory" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_BuildingEntranceToTerritory_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_key_key" ON "UserRole"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Building_number_street_zip_key" ON "Building"("number", "street", "zip");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_key_key" ON "Setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherGroup_responsibleId_key" ON "PublisherGroup"("responsibleId");

-- CreateIndex
CREATE UNIQUE INDEX "PublisherGroup_deputyId_key" ON "PublisherGroup"("deputyId");

-- CreateIndex
CREATE INDEX "activityId" ON "PublisherActivity"("publisherId", "month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "EventKind_key_key" ON "EventKind"("key");

-- CreateIndex
CREATE INDEX "_UserToUserRole_B_index" ON "_UserToUserRole"("B");

-- CreateIndex
CREATE INDEX "_viewedBy_B_index" ON "_viewedBy"("B");

-- CreateIndex
CREATE INDEX "_BuildingEntranceToTerritory_B_index" ON "_BuildingEntranceToTerritory"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_publisherGroupId_fkey" FOREIGN KEY ("publisherGroupId") REFERENCES "PublisherGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDocument" ADD CONSTRAINT "BoardDocument_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BoardSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attribution" ADD CONSTRAINT "Attribution_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_entranceId_fkey" FOREIGN KEY ("entranceId") REFERENCES "BuildingEntrance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherGroup" ADD CONSTRAINT "PublisherGroup_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherGroup" ADD CONSTRAINT "PublisherGroup_deputyId_fkey" FOREIGN KEY ("deputyId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublisherActivity" ADD CONSTRAINT "PublisherActivity_publisherId_fkey" FOREIGN KEY ("publisherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "EventKind"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToUserRole" ADD CONSTRAINT "_UserToUserRole_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserToUserRole" ADD CONSTRAINT "_UserToUserRole_B_fkey" FOREIGN KEY ("B") REFERENCES "UserRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_viewedBy" ADD CONSTRAINT "_viewedBy_A_fkey" FOREIGN KEY ("A") REFERENCES "BoardDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_viewedBy" ADD CONSTRAINT "_viewedBy_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingEntranceToTerritory" ADD CONSTRAINT "_BuildingEntranceToTerritory_A_fkey" FOREIGN KEY ("A") REFERENCES "BuildingEntrance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BuildingEntranceToTerritory" ADD CONSTRAINT "_BuildingEntranceToTerritory_B_fkey" FOREIGN KEY ("B") REFERENCES "Territory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
