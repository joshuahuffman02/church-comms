-- PcoResource: a READ-ONLY mirror of a Planning Center Calendar "Resource" — a
-- bookable Room or piece of equipment (Resource). We pull these from PCO and
-- never write back. `kind` is "Room" | "Resource"; the Rooms UI filters to
-- "Room". A resource that disappears from PCO is marked active = 0 rather than
-- deleted, so its historical bookings survive. `pcoResourceId` is unique.
--
-- PcoResourceBooking: one FUTURE booking of a PcoResource (a room reserved for
-- an event occurrence), mirrored read-only from PCO resource_bookings. We keep
-- only future bookings and prune stale ones each sync. `eventInstanceId`
-- matches our Request.pcoEventId when the event has been imported, letting the
-- Rooms UI cross-link a booking to its request. FK cascades on the parent
-- PcoResource delete. Index on (resourceId, startsAt) backs the per-room
-- upcoming-bookings timeline ordering.

-- CreateTable
CREATE TABLE "PcoResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pcoResourceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "homeLocation" TEXT,
    "quantity" INTEGER,
    "imageUrl" TEXT,
    "updatedAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PcoResourceBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pcoBookingId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "endsAt" DATETIME,
    "eventInstanceId" TEXT,
    "eventTitle" TEXT,
    "churchCenterUrl" TEXT,
    "approvalStatus" TEXT,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PcoResourceBooking_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "PcoResource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PcoResource_pcoResourceId_key" ON "PcoResource"("pcoResourceId");

-- CreateIndex
CREATE UNIQUE INDEX "PcoResourceBooking_pcoBookingId_key" ON "PcoResourceBooking"("pcoBookingId");

-- CreateIndex
CREATE INDEX "PcoResourceBooking_resourceId_startsAt_idx" ON "PcoResourceBooking"("resourceId", "startsAt");
