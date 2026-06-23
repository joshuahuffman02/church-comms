-- One-way calendar import inbox. Cron/manual checks discover candidate events,
-- but staff still choose Accept or Ignore before anything becomes a Request.
CREATE TABLE "CalendarImportCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "location" TEXT,
    "description" TEXT,
    "operationalNoise" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "recommendation" TEXT NOT NULL DEFAULT 'review',
    "recommendationReason" TEXT,
    "firstSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "CalendarImportCandidate_source_key_key" ON "CalendarImportCandidate"("source", "key");
CREATE INDEX "CalendarImportCandidate_source_status_dateKey_idx" ON "CalendarImportCandidate"("source", "status", "dateKey");
CREATE INDEX "CalendarImportCandidate_status_updatedAt_idx" ON "CalendarImportCandidate"("status", "updatedAt");
