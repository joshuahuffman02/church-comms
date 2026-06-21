-- EventUpdate: a dated phase in an event's "Message Arc". Each row is one
-- message moment for a Request (Save-the-date / Registration open / Last call /
-- Day-of / custom), taking effect on `scheduledFor` (church-local midnight) and
-- optionally carrying general copy (`body`) plus per-channel overrides
-- (`channelCopy` JSON: { [channelKey]: { content?, assetLink? } }).
-- FK cascades on the parent Request delete. Index on (requestId, scheduledFor)
-- backs the per-event timeline ordering / active-phase lookups.

-- CreateTable
CREATE TABLE "EventUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT,
    "body" TEXT,
    "channelCopy" JSONB,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventUpdate_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "EventUpdate_requestId_scheduledFor_idx" ON "EventUpdate"("requestId", "scheduledFor");
