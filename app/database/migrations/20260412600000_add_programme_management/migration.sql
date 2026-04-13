-- AlterTable
ALTER TABLE "Event" ADD COLUMN "templateId" INTEGER;

-- CreateTable
CREATE TABLE "ProgrammeTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "weekDay" INTEGER,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "congregationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgrammeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeTemplatePart" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "durationMin" INTEGER,
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "templateId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeTemplatePart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeTemplateServiceRole" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "templateId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeTemplateServiceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammePartAssignment" (
    "id" SERIAL NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "eventId" INTEGER NOT NULL,
    "partId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "assistantId" INTEGER,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammePartAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeServiceRoleAssignment" (
    "id" SERIAL NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "eventId" INTEGER NOT NULL,
    "serviceRoleId" INTEGER NOT NULL,
    "assigneeId" INTEGER,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeServiceRoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgrammeTemplateResponsible" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "congregationId" INTEGER NOT NULL,

    CONSTRAINT "ProgrammeTemplateResponsible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgrammeTemplate_key_congregationId_key" ON "ProgrammeTemplate"("key", "congregationId");
CREATE UNIQUE INDEX "ProgrammeTemplate_id_congregationId_key" ON "ProgrammeTemplate"("id", "congregationId");

CREATE UNIQUE INDEX "ProgrammeTemplatePart_id_congregationId_key" ON "ProgrammeTemplatePart"("id", "congregationId");

CREATE UNIQUE INDEX "ProgrammeTemplateServiceRole_id_congregationId_key" ON "ProgrammeTemplateServiceRole"("id", "congregationId");

CREATE UNIQUE INDEX "ProgrammePartAssignment_eventId_partId_congregationId_key" ON "ProgrammePartAssignment"("eventId", "partId", "congregationId");
CREATE UNIQUE INDEX "ProgrammePartAssignment_id_congregationId_key" ON "ProgrammePartAssignment"("id", "congregationId");

CREATE UNIQUE INDEX "ProgrammeServiceRoleAssignment_eventId_serviceRoleId_congre_key" ON "ProgrammeServiceRoleAssignment"("eventId", "serviceRoleId", "congregationId");
CREATE UNIQUE INDEX "ProgrammeServiceRoleAssignment_id_congregationId_key" ON "ProgrammeServiceRoleAssignment"("id", "congregationId");

CREATE UNIQUE INDEX "ProgrammeTemplateResponsible_templateId_congregationId_key" ON "ProgrammeTemplateResponsible"("templateId", "congregationId");
CREATE UNIQUE INDEX "ProgrammeTemplateResponsible_id_congregationId_key" ON "ProgrammeTemplateResponsible"("id", "congregationId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgrammeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProgrammeTemplate" ADD CONSTRAINT "ProgrammeTemplate_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeTemplatePart" ADD CONSTRAINT "ProgrammeTemplatePart_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgrammeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplatePart" ADD CONSTRAINT "ProgrammeTemplatePart_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeTemplateServiceRole" ADD CONSTRAINT "ProgrammeTemplateServiceRole_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgrammeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplateServiceRole" ADD CONSTRAINT "ProgrammeTemplateServiceRole_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_partId_fkey" FOREIGN KEY ("partId") REFERENCES "ProgrammeTemplatePart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgrammePartAssignment" ADD CONSTRAINT "ProgrammePartAssignment_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeServiceRoleAssignment" ADD CONSTRAINT "ProgrammeServiceRoleAssignment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeServiceRoleAssignment" ADD CONSTRAINT "ProgrammeServiceRoleAssignment_serviceRoleId_fkey" FOREIGN KEY ("serviceRoleId") REFERENCES "ProgrammeTemplateServiceRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeServiceRoleAssignment" ADD CONSTRAINT "ProgrammeServiceRoleAssignment_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgrammeServiceRoleAssignment" ADD CONSTRAINT "ProgrammeServiceRoleAssignment_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProgrammeTemplateResponsible" ADD CONSTRAINT "ProgrammeTemplateResponsible_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProgrammeTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplateResponsible" ADD CONSTRAINT "ProgrammeTemplateResponsible_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgrammeTemplateResponsible" ADD CONSTRAINT "ProgrammeTemplateResponsible_congregationId_fkey" FOREIGN KEY ("congregationId") REFERENCES "Congregation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable RLS for ProgrammeTemplate
ALTER TABLE "ProgrammeTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeTemplate" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- Enable RLS for ProgrammeTemplatePart
ALTER TABLE "ProgrammeTemplatePart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeTemplatePart" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeTemplatePart" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- Enable RLS for ProgrammeTemplateServiceRole
ALTER TABLE "ProgrammeTemplateServiceRole" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeTemplateServiceRole" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeTemplateServiceRole" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- Enable RLS for ProgrammePartAssignment
ALTER TABLE "ProgrammePartAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammePartAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammePartAssignment" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- Enable RLS for ProgrammeServiceRoleAssignment
ALTER TABLE "ProgrammeServiceRoleAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeServiceRoleAssignment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeServiceRoleAssignment" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );

-- Enable RLS for ProgrammeTemplateResponsible
ALTER TABLE "ProgrammeTemplateResponsible" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgrammeTemplateResponsible" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgrammeTemplateResponsible" FOR ALL
  USING (
    current_setting('app.congregation_id', true) IS NULL
    OR current_setting('app.congregation_id', true) = ''
    OR "congregationId" = current_setting('app.congregation_id', true)::int
  );
