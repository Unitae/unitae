-- An event's author now only says who prepared it (Event.origin says who created it): deleting the account clears it
-- instead of being refused. No data changes; account deletion already cleared it by hand (releaseAccountEvents).
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_createdById_fkey";
ALTER TABLE "Event" ADD CONSTRAINT "Event_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "UserAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
