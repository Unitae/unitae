-- AlterTable: add timestamps to User
ALTER TABLE "User" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: add timestamps to PublisherGroup with defaults for existing rows
ALTER TABLE "PublisherGroup" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PublisherGroup" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: add timestamps to ProgrammePartAssignment
ALTER TABLE "ProgrammePartAssignment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProgrammePartAssignment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: add timestamps to ProgrammeServiceRoleAssignment
ALTER TABLE "ProgrammeServiceRoleAssignment" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ProgrammeServiceRoleAssignment" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "BoardDynamicDocumentSettings" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "dynamicType" TEXT NOT NULL,
    "dynamicRef" TEXT,
    "sectionId" INTEGER NOT NULL,
    "order" INTEGER,
    "visibleFrom" TIMESTAMP(3),
    "visibleUntil" TIMESTAMP(3),
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "showServices" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "BoardDynamicDocumentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardDynamicDocumentView" (
    "id" SERIAL NOT NULL,
    "settingsId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardDynamicDocumentView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardDynamicDocumentSettings_congregationId_dynamicType_dyn_key" ON "BoardDynamicDocumentSettings"("congregationId", "dynamicType", "dynamicRef");

-- CreateIndex
CREATE UNIQUE INDEX "BoardDynamicDocumentSettings_id_congregationId_key" ON "BoardDynamicDocumentSettings"("id", "congregationId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardDynamicDocumentView_settingsId_userId_key" ON "BoardDynamicDocumentView"("settingsId", "userId");

-- AddForeignKey
ALTER TABLE "BoardDynamicDocumentSettings" ADD CONSTRAINT "BoardDynamicDocumentSettings_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "BoardSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDynamicDocumentSettings" ADD CONSTRAINT "BoardDynamicDocumentSettings_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDynamicDocumentView" ADD CONSTRAINT "BoardDynamicDocumentView_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "BoardDynamicDocumentSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDynamicDocumentView" ADD CONSTRAINT "BoardDynamicDocumentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
