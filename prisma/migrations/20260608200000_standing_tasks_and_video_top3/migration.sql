-- CreateTable
CREATE TABLE "StandingTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "area" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "StandingTaskCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StandingTaskCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "StandingTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VideoTop3Item" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sunday" DATETIME NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requestId" TEXT,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VideoTop3Item_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "StandingTaskCompletion_taskId_weekStart_key" ON "StandingTaskCompletion"("taskId", "weekStart");

-- CreateIndex
CREATE INDEX "VideoTop3Item_sunday_idx" ON "VideoTop3Item"("sunday");
