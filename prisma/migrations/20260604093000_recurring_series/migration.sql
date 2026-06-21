-- RecurringSeries: a standing item (e.g. "Missionary of the Month", "Tuesday
-- Talks") defined ONCE as a template + cadence. Its occurrences are normal
-- Request rows linked back via Request.seriesId, so they flow through the
-- existing scheduling / boards / outputs unchanged.

-- CreateTable
CREATE TABLE "RecurringSeries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ministryId" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 2,
    "whoIsItFor" TEXT NOT NULL DEFAULT 'whole_church',
    "nextStepText" TEXT,
    "location" TEXT,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "startDate" DATETIME NOT NULL,
    "untilDate" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringSeries_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables: SQLite adds the Request.seriesId FK column via a table
-- rebuild (data-preserving INSERT...SELECT). Approval is rebuilt alongside for
-- FK-dependency ordering; its data is copied verbatim.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Approval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "ruleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approverId" TEXT,
    "note" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Approval_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Approval_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ApprovalRule" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Approval" ("approverId", "createdAt", "decidedAt", "id", "note", "requestId", "ruleId", "status") SELECT "approverId", "createdAt", "decidedAt", "id", "note", "requestId", "ruleId", "status" FROM "Approval";
DROP TABLE "Approval";
ALTER TABLE "new_Approval" RENAME TO "Approval";
CREATE TABLE "new_Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pcoEventId" TEXT,
    "pcoApprovalStatus" TEXT,
    "pcoChurchCenterUrl" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ministryId" TEXT,
    "requesterName" TEXT,
    "requesterEmail" TEXT,
    "statusToken" TEXT,
    "requesterId" TEXT,
    "seriesId" TEXT,
    "whoIsItFor" TEXT NOT NULL DEFAULT 'whole_church',
    "audienceReachPct" INTEGER,
    "tier" INTEGER NOT NULL DEFAULT 2,
    "eventStart" DATETIME NOT NULL,
    "eventEnd" DATETIME,
    "location" TEXT,
    "needsRegistration" BOOLEAN NOT NULL DEFAULT false,
    "registrationUrl" TEXT,
    "cost" TEXT,
    "capacity" INTEGER,
    "registrationClosesAt" DATETIME,
    "roomBooked" TEXT,
    "nextStepText" TEXT,
    "nextStepUrl" TEXT,
    "successMetric" TEXT,
    "notes" TEXT,
    "sensitiveFlag" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "ownerId" TEXT,
    "overrideReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Request_ministryId_fkey" FOREIGN KEY ("ministryId") REFERENCES "Ministry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "RecurringSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Request_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Request" ("audienceReachPct", "capacity", "cost", "createdAt", "description", "eventEnd", "eventStart", "id", "location", "ministryId", "needsRegistration", "nextStepText", "nextStepUrl", "notes", "overrideReason", "ownerId", "pcoApprovalStatus", "pcoChurchCenterUrl", "pcoEventId", "registrationClosesAt", "registrationUrl", "requesterEmail", "requesterId", "requesterName", "roomBooked", "sensitiveFlag", "status", "statusToken", "successMetric", "tier", "title", "updatedAt", "whoIsItFor") SELECT "audienceReachPct", "capacity", "cost", "createdAt", "description", "eventEnd", "eventStart", "id", "location", "ministryId", "needsRegistration", "nextStepText", "nextStepUrl", "notes", "overrideReason", "ownerId", "pcoApprovalStatus", "pcoChurchCenterUrl", "pcoEventId", "registrationClosesAt", "registrationUrl", "requesterEmail", "requesterId", "requesterName", "roomBooked", "sensitiveFlag", "status", "statusToken", "successMetric", "tier", "title", "updatedAt", "whoIsItFor" FROM "Request";
DROP TABLE "Request";
ALTER TABLE "new_Request" RENAME TO "Request";
CREATE UNIQUE INDEX "Request_pcoEventId_key" ON "Request"("pcoEventId");
CREATE UNIQUE INDEX "Request_statusToken_key" ON "Request"("statusToken");
CREATE INDEX "Request_seriesId_idx" ON "Request"("seriesId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
