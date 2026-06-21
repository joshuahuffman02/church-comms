-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "roles" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Ministry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#c7b9ff'
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "defaultPublishOffsetDays" INTEGER NOT NULL,
    "productionLeadDays" INTEGER NOT NULL DEFAULT 7,
    "lockLeadDays" INTEGER,
    "cadence" JSONB,
    "capacity" INTEGER,
    "frequencyCap" INTEGER,
    "contentSpec" JSONB,
    "tierEligibility" JSONB NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#93c5fd',
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ministryId" TEXT,
    "requesterId" TEXT,
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
    CONSTRAINT "Request_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filename" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Asset_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "instanceDate" DATETIME,
    "windowStart" DATETIME,
    "windowEnd" DATETIME,
    "productionDueAt" DATETIME,
    "phase" TEXT,
    "status" TEXT NOT NULL DEFAULT 'to_design',
    "skippedReason" TEXT,
    "assetLink" TEXT,
    "notes" TEXT,
    CONSTRAINT "Deliverable_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Deliverable_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Touch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "purposeLabel" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    CONSTRAINT "Touch_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Touch_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "reachThresholdPct" INTEGER NOT NULL DEFAULT 50,
    "promoRatioCap" REAL NOT NULL DEFAULT 0.2,
    "stageCap" INTEGER NOT NULL DEFAULT 3,
    "loopCap" INTEGER NOT NULL DEFAULT 10,
    "defaultProductionLeadDays" INTEGER NOT NULL DEFAULT 7,
    "reviewCadence" JSONB NOT NULL DEFAULT [1,4],
    "sprintQuota" INTEGER NOT NULL DEFAULT 4,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "palette" JSONB
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_key_key" ON "Channel"("key");
