-- AlterTable: track the source Planning Center event so re-import is idempotent.
ALTER TABLE "Request" ADD COLUMN "pcoEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Request_pcoEventId_key" ON "Request"("pcoEventId");
