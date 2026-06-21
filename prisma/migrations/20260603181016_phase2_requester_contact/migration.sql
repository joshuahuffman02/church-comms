-- AlterTable
ALTER TABLE "Request" ADD COLUMN "requesterName" TEXT;
ALTER TABLE "Request" ADD COLUMN "requesterEmail" TEXT;
ALTER TABLE "Request" ADD COLUMN "statusToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Request_statusToken_key" ON "Request"("statusToken");
