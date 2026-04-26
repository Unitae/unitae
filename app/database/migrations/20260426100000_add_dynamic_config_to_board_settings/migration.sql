-- Add dynamicConfig JSON column for flexible per-type configuration
ALTER TABLE "BoardDynamicDocumentSettings" ADD COLUMN "dynamicConfig" JSONB;

-- Remove the unique constraint on (congregationId, dynamicType, dynamicRef)
-- to allow multiple programme documents with different configurations
ALTER TABLE "BoardDynamicDocumentSettings" DROP CONSTRAINT IF EXISTS "BoardDynamicDocumentSettings_congregationId_dynamicType_dynami_key";
