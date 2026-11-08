-- BoardDocumentView: when each person last opened a board PDF. The implicit
-- `_viewedBy` join it replaces kept no date, so a replaced file could never be
-- shown as unread again to someone who had read the previous one.
--
-- Contract: everyone who had read a document still has. Those reads carry no
-- date (NULL), since none was ever recorded; the application counts them as
-- having read the current file, which is what it assumed until now.
--
-- `_viewedBy` stays, untouched: the application code still deployed reads and
-- writes it until it is replaced. A later migration copies the reads it records
-- meanwhile into this table, then drops it.

-- 1. The table
CREATE TABLE "BoardDocumentView" (
    "id" SERIAL NOT NULL,
    "documentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "congregationId" INTEGER NOT NULL,
    CONSTRAINT "BoardDocumentView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BoardDocumentView_userId_idx" ON "BoardDocumentView"("userId");
CREATE INDEX "BoardDocumentView_congregationId_idx" ON "BoardDocumentView"("congregationId");
CREATE UNIQUE INDEX "BoardDocumentView_documentId_userId_key" ON "BoardDocumentView"("documentId", "userId");

-- Compound FK so a read can never point at another congregation's document.
ALTER TABLE "BoardDocumentView" ADD CONSTRAINT "BoardDocumentView_documentId_congregationId_fkey" FOREIGN KEY ("documentId", "congregationId") REFERENCES "BoardDocument"("id", "congregationId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardDocumentView" ADD CONSTRAINT "BoardDocumentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BoardDocumentView" ADD CONSTRAINT "BoardDocumentView_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Row-Level Security
-- CASE/WHEN rather than OR: the planner may reorder OR branches and leak rows.
-- See docs/development/row-level-security.md.
ALTER TABLE "BoardDocumentView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoardDocumentView" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoardDocumentView" FOR ALL
  USING (
    CASE
      WHEN NULLIF(current_setting('app.congregation_id', true), '') IS NULL THEN true
      ELSE "congregationId" = current_setting('app.congregation_id', true)::int
    END
  );

-- 3. Every existing read, undated. A = BoardDocument, B = UserAccount (Prisma
-- names implicit join columns alphabetically by model). The congregation is the
-- document's; a read already recorded here keeps its date.
INSERT INTO "BoardDocumentView" ("documentId", "userId", "viewedAt", "congregationId")
SELECT v."A", v."B", NULL, d."congregationId"
FROM "_viewedBy" v
JOIN "BoardDocument" d ON d."id" = v."A"
ON CONFLICT ("documentId", "userId") DO NOTHING;
