ALTER TABLE "CalendarImportCandidate" ADD COLUMN "matchRequestId" TEXT;
ALTER TABLE "CalendarImportCandidate" ADD COLUMN "matchTitle" TEXT;
ALTER TABLE "CalendarImportCandidate" ADD COLUMN "matchDate" DATETIME;
ALTER TABLE "CalendarImportCandidate" ADD COLUMN "matchReason" TEXT;
ALTER TABLE "CalendarImportCandidate" ADD COLUMN "matchConfidence" TEXT;
ALTER TABLE "CalendarImportCandidate" ADD COLUMN "matchScore" REAL;

CREATE INDEX "CalendarImportCandidate_matchRequestId_idx" ON "CalendarImportCandidate"("matchRequestId");
