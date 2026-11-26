-- A schedule template's parts and services may belong to no kind (6a-1c-2): « Modèles de planning » creates templates
-- no kind uses yet, whose items are their own. No change for any row that exists: every one keeps its kind.

-- 1. The kind becomes optional.
ALTER TABLE "TemplatePart" ALTER COLUMN "templateId" DROP NOT NULL;
ALTER TABLE "TemplateServicePart" ALTER COLUMN "templateId" DROP NOT NULL;

-- 2. An item always has an owner, its kind or its schedule template: deleting a schedule template no kind uses, while
-- it still has items, fails instead of leaving them attached to nothing (its key is SET NULL on delete).
ALTER TABLE "TemplatePart" ADD CONSTRAINT "TemplatePart_owner_check"
  CHECK ("templateId" IS NOT NULL OR "scheduleTemplateId" IS NOT NULL);
ALTER TABLE "TemplateServicePart" ADD CONSTRAINT "TemplateServicePart_owner_check"
  CHECK ("templateId" IS NOT NULL OR "scheduleTemplateId" IS NOT NULL);
