-- CreateTable
CREATE TABLE "BoardDocumentVersion" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "uri" TEXT NOT NULL,
    "thumbnailUri" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "BoardDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardDocumentVersion_id_congregationId_key" ON "BoardDocumentVersion"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "BoardDocumentVersion" ADD CONSTRAINT "BoardDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BoardDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDocumentVersion" ADD CONSTRAINT "BoardDocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardDocumentVersion" ADD CONSTRAINT "BoardDocumentVersion_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
