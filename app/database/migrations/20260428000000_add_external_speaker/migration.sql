ALTER TABLE "ProgrammeTemplatePart"   DROP   COLUMN "isVariable";
ALTER TABLE "ProgrammeTemplatePart"   ADD    COLUMN "allowExternalSpeaker" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProgrammePartAssignment" ADD    COLUMN "allowExternalSpeaker" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ProgrammePartAssignment" ADD    COLUMN "externalSpeakerName"  TEXT;
