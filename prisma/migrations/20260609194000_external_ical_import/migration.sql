-- Local iCal import preview state. This does not replace Planning Center; it
-- lets staff reconcile a temporary ICS export into Request rows and hide rows
-- they do not want to import.

ALTER TABLE "Request" ADD COLUMN "externalCalendarSource" TEXT;
ALTER TABLE "Request" ADD COLUMN "externalCalendarKey" TEXT;

CREATE TABLE "ExternalCalendarIgnore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "Request_externalCalendarKey_key" ON "Request"("externalCalendarKey");
CREATE UNIQUE INDEX "ExternalCalendarIgnore_source_key_key" ON "ExternalCalendarIgnore"("source", "key");
CREATE INDEX "ExternalCalendarIgnore_source_dateKey_idx" ON "ExternalCalendarIgnore"("source", "dateKey");
