ALTER TABLE "Touch" ADD COLUMN "removedAt" DATETIME;

CREATE UNIQUE INDEX "VideoTop3Item_sunday_sortOrder_key"
ON "VideoTop3Item"("sunday", "sortOrder");

CREATE UNIQUE INDEX "VideoTop3Item_sunday_requestId_key"
ON "VideoTop3Item"("sunday", "requestId");
