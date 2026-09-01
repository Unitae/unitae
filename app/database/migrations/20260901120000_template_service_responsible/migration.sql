-- A template can name a second responsible, for its service parts only.
--
-- The sound/stage/reception/cleaning rota and the spiritual programme are
-- filled in by different brothers, so delegating one used to mean delegating
-- both. Rather than a second table that would duplicate the RLS policy, the
-- archive entity and every resolver, TemplateResponsible gains a `scope` and
-- holds at most one row per (template, scope).
--
-- Existing rows are the whole-event delegation, which is exactly what
-- 'programme' means, so the DEFAULT backfills them correctly and nothing is
-- dropped this time.
--
-- RLS is intentionally untouched: the tenant_isolation policy keys off
-- "congregationId" alone and is already in the CASE/NULLIF form required by
-- docs/development/row-level-security.md, so a new column has no effect on it.

ALTER TABLE "TemplateResponsible" ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'programme';

-- Same belt-and-suspenders as the seat-kind check: the column is a closed
-- enumeration the app reads back into a union type, and a typo written by a
-- future importer must fail loudly rather than become an unmatched scope that
-- silently grants nobody anything.
ALTER TABLE "TemplateResponsible"
  ADD CONSTRAINT "TemplateResponsible_scope_check"
  CHECK ("scope" IN ('programme', 'service'));

-- One responsible per scope, not one per template.
DROP INDEX IF EXISTS "TemplateResponsible_templateId_congregationId_key";
CREATE UNIQUE INDEX "TemplateResponsible_templateId_scope_congregationId_key"
  ON "TemplateResponsible"("templateId", "scope", "congregationId");
