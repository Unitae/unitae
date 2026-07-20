-- AlterTable: add the scope discriminator. Existing rows default to 'full',
-- preserving today's whole-event responsible behaviour.
ALTER TABLE "TemplateResponsible" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'full';

-- Swap per-template uniqueness to per-(template, scope) so a template can
-- carry one 'full' responsible AND one 'service' responsible at once.
DROP INDEX "TemplateResponsible_templateId_congregationId_key";
CREATE UNIQUE INDEX "TemplateResponsible_templateId_scope_congregationId_key" ON "TemplateResponsible"("templateId", "scope", "congregationId");
