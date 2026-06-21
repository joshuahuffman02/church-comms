-- AlterTable: persist Planning Center logistics carried over with imported
-- approved events — the event-level approval status and the Church Center URL.
ALTER TABLE "Request" ADD COLUMN "pcoApprovalStatus" TEXT;
ALTER TABLE "Request" ADD COLUMN "pcoChurchCenterUrl" TEXT;
