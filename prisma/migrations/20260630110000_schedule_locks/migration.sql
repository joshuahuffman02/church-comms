-- Durable schedule locks for staff-pinned request/channel/date placements.
CREATE TABLE "ScheduleLock" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduleLock_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleLock_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScheduleLock_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ScheduleLock_requestId_channelId_scheduledAt_key" ON "ScheduleLock"("requestId", "channelId", "scheduledAt");
CREATE INDEX "ScheduleLock_channelId_scheduledAt_idx" ON "ScheduleLock"("channelId", "scheduledAt");
CREATE INDEX "ScheduleLock_requestId_idx" ON "ScheduleLock"("requestId");
CREATE INDEX "ScheduleLock_createdById_idx" ON "ScheduleLock"("createdById");
