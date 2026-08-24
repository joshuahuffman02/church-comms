-- Planning Center just-in-time identities remain local to the church's SQLite
-- database. Nullable unique ids preserve all existing password users.
ALTER TABLE "User" ADD COLUMN "pcoUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "pcoOrganizationId" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" DATETIME;

-- Keep requester-provided context separate from internal production notes.
ALTER TABLE "Request" ADD COLUMN "requesterNotes" TEXT;

CREATE UNIQUE INDEX "User_pcoUserId_key" ON "User"("pcoUserId");
CREATE INDEX "User_pcoOrganizationId_idx" ON "User"("pcoOrganizationId");
CREATE INDEX "Request_requesterId_eventStart_idx" ON "Request"("requesterId", "eventStart");
